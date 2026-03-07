/**
 * 缓存配置
 * 默认使用内存缓存，显式启用时才接入 Redis
 */
const fs = require('fs');

const METERSPHERE_CONF = process.env.MS_PROPERTIES_PATH || '/opt/metersphere/conf/metersphere.properties';

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

function loadRedisConfig() {
  const fileConfig = readMetersphereRedisConfig();
  const mode = (process.env.MS_CACHE_MODE || 'memory').toLowerCase();

  return {
    mode,
    host: process.env.MS_REDIS_HOST || fileConfig.host || 'localhost',
    port: Number.parseInt(process.env.MS_REDIS_PORT || fileConfig.port || '6379', 10),
    password: process.env.MS_REDIS_PASSWORD ?? fileConfig.password ?? '',
    db: Number.parseInt(process.env.MS_REDIS_DB || '0', 10),
    keyPrefix: process.env.MS_CACHE_KEY_PREFIX || 'ms-panel:',
    propertiesPath: METERSPHERE_CONF
  };
}

module.exports = loadRedisConfig();
