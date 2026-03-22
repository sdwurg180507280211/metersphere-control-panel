# 看板娘聊天功能设计方案

## 1. 设计原则

### 核心目标
- **保持原有交互**：`live2d-widgets` 的气泡提示逻辑完全不变
- **渐进式展开**：聊天功能作为叠加层，不影响看板娘原有行为
- **状态互斥**：聊天模式和原生提示模式不共存，避免内容冲突

---

## 2. 交互流程

### 2.1 正常状态（原有逻辑）

```
┌─────────────────────────────────────┐
│                                     │
│         [页面内容区域]               │
│                                     │
│                      ┌───────────┐  │
│                      │ 下午好~   │  │  ← 鼠标移入看板娘，显示原生 tips
│                      │ 主人    ◕‿◕│  │
│                      └───────────┘  │
│                           🐱        │
│                          /||\       │
│                                     │
└─────────────────────────────────────┘
```

**行为**：
- 鼠标移入：显示问候语/时间提示
- 鼠标移出：气泡消失
- 点击工具：显示对应提示（如"要拍照吗？"）

### 2.2 聊天入口

```
┌─────────────────────────────────────┐
│                                     │
│         [页面内容区域]               │
│                                     │
│                      ┌───────────┐  │
│                      │ 下午好~   │  │
│                      │ 主人    ◕‿◕│  │
│                      └───────────┘  │
│                           🐱        │
│                      💬  /||\       │  ← 鼠标移入时浮现聊天按钮（200ms延迟）
│                                     │
└─────────────────────────────────────┘
```

**行为**：
- 鼠标移入看板娘区域，延迟 200ms 显示 💬 按钮
- 快速划过不触发，避免误触
- 💬 按钮半透明，不遮挡其他工具按钮

### 2.3 聊天模式

```
┌─────────────────────────────────────┐
│                                     │
│         [页面内容区域]               │
│                                     │
│                      ┌───────────┐  │
│                      │ 你好呀~   │  │  ← 原生 tips 内容保留
│                      │ 有什么可  │  │
│                      │ 以帮你的？│  │
│                      ├───────────┤  │
│                      │ 输入消息..│  │  ← 输入框出现在气泡下方
│                      └───────────┘  │
│                           🐱        │
│                      💙  /||\       │  ← 💬 按钮高亮表示聊天模式激活
│                                     │
└─────────────────────────────────────┘
```

**行为**：
- 点击 💬 进入聊天模式
- 输入框从气泡下方滑出
- 原生 tips 内容保留显示
- 输入消息，按 Enter 发送

### 2.4 对话状态

```
┌─────────────────────────────────────┐
│                                     │
│         [页面内容区域]               │
│                                     │
│                      ┌───────────┐  │
│                      │ 你：在吗  │  │  ← 用户消息（右对齐/灰色小字）
│                      │ 梦：在的~ │  │  ← AI 回复（左对齐/主色）
│                      │ 有什么可  │  │
│                      │ 以帮你？◕‿◕│  │
│                      ├───────────┤  │
│                      │ 输入消息..│  │  ← 输入框保持，支持连续对话
│                      └───────────┘  │
│                           🐱        │
│                      💙  /||\       │
│                                     │
└─────────────────────────────────────┘
```

**行为**：
- 用户消息和 AI 回复交替显示
- 气泡自动增高（最大高度限制）
- 支持滚动查看历史
- 输入框保持聚焦，方便连续对话

### 2.5 退出聊天

```
方式1：点击 💬 按钮（已高亮状态）→ 退出聊天模式，恢复原状态
方式2：鼠标移出看板娘区域 → 气泡消失，再移入时恢复普通模式
方式3：点击页面其他区域 → 气泡消失，聊天内容暂存
```

---

## 3. 冲突处理策略

### 3.1 问题场景

| 场景 | 原生气泡行为 | 冲突结果 |
|------|-------------|----------|
| 聊天中，鼠标移到链接上 | 显示"要点击吗？" | 覆盖聊天内容 |
| 聊天中，5分钟无操作 | 随机显示"好无聊~" | 打断对话 |
| 聊天中，点击"拍照"工具 | 显示"正在拍照..." | 丢失用户上下文 |

### 3.2 解决方案：状态劫持

```javascript
// 进入聊天模式
function enterChatMode() {
  chatMode = true;

  // 保存原生 showMessage
  originalShowMessage = window.showMessage;

  // 劫持：聊天模式下原生提示入队，暂不显示
  window.showMessage = function(text, timeout) {
    if (chatMode) {
      pendingTips.push({text, timeout});
      return;
    }
    originalShowMessage(text, timeout);
  };
}

// 退出聊天模式
function exitChatMode() {
  chatMode = false;
  window.showMessage = originalShowMessage;

  // 显示积压的原生提示（如有）
  if (pendingTips.length > 0) {
    const tip = pendingTips.shift();
    showMessage(tip.text, tip.timeout);
  }
}
```

### 3.3 状态优先级

