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
    scale: 0.33,
    position: { x: 170, y: 350 }
  },
  fuxuan: {
    path: '/live2d/fuxuan/符玄.model3.json',
    scale: 0.11,
    position: { x: 400, y: 440 }
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
    position: { x: 400, y: 450 }
  },
  jingliu: {
    path: '/live2d/jingliu/镜流.model3.json',
    scale: 0.33,
    position: { x: 400, y: 560 }
  },
  kafka: {
    path: '/live2d/kafka/kafuka1.model3.json',
    scale: 0.21,
    position: { x: 400, y: 540 }
  },
  robin: {
    path: '/live2d/robin/知更鸟.model3.json',
    scale: 0.13,
    position: { x: 400, y: 500 }
  },
  nicole: {
    path: '/live2d/nicole/Nicole.model3.json',
    scale: 0.17,
    position: { x: 400, y: 530 }
  }
};

const DEFAULT_SCALE = 0.1;

let app: PIXI.Application | null = null;
let currentModel: any = null;
let currentModelId: string | null = null;
let expressionIndex = 0;
let availableMotions: Array<{ group: string, index: number, name: string }> = [];
let availableExpressions: Array<{ file: string, name: string }> = [];

// 当前模型的 cdi3.json 数据（包含中文参数名和分组信息）
let currentCdiData: any = null;

// 状态标志
let heartbeatRAFId: number | null = null;

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

