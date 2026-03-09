# Control Panel 打包页签 Tasks

## 说明

- 本任务清单对应 `.kiro/specs/control-panel-package-tab/requirements.md`
- 本需求属于新增功能，默认按“先打通最小可用闭环，再补任务恢复与扩展参数”推进
- 当前只产出 spec，所有任务默认未开始

## Phase 1 - 打通第 3 个标签页与最小打包闭环

- [ ] 1.1 在 `frontend/src/components/Sidebar.jsx` 和 `frontend/src/App.jsx` 中新增第 3 个 `package` 标签页  
  - _Requirements: R1_
- [ ] 1.2 新增 `frontend/src/components/PackageTab.jsx` 与样式文件，提供打包配置表单、运行状态和日志展示区域  
  - _Requirements: R1, R3, R7_
- [ ] 1.3 页面显式提供“服务、线程数、镜像版本、并行构建开关”等核心配置项  
  - _Requirements: R2, R7_
- [ ] 1.4 在 `backend/config/package.js` 中维护 `PACKAGE_SERVICE_OPTIONS`、`PACKAGE_DEFAULTS` 等配置常量，并由后端作为单一来源提供给前端  
  - _Requirements: R2A, R7_
- [ ] 1.5 将目标服务做成基于后端白名单源的下拉多选，将线程数做成数字输入，将镜像版本区域做成可输入并带最近使用值  
  - _Requirements: R2, R2A, R7_
- [ ] 1.6 页面默认预填当前常用参数：`IMAGE_VERSION=v2.10.26.09-lts`、`PARALLEL_BUILD=true`、`MAX_JOBS=4`、`service=api-test`  
  - _Requirements: R2_
- [ ] 1.7 在 Phase 1 直接落地镜像版本最近使用值的本地持久化、去重、截断与排序策略  
  - _Requirements: R2, R7_
- [ ] 1.8 第一阶段明确禁止“空选择即全量打包”，未选择服务时直接提示用户显式选择  
  - _Requirements: R2A, R4_
- [ ] 1.9 新增 `backend/routes/package.js` 与 `backend/controllers/packageController.js`，提供 `GET /api/package/options` 和 `POST /api/package/run`  
  - _Requirements: R2, R2A, R3, R3B, R4_
- [ ] 1.10 新增 `backend/services/packageService.js`，使用 `spawn()` 执行打包脚本，并优先支持脚本路径配置化解析  
  - _Requirements: R2, R3B, R6_
- [ ] 1.11 通过 `env` 传递 `IMAGE_VERSION`、`PARALLEL_BUILD`、`MAX_JOBS`，通过位置参数传递目标服务列表  
  - _Requirements: R2, R6_
- [ ] 1.12 为脚本路径解析增加环境变量优先级与默认推导策略  
  - _Requirements: R3B_
- [ ] 1.13 为脚本路径、服务白名单、服务列表、线程数、镜像版本和运行态冲突补齐最小校验与错误返回  
  - _Requirements: R2A, R3B, R4_
- [ ] C1 Checkpoint - 验证用户可在第 3 个标签页中成功触发与人工命令等价的多服务打包

## Phase 2 - 接入任务状态与实时日志

- [ ] 2.1 新增 `backend/services/packageTaskService.js`，统一管理 package 任务状态、并发保护和结果收敛  
  - _Requirements: R3, R3A, R4, R5_
- [ ] 2.2 接入 `jobService`，让 package 任务统一使用 `package.run` 类型，并通过 `metadata` 承载服务列表、线程数和镜像版本  
  - _Requirements: R3, R5_
- [ ] 2.3 为 package 执行过程接入独立的 `logs:package` / `package:*` 实时日志与状态推送通道  
  - _Requirements: R3, R5_
- [ ] 2.4 前端在 `PackageTab` 中展示运行中、成功、失败状态、退出码、错误信息，以及本次任务使用的服务列表与镜像版本  
  - _Requirements: R3, R3A, R7_
- [ ] 2.5 页面在任务执行期间禁用重复触发，后端也保留互斥保护  
  - _Requirements: R4_
- [ ] C2 Checkpoint - 验证打包运行期间页面可持续看到日志，且重复点击不会创建多个并发 package 任务

## Phase 3 - 恢复能力与体验完善

- [ ] 3.1 增加 `GET /api/package/active` 或复用 `GET /api/jobs/active`，支持页面刷新后恢复运行态  
  - _Requirements: R3, R5_
- [ ] 3.2 为 `PackageTab` 增加活动任务初始化拉取逻辑，避免刷新页面后状态丢失  
  - _Requirements: R3, R5_
- [ ] 3.3 视现有实现决定是否增加 package 历史记录入口  
  - _Requirements: R3, R5_
- [ ] 3.4 在页面中补充脚本依赖说明、输入提示和失败排查信息，明确服务多选、线程数输入、镜像版本最近使用值等配置项含义  
  - _Requirements: R3, R3A, R7_
- [ ] C3 Checkpoint - 验证页面刷新后可恢复当前 package 任务视图，且失败时有明确诊断信息

## Phase 4 - 高级参数扩展（预留）

- [ ] 4.1 优先补充 `BUILD_ONLY` 与 `PACKAGE_PATH`，因为这两个参数已被脚本稳定支持且对 UI 价值较高  
  - _Requirements: R2B, R8_
- [ ] 4.2 再评估 `SKIP_INIT`、`REGISTRY` 等扩展参数  
  - _Requirements: R8_
- [ ] 4.3 评估是否增加“全部模块 / 全部服务”显式开关，而不是复用空选择语义  
  - _Requirements: R2A, R8_
- [ ] 4.4 评估是否支持取消 package 任务  
  - _Requirements: R3, R8_
- [ ] 4.5 更新 `README.md` 与相关文档，补充第 3 个标签页和打包参数说明  
  - _Requirements: R1, R2, R7, R8_

## Validation

- [ ] V1 验证 `GET /api/package/options` 能返回后端维护的服务白名单和默认值，且 `POST /api/package/run` 在默认参数下能正确触发脚本执行
- [ ] V2 验证脚本路径不存在、服务列表为空、服务不在脚本白名单、`maxJobs` 非法、镜像版本为空等场景会返回结构化错误
- [ ] V3 验证页面日志与脚本 stdout/stderr 保持可读且持续更新，并能正确回显服务列表、线程数和镜像版本
- [ ] V3A 验证长时间运行时页面能持续获得任务仍在运行的反馈，而不是静默等待
- [ ] V4 验证打包运行中前端和后端都能阻止重复触发
- [ ] V5 验证新增第 3 个标签页后，原有“前端构建”“服务管理”页签行为保持不变
