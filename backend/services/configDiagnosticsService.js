const fs = require('fs');
const path = require('path');
const os = require('os');
const cacheService = require('./cacheService');
const redisConfig = require('../config/redis');
const packageConfig = require('../config/package');
const {
  DEFAULT_HEALTH_CHECK,
  normalizeEditableConfig,
  buildResolvedConfig
} = require('../config');

class ConfigDiagnosticsService {
  runDiagnostics(editableConfig, options = {}) {
    const normalizedEditable = normalizeEditableConfig(editableConfig);
    const resolvedConfig = options.resolvedConfig || buildResolvedConfig(normalizedEditable);
    const baselineEditable = options.baselineEditable || null;
    const errors = [];
    const warnings = [];

    const diagnostics = {
      projectRoot: this._buildProjectRootDiagnostics(normalizedEditable, resolvedConfig, errors),
      services: [],
      ports: [],
      packageScript: null,
      redis: this._buildRedisDiagnostics(),
      runtime: this._buildRuntimeDiagnostics()
    };

    this._validateGeneralConfig(normalizedEditable, errors, warnings);
    diagnostics.npmPath = this._buildNpmPathDiagnostics(normalizedEditable, errors, warnings);
    diagnostics.services = this._buildServiceDiagnostics(normalizedEditable, resolvedConfig, diagnostics.ports, errors, warnings);
    diagnostics.packageScript = this._buildPackageDiagnostics(resolvedConfig, errors, warnings);
    diagnostics.sdkBuild = this._buildSdkBuildDiagnostics(normalizedEditable, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      diagnostics,
      applyImpact: this._buildApplyImpact(baselineEditable, normalizedEditable)
    };
  }

  _pushIssue(target, type, issue) {
    target.push(issue);
  }

  _createIssue(type, pathName, message, details = {}) {
    return {
      type,
      path: pathName,
      message,
      details
    };
  }

  _validateGeneralConfig(editableConfig, errors, warnings) {
    if (!this._isValidPort(editableConfig.port)) {
      errors.push(this._createIssue('error', 'port', '控制面板端口必须是 1-65535 之间的整数', { port: editableConfig.port }));
    }

    const maxLogLines = Number.parseInt(editableConfig.maxLogLines, 10);
    if (!Number.isInteger(maxLogLines) || maxLogLines <= 0) {
      errors.push(this._createIssue('error', 'maxLogLines', '日志最大行数必须是正整数', { maxLogLines: editableConfig.maxLogLines }));
    }

    if (editableConfig.package && editableConfig.package.maxJobs !== undefined && editableConfig.package.maxJobs !== null && editableConfig.package.maxJobs !== '') {
      const maxJobs = Number.parseInt(editableConfig.package.maxJobs, 10);
      if (!Number.isInteger(maxJobs) || maxJobs <= 0 || maxJobs > 64) {
        errors.push(this._createIssue('error', 'package.maxJobs', '打包最大线程数必须是 1-64 之间的整数', { maxJobs: editableConfig.package.maxJobs }));
      }
    }

    const defaultServices = editableConfig.package?.defaultServices;
    if (Array.isArray(defaultServices)) {
      const allowedServices = packageConfig.getPackageServiceIds(editableConfig.services || {});
      const invalidServices = defaultServices.filter((item) => !allowedServices.includes(item));
      if (invalidServices.length > 0) {
        errors.push(this._createIssue('error', 'package.defaultServices', '默认打包服务包含无效项', { invalidServices, allowedServices }));
      }
    }
  }

  _buildProjectRootDiagnostics(editableConfig, resolvedConfig, errors) {
    const resolvedPath = resolvedConfig.projectRoot;
    const exists = fs.existsSync(resolvedPath);
    const mavenWrapperPath = path.join(resolvedPath, 'mvnw');
    const hasMavenWrapper = fs.existsSync(mavenWrapperPath);
    const matchedPomCount = Object.values(editableConfig.services).filter((service) => (
      service.pom && fs.existsSync(path.join(resolvedPath, service.pom))
    )).length;
    const valid = exists && hasMavenWrapper && matchedPomCount > 0;

    if (!exists) {
      if (resolvedPath) {
        this._pushIssue(errors, 'error', this._createIssue('error', 'projectRoot', '项目根目录不存在', {
          resolvedPath
        }));
      }
    } else if (!hasMavenWrapper) {
      this._pushIssue(errors, 'error', this._createIssue('error', 'projectRoot', '项目根目录缺少 mvnw，可执行项目识别失败', {
        resolvedPath,
        mavenWrapperPath
      }));
    } else if (Object.keys(editableConfig.services || {}).length > 0 && matchedPomCount === 0) {
      // 只有在配置了服务但全都没匹配上时，才报真正的红色错误
      this._pushIssue(errors, 'error', this._createIssue('error', 'projectRoot', '项目根目录下未匹配到任何已配置服务的 pom.xml', {
        resolvedPath
      }));
    } else if (Object.keys(editableConfig.services || {}).length === 0) {
      // 如果根本没有配置任何服务，不用阻塞，只当作普通提示即可
    }

    return {
      valid,
      input: editableConfig.projectRoot,
      resolvedPath,
      exists,
      hasMavenWrapper,
      matchedPomCount,
      source: path.isAbsolute(editableConfig.projectRoot) ? 'absolute-path' : 'control-panel-relative'
    };
  }

