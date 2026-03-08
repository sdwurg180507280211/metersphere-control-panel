# AI 自动化服务控制后端落地方案

## 1. 目标

这份方案不是重新设计一套后端，而是基于当前 `metersphere-control-panel` 已有结构，给出一条最小改动、可分阶段落地的实现路径。

当前仓库已经具备：

- `processManager`：服务进程管理、批量启动停止、前端构建执行
- `serviceController` / `buildController`：HTTP 接口入口
- `buildProgressService`：前端构建进度与历史
- `websocketService`：实时事件推送
- 服务状态机：`starting`、`checking_health`、`stopping`、`restarting`、`failed`、`running`、`stopped`

目标是在不推翻现有代码的前提下，补齐以下 AI 自动化能力：

- `reload`：后端代码变更后的“编译 + 重启 + 健康检查”统一入口
- `jobId`：长耗时任务的统一异步抽象
- `GET /api/jobs/:jobId`：统一轮询入口
- `job:*` WebSocket 事件：统一任务进度语义
- 服务级 / 模块级锁：避免重复执行和状态漂移

## 2. 当前代码职责与问题

### 2.1 当前职责分布

### `backend/routes/services.js`

当前负责：

- 服务目录查询
- 服务状态查询
- `start/stop/restart`
- `start-all/stop-all/restart-all`

### `backend/controllers/serviceController.js`

当前负责：

- 参数校验
- 状态冲突判断
- 直接调用 `processManager`
- 返回同步结果

### `backend/services/processManager.js`

当前负责：

- 服务启动、停止、重启
- 服务状态收敛与健康检查回收
- 批量启动停止
- 前端构建执行
- 构建取消

### `backend/controllers/buildController.js`

当前负责：

- 初始化构建任务
- 立即返回构建已开始
- 在后台调用 `processManager.executeBuild`
- 构建完成后通过 WebSocket 通知前端

### `backend/services/buildProgressService.js`

当前负责：

- 维护 `buildId`
- 构建步骤进度
- 构建历史
- 构建取消态

### `backend/services/websocketService.js`

当前负责：

- WebSocket 连接与订阅
- 广播日志、构建进度、服务状态

### 2.2 当前问题

### 问题 1：缺少统一任务模型

当前只有前端构建有 `buildId`，服务重启和未来的 `reload` 没有统一 `jobId`，导致：

- AI 无法统一轮询长任务
- 前端与自动化脚本要分别理解不同返回结构
- WebSocket 事件存在 `build:*` 与 `service:status` 两种不同语义层级

### 问题 2：控制器直接依赖 `processManager`

`serviceController` 与 `buildController` 现在都直接调用 `processManager`，导致 HTTP 层、任务层、系统执行层耦合在一起。

### 问题 3：缺少 `reload`

当前没有“编译后端再重启”的统一入口，AI 无法稳定表达“我改了后端代码，现在需要一次可靠刷新”。

### 问题 4：并发控制不统一

虽然 `serviceController` 已对忙状态做了部分拦截，但：

- 还没有真正的服务级互斥锁
- 模块构建没有统一锁
- 将来 `reload` 与 `build(autoRestart)` 会有交叉冲突

### 问题 5：系统命令路径仍有潜在风险

之前已经出现过：

- `spawn ./mvnw ENOENT`

这说明长任务落地时，命令路径必须统一改为绝对路径或 `cwd + 可执行文件绝对路径`，否则 `reload` 很容易再次踩坑。

## 3. 推荐的后端分层

在当前仓库结构下，建议新增一层“任务编排服务”，而不是把所有逻辑继续堆进 `controller` 或 `processManager`。

### 3.1 推荐分层

#### Route

只负责：

- URL 映射
- 挂载 controller

#### Controller

只负责：

- 参数解析与校验
- 调用编排服务
- 输出 HTTP 状态码与响应体

#### Orchestration Service

新增，负责：

- 创建 `job`
- 申请资源锁
- 调用 `processManager`
- 汇总阶段进度
- 失败回滚与结构化结果
- 广播 `job:*` 事件

#### Process Service

沿用 `processManager`，只负责：

- 真正执行系统命令
- 进程启动停止与 PID 管理
- 健康检查收敛
- 构建命令执行

#### State / Progress Service

- `jobService`：统一任务状态
- `buildProgressService`：保留前端构建步骤细节，作为构建领域专用补充

