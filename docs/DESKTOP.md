# Desktop / Local Service Hub

`desktop` 分支把现有 MeterSphere 控制面板扩展成 macOS 本地服务控制中心。

## 启动形态

Electron 启动后默认打开 430px 宽的浮动 `Local Service Hub`，并在 macOS 菜单栏常驻。

- 点击菜单栏图标：显示 / 隐藏桌面控制窗
- `PIN`：切换始终置顶
- `打开完整控制面板`：打开原有完整页面并定位到服务管理
- 关闭桌面窗不会退出应用；通过菜单栏“退出”才会结束控制面板

## 两类资源

### MeterSphere Services

继续使用原有 `services` 配置、ProcessManager、Job、健康检查和 WebSocket 生命周期。

### Desktop Applications

用于管理任意本地进程，例如 Node、Python、Java、Vite、Next.js、Shell worker。

Desktop Shell 支持两种添加方式：

- `自动发现`：扫描常用本地项目根目录，列出未纳管项目，再选择候选启动方式保存；
- `+ 添加`：使用 macOS Finder 手动选择单个项目目录。

已有应用在停止状态下可点击“配置”修改或删除。运行中的应用不能改配置或删除，避免运行 PID 与启动定义不一致。

配置保存在用户实际 `config.json` 的 `desktopApplications` 字段。启动/停止接口只能按已保存的应用 ID 执行；配置编辑器虽然允许定义 command/args，但不会在保存时直接运行命令，实际执行仍由 DesktopAppService 读取落盘配置后完成。

```json
{
  "desktopApplications": {
    "poster-web": {
      "name": "Poster Web",
      "group": "本地应用",
      "runtime": "node",
      "enabled": true,
      "cwd": "/Users/me/Workspace/poster-web",
      "port": 3001,
      "start": {
        "command": "npm",
        "args": ["run", "dev"],
        "env": {
          "NODE_ENV": "development"
        }
      },
      "healthCheck": {
        "type": "port",
        "host": "127.0.0.1",
        "port": 3001
      }
    }
  }
}
```

## 自动发现

默认自动扫描这些实际存在的目录：

- MeterSphere `projectRoot` 的父目录
- 当前控制面板项目的父目录
- `~/ideaProjects`
- `~/Workspace`
- `~/Projects`
- `~/Developer`
- `~/Code`

可以额外在 `config.json` 中加入：

```json
{
  "desktopDiscoveryRoots": [
    "/Users/me/company-projects",
    "/Volumes/work/code"
  ]
}
```

扫描最大深度和目录数量都有上限，并跳过 `.git`、`node_modules`、`dist`、`build`、`target`、`.venv` 等目录，不会递归扫描整个磁盘。当前 MeterSphere 主项目和控制面板自身也会从候选中排除。

自动发现只识别项目，不会直接执行扫描到的命令。项目需要经过“配置并添加”确认后才进入可启动状态。

### DeepSeek Harness 示例

对于类似：

```bash
cd /Users/edy/ideaProjects/deepseek-harness
nohup npm run dsh -- web > /tmp/dsh-web.log 2>&1 &
```

自动发现会识别项目根目录和 `package.json#scripts.dsh`，并额外提供：

```text
npm run dsh -- web
```

作为启动候选。加入 Local Service Hub 后无需再使用 `nohup`、日志重定向或 `&`，DesktopAppService 会 detached 启动进程并统一保存 PID 和日志。

## 单目录自动识别

当前目录识别规则：

- `package.json`：读取 scripts，并根据 `packageManager` / lockfile 选择 npm / pnpm / yarn / bun；优先展示 `dev`、`start`、`serve`、`preview`
- `app.py` / `main.py` / `manage.py` / `pyproject.toml` / `requirements.txt`：识别 Python 项目，并优先使用项目 `.venv/bin/python` 或 `venv/bin/python`
- `pom.xml`：候选 `./mvnw spring-boot:run` 或 `mvn spring-boot:run`
- `build.gradle` / `build.gradle.kts`：候选 Gradle `bootRun`
- `start.sh`：作为 Shell 启动候选

检测结果只是建议，用户确认并保存后才形成可执行应用定义。

## 进程与日志

Desktop Apps 使用 detached process group 启动，并且 `shell: false`。

- PID 状态：`~/.metersphere-control-panel/desktop-apps-runtime.json`
- 日志：`~/.metersphere-control-panel/logs/desktop-apps/<app-id>.log`
- macOS/Linux 停止时先向整个进程组发送 `SIGTERM`，超时后 `SIGKILL`
- Windows 使用 `taskkill /T` 作为兼容路径
- 配置写入采用临时文件替换，并保留 `config.json.bak`

## 本地开发

Desktop 分支继续保持单命令开发方式：

```bash
npm run dev
```

该命令会同时启动：

- backend：`127.0.0.1:3000`
- Vite：`localhost:3001`
- Electron Desktop Shell

Electron 开发模式不会再启动第二套 backend。它会等待 `http://localhost:3001/api/health` 可访问后再打开窗口；Vite 的 `/api` 与 `/ws` 继续代理到 3000，因此浏览器页面和 Desktop Shell 共用同一套开发后端、进程状态和配置。

`predev` 会显式清理 3000 与 3001 两个开发端口。

如果只想运行原来的浏览器开发模式、不启动 Electron：

```bash
npm run dev:web
```

单独执行 `npm run electron:dev` 不再是推荐开发入口，因为它要求 backend 与 Vite 已经运行。

## 打包

```bash
npm run electron:build
```

生产版 Electron 仍由自身启动内置 backend，并加载 `frontend/dist`，不依赖 Vite 开发服务器。

`electron-preload.js` 已加入 electron-builder 文件清单。
