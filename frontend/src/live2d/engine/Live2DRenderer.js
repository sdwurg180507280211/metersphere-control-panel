class Live2DRenderer {
  constructor(stage) {
    this.stage = stage
    this.currentModel = null
  }

  attach(model) {
    const app = this.stage.getApp()
    if (!app) {
      console.warn('[Live2D] App not ready yet, skipping attach (may be StrictMode cleanup)')
      return
    }

    console.log('[Live2D] Attaching model to stage:', app.stage)
    this.currentModel = model
    app.stage.addChild(model)
    console.log('[Live2D] Model added to stage, children count:', app.stage.children.length)
  }

  detach(model) {
    const app = this.stage.getApp()
    if (!app || !model) return

    if (app.stage.children.includes(model)) {
      app.stage.removeChild(model)
    }
    this.currentModel = null
  }

  setLayout({ x, y, scale, visible }) {
    if (!this.currentModel) return

    if (x !== undefined) this.currentModel.x = x
    if (y !== undefined) this.currentModel.y = y
    if (scale !== undefined) this.currentModel.scale.set(scale)
    if (visible !== undefined) this.currentModel.visible = visible
  }

  setVisible(visible) {
    if (this.currentModel) {
      this.currentModel.visible = visible
    }
  }
}

export default Live2DRenderer
