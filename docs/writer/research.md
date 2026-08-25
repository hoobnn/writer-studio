---
description: Fixed-commit audit of AI novel-writing projects and clean-room design inputs for Writer Studio
sources:
  - src/shared/types/writer.ts
  - src/shared/utils/writerLore.ts
  - src/main/features/writer/writerContext.ts
  - src/main/features/writer/writerContinuityReview.ts
  - src/main/features/writer/writerGenerationJobHandler.ts
  - src/renderer/features/writer/components/WriterLorebookDialog.tsx
---

# AI 小说项目调研

## 调研口径

本次审计日期为 2026-08-24。目标是提取可复核的产品机制与工程约束，为 Cherry Studio Writer 首版提供 clean-room 设计输入。调研仓库只用于阅读、运行局部测试和核对许可证。Writer 代码不得复制这些项目的源码、提示词、资产或目录实现。

“已克隆”只表示本机有固定提交的工作树。“现场验证”只表示下表所列命令在本机得到对应结果，不代表项目整体成熟，也不代表真实模型调用已经跑通。

## 本地工作树

除 ainovel-cli 外，其余六个参考仓库都是本次使用的浅克隆，git rev-parse --is-shallow-repository 返回 true。六个浅克隆在验证后保持干净。ainovel-cli 是此前已有的完整克隆，返回 false，且审计开始前已有未提交修改，因此这里只把固定提交和未受这些修改影响的局部测试作为证据。

| 项目 | 本地路径与 remote | 固定提交 | 日期 | 许可证 | 现场验证 |
|---|---|---|---|---|---|
| ainovel-cli | /Users/haobin/Code/personal/writer/ainovel-cli；origin 为 https://github.com/hoobnn/ainovel-cli.git；upstream 为 https://github.com/voocel/ainovel-cli | [8ad2ea8f6450e90a10dc7feca8bb809a6e439360](https://github.com/hoobnn/ainovel-cli/tree/8ad2ea8f6450e90a10dc7feca8bb809a6e439360) | 2026-08-20 | [Apache-2.0](https://github.com/hoobnn/ainovel-cli/blob/8ad2ea8f6450e90a10dc7feca8bb809a6e439360/LICENSE) | go test ./internal/flow ./internal/domain 通过 |
| novel-studio | /Users/haobin/Code/personal/writer/references/ai-novel-projects-cn/novel-studio；origin 为 https://github.com/Xiaoyangy/novel-studio.git | [9da2ff15552e0881f4c832a1fec97291a5b8e5a1](https://github.com/Xiaoyangy/novel-studio/tree/9da2ff15552e0881f4c832a1fec97291a5b8e5a1) | 2026-07-25 | [Apache-2.0](https://github.com/Xiaoyangy/novel-studio/blob/9da2ff15552e0881f4c832a1fec97291a5b8e5a1/LICENSE) | go test ./internal/host/flow 通过 |
| OCNovel | /Users/haobin/Code/personal/writer/references/ai-novel-projects-cn/OCNovel；origin 为 https://github.com/wenjiazhu1980/OCNovel.git | [902c1af28a35dc751162dffdfa27f44eff65bff7](https://github.com/wenjiazhu1980/OCNovel/tree/902c1af28a35dc751162dffdfa27f44eff65bff7) | 2026-08-09 | [MIT](https://github.com/wenjiazhu1980/OCNovel/blob/902c1af28a35dc751162dffdfa27f44eff65bff7/LICENSE) | compileall 通过；定向 pytest 得到 13 passed、2 failed |
| Ai-Novel | /Users/haobin/Code/personal/writer/references/ai-novel-projects-cn/Ai-Novel；origin 为 https://github.com/inliver233/Ai-Novel.git | [8b85b2b6f29af4c69241be7c42417dbe4795db30](https://github.com/inliver233/Ai-Novel/tree/8b85b2b6f29af4c69241be7c42417dbe4795db30) | 2026-07-29 | 无根 LICENSE，README 也写明许可证待补 | backend/app 的 compileall 通过 |
| xnovelist | /Users/haobin/Code/personal/writer/references/ai-novel-projects-global/xnovelist；origin 为 https://github.com/giapnguyen74/xnovelist.git | [7abd8c1252fdf65120feeef3c977fc3283c08bfc](https://github.com/giapnguyen74/xnovelist/tree/7abd8c1252fdf65120feeef3c977fc3283c08bfc) | 2026-06-08 | 根 [LICENSE](https://github.com/giapnguyen74/xnovelist/blob/7abd8c1252fdf65120feeef3c977fc3283c08bfc/LICENSE) 为 MIT，README 仍称待定 | package 与两份 prompt pack JSON 解析通过；未安装依赖，未运行 build |
| Dramatron | /Users/haobin/Code/personal/writer/references/ai-novel-projects-global/dramatron；origin 为 https://github.com/google-deepmind/dramatron.git | [2e7c36afadacf8321b77a468940024371b7a8c7a](https://github.com/google-deepmind/dramatron/tree/2e7c36afadacf8321b77a468940024371b7a8c7a) | 2024-07-17 | 软件为 [Apache-2.0](https://github.com/google-deepmind/dramatron/blob/2e7c36afadacf8321b77a468940024371b7a8c7a/LICENSE)，README 另称材料为 CC-BY-4.0 | jq empty colab/dramatron.ipynb 通过；没有接模型执行 notebook |
| RecurrentGPT | /Users/haobin/Code/personal/writer/references/ai-novel-projects-global/recurrentgpt；origin 为 https://github.com/aiwaves-cn/RecurrentGPT.git | [ea520e99f49072d152d61a68bac45f272a867596](https://github.com/aiwaves-cn/RecurrentGPT/tree/ea520e99f49072d152d61a68bac45f272a867596) | 2024-05-15 | [GPL-3.0](https://github.com/aiwaves-cn/RecurrentGPT/blob/ea520e99f49072d152d61a68bac45f272a867596/LICENSE) | 五个 Python 入口的 compileall 通过；没有下载模型或调用 API |