## 4. 建议新增 / 调整的文件

### 4.1 新增文件

### `backend/routes/jobs.js`

用途：统一任务查询接口。

建议路由：

- `GET /api/jobs/:jobId`
- `GET /api/jobs/active`
- `GET /api/jobs/history/recent`
- `POST /api/jobs/:jobId/cancel`（第二阶段再做，第一阶段可只保留构建取消）

### `backend/controllers/jobController.js`

用途：任务查询与取消入口。

### `backend/services/jobService.js`

用途：统一维护所有异步任务。

建议职责：

- `createJob()`
- `startJob()`
- `updateJob()`
- `completeJob()`
- `failJob()`
- `cancelJob()`
- `getJob()`
- `getActiveJobs()`
- `getRecentJobs()`
- `acquireLock()` / `releaseLock()`

### `backend/services/serviceTaskService.js`

用途：服务类任务的编排层。

建议职责：

- `startService(serviceId)`
- `stopService(serviceId)`
- `restartService(serviceId)`
- `reloadService(serviceId)`
- `startAllServices()`
- `restartAllServices()`

说明：

- 这里不是替代 `processManager`
- 而是把“任务管理 + 锁 + 事件 + 结构化结果”从 `processManager` 上层剥离出来

### 4.2 调整现有文件

### `backend/routes/services.js`

新增：

- `POST /:id/reload`

后续可保留：

- `POST /:id/start`
- `POST /:id/stop`
- `POST /:id/restart`

### `backend/routes/build.js`

保留：

- `GET /modules`
- `POST /frontend`
- `POST /frontend/batch`

但响应体建议统一返回 `jobId`。

### `backend/server.js`

新增挂载：

- `app.use('/api/jobs', jobRoutes)`

### `backend/controllers/serviceController.js`

新增方法：

- `reload(req, res)`

改造方法：

- `start(req, res)`
- `stop(req, res)`
- `restart(req, res)`

改造方向：

- 从“同步返回 processManager 执行结果”
- 改为“返回 `202 Accepted + jobId`”

### `backend/controllers/buildController.js`

改造方向：

- 保持当前语义
- 但把 `buildId` 升级为统一 `jobId`
- 同时继续兼容返回 `buildId`，避免前端一次性全改

### `backend/services/processManager.js`

新增能力：

- `compileService(serviceId, serviceConfig, options)`
- 统一内部命令执行 helper
- 所有 `mvnw` / `npm` 路径改为绝对路径

保留能力：

- `start`
- `stop`
- `restart`
- `getStatus`
- `getAllStatus`
- `initBuild`
- `executeBuild`
- `cancelBuild`

### `backend/services/buildProgressService.js`

改造方向：

- 保留构建步骤与历史
- 在关键生命周期同步更新 `jobService`
- 中长期再考虑是否完全并入 `jobService`

### `backend/services/websocketService.js`

新增方法：

- `broadcastJobProgress(job)`
- `broadcastJobCompleted(job)`
- `broadcastJobFailed(job)`

保留兼容：

- `broadcastBuildProgress()`
- `broadcastServiceStatus()`

## 5. 具体实现方案

### 5.1 第一步：先引入统一 `jobService`

这是整个改造的基础。

### 建议的数据结构

```js
{
  id: 'job_xxx',
  type: 'service.reload',
  targetType: 'service',
  targetId: 'gateway',
  status: 'pending',
  stage: 'prepare',
  progress: 0,
  message: '任务已创建',
  startedAt: null,
  finishedAt: null,
  error: null,
  result: null,
  metadata: {}
}
```

### 建议缓存键

- `job:{jobId}`
- `job:history`
- `lock:service:{serviceId}`
- `lock:module:{moduleId}`

### 为什么先做它

因为后面的：

- `reload`
- `restart`
- `build`
- WebSocket 统一事件

都需要一个统一任务中心。

### 5.2 第二步：新增 `serviceTaskService`

这个服务负责把“服务控制”包装成异步任务。

### `restartService(serviceId)` 推荐流程

1. 校验服务 ID
2. 申请 `lock:service:{serviceId}`
3. 创建 `service.restart` 任务
4. 推进任务到 `stop_old_process`
5. 调用 `processManager.stop()`
6. 推进任务到 `start_new_process`
7. 调用 `processManager.start()`
8. 推进任务到 `health_check`
9. 轮询 `processManager.getStatus()` 或 `healthChecker.waitForHealthy()`
10. 完成任务并释放锁

