const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const yaml = require('js-yaml');
const logger = require('../utils/logger');

class ProjectScannerService {
  /**
   * 扫描项目根目录，探测微服务
   * @param {string} projectRoot 项目根路径
   * @returns {Promise<Object>} 探测到的服务列表
   */
  async scan(projectRoot) {
    if (!projectRoot || !fs.existsSync(projectRoot)) {
      throw new Error(`项目路径不存在: ${projectRoot}`);
    }

    const services = {};
    // 1. 获取一级目录
    const entries = await fsp.readdir(projectRoot, { withFileTypes: true });
    const folders = entries
      .filter(e => e.isDirectory() && !this._isIgnored(e.name))
      .map(e => e.name);

    // 2. 收集所有可能的模块目录
    let candidateDirs = [];
    for (const folder of folders) {
      const folderPath = path.join(projectRoot, folder);
      // 检查当前目录是否是服务
      candidateDirs.push(...await this._findServiceCandidates(folderPath, 0));
    }

    // 3. 并发解析这些候选目录
    await Promise.all(candidateDirs.map(async (candidate) => {
      try {
        const pomContent = await fsp.readFile(candidate.pomPath, 'utf8');
        
        // 精准识别逻辑
        const hasSpringBoot = pomContent.includes('spring-boot-maven-plugin') || pomContent.includes('spring-cloud-starter');
        const hasResources = fs.existsSync(path.join(candidate.dir, 'src/main/resources'));
        const serviceId = candidate.id;
        const isLibrary = serviceId.includes('sdk') || serviceId.includes('plugin-sdk');

        if (hasSpringBoot && hasResources && !isLibrary) {
          const relativePom = path.relative(projectRoot, candidate.pomPath);
          const ports = await this._resolvePort(candidate.dir);
          const name = this._resolveName(serviceId);

          services[serviceId] = {
            name,
            pom: relativePom,
            port: ports.port,
            healthCheckPort: ports.healthCheckPort,
            healthCheck: '/actuator/health',
            startOrder: this._guessStartOrder(serviceId),
            enabled: true
          };
        }
      } catch (err) {
        logger.warn(`解析模块失败 (${candidate.dir}): ${err.message}`);
      }
    }));

    return services;
  }

  _isIgnored(name) {
    const ignored = [
      'node_modules', '.git', 'target', '.idea', '.vscode', 'dist', 
      'frontend', 'docs', 'scripts', 'bin', 'temp', 'logs'
    ];
    return ignored.includes(name) || name.startsWith('.');
  }

  async _findServiceCandidates(dir, depth) {
    if (depth > 2) return []; // 限制深度为 2 (例如 framework/eureka)
    
    const candidates = [];
    const pomPath = path.join(dir, 'pom.xml');
    
    if (fs.existsSync(pomPath)) {
      // 识别 ID: 如果是 backend 目录，取父级目录名
      const dirName = path.basename(dir);
      const parentName = path.basename(path.dirname(dir));
      const id = dirName === 'backend' ? parentName : dirName;
      candidates.push({ id, dir, pomPath });
    }

    // 只有在没找到 pom 或者深度允许的情况下才扫描子目录
    if (depth < 2) {
      try {
        const entries = await fsp.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && !this._isIgnored(entry.name)) {
            candidates.push(...await this._findServiceCandidates(path.join(dir, entry.name), depth + 1));
          }
        }
      } catch (e) {}
    }

    return candidates;
  }

  async _resolvePort(serviceDir) {
    const resourceDir = path.join(serviceDir, 'src/main/resources');
    const defaultPorts = { port: 8080, healthCheckPort: 8080 };
    if (!fs.existsSync(resourceDir)) return defaultPorts;

    const ports = { ...defaultPorts };

    try {
      const configFiles = await this._findConfigFiles(resourceDir);
      
      for (const file of configFiles) {
        const content = await fsp.readFile(file, 'utf8');
        const ext = path.extname(file).toLowerCase();
        
        if (ext === '.yml' || ext === '.yaml') {
          const doc = yaml.load(content);
          if (doc?.server?.port) ports.port = parseInt(doc.server.port, 10);
          if (doc?.management?.server?.port) ports.healthCheckPort = parseInt(doc.management.server.port, 10);
        } else if (ext === '.properties') {
          const portMatch = content.match(/^server\.port\s*[:=]\s*(\d+)/m);
          if (portMatch) ports.port = parseInt(portMatch[1], 10);
          
          const mgmtPortMatch = content.match(/^management\.server\.port\s*[:=]\s*(\d+)/m);
          if (mgmtPortMatch) ports.healthCheckPort = parseInt(mgmtPortMatch[1], 10);
        }
      }
    } catch (e) {
      logger.warn(`解析端口失败 (${serviceDir}): ${e.message}`);
    }

    if (ports.healthCheckPort === 8080 && ports.port !== 8080) {
      ports.healthCheckPort = ports.port;
    }

    return ports;
  }

  async _findConfigFiles(dir) {
    const results = [];
    try {
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...await this._findConfigFiles(fullPath));
        } else if (entry.name === 'application.properties' || entry.name === 'application.yml' || entry.name === 'application.yaml') {
          results.push(fullPath);
        }
      }
    } catch (e) {}
    return results;
  }

  _resolveName(id) {
    const nameMap = {
      'eureka': 'Eureka',
      'gateway': '网关',
      'system-setting': '系统设置',
      'project-management': '项目管理',
      'test-track': '测试跟踪',
      'api-test': '接口测试',
      'performance-test': '性能测试',
      'report-stat': '报告统计',
      'workstation': '工作台',
      'workflow-service': '工作流服务',
      'analytics-stat': '分析统计'
    };
    return nameMap[id] || id;
  }

  _guessStartOrder(id) {
    if (id === 'eureka') return 1;
    if (id === 'gateway') return 2;
    return 99;
  }
}

module.exports = new ProjectScannerService();
