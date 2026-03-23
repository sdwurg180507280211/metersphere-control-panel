import * as PIXI from 'pixi.js';
import { Live2DModel } from 'pixi-live2d-display/cubism4';
import { config } from 'pixi-live2d-display/cubism4';

// 启用高级遮罩支持
config.cubism4.supportMoreMaskDivisions = true;

// 注册 Ticker
Live2DModel.registerTicker(PIXI.Ticker);

// 模型配置 - 增大的缩放比例
const MODELS = {
  rice: {
    path: '/live2d/rice/Rice.model3.json',
    scale: 0.15,
    position: { x: 400, y: 480 }
  },
  fuxuan: {
    path: '/live2d/fuxuan/符玄.model3.json',
    scale: 0.15,
    position: { x: 400, y: 500 }
  }
};

let app: PIXI.Application | null = null;
let currentModel: any = null;
let currentModelId: string | null = null;
let expressionIndex = 0;

// 状态标志
let autoBlink = true;
let hitTestEnabled = true;
let focusControlEnabled = true;

function setStatus(msg: string, type: 'normal' | 'loading' | 'error' = 'normal') {
  const el = document.getElementById('status');
  const indicator = document.getElementById('status-indicator');
  if (el) el.textContent = msg;
  if (indicator) {
    indicator.className = 'status-indicator ' + (type === 'loading' ? 'loading' : type === 'error' ? 'error' : '');
  }
  console.log('[Status]', msg);
}

function updateCurrentModelDisplay(modelId: string) {
  const el = document.getElementById('current-model-display');
  if (el) el.textContent = modelId === 'rice' ? 'Rice' : '符玄';
}

// 更新滑块值显示
function updateSliderValue(sliderId: string, value: string | number) {
  const el = document.getElementById(sliderId);
  if (el) el.textContent = typeof value === 'number' ? value.toString() : value;
}

// 初始化滑块事件监听
function initSliders() {
  // 缩放滑块
  const scaleSlider = document.getElementById('scale-slider') as HTMLInputElement;
  if (scaleSlider) {
    scaleSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      updateSliderValue('scale-value', value.toFixed(2));
      if (currentModel) {
        currentModel.scale.set(value);
      }
    });
  }

  // 位置 X 滑块
  const posXSlider = document.getElementById('pos-x-slider') as HTMLInputElement;
  if (posXSlider) {
    posXSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      updateSliderValue('pos-x-value', value);
      if (currentModel) {
        currentModel.x = value;
      }
    });
  }

  // 位置 Y 滑块
  const posYSlider = document.getElementById('pos-y-slider') as HTMLInputElement;
  if (posYSlider) {
    posYSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      updateSliderValue('pos-y-value', value);
      if (currentModel) {
        currentModel.y = value;
      }
    });
  }

  // 旋转滑块
  const rotationSlider = document.getElementById('rotation-slider') as HTMLInputElement;
  if (rotationSlider) {
    rotationSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      updateSliderValue('rotation-value', value + '°');
      if (currentModel) {
        currentModel.angle = value;
      }
    });
  }

  // 复选框
  const autoBlinkCheckbox = document.getElementById('auto-blink') as HTMLInputElement;
  if (autoBlinkCheckbox) {
    autoBlinkCheckbox.addEventListener('change', (e) => {
      autoBlink = (e.target as HTMLInputElement).checked;
      if (currentModel && currentModel.internalModel) {
        currentModel.internalModel.autoBlink = autoBlink;
      }
    });
  }

  const hitTestCheckbox = document.getElementById('hit-test') as HTMLInputElement;
  if (hitTestCheckbox) {
    hitTestCheckbox.addEventListener('change', (e) => {
      hitTestEnabled = (e.target as HTMLInputElement).checked;
      if (currentModel) {
        currentModel.interactive = hitTestEnabled;
      }
    });
  }

  const focusCheckbox = document.getElementById('focus-control') as HTMLInputElement;
  if (focusCheckbox) {
    focusCheckbox.addEventListener('change', (e) => {
      focusControlEnabled = (e.target as HTMLInputElement).checked;
      if (currentModel && currentModel.internalModel) {
        currentModel.internalModel.focusControl.enabled = focusControlEnabled;
      }
    });
  }
}

async function initApp() {
  const container = document.getElementById('canvas-container');
  if (!container) return;

  // 创建更大的 Canvas
  app = new PIXI.Application({
    width: 800,
    height: 800,
    backgroundAlpha: 0,
    antialias: true,
    resolution: window.devicePixelRatio || 1
  });

  container.appendChild(app.view);
  setStatus('PixiJS Application 初始化完成');

  // 初始化滑块
  initSliders();

  await loadModel('rice');
}

