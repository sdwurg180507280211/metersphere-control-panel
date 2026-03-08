# AI 自动化服务控制 API 设计

## 1. 背景

当前控制面板已经具备以下能力：

- 服务启动、停止、重启
- 前端模块构建
- WebSocket 推送服务状态与构建进度
- 服务过渡态展示：`starting`、`checking_health`、`stopping`、`restarting`、`failed`、`running`、`stopped`

但如果目标是支持 AI agent 稳定调用，现有接口仍有两个问题：

1. 语义偏“人工操作”，不够面向自动化流程
2. 长耗时操作缺少统一的异步任务抽象，调用方需要自己猜测等待时机

尤其是在 AI 场景下，调用方通常无法可靠判断“这次改动是否只需要热更新”，因此应优先提供确定性更强的流程，而不是依赖 DevTools 或隐式热替换能力。

## 2. 设计目标

### 2.1 目标

- 为 AI agent 提供可重复、可观测、低误判的服务控制接口
- 将“编译 + 重启 + 健康检查”抽象为统一能力
- 将长耗时操作统一为异步任务模型
- 明确服务状态机，避免前后端状态漂移
- 兼容当前仓库已有的 WebSocket 事件能力

### 2.2 非目标

- 不为 AI 接口暴露 DevTools 热替换能力
- 不在本阶段引入复杂工作流编排引擎
- 不改变现有前端构建产物复制策略
- 不重做现有 WebSocket 基础设施

## 3. 设计原则

1. **确定性优先**：宁可慢一点，也要避免“看似成功但状态不一致”
2. **显式优于隐式**：是否编译、是否重启、是否做健康检查必须明确
3. **异步优先**：20 到 30 秒级别操作统一按任务处理
4. **状态收敛**：刷新页面后，服务状态必须能回收到真实运行态
5. **接口收敛**：减少 AI 侧分支判断，降低调用复杂度

## 4. 适用场景

### 4.1 后端代码变更

推荐调用：`POST /api/services/:id/reload`

执行语义：

1. 编译目标服务
2. 停止旧进程
3. 启动新进程
4. 执行健康检查
5. 返回最终结果

### 4.2 后端配置变更

推荐调用：`POST /api/services/:id/restart`

执行语义：

1. 停止旧进程
2. 启动新进程
3. 执行健康检查
4. 返回最终结果

### 4.3 前端代码变更

推荐调用：`POST /api/build/frontend`

执行语义：

1. 构建指定前端模块
2. 复制构建产物
3. 通过事件通知“关联服务可重启”
4. 可选自动重启关联服务

## 5. 核心资源模型

### 5.1 ServiceStatus

```json
{
  "id": "gateway",
  "name": "Gateway",
  "running": true,
  "phase": "running",
  "pid": 12345,
  "port": 8080,
  "healthy": true,
  "lastError": null,
  "updatedAt": "2026-03-08T22:40:43.000Z"
}
```

字段说明：

- `running`：是否观测到进程存在
- `phase`：面向 UI 与自动化的统一阶段值
- `healthy`：健康检查结果
- `lastError`：最近一次失败原因
- `updatedAt`：状态更新时间

### 5.2 Job

```json
{
  "jobId": "job_01JNX8W7T7P3E4M6Q9A1B2C3D4",
  "type": "service.reload",
  "targetId": "gateway",
  "status": "running",
  "stage": "health_check",
  "progress": 80,
  "message": "正在检查服务健康状态",
  "startedAt": "2026-03-08T22:40:43.000Z",
  "finishedAt": null,
  "result": null,
  "error": null
}
```

字段说明：

- `type`：任务类型，如 `service.reload`、`service.restart`、`frontend.build`
- `status`：`pending`、`running`、`succeeded`、`failed`、`cancelled`
- `stage`：更细粒度执行阶段
- `progress`：0 到 100 的粗粒度进度
- `result`：任务成功后的结构化结果
- `error`：失败时的结构化错误信息
- 任务状态默认应持久化到 Redis，并在控制面板重启后可恢复查询

## 6. 服务状态机

### 6.1 服务阶段定义

| phase | 含义 | 是否可操作 |
| --- | --- | --- |
| `stopped` | 进程不存在，服务已停止 | 可启动 |
| `starting` | 已发起启动命令，进程拉起中 | 不可重复启动 |
| `checking_health` | 进程已拉起，健康检查中 | 不可重复操作 |
| `running` | 进程存在且健康检查通过 | 可停止、可重启、可 reload |
| `stopping` | 正在停止服务 | 不可重复操作 |
| `restarting` | 正在执行重启流程 | 不可重复操作 |
| `failed` | 最近一次操作失败 | 可重试 |