### `reloadService(serviceId)` 推荐流程

1. 校验服务 ID
2. 申请 `lock:service:{serviceId}`
3. 创建 `service.reload` 任务
4. 推进任务到 `compile`
5. 调用 `processManager.compileService()`
6. 推进任务到 `stop_old_process`
7. 调用 `processManager.stop()`
8. 推进任务到 `start_new_process`
9. 调用 `processManager.start()`
10. 推进任务到 `health_check`
11. 健康检查通过后完成任务
12. 任一阶段失败则标记失败并释放锁

### 为什么不直接放进 `serviceController`

因为控制器不适合承载：

- 任务状态推进
- 锁管理
- WebSocket 推送
- 阶段化错误处理

### 5.3 第三步：在 `processManager` 中补 `compileService()`

推荐新增方法：

### `compileService(serviceId, serviceConfig, options = {})`

建议职责：

- 执行 Maven compile / package
- 采集 stdout/stderr
- 失败时抛出结构化错误
- 不直接操作 HTTP 或 `job`

### 推荐实现细节

#### 1）命令路径必须绝对化

不要再使用：

- `./mvnw`

建议使用：

- `const mvnw = path.join(config.projectRoot, 'mvnw')`

如果是 Windows 兼容需求，再补：

- `mvnw.cmd`

#### 2）`cwd` 必须使用 `config.projectRoot`

这样 `-f framework/eureka/pom.xml` 这类参数才能稳定工作。

#### 3）复用统一命令执行 helper

当前构建已经有 `_runCommandWithProgress()`，但它偏向前端构建步骤。

建议拆成两层：

- `_runCommand()`：通用命令执行
- `_runCommandWithProgress()`：构建专用包装

这样 `compileService()` 就可以复用 `_runCommand()`。

### 推荐命令

```bash
${projectRoot}/mvnw -f <service.pom> -DskipTests compile
```

如果某些服务需要更重的流程，再允许按服务配置覆盖为 `package`。

### 5.4 第四步：Controller 改成返回异步任务

### `backend/controllers/serviceController.js`

### 建议改法

#### `start(req, res)`

- 继续保留给 UI 使用
- 第一阶段可以保持同步，减少前端联动成本
- 第二阶段再切换到 `202 + jobId`

#### `restart(req, res)`

建议改为：

- 调用 `serviceTaskService.restartService(id)`
- 返回 `202`

示例响应：

```json
{
  "success": true,
  "data": {
    "jobId": "job_xxx",
    "type": "service.restart",
    "status": "pending"
  }
}
```

#### `reload(req, res)`

新增：

- 调用 `serviceTaskService.reloadService(id)`
- 返回 `202`

### 为什么 `start` 可以慢一步改

因为当前前端服务管理页已经依赖 `start/stop/restart` 的同步交互习惯；为了降低联动范围，建议先把 AI 重点需要的 `restart/reload` 异步化，`start/stop` 可后移。

## `backend/controllers/buildController.js`

### 建议改法

保留当前后台执行模型，但要新增统一 job 映射：

1. 初始化 `buildProgressService.startBuild()` 时，同时创建 `frontend.build` job
2. 返回结构同时带：
   - `jobId`
   - `buildId`（兼容字段）
3. `executeBuild()` 期间同步更新 `jobService`
4. 构建完成或失败时同步广播 `job:completed` / `job:failed`

### 5.5 第五步：补 `jobs` 路由与查询能力

### `backend/routes/jobs.js`

建议先做三个接口：

- `GET /api/jobs/:jobId`
- `GET /api/jobs/active`
- `GET /api/jobs/history/recent?limit=20`

### `backend/controllers/jobController.js`

方法建议：

- `getJob(req, res)`
- `getActiveJobs(req, res)`
- `getRecentJobs(req, res)`

### 与现有 `progress` 路由的关系

第一阶段建议：

- 保留 `progress` 路由不动，避免前端构建页立即大改
- 新增 `jobs` 路由给 AI 与未来前端统一使用

第二阶段再考虑：

- 将 `progress` 标注为构建领域兼容接口
- 新前端优先走 `jobs`

