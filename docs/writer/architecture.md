---
description: ADR for portable Writer projects, proposal-gated canon updates, context priority, and JobManager recovery
sources:
  - src/shared/types/writer.ts
  - src/shared/utils/writerLore.ts
  - src/main/features/writer/writerContinuityReview.ts
  - src/main/features/writer/WriterProjectRepository.ts
  - src/main/features/writer/WriterStudioService.ts
  - src/shared/ipc/schemas/writer.ts
  - src/renderer/features/writer
---

# Writer Studio 架构决策

## ADR 状态

| 项 | 值 |
|---|---|
| 编号 | ADR-001 |
| 状态 | 首版采纳 |
| 日期 | 2026-08-25 |
| 决策范围 | 本地专业小说写作、AI proposal、上下文装配、后台生成与故障恢复 |
| 基座 | Cherry Studio 31750284d6854ced897417d342305985a445f5c1 |

## 决策

首版采用 portable project folder 加 Cherry JobManager。

作品目录保存可移植的创作事实，包括 manifest、story bible、outline、continuity、manuscript、proposals 和 history。确定性连续性报告与作者豁免也保存在同一目录的独立 sidecar，能随作品迁移，但不混入 continuity 正史。Cherry 主 SQLite 只通过现有 JobManager 保存可恢复运行状态。Job row 保存任务输入与最终 proposalId，不保存完整 proposal 或 ContextPacket，不能替代正文、提案或设定。

AI 生成永远先形成 proposal。用户看到来源、proposal 预览和行级正文 diff 后，明确执行应用操作。只有成功应用后产生的新 revision 才能更新正史。

## 当前实现状态

本 ADR 同时记录已经落地的约束和仍需硬化的部分，避免把目标设计写成运行真值。

| 能力 | 2026-08-25 现场状态 |
|---|---|
| portable project folder | 已落地，project、story bible、outline、continuity、continuity review、manuscript、proposals 和 history 都在作品目录 |
| revision gate | 已落地，手工保存检查正文 SHA-256 revision；生成与 proposal apply 还绑定三份结构资料的语义 revision |
| AI 只写 proposal | 已落地，writer.generate-proposal 不改正史 |
| apply 白名单 | 已落地，draft 和 rewrite 只能 replace，continue 只能 append，其余四类 proposal 不能写正文 |
| 结构资料维护 | 已落地，story bible、outline、continuity 有语义 revision、严格 JSON editor 和 stale 写入门禁 |
| history | 已落地，普通保存按每章 30 秒节流并最多保留 100 份；支持 list、read、restore，恢复前反向快照当前正文 |
| ContextPacket | 已落地，模型窗口感知预算、优先级、逐来源截断、当前章保留区和实际来源随 proposal 保存 |
| JobManager | 已落地，按项目串行、启动前复核 baseRevision、可取消、30 分钟超时；完成 output 仅保存 proposalId |
| proposal diff | 已落地，按最终 replace 或 append 目标计算行级 added、removed 与 unchanged |
| 跨文件 apply 恢复 | 已落地，proposal 的 applying、targetRevision 状态承担 journal，并覆盖 base 与 target 两个恢复窗口 |
| job 与 proposal 幂等关联 | 已落地，proposal id 固定为 JobManager job id，恢复时先校验身份并复用已落盘结果 |
| 模型预检 | 已落地，UI 显式提交当前展示的 Quick 模型，stale、external CLI、disabled 与非聊天模型 fail-closed；没有可展示模型时才使用 managed default |
| 资源上限 | 已落地，JSON、proposal、单章、总稿与 schema 数组均有限制 |
| 磁盘 artifact | 已落地，proposal 支持 list/read，history 支持 list/read/restore；两者可在 Job DB GC 或作品搬移后重新发现 |
| renderer 恢复 | 已落地，有界 recovery drafts 与 active job ids 保存在 persist cache，重开后可恢复草稿和任务观察 |
| 长篇保存热路径 | 已落地，autosave 只加载四份小 JSON 与目标章；完整打开以 stat 校验全稿 inventory，不读取和哈希全稿 |
| 外发提示 | 已落地，生成按钮前明确提示本次选入的作品资料会发给所选模型服务商 |
| Lorebook v1 | 已落地，story bible 保存确定性 lore 条目，UI 可编辑并预览当前激活数，ContextPacket 保存 included、dropped 与 truncated receipt |
| typed continuity review | shared schema、主进程检查器、portable report、coverage 与 waiver、五条 typed IPC 和 Renderer 审阅面已落地 |

## 设计背景

Cherry 已有稳定的模型、IPC、后台任务、错误和渲染基础。写作领域还需要另一组长期不变量。正文必须能离开当前 Cherry 安装独立备份，几百章作品需要清楚的上下文来源，耗时生成要能取消和恢复，旧 proposal 不能覆盖作者刚改过的正文。

调研给出的共同结论很清楚。层级规划适合管理长篇，近期原文与远期摘要要分层，生成与写入要分开，审核必须绑定精确正文版本。Writer 以 Cherry 自有类型和服务实现这些行为，不引入参考项目代码。

## 为什么首期不建 Cherry 作品表

Cherry 主数据库的 migration chain 已经进入真实用户环境。migrations/README.md 明确要求已发布迁移只能追加，migrations/sqlite-drizzle 由 Drizzle 生成。把 WriterProject、Chapter、Outline、Fact、Proposal 和 Revision 一次塞进主 SQLite 会产生以下成本。

