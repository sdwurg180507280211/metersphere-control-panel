import * as PIXI from 'pixi.js';
import { Live2DModel } from 'pixi-live2d-display/cubism4';

// 启用高级遮罩支持
import { config } from 'pixi-live2d-display/cubism4';
config.cubism4.supportMoreMaskDivisions = true;

// 注册 Ticker
Live2DModel.registerTicker(PIXI.Ticker);

// 模型配置
const MODELS = {
  rice: {
    path: '/live2d/rice/Rice.model3.json',
    scale: 0.06,
    position: { x: 300, y: 300 }
  },
  fuxuan: {
    path: '/live2d/fuxuan/符玄.model3.json',
    scale: 0.06,
    position: { x: 300, y: 350 }
  }
};

let app: PIXI.Application | null = null;
let currentModel: any = null;
let currentModelId: string | null = null;

function setStatus(msg: string) {
  const el = document.getElementById('status');
  if (el) el.textContent = msg;
  console.log('[Status]', msg);
}

async function initApp() {
  const container = document.getElementById('canvas-container');
  if (!container) return;

  app = new PIXI.Application({
    width: 600,
    height: 600,
    backgroundAlpha: 0,
    antialias: true,
    resolution: window.devicePixelRatio || 1
  });

  container.appendChild(app.view);
  setStatus('PixiJS Application 初始化完成');

  await loadModel('rice');
}

async function loadModel(modelId: string) {
  const modelConfig = MODELS[modelId as keyof typeof MODELS];
  if (!modelConfig) {
    setStatus('模型配置未找到：' + modelId);
    return;
  }

  setStatus(`正在加载 ${modelId}...`);

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

    currentModel.x = modelConfig.position.x;
    currentModel.y = modelConfig.position.y;
    currentModel.scale.set(modelConfig.scale);
    currentModel.anchor.set(0.5);

    if (app) app.stage.addChild(currentModel);

    setupInteraction(currentModel);

    setStatus(`${modelId} 加载完成！`);
    currentModelId = modelId;
  } catch (error: any) {
    setStatus(`加载失败：${error.message}`);
    console.error('Load error:', error);
  }
}

function setupInteraction(model: any) {
  model.interactive = true;
  model.on('pointerdown', () => {
    console.log('Model clicked!');
    model.motion('tap_body');
  });
}

function playMotion(motionName: string) {
  if (!currentModel) {
    setStatus('请先加载模型');
    return;
  }
  setStatus(`播放动作：${motionName}`);
  try {
    currentModel.motion(motionName);
  } catch (error: any) {
    setStatus(`动作播放失败：${error.message}`);
  }
}

let expressionIndex = 0;
function toggleExpression() {
  if (!currentModel) {
    setStatus('请先加载模型');
    return;
  }
  const expressions = currentModel.internalModel?.settings?.expressions;
  if (!expressions || expressions.length === 0) {
    setStatus('没有可用表情');
    return;
  }
  expressionIndex = (expressionIndex + 1) % expressions.length;
  const exprName = expressions[expressionIndex].File;
  setStatus(`切换表情：${exprName}`);
  currentModel.expression(exprName);
}

function resetModel() {
  if (currentModel && currentModelId) {
    const cfg = MODELS[currentModelId as keyof typeof MODELS];
    currentModel.x = cfg.position.x;
    currentModel.y = cfg.position.y;
    currentModel.scale.set(cfg.scale);
    currentModel.angle = 0;
    currentModel.motion('idle');
    setStatus('模型已重置');
  }
}

// 暴露到全局
(window as any).loadModel = loadModel;
(window as any).playMotion = playMotion;
(window as any).toggleExpression = toggleExpression;
(window as any).resetModel = resetModel;

// 启动
initApp();
