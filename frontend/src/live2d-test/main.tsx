import * as PIXI from 'pixi.js';
import { Live2DModel } from 'pixi-live2d-display/cubism4';
import { config } from 'pixi-live2d-display/cubism4';

// 启用高级遮罩支持
config.cubism4.supportMoreMaskDivisions = true;

// 注册 Ticker
Live2DModel.registerTicker(PIXI.Ticker);

// 模型配置 - 统一缩放比例和位置，使所有模型大小匀称、居中
const MODELS = {
  rice: {
    path: '/live2d/rice/Rice.model3.json',
    scale: 0.12,
    position: { x: 400, y: 500 }
  },
  fuxuan: {
    path: '/live2d/fuxuan/符玄.model3.json',
    scale: 0.11,
    position: { x: 400, y: 500 }
  },
  huohuo: {
    path: '/live2d/huohuo/藿藿.model3.json',
    scale: 0.12,
    position: { x: 400, y: 480 }
  },
  jian: {
    path: '/live2d/jian/简.model3.json',
    scale: 0.12,
    position: { x: 400, y: 480 }
  },
  yangyang: {
    path: '/live2d/yangyang/秧秧.model3.json',
    scale: 0.12,
    position: { x: 400, y: 480 }
  },
  jingliu: {
    path: '/live2d/jingliu/镜流.model3.json',
    scale: 0.13,
    position: { x: 400, y: 500 }
  },
  kafka: {
    path: '/live2d/kafka/kafuka1.model3.json',
    scale: 0.13,
    position: { x: 400, y: 500 }
  },
  robin: {
    path: '/live2d/robin/知更鸟.model3.json',
    scale: 0.13,
    position: { x: 400, y: 500 }
  },
  nicole: {
    path: '/live2d/nicole/Nicole.model3.json',
    scale: 0.13,
    position: { x: 400, y: 500 }
  }
};

const DEFAULT_SCALE = 0.1;

let app: PIXI.Application | null = null;
let currentModel: any = null;
let currentModelId: string | null = null;
let expressionIndex = 0;
let availableMotions: Array<{ group: string, index: number, name: string }> = [];
let availableExpressions: Array<{ file: string, name: string }> = [];

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
  if (el) el.textContent = getModelDisplayName(modelId);
}