- 表和索引会长期占用上游频繁修改的数据热点。
- 每次同步上游都要处理 schema、migration snapshot、DataApi 和备份恢复的交叉冲突。
- 作品依赖当前 Cherry 数据目录，作者无法复制一个文件夹就带走正文、设定和历史。
- 文件正文与数据库记录容易形成双事实源，恢复时很难判断哪边更新。
- 首版领域模型仍会快速变化，过早固化关系表会制造高成本迁移。

JobManager 使用主 SQLite 没有破坏这项决策。它只保存运行控制面和 proposalId。作品目录搬到另一台设备后，未完成 job 不会随目录迁移，已落盘的 proposal、history 和正史仍然完整。proposal library 与 history dialog 直接读取磁盘 artifact，不依赖原设备的 Job DB。

## 作品目录

首版目录约定如下。project.json 承担 manifest 角色，避免再维护第二份项目清单。

~~~text
<project-root>/
├── manuscript/
│   ├── 0001-<chapter-id>.md
│   └── 0002-<chapter-id>.md
└── .cherry-writer/
    ├── project.json
    ├── story-bible.json      # 含 characters、rules、styleGuide、loreEntries
    ├── outline.json
    ├── continuity.json
    ├── continuity-review.json # 派生 report、coverage 与作者 waiver
    ├── proposals/
    │   └── <proposal-id>.json
    └── history/
        └── <chapter-id>/
            └── <timestamp>-<revision-prefix>-<snapshot-id>.md
~~~

目录中每个 JSON 文档都带 schemaVersion，并经过 shared zod schema 严格解析。未知字段、未知版本、越界长度和非法文件名默认拒绝。读取失败时保持原文件，不做猜测性修复。

Lorebook v1 没有增加结构资料 JSON，也没有提升项目 schemaVersion。`loreEntries` 是 `story-bible.json` 中的可选兼容字段，shared schema 用 `default([])` 解析旧项目。2026-08-24 以前创建、仍为 schemaVersion 1 且没有该字段的 story bible 会得到空 lorebook；下一次合法保存才把规范化字段写回。语义 revision 基于解析后的完整 Story Bible，因此 lore 修改和普通设定修改共用同一 expectedRevision 门禁。

连续性审查同样保持 schemaVersion 1 向后兼容。`timelineEvents`、`characterStates`、`fact.usedInChapterIds`、`foreshadowing.dueChapterId`、chapter plan 的 `requirements`，以及 chapter summary 的 `assessmentRevision` 和 `requirementAssessments` 都是可选字段；timeline event 与 character state 缺少 `timelineId` 时默认进入 `main`。旧 `continuity.json` 与 `outline.json` 不需要迁移。`continuity-review.json` 是第五份 portable JSON，`coverageDeclarations` 与 `waivers` 缺失时默认空数组。新项目创建时会写入空 sidecar，旧项目缺失该文件时以 `missing` revision 打开，首次运行审查时再原子创建。

manuscript 是作者可直接阅读和编辑的 Markdown。project.json 记录章节顺序、文件名和当前 revision。history 保存被替换的精确版本，proposals 保存模型产物、baseRevision 和生成时的 ContextPacket。history 只用于回滚，不自动参与模型上下文。

atomicWriteFile 会在同目录创建 0600 临时文件，sync 后 rename。项目 JSON 和 proposal 会先序列化并检查 UTF-8 字节数，超限时拒绝，旧文件不会被替换。章节的最终 replace 或 append 内容也会在 history、journal 和正文写入前检查字符数与 UTF-8 字节数。通过检查后，proposal 才先原子进入 applying 并保存 targetRevision，作为正文、manifest 与 proposal 状态之间的恢复 journal。

## 领域实体

首版公开契约集中在 src/shared/types/writer.ts。

| 实体 | 责任 | 事实位置 |
|---|---|---|
| WriterProject | 已打开项目的聚合视图，包含 rootPath 与四份结构化文档 | 运行时视图 |
| WriterProjectManifest | 项目标识、书名、目标字数、活动章节、章节顺序与 revision | .cherry-writer/project.json |
| WriterStoryBible | 作者目标、硬规则、主题、人物、世界规则、风格约束和 loreEntries | .cherry-writer/story-bible.json |
| WriterLoreEntry | 一条可确定性激活的 lore，包含普通 key 列表、启用状态、常驻开关、匹配规则与 order | WriterStoryBible.loreEntries |
| WriterOutline | 全书摘要、故事弧和章节计划 | .cherry-writer/outline.json |
| WriterContinuityLedger | 连续性事实、伏笔、章节摘要、时间线事件与人物状态 | .cherry-writer/continuity.json |
| WriterTimelineEvent | 章节内有序的故事时间点与证据 | WriterContinuityLedger.timelineEvents |
| WriterCharacterState | 人物在章节序列点的位置、生死状态、转变解释与证据 | WriterContinuityLedger.characterStates |
| WriterContinuityAuditReport | 绑定结构资料与 manifest 指纹的六类确定性检查结果 | .cherry-writer/continuity-review.json |
| WriterContinuityCoverageDeclaration | 作者确认某类 typed 输入已整理到目标章时保存的 rule basis fingerprint | .cherry-writer/continuity-review.json |
| WriterContinuityFinding | 带 stable key、evidence-sensitive fingerprint、严重度、证据与建议的一条发现 | WriterContinuityAuditReport.findings |
| WriterContinuityWaiver | 作者对当前 finding fingerprint 的有意安排说明 | .cherry-writer/continuity-review.json |
| WriterChapterDocument | 章节元数据与正文 | project.json 加 manuscript |
| WriterContextPacket | 一次生成实际使用的来源、优先级、预算和截断结果 | proposal 内嵌 |
| WriterLoreActivationReceipt | lore 的 always 或 keyword 激活原因、命中 key、included 或 dropped 状态与截断结果 | ContextPacket.loreActivations |
| WriterProposal | 模型建议、目标章节、baseRevision、模型、应用状态和 ContextPacket | .cherry-writer/proposals |
| WriterGenerationOutput | job handler 返回的 proposalId | JobManager 完成结果；完整 proposal 只在作品目录 |