OCNovel 的两个失败都发生在写回大纲的路径。当前环境缺少 opencc，质量闸门捕获异常后按源码的 fail-open 设计放行，导致期望修订和报告落盘的断言失败。这条结果说明依赖缺失会让闸门失去阻断力，不能把“流程继续”理解为“大纲已通过审核”。

xnovelist 的许可证元数据互相矛盾。根 LICENSE 明示 MIT，README 的 License 段仍称待定。即便根文件可作为许可证文本，本项目仍只取思想，不直接移植代码。

Ai-Novel 没有 LICENSE。未明确授权时默认不得复制、修改或分发其代码、提示词、样式和资产。对其结构化对象、任务队列和 Prompt Studio 的观察只能转成独立设计要求。

### 扩展浅克隆

第二轮筛选补充了动态 lore、本地文件协作、中文多 Agent 审稿和确定性连续性四类机制。下面四个仓库都克隆到 `/Users/haobin/Code/personal/writer/references/ai-novel-projects-expanded/`。它们均为浅克隆，固定提交后保持 clean。SillyTavern 还使用 partial clone 与 sparse checkout，只取回 lorebook、prompt、chat checkpoint 和导入相关源码。

| 项目 | 本地路径与 remote | 固定提交 | 日期 | 许可证 | 现场验证 |
|---|---|---|---|---|---|
| SillyTavern | `/Users/haobin/Code/personal/writer/references/ai-novel-projects-expanded/sillytavern`；origin 为 https://github.com/SillyTavern/SillyTavern.git；分支为 release | [8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8](https://github.com/SillyTavern/SillyTavern/tree/8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8) | 2026-07-07 | [AGPL-3.0](https://github.com/SillyTavern/SillyTavern/blob/8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8/LICENSE) | `node --check public/scripts/world-info.js` 通过；没有启动服务或接模型 |
| openovel | `/Users/haobin/Code/personal/writer/references/ai-novel-projects-expanded/openovel`；origin 为 https://github.com/Feed-Scription/openovel.git；分支为 main | [1b4404e85d03d1e41e5d745e303372333b29c610](https://github.com/Feed-Scription/openovel/tree/1b4404e85d03d1e41e5d745e303372333b29c610) | 2026-06-17 | [Apache-2.0](https://github.com/Feed-Scription/openovel/blob/1b4404e85d03d1e41e5d745e303372333b29c610/LICENSE) | context compiler、Context Card 和 snapshot 三个 JS 入口通过 `node --check`；没有安装依赖 |
| Cppys/OpenNovel | `/Users/haobin/Code/personal/writer/references/ai-novel-projects-expanded/cppys-opennovel`；origin 为 https://github.com/Cppys/OpenNovel.git；分支为 main | [38fdf4e2762987485c956febf4c1d96afd9688e3](https://github.com/Cppys/OpenNovel/tree/38fdf4e2762987485c956febf4c1d96afd9688e3) | 2026-03-01 | [MIT](https://github.com/Cppys/OpenNovel/blob/38fdf4e2762987485c956febf4c1d96afd9688e3/LICENSE) | workflow 与 memory 关键 Python 文件通过 AST 解析；没有安装 LangGraph、Chroma 或调用 Claude |
| Novel-OS | `/Users/haobin/Code/personal/writer/references/ai-novel-projects-expanded/novel-os`；origin 为 https://github.com/mrigankad/Novel-OS.git；默认分支为 dev | [1bd4b5725a8225462873571eb9f9d26f5496ae83](https://github.com/mrigankad/Novel-OS/tree/1bd4b5725a8225462873571eb9f9d26f5496ae83) | 2026-08-09 | [MIT](https://github.com/mrigankad/Novel-OS/blob/1bd4b5725a8225462873571eb9f9d26f5496ae83/LICENSE) | context pack 与 continuity engine 通过 AST 解析；没有安装 provider SDK 或运行 Web Studio |

