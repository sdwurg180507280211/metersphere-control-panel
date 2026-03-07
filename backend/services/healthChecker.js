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

  _getErrorMessage(statusCode, payload, defaultError) {
    // 服务返回 500 系列错误，说明服务已启动但内部异常
    if (statusCode >= 500 && statusCode < 600) {
      return `服务内部错误 (HTTP ${statusCode})，请检查服务日志`;
    }
    
    // 服务返回 404，可能是健康检查端点配置错误
    if (statusCode === 404) {
      return `健康检查端点不存在 (HTTP 404)，请检查配置`;
    }
    
    // 服务返回 401/403，可能是权限问题
    if (statusCode === 401 || statusCode === 403) {
      return `健康检查权限不足 (HTTP ${statusCode})`;
    }
    
    // 有错误信息从响应体中解析
    if (payload && typeof payload === 'object') {
      if (payload.error) {
        return payload.error;
      }
      if (payload.message) {
        return payload.message;
      }
      if (typeof payload.status === 'string' && payload.status.toUpperCase() !== 'UP') {
        return `服务状态: ${payload.status}`;
      }
    }
    
    return defaultError;
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
        port: service.healthCheckPort || service.port,
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
          const healthy = this._isHealthyResponse(res.statusCode, payload);
          const error = healthy ? null : this._getErrorMessage(
            res.statusCode, 
            payload, 
            res.statusCode === 200 ? '服务未就绪' : `HTTP ${res.statusCode}`
          );
          
          resolve({
            healthy,
            statusCode: res.statusCode,
            service: serviceId,
            details: payload,
            error
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
