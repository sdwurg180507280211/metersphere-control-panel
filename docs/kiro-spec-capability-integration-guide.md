# Kiro Specs 能力集成总手册

## 1. 文档目标

这份文档总结了如何把 Kiro Specs 工作方式沉淀为一套**可复用、可迁移、可前置**的个人能力，并说明当前仓库中已经落地的最终成果。

目标不是只在当前仓库里“会用一次”，而是形成一套以后可以在其它项目里快速的规范化方案，让你可以：

- 在个人层面把 Spec 思维固化为长期能力
- 在 Codex 层面把这套能力做成可显式触发的 `skill`
- 在全局层面让代理更主动地按 Spec 方式思考
- 在项目层面把具体 repo 的约束与 Spec 工作流结合起来
- 在已有设计文档、方案文档、API 文档存在时，快速转换为 `.kiro/specs/` 三件套

---

## 2. 最终想要的能力结构

为了让这套能力真正稳定，需要分成四层，而不是只做其中一层。

### 2.1 第 1 层：个人技能层（Skill）

作用：把通用的 Kiro Specs 方法做成可复用技能。

特点：

- 可跨仓复用
- 可显式调用，例如：`用 $kiro-specs 来整理这次需求`
- 可以把工作流、模板、判断标准沉淀下来
- 不依赖某个具体仓库

### 2.2 第 2 层：全局偏好层（Global AGENTS）

作用：让代理在你的大多数项目里都更主动地采用这套方法，而不是每次等你手动提醒。

特点：

- 作用于家目录下多个项目
- 规定默认偏好，例如先分 Feature / Bugfix、先定 workflow、优先三件套
- 比 skill 更“前置”

### 2.3 第 3 层：仓库规则层（Repo AGENTS）

作用：把某个具体仓库的结构、边界、实现方式与 Spec 工作流绑定起来。

特点：

- 只约束当前仓库
- 能把通用 Spec 方法落到这个 repo 的分层、文件结构、验证方式上
- 比全局偏好更具体，优先级更高

### 2.4 第 4 层：项目成果层（.kiro/specs）

作用：把某个具体需求、方案或问题真正落成可执行 spec。

特点：

- 是最终交付物
- 一般包含 `requirements.md` / `bugfix.md`、`design.md`、`tasks.md`
- 可以直接驱动实现、验证、迭代

---

## 3. 当前已经完成的最终成果

下面这些内容已经在当前环境中落地。

### 3.1 个人 Skill 已创建

位置：

- `~/.codex/skills/kiro-specs/SKILL.md`
- `~/.codex/skills/kiro-specs/references/kiro-specs-reference.md`
- `~/.codex/skills/kiro-specs/agents/openai.yaml`

作用：

- 将 Kiro Specs 的核心判断和工作流做成可复用 skill
- 统一 Feature Spec / Bugfix Spec 的分类方式
- 统一 Requirements-First / Design-First 的选择方式
- 统一 EARS 需求写法
- 统一 bugfix 中“当前行为 / 期望行为 / 不变行为”的表达方式
- 将 property-based testing 作为可选增强验证手段

### 3.2 全局 AGENTS 已创建

位置：

- `~/AGENTS.md`

作用：

- 将 Kiro-style Specs 设为非 trivial 软件任务的默认偏好
- 在 skill 可用时优先使用 `kiro-specs`
- 在 skill 不可用时，仍要求遵循同样的 Spec 思维
- 要求代理先分类任务，再决定 workflow，再组织 artifacts

### 3.3 当前仓库级 AGENTS 已创建

位置：

- `AGENTS.md`

作用：

- 将 Kiro-style 工作流与本仓库的实际分层绑定起来
- 约束本仓库要保持 `backend/routes -> controllers -> services` 分层
- 明确该仓库是 `metersphere-control-panel`，不要误改同级 `../metersphere`
- 强调 API、WebSocket 事件、配置字段等不应随意破坏兼容性

### 3.4 当前仓库的 Spec 已落地

位置：

- `.kiro/specs/ai-service-automation-backend/requirements.md`
- `.kiro/specs/ai-service-automation-backend/design.md`
- `.kiro/specs/ai-service-automation-backend/tasks.md`

