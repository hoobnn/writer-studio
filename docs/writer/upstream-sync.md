---
description: Upstream sync boundaries, generated-file rules, and verification checklist for Writer Studio
sources:
  - electron.vite.config.ts
  - src/main/core/application/serviceRegistry.ts
  - src/shared/types/writer.ts
  - src/shared/ipc/schemas/writer.ts
  - src/shared/utils/writerLore.ts
  - src/main/features/writer/writerContinuityReview.ts
  - src/main/features/writer/WriterProjectRepository.ts
  - src/shared/data/preference/preferenceSchemas.ts
  - migrations/README.md
---

# Writer Studio 上游同步手册

## 当前基线

本记录采集于 2026-08-24。

| 项 | 现场值 |
|---|---|
| Cherry 基线 | 9447bf2e5ea76867d6555f08978762892c7cb0c1 |
| 基线提交 | fix(chat-messages): always show token usage in the message footer (#19416) |
| 开发分支 | product/writer |
| 本地 upstream/main | 上游镜像分支，只做快进，不放本地提交 |
| origin/main | 9447bf2e5ea76867d6555f08978762892c7cb0c1 |
| 分叉计数 | 见 `git rev-list --count --left-right origin/main...product/writer` |
| origin | https://github.com/CherryHQ/cherry-studio.git，只读上游，无 push 权限 |
| fork | https://github.com/hoobnn/writer-studio.git，私有，产品线的推送目标 |
| 跟踪分支 | product/writer 跟踪 fork/product/writer |

origin 与 fork 职责固定：origin 只用于 fetch 上游，产品线一律推送到 fork，不要把同一个 remote 同时当上游和推送目标。

## 目标

Writer 代码要长期承受 Cherry main 的更新。同步策略依赖三个约束。

- 领域实现留在 writer feature 目录。
- 中央文件只有注册、路由和导航所需的薄改动。
- 自动生成文件从源重新生成，不能手工解决内容冲突。

## 推荐 remote 与分支模型

长期维护时推荐把个人 fork 作为 origin，把 CherryHQ 官方仓库作为 upstream。

```text
origin    <personal-fork-url>
upstream  https://github.com/CherryHQ/cherry-studio.git
```

分支职责如下。

| 分支 | 责任 |
|---|---|
| upstream/main | 上游镜像，用 `git fetch origin main:upstream/main` 快进，不放 Writer 提交 |
| product/writer | Writer 的产品线主干，默认分支，从 upstream/main 合并上游 |
| product/writer-* | 可选的短生命周期子分支，分别承载 domain、main、renderer 或测试 |

一份典型的一次性 remote 调整命令如下，只作为建议。本轮没有执行。

```bash
git remote rename origin upstream
git remote add origin <personal-fork-url>
git fetch --all --prune --tags
git branch --set-upstream-to=upstream/main main
```

如果暂时不使用个人 fork，可以保留当前 origin 为官方 remote，再增加 fork remote。关键点是名称和职责固定，脚本与文档不要把同一个 remote 同时当官方上游和个人推送目标。

product/writer 是长期产品线，固定使用 merge 同步上游，不用 rebase。rebase 会在每次同步时重放全部本地提交，同一处冲突要反复解决；merge 只需解决一次，且 `git rerere` 能记住解法。短生命周期的 product/writer-* 子分支在未共享前可以 rebase 到 product/writer。

## Writer 自有边界

这些目录承担大部分实现，正常同步时应与上游保持低耦合。

```text
src/shared/types/writer.ts
src/shared/utils/writerLore.ts
src/shared/ipc/schemas/writer.ts
src/shared/ipc/errors/writer.ts
src/main/features/writer/
src/main/ipc/handlers/writer.ts
src/renderer/features/writer/
src/renderer/routes/app/writer.tsx
src/renderer/i18n/locales/writer/
docs/writer/
```

主进程领域目录内包含 WriterStudioService、WriterProjectRepository、writerContext、writerProjectContext、writerPrompts、writerModelPolicy、writerGenerationJobHandler、writerContinuityReview 和 writerErrors。`writerProjectContext.ts` 是 preview 与 generation 共用的项目装载边界，`writerContext.ts` 保持纯 compiler；`writerContinuityReview.ts` 是不调用模型的 typed 检查器，portable report、coverage 与 waiver 仍由 Repository 保存。纯函数 `src/shared/utils/writerLore.ts` 由 main 与 renderer 共用，负责 lore 扫描文本、普通 key 匹配和稳定排序。renderer 通过 feature barrel 暴露 WriterPage，route 文件不应穿透到内部组件。Story Studio、Lorebook、Context Inspector 与 Continuity Review Dialog 留在 renderer feature 内，不能升到中央页面或通用 store。

## 降低冲突面的两条约定

**writer 翻译独立成包。** writer 的 key 全部放在 `src/renderer/i18n/locales/writer/*.json`，共享 catalog `locales/*.json` 与上游保持逐字节一致。resolver 加载语言包时合并两份 pack，仍是同一个扁平 namespace，调用点无需区分。`i18n-check`、`i18n-check-values`、`i18n-sync` 与 `i18n-check-unused` 均已识别该子目录，翻译仍受完整校验；`i18next.config.ts` 则排除 writer feature，避免 extract 把新 key 写回共享 catalog。新增 writer key 需手动写入 `locales/writer/en-us.json` 再运行 `pnpm i18n:sync`。

**改上游文件时不要整体缩进。** 用 `{cond && (<>...)}` 包住一段上游 JSX 会让它整体右移一级，产生大量无语义的缩进差异，上游每次改动该处都必然冲突。正确做法是把这段整体移到自有文件（如 `VendorAboutRows.tsx`、`VendorLoginButton.tsx`），上游文件里只留一处调用。判据是 `git diff -w` 与 `git diff` 结果应当一致；不一致就说明存在缩进噪音。

## 中央薄接入点

下面文件会随上游频繁变化。Writer 只保留小而机械的接入。

| 文件 | 允许的 Writer 改动 |
|---|---|
| src/main/core/application/serviceRegistry.ts | import 并注册 WriterStudioService |
| src/shared/ipc/schemas/ipcSchemas.ts | import writerRequestSchemas 并 spread 一次 |
| src/main/ipc/handlers/ipcHandlers.ts | import writerHandlers 并 spread 一次 |
| src/renderer/routes/app/writer.tsx | 创建 /app/writer route，只从 feature barrel 引入 |
| src/renderer/utils/sidebar.ts | 增加 writer app descriptor 与必要固定项 |
| src/renderer/components/app/sidebarIcons.tsx | 增加 writer 图标映射 |
| src/renderer/i18n/label.ts | 增加 writer 标题与侧栏 label key |
| src/renderer/utils/routeTitle.ts | 增加 /app/writer 标题映射 |
| src/renderer/pages/launchpad/LaunchpadPage.tsx | 增加 Writer 启动入口和图标 |
| src/renderer/windows/main/MainApp.tsx | 通过 TabsProvider.initialDefaultTab 把首次或空会话默认页设为 /app/writer |
| src/shared/data/cache/cacheSchemas.ts | 注册最近项目 rootPath、有界 recovery drafts 与 active job ids；这些值不属于作品 canonical |
| src/shared/data/cache/cacheValueTypes.ts | 只增加 Writer recovery draft 与 active job map 的值类型 |
| src/shared/data/preference/preferenceTypes.ts | 仅在上游侧栏类型要求时加入 writer 枚举 |

中央文件里不能出现 Writer 文件 IO、上下文算法、prompt、proposal apply 或 job payload 细节。MainApp 不能修改 TabsProvider 内部 DEFAULT_TAB，也不能覆盖已有持久 tab 会话。上游改变聚合方式时，改接入层去适配，领域目录保持不动。

## 上游热点禁区

首版默认禁止修改下面的上游热点。确有基座缺口时要先写独立 ADR，再把通用修复提交到单独 commit。

- src/main/core/job 与 src/main/core/scheduler
- src/main/data、现有 DataApi collection 和 Cherry 主 DB schema
- packages/aiCore 与 provider 实现
- src/preload
- chat、agents、knowledge 的领域 store 与页面
- 现有 Sidebar、Launchpad 或 TabRouter 的整份复制品
- migrations/sqlite-drizzle 下的已生成 SQL 和 meta
- src/shared/data/preference/preferenceSchemas.ts
- src/renderer/routeTree.gen.ts

Writer 通过现有 JobManager、AiService、typed IPC、cache 和导航契约接入。遇到上游 API 变化时，不能把旧版 JobManager、AiService 或路由器复制进 Writer 目录继续运行。

参考调研仓库也不能放进 Cherry production source、vendor、patches 或 package dependency。clean-room 证据保留在 docs/writer/research.md。

## 自动生成文件

### routeTree.gen.ts

src/renderer/routeTree.gen.ts 由 electron.vite.config.ts 中的 TanStack Router Vite 插件生成。源是 src/renderer/routes。仓库自己的 routes README 也明确要求勿手改。

增加或移动 route 文件后，运行 pnpm dev 或 pnpm build 让插件重新生成。冲突时采用下面的处理顺序。

1. 保留双方真实 route source。
2. 放弃对 routeTree.gen.ts 的手工合并。
3. 用当前依赖重新生成。
4. 检查生成 diff 只反映现存 route。
5. 再运行 web 类型检查与 renderer 测试。

生成文件里的 writer 节点消失通常表示 route 文件名、createFileRoute path 或插件没有运行，不能直接往生成文件补一段。

### Preference schema

src/shared/data/preference/preferenceSchemas.ts 的文件头写明它由 v2-refactor-temp/tools/data-classify/data/classification.json 生成。不要手改 interface 或 DefaultPreferences。

首版 Writer 没有 DB-backed preference。最近项目 rootPath、有界 recovery drafts 与 active job ids 使用 renderer persist cache，作品 canonical 仍留在项目目录。未来确需 Preference 时，先修改分类事实源，再运行下面的生成器，随后检查 preferenceSchemas、类型和迁移影响。

```bash
node v2-refactor-temp/tools/data-classify/scripts/generate-preferences.js
```

src/shared/data/preference/preferenceTypes.ts 是手写类型文件。对它的 Writer 改动只限现有 schema 或侧栏契约要求的类型，不要在其中藏作品状态。

### 数据库 migration

首版 Writer 不增加 Cherry 主数据库表，所以 migrations/sqlite-drizzle 应保持无 Writer diff。

未来若 ADR 明确选择 Cherry DB，先修改 src/main/data/db/schemas 中的源 schema，再运行下面命令。

```bash
pnpm db:migrations:generate
pnpm db:migrations:check
```

生成后要提交新追加的 SQL、meta snapshot 和 journal 变化。已经发布的 migration 不能修改、重排、重命名或删除。项目更推荐独立 writer DB 与独立迁移链，避免把作品 schema 带回这个热点。

## 每次同步步骤

### 同步前

先确认真实仓库和工作树。同步不能在混有未知未提交修改时开始。

```bash
pwd
git rev-parse --show-toplevel
git status --short --branch
git remote -v
git rev-parse HEAD
git diff --check
```

记录下面三项，便于同步后做 range-diff。

```bash
git merge-base product/writer upstream/main
git rev-parse product/writer
git rev-parse upstream/main
```

工作树不干净时，先把当前修改整理成可审 commit 或由原作者处理。不要用 reset、checkout 或自动 stash 覆盖用户修改。

### 更新纯净 main

```bash
git fetch upstream --prune --tags
git switch main
git merge --ff-only upstream/main
```

main 无法 fast-forward 表示它混入了本地提交。先审计提交来源，不能用 hard reset 处理。

### 重放 Writer 分支

本地未共享分支使用下面流程。

```bash
git switch product/writer
git rebase main
```

共享分支改用正常 merge。

```bash
git switch product/writer
git merge main
```

冲突按以下顺序处理。

1. 先处理 src/shared/types/writer.ts，确认旧 schemaVersion 1 文件仍能解析，再处理 WriterProjectRepository。
2. 随后处理 writerContinuityReview.ts 与测试，保持六类 rule、key、fingerprint、rule basis coverage 和 waiver 语义不变。
3. 再处理 src/shared/utils/writerLore.ts，确认 main 与 renderer 仍引用同一套确定性匹配规则。
4. 适配 typed IPC 与 JobManager、AiService 的新契约。continuity review 的五条 route 只依赖 WriterStudioService，不应接入 JobManager 或模型。
5. 随后处理 serviceRegistry、IPC 聚合、route、sidebar 和 launchpad 薄接入。
6. 最后重新生成 route tree、Preference schema 或 migration。

generated 文件不做 ours 或 theirs 长期保留。选择真实源文件后重新生成。

### 检查历史等价性

rebase 后使用同步前记录的 old base、old tip 和新 main 运行 range-diff。确认 Writer commit 的意图仍然存在，没有把上游修复意外带走。

```bash
git range-diff <old-base>..<old-tip> main..product/writer
git diff --stat main...product/writer
git diff --check
```

再检查热点范围。

```bash
git diff --name-only main...product/writer
git diff main...product/writer -- src/main/core src/main/data packages/aiCore src/preload
git diff main...product/writer -- migrations/sqlite-drizzle src/renderer/routeTree.gen.ts
```

第一条用于完整枚举，后两条要能解释每个 diff。首版 migrations 应为空，core diff 应只剩 serviceRegistry 的注册。

## 验证清单

### 生成与静态检查

- 使用仓库声明的 Node 24.11.1 和 pnpm 11.8.0，不能以当前 shell 恰好能运行替代版本核对。
- 运行 `pnpm typecheck:node`。
- 运行 `pnpm typecheck:web`。
- 运行 `pnpm format:check`。
- 运行 `pnpm docs:check`。
- routeTree.gen.ts 已由当前依赖生成，包含 /app/writer，且没有孤儿 route。
- `pnpm db:migrations:check` 通过，首版没有 Writer migration。
- preferenceSchemas.ts 没有手工 Writer diff。

### 定向测试

测试文件落位后至少覆盖这些范围。

```bash
pnpm vitest run --project main src/main/features/writer
pnpm vitest run --project main src/main/ipc/handlers
pnpm vitest run --project renderer src/renderer/features/writer
pnpm vitest run --project renderer src/renderer/pages/launchpad src/renderer/utils
pnpm test:shared
```

定向测试只能快速定位。合并或发布前还要运行 pnpm build 和与风险匹配的完整 main、renderer、shared 测试。

### 领域 smoke

- 新建项目后能看到 project.json、story-bible.json、outline.json、continuity.json、空的 continuity-review.json 和第一章。
- 关闭应用再打开，章节顺序、活动章节和 revision 一致。
- 手工保存携带正确 expectedRevision 成功，旧 revision 失败。
- story bible、outline、continuity 经 JSON editor 保存，语义 revision 冲突时保留本地草稿。
- Lorebook Dialog 通过 `writer.story_bible.save` 保存完整 Story Bible，stale documentRevision 时保留本地条目。
- 旧 schemaVersion 1 的 `story-bible.json` 没有 `loreEntries` 时仍可打开，解析结果为 `[]`，不要求目录迁移或 Cherry DB migration。
- 旧 schemaVersion 1 的 outline 与 continuity 没有 requirements、timelineEvents、characterStates、usedInChapterIds、dueChapterId 或 assessments 时仍可打开；旧 timeline 与 character state 缺少 timelineId 时归入 main。旧 continuity-review.json 缺少 coverageDeclarations 时默认为空；整个文件缺失时返回 missing revision 与 not_run，不要求 Cherry DB migration。
- lore 的普通 key aliases、alwaysActive、caseSensitive、matchWholeWords、enabled、order 与章计划序列化由 main 和 renderer 共享；renderer 使用 deferred value 做近实时预览，proposal receipt 才是最终运行真值。
- lore 扫描只读取有界的当前章、章计划和 instruction；ContextPacket 同时保存 included、dropped 与 truncated receipt。
- 生成 payload 与 ContextPacket 绑定三份 documentRevisions；入队后或生成后修改结构资料都会 fail closed。
- schema 合法但序列化超过项目 JSON 上限的 Story Bible 在替换旧文件前被拒绝。
- replace 或 append 的最终章节超过字符数或 UTF-8 字节上限时，在 journal、history 和正文写入前被拒绝。
- 外部章节即使未超过 4 MiB，只要超过字符合同，也会在目标章读取时拒绝且不会生成 history。
- ContextPacket 的 usedChars 包含 source 元数据与紧凑 JSON 框架；实际 source 数组除固定方括号外不超过 contextBudgetChars。
- 生成 job 能展示 pending、running 与 completed 或 failed。
- 显式 stale、disabled、external CLI 或非聊天模型在入队前返回 domain error。
- 小 contextWindow 会压低 ContextPacket 预算，instruction 耗尽安全空间时不入队。
- 取消模型调用后正史没有变化。
- proposal 保存 baseRevision、模型和 ContextPacket.sources。
- Job output 只含 proposalId，完整 proposal 通过 writer.proposal.read 从项目目录获取。
- replace 与 append 都先显示 diff。
- 接受 proposal 会保存 history 并产生 appliedRevision。
- Proposal Library 能在 Job DB GC 后从磁盘 list/read 提案。
- History Dialog 能 list/read 快照，restore 前保存当前正文的反向快照。
- applying journal 在 base 与 target 两种崩溃窗口都能恢复。
- 作者在生成后修改正文，旧 proposal 应用返回 conflict。
- 作者在生成后修改 Story Bible、outline 或 continuity，旧 proposal 应用返回 conflict。
- 进程在 proposal 落盘后退出，重启能幂等恢复 job。
- 复制整个项目目录到新路径后能打开，磁盘 proposal 与 history 可重新发现，未完成 job 不随目录迁移的边界有明确提示。
- 重开 Writer 后能恢复有界未保存草稿和 active job；显式关闭作品不会立刻自动重开。
- 生成按钮前能看到作品资料将发送给所选模型服务商的提示。
- 长篇 autosave 只读取四份小 JSON 与目标章，完整打开以 stat 校验全稿 inventory。

### Continuity review smoke

- `writer.continuity_review.read`、`run`、`waive`、`unwaive`、`coverage.update` 保持 typed input 与 output；中央 ipcSchemas 和 ipcHandlers 仍各只有一次 domain spread。
- timelineEvents 在同一 timelineId 内按章节 order 与唯一 sequence 检查 storyTime 回退；重复 sequence 槽位由 schema 拒绝。characterStates 在同一 timelineId 内检查同点位置与生死冲突，以及缺少 transitionExplanation 的 dead-to-alive。
- foreshadowing.dueChapterId 能产生逾期 finding，planted、due、resolved 的非法先后与 status 不一致作为不可豁免结构错误保留。
- fact.usedInChapterIds 早于 sourceChapterId 时产生 future_information；章节、人物、requirement 等悬空引用为不可豁免 error。
- chapter plan requirements 使用稳定 id；requirementAssessments 只有在 assessmentRevision 等于当前章节正文 revision 时有效，缺项、悬空或过期不能把 chapter_plan coverage 变成 checked。
- 同一 typed subject 重新审查时 finding key 稳定；evidence basis 变化时 fingerprint 改变，原 waiver 显示 stale_exemption。finding 消失后 waiver 进入 orphanedWaivers，unwaive 可以撤销。
- coverage.update 的 covered=true 保存当前 rule 的 basisFingerprint 与目标章，covered=false 撤销该 declaration。没有六类 coverageDeclarations、声明未覆盖目标章、basis 改变、存在 staleItems 或 report truncated 时，状态只能是 incomplete 或 stale，不能 false green。只有 report 当前、无 active findings 且六类 coverage 全 checked 时才是 clear。
- run、waive、unwaive、coverage.update 使用 continuity-review.json 自己的 expectedRevision；stale 请求不覆盖新 sidecar。review revision 不加入 WriterProject.documentRevisions，也不影响正史 revision。
- review read/run/mutation 会读取目标章与含 assessments 的章节真实 Markdown revision；外部正文编辑不能沿用旧 report 或旧 assessment。审查输入超过 100,000 observations 时 fail closed，evidence/entity/chapter 证据裁剪会把 report 标为 truncated。
- Memory Summary 能懒加载 Continuity Review Dialog；UI 展示五类聚合状态、六类 coverage、严重度和 finding 状态筛选、stale exemption 与 orphaned waiver。stale report 禁止新增 waiver 和标记 covered，revoke 与 unwaive 仍可恢复作者控制。
- AI 对动机、文风、正文计划完成度或自然语言事实的判断仍产生带 evidence 与 documentRevisions 的 proposal，不能直接写 continuity 或 waiver。

### 安全检查

- 点点路径、绝对章节文件名和 symlink 逃逸被拒绝。
- 未知 schemaVersion、超大 JSON 和损坏 proposal fail closed。
- 模型输出不能执行 HTML、脚本或工具调用。
- ContextPacket 和日志不含 API key。
- 数千条短规则不能靠 label、kind 或 JSON framing 绕过 ContextPacket 预算。
- lore 内容仍作为不可信 PROJECT_DATA_JSON 进入模型，没有工具权限，也不能覆盖 hard rules。
- Lorebook v1 没有执行用户正则、递归激活、sticky、cooldown、概率或向量检索。
- JobManager payload 不含完整正文或 story bible，完成 output 不含完整 proposal 或 ContextPacket。
- proposal/history 的 list/read/restore 拒绝路径穿越、symlink、跨项目身份和超出扫描上限的目录。
- continuity-review.json 必须是项目内固定 regular file，严格 schema 与写入上限生效；硬引用、伏笔结构矛盾与过期 plan assessment 不能被 waive。

### 上游兼容性检查

- Writer 调模型仍经 AiService，没有直接 provider import。
- Writer job 仍由业务服务注册，renderer 没有直接 JobManager 调用。
- renderer route 只从 feature barrel 引入。
- 中央接入点没有出现 Writer 算法。
- `loreEntries` 仍属于 Story Bible schema 与作品目录事实，没有新增中央 store、Preference key 或 migration。
- continuity-review.json 仍是 portable sidecar，没有新增 Cherry 主表、Preference key 或 migration；新增 continuity 与 outline 字段保持 schemaVersion 1 可选兼容。
- continuity review 仍是 writer feature 内的确定性纯计算与 Repository IO，没有把算法塞进中央 IPC 聚合、JobManager 或 provider 层。
- 扩展调研仓库只保留在 `/Users/haobin/Code/personal/writer/references/ai-novel-projects-expanded/`，不得移动到 Cherry production source、vendor 或 package dependency。SillyTavern 的 AGPL 源码只能作为 clean-room 行为证据。
- 上游新增 Sidebar、Launchpad、Preference 或 migration 变更已逐项人工复核。

## 同步完成记录模板

每次同步在 PR 或维护记录中留下这些值。

| 字段 | 内容 |
|---|---|
| 同步前 Writer tip | 完整 SHA |
| 旧 upstream base | 完整 SHA |
| 新 upstream main | 完整 SHA |
| rebase 或 merge | 所用策略 |
| 冲突文件 | 完整列表 |
| generated 文件 | 重生成命令与 diff |
| migration | 无，或新 migration 名称 |
| 测试 | 命令、通过数和失败数 |
| smoke | 实际走过的项目路径与结果 |
| 已知限制 | 未验证项和原因 |

“能够编译”不能单独作为同步完成。作品目录、revision gate、proposal 不直写、JobManager 恢复和 UI diff 需要分别验证。
