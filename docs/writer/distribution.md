---
description: Writer Studio downstream identity, macOS signing, notarization, and release verification
sources:
  - electron-builder.writer.ts
  - src/shared/utils/distribution.ts
  - src/main/core/paths/constants.ts
  - src/main/services/AnalyticsService.ts
  - src/main/services/AppUpdaterService.ts
  - src/main/services/protocol/ProtocolService.ts
---

# Writer Studio 发行与打包

## 稳定身份

Writer Studio 使用独立于 Cherry Studio 的操作系统身份。首个下游版本为 `0.1.0`，其代码基线仍由上游 Cherry 版本单独记录。

| 项目 | 值 |
|---|---|
| 产品名 | `Writer Studio` |
| 包内名称 | `WriterStudio` |
| Bundle ID | `com.haobin.writerstudio` |
| URL Scheme | `writerstudio` |
| 全局目录 | `~/.writerstudio` |
| 构建输出 | `dist/writer-studio` |

Bundle ID、URL Scheme 和数据目录从首版起保持稳定。以后调整市场名称时只改显示层，不能让已有安装变成另一款应用或静默切换数据目录。

发行配置位于 `electron-builder.writer.ts`。它继承上游 `electron-builder.yml`，只覆盖下游身份、版本、图标、输出目录和发布安全项。普通数组在 electron-builder 的继承规则中会合并，所以单协议使用合法的对象写法覆盖上游协议数组；Mac targets 由命令行显式指定。

当前 electron-builder 版本同时并发生成 ZIP 与 DMG 时会让两个 target 操作同一个应用目录。Writer 脚本先完成签名、公证与 ZIP，再以同一份 prepackaged app 顺序生成 DMG。两个容器中的应用都必须分别执行 `codesign --verify`，不能只检查展开目录。

## 隔离边界

首版强制关闭 Cherry 官方更新、发布历史、统计和上游反馈上传。接收 Cherry 上游代码通过 Git 同步完成，不能让终端用户安装包连接官方更新源。

`cherrystudio://` 与官方应用存在处理器冲突，因此 Writer 只注册 `writerstudio://`。CherryIN 和 PPIO 的官方 OAuth Client 尚未登记这个回调地址，相关快捷登录在下游发行版中隐藏；用户仍可使用手工 API Key。取得独立 OAuth Client 后，先增加回调集成测试，再重新开放入口。

内部包名 `@cherrystudio/*`、数据库文件 `cherrystudio.sqlite`、`cherry-media://` 和旧备份格式标识属于上游兼容边界，不做全局替换。

## 本地构建

仓库要求 Node `24.11.1` 和 pnpm `11.8.0`。

```bash
cd /Users/haobin/Code/personal/writer/cherry-studio
nvm use 24.11.1
pnpm install --frozen-lockfile
pnpm build:writer:mac:arm64
```

构建脚本启用 `forceCodeSigning`，找不到有效 Developer ID 时必须失败，不能静默产出未签名安装包。下游签名钩子把 `CSC_NAME` 的证书指纹直接交给 Apple 签名工具，避免钥匙串中存在两张同名 Developer ID 时产生歧义。签名身份通过进程环境选择，不写入仓库。

```bash
CSC_NAME=187F48A48AE85277B9F8B25BBD17C03488637DC9 \
  pnpm build:writer:mac:arm64
```

## Apple 公证

推荐把公证凭据保存到本机钥匙串，不在 `.env`、命令历史、日志或仓库中保存密码。

```bash
xcrun notarytool store-credentials writer-studio-notary \
  --apple-id "你的 Apple ID" \
  --team-id "8FUPL8QHFH"
```

命令会安全提示输入 App 专用密码。随后构建时只传钥匙串 profile 名称。

```bash
APPLE_KEYCHAIN_PROFILE=writer-studio-notary \
CSC_NAME=187F48A48AE85277B9F8B25BBD17C03488637DC9 \
  pnpm build:writer:mac:arm64
```

electron-builder 的内建公证流程会提交 `.app`、等待 Apple 结果并装订票据。私钥、`.p12`、Apple ID 密码和 App 专用密码都不能提交到 Git。

## 产物验证

预期产物如下。

```text
dist/writer-studio/Writer-Studio-0.1.0-arm64.dmg
dist/writer-studio/Writer-Studio-0.1.0-arm64.zip
dist/writer-studio/mac-arm64/Writer Studio.app
```

每次发布至少执行下面的检查。

```bash
codesign --verify --deep --strict --verbose=2 \
  "dist/writer-studio/mac-arm64/Writer Studio.app"

spctl --assess --type execute -vv \
  "dist/writer-studio/mac-arm64/Writer Studio.app"

xcrun stapler validate \
  "dist/writer-studio/mac-arm64/Writer Studio.app"
```

还要检查 `Info.plist` 中的 Bundle ID、显示名、版本和 `writerstudio` 协议，确认包内没有 `app-update.yml`，并从 DMG 完成一次真实拖拽安装与首次启动。
