/**
 * 只读依赖视图，不参与启停决策，不从 startOrder 推断依赖。
 * 当前仅有 MeterSphere 的 Eureka/Gateway 预设；预设不是项目扫描结论。
 */
const TRANSITIONAL_PHASES = new Set(['starting', 'checking_health', 'stopping', 'restarting', 'compiling', 'reloading']);
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (record, key) => isRecord(record) && Object.hasOwn(record, key) ? record[key] : undefined;
const booleanOrNull = (value) => typeof value === 'boolean' ? value : null;

class DependencyService {
  constructor() {
    this.defaultDependencies = Object.freeze({
      eureka: Object.freeze({ dependsOn: Object.freeze([]), role: 'service-registry', startOrder: 10 }),
      gateway: Object.freeze({ dependsOn: Object.freeze(['eureka']), role: 'gateway', startOrder: 20 })
    });
  }

  build(services = {}) {
    return Object.entries(isRecord(services) ? services : {})
      .filter(([, service]) => isRecord(service))
      .map(([id, service]) => {
        const preset = own(this.defaultDependencies, id);
        const startOrder = Number(service.startOrder ?? preset?.startOrder ?? 99);
        return {
          id,
          name: service.name || id,
          dependsOn: [...(preset?.dependsOn || [])],
          role: preset?.role || 'application-service',
          startOrder: Number.isFinite(startOrder) ? startOrder : 99,
          source: preset ? 'preset' : 'none'
        };
      }).sort((a, b) => a.startOrder - b.startOrder);
  }

  getDependencies(serviceId, services = {}) {
    return this.build(services).find((item) => item.id === serviceId) || {
      id: serviceId,
      dependsOn: [],
      source: 'none'
    };
  }

  _observe(dependencyId, services, statuses) {
    const service = own(services, dependencyId);
    const rawStatus = own(statuses, dependencyId);
    const status = typeof rawStatus === 'boolean' ? { running: rawStatus } : isRecord(rawStatus) ? rawStatus : {};
    const running = booleanOrNull(status.running);
    const healthy = booleanOrNull(status.health?.healthy);
    const phase = typeof status.phase === 'string' ? status.phase : null;
    let available = null;
    let reason = 'STATUS_UNKNOWN';

    // 未在本地配置或被禁用，不代表远程依赖一定不可用。
    if (!isRecord(service)) {
      reason = 'NOT_CONFIGURED';
    } else if (service.enabled === false) {
      reason = 'DISABLED';
    } else if (status.portOccupied === true) {
      available = false;
      reason = 'PORT_OCCUPIED';
    } else if (phase === 'failed' || status.error) {
      available = false;
      reason = 'SERVICE_FAILED';
    } else if (TRANSITIONAL_PHASES.has(phase)) {
      available = false;
      reason = 'TRANSITIONING';
    } else if (phase === 'stopped' || running === false || status.processAlive === false) {
      available = false;
      reason = 'NOT_RUNNING';
    } else if (healthy === false) {
      available = false;
      reason = 'UNHEALTHY';
    } else if (phase && phase !== 'running') {
      reason = 'PHASE_UNKNOWN';
    } else if (running === true) {
      available = healthy === true ? true : null;
      reason = healthy === true ? null : 'HEALTH_UNKNOWN';
    }

    return {
      id: dependencyId,
      name: service?.name || dependencyId,
      running,
      healthy,
      phase,
      checkedAt: typeof status.health?.checkedAt === 'string' ? status.health.checkedAt : null,
      available,
      reason
    };
  }

  /**
   * ready/available: true=已观测就绪，false=已观测未就绪，null=未知。
   * 仅分析模型中的直接依赖，不表示目标服务整体健康，也不是失败根因。
   * 无预设的服务返回 source:none / ready:null，不能宣称它没有依赖。
   */
  analyze(serviceId, services = {}, statuses = {}) {
    const node = this.getDependencies(serviceId, services);
    const dependencies = node.dependsOn.map((id) => this._observe(id, services, statuses));
    const blockedBy = dependencies.filter((item) => item.available === false);
    const unknownDependencies = dependencies.filter((item) => item.available === null);
    const ready = node.source === 'none' || own(services, serviceId)?.enabled === false
      ? null
      : blockedBy.length > 0 ? false : unknownDependencies.length > 0 ? null : true;

    return {
      serviceId,
      source: node.source,
      scope: 'direct',
      advisory: true,
      dependencies,
      ready,
      blockedBy,
      unknownDependencies
    };
  }

  graph(services = {}) {
    return this.build(services).map((item) => ({
      ...item,
      edges: item.dependsOn.map((dependency) => ({ from: dependency, to: item.id }))
    }));
  }
}

module.exports = new DependencyService();
