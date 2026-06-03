/**
 * AudioTtsService - 基于服务端音频的 TTS 服务
 *
 * 取代浏览器 SpeechSynthesis，从后端获取 TTS 音频，通过 Web Audio API 播放。
 * 关键优势：音频经过 AudioContext 播放，可以从中提取 AudioNode 用于唇形分析。
 */

class AudioTtsService {
  constructor(options = {}) {
    this.enabled = true
    this.lang = options.lang || 'zh-CN'
    this.voice = options.voice || 'longxiaochun_v2'

    this.isSpeaking = false
    this.onStart = options.onStart || null
    this.onEnd = options.onEnd || null
    this.onError = options.onError || null

    // Web Audio API 上下文（延迟创建，需用户交互后）
    this.audioContext = null
    this.sourceNode = null
    this._currentBuffer = null

    // 暴露 AudioNode 供唇形分析
    this._analyserNode = null
    this._connected = false
  }

  // ========== AudioContext 懒初始化 ==========

  _ensureAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
      this._analyserNode = this.audioContext.createAnalyser()
      this._analyserNode.fftSize = 512
      this._analyserNode.smoothingTimeConstant = 0.3
    }
    // 恢复被浏览器挂起的 AudioContext
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume()
    }
  }

  /**
   * 获取分析器节点，供 AudioLipSyncSystem 连接
   */
  getAnalyserNode() {
    return this._analyserNode
  }

  /**
   * 获取 AudioContext
   */
  getAudioContext() {
    return this.audioContext
  }

  // ========== TTS ==========

  /**
   * 从后端获取 TTS 音频并播放
   * @param {string} text - 要朗读的文字
   * @returns {boolean} 是否成功开始
   */
  async speak(text) {
    if (!this.enabled) {
      console.warn('[AudioTTS] TTS not enabled')
      return false
    }

    if (!text || text.trim().length === 0) {
      return false
    }

    this.stop()

    try {
      this.isSpeaking = true
      if (this.onStart) this.onStart(text)

      this._ensureAudioContext()

      // 从后端获取音频
      const response = await fetch('/api/chat/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), voice: this.voice })
      })

      if (!response.ok) {
        throw new Error(`TTS API error: ${response.status}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      if (arrayBuffer.byteLength === 0) {
        throw new Error('TTS returned empty audio')
      }

      // 解码音频
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer)
      this._currentBuffer = audioBuffer

      // 创建播放节点
      this.sourceNode = this.audioContext.createBufferSource()
      this.sourceNode.buffer = audioBuffer

      // 连接图: source → analyser → destination（扬声器）
      this.sourceNode.connect(this._analyserNode)
      this._analyserNode.connect(this.audioContext.destination)
      this._connected = true

      this.sourceNode.onended = () => {
        this.isSpeaking = false
        this.sourceNode = null
        this._currentBuffer = null
        // 断开 analyser，避免静默时也采集
        if (this._connected) {
          try { this._analyserNode.disconnect() } catch (e) { /* ignore */ }
          this._connected = false
        }
        if (this.onEnd) this.onEnd()
      }

      this.sourceNode.start(0)
      return true
    } catch (error) {
      console.error('[AudioTTS] Failed:', error)
      this.isSpeaking = false
      this.sourceNode = null
      if (this._connected) {
        try { this._analyserNode.disconnect() } catch (e) { /* ignore */ }
        this._connected = false
      }
      if (this.onError) this.onError(error)
      return false
    }
  }

  // ========== 控制 ==========

  stop() {
    if (this.sourceNode) {
      try { this.sourceNode.stop() } catch (e) { /* 可能已停止 */ }
      this.sourceNode = null
    }
    this.isSpeaking = false
    this._currentBuffer = null
    if (this._connected) {
      try { this._analyserNode.disconnect() } catch (e) { /* ignore */ }
      this._connected = false
    }
  }

  isSupported() {
    return !!(window.AudioContext || window.webkitAudioContext)
  }

  /**
   * 更新回调。因为本服务是单例，而调用方（initVoice）可能被多次调用
   * 并创建新的 AudioLipSyncSystem / Pipeline，需要更新回调引用。
   */
  setCallbacks({ onStart, onEnd, onError } = {}) {
    if (onStart !== undefined) this.onStart = onStart
    if (onEnd !== undefined) this.onEnd = onEnd
    if (onError !== undefined) this.onError = onError
  }

  setVoice(voice) {
    this.voice = voice
  }

  toggleEnabled() {
    this.enabled = !this.enabled
    if (!this.enabled) this.stop()
    return this.enabled
  }

  destroy() {
    this.stop()
    if (this.audioContext) {
      this.audioContext.close().catch(() => {})
      this.audioContext = null
      this._analyserNode = null
    }
    this.onStart = null
    this.onEnd = null
    this.onError = null
  }
}

// 单例
let ttsInstance = null

export function getAudioTtsInstance(options = {}) {
  if (!ttsInstance) {
    ttsInstance = new AudioTtsService(options)
  }
  return ttsInstance
}

export default AudioTtsService
