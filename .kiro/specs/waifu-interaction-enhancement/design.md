# 看板娘互动增强 Design

## Spec Metadata

- 类型：Feature Spec
- Workflow：Design-First
- 关联需求：`.kiro/specs/waifu-interaction-enhancement/requirements.md`

## 1. 设计目标

打造完整的虚拟宠物体验：看板娘能自主漫游、被拖拽、感知系统状态、表达情绪、智能陪伴，同时提供勿扰模式让用户随时切换到纯工作状态。

设计原则：

- 最小侵入：所有增强逻辑通过独立 `<script>` 块注入，不修改 live2d-widgets 源码
- 状态分层：漫游 < 拖拽 < 聊天，高优先级状态自动暂停低优先级
- 优雅降级：模型捕获失败时不影响页面其他功能
- 性能敏感：所有动画在 `requestAnimationFrame` 循环中执行
- 用户可控：勿扰模式一键静默，偏好持久化

## 2. 技术架构

```
┌───────────────────────────────────────────────────────────┐
│                    frontend/index.html                      │
│                                                            │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌─────────┐│
│  │live2d-     │ │  聊天脚本   │ │  互动增强   │ │ 智能出现 ││
│  │widgets CDN │ │            │ │            │ │         ││
│  │            │ │- toggleChat│ │- modelCtrl │ │- idle   ││
│  │- initWidget│ │- sendMsg   │ │- gaze      │ │- notify ││
│  │- showMsg   │ │- innerHTML │ │- bounce    │ │- cooldown││
│  │- tips/tools│ │  hijack    │ │- speak     │ │- emotion││
│  │            │ │            │ │- emotions  │ │         ││
│  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └────┬────┘│
│        │              │              │              │     │
│        │     ┌────────┴──────────────┴──────────────┘     │
│        │     │                                            │
│        │     ▼  window.__waifuModelCtrl                   │
│        │                                                  │
│  ┌─────┴──────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │   漫游管理器    │  │  拖拽控制器   │  │  勿扰模式      │ │
│  │  roamManager   │  │ dragManager  │  │ dndToggle     │ │
│  │                │  │              │  │               │ │
│  │- idle 计时     │  │- 长按检测    │  │- localStorage │ │
│  │- 目标选取      │  │- 拖拽跟随    │  │- 状态开关     │ │
│  │- 伪走路动画    │  │- 弹性归位    │  │- 偏好恢复     │ │
│  │- 方向翻转      │  │- 表情联动    │  │               │ │
│  └────────────────┘  └──────────────┘  └───────────────┘ │
│                                                            │
│  ┌────────────────────────────────────────────────────────┤
│  │                     CSS 样式                            │
│  │ - 位置调整（右下角） - 弹跳动画 - 聊天模式             │
│  │ - 走路弹跳 @keyframes - 拖拽 cursor - 勿扰图标         │
│  └────────────────────────────────────────────────────────┤
└───────────────────────────────────────────────────────────┘
         │                              ▲
         │ POST /api/chat/message       │ WebSocket 事件
         ▼                              │ (service:status, build:complete)
┌───────────────────────────────────────┴───────────────────┐
│                    backend (Express)                        │
│                                                            │
│  server.js ──► routes/chat.js ──► chatController           │
│          └──► websocketService (已有事件推送)               │
│                                                            │
│  config.js: waifu.apiKey / baseUrl / model 配置            │
└────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────┐
│  通义千问 (Qwen) API - https://coding.dashscope.aliyuncs.com/v1 │
└────────────────────────────────────────────────────────────┘
```

## 3. 已有模块设计（Phase 1 已完成）

> 详见 design.md 历史版本，以下仅保留摘要。

### 3.1 模型控制器 (modelCtrl) ✅

- Monkey-patch 捕获 CubismCore.Model 实例
- Post-Update Override 参数覆盖钩子
- 暴露为 `window.__waifuModelCtrl`

### 3.2 视线跟随 ✅

- mousemove → lerp 平滑 → ParamAngleX/Y, ParamEyeBallX/Y, ParamBodyAngleX

### 3.3 点击弹跳 ✅

- canvas click → CSS waifu-bounce → 笑脸表情 → 600ms 清除

### 3.4 说话动画 ✅

- 正弦波驱动 ParamMouthOpenY，配合聊天发送/回复

### 3.5 AI 聊天后端 ✅

- chatController 会话管理 + 通义千问代理

