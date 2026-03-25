# 对话总结

## 日期
2026-03-24

## 主要任务

本次对话围绕 MeterSphere 项目看板娘的 Live2D 集成交互功能进行评估、开发和文档整理。

---

## 用户请求序列

### 1. 语音系统评估
**请求：** "评估一下这个项目看板娘集成的语音系统"

**行动：**
- 全面分析了语音系统架构
- 评估了 ASR（语音识别）、TTS（文字转语音）、AI 对话、LipSync（嘴型同步）各模块
- 提供了详细的架构图和改进建议

**评估结果：**
- ✅ Web Speech API 集成完整
- ✅ 通义千问 AI 对话后端实现
- ✅ LipSync 系统设计合理
- ⚠️ 发现 LipSync 文字传递问题

---

### 2. 语音控制面板集成
**请求：** "@frontend/live2d-test.html 把语音的控制面板放在这里面，在这里集成一下"

**行动：**
- 在 `live2d-test.html` 中添加了语音控制面板
- 实现了 ASR/TTS 开关、语音输入按钮、AI 对话功能

---

### 3. AI 对话与模型参数控制
**请求：**
1. "Ai对话集成了之前写的代码对吗"
2. "如何控制模型的参数，比如fuxuan模型，有哪些参数可以控制，如何控制，讲一下"

**行动：**
- 确认 AI 对话集成情况
- 详细解析 fuxuan 模型的参数系统
- 讲解标准参数和自定义参数
- 演示如何通过代码控制参数

---

### 4. 交互选项修复
**请求：** "交互选项，实际上只有点击互动有效，其它两个是无效的"

**行动：**
- 检查自动眨眼、鼠标跟随功能
- 修复事件绑定问题
- 确认 focusController 正确位置

---

### 5. 参数控制面板开发
**请求：**
- "把这个交互选项去掉，然后参数控制，不是每个模型都有参数吗，那么面板是不是应该多一个参数控制一栏"
- "1.参数是模型特有的 2.参数要显示中文"

**行动：**
- 移除无效的交互选项
- 实现动态参数探测系统
- 从 `.cdi3.json` 读取中文参数名
- 创建参数滑块控制面板
- 修复 TTS 文字未传递给 LipSync 的 bug（添加 `currentSpeechText`）

---

### 6. 模型文件遍历与文档
**请求：** "我需要你遍历模型文件集，指出每个文件的存储了什么，给我一个目录"

**行动：**
- 完整遍历 9 个模型目录
- 分析每种文件格式的作用
- 列出每个模型的详细文件结构

---

### 7. Markdown 文档生成
**最终请求：**
1. "md文档格式总结到 frontend/public/live2d/"
2. "总结对话，包括用户请求、我的行动、技术细节等"

**行动：**
- 生成 `README.md` 完整模型文档
- 生成本 `CONVERSATION_SUMMARY.md` 对话总结

---

## 技术细节

### 关键文件修改

| 文件 | 修改内容 |
|------|----------|
| `frontend/live2d-test.html` | 添加语音控制面板、参数控制面板 |
| `frontend/src/live2d-test/main.tsx` | 集成语音系统、参数探测、动态滑块 |
| `frontend/src/live2d/controller/Live2DController.js` | 添加 `currentSpeechText`，修复 LipSync 文字丢失 |
| `frontend/public/live2d/README.md` | 新建，完整模型文档 |
| `frontend/public/live2d/CONVERSATION_SUMMARY.md` | 新建，对话总结 |

### 已存在的服务文件

| 文件 | 功能 |
|------|------|
| `frontend/src/live2d/services/SpeechRecognitionService.js` | ASR 语音识别服务 |
| `frontend/src/live2d/services/TextToSpeechService.js` | TTS 文字转语音服务 |
| `frontend/src/live2d/features/lipSync/LipSyncSystem.js` | 嘴型同步系统 |
| `backend/controllers/chatController.js` | 通义千问 AI 对话后端 |

### 模型文件格式详解

| 格式 | 说明 | 关键内容 |
|------|------|----------|
| `.model3.json` | 模型入口 | Moc 引用、纹理列表、物理配置引用、显示信息引用 |
| `.moc3` | 核心数据 | 二进制，包含网格、变形器、参数定义 |
| `.cdi3.json` | 参数信息 | Parameters（ID+中文名+分组）、ParameterGroups、Parts |
| `.physics3.json` | 物理配置 | 头发、衣服等物理模拟参数 |
| `.motion3.json` | 动作动画 | 关键帧动画数据 |
| `.exp3.json` | 表情 | 参数偏移组合 |
| `.vtube.json` | VTube 配置 | 参数映射、热键、追踪设置 |

### 符玄模型参数统计

- 总参数数：**1200+**
- 参数分组：**25 个**
- 主要分组：
  - `ParamGroup20` - 中间（紫环、黄环控制）
  - `ParamGroup19` - 镜头（镜头XY、缩放、七星盘）
  - `ParamGroup17/16` - 右手控制
  - `ParamGroup10` - 按键表情
  - `ParamGroup8` - 兽耳/布料物理
  - 标准眼睛、眉毛、嘴巴、身体参数

---

## 问题与修复

### Bug 1: 自动眨眼、鼠标跟随无效
**原因：** 事件绑定位置错误，focusController 未正确初始化
**修复：** 调整初始化顺序和事件绑定

### Bug 2: TTS 语音播放但嘴型不动
**原因：** `speak()` 函数中没有保存当前语音文字，LipSync 无法获取
**修复：** 在 `Live2DController.js` 中添加 `currentSpeechText` 变量保存文字

---

## 完成的功能

✅ 语音系统架构评估
✅ 语音控制面板集成
✅ 参数控制面板开发
✅ 动态参数探测（从 cdi3.json）
✅ 中文参数名显示
✅ LipSync 文字传递修复
✅ 9 个模型完整遍历
✅ README.md 文档生成
✅ CONVERSATION_SUMMARY.md 对话总结

---

## 模型清单

1. **fuxuan** - 符玄（崩坏：星穹铁道）
2. **kafka** - 卡芙卡（崩坏：星穹铁道）
3. **jingliu** - 镜流（崩坏：星穹铁道）
4. **robin** - 知更鸟（崩坏：星穹铁道）
5. **huohuo** - 藿藿（崩坏：星穹铁道）
6. **jian** - 简（原创）
7. **yangyang** - 秧秧（原创）
8. **rice** - Rice（原创）

