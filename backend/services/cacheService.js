/**
 * Redis 缓存服务
 * 用于缓存服务状态、构建历史等
 */
const redis = require('redis');
const redisConfig = require('../config/redis');

class CacheService {
  constructor() {
    this.client = null;
    this.connected = false;
  }

  async connect() {
    if (this.client) return;

    try {
      this.client = redis.createClient({
        socket: {
          host: redisConfig.host,
          port: redisConfig.port
        },
        password: redisConfig.password,
        database: redisConfig.db
      });

      this.client.on('error', (err) => {
        console.error('Redis 错误:', err);
        this.connected = false;
      });

      this.client.on('connect', () => {
        console.log('Redis 连接成功');
        this.connected = true;
      });

      await this.client.connect();
    } catch (error) {
      console.warn('Redis 连接失败，将使用内存缓存:', error.message);
      // 降级到内存缓存
      this.memoryCache = new Map();
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
      return this.memoryCache?.get(key) || null;
    } catch (error) {
      return this.memoryCache?.get(key) || null;
    }
  }

  async set(key, value, ttlSeconds = 300) {
    try {
      if (this.client?.isReady) {
        await this.client.setEx(
          this._key(key),
          ttlSeconds,
          JSON.stringify(value)
        );
      } else {
        this.memoryCache?.set(key, value);
        // 内存缓存也设置过期
        setTimeout(() => this.memoryCache?.delete(key), ttlSeconds * 1000);
      }
    } catch (error) {
      this.memoryCache?.set(key, value);
    }
  }

  async delete(key) {
    try {
      if (this.client?.isReady) {
        await this.client.del(this._key(key));
      } else {
        this.memoryCache?.delete(key);
      }
    } catch (error) {
      this.memoryCache?.delete(key);
    }
  }

  async getSet(key) {
    try {
      if (this.client?.isReady) {
        const members = await this.client.sMembers(this._key(key));
        return members.map(m => JSON.parse(m));
      }
      return this.memoryCache?.get(key) || [];
    } catch (error) {
      return this.memoryCache?.get(key) || [];
    }
  }

  async addToSet(key, value) {
    try {
      if (this.client?.isReady) {
        await this.client.sAdd(this._key(key), JSON.stringify(value));
      } else {
        const set = this.memoryCache?.get(key) || [];
        set.push(value);
        this.memoryCache?.set(key, set);
      }
    } catch (error) {
      const set = this.memoryCache?.get(key) || [];
      set.push(value);
      this.memoryCache?.set(key, set);
    }
  }

  async pushToList(key, value, maxLength = 100) {
    try {
      if (this.client?.isReady) {
        // 使用 multi 事务
        await this.client.multi()
          .lPush(this._key(key), JSON.stringify(value))
          .lTrim(this._key(key), 0, maxLength - 1)
          .exec();
      } else {
        const list = this.memoryCache?.get(key) || [];
        list.unshift(value);
        if (list.length > maxLength) list.pop();
        this.memoryCache?.set(key, list);
      }
    } catch (error) {
      const list = this.memoryCache?.get(key) || [];
      list.unshift(value);
      if (list.length > maxLength) list.pop();
      this.memoryCache?.set(key, list);
    }
  }

  async getList(key, start = 0, end = -1) {
    try {
      if (this.client?.isReady) {
        const items = await this.client.lRange(this._key(key), start, end);
        return items.map(i => JSON.parse(i));
      }
      return this.memoryCache?.get(key) || [];
    } catch (error) {
      return this.memoryCache?.get(key) || [];
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.connected = false;
    }
  }
}

module.exports = new CacheService();
