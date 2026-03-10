/**
 * 健康检查服务
 */
const http = require('http');
const net = require('net');
const configManager = require('./configManager');

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
    if (statusCode >= 500 && statusCode < 600) {
      return `服务内部错误 (HTTP ${statusCode})，请检查服务日志`;
    }

    if (statusCode === 404) {
      return '健康检查端点不存在 (HTTP 404)，请检查配置';
    }

    if (statusCode === 401 || statusCode === 403) {
      return `健康检查权限不足 (HTTP ${statusCode})`;
    }

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

  _classifyFailure(result) {
    if (result.healthy) {
      return { retriable: false, failureCode: null, terminal: false };
    }

    if (result.statusCode === 404) {
      return { retriable: false, failureCode: 'HEALTH_ENDPOINT_NOT_FOUND', terminal: true };
    }

    if (result.statusCode === 401 || result.statusCode === 403) {
      return { retriable: false, failureCode: 'HEALTH_CHECK_UNAUTHORIZED', terminal: true };
    }

    if (result.statusCode >= 400 && result.statusCode < 500) {
      return { retriable: false, failureCode: 'HEALTH_CHECK_FAILED', terminal: true };
    }

    if (result.error === '连接失败' || result.error === '超时') {
      return { retriable: true, failureCode: 'HEALTH_CHECK_TIMEOUT', terminal: false };
    }

    if (result.statusCode >= 500 && result.statusCode < 600) {
      return { retriable: true, failureCode: 'HEALTH_CHECK_FAILED', terminal: false };
    }

    return { retriable: true, failureCode: 'HEALTH_CHECK_FAILED', terminal: false };
  }

  _probePort(port, host = 'localhost', timeout = this.timeout) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let settled = false;

      const finish = (payload) => {
        if (settled) {
          return;
        }
        settled = true;
        socket.destroy();
        resolve(payload);
      };

      socket.setTimeout(timeout);
      socket.once('connect', () => finish({ healthy: true, mode: 'port', statusCode: 200, details: { port } }));
      socket.once('timeout', () => finish({ healthy: false, mode: 'port', error: '超时', details: { port } }));
      socket.once('error', () => finish({ healthy: false, mode: 'port', error: '连接失败', details: { port } }));
      socket.connect(port, host);
    });
  }

  /**
   * 检查服务健康状态
   */
  async check(serviceId) {
    const service = configManager.getResolvedConfig().services[serviceId];
    if (!service) {
      return { healthy: false, error: '服务不存在', failureCode: 'SERVICE_NOT_FOUND', terminal: true };
    }

    const healthPath = service.healthCheck || '/actuator/health';
    const healthPort = service.healthCheckPort || service.port;

    if (!service.healthCheck) {
      const portProbe = await this._probePort(healthPort);
      const classified = this._classifyFailure(portProbe);
      return {
        ...portProbe,
        service: serviceId,
        failureCode: classified.failureCode,
        retriable: classified.retriable,
        terminal: classified.terminal,
        mode: 'port'
      };
    }

    return new Promise((resolve) => {
      let responded = false;

      const options = {
        host: 'localhost',
        port: healthPort,
        path: healthPath,
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
          const base = {
            healthy,
            statusCode: res.statusCode,
            service: serviceId,
            details: payload,
            error,
            mode: 'http',
            path: healthPath,
            port: healthPort
          };
          const classified = this._classifyFailure(base);

          resolve({
            ...base,
            failureCode: classified.failureCode,
            retriable: classified.retriable,
            terminal: classified.terminal
          });
        });
      });

      req.on('error', () => {
        if (!responded) {
          responded = true;
          const base = {
            healthy: false,
            error: '连接失败',
            service: serviceId,
            mode: 'http',
            path: healthPath,
            port: healthPort
          };
          const classified = this._classifyFailure(base);
          resolve({
            ...base,
            failureCode: classified.failureCode,
            retriable: classified.retriable,
            terminal: classified.terminal
          });
        }
      });

      req.on('timeout', () => {
        req.destroy();
        if (!responded) {
          responded = true;
          const base = {
            healthy: false,
            error: '超时',
            service: serviceId,
            mode: 'http',
            path: healthPath,
            port: healthPort
          };
          const classified = this._classifyFailure(base);
          resolve({
            ...base,
            failureCode: classified.failureCode,
            retriable: classified.retriable,
            terminal: classified.terminal
          });
        }
      });
    });
  }

  /**
   * 批量检查所有服务
   */
  async checkAll() {
    const serviceIds = Object.keys(configManager.getResolvedConfig().services);
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
        error: entry.reason?.message || '健康检查失败',
        failureCode: 'HEALTH_CHECK_FAILED',
        retriable: true,
        terminal: false
      };
      return results;
    }, {});
  }

  async waitForHealthy(serviceId, options = {}) {
    const deadlineAt = options.deadlineAt || (Date.now() + (options.timeout ?? this.waitTimeout));
    const timeout = Math.max(1, Math.min(options.timeout ?? this.waitTimeout, deadlineAt - Date.now()));
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

      if (lastResult.terminal || lastResult.retriable === false) {
        return {
          ...lastResult,
          healthy: false,
          attempts,
          durationMs: timeout - Math.max(deadline - Date.now(), 0),
          timedOut: false,
          terminal: true
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
      timedOut: true,
      terminal: false,
      failureCode: lastResult?.failureCode || 'HEALTH_CHECK_TIMEOUT',
      retriable: true,
      mode: lastResult?.mode,
      path: lastResult?.path,
      port: lastResult?.port
    };
  }
}

module.exports = new HealthChecker();
