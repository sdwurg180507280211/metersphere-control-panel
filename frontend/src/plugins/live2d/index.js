/**
 * Live2D Waifu Plugin — optional feature that loads pixi.js and Live2D display
 * only when activated. When disabled, zero Live2D code is included in the main bundle.
 */
import { registerPlugin } from '../registry';

const Live2DPlugin = {
  id: 'live2d',
  name: 'Live2D Waifu',
  enabled: false,

  // Lazy-loaded references — only populated when activated
  WaifuRoot: null,
  WAIFU_FEATURE_FLAGS: null,
  WAIFU_MODELS: null,
  DEFAULT_WAIFU_MODEL_ID: null,

  async activate() {
    if (this.enabled) return;

    // 1. Load Cubism Core SDK dynamically (was a <script> tag in index.html)
    if (!window.Live2DCubismCore) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/live2d/live2dcubismcore.min.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load Live2D Cubism Core'));
        document.head.appendChild(script);
      });
    }

    // 2. Dynamic import pixi.js — sets window.PIXI before importing engine modules
    //    because Live2DModelLoader has a top-level side effect that needs window.PIXI
    const PIXI = await import('pixi.js');
    window.PIXI = PIXI;

    // 3. Import plugin modules that depend on PIXI
    const [
      { default: WaifuRoot },
      { WAIFU_FEATURE_FLAGS },
      { WAIFU_MODELS, DEFAULT_WAIFU_MODEL_ID }
    ] = await Promise.all([
      import('./ui/WaifuRoot.jsx'),
      import('./config/waifuFeatureFlags.js'),
      import('./config/waifuModels.js')
    ]);

    this.WaifuRoot = WaifuRoot;
    this.WAIFU_FEATURE_FLAGS = WAIFU_FEATURE_FLAGS;
    this.WAIFU_MODELS = WAIFU_MODELS;
    this.DEFAULT_WAIFU_MODEL_ID = DEFAULT_WAIFU_MODEL_ID;
    this.enabled = true;
  },

  deactivate() {
    this.enabled = false;
    this.WaifuRoot = null;
    this.WAIFU_FEATURE_FLAGS = null;
    this.WAIFU_MODELS = null;
    this.DEFAULT_WAIFU_MODEL_ID = null;
    // Note: we intentionally do NOT delete window.PIXI or unload the Cubism SDK
    // because unloading these libraries is not safe (they register global handlers).
    // Setting enabled=false simply prevents the UI from rendering.
  }
};

registerPlugin('live2d', Live2DPlugin);
export default Live2DPlugin;