```
聊天模式 > 原生提示

当 chatMode = true 时：
  - 忽略所有原生 showMessage 调用
  - 原生提示进入 pendingTips 队列
  - 气泡只显示聊天内容

当 chatMode = false 时：
  - 恢复原生 showMessage
  - 如有积压提示，依次显示
  - 气泡恢复正常行为
```

---

## 4. UI/UX 细节

### 4.1 💬 按钮设计

```css
/* 默认状态：透明隐藏 */
#waifu-chat-btn {
  position: absolute;
  right: -20px;
  top: 50%;
  opacity: 0;
  transform: translateY(-50%);
  transition: opacity 0.2s, transform 0.2s;
  pointer-events: none;
}

/* 鼠标移入看板娘区域后显示 */
#waifu:hover #waifu-chat-btn {
  opacity: 0.7;
  pointer-events: auto;
}

/* 聊天模式激活：高亮 */
#waifu-chat-btn.active {
  opacity: 1;
  color: #60a5fa;
  filter: drop-shadow(0 0 4px rgba(96, 165, 250, 0.6));
}
```

### 4.2 输入框设计

```css
.waifu-chat-input-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(30, 40, 70, 0.9);
  border-top: 1px solid rgba(100, 140, 255, 0.2);
  border-radius: 0 0 8px 8px;
}

.waifu-chat-input-bar input {
  flex: 1;
  background: transparent;
  border: none;
  color: #e2e8f0;
  font-size: 13px;
  outline: none;
}

.waifu-chat-input-bar input::placeholder {
  color: rgba(226, 232, 240, 0.4);
}
```

### 4.3 消息样式

```css
/* 用户消息 */
.waifu-chat-msg-user {
  text-align: right;
  font-size: 12px;
  color: rgba(226, 232, 240, 0.6);
  margin-bottom: 4px;
}

/* AI 消息 */
.waifu-chat-msg-ai {
  text-align: left;
  font-size: 13px;
  color: #e2e8f0;
  line-height: 1.5;
}

/* 消息分隔 */
.waifu-chat-divider {
  border: none;
  border-top: 1px solid rgba(100, 140, 255, 0.15);
  margin: 6px 0;
}
```

---

## 5. 实现要点

### 5.1 文件结构

```
frontend/
├── index.html
│   └── 看板娘聊天模块（内联脚本 + 样式）
└── src/
    └── components/
        └── WaifuChat/          # 可选：后续拆分为组件
            ├── index.js
            ├── chatStore.js
            └── styles.css
```

### 5.2 核心模块

```javascript
// 模块：看板娘聊天控制器
const WaifuChat = {
  // 状态
  chatMode: false,
  sessionId: null,
  messages: [],
  originalShowMessage: null,
  pendingTips: [],

  // 初始化
  init() {
    this.waitForWaifu().then(() => {
      this.injectChatButton();
      this.bindEvents();
    });
  },

  // 等待看板娘加载
  waitForWaifu() { /* ... */ },

  // 注入 💬 按钮
  injectChatButton() { /* ... */ },

  // 进入/退出聊天模式
  enterChatMode() { /* 劫持原生 showMessage */ },
  exitChatMode() { /* 恢复原生 showMessage */ },

  // 发送消息
  async sendMessage(text) { /* 调用 /api/chat/message */ },

  // 渲染消息到气泡
  renderMessages() { /* 更新 #waifu-tips 内容 */ }
};
```

### 5.3 API 调用

```javascript
// POST /api/chat/message
const response = await fetch('/api/chat/message', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: userInput,
    sessionId: this.sessionId  // 保持会话连续性
  })
});

// 返回
{
  success: true,
  data: {
    reply: "好的呀~",
    sessionId: "waifu-xxx",
    usage: { prompt_tokens: 10, completion_tokens: 5 }
  }
}
```

---

## 6. 边界情况处理

| 场景 | 处理策略 |
|------|----------|
| 后端 API 未配置 | 点击 💬 提示"AI 功能未启用，请联系管理员配置" |
| API 请求失败 | 气泡内显示"网络开小差了，稍后再试~" |
| 消息过长 | 输入框限制 200 字，超长截断提示 |
| 气泡超出屏幕 | 自动调整位置，确保输入框可见 |
| 多标签页 | 每个标签页独立 sessionId，互不干扰 |

---

## 7. 后续优化方向

### 7.1 短期（可选）
- [ ] Markdown 渲染（代码高亮）
- [ ] 快捷指令（`/clear` 清屏）
- [ ] 语音合成（AI 回复朗读）

### 7.2 长期（可选）
- [ ] 流式响应（SSE 逐字输出）
- [ ] 历史记录持久化（localStorage）
- [ ] 多角色切换（程序员/测试/萌妹）

---

## 8. 总结

本方案的核心是**在不破坏原有体验的前提下，叠加聊天功能**。

关键设计决策：
1. **💬 按钮延迟浮现** —— 避免误触，保持界面干净
2. **输入框紧贴气泡下方** —— 视线集中，符合直觉
3. **状态劫持** —— 聊天时压制原生提示，避免冲突
4. **状态互斥** —— 非此即彼，简化交互模型

实现复杂度：**中等**（2-3 小时）
