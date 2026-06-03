/**
 * 看板娘聊天控制器
 * 代理请求到通义千问 API，避免前端暴露 API Key
 */
const configManager = require('../services/configManager');
const { sendError, createAppError } = require('../utils/errors');

// 内存中的会话历史，按 sessionId 存储
const sessions = new Map();

// 会话过期时间（30 分钟）
const SESSION_TTL = 30 * 60 * 1000;
// 最大历史消息数
const MAX_HISTORY = 20;

const DEFAULT_SYSTEM_PROMPT = `你是一个可爱的看板娘助手，说话带有萌萌哒的语气，会用一些可爱的语气词（比如"呢"、"哦"、"啦"、"嘛"）。
你的名字叫小梦，是 MeterSphere 控制面板的看板娘。
你乐于帮助用户解答关于 MeterSphere 测试平台的问题，也可以陪用户聊天。
回复尽量简短有趣，不超过 100 字。`;

const DEFAULT_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

/**
 * 清理过期会话
 */
function cleanExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastActive > SESSION_TTL) {
      sessions.delete(id);
    }
  }
}

// 每 10 分钟清理一次过期会话
setInterval(cleanExpiredSessions, 10 * 60 * 1000);

/**
 * 获取或创建会话
 */
function getOrCreateSession(sessionId, systemPrompt) {
  if (sessions.has(sessionId)) {
    const session = sessions.get(sessionId);
    session.lastActive = Date.now();
    return session;
  }

  const session = {
    messages: [{ role: 'system', content: systemPrompt }],
    lastActive: Date.now()
  };
  sessions.set(sessionId, session);
  return session;
}

const chatController = {
  /**
   * POST /api/chat/message
   * body: { message: string, sessionId?: string }
   */
  async sendMessage(req, res) {
    try {
      const { message, sessionId = 'default' } = req.body;

      if (!message || typeof message !== 'string' || !message.trim()) {
        throw createAppError('消息内容不能为空', { statusCode: 400, code: 'INVALID_MESSAGE' });
      }

      const resolved = configManager.getResolvedConfig();
      const waifuConfig = resolved.waifu || {};
      const apiKey = waifuConfig.apiKey;

      if (!apiKey) {
        throw createAppError('未配置通义千问 API Key，请在设置中填入 waifu.apiKey', {
          statusCode: 400,
          code: 'MISSING_API_KEY'
        });
      }

      const model = waifuConfig.model || 'qwen3.5-plus';
      const systemPrompt = waifuConfig.systemPrompt || DEFAULT_SYSTEM_PROMPT;
      const baseUrl = waifuConfig.baseUrl || '';

      // 构建 API URL：支持自定义 baseUrl
      let apiUrl;
      if (baseUrl) {
        // 用户配置的 baseUrl，追加 /chat/completions（如果未包含）
        apiUrl = baseUrl.endsWith('/chat/completions')
          ? baseUrl
          : baseUrl.replace(/\/+$/, '') + '/chat/completions';
      } else {
        apiUrl = DEFAULT_API_URL;
      }

      // 获取或创建会话
      const session = getOrCreateSession(sessionId, systemPrompt);

      // 添加用户消息
      session.messages.push({ role: 'user', content: message.trim() });

      // 裁剪历史，保留 system + 最近 MAX_HISTORY 条
      if (session.messages.length > MAX_HISTORY + 1) {
        session.messages = [
          session.messages[0],
          ...session.messages.slice(-(MAX_HISTORY))
        ];
      }

      // 调用通义千问 API
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: session.messages,
          temperature: 0.8,
          max_tokens: 500
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw createAppError(`通义千问 API 错误: ${response.status} - ${errorText}`, {
          statusCode: 502,
          code: 'QWEN_API_ERROR'
        });
      }

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || '(没有收到回复呢...)';

      // 将助手回复加入历史
      session.messages.push({ role: 'assistant', content: reply });

      res.json({
        success: true,
        data: {
          reply,
          sessionId,
          usage: data.usage || null
        }
      });
    } catch (error) {
      sendError(res, error);
    }
  },

  /**
   * DELETE /api/chat/session/:sessionId
   * 清除指定会话
   */
  clearSession(req, res) {
    const { sessionId } = req.params;
    sessions.delete(sessionId || 'default');
    res.json({ success: true, message: '会话已清除' });
  },

  /**
   * POST /api/chat/tts
   * 文字转语音，返回音频数据。使用 DashScope TTS API 或兼容接口。
   * body: { text: string, voice?: string }
   */
  async textToSpeech(req, res) {
    try {
      const { text, voice = 'longxiaochun_v2' } = req.body;

      if (!text || typeof text !== 'string' || !text.trim()) {
        throw createAppError('文字内容不能为空', { statusCode: 400, code: 'INVALID_TEXT' });
      }

      const resolved = configManager.getResolvedConfig();
      const waifuConfig = resolved.waifu || {};
      const apiKey = waifuConfig.apiKey;

      if (!apiKey) {
        throw createAppError('未配置 API Key', { statusCode: 400, code: 'MISSING_API_KEY' });
      }

      const ttsModel = waifuConfig.ttsModel || 'qwen-tts';
      const baseUrl = waifuConfig.baseUrl || '';
      const DEFAULT_TTS_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-to-speech/stream';

      let ttsUrl;
      if (baseUrl) {
        // 自定义 baseUrl 也尝试兼容 TTS 端点
        ttsUrl = baseUrl.replace(/\/chat\/completions\/?$/, '') + '/text-to-speech/stream';
      } else {
        ttsUrl = DEFAULT_TTS_URL;
      }

      const response = await fetch(ttsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: ttsModel,
          input: { text: text.trim() },
          parameters: { voice }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw createAppError(`TTS API 错误: ${response.status} - ${errorText}`, {
          statusCode: 502,
          code: 'TTS_API_ERROR'
        });
      }

      // 流式转发音频数据
      res.setHeader('Content-Type', response.headers.get('content-type') || 'audio/mpeg');
      res.setHeader('X-TTS-Voice', voice);

      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } catch (error) {
      // 如果已经开始写响应头，只能强制关闭
      if (res.headersSent) {
        return res.end();
      }
      sendError(res, error);
    }
  }
};

module.exports = chatController;
