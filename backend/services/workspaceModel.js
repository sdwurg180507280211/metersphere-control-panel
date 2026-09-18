const SEVERITY_WEIGHT = { blocker: 0, error: 1, warning: 2 };

function toCatalog(resolved = {}) {
  if (Array.isArray(resolved.serviceCatalog)) return resolved.serviceCatalog;
  return Object.entries(resolved.services || {}).map(([id, service]) => ({
    id,
    name: service.name || id,
    ...service
  }));
}

function safeError(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.message || value.error || String(value);
}

function buildProblems({ infrastructure = {}, services = [], validation = {} } = {}) {
  const problems = [];

  for (const key of ['mysql', 'redis', 'kafka']) {
    const item = infrastructure[key];
    if (!item) continue;

    if (item.reachable === false) {
      problems.push({
        id: 'infra:' + key,
        source: 'infrastructure',
        severity: 'blocker',
        title: (item.name || key) + ' 不可连接',
        message: 'MeterSphere 开发环境依赖 ' + (item.name || key) + '，当前无法连接到 ' + item.host + ':' + item.port + '。',
        details: item.error || null,
        action: { type: 'navigate', tab: 'services', label: '检查基础设施' }
      });
    } else if (item.confMissing) {
      problems.push({
        id: 'infra-config:' + key,
        source: 'configuration',
        severity: 'warning',
        title: (item.name || key) + ' 使用默认连接信息',
        message: '未找到完整的 MeterSphere 配置文件，基础设施检测正在使用默认地址。',
        action: { type: 'navigate', tab: 'config', label: '检查配置' }
      });
    }
  }

  for (const service of services) {
    if (service.phase === 'failed' || service.error) {
      problems.push({
        id: 'service:' + service.id,
        source: 'service',
        severity: 'error',
        title: service.name + ' 启动异常',
        message: safeError(service.error) || '服务进入失败状态，请查看服务日志和依赖状态。',
        action: { type: 'navigate', tab: 'services', label: '查看服务' }
      });
      continue;
    }

    if (service.running && service.health?.healthy === false) {
      problems.push({
        id: 'health:' + service.id,
        source: 'health',
        severity: 'error',
        title: service.name + ' 健康检查失败',
        message: service.health.error || '服务进程存在，但健康检查未通过。',
        details: service.health.failureCode || null,
        action: { type: 'navigate', tab: 'services', label: '查看服务日志' }
      });
    }
  }

  for (const [index, item] of (validation.errors || []).entries()) {
    problems.push({
      id: 'config-error:' + index + ':' + (item.path || 'unknown'),
      source: 'configuration',
      severity: 'error',
      title: '项目配置需要修复',
      message: item.message || String(item),
      details: item.path || null,
      action: { type: 'navigate', tab: 'config', label: '打开项目配置' }
    });
  }

  for (const [index, item] of (validation.warnings || []).entries()) {
    problems.push({
      id: 'config-warning:' + index + ':' + (item.path || 'unknown'),
      source: 'configuration',
      severity: 'warning',
      title: '项目配置提醒',
      message: item.message || String(item),
      details: item.path || null,
      action: { type: 'navigate', tab: 'config', label: '检查项目配置' }
    });
  }

  return problems.sort((left, right) => (
    (SEVERITY_WEIGHT[left.severity] ?? 9) - (SEVERITY_WEIGHT[right.severity] ?? 9)
  ));
}

module.exports = { toCatalog, buildProblems };