story bible、outline 与 continuity 已可在 JSON editor 中人工维护。AI 生成这些结构资料的 proposal 与结构化 apply 仍未实现，后续接入时要服从 documentRevision 门禁。

## 不变量

### 作品目录是唯一创作事实源

正文、设定、大纲、连续性、proposal 与 history 的规范版本只在作品目录。JobManager payload 保存 rootPath、chapterId、baseRevision、三份 documentRevisions、operation、instruction、模型标识和预算，完成 output 只保存 proposalId。renderer persist cache 还保存有界的未保存正文恢复稿与 active job id；它们是可丢的恢复副本，不属于 canonical，也不进入 Preference 或 Cherry 主作品表。

### AI 永不直写正史

writer.generate-proposal handler 只能读取项目、组装 ContextPacket、调用模型并写 proposal。它不能修改 manuscript、project.json、story-bible.json、outline.json 或 continuity.json。

renderer 也不能把模型输出直接写文件。renderer 只能通过专用 IPC 请求主进程执行 proposal apply。

### 只有成功应用的 revision 才更新正史

应用 proposal 时按下面顺序执行。

1. 获取项目级写锁。
2. 重新读取三份结构资料和目标章节，计算当前 revisions。
3. 同时校验 proposal ContextPacket 中的 documentRevisions、expectedRevision、proposal.baseRevision 和当前 revisions。
4. 确定最终 replace 或 append 内容，检查单章字符数和 UTF-8 字节上限。
5. 把旧正文强制保存到 history。
6. 写入临时正文并原子替换目标章节。
7. 重新计算 appliedRevision，再原子更新 manifest。
8. 最后把 proposal 标记为 applied，并记录 appliedAt、appliedMode 和 appliedRevision。

任一步失败都不能提前把 proposal 显示为 applied。完整打开先用 stat 校验全部章节 inventory，再只为 applying proposal 的目标章计算真实 revision。revision 等于 targetRevision 时收口 applied，仍等于 baseRevision 时回到 pending，其他 revision 保持 applying。普通章节读取与保存只计算目标章 hash；磁盘 manifest 中的旧 revision 不会在只读打开时改写，下一次合法保存会更新它。

### baseRevision 是强门禁

WriterRevision 是目标 Markdown 当前 UTF-8 文件字节的 SHA-256。手工保存携带 expectedRevision，proposal 携带生成开始时的 baseRevision，应用请求再次携带 expectedRevision。

三者有任何不一致都返回冲突，不能静默覆盖。Story Bible、outline 或 continuity 在生成后变化时，即使正文没变，旧 proposal 也不能应用。当前 UI 显示通用 apply 错误。重新比较、复制 proposal 和基于新 revision 再生成仍需补齐。

### 连续性审查不能伪造绿灯

确定性检查只读取作者维护或已接受的 typed 数据，不调用模型，也不从正文猜测事实。六类 coverage rule 与当前实现如下。

| coverage rule | 确定性输入与检查 |
|---|---|
| timeline | timelineEvents 在各自 timelineId 内按章节 order 与唯一 sequence 排序，检查 storyTime 回退；同 timeline、章节、sequence 的重复槽位由 schema 拒绝；同时检查伏笔 planted、due 与 resolved 的先后关系 |
| character_location | characterStates 在同一 timelineId、人物、章节与 sequence 出现多个规范化位置时报告冲突 |
| character_life | 同一 timelineId、人物、章节与 sequence 出现不同生死状态时报告冲突；dead 后重新 alive 且没有 transitionExplanation 时报告复活缺口 |
| foreshadowing_due | open 伏笔的 dueChapterId 早于目标章时报告逾期；status 与 resolvedChapterId 不一致也会报告结构错误 |
| future_information | fact.usedInChapterIds 早于同一 fact.sourceChapterId 时报告未来信息提前使用 |
| chapter_plan | 稳定 requirement id 与 requirementAssessment 对照；assessmentRevision 必须等于被评章节当前正文 revision，缺项、悬空引用或过期 assessment 不能充当已检查 |

章节、人物、requirement 等硬引用不存在时产生 non-exemptible error。伏笔时序或状态自相矛盾、plan assessment 过期也不能通过 waiver 掩盖。可以豁免的是作者明确接受的叙事安排，例如倒叙、同一时点的位置或生死冲突、已解释之外的复活提示、伏笔逾期、信息提前使用和计划偏离；服务端仍会再次检查 finding 当前存在、fingerprint 一致且 `exemptible=true`。

finding key 对 `ruleVersion + rule + typed subject` 的 canonical JSON 做 SHA-256，作为跨重新审查的稳定身份。fingerprint 在同一 identity 上加入 evidence basis 后再哈希。证据变化时 key 可以保持，旧 waiver 会显示为 stale exemption，不能继续抵消 finding。report 中已经消失但 sidecar 仍保存的 waiver 进入 orphanedWaivers；`unwaive` 可显式撤销，两类状态都不会被静默删除。