  _buildNpmPathDiagnostics(editableConfig, errors, warnings) {
    const npmPath = editableConfig.npmPath;
    if (!npmPath) {
      return {
        valid: true,
        input: '',
        exists: false,
        executable: false,
        source: 'auto-detect'
      };
    }

    const exists = fs.existsSync(npmPath);
    let executable = false;

    if (exists) {
      try {
        const stat = fs.statSync(npmPath);
        if (stat.isFile()) {
          fs.accessSync(npmPath, fs.constants.X_OK);
          executable = true;
        }
      } catch (error) {
        executable = false;
      }
    }

    if (!exists) {
      errors.push(this._createIssue('error', 'npmPath', '指定的 npm 路径不存在', { npmPath }));
    } else if (!executable) {
      errors.push(this._createIssue('error', 'npmPath', '指定的 npm 路径不可执行', { npmPath }));
    }

    return {
      valid: exists && executable,
      input: npmPath,
      exists,
      executable,
      source: 'manual-config'
    };
  }

  _buildServiceDiagnostics(editableConfig, resolvedConfig, portDiagnostics, errors, warnings) {
    const portOwners = new Map();
    const services = Object.entries(editableConfig.services);
    const diagnostics = [];

    this._trackPort(portOwners, portDiagnostics, 'port', 'controlPanel', '控制面板', editableConfig.port, 'port');

    for (const [serviceId, service] of services) {
      const serviceIssues = [];
      const serviceWarnings = [];
      const pomPath = service.pom ? path.join(resolvedConfig.projectRoot, service.pom) : null;
      const pomExists = Boolean(pomPath && fs.existsSync(pomPath));

      if (!service.name) {
        const issue = this._createIssue('error', `services.${serviceId}.name`, '服务名称不能为空');
        serviceIssues.push(issue);
        errors.push(issue);
      }

      if (!service.pom) {
        const issue = this._createIssue('error', `services.${serviceId}.pom`, '服务 pom 路径不能为空');
        serviceIssues.push(issue);
        errors.push(issue);
      } else if (!pomExists) {
        const issue = this._createIssue('error', `services.${serviceId}.pom`, '服务 pom 文件不存在', {
          pomPath
        });
        serviceIssues.push(issue);
        errors.push(issue);
      }

      if (!this._isValidPort(service.port)) {
        const issue = this._createIssue('error', `services.${serviceId}.port`, '服务端口必须是 1-65535 之间的整数', {
          port: service.port
        });
        serviceIssues.push(issue);
        errors.push(issue);
      } else {
        this._trackPort(portOwners, portDiagnostics, 'servicePort', serviceId, service.name, service.port, `services.${serviceId}.port`);
      }

      if (!this._isValidPort(service.healthCheckPort)) {
        const issue = this._createIssue('error', `services.${serviceId}.healthCheckPort`, '健康检查端口必须是 1-65535 之间的整数', {
          healthCheckPort: service.healthCheckPort
        });
        serviceIssues.push(issue);
        errors.push(issue);
      } else {
        this._trackPort(portOwners, portDiagnostics, 'healthCheckPort', serviceId, service.name, service.healthCheckPort, `services.${serviceId}.healthCheckPort`);
      }

      const startOrder = Number.parseInt(service.startOrder, 10);
      if (!Number.isInteger(startOrder) || startOrder < 0) {
        const issue = this._createIssue('error', `services.${serviceId}.startOrder`, '启动顺序必须是大于等于 0 的整数', {
          startOrder: service.startOrder
        });
        serviceIssues.push(issue);
        errors.push(issue);
      }

      if (!service.healthCheck || !String(service.healthCheck).startsWith('/')) {
        const issue = this._createIssue('error', `services.${serviceId}.healthCheck`, '健康检查路径必须以 / 开头', {
          healthCheck: service.healthCheck
        });
        serviceIssues.push(issue);
        errors.push(issue);
      } else if (service.healthCheck === DEFAULT_HEALTH_CHECK && service.healthCheckPort === service.port) {
        const warning = this._createIssue('warning', `services.${serviceId}.healthCheck`, '当前健康检查配置使用默认值');
        serviceWarnings.push(warning);
        warnings.push(warning);
      }

      diagnostics.push({
        serviceId,
        name: service.name,
        enabled: service.enabled !== false,
        pom: service.pom,
        pomPath,
        pomExists,
        port: service.port,
        healthCheckPort: service.healthCheckPort,
        healthCheck: service.healthCheck,
        startOrder: service.startOrder,
        valid: serviceIssues.length === 0,
        errors: serviceIssues,
        warnings: serviceWarnings
      });
    }

    for (const entry of portDiagnostics) {
      if (!entry.duplicate) {
        continue;
      }

      for (const owner of entry.owners) {
        const issue = this._createIssue('error', owner.path || `${owner.kind}.${owner.id}`, `端口 ${entry.port} 与其他配置重复`, {
          port: entry.port,
          owners: entry.owners
        });
        errors.push(issue);

        const serviceDiagnostic = diagnostics.find((item) => item.serviceId === owner.id);
        if (serviceDiagnostic) {
          serviceDiagnostic.errors.push(issue);
          serviceDiagnostic.valid = false;
        }
      }
    }

    return diagnostics;
  }