来源文档：

- `docs/ai-service-automation-implementation-plan.md`
- `docs/ai-service-automation-api.md`
- `docs/ai-service-automation-operations-supplement.md`

效果：

- 已把原本的实现方案、API 设计和运维补充文档，收敛成一个可执行的 `Feature Spec`
- 工作流采用 `Design-First`
- 三件套已经可直接用于后续实现与迭代

---

## 4. 为什么必须分层建设

很多人只做一件事，例如：

- 只写一个 skill
- 或只写一个项目文档
- 或只在当前仓库里建一个 `.kiro/specs`

这样都不够。

### 4.1 只做 Skill 的问题

如果只有 skill：

- 需要显式触发
- 代理不会在大多数项目中默认采用这套方法
- 很容易“会用，但不主动用”

### 4.2 只做全局 AGENTS 的问题

如果只有全局 AGENTS：

- 有偏好，但没有完整可复用的技能正文和模板
- 规则容易偏抽象
- 不利于沉淀长工作流和参考资料

### 4.3 只做仓库 AGENTS 的问题

如果只有仓库 AGENTS：

- 能在这个 repo 用好，但无法迁移到别的 repo
- 每换一个项目都要重写一遍

### 4.4 只做 `.kiro/specs` 的问题

如果只有 spec 产物：

- 有结果，但缺少方法沉淀
- 下次在别的仓库还得重新组织一遍

### 4.5 四层叠加后的结果

四层同时存在时，能力会变成：

- **Skill** 负责“通用方法”
- **Global AGENTS** 负责“默认偏好”
- **Repo AGENTS** 负责“项目约束”
- **.kiro/specs** 负责“具体交付物”

这才是一套完整的可迁移能力体系。

---

## 5. 如何把 Kiro Specs 做成可复用个人 Skill

下面是标准做法。

### 5.1 什么时候应该做成 skill

适合做成 skill 的条件：

- 这是一个反复出现的工作流，而不是一次性行为
- 需要稳定的判断准则和固定输出结构
- 你希望未来多个项目复用
- 你希望代理在提到类似任务时能快速切换到这套方法

Kiro Specs 完全符合这些条件。

### 5.2 Skill 的最小组成

一个可用 skill 至少包含：

- `SKILL.md`
- 可选 `references/`
- 可选 `agents/openai.yaml`

对 Kiro Specs 来说，推荐最小结构如下：

```text
~/.codex/skills/kiro-specs/
├── SKILL.md
├── agents/
│   └── openai.yaml
└── references/
    └── kiro-specs-reference.md
```

### 5.3 Skill 里应该放什么

#### `SKILL.md` 应包含

- skill 触发描述（description）
- Feature Spec / Bugfix Spec 的分类规则
- Requirements-First / Design-First 的判断规则
- full spec 与轻量 spec 思维的判断规则
- 三件套 artifacts 的标准
- EARS 需求表达方式
- bugfix 的“不变行为”规则
- PBT 适用场景
- 实际输出模板

同时建议把更细的判断规则放到 `references/`，尤其是：

- 用户直接提需求时，默认先生成偏业务 / 行为导向的 `requirements.md`
- 从设计文档反推出来的 engineering-heavy requirements 只是 Design-First 特例，不应当成为通用模板
- 未执行 spec 可以补图、术语表、checkpoint 设计，但不能伪造执行进度或验证结果

#### `references/` 应包含

- 较长但不适合塞进 `SKILL.md` 的参考说明
- 例如：artifact 含义、迁移建议、流程细节、判断补充

#### `agents/openai.yaml` 应包含

- 人类可读 display name
- 简短描述
- 默认触发 prompt

### 5.4 当前 skill 的触发方式

显式触发示例：

- `用 $kiro-specs 来整理这次需求`
- `Use $kiro-specs to turn this design into a spec`
- `按 Kiro Specs 帮我拆 requirements/design/tasks`

隐式适用场景：

- 用户给出方案文档，希望转成 spec
- 用户要求把功能做成 requirements/design/tasks
- 用户要求对复杂 bug 做结构化分析
- 用户希望根据架构设计反推需求和任务拆解

