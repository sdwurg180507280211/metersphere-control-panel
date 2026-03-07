/**
 * 健康检查服务
 */
const http = require('http');
const config = require('../config');

class HealthChecker {
  constructor() {
    this.timeout = 2000;
  }

  /**
   * 检查服务健康状态
   */
  check(serviceId) {
    const service = config.services[serviceId];
    if (!service) {
      return Promise.resolve({ healthy: false, error: '服务不存在' });
    }

    return new Promise((resolve) => {
      let responded = false;

      const options = {
        host: 'localhost',
        port: service.port,
        path: service.healthCheck || '/',
        timeout: this.timeout
      };

      const req = http.get(options, (res) => {
        if (!responded) {
          responded = true;
          resolve({ 
            healthy: res.statusCode === 200,
            statusCode: res.statusCode,
            service: serviceId
          });
        }
      });

      req.on('error', () => {
        if (!responded) {
          responded = true;
          resolve({ healthy: false, error: '连接失败', service: serviceId });
        }
      });

      req.on('timeout', () => {
        req.destroy();
        if (!responded) {
          responded = true;
          resolve({ healthy: false, error: '超时', service: serviceId });
        }
      });
    });
  }

  /**
   * 批量检查所有服务
   */
  async checkAll() {
    const results = {};
    for (const serviceId of Object.keys(config.services)) {
      results[serviceId] = await this.check(serviceId);
    }
    return results;
  }
}

module.exports = new HealthChecker();
