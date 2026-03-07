/**
 * Redis 配置
 * 从 MeterSphere 配置文件读取
 */
const fs = require('fs');
const path = require('path');

const METERSPHERE_CONF = '/opt/metersphere/conf/metersphere.properties';

function loadRedisConfig() {
  // 默认配置
  const defaultConfig = {
    host: 'localhost',
    port: 6379,
    password: 'Password123@redis',
    db: 0,
    keyPrefix: 'ms-panel:'
  };

  try {
    if (fs.existsSync(METERSPHERE_CONF)) {
      const content = fs.readFileSync(METERSPHERE_CONF, 'utf8');
      
      const hostMatch = content.match(/spring\.redis\.host\s*=\s*(.+)/);
      const portMatch = content.match(/spring\.redis\.port\s*=\s*(\d+)/);
      const passMatch = content.match(/spring\.redis\.password\s*=\s*(.+)/);

      return {
        host: hostMatch ? hostMatch[1].trim() : defaultConfig.host,
        port: portMatch ? parseInt(portMatch[1], 10) : defaultConfig.port,
        password: passMatch ? passMatch[1].trim() : defaultConfig.password,
        db: defaultConfig.db,
        keyPrefix: defaultConfig.keyPrefix
      };
    }
  } catch (error) {
    console.warn('读取 MeterSphere 配置失败，使用默认配置:', error.message);
  }

  return defaultConfig;
}

module.exports = loadRedisConfig();
