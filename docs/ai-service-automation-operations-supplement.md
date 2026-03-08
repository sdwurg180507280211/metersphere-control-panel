# AI 自动化服务控制运维补充规范

## 1. 文档目的

本文档是对 `ai-service-automation-implementation-plan.md` 的运维细节补充，专门覆盖在评审中识别出的需要进一步明确的关键点。

## 2. Redis 可用性与降级策略（补充 11.1）

### 2.1 Redis 连接失败处理

**启动阶段：**
- 控制面板启动时若 Redis 不可用，记录警告日志但允许启动
- 任务系统标记为 `degraded` 模式
- 所有控制接口返回 `503 SERVICE_UNAVAILABLE`，错误码 `REDIS_UNAVAILABLE`

**运行阶段：**
- 任务创建前检测 Redis 连接状态
- 若 Redis 不可用，拒绝新任务并返回 `503 REDIS_UNAVAILABLE`
- 已运行任务继续执行，但状态更新失败时记录到本地日志

**恢复阶段：**
- Redis 恢复后，执行一次状态补充收敛
- 从本地日志中提取任务状态变更记录
- 将缺失的状态更新补写到 Redis
- 任务系统退出 `degraded` 模式

### 2.2 不允许的降级行为

**明确禁止：**
- 不允许在 Redis 不可用时切换到纯内存模式
- 不允许在 Redis 不可用时继续接受新的控制任务
- 不允许在 Redis 不可用时创建新的资源锁

**原因：**
- 避免锁状态分裂（内存锁与 Redis 锁不一致）
- 避免任务状态漂移（重启后无法恢复）
- 确保控制操作的确定性

### 2.3 Redis 短暂抖动处理

**定义短暂抖动：**
- 连接超时 < 3s
- 命令执行失败但连接未断开
- 网络瞬时波动

**处理策略：**
- Redis 写入失败时重试 2 次，间隔 500ms
- 锁续期失败时重试 2 次，间隔 500ms
- 若重试仍失败，任务标记为 `redis_write_failed`
- 任务继续执行但状态可能不完整，需要恢复扫描补齐

## 3. 补偿启动递归控制（补充 11.4）

### 3.1 补偿启动规则

**触发条件：**
- `stop_old_process` 成功后，`start_new_process` 失败
- `start_new_process` 成功后，`health_check` 超时或失败

**补偿次数限制：**
- 每个 `reload` 任务最多触发 1 次补偿启动
- 补偿启动本身不再触发递归补偿

**补偿超时：**
- 补偿启动阶段超时：60s
- 补偿健康检查超时：60s
- 补偿总超时：120s

### 3.2 补偿失败后的状态收敛

**任务状态：**
- 补偿成功：`recovered` 或 `recovered_degraded`
- 补偿失败：`failed_service_down`

**服务状态：**
- 补偿成功：`running`（健康）或 `failed`（不健康）
- 补偿失败：`failed`

**锁释放：**
- 无论补偿成功或失败，必须释放服务锁
- 释放锁后允许人工介入修复

### 3.3 补偿过程中的并发控制

**锁持有：**
- 补偿过程中继续持有原服务锁
- 不允许新的控制操作进入
- 其他请求返回 `409 SERVICE_BUSY`，并在 `details` 中说明"正在执行补偿启动"

**补偿日志：**
- 补偿启动必须记录独立的日志条目
- 日志中包含 `compensation: true` 标记
- 记录补偿原因、补偿结果、服务最终状态

## 4. 健康检查实现规范（补充 11.3）

### 4.1 健康检查方式

**默认实现：**
```
HTTP GET http://{host}:{port}{healthCheckPath}
```

**路径优先级：**
1. 服务配置中的 `healthCheck` 字段
2. 默认路径 `/actuator/health`（Spring Boot 标准）
3. 若服务未定义健康检查路径，使用端口探测

**端口探测：**
- 使用 TCP 连接探测端口是否监听
- 仅用于无 HTTP 健康检查的服务
- 探测成功不代表服务健康，只代表端口可达

