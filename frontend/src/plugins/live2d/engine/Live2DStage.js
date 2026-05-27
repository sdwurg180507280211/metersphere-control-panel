import * as PIXI from 'pixi.js'

class Live2DStage {
  constructor() {
    this.app = null
    this.container = null
  }

  async create(container) {
    if (this.app) return

    this.container = container

    // 清理容器中已有的 canvas（防止 StrictMode 双渲染导致的问题）
    const existingCanvas = container.querySelector('canvas')
    if (existingCanvas) {
      existingCanvas.remove()
    }

    // 画布尺寸跟随容器大小，避免内容溢出被裁剪
    const width = container.clientWidth || 800
    const height = container.clientHeight || 800

    this.app = new PIXI.Application({
      backgroundAlpha: 0,
      width,
      height,
      antialias: true,
      resolution: window.devicePixelRatio || 1
    })

    // PixiJS v7: use app.view
    const canvas = this.app.view
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
    canvas.style.display = 'block'
    // 确保 canvas 可以接收鼠标事件（虽然父容器设置了 pointerEvents: none）
    canvas.style.pointerEvents = 'auto'
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