每类规则必须在 sidecar 的 `coverageDeclarations` 中声明人工已整理到哪个 `throughChapterId`，并保存该次 report 对应规则的 `basisFingerprint`。声明缺失时是 insufficient_data；落后于目标章、规则统计存在 staleItems，或 typed 输入变化后 basis fingerprint 不再相同时是 stale。只有 report 未过期、没有未豁免 finding、未截断，并且六类 coverage 全部 checked，聚合状态才是 clear。空数组、旧数据缺字段或 findings 达到条数和字节上限时只会得到 incomplete，不会得到 false green。审查输入超过 100,000 个 observation 时直接 fail closed；单条 evidence、entity 和 chapter 定位有界，裁剪会显式把 report 标为 truncated。

review 的 sourceFingerprint 绑定 targetChapterId、三份 documentRevisions 和章节 order、title、revision、updatedAt 构成的 manifest fingerprint。Service 会在 read、run 和 mutation 前真实读取目标章与含 requirement assessments 的章节，使用 Markdown 当前 hash 替换 manifest 缓存 revision；外部直接改正文也会让旧 report 显示 stale。`continuity-review.json` 自己有独立语义 revision，run、waive、unwaive 与 coverage.update 都在项目锁内执行 expectedRevision 门禁；它不加入 WriterProject.documentRevisions，也不改变正史 revision。

### 上下文来源可以解释

每个 ContextPacket 保存实际进入模型的 sources。每项包含 kind、label、priority、content 和 truncated。UI 至少能显示来源列表、预算使用和截断标记。

Lorebook 还要解释“命中了但为什么没进入”。每条已激活 lore 都生成 receipt。`activation` 区分 always 与 keyword，`matchedKeys` 保存实际命中的普通 key，`status` 区分 included 与 dropped，`truncated` 说明单来源或全局预算是否裁剪。dropped receipt 不含未激活条目，也不会把 lore 正文重复塞进 Job output。

模型 prompt 中不能混入无法追溯的聊天历史、隐藏全局记忆或旧 job 输出。外部检索将来进入 Writer 时还要增加 URI、retrievedAt、contentHash 和引用片段。

### 写入串行且受门禁约束

项目级写操作通过 KeyedMutex 串行，生成 job 还使用 rootPath hash 得到的项目队列，队列并发为 1。JSON schema 对字符串和数组设置字段上限，模型调用也受 JobManager 超时约束。

readValidatedJson 会在读取前检查文件大小，JSON 原子写入也会在替换旧文件前检查序列化字节数；单章读取受字节上限保护，单章最终写入同时受字符数与字节上限保护，全稿 inventory 另有总字节上限。job payload 携带 contextBudgetChars 与三份 documentRevisions，proposal id 固定为 ctx.jobId。恢复执行先读取同 id proposal，身份字段、结构资料 revisions 与 ContextPacket 预算一致时直接返回，避免再次调用模型。

## ContextPacket 优先级

未知模型窗口时使用 8,000 字符的保守预算。已知窗口按 75% 可用比例计算，再扣除 system、固定 JSON、输出和 instruction 估算，最终不超过 48,000 字符。数值越高的来源越先进入预算，同级来源按构造顺序加入。`draft`、`continue`、`rewrite`、`review`、`summarize` 在当前章非空时为当前章的完整序列化来源保留最多 2,000 个正文字符所需空间，保留量不超过总预算一半；极小预算连来源元数据都放不下时不伪造来源。高优先级约束仍先占用非保留区。

| 优先级 | 来源 | 规则 |
|---|---|---|
| 100 | author_goal、hard_rule、story_premise、genre、theme、world_rule、style_guide | 作者目标、硬规则与作品基础进入最高优先级，逐来源截断会写入 source.truncated |
| 90 | current_chapter、chapter_plan、story_arc | 当前正文上限 16,000，计划与单个弧上限 8,000；book summary 也按 story_arc 进入 |
| 80 | lore、character、foreshadowing、fact | 已激活 lore 先按 order 降序进入候选，单项上限 4,000；人物随后进入；伏笔和事实的来源章晚于当前章时过滤 |
| 70 | recent_summary、recent_manuscript | 摘要单项上限 4,000，最近三章原文单项上限 8,000；摘要先于原文加入 |
| 60 | related_history | schema 和常量已预留，当前 compileWriterContext 不加入 history |

候选先按单来源上限截断，再按 job payload 的 contextBudgetChars 截断。continue 保留当前正文尾部，近期原文保留头尾。当前章保留区防止长 premise 或 author constraints 把依赖正文的任务挤空。`usedChars` 等于模型实际接收的紧凑 source JSON 项长度之和，包含 order、priority、kind、label、truncated、content、对象框架和项间逗号；外层方括号属于固定 JSON 开销。prompt 与 compiler 共用同一序列化函数，所以任意数量的短规则都不能绕过预算。ContextPacket 记录 budgetChars、usedChars、packet.truncated 和每个 source.truncated。

Lorebook v1 的扫描文本也有独立边界。continue 只扫描当前章末尾最多 24,000 字符，其他操作扫描当前章头尾合计最多 24,000 字符；章计划最多 8,000，instruction 最多 8,000。Story Bible 最多 500 条 lore，每条最多 20 个普通 key，单 key 最多 200 字符。匹配前做 NFKC 规范化；默认不区分大小写。整词模式对拉丁等分词脚本使用 Unicode 字母、数字和下划线边界，对包含汉字、平假名、片假名或韩文的连续书写 key 使用子串匹配。多个 key 承担 aliases 作用。v1 没有 regex、递归、sticky、cooldown、概率或向量召回。