// 心跳 - 保持 ticker 运行
function startHeartbeat() {
  if (heartbeatRAFId !== null) {
    cancelAnimationFrame(heartbeatRAFId);
  }

  const tick = () => {
    heartbeatRAFId = requestAnimationFrame(tick);
  };

  heartbeatRAFId = requestAnimationFrame(tick);
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
        // 优先使用 Name 属性（支持中文），如果没有则从文件名提取
        const motionName = motion.Name || motion.name || (motion.File || motion.file || '').replace('.motion3.json', '').replace('.mtn', '');
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

// 动作分组中文映射（分组名如 Idle/Custom 等）
function getMotionGroupName(group: string): string {
  const mapping: Record<string, string> = {
    'Idle': '待机',
    'TapBody': '点击',
    'Custom': '自定义',
    'Hit': '被击中',
    'FlickHead': '拂头',
    'Special': '特殊'
  };
  return mapping[group] || group;
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
    // 没有预定义动作
    motionButtonsContainer.innerHTML = '';
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
      html += `<div class="motion-section-title">${getMotionGroupName(group)}</div>`;
      html += `<div class="motion-list">`;
      groupMotions.forEach((m, i) => {
        const globalIndex = motions.findIndex(motion => motion.group === m.group && motion.index === m.index);
        // m.name 现在直接从 model3.json 的 Name 属性读取，已经是中文
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

  // 使用 model3.json 中定义的 Name 属性（中文名称）
  availableExpressions = expressions.map((expr: any, i: number) => ({
    file: expr.File || expr.file,
    name: expr.Name || expr.name || (expr.File || expr.file).replace('.exp.json', '').replace('.exp3.json', '')
  }));

  // 更新 window 对象上的引用
  (window as any).availableExpressions = availableExpressions;

  if (expressionCountEl) {
    expressionCountEl.textContent = availableExpressions.length.toString();
  }

  const buttonsHtml = availableExpressions.map((expr, i) =>
    `<button class="expression-btn ${i === expressionIndex ? 'active' : ''}" onclick="setExpressionByName('${expr.name}')">${expr.name}</button>`
  ).join('');

  expressionContainer.innerHTML = buttonsHtml;
}

// 更新参数滑块列表 - 根据当前模型所有参数动态生成
function updateParameterSliders() {
  const container = document.getElementById('parameter-sliders');
  const countEl = document.getElementById('param-count');
  if (!container) return;

  let coreModel: any = null;

  if (currentModel?.internalModel?.coreModel) {
    coreModel = currentModel.internalModel.coreModel;
  } else if (currentModel?.coreModel) {
    coreModel = currentModel.coreModel;
  }

  if (!coreModel) {
    container.innerHTML = '<div class="empty-state">模型未加载完成</div>';
    if (countEl) countEl.textContent = '0';
    return;
  }

  // 所有参数数据，按分组组织
  let groupedParams: Record<string, Array<{id: string, name: string}>> = {};
  let totalParamCount = 0;

  if (currentCdiData && currentCdiData.Parameters && currentCdiData.Parameters.length > 0) {
    // 有 cdi3.json 数据，使用它来获取中文参数名和分组
    const paramMap = new Map<string, {name: string, groupId: string}>();
    currentCdiData.Parameters.forEach((p: any) => {
      paramMap.set(p.Id, {name: p.Name, groupId: p.GroupId || ''});
    });

    // 构建分组映射
    const groupNameMap = new Map<string, string>();
    if (currentCdiData.ParameterGroups) {
      currentCdiData.ParameterGroups.forEach((g: any) => {
        groupNameMap.set(g.Id, g.Name);
      });
    }

    // 验证参数是否存在，并按分组组织
    currentCdiData.Parameters.forEach((p: any) => {
      try {
        const val = coreModel.getParameterValueById(p.Id);
        if (typeof val === 'number') {
          const groupId = p.GroupId || 'other';
          if (!groupedParams[groupId]) {
            groupedParams[groupId] = [];
          }
          groupedParams[groupId].push({id: p.Id, name: p.Name});
          totalParamCount++;
        }
      } catch (e) {
        // 参数不存在，跳过
      }
    });
  }

  // 如果没有 cdi3.json 数据或没有找到参数，回退到标准参数
  if (totalParamCount === 0) {
    const standardParams = [
      'ParamAngleX', 'ParamAngleY', 'ParamAngleZ',
      'ParamEyeLOpen', 'ParamEyeROpen', 'ParamEyeBallX', 'ParamEyeBallY',
      'ParamMouthOpenY', 'ParamMouthForm',
      'ParamBodyAngleX', 'ParamBodyAngleY', 'ParamBodyAngleZ',
      'ParamBreath',
      'ParamBrowLY', 'ParamBrowRY', 'ParamBrowLX', 'ParamBrowRX',
      'ParamBrowLForm', 'ParamBrowRForm', 'ParamBrowLAngle', 'ParamBrowRAngle',
      'ParamCheek', 'ParamSmile'
    ];
    groupedParams['标准参数'] = [];
    standardParams.forEach(id => {
      try {
        const val = coreModel.getParameterValueById(id);
        if (typeof val === 'number') {
          groupedParams['标准参数'].push({id, name: id});
          totalParamCount++;
        }
      } catch (e) {}
    });
  }

  if (totalParamCount === 0) {
    container.innerHTML = '<div class="empty-state">未找到参数列表</div>';
    if (countEl) countEl.textContent = '0';
    return;
  }

  // 获取分组名称
  const getGroupName = (groupId: string): string => {
    if (groupId === '标准参数') return '标准参数';
    if (groupId === 'other') return '其他';
    if (currentCdiData && currentCdiData.ParameterGroups) {
      const group = currentCdiData.ParameterGroups.find((g: any) => g.Id === groupId);
      if (group) return group.Name;
    }
    return groupId;
  };

  // 生成 HTML - 按分组显示，使用折叠面板
  let html = '';
  let globalIndex = 0;
  const allParamData: Array<{id: string, index: number}> = [];

  Object.keys(groupedParams).forEach((groupId) => {
    const params = groupedParams[groupId];
    if (params.length === 0) return;

    const groupName = getGroupName(groupId);

    html += `
      <div class="accordion" style="margin-bottom: 8px;">
        <button class="accordion-header param-accordion-header" style="padding: 10px 12px;">
          <div class="title">
            <svg class="accordion-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18l6-6-6-6"/>
            </svg>
            ${escapeHtml(groupName)}
          </div>
          <span class="accordion-badge">${params.length}</span>
        </button>
        <div class="accordion-body">
          <div class="accordion-inner" style="padding: 8px 12px 12px;">
    `;

    params.forEach((param) => {
      const id = param.id;
      const name = param.name;

      // 判断参数范围
      let min = -30;
      let max = 30;
      let step = 1;

      // 根据参数名判断范围
      const lowerId = id.toLowerCase();
      const lowerName = name.toLowerCase();
      if (lowerId.includes('open') || lowerId.includes('breath') || lowerId.includes('cheek') || lowerId.includes('smile') ||
          lowerName.includes('开闭') || lowerName.includes('呼吸') || lowerName.includes('笑')) {
        min = 0;
        max = 1;
        step = 0.05;
      } else if (lowerId.includes('form') || lowerId.includes('ball') ||
                 lowerName.includes('变形') || lowerName.includes('眼珠')) {
        min = -1;
        max = 1;
        step = 0.05;
      } else if (lowerId.includes('angle') || lowerName.includes('角度') || lowerName.includes('旋转')) {
        min = -30;
        max = 30;
        step = 1;
      }

      // 获取当前值
      let currentValue = 0;
      try {
        currentValue = coreModel.getParameterValueById(id);
      } catch (e) {}

      const sliderId = `param-slider-${globalIndex}`;
      const valueId = `param-value-${globalIndex}`;

      html += `
        <div class="slider-item" style="margin-bottom: 12px;">
          <div class="slider-label">
            <span>${escapeHtml(name)} <small style="opacity:0.5;font-size:0.7em;">(${id})</small></span>
            <span class="slider-value" id="${valueId}">${currentValue.toFixed(2)}</span>
          </div>
          <input type="range" id="${sliderId}"
            min="${min}" max="${max}" step="${step}" value="${currentValue}">
        </div>
      `;

      allParamData.push({id, index: globalIndex});
      globalIndex++;
    });

    html += `
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  if (countEl) countEl.textContent = totalParamCount.toString();

  // 使用事件委托处理折叠面板点击 - 在 container 上绑定，更可靠
  container.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const header = target.closest('.param-accordion-header');
    if (header) {
      const accordion = header.closest('.accordion');
      if (accordion) {
        accordion.classList.toggle('open');
      }
    }
  });

  // 绑定事件
  allParamData.forEach(({id, index}) => {
    const sliderId = `param-slider-${index}`;
    const valueId = `param-value-${index}`;

    const slider = document.getElementById(sliderId) as HTMLInputElement;
    if (slider) {
      slider.addEventListener('input', (e) => {
        const value = parseFloat((e.target as HTMLInputElement).value);
        updateSliderValue(valueId, value.toFixed(2));
        try {
          coreModel.setParameterValueById(id, value);
        } catch (err) {
          console.warn('Failed to set parameter', id, err);
        }
      });
    }
  });
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

  // 启动心跳（自动眨眼和呼吸）
  startHeartbeat();

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

    // 加载 .cdi3.json 获取中文参数名和分组信息
    currentCdiData = null;
    try {
      const cdiPath = modelConfig.path.replace('.model3.json', '.cdi3.json');
      const cdiResponse = await fetch(cdiPath);
      if (cdiResponse.ok) {
        currentCdiData = await cdiResponse.json();
        console.log('Loaded cdi3.json:', currentCdiData);
      }
    } catch (e) {
      console.log('No cdi3.json found or failed to load:', e);
    }

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

    // 更新动作按钮（等模型加载完成后读取 motionManager）
    setTimeout(() => {
      updateMotionButtons();
      updateExpressionList(currentModelId!);
      updateParameterSliders();
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

// 通过表情名称设置表情（用于 HTML onclick）
function setExpressionByName(name: string) {
  if (!currentModel) {
    setStatus('请先加载模型', 'error');
    return;
  }
  setStatus(`设置表情：${name}`);
  currentModel.expression(name);
  // 更新激活状态
  const index = availableExpressions.findIndex(expr => expr.name === name);
  if (index >= 0) expressionIndex = index;
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

// ========== 语音控制集成 ==========

// 导入语音服务模块（相对路径调整）
import { getTextToSpeechInstance } from '../live2d/services/TextToSpeechService.js';
import { getSpeechRecognitionInstance } from '../live2d/services/SpeechRecognitionService.js';
import LipSyncSystem from '../live2d/features/lipSync/LipSyncSystem.js';

// 语音系统状态
let tts = getTextToSpeechInstance({
  lang: 'zh-CN',
  rate: 0.9,
  pitch: 1.1,
  onStart: () => {
    if (lipSync && lipSyncEnabled && currentModel) {
      const text = (document.getElementById('tts-text') as HTMLTextAreaElement)?.value || '';
      isSpeaking = true;
      lipSync.start(text, 'text');
      startLipSyncTick();
      setVoiceStatus();
    }
  },
  onEnd: () => {
    if (lipSync) {
      isSpeaking = false;
      lipSync.stop();
      stopLipSyncTick();
      setVoiceStatus();
    }
  },
  onError: () => {
    isSpeaking = false;
    if (lipSync) lipSync.stop();
    stopLipSyncTick();
    setVoiceStatus();
  }
});

let asr = getSpeechRecognitionInstance({
  lang: 'zh-CN',
  continuous: false,
  interimResults: false,
  onResult: (transcript: string) => {
    const resultEl = document.getElementById('asr-result');
    if (resultEl) resultEl.textContent = transcript;
    setStatus(`语音识别完成: ${transcript}`);

    // 如果启用了 AI 对话，自动发送识别结果
    const autoSend = (document.getElementById('asr-enabled') as HTMLInputElement)?.checked;
    if (autoSend && transcript.trim()) {
      sendChatMessage(transcript);
    }
  },
  onStart: () => {
    setStatus('正在录音...');
    const resultEl = document.getElementById('asr-result');
    if (resultEl) resultEl.textContent = '正在录音...';
  },
  onEnd: () => {
    setVoiceStatus();
  },
  onError: (error: string) => {
    setStatus(`语音识别错误: ${error}`, 'error');
  }
});

// 嘴型同步
let lipSync: LipSyncSystem | null = null;
let lipSyncEnabled = true;
let isSpeaking = false;
let animationFrameId: number | null = null;
let lastTickTime = performance.now();

// 聊天历史
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
let chatHistory: ChatMessage[] = [];

// 初始化 LipSync（paramController 留空，直接操作参数）
lipSync = new LipSyncSystem(null);

// 更新语音状态显示
function setVoiceStatus() {
  const statusEl = document.getElementById('voice-status');
  if (!statusEl) return;

  const ttsEnabled = (document.getElementById('tts-enabled') as HTMLInputElement)?.checked ?? true;
  const asrEnabled = (document.getElementById('asr-enabled') as HTMLInputElement)?.checked ?? true;

  let status = '';
  if (!tts.isSupported() || !ttsEnabled) {
    status += 'TTS: 关闭';
  } else if (isSpeaking) {
    status += 'TTS: 朗读中';
  } else {
    status += 'TTS: 就绪';
  }

  status += ' / ';

  if (!asr.isSupported() || !asrEnabled) {
    status += 'ASR: 关闭';
  } else if (asr.getIsListening()) {
    status += 'ASR: 录音中';
  } else {
    status += 'ASR: 就绪';
  }

  statusEl.textContent = status;
}

// 启动嘴型同步动画循环
function startLipSyncTick() {
  if (animationFrameId !== null) return;

  lastTickTime = performance.now();
  const tick = (currentTime: number) => {
    const delta = currentTime - lastTickTime;
    lastTickTime = currentTime;

    if (lipSync && isSpeaking && currentModel?.internalModel?.coreModel) {
      lipSync.tick(delta);

      // 直接更新模型参数
      const coreModel = currentModel.internalModel.coreModel;
      const mouthOpen = lipSync.currentMouthOpen;
      if (typeof mouthOpen === 'number') {
        try {
          coreModel.setParameterValueById('ParamMouthOpenY', mouthOpen);
          const mouthForm = Math.round(mouthOpen * 2) - 1;
          coreModel.setParameterValueById('ParamMouthForm', mouthForm);
        } catch (e) {
          // 参数不存在，忽略
        }
      }

      // 更新调试显示
      const debugEl = document.getElementById('mouth-open-value');
      if (debugEl) {
        debugEl.textContent = mouthOpen.toFixed(2);
      }
    }

    if (isSpeaking) {
      animationFrameId = requestAnimationFrame(tick);
    }
  };

  animationFrameId = requestAnimationFrame(tick);
}

// 停止嘴型同步动画循环
function stopLipSyncTick() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  // 闭合嘴巴
  if (currentModel?.internalModel?.coreModel) {
    try {
      currentModel.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', 0);
      currentModel.internalModel.coreModel.setParameterValueById('ParamMouthForm', -1);
    } catch (e) {}
  }

  const debugEl = document.getElementById('mouth-open-value');
  if (debugEl) {
    debugEl.textContent = '0';
  }
}

// 初始化语音控制 UI 事件
function initVoiceControls() {
  // TTS 语速滑块
  const rateSlider = document.getElementById('tts-rate-slider') as HTMLInputElement;
  if (rateSlider) {
    rateSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      updateSliderValue('tts-rate-value', value.toFixed(1));
      tts.setRate(value);
    });
  }

  // TTS 音调滑块
  const pitchSlider = document.getElementById('tts-pitch-slider') as HTMLInputElement;
  if (pitchSlider) {
    pitchSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      updateSliderValue('tts-pitch-value', value.toFixed(1));
      tts.setPitch(value);
    });
  }

  // 字符速率滑块（LipSync）
  const cpsSlider = document.getElementById('cps-slider') as HTMLInputElement;
  if (cpsSlider && lipSync) {
    cpsSlider.addEventListener('input', (e) => {
      const value = parseInt((e.target as HTMLInputElement).value);
      updateSliderValue('cps-value', value.toString());
      lipSync.setCharsPerSecond(value);
    });
  }

  // 平滑速度滑块
  const smoothSlider = document.getElementById('smooth-slider') as HTMLInputElement;
  if (smoothSlider && lipSync) {
    smoothSlider.addEventListener('input', (e) => {
      const value = parseInt((e.target as HTMLInputElement).value);
      updateSliderValue('smooth-value', value.toString());
      lipSync.setSmoothSpeed(value);
    });
  }

  // TTS 启用复选框
  const ttsEnabledCb = document.getElementById('tts-enabled') as HTMLInputElement;
  if (ttsEnabledCb) {
    ttsEnabledCb.addEventListener('change', () => {
      const enabled = ttsEnabledCb.checked;
      if (!enabled && isSpeaking) {
        tts.stop();
        stopLipSyncTick();
      }
      setVoiceStatus();
    });
  }

  // ASR 启用复选框
  const asrEnabledCb = document.getElementById('asr-enabled') as HTMLInputElement;
  if (asrEnabledCb) {
    asrEnabledCb.addEventListener('change', () => {
      const enabled = asrEnabledCb.checked;
      if (!enabled && asr.getIsListening()) {
        asr.stop();
      }
      setVoiceStatus();
    });
  }

  // LipSync 启用复选框
  const lipSyncEnabledCb = document.getElementById('lipsync-enabled') as HTMLInputElement;
  if (lipSyncEnabledCb) {
    lipSyncEnabledCb.addEventListener('change', () => {
      lipSyncEnabled = lipSyncEnabledCb.checked;
      if (!lipSyncEnabled && isSpeaking) {
        stopLipSyncTick();
      }
    });
  }

  // TTS 朗读按钮
  const btnSpeak = document.getElementById('btn-tts-speak');
  if (btnSpeak) {
    btnSpeak.addEventListener('click', () => {
      if (!tts.isSupported() || !(document.getElementById('tts-enabled') as HTMLInputElement)?.checked) {
        setStatus('TTS 不支持或已禁用', 'error');
        return;
      }

      const textEl = document.getElementById('tts-text') as HTMLTextAreaElement;
      const text = textEl.value.trim();
      if (!text) {
        setStatus('请输入要朗读的文字', 'error');
        return;
      }

      // 停止之前的朗读
      tts.stop();

      // 开始朗读
      const success = tts.speak(text);
      if (success) {
        setStatus(`开始朗读: ${text.length} 字`);
      }
    });
  }

  // TTS 停止按钮
  const btnStop = document.getElementById('btn-tts-stop');
  if (btnStop) {
    btnStop.addEventListener('click', () => {
      tts.stop();
      stopLipSyncTick();
      setStatus('朗读已停止');
    });
  }

  // ASR 开始录音按钮
  const btnAsrStart = document.getElementById('btn-asr-start');
  if (btnAsrStart) {
    btnAsrStart.addEventListener('click', () => {
      if (!asr.isSupported() || !(document.getElementById('asr-enabled') as HTMLInputElement)?.checked) {
        setStatus('ASR 不支持或已禁用', 'error');
        return;
      }

      if (asr.getIsListening()) {
        asr.stop();
        (btnAsrStart as HTMLButtonElement).textContent = '🎤 开始录音';
        return;
      }

      const success = asr.start();
      if (success) {
        (btnAsrStart as HTMLButtonElement).textContent = '⏹ 停止录音';
        setVoiceStatus();
      }
    });
  }

  // 聊天发送按钮
  const btnChatSend = document.getElementById('btn-chat-send');
  if (btnChatSend) {
    btnChatSend.addEventListener('click', () => {
      const inputEl = document.getElementById('chat-input') as HTMLInputElement;
      const message = inputEl.value.trim();
      if (!message) {
        setStatus('请输入消息', 'error');
        return;
      }
      sendChatMessage(message);
      inputEl.value = '';
    });

    // 回车发送
    const inputEl = document.getElementById('chat-input') as HTMLInputElement;
    if (inputEl) {
      inputEl.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          const message = inputEl.value.trim();
          if (message) {
            sendChatMessage(message);
            inputEl.value = '';
          }
        }
      });
    }
  }

  // 检查支持状态
  if (!tts.isSupported()) {
    setStatus('警告：当前浏览器不支持 Web Speech API TTS', 'error');
  }
  if (!asr.isSupported()) {
    setStatus('警告：当前浏览器不支持 Web Speech API ASR', 'error');
  }

  setVoiceStatus();
}

// 发送聊天消息到后端 API
async function sendChatMessage(message: string) {
  const autoTts = (document.getElementById('auto-tts-reply') as HTMLInputElement)?.checked ?? true;

  // 添加用户消息到历史
  chatHistory.push({ role: 'user', content: message });
  updateChatHistoryDisplay();
  setStatus(`发送消息: ${message}`);

  try {
    // 调用后端 API
    const response = await fetch('/api/chat/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sessionId: 'live2d-test' })
    });

    const data = await response.json();

    if (!data.success) {
      setStatus(`AI 回复失败: ${data.message || '未知错误'}`, 'error');
      return;
    }

    const reply = data.data.reply;
    chatHistory.push({ role: 'assistant', content: reply });
    updateChatHistoryDisplay();
    setStatus('AI 回复已接收');

    // 自动朗读回复
    if (autoTts && tts.isSupported() && (document.getElementById('tts-enabled') as HTMLInputElement)?.checked) {
      tts.stop();
      setTimeout(() => {
        tts.speak(reply);
      }, 200);
    }
  } catch (error: any) {
    setStatus(`请求失败: ${error.message}`, 'error');
    console.error('Chat error:', error);
  }
}

// 更新聊天历史显示
function updateChatHistoryDisplay() {
  const container = document.getElementById('chat-history');
  if (!container) return;

  let html = '';
  chatHistory.forEach(msg => {
    const isUser = msg.role === 'user';
    const bg = isUser
      ? 'rgba(99, 102, 241, 0.2)'
      : 'rgba(255, 255, 255, 0.05)';
    const align = isUser ? 'right' : 'left';
    const badge = isUser ? '你' : 'AI';

    html += `
      <div style="
        margin-bottom: 8px;
        text-align: ${align};
      ">
        <div style="
          display: inline-block;
          max-width: 90%;
          padding: 8px 10px;
          border-radius: 10px;
          background: ${bg};
          font-size: 0.75rem;
          text-align: left;
        ">
          <div style="
            font-size: 0.65rem;
            color: var(--text-secondary);
            margin-bottom: 4px;
            opacity: 0.8;
          ">${badge}</div>
          <div style="color: var(--text-primary); line-height: 1.4;">${escapeHtml(msg.content)}</div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
}

// HTML 转义
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 在应用初始化完成后初始化语音控制
setTimeout(() => {
  initVoiceControls();
}, 100);

// 暴露语音控制到全局
(window as any).tts = tts;
(window as any).asr = asr;
(window as any).lipSync = lipSync;
(window as any).speakText = (text: string) => {
  if (tts.isSupported()) {
    tts.speak(text);
  }
};

// ========== 结束语音控制 ==========

// 暴露到全局
(window as any).currentModel = currentModel;
(window as any).currentModelId = currentModelId;
(window as any).availableExpressions = availableExpressions;
(window as any).loadModel = loadModel;
(window as any).playCustomMotion = playCustomMotion;
(window as any).toggleExpression = toggleExpression;
(window as any).setExpression = setExpression;
(window as any).setExpressionByName = setExpressionByName;
(window as any).resetExpression = resetExpression;
(window as any).resetModel = resetModel;

// 启动
initApp();
