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

      this.client.on('connect', () => {
        console.log('Redis 连接成功');
        this.connected = true;
        this.mode = 'redis';
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

  async get(key) {
    try {
      if (this.client?.isReady) {
        const value = await this.client.get(this._key(key));
        return value ? JSON.parse(value) : null;
      }
      return this.memoryCache.get(key) || null;
    } catch (error) {
      return this.memoryCache.get(key) || null;
    }
  }

  async set(key, value, ttlSeconds = 300) {
    try {
      if (this.client?.isReady) {
        await this.client.setEx(this._key(key), ttlSeconds, JSON.stringify(value));
        return;
      }

      this._setMemoryValue(key, value, ttlSeconds);
    } catch (error) {
      this._setMemoryValue(key, value, ttlSeconds);
    }
  }

  async delete(key) {
    try {
      if (this.client?.isReady) {
        await this.client.del(this._key(key));
      }
    } catch (error) {
      // ignore redis delete failure and fallback to memory cleanup
    }

    this.memoryCache.delete(key);
    this._clearMemoryTimer(key);
  }

  async getSet(key) {
    try {
      if (this.client?.isReady) {
        const members = await this.client.sMembers(this._key(key));
        return members.map((member) => JSON.parse(member));
      }
      return this.memoryCache.get(key) || [];
    } catch (error) {
      return this.memoryCache.get(key) || [];
    }
  }

  async addToSet(key, value) {
    try {
      if (this.client?.isReady) {
        await this.client.sAdd(this._key(key), JSON.stringify(value));
        return;
      }
    } catch (error) {
      // fall through to memory cache
    }

    const set = this.memoryCache.get(key) || [];
    set.push(value);
    this.memoryCache.set(key, set);
  }

  async pushToList(key, value, maxLength = 100) {
    try {
      if (this.client?.isReady) {
        await this.client.multi()
          .lPush(this._key(key), JSON.stringify(value))
          .lTrim(this._key(key), 0, maxLength - 1)
          .exec();
        return;
      }
    } catch (error) {
      // fall through to memory cache
    }

    const list = this.memoryCache.get(key) || [];
    list.unshift(value);
    if (list.length > maxLength) list.pop();
    this.memoryCache.set(key, list);
  }

  async getList(key, start = 0, end = -1) {
    try {
      if (this.client?.isReady) {
        const items = await this.client.lRange(this._key(key), start, end);
        return items.map((item) => JSON.parse(item));
      }
      return this.memoryCache.get(key) || [];
    } catch (error) {
      return this.memoryCache.get(key) || [];
    }
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
