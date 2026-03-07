/**
 * 构建进度追踪服务
 */
const cacheService = require('./cacheService');
const websocketService = require('./websocketService');
const { v4: uuidv4 } = require('uuid');

class BuildProgressService {
  constructor() {
    this.activeBuilds = new Map();
  }

  async startBuild(moduleConfig) {
    const buildId = uuidv4();
    const buildInfo = {
      id: buildId,
      moduleId: moduleConfig.id,
      module: moduleConfig.name,
      serviceId: moduleConfig.serviceId,
      status: 'running',
      startTime: Date.now(),
      steps: [
        { name: '准备环境', status: 'pending', progress: 0 },
        { name: '安装依赖', status: 'pending', progress: 0 },
        { name: '编译构建', status: 'pending', progress: 0 },
        { name: '复制资源', status: 'pending', progress: 0 },
        { name: '重启服务', status: 'pending', progress: 0 }
      ],
      currentStep: 0,
      logs: [],
      error: null
    };

    this.activeBuilds.set(buildId, buildInfo);
    await cacheService.set(`build:${buildId}`, buildInfo, 3600);

    return buildId;
  }

  async updateStep(buildId, stepIndex, status, progress, log = '') {
    const build = this.activeBuilds.get(buildId);
    if (!build || build.status === 'cancelled') return;

    build.steps[stepIndex] = {
      ...build.steps[stepIndex],
      status,
      progress
    };
    build.currentStep = stepIndex;

    if (log) {
      build.logs.push({
        time: Date.now(),
        message: log
      });
    }

    websocketService.broadcastBuildProgress(buildId, {
      module: build.module,
      moduleId: build.moduleId,
      status: build.status,
      currentStep: stepIndex,
      totalSteps: build.steps.length,
      stepName: build.steps[stepIndex].name,
      stepProgress: progress,
      overallProgress: Math.round((stepIndex / build.steps.length) * 100 + (progress / build.steps.length)),
      log
    });

    await cacheService.set(`build:${buildId}`, build, 3600);
  }

  async completeBuild(buildId, success, error = null) {
    const build = this.activeBuilds.get(buildId);
    if (!build) return null;
    if (build.status === 'cancelled') return build;

    build.status = success ? 'success' : 'failed';
    build.endTime = Date.now();
    build.duration = build.endTime - build.startTime;
    build.error = error;

    build.steps.forEach((step, idx) => {
      if (idx < build.currentStep) {
        step.status = 'completed';
        step.progress = 100;
      } else if (idx === build.currentStep) {
        step.status = success ? 'completed' : 'failed';
        step.progress = success ? 100 : step.progress;
      }
    });

    websocketService.broadcastBuildProgress(buildId, {
      module: build.module,
      moduleId: build.moduleId,
      status: build.status,
      currentStep: build.currentStep,
      totalSteps: build.steps.length,
      stepName: build.steps[build.currentStep]?.name,
      overallProgress: success ? 100 : Math.round((build.currentStep / build.steps.length) * 100),
      duration: build.duration,
      error
    });

    await cacheService.set(`build:${buildId}`, build, 3600);
    await cacheService.pushToList('build:history', {
      id: build.id,
      moduleId: build.moduleId,
      module: build.module,
      status: build.status,
      startTime: build.startTime,
      endTime: build.endTime,
      duration: build.duration,
      error: build.error
    }, 50);

    this._scheduleCleanup(buildId);
    return build;
  }

  async cancelBuild(buildId, reason = '用户取消构建') {
    const build = this.activeBuilds.get(buildId);
    if (!build || build.status !== 'running') return false;

    build.status = 'cancelled';
    build.endTime = Date.now();
    build.duration = build.endTime - build.startTime;
    build.error = reason;

    const currentStep = build.steps[build.currentStep];
    if (currentStep) {
      currentStep.status = 'failed';
    }

    websocketService.broadcastBuildProgress(buildId, {
      module: build.module,
      moduleId: build.moduleId,
      status: 'cancelled',
      currentStep: build.currentStep,
      totalSteps: build.steps.length,
      stepName: currentStep?.name,
      overallProgress: Math.round((build.currentStep / build.steps.length) * 100),
      duration: build.duration,
      error: reason
    });

    await cacheService.set(`build:${buildId}`, build, 3600);
    await cacheService.pushToList('build:history', {
      id: build.id,
      moduleId: build.moduleId,
      module: build.module,
      status: build.status,
      startTime: build.startTime,
      endTime: build.endTime,
      duration: build.duration,
      error: build.error
    }, 50);

    this._scheduleCleanup(buildId);
    return true;
  }

  isBuildCancelled(buildId) {
    return this.activeBuilds.get(buildId)?.status === 'cancelled';
  }

  async getBuild(buildId) {
    const build = this.activeBuilds.get(buildId);
    if (build) return build;

    return cacheService.get(`build:${buildId}`);
  }

  async getRecentBuilds(limit = 10) {
    return cacheService.getList('build:history', 0, limit - 1);
  }

  getActiveBuilds() {
    return Array.from(this.activeBuilds.values()).map((build) => ({
      id: build.id,
      module: build.module,
      moduleId: build.moduleId,
      status: build.status,
      startTime: build.startTime,
      currentStep: build.currentStep,
      totalSteps: build.steps.length,
      stepName: build.steps[build.currentStep]?.name || '准备中...',
      overallProgress: build.status === 'success'
        ? 100
        : Math.round((build.currentStep / build.steps.length) * 100),
      duration: build.duration,
      error: build.error
    }));
  }

  _scheduleCleanup(buildId) {
    setTimeout(() => this.activeBuilds.delete(buildId), 300000);
  }
}

module.exports = new BuildProgressService();
