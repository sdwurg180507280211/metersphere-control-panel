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

Desktop Shell 中点击 `+ 添加` 即可：

1. 使用 macOS Finder 选择项目目录；
2. 后端只扫描项目文件，不执行命令；
3. 自动识别 `package.json`、Python、Maven、Gradle、`start.sh`；
4. 对 Node 项目读取 npm / pnpm / yarn / bun scripts；
5. 从候选启动方式中选择一个，确认名称、类型和端口；
6. 保存后才允许从卡片启动。

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

## 自动识别

当前目录识别规则：

- `package.json`：读取 scripts，并根据 lockfile 选择 npm / pnpm / yarn / bun；优先展示 `dev`、`start`、`serve`、`preview`
- `app.py` / `main.py` / `manage.py` / `pyproject.toml` / `requirements.txt`：识别 Python 项目
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

先启动 Vite：

```bash
npm run dev:frontend
```

再启动 Electron：

```bash
npm run electron:dev
```

Electron 仍会自行启动 backend，并把本地访问 token 注入桌面窗和完整控制面板。

## 打包

```bash
npm run electron:build
```

`electron-preload.js` 已加入 electron-builder 文件清单。