  _trackPort(portOwners, portDiagnostics, kind, id, name, port, pathName = null) {
    const key = String(port);
    const owners = portOwners.get(key) || [];
    owners.push({ kind, id, name, path: pathName });
    portOwners.set(key, owners);

    const existing = portDiagnostics.find((item) => item.port === port);
    if (existing) {
      existing.owners = owners;
      existing.duplicate = owners.length > 1;
      return;
    }

    portDiagnostics.push({
      port,
      owners,
      duplicate: owners.length > 1
    });
  }

  _buildPackageDiagnostics(resolvedConfig, errors, warnings) {
    const detailedCandidates = packageConfig.getDetailedPackageScriptCandidates({ resolvedConfig })
      .map((item) => ({
        ...item,
        resolvedPath: path.resolve(item.path),
        exists: fs.existsSync(path.resolve(item.path))
      }));

    const matched = detailedCandidates.find((item) => item.exists) || null;
    let executable = false;

    if (matched) {
      try {
        const stat = fs.statSync(matched.resolvedPath);
        if (stat.isFile()) {
          fs.accessSync(matched.resolvedPath, fs.constants.X_OK);
          executable = true;
        }
      } catch (error) {
        executable = false;
      }
    }

    if (!matched) {
      const issue = this._createIssue('error', 'package.scriptPath', '未找到可用的打包脚本', {
        candidates: detailedCandidates
      });
      errors.push(issue);
    } else if (!executable) {
      const issue = this._createIssue('error', 'package.scriptPath', '打包脚本存在但不可执行', {
        scriptPath: matched.resolvedPath
      });
      errors.push(issue);
    } else if (matched.source !== 'config:package.scriptPath') {
      const warning = this._createIssue('warning', 'package.scriptPath', '当前打包脚本来自环境变量或自动探测结果');
      warnings.push(warning);
    }

    return {
      valid: Boolean(matched && executable),
      configuredPath: resolvedConfig.package?.scriptPath || '',
      resolvedPath: matched?.resolvedPath || null,
      source: matched?.source || null,
      executable,
      candidates: detailedCandidates
    };
  }

  _buildRedisDiagnostics() {
    const redisState = cacheService.getRedisState();

    return {
      configured: redisState.configured,
      ready: redisState.ready,
      activeMode: redisState.mode,
      connection: redisState.connected ? 'connected' : 'degraded',
      host: redisConfig.host,
      port: redisConfig.port,
      db: redisConfig.db,
      keyPrefix: redisConfig.keyPrefix,
      propertiesPath: redisConfig.propertiesPath,
      source: {
        mode: process.env.MS_CACHE_MODE ? 'env:MS_CACHE_MODE' : 'default',
        host: process.env.MS_REDIS_HOST ? 'env:MS_REDIS_HOST' : 'properties/default',
        port: process.env.MS_REDIS_PORT ? 'env:MS_REDIS_PORT' : 'properties/default'
      }
    };
  }

