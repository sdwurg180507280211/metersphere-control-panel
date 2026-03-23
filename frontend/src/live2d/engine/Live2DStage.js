import * as PIXI from 'pixi.js'

class Live2DStage {
  constructor() {
    this.app = null
    this.container = null
  }

  async create(container) {
    if (this.app) return

    this.container = container
    this.app = new PIXI.Application({
      backgroundAlpha: 0,
      width: container.offsetWidth,
      height: container.offsetHeight,
      antialias: true,
      resolution: window.devicePixelRatio || 1
    })

    const canvas = this.app.view
    canvas.style.width = container.offsetWidth + 'px'
    canvas.style.height = container.offsetHeight + 'px'
    container.appendChild(canvas)
  }

  resize(width, height) {
    if (this.app) {
      this.app.renderer.resize(width, height)
    }
  }

  getApp() {
    return this.app
  }

  destroy() {
    if (this.app) {
      this.app.destroy(true, { children: true })
      this.app = null
    }
    this.container = null
  }
}

export default Live2DStage