### 5.5 以后迁移到另一台机器的最小步骤

只要复制下面目录即可：

```bash
cp -R ~/.codex/skills/kiro-specs <目标机器>~/.codex/skills/
```

如果目标机器已有 Codex 环境，这一步通常就足够恢复 skill。

---

## 6. 如何把这个能力再“前置”一层

这一步的关键是：**不要只靠 skill 被动触发，而要让代理默认倾向于用这套方法。**

### 6.1 全局前置的推荐方式

最稳妥的做法是写入：

- `~/AGENTS.md`

这比依赖某个产品内部的“隐藏系统提示位”更稳定、更可迁移。

### 6.2 全局 AGENTS 里应该写什么

应该写的是“偏好”和“默认工作方式”，而不是项目细节。

推荐写入：

- 非 trivial 软件任务优先按 Kiro-style Specs 工作
- 先分 `Feature Spec` / `Bugfix Spec`
- 再选 `Requirements-First` / `Design-First`
- 优先组织成 `requirements.md` / `bugfix.md`、`design.md`、`tasks.md`
- bugfix 必须保留 unchanged behavior
- 适合时建议 property-based testing
- trivial 改动不必强行上完整仪式

### 6.3 为什么全局 AGENTS 比“手动提醒”更好

因为它能把这件事从：

- “你每次都得提醒代理按 spec 来做”

变成：

- “代理默认就会先往 spec 化工作流靠”

这会显著减少来回对齐成本。

---

## 7. 如何在具体仓库里再落一层 Repo AGENTS

全局 AGENTS 只管偏好，不够具体；仓库级规则必须说明项目自己的结构。

### 7.1 仓库级 AGENTS 应该写什么

推荐包含：

- 仓库背景和边界
- 哪些目录是核心目录
- 当前推荐分层
- 哪些接口或事件不该轻易破坏
- 何时更新 README / docs
- 如何验证
- 本仓库下如何使用 spec 工作流

### 7.2 当前仓库为什么需要这层

因为当前仓库有明确的项目特征：

- Node/Express backend
- Vite/React frontend
- WebSocket 实时事件
- 与同级 `../metersphere` 仓库有关联
- 要求兼容现有 API、事件和配置结构

这些都不适合写进全局 AGENTS，也不适合写进通用 skill。

### 7.3 当前仓库已写入的重点

当前 `AGENTS.md` 已明确：

- 先按轻量 Kiro-style flow 组织复杂工作
- 后端分层保持 `routes -> controllers -> services`
- 前端保持当前组件 / hook / store / CSS 组织方式
- 不要误改同级 `../metersphere`
- 保持当前 API / WebSocket / config 兼容性

---

## 8. 如何把现有方案文档快速转成 Spec

这是未来最常用的一步。

### 8.1 输入材料的典型类型

可以转 spec 的原始材料包括：

- 方案文档
- 架构设计文档
- API 设计文档
- 运维补充规范
- bug 分析文档
- 产品需求文档

### 8.2 第一步：先判断这是 Feature 还是 Bugfix

判断标准：

- 新增能力、系统演进、重构、平台化：通常是 `Feature Spec`
- 修缺陷、诊断根因、控制回归：通常是 `Bugfix Spec`

当前 `ai-service-automation-*` 这一组文档属于：

- `Feature Spec`

因为它描述的是后端能力补齐与平台化升级，而不是某个单点缺陷修复。

### 8.3 第二步：判断 workflow

判断标准：

- 如果输入主要是用户行为、业务需求、验收标准：优先 `Requirements-First`
- 如果输入主要是架构方案、技术约束、API 模型、运维基线：优先 `Design-First`

一个重要的默认原则是：

- **如果是用户直接提出一个新的 non-trivial 需求，而不是给你现成设计文档，默认应先产出偏业务 / 行为导向的 `requirements.md`**
- 只有当技术约束本身已经主导范围时，才默认进入 `Design-First`

当前这组文档应选：

- `Design-First`

原因：

