import Live2DStage from '../engine/Live2DStage.js'
import Live2DModelLoader from '../engine/Live2DModelLoader.js'
import Live2DRenderer from '../engine/Live2DRenderer.js'
import { WAIFU_MODELS, DEFAULT_WAIFU_MODEL_ID } from '../config/waifuModels.js'

class Live2DController {
  constructor() {
    this.stage = new Live2DStage()
    this.loader = new Live2DModelLoader()
    this.renderer = null
    this.currentModel = null
    this.currentModelId = null
    this.isInitialized = false
  }

  async init(container) {
    if (this.isInitialized) return

    console.log('[Live2D] Initializing...', container)
    try {
      await this.stage.create(container)
      console.log('[Live2D] Stage created')

      this.renderer = new Live2DRenderer(this.stage)
      console.log('[Live2D] Renderer created')

      await this.loadModel(DEFAULT_WAIFU_MODEL_ID)
      console.log('[Live2D] Model loaded successfully')

      this.isInitialized = true
    } catch (error) {
      console.error('[Live2D] Initialization failed:', error)
      this.destroy()
      throw error
    }
  }

  async loadModel(modelId) {
    const modelConfig = WAIFU_MODELS[modelId]
    if (!modelConfig) {
      throw new Error(`Model ${modelId} not found`)
    }

    if (this.currentModel) {
      this.renderer.detach(this.currentModel)
      this.loader.destroy(this.currentModel)
    }

    const model = await this.loader.load(modelId, modelConfig)
    this.currentModel = model
    this.currentModelId = modelId

    this.renderer.attach(model)
    this.renderer.setLayout({
      x: modelConfig.position.x,
      y: modelConfig.position.y,
      scale: modelConfig.scale,
      visible: true
    })
  }

  async reloadModel() {
    if (this.currentModelId) {
      await this.loadModel(this.currentModelId)
    }
  }

  show() {
    this.renderer?.setVisible(true)
  }

  hide() {
    this.renderer?.setVisible(false)
  }

  destroy() {
    if (this.currentModel) {
      this.renderer?.detach(this.currentModel)
      this.loader.destroy(this.currentModel)
      this.currentModel = null
    }
    this.stage.destroy()
    this.renderer = null
    this.isInitialized = false
  }
}

export default Live2DController