### 3.6 聊天 UI ✅

- innerHTML 劫持 + MutationObserver + 深色主题气泡

## 4. 新增模块设计（Phase 2 最强互动）

### 4.1 情绪表情系统 (emotionSystem)

**目标**：为 modelCtrl 增加预设表情能力，供所有模块调用。

```javascript
// 新增到 modelCtrl 中
const EMOTIONS = {
  happy:    { ParamEyeLSmile: 1, ParamEyeRSmile: 1, ParamMouthForm: 1, ParamMouthOpenY: 0.3, ParamCheek: 0.5 },
  surprise: { ParamEyeLOpen: 1.2, ParamEyeROpen: 1.2, ParamBrowLY: 1, ParamBrowRY: 1, ParamMouthOpenY: 0.8, ParamMouthForm: 0 },
  shy:      { ParamAngleX: -10, ParamAngleY: -5, ParamCheek: 1, ParamEyeLOpen: 0.6, ParamEyeROpen: 0.6, ParamEyeBallX: -0.5, ParamEyeBallY: -0.3 },
  worried:  { ParamBrowLY: -0.5, ParamBrowRY: -0.5, ParamMouthForm: -1, ParamEyeLOpen: 0.8, ParamEyeROpen: 0.8 },
  angry:    { ParamBrowLAngle: -1, ParamBrowRAngle: -1, ParamBrowLY: -1, ParamBrowRY: -1, ParamMouthForm: -2 }
};

modelCtrl.showEmotion(name, durationMs = 3000) {
  // 1. 记录目标表情参数
  this._emotionTarget = EMOTIONS[name];
  this._emotionEndTime = Date.now() + durationMs;
  // 2. 在 animate 循环中 lerp 过渡到目标表情
  // 3. 到时间后 lerp 回默认值
}
```

**优先级机制**：
- 情绪表情参数 > 视线跟随同名参数
- 在 `_applyOverrides()` 中，情绪参数最后写入（覆盖视线）

### 4.2 自由漫游模式 (roamManager)

**状态机**：

```
IDLE (计时中)
  │  30s 无操作
  ▼
ROAMING (漫游中)
  │  ├── WALKING (走向目标)
  │  └── RESTING (到达目标，等 2~5s)
  │
  │  用户操作 / 聊天模式 / 拖拽
  ▼
RETURNING (回归 Home)
  │  到达
  ▼
IDLE (重新计时)
```

**核心设计**：

```javascript
const roamManager = {
  state: 'idle',       // idle | roaming | returning
  idleTimer: null,
  position: { x: 0 },  // 当前 X 偏移（相对于 Home）
  target: { x: 0 },
  direction: 1,         // 1=右, -1=左
  IDLE_TIMEOUT: 30000,
  SPEED: 2,             // px/frame (~100px/s at 60fps)
  ROAM_ZONE: { minX: 100, maxX: () => window.innerWidth - 200 },

  start() {
    this.resetIdleTimer();
    // 监听用户操作
    ['mousemove', 'mousedown', 'keydown', 'scroll'].forEach(evt =>
      document.addEventListener(evt, () => this.onUserActivity())
    );
  },

  resetIdleTimer() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.enterRoaming(), this.IDLE_TIMEOUT);
  },

  onUserActivity() {
    if (this.state === 'roaming') {
      this.returnHome();
    }
    this.resetIdleTimer();
  },

  enterRoaming() {
    if (dndToggle.enabled) return;  // 勿扰模式不漫游
    if (chatMode) return;           // 聊天中不漫游
    this.state = 'roaming';
    this.pickNewTarget();
    this.animateWalk();
  },

  pickNewTarget() {
    const waifu = document.getElementById('waifu');
    const rect = waifu.getBoundingClientRect();
    const homeX = rect.left;
    // 在安全范围内随机选点
    this.target.x = this.ROAM_ZONE.minX +
      Math.random() * (this.ROAM_ZONE.maxX() - this.ROAM_ZONE.minX) - homeX;
  },

  animateWalk() {
    if (this.state !== 'roaming') return;
    const dx = this.target.x - this.position.x;

    if (Math.abs(dx) < 5) {
      // 到达，休息后选新目标
      setTimeout(() => {
        if (this.state === 'roaming') this.pickNewTarget();
      }, 2000 + Math.random() * 3000);
      requestAnimationFrame(() => this.animateWalk());
      return;
    }

    // 方向翻转
    const newDir = dx > 0 ? 1 : -1;
    if (newDir !== this.direction) {
      this.direction = newDir;
      waifu.style.transform = newDir < 0 ? 'scaleX(-1)' : '';
    }

    // 移动
    this.position.x += Math.sign(dx) * this.SPEED;
    waifu.style.left = `calc(var(--waifu-home-left) + ${this.position.x}px)`;

    // 走路弹跳 + 身体摆动
    const walkPhase = Date.now() * 0.008;
    const bounce = Math.sin(walkPhase * Math.PI * 4) * 3;
    waifu.style.marginBottom = bounce + 'px';
    modelCtrl.paramOverrides['ParamBodyAngleX'] =
      Math.sin(walkPhase * Math.PI * 4) * 5;

    requestAnimationFrame(() => this.animateWalk());
  },

  returnHome() {
    this.state = 'returning';
    waifu.style.transition = 'left 0.8s ease-in-out';
    waifu.style.left = '';
    waifu.style.transform = '';
    waifu.style.marginBottom = '';
    this.position.x = 0;
    this.direction = 1;
    delete modelCtrl.paramOverrides['ParamBodyAngleX'];

    setTimeout(() => {
      waifu.style.transition = '';
      this.state = 'idle';
      this.resetIdleTimer();
    }, 800);
  }
};
```

