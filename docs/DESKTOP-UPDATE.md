# Local Service Hub 在线更新

Local Service Hub 使用 GitHub Releases 作为发布源，使用自定义更新器完成 macOS App 的检查、下载、校验、替换和失败回滚。

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
Local-Service-Hub-X.Y.Z-arm64.zip
Local-Service-Hub-X.Y.Z-arm64.dmg
latest.json
```

`latest.json` 包含：

- version
- tag
- 发布时间
- Release 地址
- Release notes
- 每个架构 ZIP / DMG 的下载 URL
- 每个文件的 SHA256

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

打包后的 App 使用 Electron 网络栈检查更新和下载 ZIP，遵循 macOS 系统代理配置（包括本机代理端口，例如 `127.0.0.1:7890`），不写死代理地址。终端设置 `http_proxy` / `https_proxy` 不能代替 App 的系统代理配置。

元数据请求的总超时为 15 秒，ZIP 下载的总超时为 10 分钟，超时会中断请求并清理未完成的下载。HTTPS、重定向主机限制和 SHA256 校验仍然生效。

GitHub API 返回 403 / 429 时，尝试公开的 `releases/latest/download/latest.json`，不需要 Token。后备路径只接受严格的 `desktop-vX.Y.Z` 标签，且元数据版本和资产下载路径必须与该标签一致。如果其他发布通道占用了 latest，检查会明确失败，不会安装其他通道的版本。发布工作流必须保持正式 Desktop Release 为 latest。

最初的 `desktop-v2.0.0` 使用 Node HTTPS，不支持自动读取系统代理；依赖系统代理的用户需手动安装修复后的版本一次，才能继续在线更新。已发布的 `desktop-v2.0.0` 标签和安装包不覆盖。

`desktop-v2.0.1` 已修复网络访问，但真实安装测试发现替换脚本生成时存在 `TARGET_APP is not defined` 错误；下载和校验成功后会安全报错，不替换旧 App。`2.0.0` / `2.0.1` 用户应手动安装 `2.0.2` 或后续版本一次。不要依赖旧版本自行修复更新器，也不要覆盖已发布的标签。

## 增量更新（delta）

从 `desktop-v2.0.3` 起，Release 会为每个架构额外生成增量包 `Local-Service-Hub-X.Y.Z-<arch>-delta.zip`，只包含应用代码层 `Contents/Resources/app`（约 5 MB）和新的 `Contents/Info.plist`，不包含 Electron 运行时（约 230 MB）。

增量包的启用条件（任一不满足即自动回退全量 ZIP）：

1. `latest.json` 的 `deltas` 中存在当前架构的条目。
2. 条目的 `electronVersion` 与当前 App 的 Electron 运行时版本完全一致。
3. URL / SHA256 / bytes 校验全部通过。

安装时 helper 会先克隆当前安装包（APFS clonefile，近似瞬时），再替换其中的 `Contents/Resources/app` 并更新 `Info.plist`。旧版更新器忽略 `deltas` 字段，行为不变；Electron 升级只能走全量 ZIP。

## Live2D 模型层

`frontend/public/live2d`（约 300 MB）不再打进安装包（`package.json` 的 `build.files` 排除），仅保留在仓库与开发模式中。生产包内 waifu 功能依赖 `waifu.enabled` 配置开启，模型缺失时插件激活会失败并被优雅忽略，面板其余功能不受影响。

过渡安排：

- `desktop-v2.0.4`：模型层移出安装包的第一个版本，只发布全量包（体积同步大幅缩小）。禁用增量是因为 `2.0.3` 安装的更新器在增量安装时会把模型层从旧包恢复回来。
- `desktop-v2.0.5` 起：恢复增量发布。此前安装包含模型层的客户端直接全量更新一次即可移除模型。

## 安全下载

更新器：

- 只使用 HTTPS。
- Release 元数据来自 GitHub API。
- 只识别 `desktop-v*` 正式 Release，忽略 draft / prerelease。
- Release asset URL 必须位于当前仓库的 GitHub Release 下载路径。
- 下载重定向只允许 GitHub / GitHub release assets 域名。
- ZIP 下载过程中流式计算 SHA256。
- SHA256 必须与 `latest.json` 完全一致。
- 解压后必须存在 `Local Service Hub.app`。
- `CFBundleShortVersionString` 必须等于 Release 版本。

任一校验失败都不会替换当前 App。

## 安装与回滚

下载和校验成功后：

```text
新版本 ZIP
↓
~/.metersphere-control-panel/updates/<version>-<arch>/
↓
解压并校验 Local Service Hub.app
↓
启动外部 install-update.sh helper
↓
当前 App 调用 app.quit()
↓
沿用 Electron before-quit 的优雅清理
↓
等待旧进程退出
↓
新 App 复制为 Local Service Hub.app.new
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

先确保处于 Desktop 分支：

```bash
git checkout desktop
git pull origin desktop
```

正式 Release 必须先把 App 图标提交到仓库：

```text
build/icon.icns
```

例如发布 `2.0.1`：

```bash
npm run desktop:version -- 2.0.1
npm run verify:desktop

git add package.json package-lock.json frontend/package.json frontend/package-lock.json
git commit -m "chore(desktop): release v2.0.1"
git tag desktop-v2.0.1
git push origin desktop desktop-v2.0.1
```

GitHub Actions 随后自动创建：

```text
Local Service Hub v2.0.1
```

并上传 x64 / arm64 的 ZIP、DMG 和 `latest.json`。

工作流会强制检查：

```text
desktop-v2.0.1
        ==
package.json version 2.0.1
```

不一致时直接停止发布。

## 首次启用更新

当前 App 版本为 `2.0.0` 时，可以先发布：

```text
desktop-v2.0.0
```

作为更新源基线；2.0.0 客户端不会提示更新。

随后发布 `2.0.1`：

```bash
npm run desktop:version -- 2.0.1
# commit + tag + push
```

已安装的 2.0.0 会在下一次检查时看到 2.0.1，并出现：

```text
更新到 v2.0.1
```

## 当前限制

这是自用版 updater，当前不依赖 Apple Developer ID / notarization。

如果后续需要分发给其他 Mac 用户，建议增加：

- Developer ID Application 签名
- Apple notarization
- 签名验证

届时也可以评估迁移到 `electron-updater`；当前 GitHub Release、版本和资产命名规则可以继续沿用。
