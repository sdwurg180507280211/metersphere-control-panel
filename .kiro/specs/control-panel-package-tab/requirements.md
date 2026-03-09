# Control Panel 打包页签 Requirements

## Spec Metadata

- 类型：Feature Spec
- Workflow：Requirements-First
- 来源输入：
  - 用户提供的打包命令
  - `frontend/src/App.jsx`
  - `frontend/src/components/Sidebar.jsx`
  - `/Users/edy/ideaProjects/metersphere/打包/metersphere-build.sh`

## 背景

当前 `metersphere-control-panel` 已提供“前端构建”和“服务管理”两个页签，但还没有统一入口去触发 MeterSphere 的整体验证镜像 / tar 打包脚本。

用户当前常用的人工命令为：

```bash
IMAGE_VERSION=v2.10.26.09-lts \
PARALLEL_BUILD=true \
MAX_JOBS=4 \
/Users/edy/ideaProjects/metersphere/打包/metersphere-build.sh api-test
```

该命令说明当前已有一条明确可用的本地打包路径，需求目标是：

- 将这条打包能力接入控制面板
- 在现有 UI 中新增第 3 个标签页
- 让用户可以在页面上发起打包、观察进度与查看日志
- 保持当前人工命令语义不变，不修改 sibling `metersphere` 仓库中的打包脚本

## 范围

本需求包含：

- 新增第 3 个标签页用于打包
- 在控制面板中触发 `metersphere-build.sh`
- 支持在页面上指定目标服务（模块）、线程数、镜像版本等核心打包参数
- 支持基于脚本已有能力逐步扩展 `BUILD_ONLY`、`PACKAGE_PATH` 等高价值参数
- 提供打包执行中的日志、状态和结果展示
- 支持最小可用的执行中防重复触发保护

本需求暂不包含：

- 修改 `/Users/edy/ideaProjects/metersphere/打包/metersphere-build.sh`
- 改造 sibling `metersphere` 仓库
- 引入新的外部任务平台或消息中间件
- 一次性支持脚本的全部高级参数
- 远程分布式打包

## 关键术语

- **打包页签**：控制面板中的第 3 个主标签页，专门负责镜像 / tar 打包相关操作。
- **打包任务**：一次由控制面板发起的 `metersphere-build.sh` 执行过程。
- **目标服务**：页面上可指定的打包目标，实际对应传递给脚本的位置参数，例如 `api-test`；第一阶段页面交互采用下拉多选。
- **线程数**：页面上可指定的并行任务数，映射到 `MAX_JOBS`。
- **镜像版本**：页面上可指定的镜像版本，映射到 `IMAGE_VERSION`。
- **打包配置**：本次执行的 `IMAGE_VERSION`、`PARALLEL_BUILD`、`MAX_JOBS`、目标服务、`BUILD_ONLY`、`PACKAGE_PATH` 等参数。

## Requirements

### R1. 新增第 3 个打包标签页

- WHEN 用户打开控制面板
  THE SYSTEM SHALL 在现有“前端构建”“服务管理”之外新增第 3 个主标签页，用于执行打包任务。
- WHEN 用户切换到打包标签页
  THE SYSTEM SHALL 显示与打包任务相关的配置、执行按钮、状态与日志区域。
- WHEN 用户刷新页面或重新进入打包标签页
  THE SYSTEM SHALL CONTINUE TO 保持现有前两个页签行为不变。

### R2. 页面可配置并触发当前常用打包命令

- WHEN 用户进入打包标签页
  THE SYSTEM SHALL 提供页面可指定的核心参数，包括目标服务、线程数、镜像版本，以及并行构建开关。
- WHEN 页面展示目标服务配置
  THE SYSTEM SHALL 以可下拉多选的方式让用户选择一个或多个目标服务。
- WHEN 页面展示线程数配置
  THE SYSTEM SHALL 使用数字输入控件让用户指定 `MAX_JOBS`。
- WHEN 页面展示镜像版本配置
  THE SYSTEM SHALL 提供最近使用值，帮助用户快速选择或回填镜像版本。
- WHEN 用户未主动修改配置
  THE SYSTEM SHALL 以当前常用命令对应的默认值预填：
  - `IMAGE_VERSION=v2.10.26.09-lts`
  - `PARALLEL_BUILD=true`
  - `MAX_JOBS=4`
  - `service=api-test`
- WHEN 用户点击开始打包
  THE SYSTEM SHALL 使用与人工命令等价的方式执行 `/Users/edy/ideaProjects/metersphere/打包/metersphere-build.sh`。
- WHEN 本次打包开始执行
  THE SYSTEM SHALL 将目标服务作为脚本位置参数传递，而不是把完整命令拼成不可控 shell 字符串。
- WHEN 用户在页面上修改线程数
  THE SYSTEM SHALL 将该值映射到 `MAX_JOBS`。
- WHEN 用户在页面上修改镜像版本
  THE SYSTEM SHALL 将该值映射到 `IMAGE_VERSION`。
- WHEN 用户选择最近使用的镜像版本
  THE SYSTEM SHALL 允许用户直接复用该值作为本次打包配置。
