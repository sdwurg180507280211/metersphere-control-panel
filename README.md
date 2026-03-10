# MeterSphere Control Panel

`metersphere-control-panel` 是一个独立长期维护的 MeterSphere 本地开发控制台，用于管理同级 `metersphere` 项目的服务启动、前端构建、实时日志与构建进度。

## 当前能力

- 服务控制：单服务启动、停止、重启，批量启动 / 停止 / 重启
- 系统命令：服务页支持手动触发 `msctl reload`，并在弹窗中输入管理员密码
- 批量编排：批量启动按健康检查顺序推进，失败时自动回滚本次已启动的服务
- 前端构建：支持单模块 / 批量模块构建，构建完成后自动重启对应服务
- 整体验证打包：新增第 3 个“整体验证打包”页签，可触发 `metersphere-build.sh`、查看任务状态与实时日志
- 配置管理：新增第 4 个“配置管理”页签，支持 `config.json` 结构化编辑、校验、保存与运行时应用
- 构建取消：支持真实取消 `npm install` / `npm run build` 子进程
- 实时同步：以 WebSocket 为主通道推送服务状态、构建进度、构建日志、服务日志与打包日志/状态
- 日志链路：前端日志使用行缓冲与虚拟滚动；服务端日志使用流式写盘
- 缓存策略：默认使用内存缓存，启用 Redis 后控制任务支持严格持久化、限流和恢复补写
- 统一任务中心：服务控制与前端构建统一收敛到 `jobId`、`job:*` 事件和结构化错误响应

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

启动前会自动执行 `node scripts/clean-port.js 3000 5000`，用于清理默认端口占用。

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

### 打包脚本路径

- 打包页默认执行同级 MeterSphere 仓库中的 `打包/metersphere-build.sh`
- 可通过 `MS_PACKAGE_SCRIPT_PATH` 或 `PACKAGE_SCRIPT_PATH` 显式覆盖脚本路径
- 若配置了 `config.json.package.scriptPath`，后端也会将其作为候选路径之一

### 配置管理页

配置页会同时展示三类信息：

- `editable`：可写回 `config.json` 的持久化字段，例如 `projectRoot`、`services`、`package`
- `runtime`：环境变量和运行时派生出的只读字段，例如 Redis、缓存模式、任务超时
- `resolved`：后端解析后的最终快照，例如绝对 `projectRoot`、服务目录、前端模块、打包脚本候选路径

页面支持以下操作：

- `GET /api/config`：加载当前配置页快照
- `POST /api/config/validate`：校验草稿但不写盘
- `PUT /api/config`：保存到 `config.json`
- `POST /api/config/apply`：将最新保存配置应用到支持热更新的运行时消费者
- `GET /api/config/diagnostics`：重新执行配置诊断

当前明确需要重启控制面板才能生效的字段：

- `port`

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
MS_JOB_REDIS_REQUIRED=true
MS_JOB_RATE_LIMIT_WINDOW_SECONDS=30
```

说明：

- `MS_CACHE_MODE` 默认值为 `memory`
- `MS_JOB_REDIS_REQUIRED` 未显式设置时，会在 `MS_CACHE_MODE=redis` 时默认开启
- `MS_JOB_RATE_LIMIT_WINDOW_SECONDS` 默认值为 `30`，用于服务/模块级写操作限流窗口
- Redis 启用且不可用时，新控制任务会直接返回 `503 REDIS_UNAVAILABLE`
- Redis 在任务执行中短暂抖动时，活动任务状态会先落到内存恢复缓冲，并在 Redis 恢复后自动补写
- 也支持从 `MS_PROPERTIES_PATH` 指定的 MeterSphere properties 文件读取 Redis 主机 / 端口 / 密码

## 兼容迁移约定

当前控制面板处于统一任务模型与旧前端协议并存阶段：

- 写操作的主模型是 `jobId`、`/api/jobs/*` 与 `job:*` 事件
- 构建页仍继续使用 `/api/progress/*`、`build:*` 事件与 `buildId` 兼容字段
- 服务页仍继续使用 `service:status` 事件；同时前端已开始订阅 `job:*` 作为双栈兼容
- `GET /api/jobs/:jobId`、`GET /api/jobs/active`、`GET /api/jobs/history/recent` 对构建任务会额外返回顶层 `buildId` 与 `compatibility` 信息，明确旧接口、旧事件和迁移模式

推荐迁移顺序：

1. 新能力优先接入 `jobs` 查询接口与 `job:*` 事件
2. 构建领域在兼容期继续保留 `buildId` 与 `progress` 路由
3. 旧调用方完成迁移后，再评估是否下线 `build:*` / `service:status` 的强依赖

## 实时通信机制

### 主通道：WebSocket

WebSocket 路径：`/ws`

当前前端主要依赖以下事件：

- `logs:service`：服务日志
- `logs:build`：构建日志
- `logs:package`：打包日志
- `build:progress`：构建进度
- `service:status`：服务状态增量更新
- `package:started` / `package:heartbeat` / `package:completed` / `package:failed`：打包状态事件

### 兼容通道：SSE

兼容保留 `GET /api/logs/stream` 用于日志流接入，但当前前端主通道已经是 WebSocket。

## API 概览

### 服务管理

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/services/catalog` | 获取服务目录 |
| GET | `/api/services/status` | 获取全部服务状态 |
| POST | `/api/services/start-all` | 创建批量启动父任务，返回 `202 + jobId` |
| POST | `/api/services/stop-all` | 创建批量停止父任务，返回 `202 + jobId` |
| POST | `/api/services/restart-all` | 创建批量重启父任务，返回 `202 + jobId` |
| POST | `/api/services/system/reload` | 执行 `sudo msctl reload`，请求体需携带管理员密码 |
| GET | `/api/services/:id/status` | 获取单个服务状态 |
| GET | `/api/services/:id/health` | 获取单个服务健康状态 |
| POST | `/api/services/:id/start` | 启动单个服务 |
| POST | `/api/services/:id/stop` | 停止单个服务 |
| POST | `/api/services/:id/restart` | 重启单个服务 |
| POST | `/api/services/:id/reload` | 触发服务 reload 任务 |

### 配置管理

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/config` | 获取配置管理页完整快照（editable/runtime/resolved/diagnostics/meta） |
| POST | `/api/config/validate` | 校验草稿并返回结构化错误、警告和应用影响 |
| PUT | `/api/config` | 保存配置到 `config.json`，不自动应用到运行时 |
| POST | `/api/config/apply` | 应用最新已保存配置到支持热更新的消费者 |
| GET | `/api/config/diagnostics` | 重新执行配置诊断，不改动磁盘配置 |

### 打包任务

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/package/options` | 获取后端维护的打包服务白名单、默认值、脚本可用性 |
| GET | `/api/package/active` | 获取当前活动中的打包任务，供页面刷新恢复 |
| POST | `/api/package/run` | 创建新的打包任务，返回 `202 + jobId` |

批量服务操作现在会创建父任务和子任务：父任务汇总整体结果，子任务保留每个服务的真实执行结果；第一阶段不对已成功的子任务做隐式回滚。

### 构建管理

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/build/modules` | 获取可构建模块目录 |
| POST | `/api/build/frontend` | 构建单个前端模块 |
| POST | `/api/build/frontend/batch` | 批量构建多个模块 |

### 任务查询

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/jobs/:jobId` | 获取统一任务详情 |
| GET | `/api/jobs/active` | 获取活动任务列表 |
| GET | `/api/jobs/history/recent` | 获取最近任务历史 |
| POST | `/api/jobs/:jobId/cancel` | 取消支持取消的任务 |

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
