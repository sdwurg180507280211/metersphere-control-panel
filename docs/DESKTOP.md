# Desktop / Local Service Hub

`desktop` 分支把现有 MeterSphere 控制面板扩展成 macOS 本地服务快捷控制中心。

## 定位

Desktop 小窗口只管理本地服务，不显示 MeterSphere 的 Eureka、Gateway、Project Management 等服务卡片。

- Desktop 小窗口：本地服务快捷启动 / 关闭
- 完整控制面板：继续保留原有 MeterSphere 服务管理与其他功能
- `打开完整控制面板`：从小窗口进入原完整页面

Electron 启动后默认打开 430px 宽的浮动 `Local Service Hub`，并在 macOS 菜单栏常驻。

- 点击菜单栏图标：显示 / 隐藏桌面控制窗
- `PIN`：切换始终置顶
- 关闭桌面窗不会退出应用；通过菜单栏“退出”才会结束控制面板

## 本地服务模型

每个本地服务只需要四个字段：

1. 服务名称
2. 启动命令
3. 关闭命令
4. 状态端口（可选）

配置保存在用户实际 `config.json` 的 `desktopApplications` 字段。

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

应用 ID 由后端根据服务名称生成，Desktop 配置界面不要求用户填写。

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

例如 DeepSeek Harness：

### 启动

```bash
cd /Users/edy/ideaProjects/deepseek-harness
nohup npm run dsh -- web > /tmp/dsh-web.log 2>&1 &
```

### 关闭

```bash
dsh_pid=$(lsof -tiTCP:3080 -sTCP:LISTEN)

if [ -n "$dsh_pid" ]; then
  kill -TERM $dsh_pid
fi
```

控制面板不会自动替换 `SIGTERM` 为 `SIGKILL`。如果某个服务需要强制关闭，应由该服务自己的关闭命令明确配置。

## 状态检测

`statusPort` 是可选字段，只用于判断 UI 状态，不参与生成或修改启动/关闭命令。

例如：

```json
{
  "statusPort": 3080
}
```

控制面板会检查：

```text
127.0.0.1:3080
```

- 可连接：显示“运行中”，禁用“启动”
- 不可连接：显示“已停止”，禁用“关闭”
- 未配置端口：显示“未检测”，启动和关闭都可手动点击

## Desktop 小窗口

卡片只保留本地服务需要的操作：

```text
┌──────────────────────────────┐
│ Local Service Hub            │
│                    ＋ 添加   │
├──────────────────────────────┤
│ ● DeepSeek Harness           │
│   运行中 · 端口 3080         │
│                              │
│   [启动]       [关闭]        │
│                    [配置]    │
└──────────────────────────────┘
```

不再提供：

- MeterSphere 服务卡片
- 自动发现项目
- Node / Python / Maven / Gradle 类型识别
- runtime / cwd / args 拆分配置
- 重启按钮
- Desktop 日志按钮

需要重启时直接执行“关闭 → 启动”。服务日志由启动命令自行决定，例如 DeepSeek Harness 已写入 `/tmp/dsh-web.log`。

## 配置安全边界

本地服务命令具有本机 shell 权限，因此边界保持为：

- Renderer 不启用 Node integration
- `contextIsolation: true`
- 服务操作 API 只按已保存 ID 执行
- 不提供 `POST /execute { command }` 一类任意命令执行接口
- 配置写入采用临时文件替换，并保留 `config.json.bak`
- 继续使用现有本地访问 token / localhost 访问保护

## 本地开发

Desktop 分支继续保持单命令开发方式：

```bash
npm run dev
```

该命令会同时启动：

- backend：`127.0.0.1:3000`
- Vite：`localhost:3001`
- Electron Desktop Shell

Electron 开发模式不会启动第二套 backend。它会等待 `http://localhost:3001/api/health` 可访问后再打开窗口；Vite 的 `/api` 与 `/ws` 继续代理到 3000。

如果只想运行原来的浏览器开发模式、不启动 Electron：

```bash
npm run dev:web
```

## 打包

```bash
npm run electron:build
```

生产版 Electron 由自身启动内置 backend，并加载 `frontend/dist`，不依赖 Vite 开发服务器。