async function loadModel(modelId: string) {
  const modelConfig = MODELS[modelId as keyof typeof MODELS];
  if (!modelConfig) {
    setStatus('模型配置未找到：' + modelId, 'error');
    return;
  }

  setStatus(`正在加载 ${modelId}...`, 'loading');
  updateCurrentModelDisplay(modelId);

  // 更新按钮状态
  document.querySelectorAll('.model-select button').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = document.getElementById(`btn-${modelId}`);
  if (activeBtn) activeBtn.classList.add('active');

  // 移除旧模型
  if (currentModel && app) {
    app.stage.removeChild(currentModel);
    currentModel.destroy();
    currentModel = null;
  }

  try {
    currentModel = await Live2DModel.from(modelConfig.path, {
      autoUpdate: true
    });

    // 设置位置 - 居中并放大
    currentModel.x = modelConfig.position.x;
    currentModel.y = modelConfig.position.y;
    currentModel.scale.set(modelConfig.scale);
    currentModel.anchor.set(0.5);

    if (app) app.stage.addChild(currentModel);

    // 更新滑块到当前值
    const scaleSlider = document.getElementById('scale-slider') as HTMLInputElement;
    const posXSlider = document.getElementById('pos-x-slider') as HTMLInputElement;
    const posYSlider = document.getElementById('pos-y-slider') as HTMLInputElement;
    const rotationSlider = document.getElementById('rotation-slider') as HTMLInputElement;

    if (scaleSlider) {
      scaleSlider.value = modelConfig.scale.toString();
      updateSliderValue('scale-value', modelConfig.scale.toFixed(2));
    }
    if (posXSlider) {
      posXSlider.value = modelConfig.position.x.toString();
      updateSliderValue('pos-x-value', modelConfig.position.x);
    }
    if (posYSlider) {
      posYSlider.value = modelConfig.position.y.toString();
      updateSliderValue('pos-y-value', modelConfig.position.y);
    }
    if (rotationSlider) {
      rotationSlider.value = '0';
      updateSliderValue('rotation-value', '0°');
    }

    setupInteraction(currentModel);

    setStatus(`${modelId} 加载完成！`, 'normal');
    currentModelId = modelId;
    expressionIndex = 0;
  } catch (error: any) {
    setStatus(`加载失败：${error.message}`, 'error');
    console.error('Load error:', error);
  }
}

function setupInteraction(model: any) {
  model.interactive = hitTestEnabled;

  model.on('pointerdown', () => {
    console.log('Model clicked!');
    if (hitTestEnabled) {
      model.motion('tap_body');
    }
  });

  // 鼠标跟随
  if (app && focusControlEnabled) {
    app.stage.on('pointermove', (e: any) => {
      if (currentModel && currentModel.internalModel) {
        const pos = e.getLocalPosition(currentModel);
        currentModel.internalModel.focusControl.update(pos.x, pos.y);
      }
    });
  }
}

function playMotion(motionName: string) {
  if (!currentModel) {
    setStatus('请先加载模型', 'error');
    return;
  }
  setStatus(`播放动作：${motionName}`);
  try {
    currentModel.motion(motionName);
  } catch (error: any) {
    setStatus(`动作播放失败：${error.message}`, 'error');
  }
}

function toggleExpression() {
  if (!currentModel) {
    setStatus('请先加载模型', 'error');
    return;
  }
  const expressions = currentModel.internalModel?.settings?.expressions;
  if (!expressions || expressions.length === 0) {
    setStatus('没有可用表情', 'error');
    return;
  }
  expressionIndex = (expressionIndex + 1) % expressions.length;
  const exprName = expressions[expressionIndex].File;
  setStatus(`切换表情：${exprName}`);
  currentModel.expression(exprName);
}

function resetExpression() {
  if (!currentModel) {
    setStatus('请先加载模型', 'error');
    return;
  }
  setStatus('重置表情');
  currentModel.expression(0);
  expressionIndex = 0;
}

function resetModel() {
  if (currentModel && currentModelId) {
    const cfg = MODELS[currentModelId as keyof typeof MODELS];
    currentModel.x = cfg.position.x;
    currentModel.y = cfg.position.y;
    currentModel.scale.set(cfg.scale);
    currentModel.angle = 0;
    currentModel.motion('idle');

    // 重置滑块
    const scaleSlider = document.getElementById('scale-slider') as HTMLInputElement;
    const posXSlider = document.getElementById('pos-x-slider') as HTMLInputElement;
    const posYSlider = document.getElementById('pos-y-slider') as HTMLInputElement;
    const rotationSlider = document.getElementById('rotation-slider') as HTMLInputElement;

    if (scaleSlider) {
      scaleSlider.value = cfg.scale.toString();
      updateSliderValue('scale-value', cfg.scale.toFixed(2));
    }
    if (posXSlider) {
      posXSlider.value = cfg.position.x.toString();
      updateSliderValue('pos-x-value', cfg.position.x);
    }
    if (posYSlider) {
      posYSlider.value = cfg.position.y.toString();
      updateSliderValue('pos-y-value', cfg.position.y);
    }
    if (rotationSlider) {
      rotationSlider.value = '0';
      updateSliderValue('rotation-value', '0°');
    }

    setStatus('模型已重置');
  }
}

// 暴露到全局
(window as any).loadModel = loadModel;
(window as any).playMotion = playMotion;
(window as any).toggleExpression = toggleExpression;
(window as any).resetExpression = resetExpression;
(window as any).resetModel = resetModel;

// 启动
initApp();