### 4.3 拖拽控制器 (dragManager)

**核心设计**：长按 150ms 后进入拖拽，快速点击走弹跳。

```javascript
const dragManager = {
  dragging: false,
  longPressTimer: null,
  startPos: { x: 0, y: 0 },
  LONG_PRESS_MS: 150,

  init(canvas) {
    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    document.addEventListener('mouseup', (e) => this.onMouseUp(e));
  },

  onMouseDown(e) {
    this.startPos = { x: e.clientX, y: e.clientY };
    this.longPressTimer = setTimeout(() => {
      this.enterDrag(e);
    }, this.LONG_PRESS_MS);
  },

  enterDrag(e) {
    this.dragging = true;
    // 暂停漫游
    if (roamManager.state === 'roaming') roamManager.returnHome();
    // 暂停视线跟随
    modelCtrl.gazeEnabled = false;
    // 设置惊讶表情
    modelCtrl.showEmotion('surprise');
    // 样式
    waifu.style.cursor = 'grabbing';
    waifu.style.transition = 'none';
  },

  onMouseMove(e) {
    if (!this.dragging) return;
    const dx = e.clientX - this.startPos.x;
    const dy = e.clientY - this.startPos.y;
    waifu.style.transform = `translate(${dx}px, ${dy}px)`;
  },

  onMouseUp(e) {
    clearTimeout(this.longPressTimer);
    if (!this.dragging) return; // 短按走弹跳逻辑
    this.dragging = false;
    // 弹性归位
    waifu.style.transition = 'transform 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
    waifu.style.transform = 'translate(0, 0)';
    waifu.style.cursor = '';
    // 恢复
    modelCtrl.gazeEnabled = true;
    setTimeout(() => { waifu.style.transition = ''; }, 500);
  }
};
```

### 4.4 智能出现模式 (smartAppearance)

**核心设计**：

```javascript
const smartAppearance = {
  cooldowns: {},  // { eventType: lastTriggerTime }
  COOLDOWN_MS: 30000,

  init() {
    this.trackIdleTime();
    this.listenWebSocket();
  },

  canTrigger(eventType) {
    if (dndToggle.enabled) return false;
    if (chatMode) return false;
    const last = this.cooldowns[eventType] || 0;
    return Date.now() - last > this.COOLDOWN_MS;
  },

  trigger(eventType, message, emotion, durationMs = 5000) {
    if (!this.canTrigger(eventType)) return;
    this.cooldowns[eventType] = Date.now();

    // 显示消息（通过 live2d-widgets 的 showMessage）
    if (typeof showMessage === 'function') {
      showMessage(message, durationMs);
    }
    // 触发表情
    if (emotion) {
      modelCtrl.showEmotion(emotion, durationMs);
    }
  },

  // 空闲陪伴
  trackIdleTime() {
    let idleTimer;
    const messages = [
      '主人，还在吗？(◕ᴗ◕✿)',
      '要不要休息一下？眼睛会累的哦~',
      '好安静呀...主人在思考什么呢？',
      '无聊的话可以跟我聊天哦！点击 💬 按钮~'
    ];
    const resetTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        const msg = messages[Math.floor(Math.random() * messages.length)];
        this.trigger('idle', msg, 'shy');
        resetTimer(); // 继续计时
      }, 60000);
    };
    document.addEventListener('mousemove', resetTimer);
    document.addEventListener('keydown', resetTimer);
    resetTimer();
  },

  // WebSocket 事件联动
  listenWebSocket() {
    // 监听已有的 WebSocket 事件
    window.addEventListener('ws:service-status', (e) => {
      const { serviceName, status } = e.detail;
      if (status === 'running') {
        this.trigger('service-up', `${serviceName} 启动成功啦~ ✨`, 'happy');
      } else if (status === 'error' || status === 'failed') {
        this.trigger('service-down', `${serviceName} 出问题了！快看看日志~`, 'worried');
      }
    });

    window.addEventListener('ws:build-complete', (e) => {
      const { module, success } = e.detail;
      if (success) {
        this.trigger('build-ok', `${module} 构建完成~ 🎉`, 'happy');
      } else {
        this.trigger('build-fail', `${module} 构建失败了... 😢`, 'worried');
      }
    });
  }
};
```

