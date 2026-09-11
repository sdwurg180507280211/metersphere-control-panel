# Local Service Hub 在线更新

Local Service Hub 使用 GitHub Releases 作为发布源，通过自定义更新器完成 macOS App 的检查、下载、校验、替换和失败回滚。

## 更新源

仓库：

```text
sdwurg180507280211/metersphere-control-panel
```

Desktop Release 标签固定使用：

```text
desktop-vX.Y.Z
```

应用只识别 `desktop-v*`，不会把仓库中的其他 Release 当作 Desktop 更新。

## Release 资产

推送 Desktop tag 后，`.github/workflows/desktop-release.yml` 自动构建：

```text
Local-Service-Hub-X.Y.Z-x64.zip
Local-Service-Hub-X.Y.Z-x64.dmg
Local-Service-Hub-X.Y.Z-x64-delta.zip
Local-Service-Hub-X.Y.Z-arm64.zip
Local-Service-Hub-X.Y.Z-arm64.dmg
Local-Service-Hub-X.Y.Z-arm64-delta.zip
latest.json
```

`latest.json` 包含：

- version
- tag
- 发布时间
- Release 地址
- Release notes
- 每个架构 ZIP / DMG 的下载 URL、文件大小和 SHA256
- 每个架构 delta ZIP 的下载 URL、文件大小、SHA256 和 Electron 版本

App 在线更新只使用当前 CPU 架构对应的 ZIP；DMG 保留给手动安装。

## App 内检查

打包后的 Local Service Hub：

1. 启动约 1.5 秒后静默检查一次。
2. 运行期间每 6 小时静默检查一次。
3. 底部显示当前版本。
4. 有新版本时显示 `更新到 vX.Y.Z`。
5. 没有新版本时显示 `已是最新`，也可以手动再次检查。

开发模式不会执行在线安装。

### 系统代理

打包后的 App 使用 Electron 网络栈检查更新和下载 ZIP，遵循 macOS 系统代理配置，不写死代理地址。终端设置 `http_proxy` / `https_proxy` 不能代替 App 的系统代理配置。

元数据请求总超时为 15 秒，ZIP 下载总超时为 10 分钟，超时会中断请求并清理未完成的下载。HTTPS、重定向主机限制和 SHA256 校验仍然生效。

GitHub API 返回 403 / 429 时，更新器会尝试公开的 `releases/latest/download/latest.json`。后备路径只接受严格的 `desktop-vX.Y.Z` 标签，且元数据版本和资产下载路径必须与该标签一致。

历史说明：

- `desktop-v2.0.0` 使用 Node HTTPS，不支持自动读取 macOS 系统代理；依赖系统代理的用户需手动安装修复版一次。
- `desktop-v2.0.1` 修复网络访问后，真实安装测试发现替换脚本变量缺陷；`2.0.0` / `2.0.1` 用户应手动安装 `2.0.2` 或后续版本一次。
- 已发布的历史标签和安装包不覆盖。

## 增量更新（delta）

从 `desktop-v2.0.3` 起，Release 会为每个架构额外生成 delta ZIP。它只包含：

```text
Contents/Info.plist
Contents/Resources/app
```

不包含 Electron Framework。日常业务代码更新通常只有几 MB。

增量包启用条件（任一不满足即自动回退全量 ZIP）：

1. `latest.json` 的 `deltas` 中存在当前架构条目。
2. 条目的 `electronVersion` 与当前 App 的 Electron 运行时版本完全一致。
3. URL / SHA256 / bytes 校验全部通过。

安装时 helper 会先克隆当前 App，以保留 Electron Runtime，然后**完整删除旧的 `Contents/Resources/app` 并写入新版应用层**，最后更新 `Info.plist`。因此新版已经删除的业务资源不会从旧 App 恢复回来。

Electron 版本变化时不能使用 delta，会自动下载 full ZIP。

## 安全下载

更新器：

- 只使用 HTTPS。
- Release 元数据来自 GitHub API。
- 只识别 `desktop-v*` 正式 Release，忽略 draft / prerelease。
- Release asset URL 必须位于当前仓库的 GitHub Release 下载路径。
- 下载重定向只允许 GitHub / GitHub release assets 域名。
- ZIP 下载过程中流式计算 SHA256。
- SHA256 必须与 `latest.json` 完全一致。
- 全量 ZIP 解压后必须存在 `Local Service Hub.app`。
- delta 必须包含 `Contents/Info.plist` 和 `Contents/Resources/app/package.json`。
- `CFBundleShortVersionString` 和应用清单版本必须等于 Release 版本。

任一校验失败都不会替换当前 App。

## 安装与回滚

下载和校验成功后：

```text
新版本 ZIP / delta ZIP
↓
~/.metersphere-control-panel/updates/<version>-<arch>/
↓
解压并校验
↓
启动外部 install-update.sh helper
↓
当前 App 调用 app.quit()
↓
等待旧进程退出
↓
准备 Local Service Hub.app.new
↓
当前 App → Local Service Hub.app.previous
↓
.new → 正式 Local Service Hub.app
↓
启动新版本
↓
确认新进程持续运行
↓
成功：删除 .previous
失败：恢复 .previous 并重新打开旧版本
```

在线更新不会删除：

```text
~/.metersphere-control-panel/config.json
~/.metersphere-control-panel/window-state.json
```

因此服务配置和窗口状态不会因为 App 更新丢失。

## 发布一个新版本

先确保处于 Desktop 分支并同步最新代码：

```bash
git checkout desktop
git pull origin desktop
```

正式 Release 必须包含：

```text
build/icon.icns
```

例如发布 `2.0.8`：

```bash
npm run desktop:version -- 2.0.8
npm run verify:desktop
npm test -- --runInBand backend/__tests__/desktopUpdateService.test.js backend/__tests__/desktopHardening.test.js backend/__tests__/electronRuntimePolicy.test.js

git add package.json package-lock.json frontend/package.json frontend/package-lock.json
git commit -m "chore(desktop): release v2.0.8"
git tag desktop-v2.0.8
git push origin desktop desktop-v2.0.8
```

GitHub Actions 会生成 x64 / arm64 的 ZIP、DMG、delta ZIP 和 `latest.json`。

工作流会强制检查：

```text
desktop-v2.0.8
        ==
package.json version 2.0.8
```

并验证两个架构的 App 都使用 `package.json` 中固定的 Electron Runtime。

## 当前限制

这是自用版 updater，当前不依赖 Apple Developer ID / notarization。

如果后续需要分发给其他 Mac 用户，建议增加：

- Developer ID Application 签名
- Apple notarization
- 签名验证

届时也可以评估迁移到 `electron-updater`；当前 GitHub Release、版本和资产命名规则可以继续沿用。