- 原始文档本身就是实现方案 + API 设计 + 运维规范
- 技术架构已经很明确
- 更适合先定设计，再反推 requirements 和 tasks
- 这属于 Design-First 特例，不应反过来成为所有 requirements.md 的默认风格

### 8.4 第三步：抽取三件套

#### `requirements.md`

不是复制原方案，而是抽成：

- 用户故事
- EARS requirements
- 兼容性要求
- 并发、恢复、可观测性、运维边界

#### `design.md`

保留和收敛：

- 目标分层
- 数据模型
- Redis key 设计
- API 响应契约
- WebSocket 事件
- 健康检查与补偿策略
- 批量与限流模型
- 文件改动映射

#### `tasks.md`

按阶段拆：

- 先最小闭环
- 再迁移旧能力
- 再做兼容收敛和运维基线

### 8.5 第四步：把任务拆成“真的能做”的粒度

好的 `tasks.md` 不只是“新增某能力”，而是要拆到：

- 新增哪个 service
- 改哪个 route/controller
- 补哪个 helper
- 哪些验证要做
- 哪些兼容层要保留

这一步决定了 spec 是否真的能驱动开发。

补充一个执行真实性原则：

- 如果 spec 还未执行，可以补充术语表、架构图、阶段性 checkpoint 设计和 validation 计划
- 但不应该提前写成 `[x]`、不应该伪造 checkpoint 结果，也不应该伪造“已经验证通过”的描述
- 要明确区分：任务设计、checkpoint 设计、实际执行进度、实际验证结果

补充一个执行同步原则：

- 开始实现前，先读取 `tasks.md`，把它当作当前执行计划
- 完成一批真实代码改动后，立即更新 `tasks.md`，不要等全部做完再统一补
- 做完真实验证后，再更新 `Checkpoint` / `Validation`
- 如果中途实现范围发生变化，也应先回写 `tasks.md` 再继续推进

---

## 9. 当前案例：AI 自动化服务控制后端 Spec 是怎么做出来的

本次转换过程可以概括为：

### 9.1 原始输入

- `docs/ai-service-automation-implementation-plan.md`
- `docs/ai-service-automation-api.md`
- `docs/ai-service-automation-operations-supplement.md`

### 9.2 分类结果

- 类型：`Feature Spec`
- Workflow：`Design-First`

### 9.3 设计收敛点

最终保留的核心设计包括：

- 新增 `jobService`
- 新增 `serviceTaskService`
- 新增 `jobs` 查询路由
- 新增 `POST /api/services/:id/reload`
- `processManager` 新增 `compileService()`
- Redis 持久化任务与锁
- 启动恢复扫描
- `job:*` WebSocket 事件
- 构建兼容 `buildId + jobId`
- 锁治理、限流、健康检查、补偿启动

### 9.4 任务拆解策略

任务没有“一口气重写全系统”，而是拆成：

- Phase 1：打通 `jobService + reload` 最小闭环
- Phase 2：迁移现有服务控制与构建能力
- Phase 3：补齐运维基线、限流、错误码、批量模型、兼容收敛

这是最适合现有仓库的落地方式，因为它：

- 对当前前端冲击最小
- 不需要推翻 `processManager`
- 可以先解决 AI 可调用性和 `reload` 问题
- 便于渐进验证

---

## 10. 想在其它地方快速集成这个 Spec 功能时，推荐的标准动作

如果以后你在另一个项目里，也想快速拥有这套能力，推荐按下面顺序执行。

### Step 1：复制个人 Skill

复制：

- `~/.codex/skills/kiro-specs/`

如果目标环境还没有 skill，可直接把当前 skill 拷过去。

### Step 2：复制全局 AGENTS 偏好

复制：

- `~/AGENTS.md`

或者把其中的 `Kiro-style Specs` 段落合并到目标环境已有的全局 AGENTS。

### Step 3：为新仓库写一个 Repo AGENTS

新仓库最少要说明：

- 项目背景
- 代码结构
- 分层约定
- 文档更新规则
- 验证方式
- 如何在本 repo 中使用 Spec

### Step 4：创建 `.kiro/specs/`

推荐目录：

```text
.kiro/specs/
  <spec-name>/
    requirements.md
    design.md
    tasks.md
```