### 5.6 第六步：统一 WebSocket 事件

### 当前状态

当前项目已有：

- `service:status`
- `build:progress`
- `build:completed`
- `build:batchCompleted`

### 建议新增

- `job:progress`
- `job:completed`
- `job:failed`
- `job:cancelled`

### 推荐广播时机

#### 在 `jobService.updateJob()` 中

广播：

- `job:progress`

#### 在 `jobService.completeJob()` 中

广播：

- `job:completed`

#### 在 `jobService.failJob()` 中

广播：

- `job:failed`

这样可以把任务广播逻辑从 controller / processManager 中抽出来。

### 5.7 第七步：补真正的资源锁

### 为什么当前还不够

`serviceController` 里现在用的是：

- `BUSY_SERVICE_PHASES`

这只能拦截“状态上看起来在忙”，但不能解决：

- 两个并发请求几乎同时进入
- 一个构建任务触发 autoRestart，同时人工点击 restart

### 建议实现

在 `jobService` 中直接维护 Redis 锁：

- `lock:{resourceKey} -> jobId`（Redis key）

第一阶段也直接使用 Redis 锁，避免任务状态与锁策略分裂。

### 推荐资源键

- `service:gateway`
- `module:gateway-ui`
- `build:gateway-ui`

## 6. 推荐的具体改动顺序

### 阶段 1：低风险接入

目标：不影响现有前端交互，先把 AI 能力搭起来。

### 改动列表

1. 新增 `backend/services/jobService.js`
2. 新增 `backend/routes/jobs.js`
3. 新增 `backend/controllers/jobController.js`
4. 在 `backend/server.js` 挂载 `/api/jobs`
5. 在 `backend/services/processManager.js` 新增 `compileService()`
6. 在 `backend/services/websocketService.js` 新增 `broadcastJob*()`
7. 新增 `backend/services/serviceTaskService.js`
8. 在 `backend/controllers/serviceController.js` 新增 `reload()`
9. 在 `backend/routes/services.js` 新增 `POST /:id/reload`

### 阶段 1 的兼容策略

- `start/stop/restart` 原接口暂时不强改
- 先新增 `reload` 和 `jobs`
- 前端构建继续走 `progress`
- AI 新流程优先走 `reload + jobs`

### 阶段 2：统一任务模型

### 改动列表

1. `buildController` 返回 `jobId + buildId`
2. `buildProgressService` 同步镜像到 `jobService`
3. WebSocket 前端同时支持 `build:*` 与 `job:*`
4. `restart` 改为 `202 + jobId`

### 阶段 3：进一步收敛

### 改动列表

1. `start/stop` 也迁移到任务模型
2. 批量服务控制与批量构建统一进入 `jobService`
3. `progress` 路由降级为构建兼容接口
4. 统一结构化错误码

## 7. 每个文件的具体修改建议

### `backend/routes/services.js`

新增：

```js
router.post('/:id/reload', serviceController.reload);
```

保持：

- 查询接口不变
- `start/stop/restart` 暂时不删

## `backend/controllers/serviceController.js`

新增依赖：

- `const serviceTaskService = require('../services/serviceTaskService');`

新增方法：

- `reload(req, res)`

建议返回：

- `202 Accepted`
- `jobId`

同时建议把重复的“服务忙判断”抽成私有 helper，避免 `start/stop/restart/reload` 四处复制。

### `backend/services/processManager.js`

建议新增方法：

- `compileService()`
- `_runCommand()`
- `_resolveMavenWrapperPath()`

同时补一条明确规则：

- 任何外部命令都不再依赖“当前 shell 在哪”，必须显式传 `cwd`

### `backend/services/buildProgressService.js`

建议新增一个可选字段：

- `jobId`

这样后续前端可以从 `buildId` 平滑过渡到 `jobId`。

### `backend/services/websocketService.js`

建议新增：

- `broadcastJobProgress(job)`
- `broadcastJobCompleted(job)`
- `broadcastJobFailed(job)`

不建议让 controller 自己直接拼 WebSocket 消息。

### `backend/server.js`

新增：

```js
const jobRoutes = require('./routes/jobs');
app.use('/api/jobs', jobRoutes);
```

## 8. 推荐的响应策略

### 8.1 查询接口

保持 `200`。

### 8.2 长耗时写操作

