/**
 * 健康检查服务
 */
const http = require('http');
const config = require('../config');

class HealthChecker {
  constructor() {
    this.timeout = 2000;
    this.waitTimeout = 120000;
    this.waitInterval = 3000;
  }

  _parseHealthBody(body) {
    if (!body) {
      return null;
    }

    try {
      return JSON.parse(body);
    } catch (error) {
      return null;
    }
  }

  _isHealthyResponse(statusCode, payload) {
    if (statusCode !== 200) {
      return false;
    }

    if (!payload || typeof payload !== 'object') {
      return true;
    }

    if (typeof payload.status === 'string') {
      return payload.status.toUpperCase() === 'UP';
    }

    return true;
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
        let body = '';

        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          if (responded) {
            return;
          }

          responded = true;
          const payload = this._parseHealthBody(body);
          resolve({
            healthy: this._isHealthyResponse(res.statusCode, payload),
            statusCode: res.statusCode,
            service: serviceId,
            details: payload
          });
        });
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
    const serviceIds = Object.keys(config.services);
    const entries = await Promise.allSettled(
      serviceIds.map(async (serviceId) => [serviceId, await this.check(serviceId)])
    );

    return entries.reduce((results, entry, index) => {
      const serviceId = serviceIds[index];

      if (entry.status === 'fulfilled') {
        const [resolvedServiceId, result] = entry.value;
        results[resolvedServiceId] = result;
        return results;
      }

      results[serviceId] = {
        healthy: false,
        service: serviceId,
        error: entry.reason?.message || '健康检查失败'
      };
      return results;
    }, {});
  }

  async waitForHealthy(serviceId, options = {}) {
    const timeout = options.timeout ?? this.waitTimeout;
    const interval = options.interval ?? this.waitInterval;
    const initialDelay = options.initialDelay ?? 0;
    const deadline = Date.now() + timeout;
    let attempts = 0;
    let lastResult = null;

    if (initialDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, initialDelay));
    }

    while (Date.now() <= deadline) {
      attempts += 1;
      lastResult = await this.check(serviceId);

      if (lastResult.healthy) {
        return {
          ...lastResult,
          attempts,
          durationMs: timeout - Math.max(deadline - Date.now(), 0)
        };
      }

      if (Date.now() + interval > deadline) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    return {
      healthy: false,
      service: serviceId,
      error: lastResult?.error || '健康检查超时',
      statusCode: lastResult?.statusCode,
      details: lastResult?.details,
      attempts,
      durationMs: timeout,
      timedOut: true
    };
  }
}

module.exports = new HealthChecker();