function getModelDisplayName(modelId: string): string {
  const names: Record<string, string> = {
    rice: 'Rice',
    fuxuan: '符玄',
    huohuo: '藿藿',
    jian: '简',
    yangyang: '秧秧',
    jingliu: '镜流',
    kafka: '卡芙卡',
    robin: '知更鸟',
    nicole: '妮可'
  };
  return names[modelId] || modelId;
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

// 获取模型可用的动作列表（从 motionManager 读取）
function getAvailableMotions(): Array<{ group: string, index: number, name: string }> {
  if (!currentModel?.internalModel?.motionManager) {
    return [];
  }

  const motionManager = currentModel.internalModel.motionManager;
  const motions: Array<{ group: string, index: number, name: string }> = [];

  // 从 motionManager 读取动作定义
  const definitions = motionManager.definitions;
  for (const [group, groupMotions] of Object.entries(definitions)) {
    if (groupMotions && Array.isArray(groupMotions)) {
      groupMotions.forEach((motion: any, index: number) => {
        const fileName = motion.File || motion.file || '';
        const motionName = fileName.replace('.motion3.json', '').replace('.mtn', '');
        motions.push({
          group,
          index,
          name: motionName
        });
      });
    }
  }

  return motions;
}

// 更新动作按钮
function updateMotionButtons() {
  const motionButtonsContainer = document.getElementById('motion-buttons');
  const motionCountEl = document.getElementById('motion-count');
  if (!motionButtonsContainer) return;

  const motions = getAvailableMotions();
  availableMotions = motions;

  // 更新计数
  if (motionCountEl) {
    motionCountEl.textContent = motions.length.toString();
  }

  if (motions.length === 0) {
    // 没有预定义动作，显示基础交互按钮
    motionButtonsContainer.innerHTML = `
      <div class="motion-item" onclick="playTapMotion()">
        <span class="motion-icon">👆</span>
        <span class="motion-name">点击测试</span>
      </div>
      <div class="motion-item" onclick="playRandomParam()">
        <span class="motion-icon">🎲</span>
        <span class="motion-name">随机参数</span>
      </div>
    `;
    setStatus(`${getModelDisplayName(currentModelId || 'unknown')} 没有预定义动作文件`);
  } else {
    // 有动作，按分组显示
    const motionsByGroup: Record<string, Array<{ group: string, index: number, name: string }>> = {};
    motions.forEach(m => {
      if (!motionsByGroup[m.group]) {
        motionsByGroup[m.group] = [];
      }
      motionsByGroup[m.group].push(m);
    });

    let html = '';
    for (const [group, groupMotions] of Object.entries(motionsByGroup)) {
      html += `<div class="motion-section">`;
      html += `<div class="motion-section-title">${group}</div>`;
      html += `<div class="motion-list">`;
      groupMotions.forEach((m, i) => {
        const globalIndex = motions.findIndex(motion => motion.group === m.group && motion.index === m.index);
        html += `
          <div class="motion-item" data-motion-index="${globalIndex}" onclick="playCustomMotion(${globalIndex})">
            <span class="motion-icon">${getMotionEmoji(m.name)}</span>
            <span class="motion-name">${m.name}</span>
          </div>
        `;
      });
      html += `</div></div>`;
    }
    motionButtonsContainer.innerHTML = html;
    setStatus(`${getModelDisplayName(currentModelId || 'unknown')} 加载完成，${motions.length} 个可用动作`);
  }
}

function getMotionEmoji(motionName: string): string {
  const emojis: Record<string, string> = {
    '待机': '🎬',
    '点击': '👆',
    '好奇': '🤔',
    '瞌睡': '😴',
    '灵魂': '👻',
    '摇头': '💫',
    '振头': '🔄',
    '拿旗子': '🚩'
  };
  for (const [key, emoji] of Object.entries(emojis)) {
    if (motionName.includes(key)) return emoji;
  }
  return '✨';
}

// 更新表情列表
function updateExpressionList(modelId: string) {
  const expressionContainer = document.getElementById('expression-buttons');
  const expressionCountEl = document.getElementById('expression-count');
  if (!expressionContainer) return;

  // 需要等模型加载后才有表情数据
  if (!currentModel?.internalModel?.settings?.expressions) {
    availableExpressions = [];
    if (expressionCountEl) expressionCountEl.textContent = '0';
    expressionContainer.innerHTML = '<div class="empty-state">暂无可用表情</div>';
    return;
  }

  const expressions = currentModel.internalModel.settings.expressions;
  if (!expressions || expressions.length === 0) {
    availableExpressions = [];
    if (expressionCountEl) expressionCountEl.textContent = '0';
    expressionContainer.innerHTML = '<div class="empty-state">暂无可用表情</div>';
    return;
  }

  availableExpressions = expressions.map((expr: any, i: number) => ({
    file: expr.File || expr.file,
    name: (expr.File || expr.file).replace('.exp.json', '').replace('.exp3.json', '')
  }));

  // 更新 window 对象上的引用
  (window as any).availableExpressions = availableExpressions;

  if (expressionCountEl) {
    expressionCountEl.textContent = availableExpressions.length.toString();
  }

  const buttonsHtml = availableExpressions.map((expr, i) =>
    `<button class="expression-btn ${i === expressionIndex ? 'active' : ''}" onclick="setExpression(${i})">${expr.name}</button>`
  ).join('');

  expressionContainer.innerHTML = buttonsHtml;
}

async function initApp() {
  const container = document.getElementById('canvas-container');
  if (!container) return;

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

  // 初始化模型选择按钮
  initModelSelectButtons();

  // 更新模型选择下拉框
  updateModelSelect();

  await loadModel('rice');
}

function initModelSelectButtons() {
  // 绑定模型选择按钮事件
  document.querySelectorAll('#model-select .model-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const modelId = target.getAttribute('data-model');
      if (modelId) loadModel(modelId);
    });
  });
}

function updateModelSelect() {
  const container = document.getElementById('model-select');
  if (!container) return;

  const buttons = Object.entries(MODELS).map(([id, config]) => {
    const displayName = getModelDisplayName(id);
    const activeClass = currentModelId === id ? 'active' : (id === 'rice' && !currentModelId ? 'active' : '');
    return `<button data-model="${id}" class="model-btn ${activeClass}">${displayName}</button>`;
  }).join('');

  container.innerHTML = buttons;

  // 重新绑定事件
  initModelSelectButtons();
}

async function loadModel(modelId: string) {
  const modelConfig = MODELS[modelId as keyof typeof MODELS];
  if (!modelConfig) {
    setStatus('模型配置未找到：' + modelId, 'error');
    return;
  }

  setStatus(`正在加载 ${getModelDisplayName(modelId)}...`, 'loading');
  updateCurrentModelDisplay(modelId);

  // 更新按钮状态
  document.querySelectorAll('#model-select .model-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-model') === modelId) {
      btn.classList.add('active');
    }
  });

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

    // 更新动作按钮（等模型加载完成后读取 motionManager）
    setTimeout(() => {
      updateMotionButtons();
      updateExpressionList(currentModelId!);
    }, 100);

    currentModelId = modelId;
    expressionIndex = 0;

    // 更新 window 对象上的引用
    (window as any).currentModel = currentModel;
    (window as any).currentModelId = currentModelId;
    (window as any).availableExpressions = availableExpressions;
  } catch (error: any) {
    setStatus(`加载失败：${error.message}`, 'error');
    console.error('Load error:', error);
  }
}