  _buildRuntimeDiagnostics() {
    return {
      cacheMode: process.env.MS_CACHE_MODE || 'memory',
      packageScriptEnv: process.env.MS_PACKAGE_SCRIPT_PATH || process.env.PACKAGE_SCRIPT_PATH || null,
      propertiesPath: process.env.MS_PROPERTIES_PATH || redisConfig.propertiesPath
    };
  }

  _buildApplyImpact(previousEditable, nextEditable) {
    const changedPaths = this._collectChangedPaths(previousEditable, nextEditable);
    return {
      changedPaths,
      hotApply: changedPaths.filter((item) => this._isHotApplyField(item)),
      requiresRestart: changedPaths.filter((item) => this._requiresRestart(item))
    };
  }

  _collectChangedPaths(previousEditable, nextEditable) {
    if (!previousEditable) {
      return [];
    }

    const previous = normalizeEditableConfig(previousEditable);
    const next = normalizeEditableConfig(nextEditable);
    const paths = [];

    const walk = (prevValue, nextValue, currentPath) => {
      if (JSON.stringify(prevValue) === JSON.stringify(nextValue)) {
        return;
      }

      const prevIsObject = prevValue && typeof prevValue === 'object' && !Array.isArray(prevValue);
      const nextIsObject = nextValue && typeof nextValue === 'object' && !Array.isArray(nextValue);

      if (!prevIsObject || !nextIsObject) {
        paths.push(currentPath);
        return;
      }

      const keys = new Set([...Object.keys(prevValue), ...Object.keys(nextValue)]);
      for (const key of keys) {
        walk(prevValue[key], nextValue[key], currentPath ? `${currentPath}.${key}` : key);
      }
    };

    walk(previous, next, '');
    return [...new Set(paths.filter(Boolean).map((item) => item.split('.')[0] === 'services' ? 'services' : item))];
  }

  _isHotApplyField(pathName) {
    return pathName === 'projectRoot'
      || pathName === 'services'
      || pathName === 'maxLogLines'
      || pathName === 'jvmOptions'
      || pathName.startsWith('package');
  }

  _requiresRestart(pathName) {
    return pathName === 'port';
  }

  _buildSdkBuildDiagnostics(editableConfig, warnings) {
    const projectRoot = editableConfig.projectRoot;
    const m2Dir = path.join(os.homedir(), '.m2', 'repository', 'io', 'metersphere');

    let sdkInstalled = false;
    let sdkVersion = null;
    let sdkArtifactPath = null;

    if (fs.existsSync(m2Dir)) {
      const frameworkDir = path.join(m2Dir, 'framework');
      if (fs.existsSync(frameworkDir)) {
        try {
          const versions = fs.readdirSync(frameworkDir)
            .filter(v => fs.existsSync(path.join(frameworkDir, v, `framework-${v}.pom`)));
          if (versions.length > 0) {
            sdkInstalled = true;
            sdkVersion = versions[versions.length - 1];
            sdkArtifactPath = path.join(frameworkDir, sdkVersion);
          }
        } catch (err) {
          // ignore read errors
        }
      }

      // Also check for sdk directory
      if (!sdkInstalled) {
        const sdkDir = path.join(m2Dir, 'sdk');
        if (fs.existsSync(sdkDir)) {
          try {
            const versions = fs.readdirSync(sdkDir)
              .filter(v => fs.existsSync(path.join(sdkDir, v)));
            if (versions.length > 0) {
              sdkInstalled = true;
              sdkVersion = versions[versions.length - 1];
              sdkArtifactPath = path.join(sdkDir, sdkVersion);
            }
          } catch (err) {
            // ignore read errors
          }
        }
      }
    }

    const sdkSourcePath = projectRoot ? path.join(projectRoot, 'framework', 'sdk-parent', 'pom.xml') : null;
    const sdkSourceExists = sdkSourcePath ? fs.existsSync(sdkSourcePath) : false;

    if (!sdkInstalled && sdkSourceExists) {
      warnings.push(this._createIssue('warning', 'sdk.build',
        'SDK (framework) 未安装到本地 Maven 仓库，首次启动服务可能失败', {
          suggestion: '运行 mvn install -pl framework/sdk-parent -DskipTests',
          m2Dir,
          sdkSourcePath
        }));
    }

    return {
      installed: sdkInstalled,
      version: sdkVersion,
      artifactPath: sdkArtifactPath,
      sourceExists: sdkSourceExists,
      sourcePath: sdkSourcePath,
      m2Dir
    };
  }

  _isValidPort(port) {
    const value = Number.parseInt(port, 10);
    return Number.isInteger(value) && value > 0 && value <= 65535;
  }
}

module.exports = new ConfigDiagnosticsService();