manifest 已保存 targetWordCount，当前 generation prompt 还没有把它拆成章节或段落预算。局部字数合同是采用 LongWriter 思想后的下一步，加入前需要扩展 chapter plan 或 generation input schema，并为预算总和与实际输出做测试。

## 工作流

### 创建与打开

创建项目时在用户选择的父目录下建立作品目录、四份 schemaVersion 1 文档和第一章。新 Story Bible 显式写入空的 `loreEntries`。每个文件写入临时路径、验证后再替换正式路径。

打开项目时主进程完成 realpath、目录边界、读前文件大小、schema、大小写折叠后的文件名唯一性和章节 id 唯一性。全稿 inventory 用 stat 核对文件存在、symlink 边界、单章和总字节上限，不读取或哈希整部 manuscript。读取具体章节时再检查字符上限并计算真实 revision；外部写入的超字符章节因此不能进入编辑或 history。applying recovery 只读取涉及的目标章。

### 人工写作

作者保存章节时携带 expectedRevision。主进程通过项目锁和 revision gate 写入，并在产生 history 前检查最终正文上限。800ms autosave 的热路径只加载四份小 JSON 与目标章，不在 Service 和 Repository 重复打开完整项目。普通保存每章 30 秒内最多新增一份快照，默认最多保留 100 份；proposal apply 无视节流并强制快照。保存成功返回新的 ChapterDocument，UI 用返回值更新本地状态。

story bible、outline 与 continuity 使用各自的语义 SHA-256 revision。Story Studio 默认以结构化表单编辑 story bible，覆盖故事罗盘、创作护栏、主题、风格、世界规则和人物卡；原始 JSON 保留为高级模式，outline 与 continuity 暂时仍使用 JSON。两种模式共享同一份 draft、shared schema 和 expectedRevision，保存中的文档锁定编辑，其他 tab 的新草稿不会被旧响应覆盖。

Lorebook Dialog 复用 story bible save route 和同一 documentRevision。它提供条目列表、内容、逐行 key aliases、enabled、alwaysActive、caseSensitive、matchWholeWords 与 order 编辑。保存前重新解析完整 `WriterStoryBibleSchema`，冲突时保留本地条目并提示作者。Memory Summary 显示 lore 总数，Copilot 用 shared matcher 延迟计算当前 active 数，避免 UI 与主进程采用两套规则。

未保存正文按项目与章节写入有界 renderer recovery cache。revision 相同的恢复稿重开为 dirty，revision 已变化的恢复稿进入 conflict，用户可以复制草稿或明确丢弃并重新载入。该缓存不替代项目目录中的正文。

### AI 生成

作者可以先运行 `writer.context.preview`。Renderer 先 flush 当前编辑器，再由主进程解析同一模型窗口预算，并通过 `writerProjectContext` 调用真实 context compiler。返回的 ContextPacket 显示来源正文、来源类型、预算、截断和 Lore 激活回执，不入队、不调用模型。operation、instruction 或模型变化后旧预览立即失效；真正生成会重新读取文件并编译，proposal 保存实际使用的 packet。

1. renderer 发送 rootPath、chapterId、operation、instruction 和模型选择。
2. renderer 显式提交当前展示的 Quick 或手选模型；只有本地没有可展示模型时才省略模型，由 WriterStudioService 解析 managed default。服务按 contextWindow 和 instruction 计算 contextBudgetChars，再构造 job payload 并入队。
3. JobManager 返回 JobSnapshot，renderer 持久化 active job id，并通过现有 job 观察能力展示进度和取消入口。
4. handler 重新打开项目，扫描有界正文、章计划和 instruction，按固定优先级构造包含 lore receipts 的 ContextPacket。
5. handler 通过 Cherry AiService 调用选定模型，不直接依赖 provider SDK。
6. 模型文本放入 WriterProposal，经内容长度和 schema 解析后原子写入 proposals。
7. job 完成并返回只含 proposalId 的 WriterGenerationOutput；renderer 随后从项目目录读取完整 proposal。

### 审阅与应用

UI 显示当前正文到最终 replace 或 append 目标的行级 diff、只读 proposal Markdown、实际 ContextPacket 来源标签和截断标记。Lore receipt 另列条目标题、included 或 dropped 和 truncated 状态。Proposal Library 从磁盘 list/read 历史提案，pending 提案按白名单接纳，applying 与 applied 提案只读。draft 与 rewrite 只有 replace，continue 只有 append，brainstorm、chapter_plan、review 和 summarize 没有正文写入按钮。用户不应用时正史不变，proposal 仍保持 pending。当前没有 reject 状态。

History Dialog 从磁盘 list/read 章节快照，先展示相对当前正文的 diff，再以 expectedRevision 恢复。恢复会先强制快照当前正文，形成可反向恢复的版本。continuity 不根据正文自动更新；作者可通过 Documents Dialog 手工维护台账。

### 确定性连续性审查

shared 与 main 已接通 `writer.continuity_review.read`、`run`、`waive`、`unwaive` 和 `coverage.update`。read 返回当前 sidecar revision、stale 状态、finding states、六类 coverage、orphaned waivers 和计数。run 在项目锁内重新打开项目、比较 expected review revision、编译 report，并保留已有 coverage 与 waivers。waive 只接受当前 key 与 fingerprint、非 stale report、非硬错误和非空理由；unwaive 用同一 revision gate 撤销。coverage.update 的 `covered=true` 只能基于当前 report 保存目标章和 rule basis fingerprint，`covered=false` 撤销该 rule 的 declaration；两者都受同一 expectedRevision 门禁。