**WebSocket 事件分发**：需要在前端已有的 WebSocket 消息处理中，增加自定义事件分发：

```javascript
// 在现有 WebSocket 消息处理逻辑中追加
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // ... 已有处理逻辑 ...

  // 分发给看板娘智能出现模块
  if (data.type === 'service:status') {
    window.dispatchEvent(new CustomEvent('ws:service-status', {
      detail: { serviceName: data.name, status: data.status }
    }));
  }
  if (data.type === 'build:complete') {
    window.dispatchEvent(new CustomEvent('ws:build-complete', {
      detail: { module: data.module, success: data.success }
    }));
  }
};
```

### 4.5 勿扰模式 (dndToggle)

**核心设计**：

```javascript
const dndToggle = {
  enabled: false,
  STORAGE_KEY: 'waifu-dnd-mode',

  init(toolBar) {
    // 从 localStorage 恢复
    this.enabled = localStorage.getItem(this.STORAGE_KEY) === 'true';
    // 创建工具栏图标
    this.createIcon(toolBar);
    // 如果恢复为 true，应用勿扰状态
    if (this.enabled) this.apply();
  },

  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem(this.STORAGE_KEY, this.enabled);
    this.apply();
  },

  apply() {
    const icon = document.querySelector('#waifu-tool span[data-tool="dnd"]');
    if (this.enabled) {
      icon?.classList.add('waifu-dnd-active');
      // 停止漫游
      if (roamManager.state === 'roaming') roamManager.returnHome();
      // 清除智能提示计时器（不影响 idle 计时器重启）
    } else {
      icon?.classList.remove('waifu-dnd-active');
      // 恢复漫游计时
      roamManager.resetIdleTimer();
    }
  },

  createIcon(toolBar) {
    // 月亮 SVG 图标，插入到 chat 图标之后
    const icon = document.createElement('span');
    icon.dataset.tool = 'dnd';
    icon.title = '勿扰模式';
    icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M283.2 35.6C191.5 43.4 118.4 120.5 118.4 214.4c0 100.3 81.3 181.6 181.6 181.6 93.9 0 171-73.1 178.8-164.8-18.4 27.9-50.1 46.4-86.4 46.4-57.4 0-104-46.6-104-104 0-36.3 18.5-68 46.4-86.4-.8-.1-34.2-7.2-51.6-51.6z"/></svg>';
    icon.addEventListener('click', () => this.toggle());
    // 插入到 quit 之前
    const quitIcon = toolBar.querySelector('span[data-tool="quit"]');
    if (quitIcon) toolBar.insertBefore(icon, quitIcon);
    else toolBar.appendChild(icon);
    if (this.enabled) icon.classList.add('waifu-dnd-active');
  }
};
```

### 4.6 状态优先级与互斥

| 优先级 | 状态 | 效果 |
|--------|------|------|
| 1 (最高) | 聊天模式 | 暂停漫游、暂停智能提示、保持视线跟随 |
| 2 | 拖拽中 | 暂停漫游、暂停视线跟随、惊讶表情 |
| 3 | 漫游中 | 身体摆动覆盖视线跟随的 BodyAngleX |
| 4 | 勿扰模式 | 禁止漫游和智能提示启动 |
| 5 (最低) | 默认 | 视线跟随 + 点击弹跳 |

