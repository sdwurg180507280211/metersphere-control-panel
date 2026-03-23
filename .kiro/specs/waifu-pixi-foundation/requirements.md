# 需求文档

## 简介

当前看板娘逻辑仍直接写在 `frontend/index.html` 中，依赖 `live2d-widgets`、全局脚本注入、`window.Image` patch、DOM 劫持和 prototype patch 才能完成初始化与交互。这些实现方式已经成为后续迁移和维护的主要阻力。

本最小实施 spec 的目标不是一次性完成所有看板娘功能迁移，而是先建立一个**可独立运行、可回退、可验证**的新引擎基础层。第一阶段只覆盖：引擎切换、最小 React 挂载、Pixi 渲染底座、单模型加载/销毁、统一控制入口，以及资源/runtime 装配验证。

本 spec 明确排除聊天面板、情绪系统、嘴型同步、拖拽、点击反馈、智能出现、勿扰模式、WebSocket 联动等高阶功能。这些能力继续由后续 spec 或后续阶段承接。

---

## 术语表

- **legacy 引擎**: 当前基于 `live2d-widgets` 和 `frontend/index.html` 内联脚本的旧实现。
- **pixi 引擎**: 本次最小实施目标实现，即基于 `pixi-live2d-display` 的新底座。
- **基础层**: 新引擎的最小可运行集合，包括启动入口、渲染底座、模型加载、控制器和模型配置。
- **PoC**: Proof of Concept，用于验证依赖兼容、资源路径、runtime 装配和 React StrictMode 下的可行性。
- **目标模型**: 第一阶段选定用于验证新引擎的单个模型，默认使用 `fuxuan`。
- **feature flag**: 用于显式切换 legacy / pixi 两种引擎实现的配置开关。

---

## 需求

### 需求 1：提供可回退的引擎切换入口

**用户故事：** 作为前端开发者，我希望通过明确的 feature flag 切换 legacy 和 pixi 两种引擎，以便在迁移早期安全试验并随时回退。

#### 验收标准

1. WHEN 应用启动时 THEN The System SHALL 只初始化由 feature flag 指定的一种引擎实现。
2. IF feature flag = `legacy` THEN The System SHALL 继续使用现有 `frontend/index.html` 的 legacy 启动逻辑。
3. IF feature flag = `pixi` THEN The System SHALL 阻止 legacy 启动逻辑执行。
4. THE System SHALL 将引擎选择逻辑收敛到单一配置位置，而不是在多个文件中分散判断。
5. THE System SHALL 保留从 pixi 回退到 legacy 的能力。

---

### 需求 2：在 React 中挂载最小看板娘根节点

**用户故事：** 作为前端开发者，我希望在 React 工程内挂载新的看板娘根组件，以便让新引擎进入正式工程体系。

#### 验收标准

1. WHEN pixi 引擎启用时 THEN The System SHALL 通过 React 组件挂载看板娘根节点。
2. THE System SHALL 提供独立的画布容器组件用于承载 Pixi canvas。
3. THE System SHALL 不再依赖直接操作静态 HTML 来拼装新引擎的根节点。
4. THE System SHALL 保证看板娘根节点以附加模块方式接入，不影响主工作区正常渲染。

---

### 需求 3：建立最小 Pixi 渲染底座

**用户故事：** 作为前端开发者，我希望建立稳定的 Pixi 渲染底座，以便承载单模型的加载、显示、resize 和销毁。

#### 验收标准

1. WHEN `WaifuRoot` 挂载时 THEN The System SHALL 创建一个可复用的 Pixi 渲染上下文并挂载到指定容器。
2. WHEN 目标模型加载成功时 THEN The System SHALL 将模型实例加入 Pixi stage 并设置基础位置、缩放和可见性。
3. WHEN 浏览器窗口尺寸变化或容器尺寸变化时 THEN The System SHALL 正确处理 resize。
4. WHEN 组件卸载时 THEN The System SHALL 清理 Pixi Application、canvas、stage 中的模型实例和相关监听器。
5. THE System SHALL 在 React StrictMode 双执行场景下避免重复 canvas、重复模型实例和残留监听器。

---

### 需求 4：支持单模型加载与资源装配验证

**用户故事：** 作为迁移实施者，我希望先验证一个目标模型在新引擎中的加载链路，以便在小范围内确认方案可行。

#### 验收标准

1. THE System SHALL 通过 `pixi-live2d-display` 官方推荐入口加载目标模型。
2. THE System SHALL 将目标模型的资源路径统一定义在单一配置位置。
3. WHEN pixi 引擎加载目标模型时 THEN The System SHALL 验证模型 JSON、贴图和相关资源均可访问。
4. THE System SHALL 在 PoC 阶段记录 Cubism runtime 的来源、加载方式和版本约束。
5. IF 模型资源或 runtime 装配失败 THEN The System SHALL 暴露错误并阻止将该实现视为可迁移基础。

---

### 需求 5：提供最小统一控制入口

**用户故事：** 作为前端开发者，我希望用一个统一控制器封装新引擎的最小操作，以便后续功能在稳定入口之上扩展。

#### 验收标准

1. THE System SHALL 提供统一的 `Live2DController` 作为业务层最小门面。
2. WHEN 业务需要初始化、销毁、显示、隐藏或重新加载目标模型时 THEN The System SHALL 通过控制器 API 调用，而不是直接操作底层实例。
3. THE System SHALL 不向 React UI 暴露 Pixi Application、`Live2DModel` 或底层 Cubism runtime 实例。
4. THE System SHALL 保证控制器初始化和销毁流程具备幂等性。

---

### 需求 6：保证失败隔离与可回退

**用户故事：** 作为控制面板用户，我希望看板娘新引擎即使初始化失败也不会影响主应用，以便迁移风险保持可控。

#### 验收标准

1. IF pixi 引擎初始化失败 THEN The System SHALL 将失败限制在看板娘模块内部。
2. THE System SHALL 不因看板娘失败阻塞主应用启动、路由或现有页面交互。
3. THE System SHALL 记录可诊断的错误信息，用于后续修复资源路径、runtime 或兼容性问题。
4. THE System SHALL 支持在失败后通过 feature flag 回退到 legacy 引擎。

---

### 需求 7：明确最小实施范围边界

**用户故事：** 作为项目维护者，我希望第一阶段的范围边界明确，以便避免在基础层未稳定前把迁移面铺得过大。

#### 验收标准

1. THE System SHALL 将聊天面板、情绪系统、嘴型同步、点击反馈、拖拽、智能出现、勿扰模式和 WebSocket 联动排除在本 spec 之外。
2. THE System SHALL 仅要求单模型跑通，不要求第一阶段完成多模型切换。
3. THE System SHALL 将是否进入后续功能迁移阶段建立在 PoC 和基础层稳定性验证通过之上。
4. THE System SHALL 在任务文档中把超出最小范围的事项标记为后续阶段，而不是并入当前实现清单。