Renderer 从 Memory Summary 懒加载 Continuity Review Dialog。Dialog 显示 not_run、stale、issues、incomplete、clear，六类 coverage 与 evaluated item 数量，支持按 finding 文本、严重度和状态筛选。作者可以写理由后 waive 或更新 stale exemption，也能撤销 active 或 orphaned waiver；coverage 可逐类标记到当前目标章或撤销。stale report 禁止新增 waiver 和标记 covered，所有 mutation 都携带当前 sidecar revision，过期响应不会覆盖最新 view。

这条检查器只能判断 typed 数据内部的可证明矛盾。人物动机、语义同义、文风漂移、正文是否真正完成计划，以及从自然语言提取新事实，仍属于 AI 语义审阅。此类输出必须携带 evidence 与生成时 documentRevisions，先保存为 proposal，再由作者接受；模型解析结果不能直接写 continuity 或把检查状态改成 clear。

## JobManager 职责

WriterStudioService 在 onInit 注册 writer.generate-proposal，renderer 不接触 JobRegistry。handler 使用 recovery=retry、按 rootPath hash 分项目队列、队列并发 1、maxAttempts=1、30 分钟 timeout，AiService 调用关闭内部 retry。

当前 payload 保存下面这些恢复输入。

- rootPath、chapterId 和 baseRevision
- storyBible、outline 与 continuity 的 documentRevisions
- operation、完整 instruction、模型标识和 contextBudgetChars
- JobManager 自身另存 attempt、进度、错误、取消状态和时间

Job row 不保存 API key、完整正文、story bible、ContextPacket 正文或模型原始响应。完整生成结果写入项目 proposals，Job output 只保存 proposalId。instruction 最长 20,000 字符，当前会原样进入 payload；如果未来含敏感材料，应改为作品目录中的请求工件加 hash。

proposal id 固定为 JobManager 分配的 job id。handler 每次执行先读取同 id proposal，project、chapter、baseRevision、documentRevisions、model、operation、instruction 和 budget 都一致时直接返回。

handler 执行前重新读取三份结构资料与目标章。任一 revision 已变化时在调用模型前返回 WRITER_REVISION_CONFLICT。进程重启触发 JobManager recovery 时，同 id proposal 已落盘便零模型调用完成恢复；身份不一致时返回 WRITER_INVALID_PROPOSAL。

取消通过 AbortSignal 传到 AiService，并在取得 proposal 持久化锁后再次检查。JobManager 只有 outcome=cancelled 时才向 renderer 返回 cancelled=true。

## 目录与进程边界

~~~text
renderer feature
  -> typed writer IPC
    -> main IPC handler
      -> WriterStudioService
        -> WriterProjectRepository
        -> writerContinuityReview
        -> shared writerLore matcher
        -> writerProjectContext
          -> writerContext
        -> JobManager
          -> writerGenerationJobHandler
            -> AiService
~~~

| 边界 | 允许 | 禁止 |
|---|---|---|
| src/shared/types/writer.ts | 领域 DTO、zod schema、纯类型 | fs、Electron、main service |
| src/shared/utils/writerLore.ts | renderer 与 main 共用的纯扫描、规范化和排序函数 | fs、React、模型调用、状态写入 |
| src/shared/ipc/schemas/writer.ts | request 与 result schema | 业务流程、磁盘 IO |
| src/main/ipc/handlers/writer.ts | 参数转发、错误映射 | 上下文算法、直接模型调用 |
| src/main/features/writer | 文件事实层、锁、确定性 continuity review、项目上下文装载、纯 context compiler、job handler | React、renderer store |
| src/renderer/features/writer | 正文与结构资料编辑器、artifact 浏览与恢复、行级 diff、proposal 审阅和 job 展示 | Node fs、provider SDK、JobManager |
| src/renderer/routes/app/writer.tsx | 从 feature barrel 引入页面 | 领域实现 |
| src/renderer/windows/main/MainApp.tsx | 只用 TabsProvider.initialDefaultTab 为首次或空会话指定 /app/writer | 修改 TabsProvider 内部默认值、覆盖持久 tab 恢复 |

中心聚合只允许薄接入。serviceRegistry 增加 WriterStudioService，ipcSchemas 和 ipcHandlers 各增加一次 domain spread，route 文件只挂 WriterPage。MainApp 通过 TabsProvider.initialDefaultTab 把首次启动或空会话的默认页设为 /app/writer，已有持久 tab 会话继续按基座规则恢复。其余实现留在 feature 目录，降低同步上游时的冲突面积。

## 文件安全

项目路径属于不可信输入。主进程必须执行以下检查。

- rootPath 先 realpath，再确认 project.json 与 manuscript 位于同一项目根。
- 章节文件名只允许 schema 定义的安全 basename，拒绝斜杠、点点路径、绝对路径和 NUL。
- 读写前后检查 symlink，目标 realpath 不能逃出 project root。
- zod schema 限制结构化字段；项目 JSON 与 proposal 在覆盖旧文件前检查写入字节数，项目 JSON、proposal、单章、history snapshot、proposal scan 和全稿 inventory 都有读前上限。
- continuity-review.json 只接受固定文件名、regular file 与项目内 realpath；报告 findings、coverage、waivers、证据和序列化字节数都受 schema 或写入上限约束。
- 临时文件使用同目录随机文件名和 0600 权限，sync 后 rename，失败后尽力清理。
- 未知 schemaVersion 和未知字段拒绝，不能降级解析。

## 威胁模型

