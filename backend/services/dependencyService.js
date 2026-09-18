/**
 * MeterSphere 服务依赖模型
 *
 * 目的：为后续环境准备、启动编排、故障诊断提供统一依赖来源。
 * 不改变现有启动逻辑，仅提供只读领域模型。
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

  /**
   * 根据服务配置生成依赖视图。
   * 后续可扩展为从项目扫描结果、配置文件、AI 分析结果生成。
   */
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
}

module.exports = new DependencyService();
