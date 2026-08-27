# ADR-002:小说工坊(Workshop)目标架构

- 状态:已实施(v1 全量落地,取代 ADR-001 的三文档架构;旧 `features/writer` 保留只读共存,择期删除)
- 日期:2026-08-27
- 设计蓝图:调研与总体设计见会话 artifact《小说工坊目标架构》;本文记录已落地的形态。

## 决策

以"讨论式全自动小说工坊"为目标形态重建 writer:**人通过讨论下达意图并评审产出,AI 编辑部完成从设定到章节正文的全部生产,每一步产出都是可 diff、可应用、可回溯的提案。**

三个关键选型(相对 ADR-001 的翻案):

1. **git 化事实源**:项目文件夹即嵌入式 git 仓库(isomorphic-git,纯 JS,对用户隐藏)。正史 = `refs/heads/main`,提案 = `refs/workshop/proposals/<id>` 上以正史某 commit 为 parent 的 commit,应用 = fast-forward,回滚 = 前进式恢复目标树(历史只增不删)。手写 journal 只剩工作区物化一处;整书快照与"正文+设定同步回滚"是 commit 的默认性质。
2. **实体粒度文件库**:一实体一文件(`codex/`、`outline/`、`ledger/` 三域十一集合),公共信封携带溯源(`origin: {kind, role?, proposalId?, discussionId?}`)。模型输出整实体文件,无补丁 DSL。
3. **changeset 提案**:一次提案可同时触及正文与任意实体,单次评审原子入正史。AI 绝不直写正史;经 IPC 的 canon 提交强制 human 来源。

## 项目布局

```
<root>/                          # 嵌入式 git 仓库
  project.json                   # 项目卡(书名/premise/卷序/散章序)
  manuscript/<chapterId>.md
  codex/{characters,lore,rules}/<id>.json
  outline/{volumes,arcs,chapters}/<id>.json
  ledger/{facts,foreshadowing,summaries,states,events}/<id>.json
  discussions/main.jsonl         # 讨论线程(不入 commit,回滚不吞聊天)
  exports/                       # 导出产物(不入 commit)
```

## 模块地图(src/main/features/workshop/)

| 模块 | 职责 |
| --- | --- |
| `WorkshopKernel` | git 内核:canon 三入口(提交/提案应用/前进式回滚)、直写对象库提交、ref 命名空间提案生命周期、journal 崩溃恢复 |
| `WorkshopService` | 项目粒度 KeyedMutex 串行化 + IPC 唯一入口 + 守卫自动触发 + 导出 |
| `workshopAgentOutput` | 四角色输出契约(zod)与 changeset 映射(溯源信封/去重/删除优先) |
| `workshopPrompts` / `workshopContext` | 角色 prompt 与上下文编译(预算/截断/词法检索召回) |
| `workshopGenerationJobHandler` | 策划/写手/守卫单角色生成任务(提案 id = job id 幂等) |
| `workshopDiscussionJobHandler` | 讨论回合:reply + 可选 action 落提案,双向溯源 |
| `workshopChapterCycleJobHandler` | 单章生产循环:写手→守卫→机检→审校→有界修订(≤2 轮)→原子提案 |
| `workshopVolumeRunJobHandler` | 整卷流水线:auto 关卡逐章推进,质量关未过停跑;maxChapters 成本护栏 |
| `workshopInvariants` | 不变量引擎:十类确定性规则跑在实体图快照上,稳定 finding key |
| `workshopExport` | 确定性组稿 + markdown/txt/epub(手工最小 EPUB3);docx 复用 ExportService |
| `structuredOutput`(src/main/ai/) | AiService.generateStructured:提示词驱动 zod 校验 + 有界修复重试,provider 无关 |

## 模型策略

生成模型按候选链解析(`workshopModelPolicy`),对每次调用生效:

```
显式指定(fail-closed,不可用即报错)
  → 角色覆盖 feature.workshop.role_model_ids[role]   # planner/writer/reviewer/guardian/discussion
  → 工坊默认 feature.workshop.default_model_id
  → 快捷助手模型 → 聊天默认模型 → 内置默认
```

配置入口在工坊侧栏的模型设置对话框;成章循环与整卷流水线在入队时把三个内部角色(写手/守卫/审校)各自解析好的模型写进任务载荷,循环内按角色路由。

## 不变量

1. AI 产出永不直写正史;一切进入正史的内容都经由提案应用或人工 canon 提交。
2. 正史永远处于某个完整 commit;工作区是 HEAD 的物化镜像,journal 保证崩溃后收敛。
3. 提案基于生成时的正史 HEAD;正史前进后提案自动 stale,应用被拒绝(重新生成,不做三方合并)。
4. 实体写入必须通过集合 zod schema;changeset 内同一文件至多出现一次,整体原子。
5. 任何 AI 写入的实体带完整溯源链:讨论 → 提案 → commit 三级双向可导航。
6. 生成、讨论、检查共享同一实体快照视图(`collectWorkshopContext`)。
7. 质量关(机检 + 审校)未过的产物仍会落为提案,遗留问题标注在 rationale 交人裁决,绝不静默丢弃。

## 已知边界与后续项

- 检索召回为词法 v1(摘要/章计划词重合);向量检索可复用 `features/knowledge` 的 sqlite-vec 管线替换同一接口。
- 卷外散章的全序取 `project.json.looseChapterIds`,未登记的散章排在卷后;章节创建尚不自动登记散章序。
- 实体编辑为 schema 校验的 JSON 编辑器;字段级表单沿用 `documentFormFields` 原语按集合渐进补齐。
- 讨论线程单线程(`main`);多线程与滚动摘要待需求驱动。
- 旧 `features/writer`(ADR-001)未删除,`/app/writer` 仍可访问;主侧栏入口已指向 `/app/workshop`。删除旧实现是独立任务。
