# 任务清单

## 任务

- [ ] 0. 范围收敛与前置验证
  - [ ] 0.1 冻结 legacy 新增功能入口
    - 停止继续在 `frontend/index.html` 上叠加新的看板娘能力
    - 将 legacy 明确标记为回退实现而非继续扩展的主实现
    - _Requirements: 1.5, 7.1_

  - [ ] 0.2 确认依赖兼容矩阵
    - 核对 PixiJS、`pixi-live2d-display`、React 18、Vite 的兼容关系
    - 记录是否需要额外 runtime 或插件
    - _Requirements: 4.1, 4.4_

  - [ ] 0.3 确认目标模型与资源路径
    - 以 `fuxuan` 作为第一阶段唯一目标模型
    - 确认 `/live2d/fuxuan/符玄.model3.json` 及相关资源可访问
    - _Requirements: 4.2, 4.3, 7.2_

  - [ ] 0.4 Checkpoint - 前置验证完成
    - 确认依赖兼容、目标模型和资源链路具备进入编码条件
    - _Requirements: 4.1-4.5, 7.3_

- [x] 1. 建立单一引擎切换入口
  - [x] 1.1 新建 `frontend/src/live2d/config/waifuFeatureFlags.js`
    - 定义 `engine = legacy | pixi`
    - _Requirements: 1.1-1.5_

  - [x] 1.2 收敛 legacy 回退入口边界
    - 评估并抽离 `legacy/bootstrap.js`，或至少明确 legacy 启动只保留在一个过渡入口
    - _Requirements: 1.2, 1.5_

  - [x] 1.3 在 React 启动路径接入引擎选择逻辑
    - 在 `App.jsx` 或等价入口中根据 feature flag 决定挂载 `WaifuRoot` 或保留 legacy
    - 验证同一时刻只启动一套引擎
    - _Requirements: 1.1-1.4, 2.1_

  - [ ] 1.4 Checkpoint - 引擎切换可用
    - 确认 pixi/legacy 可显式切换且可回退
    - _Requirements: 1.1-1.5, 6.4_

- [x] 2. 建立最小 React 挂载与 Pixi 底座
  - [x] 2.1 新建 `frontend/src/live2d/ui/Live2DCanvas.jsx`
    - 提供纯容器组件
    - _Requirements: 2.2, 2.3_

  - [x] 2.2 新建 `frontend/src/live2d/ui/WaifuRoot.jsx`
    - 在 React 中挂载看板娘根节点
    - 管理 controller 生命周期
    - _Requirements: 2.1-2.4, 3.1, 3.4_

  - [x] 2.3 实现 `frontend/src/live2d/engine/Live2DStage.js`
    - 创建 Pixi Application
    - 管理 canvas 挂载、resize 和 destroy
    - _Requirements: 3.1-3.5_

  - [x] 2.4 实现 `frontend/src/live2d/engine/Live2DRenderer.js`
    - 将模型挂载到 stage 并设置基础布局
    - _Requirements: 3.2, 5.2_

  - [ ] 2.5 Checkpoint - Pixi 底座稳定
    - 确认 StrictMode 下无重复 canvas、无残留实例
    - _Requirements: 3.4, 3.5, 6.1-6.3_

- [x] 3. 跑通单模型加载与最小控制入口
  - [x] 3.1 新建 `frontend/src/live2d/config/waifuModels.js`
    - 只定义目标模型 `fuxuan`
    - 收敛模型路径、缩放和位置配置
    - _Requirements: 4.2, 7.2_

  - [x] 3.2 实现 `frontend/src/live2d/engine/Live2DModelLoader.js`
    - 使用官方推荐入口加载目标模型
    - 处理加载失败和 stale request
    - _Requirements: 4.1-4.5, 6.1-6.3_

  - [x] 3.3 实现 `frontend/src/live2d/controller/Live2DController.js`
    - 串联 stage、loader、renderer
    - 提供 `init/destroy/reloadModel/show/hide` 最小 API
    - _Requirements: 5.1-5.4_

  - [x] 3.4 在 `WaifuRoot` 中接入默认目标模型加载
    - 验证模型可显示、可销毁、可重新加载
    - _Requirements: 3.2, 4.1-4.5, 5.2_

  - [ ] 3.5 Checkpoint - 单模型 PoC 跑通
    - 确认 `fuxuan` 模型在 React + Pixi 中可稳定运行
    - _Requirements: 3.1-3.5, 4.1-4.5, 5.1-5.4_

- [ ] 4. 验收失败隔离与回退能力
  - [ ] 4.1 验证 pixi 初始化失败不会影响主应用
    - 模拟路径错误或加载失败，确认主界面仍可用
    - _Requirements: 6.1-6.3_

  - [ ] 4.2 验证 feature flag 回退到 legacy
    - 确认 pixi 不可用时可显式切回旧实现
    - _Requirements: 1.5, 6.4_

  - [ ] 4.3 记录 runtime 与资源装配结果
    - 记录模型 JSON、贴图、runtime 来源与版本约束
    - _Requirements: 4.3, 4.4_

  - [ ] 4.4 Checkpoint - 最小基础层完成
    - 确认已具备进入后续功能迁移 spec 的前提条件
    - _Requirements: 6.1-6.4, 7.3, 7.4_

- [ ]* 5. 后续阶段（不在本 spec 实施）
  - [ ]* 5.1 聊天面板 React 化
    - 由后续 spec 承接
    - _Requirements: 7.1, 7.4_

  - [ ]* 5.2 情绪、嘴型与 motion 编排
    - 由后续 spec 承接
    - _Requirements: 7.1, 7.4_

  - [ ]* 5.3 点击、拖拽、命中测试与 gaze 增强
    - 由后续 spec 承接
    - _Requirements: 7.1, 7.4_

  - [ ]* 5.4 WebSocket 联动、智能出现、DND
    - 由后续 spec 承接
    - _Requirements: 7.1, 7.4_
