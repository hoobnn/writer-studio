<div align="center">

**简体中文** | [English](README.en.md)

# ✍️ Writer Studio

**一个本地优先的长篇小说写作工作区，基于 [Cherry Studio](https://github.com/CherryHQ/cherry-studio) 构建。**

正文、故事圣经与修订历史都以普通文件保存在你自己的磁盘上。
模型看到的每一段上下文，你都可以事先查看。

</div>

> [!NOTE]
> 本仓库是 [Cherry Studio](https://github.com/CherryHQ/cherry-studio) 的**修改版分支**，
> **与 CherryHQ 无隶属关系，也未获其背书**。它新增了 Writer Studio 工作区并更换了品牌标识；
> 上游的厂商服务、数据分析与自动更新均已关闭。
> 依据上游项目继承 **AGPL-3.0** 授权。

## 为什么做这个

长篇小说写作会打破多数对话式界面的设计前提。有五类问题反复出现：

1. 正文、故事圣经、大纲与连续性记录会随着稿件增长逐渐分叉。
2. 你无从得知模型实际看到了什么，也不知道关键设定为何被遗漏。
3. AI 的输出会覆盖你的文字，过期的建议还可能被套用到已经改动过的正文上。
4. 创作资料被平台锁定，更换工具或另起一条故事线的成本很高。
5. 功能越加越多，真正用来码字的空间反而被压缩。

Writer Studio 直接针对这些问题，而不是再加一个聊天窗口。

## 它做什么

**可移植的作品目录。** 一本书就是磁盘上的一个文件夹。manifest、故事圣经、大纲、连续性记录、
正文、提案与历史快照，全部是你可以直接阅读、备份、diff 或迁移到另一台机器的纯 JSON 与文本。
作品的任何部分都不会只存在于应用数据库里。

**AI 只提案，绝不直接覆写。** 生成过程永远先产出一份*提案*。在任何内容被应用之前，你会看到它
用了哪些来源、生成结果预览，以及与你正文的行级 diff。只有被应用的提案才会推进正史——而且每种
操作都有严格的写入目标：草稿与改写只能替换，续写只能追加，分析类提案完全不能改动正文。

**可以查看确切的上下文。** 生成前可以预览将要发送的确切正文与故事数据，包含逐来源的预算占用、
截断回执，以及哪些 lorebook 条目被激活。模型收到了什么，不用猜。

**修订门禁。** 正文与每份结构化文档各自带有内容修订标识。基于旧稿生成的提案会被拒绝，
而不是静默地覆盖你更新过的文字。

**确定性连续性检查。** 由类型化检查器（而非模型）给出连续性问题、覆盖范围与作者豁免记录，
结果与作品保存在一起，可随作品迁移。

**历史与恢复。** 章节在写作过程中自动生成快照，支持列出、读取与恢复；恢复前会先为当前正文
反向生成一份快照。未保存的草稿与进行中的生成任务在重启后仍可恢复。

**不碍事的工作区。** 章节栏与 Copilot 栏均可折叠，专注模式可一键收起两侧，退出时恢复原有布局。

## 基于 Cherry Studio

上游项目提供的能力全部保留——一个成熟的桌面 AI 客户端，支持广泛的服务商（OpenAI、Anthropic、
Gemini，以及通过 Ollama 和 LM Studio 运行的本地模型）、MCP 服务、知识库、文档处理与翻译。
Writer Studio 是在这个基座之上增加写作工作区，而不是重新造一遍。

## 开发

```bash
pnpm install
pnpm dev
```

| 命令 | 用途 |
| --- | --- |
| `pnpm lint` | 格式化、lint、类型检查与 i18n 校验 |
| `pnpm test` | 完整测试套件 |
| `pnpm build:check` | 完整门禁：lint + docs + 测试 |

设计说明与架构决策见 [`docs/writer/`](docs/writer/)：

- [架构决策](docs/writer/architecture.md) — 可移植作品目录、提案门禁、上下文装配
- [上游同步](docs/writer/upstream-sync.md) — 分支布局与从 Cherry Studio 合并变更的方式
- [产品对照](docs/writer/product-benchmark.md) — 与其他 AI 写作工具的对比

## 参与贡献

欢迎提交 issue 与 pull request。开发面向 `product/writer` 分支。

Cherry Studio 自身的缺陷请提交到
[上游仓库](https://github.com/CherryHQ/cherry-studio/issues)，而不是这里。

## 致谢

Writer Studio 得以存在，完全建立在 [**Cherry Studio**](https://github.com/CherryHQ/cherry-studio)
及[其贡献者](https://github.com/CherryHQ/cherry-studio/graphs/contributors)的工作之上。

上游项目提供了这个项目所依赖的全部基座：Electron 应用外壳、AI 服务商接入层、数据与 IPC 架构、
组件库，以及多年积累的工程实现。本分支只改动了其中很小一部分，其余全部继承自上游。
在此向 CherryHQ 团队以及每一位为之贡献过的人致以诚挚的谢意。

如果你需要的是一个通用的 AI 桌面客户端，请直接使用
[Cherry Studio](https://github.com/CherryHQ/cherry-studio)——那是更好的选择，
而且由一支真正的团队在持续维护。

## 许可证

[AGPL-3.0](LICENSE)，继承自 Cherry Studio。

作为衍生作品，本项目以相同条款分发。如果你分发修改后的版本，或将其作为网络服务运行，
必须依据 AGPL-3.0 提供对应的源码。

上游项目提供可豁免 AGPL-3.0 要求的商业授权；该授权是你与 CherryHQ（bd@cherry-ai.com）
之间的约定，**不延伸至本分支**。
