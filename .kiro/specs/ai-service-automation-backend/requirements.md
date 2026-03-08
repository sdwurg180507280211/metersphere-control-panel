# AI 自动化服务控制后端 Requirements

## Spec Metadata

- 类型：Feature Spec
- Workflow：Design-First
- 来源文档：
  - `docs/ai-service-automation-implementation-plan.md`
  - `docs/ai-service-automation-api.md`
  - `docs/ai-service-automation-operations-supplement.md`

## 背景

当前 `metersphere-control-panel` 已具备服务启停、前端构建、构建进度和 WebSocket 推送能力，但面向 AI 自动化调用时仍缺少统一任务模型、可轮询查询入口、确定性的 `reload` 流程、跨资源锁治理，以及生产可用的 Redis 持久化与恢复机制。

本 spec 的目标是在不推翻现有 `backend/routes -> controllers -> services` 分层的前提下，引入统一任务编排能力，让服务控制与前端构建都能被 AI agent 稳定调用、观察、恢复和回溯。

## 关键术语

- **Job / `jobId`**：统一异步任务抽象，用于表示服务控制、构建或批量操作这类长耗时写任务。
- **Reload**：后端代码变更后的统一刷新动作，语义为“编译 -> 停止旧进程 -> 启动新进程 -> 健康检查”。
- **资源锁**：对服务、模块或批量操作对象施加的互斥控制，防止并发写操作导致状态漂移。
- **恢复扫描**：控制面板启动后对 Redis 中的活动任务、锁状态和真实运行态进行重新收敛的过程。
- **兼容期**：统一 `jobId` 已引入，但仍保留旧字段、旧事件或旧接口语义以支持平滑迁移的阶段。
- **补偿启动**：在 `reload` 过程中启动或健康检查失败后触发的一次性恢复动作，用于尽量恢复服务可用性。

## User Story 1 - AI agent 可稳定触发长耗时控制任务

### Requirement 1.1
WHEN 客户端触发任一长耗时控制操作（包括 `service.reload`、`service.restart`、`frontend.build` 或后续批量操作）
THE SYSTEM SHALL 创建一个统一的异步任务对象，并为其分配全局唯一的 `jobId`。

### Requirement 1.2
WHEN 异步任务被创建
THE SYSTEM SHALL 记录统一字段，包括任务类型、目标对象、状态、阶段、进度、消息、开始时间、结束时间、错误信息、执行结果和元数据。

### Requirement 1.3
WHEN 客户端调用 `GET /api/jobs/:jobId`
THE SYSTEM SHALL 返回该任务的最新状态快照，而不要求客户端推测任务是否已经完成。

### Requirement 1.4
WHEN 客户端调用活动任务或最近任务列表接口
THE SYSTEM SHALL 返回统一任务视图，以支持控制面板和 AI agent 查询当前执行态与最近历史。

## User Story 2 - 后端代码变更后可以可靠执行 reload

### Requirement 2.1
WHEN 客户端调用 `POST /api/services/:id/reload`
THE SYSTEM SHALL 按照“编译 -> 停止旧进程 -> 启动新进程 -> 健康检查”的顺序执行该服务的刷新流程。

### Requirement 2.2
WHEN `reload` 任务启动
THE SYSTEM SHALL 立即返回 `202 Accepted` 和 `jobId`，而不是阻塞到任务完成。

### Requirement 2.3
WHEN `reload` 的任一阶段失败
THE SYSTEM SHALL 返回结构化失败信息，并保留任务阶段、失败原因和目标服务标识用于诊断。

### Requirement 2.4
WHEN `reload` 在旧进程停止后失败或健康检查失败
THE SYSTEM SHALL 最多触发一次补偿启动，以尽量恢复服务可用性，并避免递归补偿。

## User Story 3 - 服务启停与重启也应纳入统一任务模型

### Requirement 3.1
WHEN 客户端调用 `POST /api/services/:id/start`、`POST /api/services/:id/stop` 或 `POST /api/services/:id/restart`
THE SYSTEM SHALL 通过统一任务编排层执行这些操作，而不是由 controller 直接调用底层进程管理器。

### Requirement 3.2
WHEN 服务控制任务进入执行阶段
THE SYSTEM SHALL 为每个服务维护可观察的阶段值与最终状态，以便前端状态展示和 AI 轮询查询保持一致。

### Requirement 3.3
WHEN 服务控制任务完成或失败
THE SYSTEM SHALL 将服务状态收敛为真实运行态、健康态或失败态，而不是停留在中间过渡态。

## User Story 4 - 前端构建需要平滑升级到统一 job 模型

### Requirement 4.1
WHEN 客户端调用 `POST /api/build/frontend` 或 `POST /api/build/frontend/batch`
THE SYSTEM SHALL 为构建任务分配统一 `jobId`，同时在兼容期继续保留现有 `buildId` 语义。

### Requirement 4.2
WHEN 构建任务执行过程中产生阶段进度
THE SYSTEM SHALL 同步维护构建领域明细和统一任务状态，避免前端构建进度与统一任务状态脱节。

