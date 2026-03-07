# MeterSphere Control Panel

`metersphere-control-panel` 是一个独立长期维护的 MeterSphere 本地开发控制台，用于管理同级 `metersphere` 项目的服务启动、前端构建、实时日志与构建进度。

## 当前能力

- 服务控制：单服务启动、停止、重启，批量启动 / 停止 / 重启
- 批量编排：批量启动按健康检查顺序推进，失败时自动回滚本次已启动的服务
- 前端构建：支持单模块 / 批量模块构建，构建完成后自动重启对应服务
- 构建取消：支持真实取消 `npm install` / `npm run build` 子进程
- 实时同步：以 WebSocket 为主通道推送服务状态、构建进度、构建日志、服务日志
- 日志链路：前端日志使用行缓冲与虚拟滚动；服务端日志使用流式写盘
- 缓存策略：默认使用内存缓存，Redis 仅作为显式启用的可选增强

## 项目结构

```text
.
├── backend/
│   ├── config/              # Redis 等运行时配置
│   ├── controllers/         # HTTP 控制器
│   ├── routes/              # API 路由
│   ├── services/            # 进程、健康检查、构建进度、缓存、WebSocket 等服务
│   ├── utils/               # 日志、校验等工具
│   └── server.js            # 后端入口
├── docs/
│   └── control-panel-optimization-roadmap.md
├── frontend/
│   ├── src/components/
│   ├── src/hooks/
│   ├── src/store/
│   └── vite.config.js
├── config.json              # 控制面板配置源
└── package.json
```

## 运行方式

### 前置条件

- Node.js 18+
- npm
- 可访问的 MeterSphere 源码目录
- Java / Maven Wrapper 运行环境（用于启动 MeterSphere 后端服务）

### 安装依赖

```bash
npm run install:all
```

### 开发模式

```bash
npm run dev
```

开发模式职责：

- `backend/server.js` 提供 API 与 WebSocket 服务，默认监听 `http://localhost:3000`
- `frontend` 使用 Vite 开发服务器，默认监听 `http://localhost:3001`
- 前端通过代理访问后端 API / WebSocket

### 生产模式

```bash
npm run build
npm start
```

生产模式职责：

- `npm run build` 生成 `frontend/dist`
- `npm start` 启动 Node 服务，由后端直接托管 `frontend/dist`
- 浏览器统一访问 `http://localhost:3000`

## 配置说明

控制面板主配置位于 `config.json`。

```json
{
  "port": 3000,
  "projectRoot": "..",
  "maxLogLines": 1000,
  "services": {
    "eureka": {
      "name": "Eureka",
      "pom": "framework/eureka/pom.xml",
      "port": 8761,
      "healthCheck": "/actuator/health",
      "startOrder": 1
    }
  }
}
```

### `projectRoot` 说明

- 当前仓库会优先解析有效的 MeterSphere 项目根目录
- 默认会自动识别同级 `../metersphere`
- 启动服务时会优先使用 MeterSphere 根目录下的 `mvnw` / `mvnw.cmd`

## 缓存模式

默认使用内存缓存，不依赖 Redis。

如果需要显式启用 Redis，可设置以下环境变量：

```bash
MS_CACHE_MODE=redis
MS_REDIS_HOST=127.0.0.1
MS_REDIS_PORT=6379
MS_REDIS_PASSWORD=
MS_REDIS_DB=0
MS_CACHE_KEY_PREFIX=ms-panel:
```

说明：

- `MS_CACHE_MODE` 默认值为 `memory`
- 未再内置任何默认敏感密码
- 如果 Redis 连接失败，会自动降级回内存缓存
- 也支持从 `MS_PROPERTIES_PATH` 指定的 MeterSphere properties 文件读取 Redis 主机 / 端口 / 密码

## 实时通信机制

### 主通道：WebSocket

WebSocket 路径：`/ws`

当前前端主要依赖以下事件：

- `logs:service`：服务日志
- `logs:build`：构建日志
- `build:progress`：构建进度
- `service:status`：服务状态增量更新

### 兼容通道：SSE

兼容保留 `GET /api/logs/stream` 用于日志流接入，但当前前端主通道已经是 WebSocket。

## API 概览

### 服务管理

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/services/catalog` | 获取服务目录 |
| GET | `/api/services/status` | 获取全部服务状态 |
| POST | `/api/services/start-all` | 批量启动服务 |
| POST | `/api/services/stop-all` | 批量停止服务 |
| POST | `/api/services/restart-all` | 批量重启服务 |
| GET | `/api/services/:id/status` | 获取单个服务状态 |
| GET | `/api/services/:id/health` | 获取单个服务健康状态 |
| POST | `/api/services/:id/start` | 启动单个服务 |
| POST | `/api/services/:id/stop` | 停止单个服务 |
| POST | `/api/services/:id/restart` | 重启单个服务 |

### 构建管理

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/build/modules` | 获取可构建模块目录 |
| POST | `/api/build/frontend` | 构建单个前端模块 |
| POST | `/api/build/frontend/batch` | 批量构建多个模块 |

### 构建进度

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/progress/active` | 获取进行中的构建 |
| GET | `/api/progress/history/recent` | 获取最近构建历史 |
| GET | `/api/progress/:buildId` | 获取单个构建详情 |
| POST | `/api/progress/:buildId/cancel` | 取消构建 |

### 日志

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/logs/stream` | SSE 兼容日志流 |
| GET | `/api/logs/files` | 获取日志文件列表 |
| POST | `/api/logs/clean` | 清理历史日志 |

## 构建策略说明

当前前端构建流程遵循以下规则：

- 默认跳过重复依赖安装
- 如果 `node_modules` 不存在，则自动安装依赖
- 如果 lockfile 指纹变化，则自动重新安装依赖
- 如果请求中显式开启 `forceInstall`，则强制安装依赖
- 有 `package-lock.json` 时优先使用 `npm ci`

## 路线图

优化路线图见 `docs/control-panel-optimization-roadmap.md`。

当前这份路线图中的既定优化项已全部完成，后续新增优化建议可继续增量维护。
