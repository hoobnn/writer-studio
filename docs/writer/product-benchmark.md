---
description: Current product benchmark and evidence-backed roadmap for Writer Studio
sources:
  - docs/writer/research.md
  - docs/writer/architecture.md
  - src/shared/types/writer.ts
  - src/renderer/features/writer/components/WriterWorkspace.tsx
---

# AI 小说产品对照与产品路线

## 口径

本页记录 2026-08-25 可复核的产品观察，并把事实、推断和 Writer Studio 决策分开。闭源产品只能根据官方文档、官网和官方反馈板确认公开行为，不能据此推断内部实现。开源产品的代码与许可证审计见 [AI 小说项目调研](./research.md)。

Writer Studio 的目标不是复刻某个竞品，而是解决长篇写作里反复出现的五类问题。

1. 正文、设定、大纲和记忆会在创作过程中逐渐分叉。
2. 作者不知道模型实际看见了什么，也不知道关键资料为何被遗漏。
3. AI 结果容易覆盖作者文字，旧建议还可能套用到已经变化的正文。
4. 资料、版本和导出受平台限制，换工具或试验不同故事线的成本高。
5. 功能越多，编辑器越像控制台，真正的码字空间反而被压缩。

## 闭源产品

| 产品 | 已确认的优势 | 已确认的限制或用户诉求 | 对 Writer Studio 的启示 |
|---|---|---|---|
| Novelcrafter | Codex 把人物、地点和世界资料连接到计划、写作和审阅；支持不同规划视图、系列共享、协作、自定义 prompt、云模型与本地模型 | 官方反馈板仍有整书 Codex 自动建立、快照、聊天编辑、跨场景导出、上下文选择和超大项目稳定性诉求 | 知识库必须和正文形成可见连接，但自动抽取只能给出候选变更；上下文、版本和导出不能成为黑箱 |
| Sudowrite | Story Bible 从构思、人物、世界、大纲、Scenes 逐层驱动 Draft；Write、Rewrite、Describe、Brainstorm 等操作适合低学习成本创作；Chapter Continuity 可显式连接前序章节 | 官方反馈板持续要求 Story Bible 随正文更新、整项目版本、完整 Story Bible 导出、聊天建议直接进入稿件审阅；用户也希望复杂多栏界面有更轻的入口 | 结构资料要好填、好看、好复用；正文反向更新资料必须走 suggestion 和接受流程；聊天与稿件之间需要明确 diff，不靠复制粘贴 |
| NovelAI | 编辑器内即时续写；Memory、Author's Note、Lorebook 与插入位置可配置；Context Viewer 能按来源显示送入模型的内容；故事导出保留设置与重试树 | 核心体验偏连续文本生成，复杂项目规划、跨章事实治理和正式版本门禁需要作者自行组织 | 生成前后都应能查看上下文来源；高级插入策略不应挤占默认写作界面；即时性不能绕过正史门禁 |
| 阅文作家助手与妙笔 | 全端写作、全文检索、纠错、历史版本、云同步、读者互动与作品数据形成平台闭环；妙笔偏资料、场景描写和词汇辅助 | 官方产品页没有公开可审计的长篇上下文、连续性门禁或可移植项目协议；平台能力与发布、互动和收益体系高度绑定 | Writer Studio 保留本地可移植正史，优先补写作质量和项目治理；平台发布与运营数据属于以后独立适配器，不进入核心事实层 |
| 七猫作家助手与 AI 小助理 | 实时保存、历史版本、多端同步、错字检测、数据与收益、评论互动；公开功能包含起名、设定和码字灵感 | AI 更像局部灵感工具；公开资料没有证明跨章记忆、来源回执或 proposal-first 工作流 | 局部工具应围绕选区和当前章快速出现，但每项 AI 结果仍是建议；平台数据不应绑死作品格式 |

## 开源产品

| 路线 | 代表项目 | 优势 | 主要代价 | Writer Studio 已采用或计划采用 |
|---|---|---|---|---|
| 确定性长篇流水线 | ainovel-cli、novel-studio | checkpoint、分层记忆、哈希绑定审查、可恢复运行 | 状态机和工件协议复杂，自动提交终稿削弱作者控制 | JobManager、分层 ContextPacket、revision gate；不允许 Agent 直接推进正史 |
| 人机共写层级生成 | Dramatron、RecurrentGPT | 从高层意图逐级落到场景；短期与长期记忆支持长文本 | top-down 不适合所有作者，摘要和向量召回会漂移 | Story Bible、outline、近期正文和远期摘要分层；所有层都允许人工编辑 |
| 提案与版本保护 | xnovelist、openovel | proposal、write-op、snapshot、文件夹事实层 | 完整导入导出和跨文件恢复仍需额外工程 | proposal-first、行级 diff、章节 history；下一阶段补整书 snapshot 与 compile |
| 动态知识注入 | SillyTavern、KoboldAI | lore 激活、优先级和插入位置可解释 | 配置面庞大，复杂规则容易让普通用户失去判断 | Lorebook v1 与激活回执；高级匹配放到渐进披露界面 |
| 连续性与语义审阅 | Novel-OS、OCNovel、Cppys/OpenNovel | 稳定 finding、事实图、多 Agent 审稿 | 依赖缺失可能 fail-open，语义结论容易冒充事实 | 确定性 review 已落地；AI review 必须带证据并形成 proposal |

## 产品原则

### 正文唯一，AI 只给候选

正文、Story Bible、outline 和 continuity 都是作者确认过的正史。AI 可以生成正文提案、结构资料候选和审阅 finding，但不得静默修改这些文件。每次应用都要绑定生成时 revision，旧结果不能覆盖新文本。

