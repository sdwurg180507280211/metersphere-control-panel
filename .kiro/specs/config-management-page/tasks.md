# 配置管理页 Tasks

## 1. 实施策略

- 按 Requirements-First 执行
- 优先交付“可见、可校验、可保存”的最小闭环
- 在动态配置消费改造完成前，不承诺全部字段热应用
- 每个任务显式标注需求来源，确保实现、验证与回归检查可追溯

## 2. 阶段划分

### 阶段 A：后端配置领域搭建

- [ ] 新增 `backend/routes/config.js`。 _Requirements: FR-6, FR-12, FR-17, FR-21, FR-24_
- [ ] 新增 `backend/controllers/configController.js`。 _Requirements: FR-6, FR-12, FR-17, FR-21, FR-24, CR-1_
- [ ] 新增 `backend/services/configManager.js`。 _Requirements: FR-6, FR-17, FR-18, FR-21, FR-22, FR-26, CR-3, SR-3_
- [ ] 新增 `backend/services/configDiagnosticsService.js`。 _Requirements: FR-5, FR-12, FR-13, FR-14, FR-15, FR-16, FR-24, FR-25_
- [ ] 在 `backend/server.js` 挂载 `/api/config` 路由。 _Requirements: FR-6, FR-12, FR-17, FR-21, FR-24, CR-1_
- [ ] 为配置响应统一补充 `editable`、`runtime`、`resolved`、`diagnostics`、`meta` 结构。 _Requirements: FR-6, FR-7, FR-8, FR-25, FR-26_
- [ ] Checkpoint A - 验证后端配置领域搭建。 _Requirements: FR-6, FR-26, CR-1_
- [ ] 确保 `/api/config` 路由可访问并返回标准响应壳。 _Requirements: FR-6, FR-26_
- [ ] 确保 `configManager` 可正确加载 `config.json` 且不改写原始配置。 _Requirements: FR-6, CR-3, SR-3_

### 阶段 B：配置解析与校验能力

- [ ] 将 `backend/config.js` 重构为可复用的纯加载 / 规范化函数。 _Requirements: FR-6, FR-17, CR-3_
- [ ] 在 `configManager` 中接管原始配置读取与 resolved config 生成。 _Requirements: FR-6, FR-21, FR-26_
- [ ] 实现 `projectRoot` 校验逻辑。 _Requirements: FR-13_
- [ ] 实现服务 `pom`、端口、健康检查路径校验。 _Requirements: FR-14, FR-16_
- [ ] 实现打包脚本候选路径与可执行性校验。 _Requirements: FR-15_
- [ ] 实现 Redis / 缓存 / env 来源诊断。 _Requirements: FR-4, FR-5, FR-7, FR-25, SR-1_
- [ ] 实现 `POST /api/config/validate`。 _Requirements: FR-12, FR-13, FR-14, FR-15, FR-16_
- [ ] Checkpoint B - 验证配置解析与校验闭环。 _Requirements: FR-12, FR-13, FR-14, FR-15, FR-16_
- [ ] 确保 `POST /api/config/validate` 不写盘且返回标准化草稿、诊断和应用影响。 _Requirements: FR-12, FR-18_
- [ ] 确保非法 `projectRoot`、重复端口、无效脚本会被稳定识别。 _Requirements: FR-13, FR-14, FR-15, FR-16_

### 阶段 C：前端页面骨架与状态

- [ ] 在 `Sidebar` 中新增“配置管理”页签。 _Requirements: FR-1, FR-2, FR-3, FR-4, FR-5_
- [ ] 在 `App.jsx` 中挂载 `ConfigTab`。 _Requirements: FR-1, FR-2, FR-3, FR-4, FR-5_
- [ ] 在 `useAppStore.js` 中新增 `useConfigStore`。 _Requirements: FR-9, FR-10, FR-12, FR-17, FR-21, FR-24_
- [ ] 新增 `ConfigTab.jsx`。 _Requirements: FR-6_
- [ ] 新增 `ConfigGeneralSection.jsx`。 _Requirements: FR-1, FR-7, FR-8_
- [ ] 新增 `ConfigServicesSection.jsx`。 _Requirements: FR-2, FR-11_
- [ ] 新增 `ConfigPackageSection.jsx`。 _Requirements: FR-3, FR-7, FR-8_
- [ ] 新增 `ConfigRuntimePanel.jsx`。 _Requirements: FR-4, FR-25, SR-1_
- [ ] 新增 `ConfigDiagnosticsPanel.jsx`。 _Requirements: FR-5, FR-24, FR-26_
- [ ] 新增 `ConfigSaveBar.jsx`。 _Requirements: FR-10, FR-12, FR-17, FR-21_
- [ ] 新增 `ConfigTab.css`。 _Requirements: FR-1, FR-2, FR-3, FR-4, FR-5_
- [ ] 打通 `GET /api/config` 页面初始加载。 _Requirements: FR-6, FR-25, FR-26_
- [ ] Checkpoint C - 验证页面骨架与状态管理。 _Requirements: FR-6, FR-9, FR-10_
- [ ] 确保页面可展示基础设置、服务配置、构建打包、运行时信息和诊断区。 _Requirements: FR-1, FR-2, FR-3, FR-4, FR-5_
- [ ] 确保字段编辑仅影响本地 `draft`，并正确显示 dirty 状态。 _Requirements: FR-9, FR-10_

### 阶段 D：保存流程