统一改为 `202`：

- `POST /api/services/:id/reload`
- 后续的 `POST /api/services/:id/restart`
- 后续统一任务化后的 `POST /api/build/frontend`

### 8.3 冲突场景

统一返回 `409`，不要再混用：

- `200 + success=false`

### 8.4 错误结构

建议从字符串过渡为结构化对象：

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

## 9. 一个最小可行实现的真实调用链

以 `POST /api/services/eureka/reload` 为例：

1. `services.js` 路由命中 `serviceController.reload`
2. `serviceController.reload` 校验 `eureka` 合法
3. `serviceTaskService.reloadService('eureka')` 创建 `job`
4. `jobService.acquireLock('service:eureka')`
5. `jobService.updateJob(stage='compile')`
6. `processManager.compileService('eureka', serviceConfig)`
7. `jobService.updateJob(stage='stop_old_process')`
8. `processManager.stop('eureka', serviceConfig)`
9. `jobService.updateJob(stage='start_new_process')`
10. `processManager.start('eureka', serviceConfig)`
11. `jobService.updateJob(stage='health_check')`
12. `healthChecker.waitForHealthy('eureka')`
13. `jobService.completeJob()`
14. `jobService.releaseLock('service:eureka')`
15. WebSocket 推送 `job:completed`

这样就能把“Eureka reload”从一次脆弱的同步按钮动作，变成一次可查询、可观察、可追踪的标准任务。

## 10. 最终建议

如果按当前仓库结构落地，我建议不要一步到位把所有接口都改掉，而是按下面顺序推进：

1. 先加 `jobService`
2. 再加 `serviceTaskService`
3. 再加 `POST /api/services/:id/reload`
4. 再补 `GET /api/jobs/:jobId`
5. 最后把 `restart/build` 逐步纳入统一任务模型

这样做的好处是：

- 对现有前端冲击最小
- 能最快给 AI 提供真正可用的接口
- 不需要一次性重写 `processManager`
- 可以平滑解决此前 `./mvnw ENOENT` 这类命令路径问题

如果继续往下做，下一步最合适的是直接开始代码实现阶段 1：先把 `jobService + jobs 路由 + reload 接口骨架` 搭起来。

## 11. 生产运维基线（已合并）

基于评审反馈，阶段 1 不再把持久化、超时、恢复、测试和观测推迟到后续阶段，而是直接纳入最小生产基线。

### 11.1 Redis 持久化策略

阶段 1 直接采用 Redis，不再以纯内存作为主存储。

持久化范围：

- 所有异步任务：`service.restart`、`service.reload`、`frontend.build`
- 所有资源锁：服务级锁、模块级锁、批量操作锁
- 最近任务历史与目标对象索引

推荐 Redis key：

- `job:{jobId}`
- `job:active`
- `job:history`
- `lock:service:{serviceId}`
- `lock:module:{moduleId}`
- `lock:batch:services`
- `job:index:target:{targetType}:{targetId}`

推荐 TTL：

- `job:{jobId}`：默认 `24h`
- 失败任务详情：至少 `72h`
- `job:history`：最近 `200` 条
- `lock:*`：默认 `10min`，并支持续期

控制面板启动时必须执行一次恢复扫描：

1. 读取 `job:active`
2. 重新加载 `pending/running` 任务
3. 复核服务或构建的真实状态
4. 将任务收敛为 `succeeded_after_recovery`、`interrupted` 或 `recovery_pending`
5. 广播一次恢复后的任务事件

Redis 降级策略：

- 若 Redis 在任务创建前不可用，直接拒绝新任务并返回 `503 REDIS_UNAVAILABLE`
- 不允许将任务系统降级到纯内存模式，避免锁和任务状态分裂
- 若 Redis 在任务执行过程中短暂不可用，停止接收新的控制任务，并在 Redis 恢复后执行一次任务状态补充收敛

### 11.2 锁与并发治理

`BUSY_SERVICE_PHASES` 只能拦截“状态上看起来很忙”的情况，不能解决真正的并发写入冲突。

阶段 1 直接使用 Redis 锁：

- `lock:{resourceKey} -> jobId`

推荐实现：

- `SET key value NX EX ttl`

锁值至少包含：

- `jobId`
- `createdAt`
- `targetId`
- `type`

解锁规则：

