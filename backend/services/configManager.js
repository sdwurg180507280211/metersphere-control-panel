const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const jobService = require('./jobService');
const configDiagnosticsService = require('./configDiagnosticsService');
const { createAppError } = require('../utils/errors');
const {
  CONFIG_PATH,
  loadConfigFromFile,
  normalizeEditableConfig,
  buildConfigSnapshot,
  buildResolvedConfig
} = require('../config');

const projectScannerService = require('./projectScannerService');

class ConfigManager {
  constructor() {
    this.configPath = CONFIG_PATH;
    this.currentRawConfig = null;
    this.currentEditableConfig = null;
    this.currentResolvedConfig = null;
    this.appliedEditableConfig = null;
    this.appliedResolvedConfig = null;
    this.lastLoadedAt = null;
    this.lastSavedAt = null;
    this.lastAppliedAt = null;
    this._initialize();
  }
  async scanProject(projectRoot) {
    const root = projectRoot || this.currentEditableConfig.projectRoot;
    if (!root) {
      throw createAppError(400, 'PROJECT_ROOT_MISSING', '项目根路径未配置');
    }

    console.log(`开始扫描项目: ${root}`);
    try {
      const scannedServices = await projectScannerService.scan(root);
      
      // 合并逻辑：如果当前配置中已存在同名服务，则以当前配置为准（保留用户已做的微调）
      const currentServices = this.currentEditableConfig.services || {};
      const mergedServices = { ...scannedServices };
      
      Object.keys(currentServices).forEach(id => {
        if (mergedServices[id]) {
          // 仅合并探测到的关键字段，如果不冲突则保留
          mergedServices[id] = {
            ...mergedServices[id],
            ...currentServices[id]
          };
        } else {
          // 即使没扫到，也保留用户手动定义的（可能是非标服务）
          mergedServices[id] = currentServices[id];
        }
      });

      return {
        projectRoot: root,
        scannedAt: new Date().toISOString(),
        services: mergedServices,
        count: Object.keys(mergedServices).length
      };
    } catch (error) {
      console.error(`扫描项目失败: ${error.message}`);
      throw createAppError(500, 'SCAN_FAILED', '项目扫描失败', { cause: error.message });
    }
  }

  _initialize() {
    const snapshot = this._readSnapshotFromDisk();
    this.currentRawConfig = snapshot.raw;
    this.currentEditableConfig = snapshot.editable;
    this.currentResolvedConfig = snapshot.resolved;
    this.appliedEditableConfig = this._clone(snapshot.editable);
    this.appliedResolvedConfig = this._clone(snapshot.resolved);
    this.lastLoadedAt = snapshot.loadedAt;
    this.lastAppliedAt = snapshot.loadedAt;
  }

  _clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  _deepFreeze(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    const frozen = Array.isArray(obj) ? [...obj] : { ...obj };
    for (const key of Object.keys(frozen)) {
      if (typeof frozen[key] === 'object' && frozen[key] !== null) {
        frozen[key] = this._deepFreeze(frozen[key]);
      }
    }
    return Object.freeze(frozen);
  }

  _readSnapshotFromDisk() {
    const raw = loadConfigFromFile(this.configPath);
    const snapshot = buildConfigSnapshot(raw);
    return {
      raw,
      editable: snapshot.editable,
      resolved: snapshot.resolved,
      loadedAt: new Date().toISOString()
    };
  }

  _reloadCurrentSnapshot() {
    const snapshot = this._readSnapshotFromDisk();
    this.currentRawConfig = snapshot.raw;
    this.currentEditableConfig = snapshot.editable;
    this.currentResolvedConfig = snapshot.resolved;
    this.lastLoadedAt = snapshot.loadedAt;
    return snapshot;
  }