### 把上下文变成可检查的产品对象

作者应在生成前看到预计发送的资料类别、预算和模型，在生成后看到实际来源、截断和 Lore 激活原因。默认界面只显示摘要，高级视图再展开每条来源，不把 token 工程术语塞进码字主线。

### 资料应当像写作工具，不像 JSON 控制台

人物、主题、硬规则、世界规则、故事弧、章计划和伏笔都应使用结构化卡片或列表编辑。原始 JSON 只作为高级诊断与互操作入口。编辑体验要允许先写少量内容，不能强迫作者按固定顺序填完一套表单才能开始正文。

### 完整作品始终可带走

portable project folder 保持权威。整书 snapshot 覆盖正文与结构资料，恢复前先保存当前版本。TXT、Markdown、DOCX 与 EPUB 共用同一份确定性 compile 输入，导出器不得修改正史。

### 让复杂度退到边缘

桌面宽屏可以同时显示章节、正文和 Copilot，窄窗口或专注模式必须能折叠两侧，只保留编辑器。运行中任务、未审提案、未保存草稿和连续性问题要在折叠后仍有可见状态，不让隐藏面板吞掉重要信息。

## 痛点到功能

| 痛点 | 解决方式 | 完成证据 |
|---|---|---|
| Story Bible 与正文漂移 | AI 语义审阅生成带 evidence 和 document revisions 的资料变更候选；作者逐项接受 | 旧 revision 拒绝应用；接受前文件不变；finding 可定位正文证据 |
| 不知道模型看见什么 | 生成前 context preflight，生成后保留 ContextPacket；摘要和完整来源两级显示 | UI 能显示来源类别、预算、截断与 Lore 命中；编译结果与真实生成使用同一路径 |
| 资料编辑门槛高 | Story Studio 结构化编辑器，原始 JSON 移入高级模式 | 人物、规则、大纲与章计划无需写 JSON 即可增删改并保存；schema 与 revision gate 不变 |
| 试验故事线难回退 | 整书 snapshot、版本清单、diff 摘要与反向恢复 | snapshot 有 allowlist、hash 和 schema version；恢复前自动 snapshot；损坏包 fail-closed |
| 平台锁定与导出残缺 | 确定性合编和 TXT、Markdown、DOCX、EPUB 导出 | 同一 compile manifest 驱动四种格式；导出前后项目 revision 不变 |
| 三栏界面压缩正文 | 可折叠章节栏与 Copilot、专注模式、窄窗口抽屉 | 桌面、窄窗口和键盘操作均可恢复隐藏面板；重要状态在折叠时仍可见 |
| AI 操作散乱 | 以“构思、计划、起草、续写、改写、审阅、总结”组织操作，并根据选区和章节状态给默认动作 | 每个入口映射到既有 WriterOperation；不会出现同义重复按钮 |

## 实现顺序

1. Story Studio 与工作区信息架构。先消除原始 JSON 作为主入口的问题，并完成三栏折叠、专注模式和状态提示。
2. Context preflight 与统一来源查看器。复用真实 context compiler，不能在 renderer 另造估算逻辑。
3. AI 语义 review proposal。先覆盖人物、世界规则、章计划完成度与伏笔候选，所有输出保留 evidence。
4. 整书 snapshot 与确定性 compile，再增加 TXT、Markdown、DOCX 和 EPUB adapter。
5. 多 Agent workflow。只有前四项的 revision、恢复和审阅界面稳定后才加入，所有 Agent 仍只生产 artifact 或 proposal。

## 本轮落地

本轮先完成了不依赖新项目格式、同时能解决高频使用痛点的部分。

- Story Studio 以可视化表单编辑故事罗盘、创作护栏、主题、风格、世界规则和人物卡，原始 JSON 保留为高级入口。两种模式共享既有 schema、draft 与 revision gate。
- 章节栏和 Copilot 使用 ResizablePanel 原生 collapse/expand，专注模式退出后恢复进入前布局。折叠的 Copilot 保持挂载，未发送指令不会丢失，隐藏区域通过 inert 与 aria-hidden 退出焦点顺序。
- Context preview 由主进程调用与正式生成相同的 `writerProjectContext` 和纯 compiler，显示实际来源全文、预算、截断和 Lore receipt；它不入队、不调用模型。正文、结构资料、操作、指令或模型变化后旧预览失效。
- 左栏 Memory 改为紧凑项目工具区，章节导航重新成为主要内容；Context Inspector 同时用于生成前预览和 proposal 的实际上下文，避免两套视觉语言。

语义 review、整书 snapshot、专业导出和多 Agent 仍按上面的依赖顺序保留为后续阶段。本轮没有用一个未经恢复验证的自动化入口代替它们，也没有扩大项目 schemaVersion 1。

## 公开来源

- [Novelcrafter 官网](https://www.novelcrafter.com/) 与 [官方反馈板](https://feedback.novelcrafter.com/)
- [Sudowrite 功能概览](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/features/dq7YUMNy5ZMvKUJiRAisyT)、[Story Bible](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/what-is-story-bible/jmWepHcQdJetNrE991fjJC) 与 [官方反馈板](https://feedback.sudowrite.com/)
- [NovelAI Story Settings](https://docs.novelai.net/en/text/editor/storysettings/)、[Lorebook](https://docs.novelai.net/en/text/lorebook/) 与 [Context 术语](https://docs.novelai.net/en/text/glossary/)
- [阅文作家助手](https://www.yuewen.com/app/?type=appzj) 与 [阅文妙笔 AI 工具箱](https://aipro.yuewen.com/)
- [七猫作家助手](https://zhushou.qimao.com/become-author)
