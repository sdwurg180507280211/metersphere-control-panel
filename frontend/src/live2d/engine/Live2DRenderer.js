class Live2DRenderer {
  constructor(stage) {
    this.stage = stage
    this.currentModel = null
  }

  attach(model) {
    const app = this.stage.getApp()
    if (!app) return

    this.currentModel = model
    app.stage.addChild(model)
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