- 只有持有锁的 `jobId` 才能释放锁
- 阶段执行超过 `60s` 时，任务需要续期锁 TTL
- 若获取锁失败，统一返回 `409 RESOURCE_BUSY`

推荐资源键：

- `service:gateway`
- `module:gateway-ui`
- `batch:services`

### 11.3 超时与重试策略

每个任务必须同时具备：

- 阶段超时
- 总任务超时
- 超时后的结构化失败信息
- 仅针对瞬时失败的有限重试

推荐阶段超时：

| 任务类型 | 阶段 | 默认超时 |
| --- | --- | --- |
| `service.restart` | `prepare` | `10s` |
| `service.restart` | `stop_old_process` | `30s` |
| `service.restart` | `start_new_process` | `30s` |
| `service.restart` | `health_check` | `120s` |
| `service.reload` | `prepare` | `10s` |
| `service.reload` | `compile` | `300s` |
| `service.reload` | `stop_old_process` | `30s` |
| `service.reload` | `start_new_process` | `30s` |
| `service.reload` | `health_check` | `120s` |
| `frontend.build` | `prepare` | `15s` |
| `frontend.build` | `install_dependencies` | `300s` |
| `frontend.build` | `build_assets` | `300s` |
| `frontend.build` | `copy_assets` | `60s` |
| `frontend.build` | `notify_restart` | `30s` |

推荐总超时：

- `service.restart`：`180s`
- `service.reload`：`480s`
- `frontend.build`：`600s`

允许重试的场景：

- Redis 短暂超时
- 健康检查短时间连接拒绝或 5xx
- 端口监听尚未完成

不允许自动重试的场景：

- Maven 编译失败
- 配置错误
- 端口占用
- 显式用户取消

推荐重试上限：

- 健康检查额外探测 `3` 次，间隔 `3s`
- Redis 写入失败重试 `2` 次，间隔 `500ms`
- 锁续期失败重试 `2` 次

健康检查规范：

- 默认使用 HTTP GET `http://{host}:{port}{healthCheck}` 探测，推荐路径为 `/actuator/health`
- 若服务配置中已定义 `healthCheck`，以服务配置为准
- 探测间隔默认 `3s`
- 成功条件建议为：HTTP `200`，且响应体包含 `UP` 或显式健康标记
- `service.reload` 与 `service.restart` 的最大探测次数默认为 `40` 次，对应约 `120s` 总窗口

### 11.4 reload 失败恢复与补偿

`service.reload` 的关键风险在于：旧服务可能已经停掉，而新服务没有恢复起来。

阶段 1 必须内建显式补偿逻辑：

补偿启动规则：

- 补偿启动最多只允许 `1` 次
- 补偿启动阶段超时为 `60s`
- 补偿过程中继续持有原服务锁，不允许新的控制操作进入
- 补偿失败后不再递归重试，直接收敛到 `failed_service_down`

| 失败阶段 | 系统状态 | 补偿动作 | 最终任务状态 |
| --- | --- | --- | --- |
| `compile` | 旧服务仍在运行 | 不停服务，直接失败 | `failed_no_impact` |
| `stop_old_process` | 旧服务可能部分停止 | 复核进程状态，必要时补偿启动 | `failed_with_recovery` 或 `failed` |
| `start_new_process` | 旧服务已停，新服务未起 | 立即尝试一次补偿启动 | `recovered` 或 `failed_service_down` |
| `health_check` | 新进程已起但不健康 | 终止不健康进程，再尝试一次补偿启动 | `recovered_degraded` 或 `failed_service_down` |

最小补偿原则：

1. `compile` 失败时不影响旧服务
2. 一旦停掉旧服务，后续失败必须尝试一次补偿启动
3. 若补偿仍失败，任务状态必须显式收敛到 `failed_service_down`
4. 同时把服务状态收敛到 `failed`，并在 UI 与查询接口中暴露“服务可能不可用”

阶段 1 不建议实现“旧版本产物回滚”，因为当前控制面板并没有版本化产物仓库。

### 11.5 可观测性要求

所有任务必须输出结构化日志，至少包含：

- `jobId`
- `type`
- `targetId`
- `stage`
- `status`
- `elapsedMs`
- `errorCode`
- `errorMessage`

阶段 1 至少采集以下指标：