### 6.2 典型流转

#### 启动

`stopped -> starting -> checking_health -> running`

#### 启动失败

`stopped -> starting -> checking_health -> failed`

#### 停止

`running -> stopping -> stopped`

#### 重启

`running -> restarting -> starting -> checking_health -> running`

#### reload

`running -> restarting -> starting -> checking_health -> running`

说明：

- `reload` 与 `restart` 的服务侧状态流转可以一致
- 二者的区别主要体现在任务执行阶段是否包含 `compile`
- 页面刷新后，后端必须通过 PID、端口、健康检查重新收敛为真实状态，不能永久停留在 `checking_health`

## 7. API 设计

### 7.1 查询接口

#### `GET /api/services/catalog`

用途：获取服务目录，供前端或 agent 枚举可操作服务。

响应示例：

```json
{
  "success": true,
  "data": [
    {
      "id": "gateway",
      "name": "Gateway",
      "port": 8080,
      "startOrder": 1
    }
  ]
}
```

#### `GET /api/services/:id/status`

用途：查询单个服务实时状态。

响应示例：

```json
{
  "success": true,
  "data": {
    "id": "gateway",
    "running": true,
    "phase": "running",
    "healthy": true,
    "pid": 12345,
    "updatedAt": "2026-03-08T22:40:43.000Z"
  }
}
```

#### `GET /api/jobs/:jobId`

用途：轮询异步任务状态。

响应示例：

```json
{
  "success": true,
  "data": {
    "jobId": "job_01JNX8W7T7P3E4M6Q9A1B2C3D4",
    "type": "service.reload",
    "status": "running",
    "stage": "stop_old_process",
    "progress": 45,
    "message": "正在停止旧进程"
  }
}
```

### 7.2 服务操作接口

#### `POST /api/services/:id/restart`

用途：不编译，直接重启服务。

请求体：

```json
{
  "reason": "config_changed"
}
```

响应示例：

```json
{
  "success": true,
  "data": {
    "jobId": "job_01JNX8W7T7P3E4M6Q9A1B2C3D4",
    "type": "service.restart",
    "status": "pending"
  }
}
```

#### `POST /api/services/:id/reload`

用途：编译并重启服务，供 AI 在“后端代码变更”后统一调用。

请求体：

```json
{
  "reason": "backend_code_changed"
}
```

响应示例：

```json
{
  "success": true,
  "data": {
    "jobId": "job_01JNX9A9K2R7S5T8U1V4W6X7Y8",
    "type": "service.reload",
    "status": "pending"
  }
}
```

#### `POST /api/services/:id/start`

用途：显式启动已停止服务。

说明：保留现有接口，主要用于人工控制台；AI 场景优先使用 `restart` 或 `reload`。

#### `POST /api/services/:id/stop`

用途：停止服务。

说明：保留现有接口，主要用于人工控制台或运维脚本。

### 7.3 构建接口

#### `GET /api/build/modules`

用途：获取可构建前端模块目录。

#### `POST /api/build/frontend`

用途：触发前端模块构建。

请求体：

```json
{
  "module": "gateway-ui",
  "forceInstall": false,
  "autoRestart": false,
  "reason": "frontend_code_changed"
}
```

响应示例：

```json
{
  "success": true,
  "data": {
    "jobId": "job_01JNX9Q2F4H6J8K1L3M5N7P9R0",
    "type": "frontend.build",
    "module": {
      "id": "gateway-ui",
      "name": "Gateway UI",
      "serviceId": "gateway"
    },
    "linkedService": {
      "id": "gateway",
      "name": "Gateway"
    }
  }
}
```

#### `POST /api/build/frontend/batch`

用途：批量构建前端模块。

建议语义：

- 返回一个父任务 `jobId`，并附带子任务 `jobId` 列表
- 每个模块或关联服务都映射为独立子任务
- 部分失败不影响已开始的其他子任务
- 父任务状态应支持 `all_succeeded`、`partial_failed`、`all_failed`

说明：保留当前能力，但也建议返回统一 `jobId`，而不是只返回“任务已开始”。

## 8. 任务阶段定义

### 8.1 `service.restart` 建议阶段

| stage | 含义 |
| --- | --- |
| `prepare` | 校验参数、申请锁 |
| `stop_old_process` | 停止旧进程 |
| `start_new_process` | 启动新进程 |
| `health_check` | 等待健康检查完成 |
| `completed` | 执行完成 |