| 威胁 | 后果 | 控制 |
|---|---|---|
| 正文或资料中的 prompt injection | 模型越权改设定、索取密钥或要求调用工具 | 上下文按不可信引用包裹；Writer 生成路径无工具权限；系统规则与 hard rules 固定在最高优先级 |
| 恶意 lore key 或超量条目拖慢主进程 | 生成前扫描卡顿或 prompt 膨胀 | lore、key、正文扫描、章计划、instruction 和单来源内容均有上限；只做普通字符串匹配，不执行 regex |
| 数千条短规则绕过上下文预算 | provider context overflow，模型调用后才失败 | source 元数据、JSON 对象框架与逗号和正文一起计入 48,000 字符硬上限；prompt 与 compiler 共用序列化函数 |
| lore 内容伪装成系统命令 | 模型服从作品资料中的恶意文字 | lore 仍作为 PROJECT_DATA_JSON 内的只读项目资料，优先级低于作者硬规则，生成路径无工具权限 |
| 恶意 project folder 路径穿越 | 覆盖项目外文件 | realpath、basename allowlist、symlink 边界和 main-only fs |
| 旧 proposal 覆盖新正文 | 作者修改丢失 | baseRevision 与 expectedRevision 双重门禁 |
| append 后章节超过合同 | 写入成功后项目无法重新打开 | 在 journal、history 和正文替换前检查最终字符数与 UTF-8 字节数 |
| 外部章节字符超限但字节未超限 | 保存短稿时产生不可读 history | 目标章节读取后检查字符与字节双上限，失败时不保存也不快照 |
| 并发保存和应用 | 正文、manifest 与 proposal 状态分裂 | 项目级写锁、单文件原子替换与 proposal applying journal |
| 空 continuity 数据被误报为“无问题” | 作者在资料未整理时得到 false green | 六类 coverage declarations、staleItems 和 report truncated 共同门禁；未覆盖时只能 incomplete |
| 旧 waiver 掩盖证据变化 | 已改变的问题继续被视为有意安排 | stable key 与 evidence fingerprint 分离；fingerprint 不同显示 stale_exemption，硬引用不可豁免 |
| 超大或深层 JSON | 内存耗尽、UI 卡死或合法 schema 写坏旧文件 | readFile 前 stat 上限、覆盖前序列化字节上限、zod strict、数组与字符串上限 |
| 模型输出携带脚本或 HTML | 预览执行恶意内容 | 行级 diff 按文本渲染，Markdown 源用只读 CodeEditor 展示，不执行模型输出 |
| API key 或隐私落盘 | 作品目录泄密 | key 由 Cherry provider 管理；proposal 不存 key；错误与日志脱敏 |
| 未保存正文恢复副本留在应用数据 | 本机共享账户读取草稿 | recovery drafts 有单份、总字符与条目上限，保存成功后清理；UI 明确把它作为可复制或丢弃的非 canonical 恢复稿 |
| 外部模型泄露未出版正文 | 隐私损失 | UI 显示所选模型与发送范围，并在生成按钮前提示本次选入资料会发送给模型服务商 |
| 许可证污染 | Cherry 发布风险 | clean-room 实现；参考仓库不加入依赖、不复制提示词和资产 |

## 失败恢复

| 失败点 | 当前行为与边界 |
|---|---|
| renderer 关闭 | JobManager 中的 job 继续；有界 active-job map 让 WriterPage 重开后恢复观察，完成后再按 proposalId 读取磁盘 proposal |
| 模型调用中进程退出 | recovery=retry 重置运行状态；同 job id proposal 已存在时校验身份并直接返回 |
| provider 调用失败 | job failed 并保留 JobManager 错误，不生成 proposal |
| proposal 临时写入时断电 | 同目录临时文件不会成为正式 proposal，后续 recovery 可以重新执行 |
| proposal 已写、job 尚未完成时退出 | proposal id 等于 job id，恢复执行读取并复用同一文件 |
| Job DB 已 GC 或作品搬到新设备 | Proposal Library 与 History Dialog 直接扫描项目内 artifact；已落盘提案和快照不依赖原 Job DB |
| 入队后、模型调用前作者改正文 | handler 复核 baseRevision 并在调用模型前返回 conflict |
| 入队后、模型调用前作者改结构资料 | handler 复核三份 documentRevisions 并在调用模型前返回 conflict |
| 模型调用期间作者改正文 | proposal 仍绑定旧 baseRevision，apply 时返回 conflict |
| 生成后作者改 Story Bible、outline 或 continuity | proposal 仍绑定旧 documentRevisions，apply 时返回 conflict |
| 应用正文后、manifest 或 proposal 状态前退出 | applying journal 对比 current、base 和 target；base 回 pending，target 收口 applied，其他状态不误报 |
| 磁盘空间不足 | 当前文件的临时写失败时旧文件保留；跨文件步骤仍按上一行处理 |
| continuity 或 outline 损坏 | schema 解析失败并拒绝打开项目，原文件保留 |
| continuity-review.json 缺失 | 旧项目以 missing revision 打开；read 返回 not_run，首次 run 原子创建 sidecar |
| 审查来源变化 | sourceFingerprint 不一致时 read 返回 stale，旧 report 和 waiver 留盘供审计，不能显示 clear |
| 审查写入并发或响应丢失 | run、waive、unwaive、coverage.update 使用独立 expected review revision；stale 请求冲突且旧 sidecar 保留 |
| 用户重复接受 | mode、expectedRevision 和 appliedRevision 与原请求一致时幂等返回当前正文；其他重放返回 already applied |

## 延后的方案