- 任务总数
- 成功任务数
- 失败任务数
- 超时任务数
- 平均任务耗时
- 各阶段耗时分布
- 当前活动任务数
- 当前锁数量
- `service.reload` 成功率
- `frontend.build` 失败率

失败时必须能追溯：

- 失败阶段
- 执行命令
- stdout 最后 N 行
- stderr 最后 N 行
- 是否持有锁
- 是否触发补偿动作
- 服务最终状态

### 11.6 测试策略

阶段 1 必须覆盖四类测试：

- 单元测试
- 集成测试
- 故障注入测试
- 恢复测试

最小测试清单：

- 创建任务后能写入 Redis
- 控制面板重启后能恢复任务并重建内存索引
- 任务完成后能从 `active` 移出并写入 `history`
- 两次并发 `restart` 同一服务时第二次返回 `409`
- `reload` 正常流转到 `running`
- `reload` 编译失败后旧服务保持不变
- `reload` 在停旧服务后启动失败时触发补偿启动
- `checking_health` 刷新后能收敛为 `running` 或 `failed`
- Redis 锁 TTL 到期后能自动释放

阶段 1 必测路径：

1. `service.reload` 正常路径
2. `service.reload` 编译失败路径
3. `service.reload` 停旧服务后失败路径
4. Redis 锁冲突路径
5. 控制面板重启后的恢复扫描路径

### 11.7 API 限流与防滥用

阶段 1 建议做最小限流，避免误触发造成服务抖动：

- 单服务 `restart/reload`：`30s` 内最多 `1` 次
- 单模块 `build`：`60s` 内最多 `1` 次
- 批量接口：`120s` 内最多 `1` 次

限流细化规则：

- 仅对真正进入 `running` 的任务计入限流窗口
- 参数错误、锁冲突、资源不存在等立即失败请求不计入限流
- 限流窗口起点为任务进入 `running` 状态的时间

建议基于 Redis 计数器实现：

- `rate:service:{id}:{window}`
- `rate:build:{module}:{window}`

命中限流时：

- 返回 `429 Too Many Requests`
- 错误码：`RATE_LIMITED`

### 11.8 批量任务语义

对 `start-all`、`restart-all`、`frontend/batch` 这类批量操作，建议统一采用“父任务 + 子任务”模型：

- 父任务负责汇总状态与对外展示
- 每个服务或模块对应一个独立子任务
- 子任务拥有自己的 `jobId`、阶段、日志和结果
- 部分失败不影响已开始的其他子任务

父任务最终状态建议支持：

- `all_succeeded`
- `partial_failed`
- `all_failed`

服务批量操作语义建议与当前 `startAll/restartAll` 行为保持一致：

- 默认按既定顺序逐个执行
- 某个子任务失败时，父任务保留已完成结果
- 是否触发回滚由具体批量类型决定，并在父任务结果中显式说明

### 11.9 对编排层复杂度的收敛要求

`serviceTaskService` 必须保持很薄，只负责：

- 任务创建与推进
- 锁申请与释放
- 超时控制
- 补偿逻辑
- 任务事件广播

真正的系统命令、进程管理、PID 收敛和健康检查仍然留在 `processManager`。

这意味着它不是第二个 `processManager`，而是把长任务编排从 controller 中剥离出来。

## 12. 修正后的阶段 1 范围

修正后，阶段 1 的范围应为：

1. `jobService` 基础框架
2. `Redis` 任务持久化与锁
3. `POST /api/services/:id/reload`
4. `GET /api/jobs/:jobId`
5. 超时与补偿机制
6. 恢复扫描
7. 基础日志与关键路径测试

如果缺少第 2、5、6 项，则只能算“原型能力”，不能算“生产可用能力”。

## 13. 最终建议

推荐实施顺序保持不变，但阶段 1 的交付定义必须升级为“生产基线”，而不是“接口骨架”：

1. 先增强 `cacheService`，补齐 Redis 锁与任务索引能力
2. 实现 `jobService`，由 Redis 承担主存储
3. 实现 `service.reload` 的超时、补偿与恢复扫描
4. 增加 `jobs` 查询接口与 `job:*` 事件
5. 最后再把 `restart/build` 逐步并入统一任务模型

这样交付出来的不是“看起来有任务系统”，而是一套在失败时也能解释清楚、在控制面板重启后也能收敛状态的可运维方案。