### 候选热度与排除

Stars 取自 2026-08-24 的 GitHub 仓库页，只用于说明社区规模，后续会变化。SillyTavern 为 32,576，Talemate 为 414，Novel-OS 为 35，Cppys/OpenNovel 为 25，openovel 为 6。选择 openovel 的依据是本地文件事实层与前后台双循环的互补性，不能据此声称它已经成熟。

[Talemate](https://github.com/vegu-ai/talemate/tree/c12a82930e913816fdac21aedada1962ac45c3d7) 的固定提交日期为 2026-07-02，许可证为 [AGPL-3.0](https://github.com/vegu-ai/talemate/blob/c12a82930e913816fdac21aedada1962ac45c3d7/LICENSE)。它有多 Agent、分层历史、消息 revision 和 durable world state，和 SillyTavern、openovel 的覆盖较多，因此本轮只做候选审计，没有克隆。

`leenbj/novel-creator-skill` 当日有 607 Stars，README 自述 MIT，根目录却没有 LICENSE，固定 URL 返回 404。它没有进入“真正开源”的可复制样本，也没有克隆。Novelforge 同样没有在根目录提供许可证文件，本轮不把其对抗式审稿说明当作可复用代码来源。

## 同源代码脉络

novel-studio 和 ainovel-cli 不能算两次独立验证。本机用两边 git ls-files 求交集后得到 228 个同路径文件，再用 git hash-object 比较当前内容，39 个文件逐字节一致。相同文件包括 LICENSE、写作参考资料、checkpoint 领域类型、评测用例和诊断代码。两边还共享文件系统事实层、确定性路由、章节计划与提交、评审和分层上下文等架构形状。

这些证据支持“明显同源代码脉络”的判断，不足以证明 GitHub 上存在正式 fork 关系。后文把 ainovel-cli 作为主路线，把 novel-studio 视作该路线在审核、来源追踪和生产门禁上的扩展阶段。

## 各项目机制与取舍

### ainovel-cli

一手入口包括固定提交的 [README](https://github.com/hoobnn/ainovel-cli/blob/8ad2ea8f6450e90a10dc7feca8bb809a6e439360/README.md)、[上下文管理](https://github.com/hoobnn/ainovel-cli/blob/8ad2ea8f6450e90a10dc7feca8bb809a6e439360/docs/context-management.md) 和 [flow router](https://github.com/hoobnn/ainovel-cli/blob/8ad2ea8f6450e90a10dc7feca8bb809a6e439360/internal/flow/router.go)。

它把可枚举流程交给确定性 Engine，把创作交给 Architect、Writer、Editor，把少量语义分岔交给 Arbiter。每章按 context、回读、计划、起草、一致性检查、提交的顺序推进，工具成功后写 checkpoint，文件系统保存 Progress、Outline、Draft、Summary 等事实。长篇采用章、弧、卷三级摘要，近处保留更多正文，远处逐级压缩。规划也按卷弧滚动展开，避免一次生成几百章的空洞大纲。

这条路线适合长时间无人值守和故障恢复。代价是状态机、工件协议和恢复逻辑都要长期维护。默认自动提交终稿的思路也不适合 Writer 首版的人机共写目标，因此 Cherry 只借用确定性流程和分层摘要，不借用“模型直接推进正史”的写入权限。

### novel-studio

一手入口包括固定提交的 [架构说明](https://github.com/Xiaoyangy/novel-studio/blob/9da2ff15552e0881f4c832a1fec97291a5b8e5a1/docs/architecture.md)、[审核新鲜度检查](https://github.com/Xiaoyangy/novel-studio/blob/9da2ff15552e0881f4c832a1fec97291a5b8e5a1/cmd/novel-studio/review_freshness.go)、[RAG 来源回执领域类型](https://github.com/Xiaoyangy/novel-studio/blob/9da2ff15552e0881f4c832a1fec97291a5b8e5a1/internal/domain/rag_fact_receipt.go) 和 [生产技术说明](https://github.com/Xiaoyangy/novel-studio/blob/9da2ff15552e0881f4c832a1fec97291a5b8e5a1/README-TECHNICAL.md)。

它把审核结论绑定到正文 body_sha256，把 pipeline 阶段绑定到工件哈希和 execution receipt。RAG 与网络材料带来源、检索时间、命中引用和转换规则，渲染阶段消费已经冻结的事实白名单。这样能识别“审核过旧稿”“召回材料被直接当事实”“上游计划后来改变”等常见漂移。

审计强度越高，证据对象、门禁和恢复分支也越多。它能提供生产链的检查思路，不能作为第二套独立架构验证。Cherry 首版只引入正文 revision、上下文来源和 proposal 绑定，先不复制整套检测器或复杂流水线。

### OCNovel

一手入口包括固定提交的 [README](https://github.com/wenjiazhu1980/OCNovel/blob/902c1af28a35dc751162dffdfa27f44eff65bff7/README.md)、[大纲质量闸门](https://github.com/wenjiazhu1980/OCNovel/blob/902c1af28a35dc751162dffdfa27f44eff65bff7/src/generators/outline/outline_quality_gate.py)、[一致性检查](https://github.com/wenjiazhu1980/OCNovel/blob/902c1af28a35dc751162dffdfa27f44eff65bff7/src/generators/content/consistency_checker.py) 和 [知识库](https://github.com/wenjiazhu1980/OCNovel/blob/902c1af28a35dc751162dffdfa27f44eff65bff7/src/knowledge_base/knowledge_base.py)。

它提供 PySide6 GUI，并把 outline、content、finalize 串成可续跑流水线。大纲同时有只读审计与阻断式闸门，章节采用一致性评分和有限次数修订，还会保留历史最优版本。知识库走分块、向量检索和 reranker。整体产品面比研究原型完整。

主要风险来自单体 Python 依赖和多个质量开关。现场测试已经展示 opencc 缺失时闸门会 fail-open。Writer 应把“质量不合格”和“审核器不可用”分成两个状态，后者不得显示为通过。

### Ai-Novel

一手入口包括固定提交的 [README](https://github.com/inliver233/Ai-Novel/blob/8b85b2b6f29af4c69241be7c42417dbe4795db30/README.md)、[章节生成服务目录](https://github.com/inliver233/Ai-Novel/tree/8b85b2b6f29af4c69241be7c42417dbe4795db30/backend/app/services/chapter_generation)、[故事记忆模型](https://github.com/inliver233/Ai-Novel/blob/8b85b2b6f29af4c69241be7c42417dbe4795db30/backend/app/models/story_memory.py) 和 [生成运行模型](https://github.com/inliver233/Ai-Novel/blob/8b85b2b6f29af4c69241be7c42417dbe4795db30/backend/app/models/generation_run.py)。

它把项目、角色、大纲、细纲、章节、记忆、Prompt、模型配置和生成记录放进 FastAPI、PostgreSQL、Redis/RQ 架构，适合多用户、批量任务和服务端检索。Prompt Studio 和 generation run 让模型调用可追踪。

这套方案带来数据库迁移、队列部署、权限和备份成本，也削弱作品目录的可携带性。它适合作为未来团队协作形态的参考，首版不照搬。许可证缺失进一步排除了代码复用。

### xnovelist

一手入口包括固定提交的 [AI 设计](https://github.com/giapnguyen74/xnovelist/blob/7abd8c1252fdf65120feeef3c977fc3283c08bfc/docs/AI.md)、[proposal 与 write-op 分离](https://github.com/giapnguyen74/xnovelist/blob/7abd8c1252fdf65120feeef3c977fc3283c08bfc/src/ai/runTool.ts)、[快照实现](https://github.com/giapnguyen74/xnovelist/blob/7abd8c1252fdf65120feeef3c977fc3283c08bfc/src/storage/snapshots.ts) 和 [正文替换保护](https://github.com/giapnguyen74/xnovelist/blob/7abd8c1252fdf65120feeef3c977fc3283c08bfc/src/editor/EditorCanvas.tsx)。

它把 AI 能力分级，模型先返回 proposal，确定性 write-op 在用户接受后才执行。替换操作携带 expected 原文，当前正文已经变化时拒绝套用旧建议。IndexedDB 中保存手工、定时、删除前和恢复前快照，恢复前还会再做一次自快照。

README 和设计文档声称有行级 diff 与 pre-AI snapshot。固定提交的 SnapshotHistoryPanel 只展示快照列表和恢复按钮，SnapshotSchema 也没有 pre-ai 类型，本次静态审计没有找到对应 UI 实现。因此这里借用的是 proposal、可审 diff、snapshot 三段式原则，不能宣称该提交已经完整实现三者。

### Dramatron

一手入口包括固定提交的 [README](https://github.com/google-deepmind/dramatron/blob/2e7c36afadacf8321b77a468940024371b7a8c7a/README.md) 和 [notebook](https://github.com/google-deepmind/dramatron/blob/2e7c36afadacf8321b77a468940024371b7a8c7a/colab/dramatron.ipynb)。

它从 logline 向下生成标题、人物、场景序列、地点描述和逐场对白。上层结果进入下层 prompt，人可以在任意层修改并重新生成下游。这是一条清楚的从全局意图到局部文本的层级结构。

项目明确定位为人机共写，也记录了创作者认为输出公式化、层级法不适合所有写作习惯等反馈。notebook 还要求使用者自己接入模型。Cherry 应保留层级工件和人工改写，不把 top-down 流程做成唯一入口。

### RecurrentGPT

一手入口包括固定提交的 [README](https://github.com/aiwaves-cn/RecurrentGPT/blob/ea520e99f49072d152d61a68bac45f272a867596/README.md) 和 [循环实现](https://github.com/aiwaves-cn/RecurrentGPT/blob/ea520e99f49072d152d61a68bac45f272a867596/recurrentgpt.py)。

每一步接收上一段、下一段计划、短期记忆和语义检索得到的长期段落，输出新段落、三个后续计划，并重写短期记忆。历史段落追加到长期记忆，向量相似度挑选相关内容。人可以选择或改写下一步计划。

分层记忆能把文本生成延伸到上下文窗口之外。摘要会积累漂移，向量召回也可能漏掉关键事实。代码按字符串标记解析输出，失败时反复调用模型，缺少明确重试上限。Writer 只采用“近期原文、近期摘要、远期检索”的记忆层次，并用结构化 schema、预算和错误上限约束它。

## 扩展项目的代码机制

### SillyTavern lorebook

固定提交的一手入口包括 [World Info 扫描](https://github.com/SillyTavern/SillyTavern/blob/8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8/public/scripts/world-info.js)、[prompt 装配](https://github.com/SillyTavern/SillyTavern/blob/8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8/public/script.js)、[chat checkpoint](https://github.com/SillyTavern/SillyTavern/blob/8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8/public/scripts/bookmarks.js) 和 [World Info 导入端点](https://github.com/SillyTavern/SillyTavern/blob/8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8/src/endpoints/worldinfo.js)。

World Info 会合并全局、角色、persona 与 chat lore，再按插入策略和 order 排序。条目支持常驻、普通关键词、主次关键词逻辑、大小写、整词、正则、递归、概率、sticky、cooldown 与 delay。全局 lore 预算按模型上下文比例计算，也可加绝对 cap。命中内容能进入 scenario 前后、Author's Note、指定消息深度、示例消息或自定义 outlet。

这套系统的价值在于“哪条 lore 为什么进入、放在哪里、占多少预算”都能解释。它的配置面和 chat 语义很复杂，AGPL-3.0 也不适合直接移入 Writer。Writer Lorebook v1 只实现其中最小的确定性子集，源码、函数名、提示词和 UI 都没有复制。

### openovel Context Card、双循环与整书 snapshot

固定提交的一手入口包括 [context compiler](https://github.com/Feed-Scription/openovel/blob/1b4404e85d03d1e41e5d745e303372333b29c610/src/context/contextCompiler.js)、[Context Card 激活](https://github.com/Feed-Scription/openovel/blob/1b4404e85d03d1e41e5d745e303372333b29c610/src/context/foregroundInserts.js)、[Storykeeper apply](https://github.com/Feed-Scription/openovel/blob/1b4404e85d03d1e41e5d745e303372333b29c610/src/lib/storyStore.js)、[整书 snapshot](https://github.com/Feed-Scription/openovel/blob/1b4404e85d03d1e41e5d745e303372333b29c610/src/lib/storySnapshot.js) 和 [导出聚合](https://github.com/Feed-Scription/openovel/blob/1b4404e85d03d1e41e5d745e303372333b29c610/src/services/export/collectNovelData.js)。

它把低延迟 narrator 与慢速后台维护分开。前台只读经过编译的 guidance、memory、最近正史与确定性触发的 Context Card，不拿工具。后台 Showrunner、World Keeper、Director 和 Memory agents 更新普通文件。后台 patch 同时核对原 story root 与 turn 新鲜度，多文件写入通过 transaction 收口，跨作品或过期结果会丢弃并保留待处理 inbox。

Context Card 在模型调用前做本地触发匹配，支持 always、作用域、去重、安全 include 和激活统计。Context compiler 分别限制 guidance、memory 与 recent canon，生成 included、dropped、truncated 报告。整书 snapshot 捕获作品目录，原地恢复前清理快照管辖的旧文件，同时保留 live meta 与初始化记录。版本索引、agent resume ledger、EPUB 和 TXT 导出形成了较完整的携带与恢复能力。

openovel 自己声明处于 beta 或 demo 阶段，故事目录内部 API 仍可能变化。它提供的是双循环、激活回执和整书恢复的设计证据，不能当作成熟度背书。

### Cppys/OpenNovel LangGraph 与 fail-open 反例

固定提交的一手入口包括 [LangGraph 主图](https://github.com/Cppys/OpenNovel/blob/38fdf4e2762987485c956febf4c1d96afd9688e3/workflow/graph.py)、[条件路由](https://github.com/Cppys/OpenNovel/blob/38fdf4e2762987485c956febf4c1d96afd9688e3/workflow/conditions.py)、[记忆装配](https://github.com/Cppys/OpenNovel/blob/38fdf4e2762987485c956febf4c1d96afd9688e3/memory/memory_retriever.py)、[checkpoint](https://github.com/Cppys/OpenNovel/blob/38fdf4e2762987485c956febf4c1d96afd9688e3/workflow/checkpoint.py) 和 [Word 导出](https://github.com/Cppys/OpenNovel/blob/38fdf4e2762987485c956febf4c1d96afd9688e3/tools/word_exporter.py)。

主图串联规划、记忆检索、写作、编辑、审稿、保存、记忆更新和周期性全书审查。上下文包含最近摘要、语义相关旧摘要、角色状态、未解决事件和世界设定。LangGraph SQLite checkpointer 可以保存运行状态，缺少对应依赖时会退化成进程内 MemorySaver。

审稿失败达到最大修订次数后，条件路由仍会保存章节。短篇图甚至把这种路径明确写成 force pass。这个行为不符合 Writer 的正史门禁。可以借用节点状态机、周期审查和分层记忆，不能借用“重试耗尽等于通过”，也不能让任何 Agent 绕过 proposal apply。

### Novel-OS findings 与 provenance

固定提交的一手入口包括 [ranked context pack](https://github.com/mrigankad/Novel-OS/blob/1bd4b5725a8225462873571eb9f9d26f5496ae83/core/context_pack.py)、[确定性连续性引擎](https://github.com/mrigankad/Novel-OS/blob/1bd4b5725a8225462873571eb9f9d26f5496ae83/core/continuity_engine.py)、[Agent 输出解析](https://github.com/mrigankad/Novel-OS/blob/1bd4b5725a8225462873571eb9f9d26f5496ae83/core/state_parser.py)、[阶段审阅](https://github.com/mrigankad/Novel-OS/blob/1bd4b5725a8225462873571eb9f9d26f5496ae83/api/services.py) 和 [章节 snapshots](https://github.com/mrigankad/Novel-OS/blob/1bd4b5725a8225462873571eb9f9d26f5496ae83/api/routes.py)。

Context pack 先按任务目的挑选 POV、相关人物、一跳关系、活跃剧情线、近章与 Codex，再按 rank 删除低价值项，dropped 记录本身进入审计。名字子串、固定 rank 和最后的字符串裁剪属于启发式选择，只能指导上下文压缩，不能充当连续性事实。

连续性引擎先做本地计算。它的 key 是 `category:entity_id`，消息和发现章节不参与 identity，因此绑定实体的 finding 改写文案后仍能命中原豁免。没有 entity_id 的 finding 会共享空 subject，例如多条 unresolved foreshadowing 可能碰撞。Cherry 没有复制这个 key 公式，而是对 `ruleVersion + rule + typed subject` 做 canonical SHA-256；fingerprint 再加入当前 evidence basis。这样 evidence 变化会让 waiver stale，同时保留可追踪的 finding identity。已经消失的 finding 不会让旧 waiver 悄悄生效，它会转入 orphaned 列表，作者可以显式 revoke。

Novel-OS 的 state parser 会解析模型输出中的松散标签，并直接改人物状态、位置、事件和伏笔。引擎对给定状态的计算是确定的，这不证明输入事实经过作者确认。Cherry 只让人工维护或已经接受的结构化资料进入确定性审查。未来 AI 语义审阅仍要输出带 evidence 和 document revisions 的 proposal，不能直接写 continuity。

章节的 draft、revised 与 final 分开保存 producer、model 与 reviewer provenance。Reject 保留 AI 阶段且不碰 Final，Accept 才晋升。恢复 snapshot 前会保存当前 Final。正文中发现的新 Codex 名称也只形成带证据的候选，作者点击后才进入资料库。

它同时使用文件和数据库，不能直接替换 Writer 的 portable folder 决策。Novel-OS 使用 MIT 许可证，直接复制代码仍需保留许可证与版权声明；Cherry 本轮没有复制其 Python 函数、key 公式或提示词。Writer 以自有 TypeScript 与 zod 契约独立落地 typed continuity review。`continuity.json` 保存 timeline events、分 timeline 的 character states、fact 使用章节、伏笔 due 章节与绑定正文 revision 的计划评估；稳定 plan requirements 留在 outline。派生 report、六类 coverage declarations 和作者 waiver 留在独立的 `continuity-review.json`，没有引入 Novel-OS 的数据库或 Python 实现。

Cherry 只有在 finding 与覆盖门禁都通过后才显示 clear。作者确认某类 typed 输入已经整理到目标章时，sidecar 会同时保存当次 rule basis fingerprint。输入变化、声明落后、assessmentRevision 过期、报告过期或截断都会把状态降为 stale 或 incomplete。章节、人物与 requirement 等硬引用错误不能豁免。人物动机、文风和正文是否真正完成计划仍超出确定性数据能证明的范围，只能形成带 evidence 与 document revisions 的 AI review proposal。

## 未克隆的固定提交审计

### KoboldAI Client

审计对象为 [KoboldAI/KoboldAI-Client](https://github.com/KoboldAI/KoboldAI-Client/tree/1ce811c3f9f828ea80274640e866ca3189daf91f) 的 1ce811c3f9f828ea80274640e866ca3189daf91f，提交日期为 2025-01-16，许可证为 [AGPL-3.0](https://github.com/KoboldAI/KoboldAI-Client/blob/1ce811c3f9f828ea80274640e866ca3189daf91f/LICENSE.md)。本次没有克隆或运行它。

固定提交的 [aiserver.py](https://github.com/KoboldAI/KoboldAI-Client/blob/1ce811c3f9f828ea80274640e866ca3189daf91f/aiserver.py) 把 Memory、World Info、原始 prompt、近期 actions 和 Author's Note 分成不同上下文槽位。Memory 是常驻约束，World Info 可常驻或按关键词触发，近期正文从新向旧填充剩余预算，Author's Note 按可配置深度插入靠近生成端的位置。

可借用的思想是显式上下文优先级。每类来源都要说明位置、预算和截断结果。AGPL 代码不进入 Cherry 工作树。

### LongWriter 与 AgentWrite

审计对象为 [THUDM/LongWriter](https://github.com/THUDM/LongWriter/tree/447539b356a8b09760b51eca876e19b6fc1f2dd7) 的 447539b356a8b09760b51eca876e19b6fc1f2dd7，提交日期为 2025-06-24，许可证为 [Apache-2.0](https://github.com/THUDM/LongWriter/blob/447539b356a8b09760b51eca876e19b6fc1f2dd7/LICENSE.txt)。本次没有克隆、训练或推理。

AgentWrite 先用 [plan prompt](https://github.com/THUDM/LongWriter/blob/447539b356a8b09760b51eca876e19b6fc1f2dd7/agentwrite/prompts/plan.txt) 把长任务拆成段落，每段明确主旨和 200 到 1000 词的预算，再由 [write.py](https://github.com/THUDM/LongWriter/blob/447539b356a8b09760b51eca876e19b6fc1f2dd7/agentwrite/write.py) 按步骤顺序生成，每次带原始指令、完整计划、已有文本和当前步骤。

它证明显式长度预算可以进入规划工件。AgentWrite 本身是超长输出数据构造流水线，缺少小说正史、人工接受、连续性台账和版本冲突保护，不能直接当作成熟写作产品。

Writer 当前只把整书 targetWordCount 记在 manifest。outline 与 generation 请求还没有章节或段落字数合同，这部分继续列为后续能力。

## clean-room 综合原则

Writer 采用下面这些行为原则，并用 Cherry 自己的类型、JobManager、IPC 和 UI 独立实现。

| 来源 | 采用的原则 | Cherry 中的落点 |
|---|---|---|
| Dramatron | 层级结构，从作品意图、人物与世界、弧与章计划逐步落到正文 | story-bible、outline、chapter plan 与 manuscript 分层 |
| ainovel-cli | 确定性流程和章、弧、卷分层摘要 | JobManager 驱动可恢复步骤，ContextPacket 选择近文与远期摘要 |
| xnovelist | proposal、diff、snapshot 先于正史写入 | AI 只生成 proposal，用户查看差异后接受，写入前保存 history |
| novel-studio | 审核绑定正文 SHA，外部材料保留来源回执 | baseRevision、appliedRevision、ContextPacket.sources 与截断标记 |
| RecurrentGPT | 短期原文、中期摘要、远期检索组成分层记忆 | ContextPacket 的 recent manuscript、recent summary、related history |
| KoboldAI | 上下文来源有固定优先级与插入位置 | hard rules、当前章、计划、连续性、近文、远期历史按预算装配 |
| SillyTavern 与 openovel | lore 按本地规则激活，并记录命中、预算和丢弃 | 已落地 Lorebook v1、`lore` source 与 `loreActivations` receipt |
| Novel-OS | 确定性 finding 使用稳定身份，作者能保存有意安排；AI 阶段需人工晋升 | 已落地 typed continuity report、key 与 fingerprint 分离、rule-basis coverage、portable waiver；AI 语义审阅仍走 proposal |
| openovel | 整书 snapshot、反向版本和多格式导出 | 下一阶段的 portable snapshot、import、TXT、Markdown、DOCX 与 EPUB compile |
| Cppys/OpenNovel | 可恢复节点图与周期审查 | 仅作为未来 JobManager workflow 参考；禁止 force pass 和 Agent 直写正史 |
| LongWriter | 长度目标先拆成局部预算，再逐段或逐章执行 | 当前只在 manifest 记录 targetWordCount；章节或段落的局部字数合同仍未接入 outline 与 generation 请求 |

这些原则只描述行为与不变量。实现时不得沿用参考项目的函数名、提示词句子、文件内容或 UI 资产。每个 Writer 变更都应能从本仓库 ADR、类型和测试解释其来源，不能用“参考项目就是这样做的”替代设计理由。

## 当前缺口矩阵

| 主题 | 当前运行真值 | 仍缺少的能力 |
|---|---|---|
| Lorebook | deterministic v1 已落地。条目保存在 story bible，支持多条普通 key 作为 aliases、alwaysActive、caseSensitive、matchWholeWords、order 与 enabled；扫描正文、章计划和 instruction 的有界片段；ContextPacket 保存 active、dropped 与 truncated receipt | regex、递归激活、sticky、cooldown、概率、向量检索、跨项目 lore 和导入格式转换均未实现 |
| 连续性 | typed review 已落地。`continuity.json` 可保存 timeline events、分 timeline 的 character states、fact 使用章节、伏笔 due 章节与绑定正文 revision 的 assessments，稳定 plan requirements 位于 outline；六类规则产生 evidence、stable key、fingerprint 和 rule basis；`continuity-review.json` 保存 report、coverage declarations 与 waiver | 自然语言事实抽取、人物动机、文风与真实计划完成度仍需 AI review proposal 和作者接受 |
| 版本 | 每章 history 可 list、read、diff、restore，proposal apply 前强制快照 | 整书 snapshot、导入、跨文件事务恢复和版本清单 |
| Provenance | proposal 保存模型、baseRevision、三份 documentRevisions、ContextPacket sources 与 lore receipts | draft、revised、final 阶段 provenance 和 reviewer 签收 |
| 自动流程 | 单个生成 job 可恢复，同 job proposal 可复用 | 接受后的记忆整理、连续性检查、质量审查和多 Agent 编排 |
| 导出 | 作品目录可直接复制，正文是 Markdown | TXT、Markdown 合编、DOCX 与 EPUB 编译 |

Lorebook v1 是本轮已经验证的 Cherry 自有实现。`WriterLoreEntry`、`writerLoreKeyMatches`、ContextPacket receipt 和 Lorebook Dialog 都从本仓库需求独立设计。SillyTavern 与 KoboldAI 的 AGPL 源码没有进入 Cherry 工作树，也没有复制正则、递归、冷却、概率或向量机制。

后续保持 deterministic report 与 AI semantic review 两条来源分开，先补带 evidence 与 document revisions 的语义 review proposal，再实现整书 snapshot、恢复和专业导出。多 Agent 要等这些能力有稳定恢复测试和 UI 审阅面后再评估，不能用自动化数量代替正史控制。