### 4.2 健康检查参数

**探测间隔：**
- 默认 3s
- 可在服务配置中覆盖

**成功条件：**
- HTTP 状态码 200
- 响应体包含 `"status":"UP"` 或 `"UP"`（大小写不敏感）
- 响应时间 < 5s

**失败条件：**
- HTTP 状态码 5xx
- 连接超时（5s）
- 连接拒绝
- 响应体不包含健康标记

**最大探测次数：**
- `service.restart`：40 次（约 120s）
- `service.reload`：40 次（约 120s）
- 补偿启动：20 次（约 60s）

### 4.3 健康检查重试策略

**允许重试的场景：**
- 连接拒绝（服务可能正在启动）
- 5xx 错误（服务可能正在初始化）
- 响应超时（服务可能负载高）

**不允许重试的场景：**
- 404（健康检查路径错误，立即失败）
- 端口占用（无法启动，立即失败）
- 配置错误（无法启动，立即失败）

**重试间隔：**
- 前 10 次：每 3s 探测一次
- 后 30 次：每 3s 探测一次
- 总窗口约 120s

## 5. 批量操作原子性与子任务模型（补充 11.8）

### 5.1 批量操作任务结构

**父任务：**
```json
{
  "jobId": "job_batch_xxx",
  "type": "service.restart.batch",
  "status": "running",
  "subJobs": [
    "job_xxx_1",
    "job_xxx_2",
    "job_xxx_3"
  ],
  "summary": {
    "total": 3,
    "succeeded": 1,
    "failed": 1,
    "running": 1
  }
}
```

**子任务：**
```json
{
  "jobId": "job_xxx_1",
  "type": "service.restart",
  "targetId": "gateway",
  "parentJobId": "job_batch_xxx",
  "status": "succeeded"
}
```

### 5.2 批量操作执行策略

**顺序执行：**
- 默认按服务启动顺序（`startOrder`）执行
- 前一个服务完成后再启动下一个
- 避免资源竞争和依赖冲突

**并发执行（可选）：**
- 若服务间无依赖，可并发执行
- 第一阶段不实现，保持顺序执行

**失败处理：**
- 某个子任务失败时，记录失败原因
- 继续执行后续子任务（不中断）
- 父任务状态收敛为 `partial_failed`

### 5.3 批量操作最终状态

**父任务状态：**
- `all_succeeded`：所有子任务成功
- `partial_failed`：部分子任务失败
- `all_failed`：所有子任务失败

**回滚策略：**
- 第一阶段不实现自动回滚
- 失败时保留已完成的子任务结果
- 由用户决定是否手动回滚

**查询接口：**
- `GET /api/jobs/:parentJobId` 返回父任务和子任务列表
- `GET /api/jobs/:parentJobId/sub` 返回所有子任务详情

## 6. 限流策略细化（补充 11.7）

### 6.1 限流计入规则

**计入限流的请求：**
- 任务成功进入 `running` 状态
- 窗口起点：任务进入 `running` 的时间戳

**不计入限流的请求：**
- 参数错误（400）
- 服务不存在（404）
- 锁冲突（409）
- Redis 不可用（503）

**原因：**
- 立即失败的请求不消耗系统资源
- 避免用户因参数错误被限流

### 6.2 限流窗口设计

**Redis 实现：**
```
key: rate:service:{serviceId}
value: {jobId}:{timestamp}
TTL: 30s（与限流窗口一致）
```

**检查逻辑：**
1. 尝试 `SET rate:service:{serviceId} {jobId}:{now} NX EX 30`
2. 若成功，允许任务创建
3. 若失败，读取现有值判断是否过期
4. 若未过期，返回 `429 RATE_LIMITED`

### 6.3 限流错误响应

