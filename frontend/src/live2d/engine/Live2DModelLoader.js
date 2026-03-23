import { Live2DModel, config } from 'pixi-live2d-display/cubism4'
import * as PIXI from 'pixi.js'

// Enable advanced mask support for complex models (e.g., 符玄 with 51 masks)
config.cubism4.supportMoreMaskDivisions = true

// Register PixiJS Ticker
Live2DModel.registerTicker(PIXI.Ticker)

class Live2DModelLoader {
  async load(modelId, modelConfig) {
    try {
      const model = await Live2DModel.from(modelConfig.path)
      return model
    } catch (error) {
      console.error(`Failed to load model ${modelId}:`, error)
      throw error
    }
  }

  destroy(model) {
    if (model) {
      model.destroy()
    }
  }
}

export default Live2DModelLoader