## 5. 涉及文件清单

### Phase 1 已完成文件

| 文件 | 修改类型 | 说明 | 需求 |
|------|---------|------|------|
| `backend/controllers/chatController.js` | 新建 | 聊天会话管理 + API 代理 | R5 |
| `backend/routes/chat.js` | 新建 | 聊天路由 | R5 |
| `backend/server.js` | 修改 | 注册 chat 路由 | R5 |
| `backend/config.js` | 修改 | waifu 配置 normalize | R5 |

### Phase 2 需修改文件

| 文件 | 修改类型 | 说明 | 需求 |
|------|---------|------|------|
| `frontend/index.html` | 修改 | 新增漫游/拖拽/智能出现/勿扰/情绪脚本 + CSS | R8-R12 |
| `frontend/src/App.jsx` 或 WebSocket 处理文件 | 修改 | 添加自定义事件分发 | R13 |

## 6. 风险与兼容性

### 6.1 漫游位移与 live2d-widgets 拖拽冲突

**风险**：live2d-widgets 本身有 `drag: true` 配置，会监听拖拽事件。

**缓解**：我们的拖拽通过 long-press 触发，与 live2d-widgets 的拖拽共存。如果发生冲突，在 dragManager 的 enterDrag 中调用 `e.stopPropagation()` 阻止事件传播。

### 6.2 漫游中 CSS 位移与 live2d-widgets 位置

**风险**：live2d-widgets 通过 style 设置 `#waifu` 的 left 值，漫游通过 style.left 覆盖会被 live2d-widgets 的 drag 逻辑重置。

**缓解**：漫游通过 `margin-left` 或 `transform: translateX()` 实现位移，不直接修改 `left`，避免与 live2d-widgets 的 left 冲突。

### 6.3 性能：多个 requestAnimationFrame 循环

**风险**：视线跟随、漫游、情绪过渡各自有 rAF 循环。

**缓解**：合并为单一 rAF 主循环，在同一帧内依次执行各模块的 update。

### 6.4 WebSocket 事件格式

**风险**：当前 WebSocket 消息格式可能与预期不同。

**缓解**：在实现 R13 时先检查 `websocketService.js` 的实际消息格式，适配实际字段名。如果缺少所需事件，在后端补充推送。

## 7. 新增 CSS 样式

```css
/* 漫游走路弹跳 */
@keyframes waifu-walk-bounce {
  0%, 100% { margin-bottom: 0; }
  50% { margin-bottom: 3px; }
}
#waifu.waifu-walking {
  animation: waifu-walk-bounce 0.3s ease infinite;
}

/* 拖拽时光标 */
#waifu.waifu-dragging {
  cursor: grabbing !important;
}
#waifu.waifu-dragging canvas {
  cursor: grabbing !important;
}

/* 勿扰图标 */
#waifu-tool span[data-tool="dnd"] svg {
  fill: currentColor;
  width: 16px;
  height: 16px;
}
#waifu-tool span.waifu-dnd-active {
  color: #fbbf24 !important; /* 月亮黄 */
}

/* 漫游过渡 */
#waifu.waifu-returning {
  transition: left 0.8s ease-in-out, transform 0.3s ease !important;
}
```

## 8. 验证策略

### 8.1 漫游验证

- 等待 30 秒无操作 → 看板娘开始移动
- 看板娘只在底部区域走动
- 走路有弹跳感 + 身体摆动
- 方向改变时模型翻转
- 鼠标移动 → 看板娘立即停止并平滑回归

### 8.2 拖拽验证

- 快速点击 → 触发弹跳（不拖拽）
- 长按 → 进入拖拽模式
- 拖拽中看板娘跟随鼠标 + 惊讶表情
- 释放后弹性回到原位

### 8.3 智能出现验证

- 60 秒无操作 → 随机陪伴消息
- 服务启动成功/失败 → 对应表情 + 通知
- 聊天模式中不弹出智能提示
- 同类提示冷却 30 秒

### 8.4 勿扰模式验证

- 点击月亮图标 → 漫游和智能提示停止
- 刷新页面 → 勿扰模式保持
- 再次点击 → 功能恢复

### 8.5 情绪系统验证

- 各预设表情显示正确（开心/惊讶/害羞/担心/生气）
- 表情平滑过渡，不跳变
- 表情结束后平滑恢复