function setupInteraction(model: any) {
  model.interactive = hitTestEnabled;

  model.on('pointerdown', () => {
    console.log('Model clicked!');
    if (hitTestEnabled && availableMotions.length === 0) {
      // 没有预定义动作时，播放随机参数
      playRandomParam();
    } else if (hitTestEnabled) {
      // 有预定义动作时，播放点击动作
      playTapMotion();
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

// 播放点击动作
function playTapMotion() {
  if (!currentModel) {
    setStatus('请先加载模型', 'error');
    return;
  }
  setStatus('播放点击动作');
  try {
    // 尝试播放 tap_body 动作，如果没有则随机播放
    currentModel.motion('tap_body').catch(() => {
      // 如果没有 tap_body，播放 Idle 动作
      if (availableMotions.length > 0) {
        const idleMotion = availableMotions.find(m => m.group === 'Idle');
        if (idleMotion) {
          currentModel.motion('Idle', idleMotion.index);
        }
      }
    });
  } catch (error: any) {
    setStatus(`动作播放失败：${error.message}`, 'error');
  }
}

// 播放自定义动作
function playCustomMotion(index: number) {
  if (!currentModel || !availableMotions[index]) {
    setStatus('请先加载模型', 'error');
    return;
  }
  const motion = availableMotions[index];
  setStatus(`播放动作：${motion.name}`);
  try {
    currentModel.motion(motion.group, motion.index);
  } catch (error: any) {
    setStatus(`动作播放失败：${error.message}`, 'error');
  }
}

// 播放随机参数（用于没有动作文件的模型）
function playRandomParam() {
  if (!currentModel) {
    setStatus('请先加载模型', 'error');
    return;
  }
  setStatus('播放随机参数变化');

  const internalModel = currentModel.internalModel;
  if (!internalModel?.coreModel) return;

  // 随机设置一些参数
  const paramIds = [
    'ParamAngleX', 'ParamAngleY', 'ParamAngleZ',
    'ParamEyeLOpen', 'ParamEyeROpen',
    'ParamMouthOpenY', 'ParamMouthForm'
  ];

  paramIds.forEach(paramId => {
    const paramValue = Math.random() * 2 - 1; // -1 to 1
    try {
      internalModel.coreModel.setParameterValueById(paramId, paramValue);
    } catch (e) {
      // 参数不存在，忽略
    }
  });

  // 2 秒后恢复
  setTimeout(() => {
    if (currentModel?.internalModel?.coreModel) {
      paramIds.forEach(paramId => {
        try {
          currentModel.internalModel.coreModel.setParameterValueById(paramId, 0);
        } catch (e) {}
      });
    }
  }, 2000);
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
  updateExpressionList(currentModelId!);
}

function setExpression(index: number) {
  if (!currentModel || !availableExpressions[index]) {
    setStatus('请先加载模型', 'error');
    return;
  }
  const expr = availableExpressions[index];
  setStatus(`设置表情：${expr.name}`);
  // 传入表情名称（Name 属性）而不是文件名，因为 pixi-live2d-display 通过 Name 匹配
  currentModel.expression(expr.name);
  expressionIndex = index;
  updateExpressionList(currentModelId!);
}

function resetExpression() {
  if (!currentModel) {
    setStatus('请先加载模型', 'error');
    return;
  }
  setStatus('重置表情');
  currentModel.expression(0);
  expressionIndex = 0;
  updateExpressionList(currentModelId!);
}

function resetModel() {
  if (currentModel && currentModelId) {
    const cfg = MODELS[currentModelId as keyof typeof MODELS];
    currentModel.x = cfg.position.x;
    currentModel.y = cfg.position.y;
    currentModel.scale.set(cfg.scale);
    currentModel.angle = 0;

    // 重置参数
    if (currentModel.internalModel?.coreModel) {
      // 重置所有参数为默认值
      const paramIds = [
        'ParamAngleX', 'ParamAngleY', 'ParamAngleZ',
        'ParamEyeLOpen', 'ParamEyeROpen',
        'ParamMouthOpenY', 'ParamMouthForm'
      ];
      paramIds.forEach(paramId => {
        try {
          currentModel.internalModel.coreModel.setParameterValueById(paramId, 0);
        } catch (e) {}
      });
    }

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
(window as any).currentModel = currentModel;
(window as any).currentModelId = currentModelId;
(window as any).availableExpressions = availableExpressions;
(window as any).loadModel = loadModel;
(window as any).playCustomMotion = playCustomMotion;
(window as any).playTapMotion = playTapMotion;
(window as any).playRandomParam = playRandomParam;
(window as any).toggleExpression = toggleExpression;
(window as any).setExpression = setExpression;
(window as any).resetExpression = resetExpression;
(window as any).resetModel = resetModel;

// 启动
initApp();
