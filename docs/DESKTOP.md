# Desktop / Local Service Hub

`desktop` 分支把现有 MeterSphere 控制面板扩展成正式的 macOS 本地服务快捷控制中心。

## 定位

Local Service Hub 只管理本地服务，不显示 MeterSphere 的 Eureka、Gateway、Project Management 等服务卡片。

- Local Service Hub：本地服务快捷启动 / 关闭
- 完整控制面板：继续保留原有 MeterSphere 服务管理与其他功能
- `打开完整控制面板`：从 Local Service Hub 进入原完整页面

## macOS App 窗口

Local Service Hub 使用标准 macOS 桌面窗口，不再使用右上角悬浮小窗。

- 默认窗口：`920 × 680`
- 最小窗口：`760 × 540`
- 使用标准 macOS 标题栏和红黄绿窗口按钮
- 支持正常拖动、缩放、最小化和全屏
- 不再 `alwaysOnTop`
- 不再使用 `PIN`
- 使用浅色 macOS 风格界面
- 正常显示在 Dock
- 使用单实例锁；重复双击 App 只会唤醒已有窗口
- 自动记住上次窗口尺寸、位置和最大化状态

窗口状态保存在：

```text
~/.metersphere-control-panel/window-state.json
```

窗口关闭后，macOS 上应用进程仍保持运行；点击 Dock 图标或顶部菜单栏 Local Service Hub 图标可以重新打开窗口。顶部菜单栏图标是辅助入口，不是应用未启动时的启动器。

安装后的日常启动方式是：

```text
应用程序 / Launchpad / Dock
        ↓
Local Service Hub.app
        ↓
双击或单击启动
        ↓
内置 backend 自动启动
        ↓
打开 Local Service Hub 窗口
```

不需要运行 `npm run dev`、`node backend/server.js` 或其他终端命令。

## 本地服务模型

每个本地服务只需要四个字段：

1. 服务名称
2. 启动命令
3. 关闭命令
4. 状态端口（可选）

配置保存在：

```text
~/.metersphere-control-panel/config.json
```

配置结构：

```json
{
  "desktopApplications": {
    "deepseek-harness": {
      "name": "DeepSeek Harness",
      "startCommand": "cd /Users/edy/ideaProjects/deepseek-harness\nnohup npm run dsh -- web > /tmp/dsh-web.log 2>&1 &",
      "stopCommand": "dsh_pid=$(lsof -tiTCP:3080 -sTCP:LISTEN)\nif [ -n \"$dsh_pid\" ]; then\n  kill -TERM $dsh_pid\nfi",
      "statusPort": 3080
    }
  }
}
```

应用 ID 由后端根据服务名称生成，配置界面不要求用户填写。

## 命令执行

启动和关闭 API 都只接收服务 ID，不允许请求临时携带一条命令直接执行。

执行流程：

```text
配置界面保存命令
        ↓
写入 config.json
        ↓
点击“启动”或“关闭”
        ↓
后端按服务 ID 读取已保存命令
        ↓
本机 shell 执行
```

macOS 上命令通过登录 shell 语义执行，因此可以直接使用：

- `cd`
- 多行命令
- `nohup`
- `>` / `2>&1`
- `&`
- shell 变量
- `if ... then ... fi`

### DeepSeek Harness 启动

```bash
cd /Users/edy/ideaProjects/deepseek-harness
nohup npm run dsh -- web > /tmp/dsh-web.log 2>&1 &
```

### DeepSeek Harness 关闭

```bash
dsh_pid=$(lsof -tiTCP:3080 -sTCP:LISTEN)

if [ -n "$dsh_pid" ]; then
  kill -TERM $dsh_pid
fi
```

Local Service Hub 不会自动替换 `SIGTERM` 为 `SIGKILL`。如果某个服务需要强制关闭，应由该服务自己的关闭命令明确配置。

## 状态检测

`statusPort` 是可选字段，只用于判断 UI 状态，不参与生成或修改启动/关闭命令。

例如：

```json
{
  "statusPort": 3080
}
```

