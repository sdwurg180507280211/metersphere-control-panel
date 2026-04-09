/**
 * 基础设施可达性检查服务
 * 在启动 MeterSphere 服务前检查 MySQL、Redis、Kafka 是否可达
 */
const net = require('net');
const fs = require('fs');
const configManager = require('./configManager');
const logger = require('../utils/logger');

class InfraChecker {
  constructor() {
    this.timeout = 3000;
    this._cachedStatus = null;
    this._cacheTtl = 30000;
    this._cacheTime = 0;
  }

  /**
   * TCP 端口探测（与 healthChecker._probePort 同模式）
   */
  _probePort(port, host = 'localhost', timeout = this.timeout) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let settled = false;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(result);
      };

      socket.setTimeout(timeout);
      socket.once('connect', () => finish({ reachable: true }));
      socket.once('timeout', () => finish({ reachable: false, error: '连接超时' }));
      socket.once('error', (err) => finish({ reachable: false, error: err.message }));
      socket.connect(port, host);
    });
  }

  /**
   * 从 metersphere.properties 读取 MySQL 连接信息
   */
  _readMySQLConfig() {
    const confPath = configManager.getResolvedConfig().properties?.metersphere
      || '/opt/metersphere/conf/metersphere.properties';

    if (!fs.existsSync(confPath)) {
      return { host: 'localhost', port: 3306, source: 'default', confMissing: true };
    }

    try {
      const content = fs.readFileSync(confPath, 'utf8');
      const urlMatch = content.match(/spring\.datasource\.url\s*=\s*jdbc:mysql:\/\/([^:]+):(\d+)\/(\w+)/);

      return {
        host: urlMatch ? urlMatch[1].trim() : 'localhost',
        port: urlMatch ? parseInt(urlMatch[2], 10) : 3306,
        database: urlMatch ? urlMatch[3].trim() : 'metersphere',
        source: 'properties',
        confMissing: false
      };
    } catch (err) {
      return { host: 'localhost', port: 3306, source: 'default', confMissing: false };
    }
  }

  /**
   * 从 configManager 获取 Redis 连接信息
   * Redis host/port 已在 config pipeline 中解析完毕
   */
  _readRedisConfig() {
    const resolved = configManager.getResolvedConfig();
    const redisSection = resolved.redis || {};
    return {
      host: redisSection.host || process.env.MS_REDIS_HOST || 'localhost',
      port: parseInt(redisSection.port || process.env.MS_REDIS_PORT || '6379', 10),
      source: 'config'
    };
  }

  /**
   * 从 metersphere.properties 读取 Kafka 连接信息
   */
  _readKafkaConfig() {
    const confPath = configManager.getResolvedConfig().properties?.metersphere
      || '/opt/metersphere/conf/metersphere.properties';

    let host = 'localhost';
    let port = 9092;

    if (fs.existsSync(confPath)) {
      try {
        const content = fs.readFileSync(confPath, 'utf8');
        // 支持 spring.kafka.bootstrap-servers 和 kafka.bootstrap-servers
        const kafkaMatch = content.match(/(?:spring\.)?kafka\.bootstrap-servers\s*=\s*([^:]+):(\d+)/);
        if (kafkaMatch) {
          host = kafkaMatch[1].trim();
          port = parseInt(kafkaMatch[2], 10);
        }
      } catch (err) {
        // ignore parse errors
      }
    }

    return { host, port, source: confPath && fs.existsSync(confPath) ? 'properties' : 'default' };
  }

  /**
   * 检查单个基础设施组件
   */
  async _checkComponent(name, config) {
    const result = await this._probePort(config.port, config.host);
    return {
      name,
      reachable: result.reachable,
      host: config.host,
      port: config.port,
      source: config.source,
      confMissing: config.confMissing || false,
      error: result.reachable ? null : result.error
    };
  }

  /**
   * 检查所有基础设施组件
   * @param {Object} options - { useCache: boolean }
   * @returns {Object} { mysql, redis, kafka, allReachable, checkedAt }
   */
  async checkAll(options = {}) {
    if (options.useCache && this._cachedStatus && (Date.now() - this._cacheTime < this._cacheTtl)) {
      return this._cachedStatus;
    }

    const mysqlConfig = this._readMySQLConfig();
    const redisConfig = this._readRedisConfig();
    const kafkaConfig = this._readKafkaConfig();

    const [mysql, redis, kafka] = await Promise.all([
      this._checkComponent('MySQL', mysqlConfig),
      this._checkComponent('Redis', redisConfig),
      this._checkComponent('Kafka', kafkaConfig)
    ]);

    const result = {
      mysql,
      redis,
      kafka,
      allReachable: mysql.reachable && redis.reachable && kafka.reachable,
      checkedAt: new Date().toISOString()
    };

    this._cachedStatus = result;
    this._cacheTime = Date.now();

    return result;
  }

  /**
   * 广播基础设施状态
   */
  async broadcastStatus() {
    const status = await this.checkAll();
    try {
      const websocketService = require('./websocketService');
      websocketService.broadcastInfraStatus?.(status);
    } catch (error) {
      // ignore websocket availability issues
    }
    return status;
  }

  /**
   * 获取缓存状态（无网络请求）
   */
  getCachedStatus() {
    return this._cachedStatus || {
      mysql: { name: 'MySQL', reachable: null, host: 'localhost', port: 3306, error: null },
      redis: { name: 'Redis', reachable: null, host: 'localhost', port: 6379, error: null },
      kafka: { name: 'Kafka', reachable: null, host: 'localhost', port: 9092, error: null },
      allReachable: null,
      checkedAt: null
    };
  }
}

module.exports = new InfraChecker();
