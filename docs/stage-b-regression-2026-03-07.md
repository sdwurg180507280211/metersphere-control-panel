# 阶段 B 手工回归结果记录（2026-03-07）

## 范围

- 共享 `safe router push` 安装函数：`framework/sdk-parent/frontend/src/router/install-safe-push.js`
- 主应用登录校验缓存：`framework/sdk-parent/frontend/src/router/index.js`
- 8 个路由入口统一接入共享安装函数：
  - `framework/sdk-parent/frontend/src/router/index.js`
  - `api-test/frontend/src/router/index.js`
  - `test-track/frontend/src/router/index.js`
  - `performance-test/frontend/src/router/index.js`
  - `project-management/frontend/src/router/index.js`
  - `system-setting/frontend/src/router/index.js`
  - `workstation/frontend/src/router/index.js`
  - `report-stat/frontend/src/router/index.js`

## 本次执行方式

- 由于当前本机未启动前端网关或可用浏览器会话，本次先采用“代码级执行回归”。
- 直接加载并执行上述两段核心逻辑，覆盖阶段 B 最关心的 4 个行为场景。
- 同时补做静态核对，确认 8 个路由入口均已接入共享安装函数。

## 场景结果

| 场景 | 核查点 | 结果 | 记录 |
| --- | --- | --- | --- |
| B1 | 重复路由 `push` 不再抛出 `NavigationDuplicated`，且安装函数重复调用不会重复包裹 | 通过 | 返回值被安全吞掉；仅调用原始 `push` 1 次；二次安装后函数引用不变 |
| B2 | `router.push(location, onResolve, onReject)` 旧回调写法保持兼容 | 通过 | 回调参数完整透传；返回值保持原样 |
| B3 | 并发触发登录校验时只发起 1 次 `getIsLogin()`，TTL 窗口内不重复请求 | 通过 | 两次并发调用合并为 1 次请求；TTL 为 60000ms；TTL 内再次调用未增加请求数 |
| B4 | TTL 过期后会重新校验；校验失败后不会把失败状态缓存死，下一次仍可重试 | 通过 | TTL 过期后请求数从 1 增至 2；失败后 `lastLoginCheckTime` 仍为 0，`loginCheckPromise` 已清空，下一次再次发起请求 |

## 补充核对

- 8 个目标 `router/index.js` 均已包含 `installSafeRouterPush` 引入。
- 8 个目标 `router/index.js` 均已执行 `installSafeRouterPush(Router)`。
- 当前阶段 B 的“共享补丁接入面”已覆盖到位。

## 结论

- 阶段 B 的两个核心改动在本次代码级回归中均符合预期。
- `safe push` 的兼容性、幂等性、重复导航容错均正常。
- 登录校验的“限频 + 并发合并”语义正常，且未引入失败后无法重试的问题。

## 限制与下一步

- 本次尚未做浏览器级真实点击回归，因此没有产出 Network 面板中的真实 `getIsLogin()` 请求瀑布图。
- 若下一步需要，我可以继续补一轮“浏览器级”回归建议清单，按以下顺序执行：
  - 高频跨模块切换，记录 `getIsLogin()` 实际请求次数
  - 同路由重复点击，确认控制台无 `NavigationDuplicated` 噪音
  - 登录失效后跨模块跳转，确认仍能正确触发登录恢复链路
