/**
 * CharacterPipeline - 角色行为管线
 *
 * 协调看板娘的高层行为状态，将分散在 Controller 中的编排逻辑集中管理。
 * 负责：状态切换 → 语音 → 表情联动 → 自动动作协调
 *
 * 状态机:
 *   IDLE ──speak()──→ SPEAKING ──TTS结束──→ IDLE
 *   IDLE ──listen()──→ LISTENING ──ASR结束──→ IDLE
 *   IDLE ──interact()──→ INTERACTING ──动作结束──→ IDLE
 */

// 角色状态枚举
export const CharacterState = Object.freeze({
  IDLE: 'idle',
  SPEAKING: 'speaking',
  LISTENING: 'listening',
  INTERACTING: 'interacting'
})

// 表情-情绪映射：根据文字内容自动选择匹配的表情
const EMOTION_KEYWORDS = [
  { keys: ['哈哈', '嘻嘻', '嘿嘿', '开心', '高兴', '快乐', '太好', '棒', 'wow', '233', 'hhh', '😊', '😄', '笑'], expr: 'happy' },
  { keys: ['难过', '伤心', '哭', '悲伤', '不开心', '😢', '😭', '唉', '可惜', '遗憾', '对不起'], expr: 'sad' },
  { keys: ['生气', '怒', '烦', '滚', '讨厌', '可恶', '😠', '😡', '别', '不要'], expr: 'angry' },
  { keys: ['惊讶', '震惊', '天哪', '不是吧', '居然', '什么', '😲', '😱', '哇塞', '我的天'], expr: 'surprised' },
  { keys: ['？', '?', '疑惑', '不明白', '什么意思', '为什么'], expr: 'confused' },
]

class CharacterPipeline {
  constructor(controller) {
    this.controller = controller

    // 当前状态
    this.state = CharacterState.IDLE
    this.previousState = CharacterState.IDLE

    // 当前正在使用的表情（用于会话结束后恢复）
    this.preSpeechExpression = null

    // 回调
    this.onStateChange = null
  }

  // ========== 状态管理 ==========

  getState() {
    return this.state
  }

  _transition(newState) {
    if (this.state === newState) return
    this.previousState = this.state
    this.state = newState
    console.log(`[Pipeline] State: ${this.previousState} → ${newState}`)
    if (this.onStateChange) {
      this.onStateChange(newState, this.previousState)
    }
  }

  // ========== 说话管线 ==========

  /**
   * 开始说话：分析情绪 → 设置表情 → 朗读 → 结束后恢复表情
   * @param {string} text - 要说的话
   * @returns {Promise<boolean>}
   */
  async speak(text) {
    if (!text || !this.controller.currentModel) return false
    if (this.state === CharacterState.SPEAKING) {
      this.controller.stopSpeaking()
    }

    this._transition(CharacterState.SPEAKING)

    // 1. 分析情绪并设置匹配的表情
    const emotionExpr = this._detectEmotion(text)
    const available = this.controller.availableExpressions || []
    if (emotionExpr && available.some(e => e.name === emotionExpr)) {
      this.preSpeechExpression = null // 不需要恢复
      this.controller.setExpression(emotionExpr)
    }

    // 2. 朗读文字
    const result = await this.controller.speak(text)

    return result
  }

  /**
   * 说话结束后的清理（由 TTS onEnd 回调触发）
   */
  onSpeechEnd() {
    this._transition(CharacterState.IDLE)
  }

  // ========== 交互管线 ==========

  /**
   * 被点击：播放随机动作 + 可选发言
   * @param {string} [sayText] - 可选，点触时说点什么
   */
  interact(sayText) {
    if (this.state !== CharacterState.IDLE) return

    this._transition(CharacterState.INTERACTING)
    this.controller.playTapMotion()

    if (sayText) {
      // 动作播放完后说话
      setTimeout(() => {
        if (this.state === CharacterState.INTERACTING) {
          this.speak(sayText)
        }
      }, 1500)
    } else {
      // 短暂交互后恢复空闲
      setTimeout(() => {
        if (this.state === CharacterState.INTERACTING) {
          this._transition(CharacterState.IDLE)
        }
      }, 3000)
    }
  }

  // ========== 监听管线 ==========

  /**
   * 开始监听用户语音
   * @param {function(string)} onResult - 识别结果回调
   */
  startListening(onResult) {
    this._transition(CharacterState.LISTENING)

    const wrappedCallback = (transcript) => {
      this._transition(CharacterState.IDLE)
      if (onResult) onResult(transcript)
    }

    return this.controller.startListening(wrappedCallback)
  }

  stopListening() {
    this.controller.stopListening()
    if (this.state === CharacterState.LISTENING) {
      this._transition(CharacterState.IDLE)
    }
  }

  // ========== 情绪分析 ==========

  /**
   * 根据文字内容检测情绪，返回匹配的表情名称
   */
  _detectEmotion(text) {
    for (const { keys, expr } of EMOTION_KEYWORDS) {
      if (keys.some(k => text.includes(k))) {
        console.log('[Pipeline] Detected emotion:', expr)
        return expr
      }
    }
    return null
  }

  // ========== 生命周期 ==========

  destroy() {
    this.controller = null
    this.onStateChange = null
  }
}

export default CharacterPipeline