- WHEN 用户在页面上修改并行构建开关
  THE SYSTEM SHALL 将该值映射到 `PARALLEL_BUILD`。

### R2A. 服务选项来源与全量规则

- WHEN 打包页签展示服务下拉选项
  THE SYSTEM SHALL 仅提供脚本内已支持的服务白名单选项，而不是允许任意自由输入。
- WHEN 前端加载打包服务选项
  THE SYSTEM SHALL 从控制面板后端维护的单一来源读取服务白名单与默认值，而不是在页面中自行硬编码。
- WHEN 第一阶段页面使用多选服务控件
  THE SYSTEM SHALL 明确约束“未选择任何服务”时的行为，避免用户误触发全量打包。
- WHEN 用户未选择任何服务
  THE SYSTEM SHALL 默认拒绝执行，并提示用户显式选择至少一个服务；除非后续单独增加“构建全部”显式开关。

### R2B. 高价值扩展参数兼容

- WHEN 第一阶段最小闭环完成后
  THE SYSTEM SHALL 允许继续扩展 `BUILD_ONLY` 与 `PACKAGE_PATH` 这两个脚本已稳定支持的参数。
- WHEN 页面支持 `BUILD_ONLY`
  THE SYSTEM SHALL 将该值映射到脚本同名环境变量。
- WHEN 页面支持 `PACKAGE_PATH`
  THE SYSTEM SHALL 将该值映射到脚本同名环境变量。

### R3. 打包执行日志与状态反馈

- WHEN 打包任务正在执行
  THE SYSTEM SHALL 向页面持续显示脚本 stdout/stderr 日志。
- WHEN 打包任务进入运行中、成功、失败或取消状态
  THE SYSTEM SHALL 在 UI 中清晰展示当前状态。
- WHEN 打包任务结束
  THE SYSTEM SHALL 显示结束结果、退出码和必要的错误信息。
- WHEN 打包任务执行时间较长
  THE SYSTEM SHALL 持续向页面提供任务仍在运行的可观测信号，而不是让用户只能等待无反馈结果。

### R3A. 长时间任务心跳与超时策略

- WHEN Phase 1 打通最小闭环
  THE SYSTEM SHALL 默认允许打包脚本自然运行直到结束，而不对脚本施加激进的固定超时。
- WHEN 打包任务长时间运行
  THE SYSTEM SHALL 提供心跳或存活反馈机制，帮助用户确认任务仍在执行。
- WHEN 后续版本引入超时控制
  THE SYSTEM SHALL 允许将超时策略配置化，而不是把固定超时硬编码为不可调整行为。

### R3B. 脚本路径配置

- WHEN 控制面板执行打包脚本
  THE SYSTEM SHALL 优先从可配置路径读取打包脚本位置，而不是只依赖单一机器上的绝对路径。
- WHEN 未显式配置脚本路径
  THE SYSTEM SHALL 使用约定的默认路径解析策略，并在路径不存在时返回结构化错误。
- WHEN 脚本路径不可执行或不存在
  THE SYSTEM SHALL 在进入任务运行态前明确失败。

### R4. 最小可用的执行保护

- WHEN 已有打包任务仍在执行
  THE SYSTEM SHALL 阻止同类打包任务被重复触发，除非后续明确支持并发打包。
- WHEN 用户提交无效参数
  THE SYSTEM SHALL 在进入脚本执行前返回清晰的校验错误。
- WHEN 脚本路径不存在或不可执行
  THE SYSTEM SHALL 返回结构化错误信息，而不是让页面长期停留在运行中。

### R5. 与现有控制面板行为兼容

- WHEN 新增打包标签页后
  THE SYSTEM SHALL CONTINUE TO 保持现有“前端构建”和“服务管理”能力正常工作。
- WHEN 打包任务输出日志
  THE SYSTEM SHALL 不破坏现有构建日志与服务日志展示链路。
- WHEN 当前控制面板已有任务模型可复用
  THE SYSTEM SHALL 优先复用既有任务/进度/日志基础能力，而不是新增完全独立的另一套运行机制。

### R6. 输出物与脚本语义保持一致

- WHEN 打包脚本成功执行
  THE SYSTEM SHALL 保持脚本原有输出物语义不变，包括镜像构建和 tar 导出行为。
- WHEN 控制面板触发打包
  THE SYSTEM SHALL 不修改 sibling `metersphere` 仓库中的脚本逻辑。

### R7. 页面参数配置体验

- WHEN 用户打开打包页签
  THE SYSTEM SHALL 直观展示“服务、线程数、镜像版本”等核心配置项，而不是要求用户手工拼接命令。
- WHEN 页面展示打包配置
  THE SYSTEM SHALL 让用户能在开始执行前确认本次将要使用的服务、线程数、镜像版本和并行构建配置。

### R8. 后续扩展兼容性

- WHEN 后续需要支持更多脚本参数（如 `BUILD_ONLY`、`SKIP_INIT`、`PACKAGE_PATH`、`REGISTRY`）
  THE SYSTEM SHALL 允许在当前打包页签基础上继续扩展，而不需要推翻本轮 UI 和后端执行模型。
