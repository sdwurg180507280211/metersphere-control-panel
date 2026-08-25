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

用于管理任意本地进程，例如 Node、Python、Java JAR、Vite、Next.js、Shell worker。

配置保存在用户实际 `config.json` 的 `desktopApplications` 字段。前端只能按应用 ID 请求启动/停止/重启，不能提交任意 shell 命令。

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

## 进程与日志

Desktop Apps 使用 detached process group 启动。

- PID 状态：`~/.metersphere-control-panel/desktop-apps-runtime.json`
- 日志：`~/.metersphere-control-panel/logs/desktop-apps/<app-id>.log`
- macOS/Linux 停止时先向整个进程组发送 `SIGTERM`，超时后 `SIGKILL`
- Windows 使用 `taskkill /T` 作为兼容路径

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
