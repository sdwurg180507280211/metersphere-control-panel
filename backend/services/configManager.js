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
      services: this._buildPersistedServices(currentRaw.services || {}, editableDraft.services || {})
    };

    const packageConfig = this._buildPersistedPackage(currentRaw.package, editableDraft.package || {});
    if (packageConfig === undefined) {
      delete persisted.package;
    } else {
      persisted.package = packageConfig;
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
          port: serviceDraft.port,
          healthCheckPort: serviceDraft.healthCheckPort,
          healthCheck: serviceDraft.healthCheck,
          startOrder: serviceDraft.startOrder
        };

        if (Object.prototype.hasOwnProperty.call(rawService, 'enabled') || serviceDraft.enabled === false || !currentServices[serviceId]) {
          nextService.enabled = serviceDraft.enabled !== false;
        } else {
          delete nextService.enabled;
        }

        return [serviceId, nextService];
      })
    );
  }

  _buildPersistedPackage(rawPackage, editablePackage) {
    const nextPackage = {
      ...(rawPackage || {}),
      ...(editablePackage || {})
    };

    Object.keys(nextPackage).forEach((key) => {
      const value = nextPackage[key];
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
      hotApplySupportedFields: ['projectRoot', 'services', 'package', 'maxLogLines']
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
    return this._clone(this.currentRawConfig);
  }

  getEditableConfig() {
    return this._clone(this.currentEditableConfig);
  }

  getRuntimeConfig() {
    const appliedRedis = this.appliedEditableConfig?.redis || {};
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
        PACKAGE_SCRIPT_PATH: process.env.PACKAGE_SCRIPT_PATH || null
      }
    });
  }

  getResolvedPreviewConfig() {
    return this._clone(this.currentResolvedConfig);
  }

  getResolvedConfig() {
    return this._clone(this.appliedResolvedConfig);
  }

  getMeta() {
    return this._clone(this._getMeta());
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
}

module.exports = new ConfigManager();
