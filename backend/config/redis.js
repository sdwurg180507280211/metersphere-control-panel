/**
 * 缓存配置
 * 默认使用内存缓存，显式启用时才接入 Redis
 */
const fs = require('fs');
const path = require('path');

const METERSPHERE_CONF = process.env.MS_PROPERTIES_PATH || '/opt/metersphere/conf/metersphere.properties';
const CONFIG_PATH = path.join(__dirname, '../../config.json');

function readMetersphereRedisConfig() {
  if (!fs.existsSync(METERSPHERE_CONF)) {
    return {};
  }

  const content = fs.readFileSync(METERSPHERE_CONF, 'utf8');
  const hostMatch = content.match(/spring\.redis\.host\s*=\s*(.+)/);
  const portMatch = content.match(/spring\.redis\.port\s*=\s*(\d+)/);
  const passMatch = content.match(/spring\.redis\.password\s*=\s*(.+)/);

  return {
    host: hostMatch ? hostMatch[1].trim() : undefined,
    port: portMatch ? parseInt(portMatch[1], 10) : undefined,
    password: passMatch ? passMatch[1].trim() : undefined
  };
}

function readConfigJsonRedis() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      return ;
    }
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return config.redis || {};
  } catch (err) {
    console.error('Failed to read redis config from config.json:', err);
    return {};
  }
}

function loadRedisConfig() {
  const fileConfig = readMetersphereRedisConfig();
  const jsonConfig = readConfigJsonRedis();
  const mode = (process.env.MS_CACHE_MODE || jsonConfig.mode || 'memory').toLowerCase();

  return {
    mode,
    host: process.env.MS_REDIS_HOST || jsonConfig.host || fileConfig.host || 'localhost',
    port: Number.parseInt(process.env.MS_REDIS_PORT || jsonConfig.port || fileConfig.port || '6379', 10),
    password: process.env.MS_REDIS_PASSWORD ?? jsonConfig.password ?? fileConfig.password ?? '',
    db: Number.parseInt(process.env.MS_REDIS_DB || jsonConfig.db || '0', 10),
    keyPrefix: process.env.MS_CACHE_KEY_PREFIX || 'ms-panel:',
    propertiesPath: METERSPHERE_CONF
  };
}

module.exports = loadRedisConfig();