Local Service Hub 检查：

```text
127.0.0.1:3080
```

- 可连接：显示“运行中”，禁用“启动”
- 不可连接：显示“已停止”，禁用“关闭”
- 未配置端口：显示“未检测”，启动和关闭都可手动点击

## 桌面界面

正式窗口由四部分组成：

```text
应用标题区
├── Local Service Hub
├── 本地服务说明
└── 添加服务

状态概览
├── 全部服务
├── 运行中
├── 已停止
└── 未检测

服务列表
├── 服务名称 / 端口
├── 当前状态
└── 配置 / 启动 / 关闭

底部
└── 打开完整控制面板
```

不再提供：

- MeterSphere 服务卡片
- 自动发现项目
- Node / Python / Maven / Gradle 类型识别
- runtime / cwd / args 拆分配置
- 重启按钮
- Desktop 日志按钮
- PIN / 置顶模式
- 右上角浮动定位

需要重启时直接执行“关闭 → 启动”。服务日志由启动命令自行决定，例如 DeepSeek Harness 已写入 `/tmp/dsh-web.log`。

## 配置安全边界

本地服务命令具有本机 shell 权限，因此边界保持为：

- Renderer 不启用 Node integration
- `contextIsolation: true`
- 服务操作 API 只按已保存 ID 执行
- 不提供 `POST /execute { command }` 一类任意命令执行接口
- 配置写入采用临时文件替换，并保留 `config.json.bak`
- 继续使用现有本地访问 token / localhost 访问保护
- 退出 App 时优雅清理 Job、WebSocket、Redis、连接池、日志和内置 HTTP Server
- 默认不会因为退出 Local Service Hub 而关闭已经启动的本地服务

## 本地开发

开发阶段仍然使用：

```bash
npm run dev
```

该命令同时启动：

- backend：`127.0.0.1:3000`
- Vite：`localhost:3001`
- Electron Local Service Hub

Electron 开发模式不会启动第二套 backend。它会等待 `http://localhost:3001/api/health` 可访问后再打开窗口；Vite 的 `/api` 与 `/ws` 继续代理到 3000。

只运行浏览器开发模式：

```bash
npm run dev:web
```

## 正式 App 图标

macOS 打包固定读取：

```text
build/icon.icns
```

自用版打包前应确保该文件存在。`npm run install:local` 会在构建前检查图标，避免缺失时误用 Electron 默认图标。

## 生成 macOS App

生成可直接双击的目录版 `.app`：

```bash
npm run electron:app
```

也可以使用兼容命令：

```bash
npm run electron:build
```

输出位于类似：

```text
dist/mac*/Local Service Hub.app
```

该 `.app` 可以直接双击启动，也可以复制到 `/Applications`。

## 一键安装 / 更新自用 App

推荐长期自用时使用：

```bash
npm run install:local
```

执行流程：

```text
检查 build/icon.icns
        ↓
构建 Local Service Hub.app
        ↓
请求已安装旧版本正常退出
        ↓
等待旧进程结束
        ↓
覆盖 /Applications/Local Service Hub.app
        ↓
重新启动最新版本
```

默认安装目录：

```text
/Applications/Local Service Hub.app
```

如果旧 App 不能在限定时间内正常退出，安装脚本会停止并提示手动退出，不会直接强制杀进程后覆盖。

以后更新通常只需要：

```bash
git checkout desktop
git pull origin desktop
npm run install:local
```

如果需要安装到其他目录，可临时指定：

```bash
LOCAL_SERVICE_HUB_INSTALL_DIR="$HOME/Applications" npm run install:local
```

## 生成 DMG 安装包

```bash
npm run dist
```

产物命名：

```text
Local-Service-Hub-<version>-<arch>.dmg
```

打开 DMG 后，把 `Local Service Hub.app` 拖入“应用程序”，以后即可从 Finder、Launchpad 或 Dock 启动。

当前打包配置尚未加入 Apple Developer ID 签名与 notarization。自用版无需优先处理；如果后续分发给其他 Mac 用户，再增加签名与公证。