  _buildPersistedRawConfig(editableDraft) {
    const currentRaw = this.currentRawConfig || {};
    const persisted = {
      ...currentRaw,
      port: editableDraft.port,
      projectRoot: editableDraft.projectRoot,
      maxLogLines: editableDraft.maxLogLines,
      redis: editableDraft.redis || currentRaw.redis,
      properties: editableDraft.properties || currentRaw.properties,
      claudeCode: editableDraft.claudeCode || currentRaw.claudeCode,
      sshTunnel: editableDraft.sshTunnel || currentRaw.sshTunnel,
      services: this._buildPersistedServices(currentRaw.services || {}, editableDraft.services || {})
    };

    // 只有当 npmPath 不是自动探测到的默认值时才保存
    const defaultNpm = require('../config').normalizeEditableConfig({ projectRoot: editableDraft.projectRoot }).npmPath;
    if (editableDraft.npmPath && editableDraft.npmPath !== defaultNpm) {
      persisted.npmPath = editableDraft.npmPath;
    } else {
      delete persisted.npmPath;
    }

    // 如果 sshTunnel 存在但是 ports 为空，删除整个字段使用默认值
    if (persisted.sshTunnel && (!persisted.sshTunnel.ports || persisted.sshTunnel.ports.length === 0)) {
      delete persisted.sshTunnel;
    }

    const packageConfig = this._buildPersistedPackage(currentRaw.package, editableDraft.package || {}, editableDraft.projectRoot);
    if (packageConfig === undefined) {
      delete persisted.package;
    } else {
      persisted.package = packageConfig;
    }

    // 清理冗余的默认路径配置
    if (persisted.properties) {
      const defaultProps = require('../config').normalizeEditableConfig({ projectRoot: editableDraft.projectRoot }).properties;
      if (persisted.properties.metersphere === defaultProps.metersphere) delete persisted.properties.metersphere;
      if (persisted.properties.redisson === defaultProps.redisson) delete persisted.properties.redisson;
      if (Object.keys(persisted.properties).length === 0) delete persisted.properties;
    }

    return persisted;
  }

  _buildPersistedServices(currentServices, editableServices) {
    return Object.fromEntries(
      Object.entries(editableServices).map(([serviceId, serviceDraft]) => {
        const rawService = currentServices[serviceId] || {};
        const nextService = {
          ...rawService,
          name: serviceDraft.name,
          pom: serviceDraft.pom,
          port: serviceDraft.port
        };

        // 仅保存非默认值
        if (serviceDraft.healthCheckPort && serviceDraft.healthCheckPort !== serviceDraft.port) {
          nextService.healthCheckPort = serviceDraft.healthCheckPort;
        } else {
          delete nextService.healthCheckPort;
        }

        if (serviceDraft.healthCheck && serviceDraft.healthCheck !== '/actuator/health') {
          nextService.healthCheck = serviceDraft.healthCheck;
        } else {
          delete nextService.healthCheck;
        }

        if (serviceDraft.startOrder && serviceDraft.startOrder !== 99) {
          nextService.startOrder = serviceDraft.startOrder;
        } else {
          delete nextService.startOrder;
        }

        if (Object.prototype.hasOwnProperty.call(rawService, 'enabled') || serviceDraft.enabled === false || !currentServices[serviceId]) {
          nextService.enabled = serviceDraft.enabled !== false;
        } else {
          delete nextService.enabled;
        }

        return [serviceId, nextService];
      })
    );
  }

  _buildPersistedPackage(rawPackage, editablePackage, projectRoot) {
    const nextPackage = {
      ...(rawPackage || {}),
      ...(editablePackage || {})
    };

    const defaultMaxJobs = require('../config').normalizeEditableConfig({ projectRoot }).package.maxJobs;

    Object.keys(nextPackage).forEach((key) => {
      const value = nextPackage[key];
      // 如果是默认值，则删除，保持 JSON 精简
      if (key === 'maxJobs' && value === defaultMaxJobs) {
        delete nextPackage[key];
        return;
      }
      if (key === 'parallelBuild' && value === true) {
        delete nextPackage[key];
        return;
      }
      if (key === 'buildOnly' && value === false) {
        delete nextPackage[key];
        return;
      }

      if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
        delete nextPackage[key];
      }
    });

    if (Object.keys(nextPackage).length === 0 && !rawPackage) {
      return undefined;
    }