### 8.2 `service.reload` 建议阶段

| stage | 含义 |
| --- | --- |
| `prepare` | 校验参数、申请锁 |
| `compile` | 编译服务 |
| `stop_old_process` | 停止旧进程 |
| `start_new_process` | 启动新进程 |
| `health_check` | 等待健康检查完成 |
| `completed` | 执行完成 |

### 8.3 `frontend.build` 建议阶段

| stage | 含义 |
| --- | --- |
| `prepare` | 准备构建环境 |
| `install_dependencies` | 安装依赖或跳过 |
| `build_assets` | 执行前端构建 |
| `copy_assets` | 复制产物 |
| `notify_restart` | 通知关联服务可重启 |
| `completed` | 执行完成 |

## 9. 返回码设计

| HTTP 状态码 | 场景 | 说明 |
| --- | --- | --- |
| `200` | 即时查询成功 | 同步查询类接口 |
| `202` | 长任务已接收 | 返回 `jobId`，后续轮询或订阅事件 |
| `400` | 参数错误 | 服务 ID、模块 ID 无效 |
| `404` | 资源不存在 | 服务或任务不存在 |
| `409` | 资源忙碌 | 服务已有任务执行中 |
| `500` | 服务端异常 | 非预期错误 |

建议：

- 所有长耗时写操作统一返回 `202`
- 业务冲突优先使用 `409`，不要混用 `200 + success=false`
- 失败信息尽量结构化，而不是只返回字符串

错误响应示例：

```json
{
  "success": false,
  "error": {
    "code": "SERVICE_BUSY",
    "message": "服务正在处理中，请稍后再试",
    "details": {
      "serviceId": "gateway",
      "phase": "checking_health"
    }
  }
}
```

### 9.1 标准错误码建议

| 错误码 | 含义 | 建议 HTTP 状态码 |
| --- | --- | --- |
| `INVALID_SERVICE_ID` | 服务 ID 不存在或非法 | `400` |
| `INVALID_MODULE_ID` | 模块 ID 不存在或非法 | `400` |
| `SERVICE_BUSY` | 服务已有任务执行中 | `409` |
| `LOCK_ACQUIRE_FAILED` | 获取锁失败 | `409` |
| `COMPILE_FAILED` | 编译失败 | `500` |
| `START_FAILED` | 启动失败 | `500` |
| `HEALTH_CHECK_TIMEOUT` | 健康检查超时 | `500` |
| `RATE_LIMITED` | 触发限流 | `429` |
| `REDIS_UNAVAILABLE` | Redis 不可用，无法创建或维护任务 | `503` |

## 10. 互斥与并发策略

### 10.1 服务级锁

同一服务在任意时刻只允许存在一个进行中的控制任务：

- `start`
- `stop`
- `restart`
- `reload`

如果已有任务在执行中，应直接返回 `409 SERVICE_BUSY`。

### 10.2 模块级锁

同一前端模块在任意时刻只允许存在一个构建任务。

### 10.3 关联服务冲突

若 `frontend.build` 设置 `autoRestart=true`，而关联服务当前已有控制任务，则：

- 构建可以继续
- 自动重启步骤标记为 `skipped` 或 `failed_conflict`
- 结果中必须明确说明未自动重启的原因

## 11. 事件推送设计

当前项目已具备 WebSocket 推送能力，建议在现有基础上统一事件模型。

### 11.1 服务状态事件

事件名：`service:status`

```json
{
  "type": "service:status",
  "service": {
    "id": "gateway",
    "running": true,
    "phase": "checking_health",
    "healthy": false,
    "updatedAt": "2026-03-08T22:40:43.000Z"
  }
}
```

### 11.2 任务进度事件

事件名：`job:progress`

```json
{
  "type": "job:progress",
  "jobId": "job_01JNX9A9K2R7S5T8U1V4W6X7Y8",
  "jobType": "service.reload",
  "targetId": "gateway",
  "status": "running",
  "stage": "compile",
  "progress": 20,
  "message": "正在编译服务"
}
```

### 11.3 任务完成事件

事件名：`job:completed`

```json
{
  "type": "job:completed",
  "jobId": "job_01JNX9A9K2R7S5T8U1V4W6X7Y8",
  "jobType": "service.reload",
  "targetId": "gateway",
  "status": "succeeded",
  "result": {
    "serviceId": "gateway",
    "phase": "running",
    "healthy": true
  }
}
```