如果是 bugfix：

```text
.kiro/specs/
  <bugfix-name>/
    bugfix.md
    design.md
    tasks.md
```

### Step 5：选一个真实需求先做试点

不要先大面积铺开，先选一个：

- 复杂功能
- 架构改造
- 高风险 bugfix
- 需要长期维护的方案落地

做成一个完整 spec，看看这套工作流是否顺手，再扩散。

---

## 11. 一份可复制的快速集成清单

以后在新项目里，可以直接照这个 checklist 走。

### 11.1 环境级清单

- [ ] 安装或复制 `kiro-specs` skill
- [ ] 配置 `~/AGENTS.md` 全局偏好
- [ ] 确认 Codex 能命中 skill 与 AGENTS 规则

### 11.2 仓库级清单

- [ ] 新建仓库根 `AGENTS.md`
- [ ] 明确项目结构、边界、验证方式
- [ ] 明确该仓库下 spec 的落点目录

### 11.3 项目级清单

- [ ] 为一个真实需求创建 `.kiro/specs/<name>/`
- [ ] 判断 Feature / Bugfix
- [ ] 判断 Requirements-First / Design-First
- [ ] 生成 `requirements.md` / `bugfix.md`
- [ ] 生成 `design.md`
- [ ] 生成 `tasks.md`
- [ ] 从 `Phase 1` 或最小闭环开始实施

### 11.4 迁移级清单

- [ ] 保留兼容层，不要一次性重写全部旧接口
- [ ] 将原有设计文档映射到 requirements / design / tasks
- [ ] 在 spec 与实现之间保持双向更新
- [ ] 在完成后回补文档与验证结论

---

## 12. 推荐的模板做法

### 12.1 Feature Spec 模板

```text
# <Feature Name> Requirements

## Spec Metadata
- 类型：Feature Spec
- Workflow：Requirements-First 或 Design-First

## User Story 1 - <故事>
### Requirement 1.1
WHEN ...
THE SYSTEM SHALL ...
```

### 12.2 Bugfix Spec 模板

```text
# <Bugfix Name> Bugfix

## Current Behavior
WHEN ...
THEN the system ...

## Expected Behavior
WHEN ...
THEN the system SHALL ...

## Unchanged Behavior
WHEN ...
THEN the system SHALL CONTINUE TO ...
```

### 12.3 Tasks 模板

```text
## Phase 1 - 最小可用闭环
- [ ] 1.1 ...
- [ ] 1.2 ...

## Validation
- [ ] V1 ...
```

---

## 13. 这套能力的边界与注意事项

### 13.1 它不是永久模型记忆

这套能力通过以下方式实现“长期可用”：

- 个人 skill
- 全局 AGENTS
- 项目 AGENTS
- 项目内 spec 文档

这比“会话里临时记住”稳定得多，但本质上仍是**可持久化配置与文档体系**，不是模型底层永久记忆槽。

### 13.2 它不应该强迫一切都走 full spec

对于下面这些场景，应轻量处理：

- 单行修复
- 明显小范围 UI 文案调整
- 明确、低风险、无依赖的一次性改动

即使不写完整 spec，也可以保留：

- 分类思维
- 约束思维
- 任务拆解思维

### 13.3 它依赖持续维护

如果 skill、全局 AGENTS、仓库 AGENTS 与项目实践长期脱节，这套能力就会逐渐失真。

建议：

- 每做完一类典型任务，就回头修一次 skill 或 AGENTS
- 把真实踩坑沉淀进 references 或 docs
- 让这套体系随着你的项目实践一起演进

---

## 14. 当前仓库后续建议

针对当前 `metersphere-control-panel`，下一步最值得做的是：

1. 直接按 `.kiro/specs/ai-service-automation-backend/tasks.md` 的 Phase 1 开始实现
2. 优先打通 `jobService + jobs 查询 + reload 接口骨架`
3. 在实现过程中把真实踩坑继续补进：
   - `docs/`
   - `kiro-specs` skill references
   - 仓库 `AGENTS.md`

这样这套能力就不只是“文档和规则”，而会演进成真正可反复复用的工程资产。

