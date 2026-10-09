<div align="center">

**简体中文** | [English](README.en.md)

# Writer Studio

**本地优先的长篇小说写作工具，基于 [Cherry Studio](https://github.com/CherryHQ/cherry-studio) 修改而来。**

正文、故事圣经和修订历史都是你硬盘上的普通文件。
每次发给模型的上下文，发之前都能看到。

</div>

> [!NOTE]
> 这是 [Cherry Studio](https://github.com/CherryHQ/cherry-studio) 的**修改版**，
> **与 CherryHQ 没有隶属关系，也没有得到其认可**。我在上面加了 Writer Studio 写作区，换了名字和图标，
> 关掉了上游的厂商服务、数据统计和自动更新。许可证沿用上游的 **AGPL-3.0**。

## 为什么做这个

我用 AI 写长篇时，稿子一长就开始出问题：正文和设定、大纲对不上；不知道模型这次到底看了哪些
内容，关键设定为什么没带上；AI 的输出把我改过的段落又盖回去。聊天窗口适合问答，不太适合管一部
几十万字的稿子。所以我在 Cherry Studio 上做了一个专门写小说的工作区。

## 功能

### 作品就是一个文件夹

一本书对应硬盘上的一个目录。manifest、故事圣经、大纲、连续性记录、正文、提案和历史快照，
都是可以直接打开看的 JSON 和文本，能备份、能 diff、能拷到另一台电脑。作品内容不会只存在应用的
数据库里。

### AI 的输出先变成提案

生成结果不会直接写进正文，而是先变成一份提案。应用之前，你能看到它用了哪些资料、生成了什么、
和正文逐行的 diff。只有应用过的提案才会改动正文，而且每种操作能改的范围是固定的：起草和改写
可以替换，续写只能往后加，分析类提案不能动正文。

### 发给模型的内容可以先看

生成前可以预览这次要发送的正文和设定，包括每个来源占了多少预算、哪些内容被截断、哪些
lorebook 条目被触发。

### 基于旧版本的提案会被拒绝

正文和每份结构化文档都带有修订号。如果提案是基于旧版本生成的，应用时会被拒绝，不会悄悄覆盖
你后来改过的文字。

### 连续性检查用代码做

连续性问题、覆盖范围和作者豁免由类型化的检查器给出，不靠模型判断。检查结果与作品保存在一起，
随作品一起迁移。

### 历史快照

写作过程中会自动给章节打快照，可以查看和恢复；恢复之前会先给当前正文再存一份。没保存的草稿和
正在跑的生成任务，重启之后还在。

### 界面

章节栏和 Copilot 栏都可以收起；专注模式会同时收起两侧，退出后恢复原来的布局。

## 和 Cherry Studio 的关系

Cherry Studio 原有的功能都还在：多家模型服务（OpenAI、Anthropic、Gemini，以及通过 Ollama、
LM Studio 跑的本地模型）、MCP、知识库、文档处理和翻译。Writer Studio 只是在它上面加了写作区。

## 开发

```bash
pnpm install
pnpm dev
```

| 命令 | 用途 |
| --- | --- |
| `pnpm lint` | 格式化、lint、类型检查与 i18n 校验 |
| `pnpm test` | 完整测试 |
| `pnpm build:check` | 完整门禁：lint + 文档 + 测试 |

设计说明和架构决策在 [`docs/writer/`](docs/writer/)：

- [架构决策](docs/writer/architecture.md)：作品目录、提案门禁、上下文装配
- [上游同步](docs/writer/upstream-sync.md)：分支布局，以及怎么合并 Cherry Studio 的更新
- [产品对照](docs/writer/product-benchmark.md)：和其他 AI 写作工具的对比

## 参与贡献

欢迎提 issue 和 pull request，开发分支是 `product/writer`。

Cherry Studio 本身的 bug 请提到[上游仓库](https://github.com/CherryHQ/cherry-studio/issues)。

## 致谢

这个项目整个建立在 [Cherry Studio](https://github.com/CherryHQ/cherry-studio) 和
[它的贡献者们](https://github.com/CherryHQ/cherry-studio/graphs/contributors)的工作之上。

Electron 外壳、模型服务接入、数据与 IPC 架构、组件库，都来自上游多年的积累，我只改了其中很小
一部分。感谢 CherryHQ 团队和每一位贡献者。

如果你要的是一个通用的 AI 桌面客户端，直接用 [Cherry Studio](https://github.com/CherryHQ/cherry-studio)
更合适，它有一个完整的团队在维护。

## 许可证

[AGPL-3.0](LICENSE)，沿用 Cherry Studio 的许可。

作为衍生作品，本项目按相同条款分发。如果你分发修改后的版本，或者把它作为网络服务运行，需要按
AGPL-3.0 提供对应的源代码。

上游提供可免除 AGPL-3.0 要求的商业授权，需直接联系 CherryHQ（bd@cherry-ai.com），
该授权不适用于本分支。
