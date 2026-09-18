/**
 * MeterSphere 服务依赖模型
 *
 * 目的：为环境准备、启动编排、故障诊断提供统一依赖来源。
 * 不改变现有启动逻辑，仅提供领域模型。
 */
class DependencyService {
  constructor() {
    this.defaultDependencies = {
      eureka: {
        dependsOn: [],
        role: 'service-registry',
        startOrder: 10
      },
      gateway: {
        dependsOn: ['eureka'],
        role: 'gateway',
        startOrder: 20
      }
    };
  }

  build(services = {}) {
    return Object.entries(services).map(([id, service]) => {
      const preset = this.defaultDependencies[id] || {};
      return {
        id,
        name: service.name || id,
        dependsOn: preset.dependsOn || [],
        role: preset.role || 'application-service',
        startOrder: service.startOrder ?? preset.startOrder ?? 99
      };
    }).sort((a, b) => a.startOrder - b.startOrder);
  }

  getDependencies(serviceId, services = {}) {
    return this.build(services).find((item) => item.id === serviceId) || {
      id: serviceId,
      dependsOn: []
    };
  }

  /**
   * 根据当前服务状态计算依赖风险。
   * 只读计算，不触发启动/停止动作。
   */
  analyze(serviceId, services = {}, statuses = {}) {
    const node = this.getDependencies(serviceId, services);
    const dependencies = node.dependsOn.map((dependencyId) => {
      const status = statuses[dependencyId] || {};
      return {
        id: dependencyId,
        running: Boolean(status.running),
        healthy: status.health?.healthy ?? null,
        available: Boolean(status.running) && status.health?.healthy !== false
      };
    });

    const blockedBy = dependencies.filter((item) => !item.available);

    return {
      serviceId,
      dependencies,
      ready: blockedBy.length === 0,
      blockedBy
    };
  }

  /**
   * 返回完整依赖图，供 Workspace、诊断中心使用。
   */
  graph(services = {}) {
    return this.build(services).map((item) => ({
      ...item,
      edges: item.dependsOn.map((dependency) => ({
        from: dependency,
        to: item.id
      }))
    }));
  }
}

module.exports = new DependencyService();
