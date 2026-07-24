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
const DEFAULT_TTS_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-to-speech/stream';

function cleanExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastActive > SESSION_TTL) {
      sessions.delete(id);
    }
  }
}

const sessionCleanupTimer = setInterval(cleanExpiredSessions, 10 * 60 * 1000);
sessionCleanupTimer.unref?.();

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

function resolveChatUrl(baseUrl) {
  if (!baseUrl) {
    return DEFAULT_API_URL;
  }
  return baseUrl.endsWith('/chat/completions')
    ? baseUrl
    : `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

function resolveTtsUrl(baseUrl) {
  if (!baseUrl) {
    return DEFAULT_TTS_URL;
  }
  return `${baseUrl.replace(/\/chat\/completions\/?$/, '').replace(/\/+$/, '')}/text-to-speech/stream`;
}

const chatController = {
  async sendMessage(req, res) {
    try {
      const { message, sessionId = 'default' } = req.body || {};

      if (!message || typeof message !== 'string' || !message.trim()) {
        throw createAppError(400, 'INVALID_MESSAGE', '消息内容不能为空');
      }

      const resolved = configManager.getResolvedConfig();
      const waifuConfig = resolved.waifu || {};
      const apiKey = waifuConfig.apiKey;

      if (!apiKey) {
        throw createAppError(400, 'MISSING_API_KEY', '未配置通义千问 API Key，请在设置中填入 waifu.apiKey');
      }

      const model = waifuConfig.model || 'qwen3.5-plus';
      const systemPrompt = waifuConfig.systemPrompt || DEFAULT_SYSTEM_PROMPT;
      const apiUrl = resolveChatUrl(waifuConfig.baseUrl || '');
      const session = getOrCreateSession(sessionId, systemPrompt);

      session.messages.push({ role: 'user', content: message.trim() });
      if (session.messages.length > MAX_HISTORY + 1) {
        session.messages = [session.messages[0], ...session.messages.slice(-MAX_HISTORY)];
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
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
        throw createAppError(
          502,
          'QWEN_API_ERROR',
          `通义千问 API 错误: ${response.status}`,
          { upstreamStatus: response.status, upstreamBody: errorText.slice(0, 2000) }
        );
      }

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || '(没有收到回复呢...)';
      session.messages.push({ role: 'assistant', content: reply });

      return res.json({
        success: true,
        data: {
          reply,
          sessionId,
          usage: data.usage || null
        }
      });
    } catch (error) {
      return sendError(res, error);
    }
  },

  clearSession(req, res) {
    const { sessionId } = req.params;
    sessions.delete(sessionId || 'default');
    res.json({ success: true, message: '会话已清除' });
  },

  async textToSpeech(req, res) {
    try {
      const { text, voice = 'longxiaochun_v2' } = req.body || {};

      if (!text || typeof text !== 'string' || !text.trim()) {
        throw createAppError(400, 'INVALID_TEXT', '文字内容不能为空');
      }

      const resolved = configManager.getResolvedConfig();
      const waifuConfig = resolved.waifu || {};
      const apiKey = waifuConfig.apiKey;

      if (!apiKey) {
        throw createAppError(400, 'MISSING_API_KEY', '未配置 API Key');
      }

      const ttsModel = waifuConfig.ttsModel || 'qwen-tts';
      const ttsUrl = resolveTtsUrl(waifuConfig.baseUrl || '');
      const response = await fetch(ttsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: ttsModel,
          input: { text: text.trim() },
          parameters: { voice }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw createAppError(
          502,
          'TTS_API_ERROR',
          `TTS API 错误: ${response.status}`,
          { upstreamStatus: response.status, upstreamBody: errorText.slice(0, 2000) }
        );
      }

      res.setHeader('Content-Type', response.headers.get('content-type') || 'audio/mpeg');
      res.setHeader('X-TTS-Voice', voice);

      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      return res.end();
    } catch (error) {
      if (res.headersSent) {
        return res.end();
      }
      return sendError(res, error);
    }
  }
};

module.exports = chatController;