---

## 15. 快速定位当前成果

### 15.1 Skill

- `~/.codex/skills/kiro-specs/SKILL.md`
- `~/.codex/skills/kiro-specs/references/kiro-specs-reference.md`
- `~/.codex/skills/kiro-specs/agents/openai.yaml`

### 15.2 全局规则

- `~/AGENTS.md`

### 15.3 当前仓库规则

- `AGENTS.md`

### 15.4 当前仓库 Spec

- `.kiro/specs/ai-service-automation-backend/requirements.md`
- `.kiro/specs/ai-service-automation-backend/design.md`
- `.kiro/specs/ai-service-automation-backend/tasks.md`

### 15.5 本手册

- `docs/kiro-spec-capability-integration-guide.md`

---

## 16. 最终结论

如果你的目标是：

- 以后在其它地方也能快速拥有 spec 能力
- 不想每次从零提醒代理按 spec 工作
- 想把“方法、偏好、项目规则、具体成果”全部沉淀下来

那么最有效的办法就是：

1. 用 `skill` 沉淀通用方法
2. 用 `~/AGENTS.md` 前置默认偏好
3. 用仓库 `AGENTS.md` 绑定项目约束
4. 用 `.kiro/specs/` 沉淀具体需求成果
5. 用这份总手册做迁移与集成指南

这就是一套可复制到其它项目的完整方案，而不只是当前仓库里的一次性操作。

---

## 17. Bootstrap 模板包（新增）

为了把这套能力快速复制到其它项目，当前仓库额外提供了一个可直接复用的 bootstrap 包。

### 17.1 位置

- `templates/kiro-spec-bootstrap/README.md`
- `templates/kiro-spec-bootstrap/global/AGENTS.md`
- `templates/kiro-spec-bootstrap/repo/AGENTS.md.template`
- `templates/kiro-spec-bootstrap/specs/feature/requirements.md.template`
- `templates/kiro-spec-bootstrap/specs/feature/design.md.template`
- `templates/kiro-spec-bootstrap/specs/feature/tasks.md.template`
- `templates/kiro-spec-bootstrap/specs/bugfix/bugfix.md.template`
- `templates/kiro-spec-bootstrap/specs/bugfix/design.md.template`
- `templates/kiro-spec-bootstrap/specs/bugfix/tasks.md.template`
- `templates/kiro-spec-bootstrap/skill/kiro-specs/SKILL.md`
- `templates/kiro-spec-bootstrap/skill/kiro-specs/references/kiro-specs-reference.md`
- `templates/kiro-spec-bootstrap/skill/kiro-specs/agents/openai.yaml`
- `scripts/bootstrap-kiro-spec.sh`

### 17.2 最快使用方式

在任意目标仓库执行：

```bash
scripts/bootstrap-kiro-spec.sh --target-dir /path/to/target-repo --install-skill
```

如果还希望一并处理全局偏好：

```bash
scripts/bootstrap-kiro-spec.sh \
  --target-dir /path/to/target-repo \
  --project-name my-project \
  --install-skill \
  --install-global-agents
```

### 17.3 脚本会做什么

- 将 spec 模板复制到目标仓库的 `.kiro/specs/_templates/`
- 将 bootstrap README 复制到目标仓库的 `docs/kiro-spec-bootstrap-pack.md`
- 如果目标仓库没有 `AGENTS.md`，则生成一份仓库级模板
- 如果目标仓库已有 `AGENTS.md`，则生成 `AGENTS.kiro-spec.template.md` 供手动合并
- 可选安装 `kiro-specs` skill 到 `~/.codex/skills/`
- 可选在没有全局 AGENTS 时写入 `~/AGENTS.md`；如已存在，则写出 `~/AGENTS.kiro-spec.snippet.md`

### 17.4 推荐使用顺序

1. 先跑 bootstrap 脚本
2. 补完目标仓库的 `AGENTS.md`
3. 选一个真实需求建立 `.kiro/specs/<spec-name>/`
4. 从 `_templates` 复制出 feature 或 bugfix 三件套
5. 再根据该仓库的真实结构细化 design 和 tasks