### Requirement 4.3
WHEN 构建任务与服务控制任务访问同一模块或关联服务
THE SYSTEM SHALL 使用统一锁治理冲突并返回可诊断的冲突信息。

## User Story 5 - 资源锁与并发治理必须防止状态漂移

### Requirement 5.1
WHEN 任一服务级、模块级或批量级写操作即将开始
THE SYSTEM SHALL 先尝试获取对应资源锁，再进入执行态。

### Requirement 5.2
WHEN 资源锁获取失败
THE SYSTEM SHALL 返回 `409` 冲突响应和结构化错误码（如 `SERVICE_BUSY`、`MODULE_BUSY` 或 `LOCK_ACQUIRE_FAILED`）。

### Requirement 5.3
WHEN 任务持有锁超过锁 TTL 的主要执行窗口
THE SYSTEM SHALL 对该锁执行续期，以避免长任务执行中锁意外过期。

### Requirement 5.4
WHEN 任务完成、失败或被恢复逻辑收敛
THE SYSTEM SHALL 仅允许持有该锁的 `jobId` 释放该锁。

## User Story 6 - 任务状态与锁必须可持久化、可恢复

### Requirement 6.1
WHEN 系统创建任务、维护活动任务、记录最近历史或维护资源锁
THE SYSTEM SHALL 使用 Redis 作为持久化存储，而不是退化为纯内存主模型。

### Requirement 6.2
WHEN Redis 在任务创建前不可用
THE SYSTEM SHALL 拒绝新的控制任务并返回 `503 REDIS_UNAVAILABLE`。

### Requirement 6.3
WHEN 控制面板启动
THE SYSTEM SHALL 执行一次恢复扫描，重载活动任务、复核真实状态，并将中断任务收敛到恢复后的终态。

### Requirement 6.4
WHEN Redis 在任务执行中短暂抖动
THE SYSTEM SHALL 暂停接收新的控制任务、记录恢复线索，并在 Redis 恢复后补齐任务状态。

## User Story 7 - 健康检查和超时规则必须确定且一致

### Requirement 7.1
WHEN 服务重启或 reload 完成启动阶段
THE SYSTEM SHALL 使用配置的健康检查路径或默认 `/actuator/health` 对服务执行健康探测；若未配置 HTTP 健康检查，则退化为端口探测。

### Requirement 7.2
WHEN 健康检查返回 404、配置错误或明确不可恢复的启动错误
THE SYSTEM SHALL 立即判定任务失败，而不是继续无限重试。

### Requirement 7.3
WHEN 健康检查遇到连接拒绝、5xx 或超时等可恢复问题
THE SYSTEM SHALL 按受控重试策略继续探测，直到成功、超时或达到最大探测次数。

### Requirement 7.4
WHEN 任一任务阶段超时或总任务超时
THE SYSTEM SHALL 记录结构化超时失败信息，并将任务与服务状态收敛到可诊断的终态。

## User Story 8 - WebSocket 事件需要统一任务语义

### Requirement 8.1
WHEN 统一任务状态发生变化
THE SYSTEM SHALL 通过 `job:*` 事件广播任务进度、完成态和失败态。

### Requirement 8.2
WHEN 当前前端仍依赖现有 `build:*` 或 `service:status` 事件
THE SYSTEM SHALL 在兼容期继续广播这些旧事件，直到调用方完成迁移。

### Requirement 8.3
WHEN 任务恢复扫描完成或补偿启动完成
THE SYSTEM SHALL 广播最终收敛后的任务结果，避免调用方持有过期状态。

## User Story 9 - API 错误与限流需要标准化

### Requirement 9.1
WHEN 控制接口返回错误
THE SYSTEM SHALL 使用统一错误结构返回 `code`、`message` 和 `details`，而不是仅返回非结构化字符串。

### Requirement 9.2
WHEN 同一服务或模块在限流窗口内被重复触发写操作
THE SYSTEM SHALL 返回 `429 RATE_LIMITED` 和 `Retry-After`，并附带最近任务信息用于重试决策。

### Requirement 9.3
WHEN 请求因参数错误、资源不存在、锁冲突或 Redis 不可用而被立即拒绝
THE SYSTEM SHALL 不将该请求计入执行限流窗口。

## User Story 10 - 批量任务需要清晰的父子任务语义

### Requirement 10.1
WHEN 客户端触发批量服务操作
THE SYSTEM SHALL 创建父任务和子任务模型，并在父任务中汇总子任务统计信息。

### Requirement 10.2
WHEN 批量任务按服务顺序逐个执行
THE SYSTEM SHALL 在单个子任务失败后继续处理后续子任务，并将父任务最终收敛为 `all_succeeded`、`partial_failed` 或 `all_failed`。

### Requirement 10.3
WHEN 第一阶段尚未支持批量自动回滚
THE SYSTEM SHALL 保留每个子任务的真实执行结果，并明确不对已成功的子任务进行隐式回滚。
