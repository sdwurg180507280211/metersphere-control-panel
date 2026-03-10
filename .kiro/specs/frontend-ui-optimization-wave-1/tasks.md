# Control Panel 前端 UI 优化 Wave 1 Tasks

## 1. 实施说明

- 本任务清单对应 `.kiro/specs/frontend-ui-optimization-wave-1/requirements.md`
- 本需求属于 UI/UX 增量优化，按 Requirements-First 执行
- 优先完成共享壳层、导航持久化和视觉收敛，再逐页统一信息架构
- 默认不修改后端 API 契约，不引入大型 UI 依赖
- 当前只产出 spec，所有任务默认未开始

## 2. 任务

- [ ] 1. App Shell 与导航状态
  - [ ] 1.1 引入轻量 URL 状态同步
    - 在 `frontend/src/App.jsx` 中为工作区引入轻量 URL 状态同步
    - _Requirements: R1, R8, R9_
  - [ ] 1.2 新增 UI 视图状态层
    - 新增轻量 UI 视图状态层，用于保存当前页签与允许恢复的界面偏好
    - _Requirements: R1, R8, R9_
  - [ ] 1.3 调整工作区恢复顺序
    - 调整最近访问工作区恢复顺序为 `hash/query > 本地恢复状态 > build`
    - _Requirements: R1, R8_
  - [ ] 1.4 接入未保存变更保护
    - 把 `config` 页未保存变更保护接入 URL 切换、浏览器前进后退和刷新离开场景
    - _Requirements: R1, R10_
  - [ ] 1.5 统一 Sidebar 行为
    - 统一 `Sidebar` 的当前态表达、可访问名称和焦点行为
    - _Requirements: R1, R5_

- [ ] 2. Checkpoint - 验证导航可定位与离开保护
  - 确保刷新后能回到正确工作区
  - 确保浏览器前进/后退与当前工作区保持一致
  - 确保 `config` 页有未保存变更时离开会被拦截，其他页不受影响
  - _Requirements: R1, R5, R8, R10_

- [ ] 3. 共享视觉 Token 与基础样式收敛
  - [ ] 3.1 新增共享 token 层
    - 新增 `frontend/src/styles/tokens.css` 或等效共享 token 层
    - _Requirements: R3, R9_
  - [ ] 3.2 接入 token 并重整全局样式
    - 在 `frontend/src/styles/index.css` 中接入 token，并重整全局背景、滚动和基础排版规则
    - _Requirements: R3, R4_
  - [ ] 3.3 收敛共享容器样式
    - 在 `frontend/src/styles/App.css` 中收敛共享容器、卡片、按钮、日志容器和布局样式
    - _Requirements: R2, R3, R4_
  - [ ] 3.4 清理硬编码样式
    - 清理共享控件中的高频硬编码色值、阴影、动效和不必要的强装饰效果
    - _Requirements: R3_
  - [ ] 3.5 补充动效降级
    - 为全局样式补充 `prefers-reduced-motion` 降级
    - _Requirements: R5_

- [ ] 4. Checkpoint - 验证视觉基础收敛
  - 确保共享控件颜色、圆角、阴影、间距与反馈节奏趋于统一
  - 确保窄屏下不因 `overflow` 或固定高度导致主内容难以浏览
  - _Requirements: R3, R4, R5_

- [ ] 5. 共享页面骨架与反馈层
  - [ ] 5.1 新增 PageHeader 组件
    - 新增 `PageHeader` 组件，统一标题、说明、状态摘要与主操作区
    - _Requirements: R2, R6_
  - [ ] 5.2 新增 StatusSummary 组件
    - 新增 `StatusSummary` 组件，承载数量型与状态型摘要
    - _Requirements: R2, R6, R7_
  - [ ] 5.3 新增 FeedbackBanner 组件
    - 新增 `FeedbackBanner` 或等效页面级反馈容器
    - _Requirements: R6, R7_
  - [ ] 5.4 统一反馈职责边界
    - 统一全局连接反馈、页面级运行反馈和 toast 的职责边界
    - _Requirements: R6, R7_
  - [ ] 5.5 补充无障碍名称
    - 为图标型或仅视觉提示型控件补充可读文本或无障碍名称
    - _Requirements: R5, R6_

- [ ] 6. Checkpoint - 验证页面级反馈模型
  - 确保任一长时任务运行时，页头或固定区域能持续看到运行状态
  - 确保成功、失败、警告反馈不只依赖 toast
  - _Requirements: R2, R5, R6, R7_

- [ ] 7. 四个工作区的信息架构统一
  - [ ] 7.1 改造 BuildTab
    - 改造 `BuildTab`，统一页头、主工作区、构建历史/日志次级区层级
    - _Requirements: R2, R6, R7, R10_
  - [ ] 7.2 改造 ServicesTab
    - 改造 `ServicesTab`，突出服务状态摘要、主控制区和日志次级区
    - _Requirements: R2, R6, R7, R10_
  - [ ] 7.3 改造 PackageTab
    - 改造 `PackageTab`，把参数配置、任务状态和日志区组织成稳定主次关系
    - _Requirements: R2, R6, R7, R10_
  - [ ] 7.4 改造 ConfigTab
    - 改造 `ConfigTab`，强化"编辑 -> 校验 -> 保存 -> 应用"的层级表达
    - _Requirements: R2, R6, R10_
  - [ ] 7.5 统一空态和错误指引
    - 统一各页禁用态说明、空态文案和错误指引
    - _Requirements: R2, R6_

