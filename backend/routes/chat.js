/**
 * 聊天路由
 */
const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

// 发送消息
router.post('/message', chatController.sendMessage);

// 清除会话
router.delete('/session/:sessionId', chatController.clearSession);

// 文字转语音
router.post('/tts', chatController.textToSpeech);

module.exports = router;