### 11.4 构建兼容事件

为兼容现有前端，可继续保留：

- `build:progress`
- `build:completed`
- `build:batchCompleted`

但从中长期看，建议逐步合并到统一 `job:*` 事件族。

## 12. 与当前仓库的映射关系

### 12.1 当前已具备能力

- `GET /api/services/catalog`
- `GET /api/services/status`
- `GET /api/services/:id/status`
- `POST /api/services/:id/start`
- `POST /api/services/:id/stop`
- `POST /api/services/:id/restart`
- `GET /api/build/modules`
- `POST /api/build/frontend`
- `POST /api/build/frontend/batch`
- WebSocket 推送服务状态和构建进度
- 服务过渡态状态机

### 12.2 建议新增能力

- `POST /api/services/:id/reload`
- `GET /api/jobs/:jobId`
- 统一 `job` 存储与查询服务
- `job:progress` / `job:completed` 事件
- 服务级与模块级任务锁
- 统一结构化错误码

### 12.3 建议保留但弱化的能力

- `start` / `stop`：保留给人工运维
- DevTools：保留给本地开发者，但不纳入 AI 自动化 API 语义

## 13. 推荐落地顺序

### 阶段 1：最小可用版本

1. 保持现有 `start` / `stop` / `restart` / `build` 不变
2. 新增 `POST /api/services/:id/reload`
3. 为 `restart` 与 `reload` 返回统一 `jobId`
4. 增加 `GET /api/jobs/:jobId`

### 阶段 2：统一任务模型

1. 将前端构建任务也纳入统一 `job` 模型
2. WebSocket 增加 `job:progress`、`job:completed`
3. 将现有 `build:progress` 作为兼容层保留

### 阶段 3：统一错误与并发治理

1. 引入结构化错误码
2. 完善服务级与模块级互斥锁
3. 为批量构建和批量重启提供更明确的冲突结果

## 14. 建议结论

面向 AI 自动化时，推荐采用如下调用约定：

- 后端代码变更：调用 `POST /api/services/:id/reload`
- 后端配置变更：调用 `POST /api/services/:id/restart`
- 前端代码变更：调用 `POST /api/build/frontend`
- 所有长耗时任务：通过 `jobId` 轮询或订阅 WebSocket 事件

这套设计的核心价值不是“接口更多”，而是把原本依赖调用方经验判断的流程，收敛成一套稳定、可重复、对 AI 友好的控制协议。

## 15. 生产运行约束

为了让这套 API 真正可用于 AI 自动化，除了接口本身，还需要明确以下运行约束：

### 15.1 任务持久化

- 所有 `job` 默认持久化到 `Redis`
- 控制面板重启后，任务仍需可查询
- 控制面板启动时必须执行一次任务恢复扫描
- 若 `Redis` 在任务创建前不可用，直接返回 `503 REDIS_UNAVAILABLE`
- 不允许对任务系统降级到纯内存模式，避免状态分裂
- `Redis` 恢复后，以 Redis 中任务状态为准，再结合服务真实状态执行一次补充收敛

### 15.2 超时与失败语义

- 所有长任务必须同时具备阶段超时与总超时
- 超时后不能只返回通用错误，必须返回具体失败阶段
- `reload` 在停掉旧服务后失败时，必须触发一次补偿启动
- 补偿启动最多只允许 `1` 次，补偿超时建议为 `60s`
- 补偿失败后直接收敛到 `failed_service_down`，不再递归补偿
- `reload` 在停掉旧服务后失败时，必须触发一次补偿启动
- 补偿启动最多只允许 `1` 次，补偿超时建议为 `60s`
- 补偿失败后直接收敛到 `failed_service_down`，不再递归补偿

### 15.3 锁与并发语义

- 服务级与模块级互斥锁必须基于 `Redis`
- 锁获取失败统一返回 `409`
- 锁必须有 TTL，并支持长任务续期

### 15.4 观测与限流

- 任务日志必须包含 `jobId`、阶段、耗时和失败原因
- 至少采集成功率、失败率、超时数、活动任务数等指标
- 对高风险写接口增加最小限流，避免误触发造成服务抖动
- 限流窗口只统计真正进入 `running` 的任务
- 参数错误、锁冲突等立即失败请求不计入限流
- 限流窗口只统计真正进入 `running` 的任务
- 参数错误、锁冲突等立即失败请求不计入限流

这些约束不是“可选优化”，而是阶段 1 达到生产可用的必要条件。