- [ ] 8. Checkpoint - 验证工作区层级一致性
  - 确保四个页签都能在首屏看到"当前页面是什么、当前状态如何、主操作是什么"
  - 确保日志、历史、诊断等辅助区域不会掩盖主操作区
  - _Requirements: R2, R6, R7, R10_

- [ ] 9. 响应式与无障碍补齐
  - [ ] 9.1 定义三档布局规则
    - 为导航、页头、卡片、日志区定义桌面/平板/移动三档布局规则
    - _Requirements: R4_
  - [ ] 9.2 优化窄屏可达性
    - 优化窄屏下的导航横向滚动、页头堆叠和主操作可达性
    - _Requirements: R4, R10_
  - [ ] 9.3 补充焦点样式
    - 为按钮、输入、弹窗和日志搜索补充统一 `focus-visible` 样式
    - _Requirements: R5_
  - [ ] 9.4 补充语义属性
    - 为图标按钮、导航项、弹窗操作补充语义属性和键盘可操作性
    - _Requirements: R5_
  - [ ] 9.5 补充动效降级策略
    - 为装饰性动画和页面切换动效补充减少动态效果策略
    - _Requirements: R5_

- [ ] 10. Checkpoint - 验证窄屏与键盘路径
  - 确保在移动端宽度下不出现必须横向滚动才能完成的核心操作
  - 确保仅使用键盘即可完成页签切换、主操作触发、弹窗确认和日志搜索聚焦
  - _Requirements: R4, R5, R10_

- [ ] 11. 非破坏性 UI 状态恢复与细节收尾
  - [ ] 11.1 定义可恢复状态清单
    - 明确定义并实现可恢复的界面状态清单，例如当前页签、日志面板折叠态、搜索词和局部筛选项
    - _Requirements: R8, R9_
  - [ ] 11.2 避免持久化冲突状态
    - 避免持久化可能与服务端运行态冲突的临时提交状态
    - _Requirements: R8_
  - [ ] 11.3 校准重连后状态
    - 在 WebSocket 重连与数据重拉后校准页面级状态摘要，避免与日志/任务状态冲突
    - _Requirements: R7, R8_
  - [ ] 11.4 统一交互文案
    - 复核高频交互文案，统一"成功 / 失败 / 阻止 / 提示"语气
    - _Requirements: R6_

- [ ] 12. Checkpoint - 验证恢复一致性
  - 确保恢复的 UI 状态不会伪造正在运行、已完成或已失败等服务端真实状态
  - 确保刷新后页面上下文恢复与实时状态恢复不互相矛盾
  - _Requirements: R6, R7, R8_

- [ ] 13. 最终验证
  - [ ] 13.1 验证 URL 直接访问
    - 验证通过 URL 直接打开 `build`、`services`、`package`、`config` 时，都能进入正确工作区
    - _Requirements: R1_
  - [ ] 13.2 验证刷新恢复
    - 验证刷新页面后，最近工作区与允许恢复的 UI 状态能被正确恢复
    - _Requirements: R1, R8_
  - [ ] 13.3 验证未保存保护
    - 验证 `config` 页未保存保护在"切换页签 / 浏览器导航 / 页面离开"场景下都能正确工作
    - _Requirements: R1, R10_
  - [ ] 13.4 验证页面结构统一
    - 验证四个页签均具备统一页头、状态摘要、主操作区和次级信息区
    - _Requirements: R2, R7_
  - [ ] 13.5 验证响应式可达
    - 验证桌面、平板、移动三档宽度下关键操作和关键状态均可达
    - _Requirements: R4_
  - [ ] 13.6 验证键盘操作
    - 验证键盘操作可以覆盖导航、主操作、弹窗确认和日志搜索
    - _Requirements: R5_
  - [ ] 13.7 验证状态一致性
    - 验证页面级运行反馈与 WebSocket 日志/状态保持一致
    - _Requirements: R6, R7, R8_
  - [ ] 13.8 验证无回归
    - 验证 UI 优化后现有"构建、服务控制、整体验证打包、配置保存/应用、日志查看"主流程无回归
    - _Requirements: R10_

## 3. 完成定义

以下条件全部满足时，可视为"前端 UI 优化 Wave 1"完成：

- 用户可以通过 URL 定位和恢复工作区
- 四个页签具备统一的页面骨架和信息层级
- 视觉 token 体系建立，共享控件样式收敛
- 窄屏和键盘操作路径可用
- 页面级状态反馈清晰且与实时数据一致
- 现有核心运维流程没有回归