- [ ] 实现前端草稿编辑和 `dirtyFields` 跟踪。 _Requirements: FR-9, FR-10_
- [ ] 实现前端“校验配置”按钮与错误展示。 _Requirements: FR-12, FR-13, FR-14, FR-15, FR-16_
- [ ] 实现 `PUT /api/config`。 _Requirements: FR-17, FR-18, FR-19, CR-3, SR-3_
- [ ] 仅持久化允许编辑的配置字段。 _Requirements: FR-17, CR-3, SR-3_
- [ ] 保存成功后更新 `snapshot`、`lastSavedAt`、诊断信息。 _Requirements: FR-18, FR-26_
- [ ] 保存失败时保留草稿并展示结构化错误。 _Requirements: FR-19_
- [ ] Checkpoint D - 验证保存链路与失败保护。 _Requirements: FR-17, FR-18, FR-19, SR-3_
- [ ] 确保保存仅修改控制面板配置文件，不影响 `../metersphere` 仓库。 _Requirements: SR-3_
- [ ] 确保保存失败时页面草稿不丢失，且磁盘保留最后一个有效配置。 _Requirements: FR-19, CR-3_

### 阶段 E：运行时配置应用

- [ ] 改造 `backend/utils/validator.js` 为动态读取配置快照。 _Requirements: FR-21, FR-22_
- [ ] 改造 `backend/services/processManager.js` 为按调用时读取 `projectRoot` 与服务配置。 _Requirements: FR-21, FR-22, FR-23_
- [ ] 改造 `backend/services/healthChecker.js` 为按调用时读取服务配置。 _Requirements: FR-21, FR-22_
- [ ] 改造 `backend/controllers/buildController.js` 为动态读取模块与服务配置。 _Requirements: FR-21, FR-22, CR-1_
- [ ] 改造 `backend/services/packageTaskService.js` 为动态读取打包配置。 _Requirements: FR-21, FR-22, FR-23, CR-1_
- [ ] 为 `backend/utils/logger.js` 增加 `updateOptions({ maxLogLines })`。 _Requirements: FR-21, FR-22_
- [ ] 实现 `POST /api/config/apply`。 _Requirements: FR-20, FR-21, FR-22, FR-23_
- [ ] 应用后刷新相关前端 store：服务目录、服务状态、模块目录、打包选项。 _Requirements: FR-21, FR-22_
- [ ] Checkpoint E - 验证应用链路与生效语义。 _Requirements: FR-20, FR-21, FR-22, FR-23_
- [ ] 确保可热应用字段在应用后对新发起任务生效，`port` 仍被标记为需重启。 _Requirements: FR-8, FR-21, FR-22_
- [ ] 确保存在阻断任务时返回拒绝原因，且运行态保持应用前快照。 _Requirements: FR-23_

### 阶段 F：保护与回归

- [ ] 在“应用配置”前增加活动任务阻断策略。 _Requirements: FR-23_
- [ ] 为高风险字段修改增加前端确认提示。 _Requirements: FR-8, FR-10_
- [ ] 验证原有服务管理接口未回归。 _Requirements: CR-1_
- [ ] 验证原有前端构建接口未回归。 _Requirements: CR-1_
- [ ] 验证原有打包页未回归。 _Requirements: CR-1_
- [ ] 验证原有 WebSocket 事件未回归。 _Requirements: CR-2_
- [ ] Checkpoint F - 验证兼容性与保护策略。 _Requirements: CR-1, CR-2, SR-1, SR-2_
- [ ] 确保新增页面不会暴露敏感配置编辑能力，也不会演变为任意命令入口。 _Requirements: SR-1, SR-2_
- [ ] 确保现有服务控制、构建和打包主流程在引入配置管理后保持原语义。 _Requirements: CR-1, CR-2_

## 3. MVP 建议范围

若需要先快速上线一版，建议 MVP 仅包含以下能力：

- `GET /api/config`。 _Requirements: FR-6, FR-25, FR-26_
- `POST /api/config/validate`。 _Requirements: FR-12, FR-13, FR-14, FR-15, FR-16_
- `PUT /api/config`。 _Requirements: FR-17, FR-18, FR-19_
- 页面基础设置区。 _Requirements: FR-1_
- 页面服务配置区。 _Requirements: FR-2, FR-11_
- 诊断区。 _Requirements: FR-5, FR-24_
- 只读运行时信息区。 _Requirements: FR-4, FR-25, SR-1_

MVP 暂不包含：

- `POST /api/config/apply`。 _Requirements deferred: FR-20, FR-21, FR-22, FR-23_
- 全量热应用。 _Requirements deferred: FR-21, FR-22_
- 导入导出。 _Requirements deferred: Phase 2 candidate scope_
- 配置历史回滚。 _Requirements deferred: Phase 2 candidate scope_

## 4. 完成定义

以下条件全部满足时，可视为“配置管理页”第一阶段完成：

- 用户可以在页面中查看当前 `config.json` 主要配置。 _Requirements: FR-1, FR-2, FR-3, FR-6_
- 用户可以在页面中编辑基础配置与服务配置。 _Requirements: FR-1, FR-2, FR-9, FR-11_
- 用户可以在不落盘的前提下执行配置校验。 _Requirements: FR-12, FR-13, FR-14, FR-15, FR-16_
- 用户可以安全保存 `config.json`。 _Requirements: FR-17, FR-18, FR-19, CR-3, SR-3_
- 页面可以清晰显示哪些配置已保存、哪些仍需应用或重启。 _Requirements: FR-8, FR-20, FR-22, FR-26_
- 现有服务控制、构建和打包主流程没有回归。 _Requirements: CR-1, CR-2_