**响应示例：**
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "服务操作过于频繁，请稍后再试",
    "details": {
      "serviceId": "gateway",
      "retryAfter": 15,
      "lastJobId": "job_xxx"
    }
  }
}
```

**HTTP 头：**
```
HTTP/1.1 429 Too Many Requests
Retry-After: 15
```

## 7. 标准错误码体系（补充第 8 节）

### 7.1 错误码分类

**参数错误（4xx）：**
- `INVALID_SERVICE_ID`：服务 ID 不存在
- `INVALID_MODULE_ID`：模块 ID 不存在
- `INVALID_PARAMETER`：参数格式错误

**资源冲突（409）：**
- `SERVICE_BUSY`：服务已有任务执行中
- `MODULE_BUSY`：模块已有构建任务执行中
- `LOCK_ACQUIRE_FAILED`：获取锁失败

**执行失败（5xx）：**
- `COMPILE_FAILED`：编译失败
- `START_FAILED`：启动失败
- `STOP_FAILED`：停止失败
- `HEALTH_CHECK_TIMEOUT`：健康检查超时
- `HEALTH_CHECK_FAILED`：健康检查失败

**系统错误（503）：**
- `REDIS_UNAVAILABLE`：Redis 不可用
- `INTERNAL_ERROR`：内部错误

**限流（429）：**
- `RATE_LIMITED`：触发限流

### 7.2 错误响应结构

**标准格式：**
```json
{
  "success": false,
  "error": {
    "code": "COMPILE_FAILED",
    "message": "服务编译失败",
    "details": {
      "serviceId": "gateway",
      "stage": "compile",
      "command": "./mvnw compile",
      "exitCode": 1,
      "stderr": "..."
    }
  }
}
```

**必需字段：**
- `code`：错误码
- `message`：用户友好的错误描述

**可选字段：**
- `details`：结构化错误详情
- `retryable`：是否可重试
- `retryAfter`：建议重试时间（秒）

## 8. 恢复扫描实现细节（补充 11.1）

### 8.1 恢复扫描触发时机

**启动时扫描：**
- 控制面板启动后立即执行
- 在接受新任务前完成

**定期扫描（可选）：**
- 每 5 分钟执行一次
- 检测长时间停留在 `running` 的任务

### 8.2 恢复扫描流程

**步骤 1：加载活动任务**
```
SMEMBERS job:active
```

**步骤 2：复核任务状态**
- 对每个 `pending/running` 任务：
  - 检查目标服务或模块的真实状态
  - 对比任务状态与真实状态

**步骤 3：状态收敛**
- 若服务已运行且健康，任务收敛为 `succeeded_after_recovery`
- 若服务已停止，任务收敛为 `interrupted`
- 若服务状态不明，任务收敛为 `recovery_pending`

**步骤 4：清理与通知**
- 从 `job:active` 移除已完成任务
- 释放孤儿锁（无对应活动任务的锁）
- 广播恢复后的任务事件

### 8.3 孤儿锁清理

**识别孤儿锁：**
- 锁的 `jobId` 不在 `job:active` 中
- 锁的 TTL 已过期但未释放

**清理策略：**
- 强制删除孤儿锁
- 记录清理日志
- 不影响正常任务执行

## 9. 实施优先级总结

### 9.1 必须在阶段 1 实现

- Redis 持久化与锁
- 超时与补偿机制
- 恢复扫描
- 健康检查规范
- 标准错误码
- 关键路径测试

### 9.2 可在阶段 2 实现

- 批量操作子任务模型
- 定期恢复扫描
- 限流细化规则
- Redis 降级策略优化

### 9.3 可在阶段 3 实现

- 批量操作并发执行
- 自动回滚机制
- 更细粒度的可观测性指标

## 10. 与主文档的关系

本文档是 `ai-service-automation-implementation-plan.md` 的补充，不替代主文档。

**使用方式：**
- 主文档定义整体架构和实施路径
- 本文档明确运维细节和边界条件
- 实施时两份文档配合使用

**冲突处理：**
- 若本文档与主文档冲突，以本文档为准
- 本文档是对主文档的细化和补充