### 独立 Writer 数据库与 DataApi

满足下面多数条件后，才重新评估独立 writer DB。

- 领域 schema 已跨至少两个发布版本稳定。
- 用户需要跨几百个项目检索、统计或批量管理。
- 单项目文件数量让打开和索引耗时明显超出可接受范围。
- 团队协作、多设备同步或细粒度权限需要事务与关系约束。
- 已有带 checksum 的 folder export、import、rollback 和灾难恢复测试。
- WriterRepository 已经隔离，切换存储实现不要求重写 UI 和生成流程。

届时优先建立独立 writer DB 和独立 DataApi domain。它可以位于 Writer 专用数据目录，也可以使用每项目 sidecar，选择要由同步和备份需求决定。portable folder 至少继续作为完整导入导出格式。不能为了少写一个 repository 就把作品表混进 Cherry 主 SQLite。

## 下一阶段优先级

第一项是接入带 evidence 与 documentRevisions 的 AI 语义 review proposal，并保持它与已落地的确定性审阅面分栏。任何 AI Guardian 修复仍形成 proposal，检查器异常或重试耗尽不能变成通过。

第二项是整书 snapshot、恢复和专业导出。snapshot 要覆盖 portable folder 的规范文件，带相对路径 allowlist、hash、字节上限与 schema 版本。原地恢复前先保存当前整书版本，导入默认创建新目录。TXT、Markdown、DOCX 和 EPUB 使用同一个确定性 compile 输入，不能让导出器修改正史。

多 Agent 放在这两项之后。届时可以把记忆整理、连续性检查和质量审阅做成 JobManager workflow，每个 Agent 产物仍是可审 artifact 或 proposal。不能引入 Cppys/OpenNovel 的 force pass，也不能让后台 Agent 直接改 manuscript 或三份结构资料。

### 自主整书生成

首版只做有界 proposal。多章自动运行、分层摘要自动更新、检索索引和多 Agent 审核都要建立在 revision gate、ContextPacket 审计、continuity findings 和整书恢复测试通过之后。

## 采纳后果

正面结果包括作品可携带、正史写入清楚、上游同步冲突较小、JobManager 状态可持久化、apply 可恢复、每次模型生成可解释。代价包括跨项目查询较弱、作品搬家后未完成 job 无法一起迁移。

这些代价在首版可接受。WriterRepository 和 typed IPC 保留了以后切换独立数据库的接口，不需要现在承担主 SQLite 的迁移冲突。

## 当前验证与剩余验证

当前测试已经覆盖下面这些不变量。

- 创建并重新打开完整目录，章节 revision 可重算。
- 手工保存拒绝 stale revision，普通 history 快照节流且有数量上限。
- proposal apply 检查 baseRevision、expectedRevision、operation 与 mode，并强制快照。
- proposal applying journal 覆盖正文未写与正文已写两个崩溃窗口，响应丢失后的原请求可幂等重放。
- 路径标识和 symlink 逃逸被拒绝。
- ContextPacket 优先级、未来信息过滤、尾部裁剪与模型窗口预算可重复。
- typed continuity review 覆盖六类规则、硬引用、stable key 与 evidence fingerprint；输入变化会产生 stale report 或 stale exemption。
- 没有 coverage declarations 的空项目只会得到 incomplete；六类声明未覆盖目标章、assessmentRevision 过期或报告截断都不能显示 clear。
- continuity-review.json 可创建、重开并通过独立 revision gate 更新；waive 要求当前可豁免 finding 与非空理由，unwaive 可撤销，已消失 finding 的 waiver 作为 orphaned 保留。
- Renderer 能运行审查、筛选 findings、标记或撤销 coverage、保存或更新豁免并撤销 active 与 orphaned waiver；stale report 的危险操作禁用。
- Lorebook 的普通 key aliases、always、大小写、整词、order 与有界扫描可重复；命中但超预算的条目留下 dropped receipt。
- schemaVersion 1 的旧 story bible 缺少 loreEntries 时打开为空数组，下一次合法保存仍受 Story Bible revision gate。
- 长 premise 或 author constraints 不能挤掉依赖当前章的任务，continue 在极小预算中仍保留正文尾部。
- 当前展示的 Quick 或手选模型会被显式提交，不可用时 fail-closed；没有可展示模型时使用 managed default；小窗口 instruction 耗尽时入队前失败。
- generation handler 在调用模型前复核 revision，并把 AbortSignal 传给 AiService。
- proposal id 与 job id 稳定关联，Job output 只有 proposalId，恢复窗口零模型调用。
- 结构资料以语义 revision 保存；旧 revision 不能覆盖新 JSON。
- proposal 与 history 可从磁盘 list/read；history restore 会反向快照当前正文。
- WriterPage 可恢复有界未保存草稿与 active job，UI 在应用或恢复前保存编辑器正文。
- 完整打开以 stat 校验全稿，autosave 只读取小 JSON 与目标章。
- 生成前外发提示可见，生成结果不会自行写入正史。
- context preview 与 generation handler 复用 `writerProjectContext`；预览不调用模型，实际 proposal 仍保存生成时重新编译的 ContextPacket。
- Writer 没有新增 Cherry 主作品表或 migration。

下面项目仍需补充深度集成验证，不应写成已经完成。

- provider 传输失败、进程退出和取消竞态的真实 provider 集成验证。
- ENOSPC、权限变化与断电窗口的文件系统集成验证。
- 未知 schemaVersion 与损坏 artifact 的端到端错误呈现。
- continuity review 的多窗口 revision 冲突与大 finding 集合端到端交互。