    return nextPackage;
  }

  _writeFileAtomic(rawConfig) {
    const directory = path.dirname(this.configPath);
    const tempPath = path.join(directory, `${path.basename(this.configPath)}.tmp`);
    
    // 安全：写入前备份
    if (fs.existsSync(this.configPath)) {
      fs.copyFileSync(this.configPath, `${this.configPath}.bak`);
    }

    fs.writeFileSync(tempPath, `${JSON.stringify(rawConfig, null, 2)}\n`, 'utf8');
    fs.renameSync(tempPath, this.configPath);
  }

  _hasUnappliedChanges() {
    return JSON.stringify(this.currentEditableConfig) !== JSON.stringify(this.appliedEditableConfig);
  }

  _getMeta() {
    return {
      configPath: this.configPath,
      lastLoadedAt: this.lastLoadedAt,
      lastSavedAt: this.lastSavedAt,
      lastAppliedAt: this.lastAppliedAt,
      hasUnappliedChanges: this._hasUnappliedChanges(),
      requiresRestartFields: ['port'],
      hotApplySupportedFields: ['projectRoot', 'services', 'package', 'maxLogLines', 'properties', 'claudeCode', 'sshTunnel']
    };
  }

  _getBlockingFieldScopes(changedPaths = []) {
    return {
      touchesProjectRoot: changedPaths.includes('projectRoot'),
      touchesServices: changedPaths.includes('services'),
      touchesPackage: changedPaths.some((item) => item === 'package' || item.startsWith('package.')),
      touchesPort: changedPaths.includes('port')
    };
  }

  async _assertApplyAllowed(changedPaths = []) {
    const scopes = this._getBlockingFieldScopes(changedPaths);
    const activeJobs = (await jobService.getActiveJobs()).filter((job) => ['pending', 'running'].includes(job.status));
    const blockingJobs = activeJobs.filter((job) => {
      if (job.type.startsWith('service.')) {
        return scopes.touchesProjectRoot || scopes.touchesServices;
      }

      if (job.type.startsWith('frontend.build')) {
        return scopes.touchesProjectRoot || scopes.touchesServices;
      }

      if (job.type === 'package.run') {
        return scopes.touchesProjectRoot || scopes.touchesPackage;
      }

      return false;
    });

    if (blockingJobs.length > 0) {
      throw createAppError(409, 'CONFIG_APPLY_BLOCKED', '存在运行中的任务，当前配置无法应用', {
        changedPaths,
        blockingJobs: blockingJobs.map((job) => ({
          jobId: job.jobId,
          type: job.type,
          targetId: job.targetId,
          message: job.message,
          status: job.status
        }))
      });
    }
  }

  _refreshRuntimeConsumers() {
    logger.updateOptions({ maxLogLines: this.appliedResolvedConfig.maxLogLines });
    return ['configManager', 'validator', 'processManager', 'healthChecker', 'buildControllerDeps', 'packageTaskService', 'logger'];
  }

  getRawConfig() {
    return this._deepFreeze(this.currentRawConfig);
  }

  getEditableConfig() {
    return this._clone(this.currentEditableConfig);
  }

  getRuntimeConfig() {
    const appliedRedis = this.appliedEditableConfig?.redis || {};
    const appliedClaudeCode = this.appliedEditableConfig?.claudeCode || {};
    return this._clone({
      cache: {
        configuredMode: process.env.MS_CACHE_MODE || appliedRedis.mode || 'memory',
        keyPrefix: process.env.MS_CACHE_KEY_PREFIX || 'ms-panel:'
      },
      redis: {
        host: process.env.MS_REDIS_HOST || appliedRedis.host || null,
        port: process.env.MS_REDIS_PORT || appliedRedis.port || null,
        db: process.env.MS_REDIS_DB || appliedRedis.db || '0',
        propertiesPath: process.env.MS_PROPERTIES_PATH || '/opt/metersphere/conf/metersphere.properties'
      },
      job: {
        redisRequired: process.env.MS_JOB_REDIS_REQUIRED || 'auto',
        rateLimitWindowSeconds: process.env.MS_JOB_RATE_LIMIT_WINDOW_SECONDS || '30',
        redisRetryTimes: process.env.MS_JOB_REDIS_RETRY_TIMES || '2',
        redisRetryDelayMs: process.env.MS_JOB_REDIS_RETRY_DELAY_MS || '500'
      },
      timeouts: {
        healthTimeoutMs: process.env.MS_SERVICE_HEALTH_TIMEOUT_MS || '120000',
        startTimeoutMs: process.env.MS_SERVICE_START_TIMEOUT_MS || '60000',
        stopTimeoutMs: process.env.MS_SERVICE_STOP_TIMEOUT_MS || '60000',
        compileTimeoutMs: process.env.MS_SERVICE_COMPILE_TIMEOUT_MS || '600000',
        reloadTimeoutMs: process.env.MS_SERVICE_RELOAD_TOTAL_TIMEOUT_MS || '480000'
      },
      envOverrides: {
        MS_CACHE_MODE: process.env.MS_CACHE_MODE || null,
        MS_REDIS_HOST: process.env.MS_REDIS_HOST || null,
        MS_REDIS_PORT: process.env.MS_REDIS_PORT || null,
        MS_REDIS_DB: process.env.MS_REDIS_DB || null,
        MS_PROPERTIES_PATH: process.env.MS_PROPERTIES_PATH || null,
        MS_PACKAGE_SCRIPT_PATH: process.env.MS_PACKAGE_SCRIPT_PATH || null,
        PACKAGE_SCRIPT_PATH: process.env.PACKAGE_SCRIPT_PATH || null,
        ANTHROPIC_BASE_URL: appliedClaudeCode.baseUrl || null,
        ANTHROPIC_AUTH_TOKEN: appliedClaudeCode.authToken || null,
        ANTHROPIC_MODEL: appliedClaudeCode.model || null,
        ANTHROPIC_SMALL_FAST_MODEL: appliedClaudeCode.smallFastModel || null
      }
    });
  }

  getResolvedPreviewConfig() {
    return this._deepFreeze(this.currentResolvedConfig);
  }

  getResolvedConfig() {
    return this._deepFreeze(this.appliedResolvedConfig);
  }

  getMeta() {
    return this._deepFreeze(this._getMeta());
  }

  getConfigPageData() {
    const resolvedPreview = buildResolvedConfig(this.currentEditableConfig, {
      allowProjectRootFallback: true,
      onlyFallbackForDefault: true
    });
    const diagnosticsResult = configDiagnosticsService.runDiagnostics(this.currentEditableConfig, {
      resolvedConfig: resolvedPreview,
      baselineEditable: this.appliedEditableConfig
    });

    return {
      editable: this.getEditableConfig(),
      runtime: this.getRuntimeConfig(),
      resolved: {
        ...resolvedPreview,
        packageScriptCandidates: diagnosticsResult.diagnostics.packageScript?.candidates || []
      },
      diagnostics: diagnosticsResult.diagnostics,
      meta: this.getMeta(),
      validation: {
        valid: diagnosticsResult.valid,
        errors: diagnosticsResult.errors,
        warnings: diagnosticsResult.warnings
      },
      applyImpact: diagnosticsResult.applyImpact
    };
  }

  validateDraft(draft) {
    const normalizedDraft = normalizeEditableConfig(draft || {});
    const resolvedDraft = buildResolvedConfig(normalizedDraft, {
      allowProjectRootFallback: true,
      onlyFallbackForDefault: true
    });
    const diagnosticsResult = configDiagnosticsService.runDiagnostics(normalizedDraft, {
      resolvedConfig: resolvedDraft,
      baselineEditable: this.appliedEditableConfig
    });

    return {
      valid: diagnosticsResult.valid,
      errors: diagnosticsResult.errors,
      warnings: diagnosticsResult.warnings,
      normalizedDraft,
      resolved: resolvedDraft,
      diagnostics: diagnosticsResult.diagnostics,
      applyImpact: diagnosticsResult.applyImpact
    };
  }

  saveDraft(draft) {
    const validation = this.validateDraft(draft);
    if (!validation.valid) {
      throw createAppError(400, 'CONFIG_INVALID', '配置校验失败', {
        errors: validation.errors,
        warnings: validation.warnings,
        resolved: validation.resolved,
        diagnostics: validation.diagnostics,
        applyImpact: validation.applyImpact
      });
    }

    try {
      const persistedRawConfig = this._buildPersistedRawConfig(validation.normalizedDraft);
      this._writeFileAtomic(persistedRawConfig);
      const snapshot = this._reloadCurrentSnapshot();
      this.lastSavedAt = new Date().toISOString();

      const diagnosticsResult = configDiagnosticsService.runDiagnostics(snapshot.editable, {
        resolvedConfig: snapshot.resolved,
        baselineEditable: this.appliedEditableConfig
      });

      return {
        editable: this.getEditableConfig(),
        runtime: this.getRuntimeConfig(),
        resolved: {
        ...this.getResolvedPreviewConfig(),
        packageScriptCandidates: diagnosticsResult.diagnostics.packageScript?.candidates || []
      },
        diagnostics: diagnosticsResult.diagnostics,
        meta: this.getMeta(),
        validation: {
          valid: diagnosticsResult.valid,
          errors: diagnosticsResult.errors,
          warnings: diagnosticsResult.warnings
        },
        applyImpact: diagnosticsResult.applyImpact
      };
    } catch (error) {
      if (error.code) {
        throw error;
      }

      throw createAppError(500, 'CONFIG_SAVE_FAILED', '写入配置文件失败', {
        cause: error.message
      });
    }
  }

  async applyConfig() {
    const resolvedPreview = buildResolvedConfig(this.currentEditableConfig, {
      allowProjectRootFallback: true,
      onlyFallbackForDefault: true
    });
    const diagnosticsResult = configDiagnosticsService.runDiagnostics(this.currentEditableConfig, {
      resolvedConfig: resolvedPreview,
      baselineEditable: this.appliedEditableConfig
    });

    if (!diagnosticsResult.valid) {
      throw createAppError(400, 'CONFIG_INVALID', '配置校验失败，无法应用', {
        errors: diagnosticsResult.errors,
        warnings: diagnosticsResult.warnings,
        diagnostics: diagnosticsResult.diagnostics,
        applyImpact: diagnosticsResult.applyImpact
      });
    }

    await this._assertApplyAllowed(diagnosticsResult.applyImpact.changedPaths);

    this.appliedEditableConfig = this._clone(this.currentEditableConfig);
    this.appliedResolvedConfig = this._clone(this.currentResolvedConfig);
    this.lastAppliedAt = new Date().toISOString();

    const refreshedDomains = this._refreshRuntimeConsumers();
    const requiresRestart = diagnosticsResult.applyImpact.requiresRestart;
    const warnings = [];

    if (requiresRestart.length > 0) {
      warnings.push('部分字段需要重启控制面板后才能完全生效');
    }

    return {
      applied: true,
      refreshedDomains,
      requiresRestart,
      warnings,
      meta: this.getMeta()
    };
  }

  refreshDiagnostics() {
    const resolvedPreview = buildResolvedConfig(this.currentEditableConfig, {
      allowProjectRootFallback: true,
      onlyFallbackForDefault: true
    });
    const diagnosticsResult = configDiagnosticsService.runDiagnostics(this.currentEditableConfig, {
      resolvedConfig: resolvedPreview,
      baselineEditable: this.appliedEditableConfig
    });

    return {
      resolved: {
        ...resolvedPreview,
        packageScriptCandidates: diagnosticsResult.diagnostics.packageScript?.candidates || []
      },
      diagnostics: diagnosticsResult.diagnostics,
      validation: {
        valid: diagnosticsResult.valid,
        errors: diagnosticsResult.errors,
        warnings: diagnosticsResult.warnings
      },
      applyImpact: diagnosticsResult.applyImpact,
      meta: this.getMeta()
    };
  }

  getPropertiesFile(filename) {
    if (!['metersphere.properties', 'redisson.yml'].includes(filename)) {
      throw createAppError(400, 'INVALID_FILENAME', '不支持的配置文件');
    }
    const propKey = filename === 'metersphere.properties' ? 'metersphere' : 'redisson';
    const filePath = this.currentEditableConfig?.properties?.[propKey] || `/opt/metersphere/conf/${filename}`;
    
    if (!fs.existsSync(filePath)) {
      throw createAppError(404, 'FILE_NOT_FOUND', `配置文件不存在，请检查路径: ${filePath}`);
    }
    return fs.readFileSync(filePath, 'utf8');
  }

  savePropertiesFile(filename, content) {
    if (!['metersphere.properties', 'redisson.yml'].includes(filename)) {
      throw createAppError(400, 'INVALID_FILENAME', '不支持的配置文件');
    }
    const propKey = filename === 'metersphere.properties' ? 'metersphere' : 'redisson';
    const filePath = this.currentEditableConfig?.properties?.[propKey] || `/opt/metersphere/conf/${filename}`;
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
      throw createAppError(404, 'DIR_NOT_FOUND', `配置目录不存在，无法保存: ${dir}`);
    }

    fs.writeFileSync(filePath, content || '', 'utf8');
  }

  getPropertiesFilePath(filename) {
    if (!['metersphere.properties', 'redisson.yml'].includes(filename)) {
      throw createAppError(400, 'INVALID_FILENAME', '不支持的配置文件');
    }
    const propKey = filename === 'metersphere.properties' ? 'metersphere' : 'redisson';
    return this.currentEditableConfig?.properties?.[propKey] || `/opt/metersphere/conf/${filename}`;
  }
}

module.exports = new ConfigManager();
