const ANSI_ESCAPE = /\x1b\[[0-9;]*m/g;

const MODULE_STAGE_WEIGHT = {
  pending: 0,
  started: 0.08,
  maven: 0.28,
  jar: 0.48,
  docker: 0.72,
  succeeded: 1,
  failed: 1
};

const BUILD_PROGRESS_START = 30;
const BUILD_PROGRESS_END = 85;

function clampProgress(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

class PackageProgressTracker {
  constructor(services = []) {
    this.services = unique(services.map((item) => String(item || '').trim()));
    this.moduleStates = Object.fromEntries(this.services.map((service) => [service, 'pending']));
    this.tail = '';
    this.lastSignature = '';
    this.stage = 'spawn';
    this.progress = 5;
    this.message = '打包任务已启动';
  }

  consume(chunk = '') {
    const text = String(chunk || '').replace(ANSI_ESCAPE, '');
    if (!text) return [];

    const combined = this.tail + text;
    const lines = combined.split(/\r?\n/);
    this.tail = lines.pop() || '';

    return lines.flatMap((line) => this._consumeLine(line));
  }

  flush() {
    if (!this.tail) return [];
    const line = this.tail;
    this.tail = '';
    return this._consumeLine(line);
  }

  _consumeLine(rawLine) {
    const line = String(rawLine || '').trim();
    if (!line) return [];

    const updates = [];
    const push = (update) => {
      const next = this._buildUpdate(update);
      if (!next) return;
      updates.push(next);
    };

    if (line.includes('检查构建环境')) {
      push({ stage: 'preflight', progress: 8, message: '检查构建环境' });
    } else if (line.includes('环境检查通过')) {
      push({ stage: 'preflight', progress: 14, message: '构建环境检查通过' });
    } else if (line.includes('初始化项目依赖')) {
      push({ stage: 'dependencies', progress: 18, message: '初始化 Maven 依赖' });
    } else if (line.includes('安装父 POM')) {
      push({ stage: 'dependencies', progress: 20, message: '安装父 POM' });
    } else if (line.includes('编译核心框架模块')) {
      push({ stage: 'dependencies', progress: 24, message: '编译核心框架依赖' });
    } else if (line.includes('依赖初始化完成')) {
      push({ stage: 'dependencies', progress: 28, message: '项目依赖初始化完成' });
    } else if (/\b(?:并行|串行)构建\s+\d+\s+个模块/.test(line)) {
      push({ stage: 'build_modules', progress: 30, message: '开始构建服务模块' });
    }

    const launched = line.match(/启动构建任务:\s*([a-zA-Z0-9._-]+)/);
    if (launched) {
      push(this._setModuleState(launched[1], 'started', `${launched[1]} · 准备构建`));
    }

    const moduleLog = line.match(/\[([a-zA-Z0-9._-]+)]\s*(.+)/);
    if (moduleLog) {
      const moduleName = moduleLog[1];
      const detail = moduleLog[2];

      if (detail.includes('开始构建')) {
        push(this._setModuleState(moduleName, 'started', `${moduleName} · 开始构建`));
      } else if (detail.includes('Maven 编译失败')) {
        push(this._setModuleState(moduleName, 'failed', `${moduleName} · Maven 编译失败`));
      } else if (detail.includes('Maven 编译完成')) {
        push(this._setModuleState(moduleName, 'jar', `${moduleName} · Maven 编译完成`));
      } else if (detail.includes('Maven 编译')) {
        push(this._setModuleState(moduleName, 'maven', `${moduleName} · Maven 编译`));
      } else if (detail.includes('解压 JAR 依赖')) {
        push(this._setModuleState(moduleName, 'jar', `${moduleName} · 准备镜像依赖`));
      } else if (detail.includes('Docker 镜像构建失败')) {
        push(this._setModuleState(moduleName, 'failed', `${moduleName} · Docker 镜像构建失败`));
      } else if (detail.includes('构建 Docker 镜像')) {
        push(this._setModuleState(moduleName, 'docker', `${moduleName} · 构建 Docker 镜像`));
      } else if (detail.includes('构建完成:')) {
        push(this._setModuleState(moduleName, 'succeeded', `${moduleName} · 构建完成`));
      }
    }

    const moduleSucceeded = line.match(/模块构建成功:\s*([a-zA-Z0-9._-]+)/);
    if (moduleSucceeded) {
      push(this._setModuleState(moduleSucceeded[1], 'succeeded', `${moduleSucceeded[1]} · 构建完成`));
    }

    const moduleFailed = line.match(/模块构建失败:\s*([a-zA-Z0-9._-]+)/);
    if (moduleFailed) {
      push(this._setModuleState(moduleFailed[1], 'failed', `${moduleFailed[1]} · 构建失败`));
    }

    if (/导出\s+\d+\s+个镜像到:/.test(line)) {
      push({ stage: 'export_images', progress: 90, message: '导出 Docker 镜像包' });
    } else if (line.includes('镜像导出完成:')) {
      push({ stage: 'export_images', progress: 96, message: '镜像导出完成' });
    } else if (line.includes('构建完成（有')) {
      push({ stage: 'summary', progress: 98, message: '生成构建结果（存在失败模块）' });
    } else if (line.includes('构建完成！')) {
      push({ stage: 'summary', progress: 98, message: '生成构建结果' });
    }

    return updates.filter(Boolean);
  }

  _setModuleState(moduleName, state, message) {
    if (!moduleName) return null;
    if (!this.moduleStates[moduleName] && this.services.length > 0 && !this.services.includes(moduleName)) {
      return null;
    }

    if (!this.moduleStates[moduleName]) {
      this.services.push(moduleName);
      this.moduleStates[moduleName] = 'pending';
    }

    const currentWeight = MODULE_STAGE_WEIGHT[this.moduleStates[moduleName]] ?? 0;
    const nextWeight = MODULE_STAGE_WEIGHT[state] ?? currentWeight;
    if (nextWeight >= currentWeight || state === 'failed') {
      this.moduleStates[moduleName] = state;
    }

    const weights = this.services.map((service) => MODULE_STAGE_WEIGHT[this.moduleStates[service]] ?? 0);
    const average = weights.length > 0 ? weights.reduce((sum, value) => sum + value, 0) / weights.length : 0;
    const progress = BUILD_PROGRESS_START + average * (BUILD_PROGRESS_END - BUILD_PROGRESS_START);

    return {
      stage: state === 'docker' ? 'docker_build' : state === 'maven' ? 'maven_build' : 'build_modules',
      progress,
      message
    };
  }

  _buildUpdate(update) {
    if (!update) return null;

    const nextProgress = clampProgress(Math.max(this.progress, Number(update.progress) || 0));
    this.stage = update.stage || this.stage;
    this.progress = nextProgress;
    this.message = update.message || this.message;

    const succeededModules = this.services.filter((service) => this.moduleStates[service] === 'succeeded');
    const failedModules = this.services.filter((service) => this.moduleStates[service] === 'failed');
    const activeModules = this.services.filter((service) => !['pending', 'succeeded', 'failed'].includes(this.moduleStates[service]));
    const completedModules = unique([...succeededModules, ...failedModules]);

    const metadata = {
      buildProgress: {
        stage: this.stage,
        totalModules: this.services.length,
        completedModules,
        succeededModules,
        failedModules,
        activeModules,
        moduleStates: { ...this.moduleStates }
      }
    };

    const message = `${nextProgress}% · ${this.message}`;
    const signature = JSON.stringify([this.stage, nextProgress, message, metadata.buildProgress]);
    if (signature === this.lastSignature) {
      return null;
    }
    this.lastSignature = signature;

    return {
      stage: this.stage,
      progress: nextProgress,
      message,
      metadata
    };
  }
}

function createPackageProgressTracker(services) {
  return new PackageProgressTracker(services);
}

module.exports = {
  createPackageProgressTracker
};
