/**
 * 缓存服务
 * 默认使用内存缓存，Redis 作为可选增强
 */
const redis = require('redis');
const redisConfig = require('../config/redis');

class CacheService {
  constructor() {
    this.client = null;
    this.connected = false;
    this.mode = 'memory';
    this.memoryCache = new Map();
    this.memoryTimers = new Map();
  }

  _clearMemoryTimer(key) {
    const timer = this.memoryTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.memoryTimers.delete(key);
    }
  }

  _setMemoryValue(key, value, ttlSeconds = 300) {
    this.memoryCache.set(key, value);
    this._clearMemoryTimer(key);

    const timer = setTimeout(() => {
      this.memoryCache.delete(key);
      this.memoryTimers.delete(key);
    }, ttlSeconds * 1000);

    this.memoryTimers.set(key, timer);
  }

  _serialize(value) {
    return JSON.stringify(value);
  }

  _deserialize(value) {
    return value ? JSON.parse(value) : null;
  }

  _resolveOptions(options = {}) {
    return {
      requireRedis: Boolean(options.requireRedis),
      allowMemoryFallback: options.allowMemoryFallback !== false
    };
  }

  _createRedisUnavailableError(message = 'Redis 不可用') {
    const error = new Error(message);
    error.code = 'CACHE_REDIS_UNAVAILABLE';
    return error;
  }

  _assertRedisWritable(options) {
    if (!options.requireRedis) {
      return;
    }

    if (!this.client?.isReady) {
      throw this._createRedisUnavailableError();
    }
  }

  _getMemoryValue(key, fallbackValue = null) {
    return this.memoryCache.has(key) ? this.memoryCache.get(key) : fallbackValue;
  }

  getMode() {
    return this.mode;
  }

  isRedisReady() {
    return Boolean(this.client?.isReady);
  }

  isRedisConfigured() {
    return redisConfig.mode === 'redis';
  }

  getRedisState() {
    return {
      configured: this.isRedisConfigured(),
      ready: this.isRedisReady(),
      mode: this.mode,
      connected: this.connected
    };
  }

  async connect() {
    if (this.client || this.connected) {
      return;
    }

    if (redisConfig.mode !== 'redis') {
      this.mode = 'memory';
      console.log('缓存模式: memory（默认）');
      return;
    }

    try {
      this.client = redis.createClient({
        socket: {
          host: redisConfig.host,
          port: redisConfig.port
        },
        password: redisConfig.password || undefined,
        database: redisConfig.db
      });

      this.client.on('error', (err) => {
        console.error('Redis 错误:', err);
        this.connected = false;
        this.mode = 'memory';
      });

      this.client.on('ready', () => {
        console.log('Redis 连接成功');
        this.connected = true;
        this.mode = 'redis';
      });

      this.client.on('end', () => {
        this.connected = false;
        this.mode = 'memory';
      });

      await this.client.connect();
    } catch (error) {
      console.warn(`Redis 连接失败，已降级为内存缓存: ${error.message}`);
      this.client = null;
      this.connected = false;
      this.mode = 'memory';
    }
  }

  _key(key) {
    return `${redisConfig.keyPrefix}${key}`;
  }

  async listKeys(prefix = '', options = {}) {
    const resolved = this._resolveOptions(options);

    try {
      this._assertRedisWritable(resolved);
      if (this.client?.isReady) {
        const matched = [];
        const redisPrefix = this._key(prefix);
        for await (const key of this.client.scanIterator({ MATCH: `${redisPrefix}*`, COUNT: 100 })) {
          matched.push(key.startsWith(redisConfig.keyPrefix) ? key.slice(redisConfig.keyPrefix.length) : key);
        }
        return matched;
      }
    } catch (error) {
      if (!resolved.allowMemoryFallback) {
        throw error;
      }
    }

    return Array.from(this.memoryCache.keys()).filter((key) => key.startsWith(prefix));
  }

  async get(key, options = {}) {
    const resolved = this._resolveOptions(options);

    try {
      this._assertRedisWritable(resolved);
      if (this.client?.isReady) {
        const value = await this.client.get(this._key(key));
        const deserialized = this._deserialize(value);
        return deserialized ?? this._getMemoryValue(key, null);
      }
    } catch (error) {
      if (!resolved.allowMemoryFallback) {
        throw error;
      }
    }

    return this._getMemoryValue(key, null);
  }

  async set(key, value, ttlSeconds = 300, options = {}) {
    const resolved = this._resolveOptions(options);

    try {
      this._assertRedisWritable(resolved);
      if (this.client?.isReady) {
        await this.client.setEx(this._key(key), ttlSeconds, this._serialize(value));
        return;
      }

      if (!resolved.allowMemoryFallback) {
        throw this._createRedisUnavailableError();
      }

      this._setMemoryValue(key, value, ttlSeconds);
    } catch (error) {
      if (!resolved.allowMemoryFallback) {
        throw error;
      }
      this._setMemoryValue(key, value, ttlSeconds);
    }
  }

  async setIfNotExists(key, value, ttlSeconds = 300, options = {}) {
    const resolved = this._resolveOptions(options);

    try {
      this._assertRedisWritable(resolved);
      if (this.client?.isReady) {
        const result = await this.client.set(this._key(key), this._serialize(value), {
          NX: true,
          EX: ttlSeconds
        });
        return result === 'OK';
      }
    } catch (error) {
      if (!resolved.allowMemoryFallback) {
        throw error;
      }
    }

    if (!resolved.allowMemoryFallback) {
      throw this._createRedisUnavailableError();
    }

    if (this.memoryCache.has(key)) {
      return false;
    }

    this._setMemoryValue(key, value, ttlSeconds);
    return true;
  }

  async expire(key, ttlSeconds = 300, options = {}) {
    const resolved = this._resolveOptions(options);

    try {
      this._assertRedisWritable(resolved);
      if (this.client?.isReady) {
        return this.client.expire(this._key(key), ttlSeconds);
      }
    } catch (error) {
      if (!resolved.allowMemoryFallback) {
        throw error;
      }
    }

    if (!resolved.allowMemoryFallback) {
      throw this._createRedisUnavailableError();
    }

    const value = this.memoryCache.get(key);
    if (value === undefined) {
      return false;
    }

    this._setMemoryValue(key, value, ttlSeconds);
    return true;
  }

  async delete(key, options = {}) {
    const resolved = this._resolveOptions(options);

    try {
      this._assertRedisWritable(resolved);
      if (this.client?.isReady) {
        await this.client.del(this._key(key));
      }
    } catch (error) {
      if (!resolved.allowMemoryFallback) {
        throw error;
      }
    }

    this.memoryCache.delete(key);
    this._clearMemoryTimer(key);
  }

  async getSet(key, options = {}) {
    const resolved = this._resolveOptions(options);

    try {
      this._assertRedisWritable(resolved);
      if (this.client?.isReady) {
        const members = await this.client.sMembers(this._key(key));
        if (members.length > 0) {
          return members.map((member) => this._deserialize(member));
        }
      }
    } catch (error) {
      if (!resolved.allowMemoryFallback) {
        throw error;
      }
    }

    return this._getMemoryValue(key, []);
  }

  async addToSet(key, value, options = {}) {
    const resolved = this._resolveOptions(options);

    try {
      this._assertRedisWritable(resolved);
      if (this.client?.isReady) {
        await this.client.sAdd(this._key(key), this._serialize(value));
        return;
      }
    } catch (error) {
      if (!resolved.allowMemoryFallback) {
        throw error;
      }
    }

    if (!resolved.allowMemoryFallback) {
      throw this._createRedisUnavailableError();
    }

    const set = this.memoryCache.get(key) || [];
    const serializedValue = this._serialize(value);
    if (!set.some((entry) => this._serialize(entry) === serializedValue)) {
      set.push(value);
    }
    this.memoryCache.set(key, set);
  }

  async removeFromSet(key, value, options = {}) {
    const resolved = this._resolveOptions(options);

    try {
      this._assertRedisWritable(resolved);
      if (this.client?.isReady) {
        await this.client.sRem(this._key(key), this._serialize(value));
        return;
      }
    } catch (error) {
      if (!resolved.allowMemoryFallback) {
        throw error;
      }
    }

    if (!resolved.allowMemoryFallback) {
      throw this._createRedisUnavailableError();
    }

    const set = this.memoryCache.get(key) || [];
    const serializedValue = this._serialize(value);
    this.memoryCache.set(
      key,
      set.filter((entry) => this._serialize(entry) !== serializedValue)
    );
  }

  async pushToList(key, value, maxLength = 100, options = {}) {
    const resolved = this._resolveOptions(options);

    try {
      this._assertRedisWritable(resolved);
      if (this.client?.isReady) {
        await this.client.multi()
          .lPush(this._key(key), this._serialize(value))
          .lTrim(this._key(key), 0, maxLength - 1)
          .exec();
        return;
      }
    } catch (error) {
      if (!resolved.allowMemoryFallback) {
        throw error;
      }
    }

    if (!resolved.allowMemoryFallback) {
      throw this._createRedisUnavailableError();
    }

    const list = this.memoryCache.get(key) || [];
    list.unshift(value);
    if (list.length > maxLength) {
      list.pop();
    }
    this.memoryCache.set(key, list);
  }

  async getList(key, start = 0, end = -1, options = {}) {
    const resolved = this._resolveOptions(options);

    try {
      this._assertRedisWritable(resolved);
      if (this.client?.isReady) {
        const items = await this.client.lRange(this._key(key), start, end);
        if (items.length > 0) {
          return items.map((item) => this._deserialize(item));
        }
      }
    } catch (error) {
      if (!resolved.allowMemoryFallback) {
        throw error;
      }
    }

    return this._getMemoryValue(key, []);
  }

  async disconnect() {
    for (const timer of this.memoryTimers.values()) {
      clearTimeout(timer);
    }
    this.memoryTimers.clear();

    if (this.client) {
      await this.client.quit();
      this.client = null;
    }

    this.connected = false;
    this.mode = 'memory';
  }
}

module.exports = new CacheService();
