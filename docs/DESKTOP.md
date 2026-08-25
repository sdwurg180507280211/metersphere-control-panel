# Desktop / Local Service Hub

`desktop` 分支把现有 MeterSphere 控制面板扩展成正式的 macOS 本地服务快捷控制中心。

## 定位

Local Service Hub 只管理本地应用，不显示 MeterSphere 的 Eureka、Gateway、Project Management 等服务卡片。

- Local Service Hub：启动、访问、关闭本地服务
- 完整控制面板：继续保留原有 MeterSphere 服务管理与其他功能
- `打开完整控制面板`：从 Local Service Hub 进入原完整页面

## macOS App

- 默认窗口：`920 × 680`
- 最小窗口：`760 × 540`
- 标准 macOS 窗口、Dock 和菜单栏入口
- 浅色模式
- 单实例运行；重复双击 App 只唤醒已有窗口
- 自动记住窗口尺寸、位置和最大化状态
- 关闭窗口后 macOS 上 App 继续运行，可从 Dock 或菜单栏重新打开

窗口状态保存于：

```text
~/.metersphere-control-panel/window-state.json
```

日常启动不需要 Terminal：

```text
Applications / Launchpad / Dock
        ↓
Local Service Hub.app
        ↓
内置 backend 自动启动
        ↓
Local Service Hub 窗口
```

## 本地服务模型

每个服务只需要四个字段：

1. 服务名称
2. 启动命令
3. 关闭命令
4. 状态端口（可选）

配置保存于：

```text
~/.metersphere-control-panel/config.json
```

示例：

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

应用 ID 由后端根据服务名称生成，不需要手动填写。

## 启动和关闭

服务 API 只接收已保存的服务 ID，不接受请求临时传入任意 shell 命令。

```text
保存启动 / 关闭命令
        ↓
写入 config.json
        ↓
点击当前唯一主操作按钮
        ↓
后端按服务 ID 读取已保存命令
        ↓
本机登录 shell 执行
```

macOS 命令支持 `cd`、多行命令、`nohup`、重定向、shell 变量和 `if ... then ... fi` 等标准登录 shell 语义。

DeepSeek Harness 启动示例：

```bash
cd /Users/edy/ideaProjects/deepseek-harness
nohup npm run dsh -- web > /tmp/dsh-web.log 2>&1 &
```

关闭示例：

```bash
dsh_pid=$(lsof -tiTCP:3080 -sTCP:LISTEN)
if [ -n "$dsh_pid" ]; then
  kill -TERM $dsh_pid
fi
```

Local Service Hub 不会自动把 `SIGTERM` 替换成 `SIGKILL`；需要强制关闭时应在该服务自己的关闭命令中明确配置。

## 状态、访问按钮与单主操作按钮

`statusPort` 用于检测：

```text
127.0.0.1:<statusPort>
```

配置状态端口后：

```text
端口可连接
→ 运行中
→ 显示：配置 / 访问 / 关闭

端口不可连接
→ 已停止
→ 显示：配置 / 访问（禁用）/ 启动
```

“访问”通过 Electron 主进程调用系统默认浏览器打开：

```text
http://127.0.0.1:<statusPort>
```

主进程只允许 `http://` / `https://` 且 hostname 为 `127.0.0.1` 或 `localhost` 的地址，Renderer 不能借此打开任意外部 URL。

启动和关闭不再同时显示。每个服务始终只有一个主操作按钮：

- 已停止 → `启动`
- 启动中 → `启动中…`
- 运行中 → `关闭`
- 关闭中 → `关闭中…`

未配置状态端口时无法真实探测进程，因此采用轻量手动状态：

- 初始显示 `未检测 + 启动`
- 成功执行启动命令后显示 `手动已启动 + 关闭`
- 成功执行关闭命令后恢复 `未检测 + 启动`
- 手动状态只影响 Local Service Hub 的按钮语义，不宣称真实探测到了进程

## 桌面界面

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
└── 配置 / 访问（可选）/ 单个启动或关闭按钮

底部
└── 打开完整控制面板
```

当前不提供：

- MeterSphere 服务卡片
- 自动发现项目
- Node / Python / Maven / Gradle 类型识别
- runtime / cwd / args 拆分配置
- 重启按钮
- Desktop 日志按钮
- PIN / 置顶模式
- 右上角浮动定位

需要重启服务时按 `关闭 → 启动` 操作。日志路径由各服务自己的启动命令决定。

## 安全边界

- `nodeIntegration: false`
- `contextIsolation: true`
- 服务操作 API 只按已保存 ID 执行
- 不提供 `POST /execute { command }`
- 配置写入采用临时文件替换，并保留 `config.json.bak`
- 本地访问继续使用 localhost + token 保护
- “访问”仅允许本机 HTTP(S) URL
- 退出 App 时优雅清理 Job、WebSocket、Redis、连接池、日志和内置 HTTP Server
- 退出 Local Service Hub 默认不会停止已经启动的本地服务

## 本地开发

```bash
npm run dev
```

同时启动：

- backend：`127.0.0.1:3000`
- Vite：`localhost:3001`
- Electron Local Service Hub

只运行浏览器开发模式：

```bash
npm run dev:web
```

## 桌面端轻量校验

```bash
npm run verify:desktop
```

该命令检查 Electron 主进程、preload、Desktop 服务代码、退出清理代码、安装 Shell 语法，并执行前端 build。

## 正式 App 图标

macOS 打包固定读取：

```text
build/icon.icns
```

`npm run install:local` 会在构建前检查图标是否存在，避免误用 Electron 默认图标。

## 生成 macOS App

```bash
npm run electron:app
```

输出类似：

```text
dist/mac*/Local Service Hub.app
```

## 一键安装 / 更新自用 App

推荐：

```bash
npm run install:local
```

更新过程：

```text
verify:desktop
        ↓
生成新 Local Service Hub.app
        ↓
先复制到 /Applications/Local Service Hub.app.new
        ↓
校验新 App 完整性
        ↓
正常退出旧 App
        ↓
旧 App 保存为 .previous
        ↓
.new 原子替换正式 App
        ↓
启动并检查新进程
        ↓
成功：删除 .previous
失败：自动恢复 .previous
```

默认安装位置：

```text
/Applications/Local Service Hub.app
```

脚本在关键替换阶段被中断时也会优先尝试恢复 `.previous`，不会主动强杀无法正常退出的旧 App。

日常更新：

```bash
git checkout desktop
git pull origin desktop
npm run install:local
```

其他安装目录：

```bash
LOCAL_SERVICE_HUB_INSTALL_DIR="$HOME/Applications" npm run install:local
```

## DMG

```bash
npm run dist
```

产物：

```text
Local-Service-Hub-<version>-<arch>.dmg
```

当前自用版不优先处理 Apple Developer ID 签名和 notarization；后续需要分发给其他 Mac 用户时再增加。
