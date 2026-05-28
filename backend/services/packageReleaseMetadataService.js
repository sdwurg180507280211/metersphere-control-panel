const { execFile } = require('child_process');

const GIT_TIMEOUT_MS = 15000;
const MAX_COMMITS = 200;
const MAX_CHANGED_FILES = 500;

/**
 * 执行 Git 命令，不拼接 shell 字符串
 */
function execGit(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = execFile('git', args, { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) {
        return reject(error);
      }
      resolve(stdout.trim());
    });
    child.unref?.();
  });
}

/**
 * 从配置获取文件分类规则
 */
function getClassificationConfig() {
  try {
    const configManager = require('./configManager');
    const resolved = configManager.getResolvedConfig();
    return {
      projectRoot: resolved?.projectRoot || process.cwd(),
      services: resolved?.services || {},
      frontendModules: resolved?.frontendModules || []
    };
  } catch {
    return {
      projectRoot: process.cwd(),
      services: {},
      frontendModules: []
    };
  }
}

/**
 * 检查路径是否属于某个前端模块
 */
function matchFrontendModule(filePath, frontendModules) {
  for (const mod of frontendModules) {
    const modPath = mod.frontendPath || mod.name || mod;
    if (typeof modPath === 'string' && filePath.startsWith(modPath.replace(/^\/+/, ''))) {
      return mod;
    }
  }
  return null;
}

/**
 * 检查路径是否属于后端服务模块
 * 匹配 services 中的 pom 路径或服务名
 */
function matchServiceModule(filePath, services) {
  for (const [serviceId, service] of Object.entries(services)) {
    const pom = service.pom || '';
    const serviceDir = pom.replace('/pom.xml', '').replace(/^\/+/, '');
    if (serviceDir && filePath.startsWith(serviceDir)) {
      return { id: serviceId, name: service.name || serviceId, dir: serviceDir };
    }
    // 也尝试按服务名匹配 (如 framework 等顶层目录)
    if (service.name && filePath.startsWith(service.name + '/')) {
      return { id: serviceId, name: service.name, dir: service.name };
    }
  }
  return null;
}

/**
 * 路径是否命中后端 Java/POM 路径模式
 */
function isBackendPath(filePath) {
  return /(^|\/)(pom\.xml|src\/main\/java\/|src\/test\/java\/|\.java$|\.kt$)/.test(filePath);
}

/**
 * 分类单个变更文件
 */
function classifyFile(filePath, { frontendModules, services }) {
  const categories = [];

  // 1. 前端模块
  const frontendMatch = matchFrontendModule(filePath, frontendModules);
  if (frontendMatch) {
    const modName = frontendMatch.name || frontendMatch.frontendPath || 'unknown';
    categories.push('frontend');

    // 细分类
    if (/(^|\/)(pages?|views?|routes?)(\/|$)/i.test(filePath)) {
      return { category: 'frontend', subcategory: 'page', module: modName };
    }
    if (/(^|\/)components?(\/|$)/i.test(filePath)) {
      return { category: 'frontend', subcategory: 'component', module: modName };
    }
    if (/\.(css|scss|less|sass|styl)$/i.test(filePath)) {
      return { category: 'frontend', subcategory: 'style', module: modName };
    }
    if (/(webpack|vite|rollup|babel|eslint|tsconfig|postcss|tailwind)/i.test(filePath)) {
      return { category: 'frontend', subcategory: 'config', module: modName };
    }
    return { category: 'frontend', subcategory: 'other', module: modName };
  }

  // 2. 服务模块
  const serviceMatch = matchServiceModule(filePath, services);
  if (serviceMatch || isBackendPath(filePath)) {
    if (/(^|\/)src\/main\/java\//.test(filePath)) {
      return { category: 'backend', subcategory: 'java', module: serviceMatch?.name || null };
    }
    if (/(^|\/)src\/test\//.test(filePath)) {
      return { category: 'test', subcategory: 'unit-test', module: serviceMatch?.name || null };
    }
    if (/(^|\/)pom\.xml$/.test(filePath)) {
      return { category: 'backend', subcategory: 'pom', module: serviceMatch?.name || null };
    }
    return { category: 'backend', subcategory: 'other', module: serviceMatch?.name || null };
  }

  // 3. 数据库变更
  if (/(sql|migration|flyway|liquibase|db|database|schema|ddl|dml)/i.test(filePath)) {
    return { category: 'database', subcategory: 'migration', module: null };
  }

  // 4. 配置文件
  if (/\.(properties|yml|yaml|conf|cfg|ini|toml|env|json)$/i.test(filePath)
      || /(scripts?|docker|k8s|kubernetes|helm|deploy|nginx|apache)/i.test(filePath)) {
    return { category: 'config', subcategory: 'config', module: null };
  }

  // 5. 文档
  if (/\.(md|rst|txt|adoc)$/i.test(filePath) || /(^|\/)(docs?|README|CHANGELOG)(\/|$)/i.test(filePath)) {
    return { category: 'docs', subcategory: 'docs', module: null };
  }

  // 6. 测试
  if (/(test|spec|mock|stub)/i.test(filePath)) {
    return { category: 'test', subcategory: 'other', module: null };
  }

  // 7. 其他
  return { category: 'other', subcategory: 'other', module: null };
}

/**
 * 生成变更摘要
 */
function buildChangeSummary(changedFiles) {
  const summary = {};
  for (const file of changedFiles) {
    const cat = file.category;
    if (!summary[cat]) {
      summary[cat] = { total: 0, subcategories: {} };
    }
    summary[cat].total++;
    const sub = file.subcategory || 'other';
    summary[cat].subcategories[sub] = (summary[cat].subcategories[sub] || 0) + 1;
  }
  return summary;
}

/**
 * 从 changedFiles 生成结构化的发布条目
 */
function buildReleaseItems(changedFiles, { services, frontendModules }) {
  const items = [];

  // 前端页面/组件变更
  const frontendChanges = changedFiles.filter(f => f.category === 'frontend' && (f.subcategory === 'page' || f.subcategory === 'component'));
  if (frontendChanges.length > 0) {
    const byModule = {};
    for (const f of frontendChanges) {
      const mod = f.module || 'unknown';
      if (!byModule[mod]) byModule[mod] = { pages: [], components: [] };
      if (f.subcategory === 'page') byModule[mod].pages.push(f.path);
      else byModule[mod].components.push(f.path);
    }
    items.push({
      type: 'frontend',
      label: '前端页面/组件变更',
      modules: Object.entries(byModule).map(([name, data]) => ({
        module: name,
        pages: data.pages,
        components: data.components
      }))
    });
  }

  // 前端其他变更
  const frontendOther = changedFiles.filter(f => f.category === 'frontend' && !['page', 'component'].includes(f.subcategory));
  if (frontendOther.length > 0) {
    items.push({
      type: 'frontend-other',
      label: '前端其他变更',
      files: frontendOther.map(f => f.path)
    });
  }

  // 后端变更
  const backendChanges = changedFiles.filter(f => f.category === 'backend');
  if (backendChanges.length > 0) {
    const byModule = {};
    for (const f of backendChanges) {
      const mod = f.module || 'other';
      if (!byModule[mod]) byModule[mod] = [];
      byModule[mod].push(f.path);
    }
    items.push({
      type: 'backend',
      label: '后端服务变更',
      modules: Object.entries(byModule).map(([name, files]) => ({ module: name, files }))
    });
  }

  // 数据库变更
  const dbChanges = changedFiles.filter(f => f.category === 'database');
  if (dbChanges.length > 0) {
    items.push({
      type: 'database',
      label: '数据库变更',
      files: dbChanges.map(f => f.path)
    });
  }

  // 配置变更
  const configChanges = changedFiles.filter(f => f.category === 'config');
  if (configChanges.length > 0) {
    items.push({
      type: 'config',
      label: '配置变更',
      files: configChanges.map(f => f.path)
    });
  }

  // 其他
  const otherChanges = changedFiles.filter(f => f.category === 'other');
  if (otherChanges.length > 0) {
    items.push({
      type: 'other',
      label: '其他变更',
      files: otherChanges.map(f => f.path)
    });
  }

  return items;
}

/**
 * 采集打包启动时的 Git 快照
 */
async function collectSnapshot() {
  const { projectRoot } = getClassificationConfig();
  const warnings = [];
  let gitBranch = null;
  let gitCommit = null;
  let gitSubject = null;

  const [branchResult, commitResult] = await Promise.allSettled([
    execGit(['rev-parse', '--abbrev-ref', 'HEAD'], projectRoot),
    execGit(['rev-parse', 'HEAD'], projectRoot)
  ]);

  if (branchResult.status === 'fulfilled') {
    gitBranch = branchResult.value;
  } else {
    warnings.push(`无法获取 Git 分支: ${branchResult.reason.message}`);
  }

  if (commitResult.status === 'fulfilled') {
    gitCommit = commitResult.value;
  } else {
    warnings.push(`无法获取 Git commit: ${commitResult.reason.message}`);
  }

  try {
    if (gitCommit) {
      gitSubject = await execGit(['log', '-1', '--format=%s', gitCommit], projectRoot);
    }
  } catch (err) {
    warnings.push(`无法获取 commit subject: ${err.message}`);
  }

  return {
    gitBranch,
    gitCommit,
    gitSubject,
    metadataWarnings: warnings.length > 0 ? warnings : null
  };
}

/**
 * 采集发布元数据
 * @param {Object} params
 * @param {string} params.previousSuccessCommit - 同分支上一次成功打包 commit（可选）
 * @param {Function} params.resolvePreviousSuccessCommit - 基于当前分支解析上一次成功 commit（可选）
 * @param {Object} params.gitSnapshot - 打包启动时采集的 Git 快照（可选）
 * @returns {Object} { gitBranch, gitCommit, gitSubject, previousSuccessCommit, commits, changedFiles, changeSummary, releaseItems, metadataWarnings }
 */
async function collect({ previousSuccessCommit = null, resolvePreviousSuccessCommit = null, gitSnapshot = null } = {}) {
  const { projectRoot, services, frontendModules } = getClassificationConfig();
  const hasSnapshot = gitSnapshot && typeof gitSnapshot === 'object';
  const warnings = [...(gitSnapshot?.metadataWarnings || [])];
  let resolvedPreviousSuccessCommit = previousSuccessCommit;
  let gitBranch = gitSnapshot?.gitBranch || null;
  let gitCommit = gitSnapshot?.gitCommit || null;
  let gitSubject = gitSnapshot?.gitSubject || null;
  let commits = [];
  let changedFiles = [];
  let changeSummary = null;
  let releaseItems = [];

  if (!hasSnapshot && !gitBranch) {
    try {
      gitBranch = await execGit(['rev-parse', '--abbrev-ref', 'HEAD'], projectRoot);
    } catch (err) {
      warnings.push(`无法获取 Git 分支: ${err.message}`);
    }
  }

  if (!hasSnapshot && !gitCommit) {
    try {
      gitCommit = await execGit(['rev-parse', 'HEAD'], projectRoot);
    } catch (err) {
      warnings.push(`无法获取 Git commit: ${err.message}`);
    }
  }

  if (!hasSnapshot && !gitSubject) {
    try {
      if (gitCommit) {
        gitSubject = await execGit(['log', '-1', '--format=%s', gitCommit], projectRoot);
      }
    } catch (err) {
      warnings.push(`无法获取 commit subject: ${err.message}`);
    }
  }

  // 获取 commits 列表
  if (!resolvedPreviousSuccessCommit && typeof resolvePreviousSuccessCommit === 'function' && gitBranch) {
    try {
      resolvedPreviousSuccessCommit = await resolvePreviousSuccessCommit(gitBranch);
    } catch (err) {
      warnings.push(`无法获取上一次成功打包 commit: ${err.message}`);
    }
  }

  if (!resolvedPreviousSuccessCommit && gitCommit) {
    warnings.push('没有上一条成功发布记录，无法计算完整增量范围，本次仅记录当前 HEAD commit。');
  }

  try {
    if (gitCommit) {
      const logArgs = resolvedPreviousSuccessCommit
        ? ['log', `--max-count=${MAX_COMMITS + 1}`, '--format=%H||%s||%an||%ai', `${resolvedPreviousSuccessCommit}..${gitCommit}`]
        : ['log', '-1', '--format=%H||%s||%an||%ai', gitCommit];
      const logOutput = await execGit(logArgs, projectRoot);
      const commitLines = logOutput.split('\n').filter(Boolean);
      if (commitLines.length > MAX_COMMITS) {
        warnings.push(`Commits 超过 ${MAX_COMMITS} 条，仅记录前 ${MAX_COMMITS} 条。`);
      }
      commits = commitLines.slice(0, MAX_COMMITS).map((line) => {
        const [hash, subject, author, date] = line.split('||');
        return { hash: hash?.substring(0, 8), fullHash: hash, subject, author, date };
      });
    }
  } catch (err) {
    warnings.push(`无法获取 commits 列表: ${err.message}`);
  }

  // 获取变更文件列表
  try {
    let diffRange;
    if (resolvedPreviousSuccessCommit) {
      diffRange = `${resolvedPreviousSuccessCommit}..${gitCommit || 'HEAD'}`;
    } else if (gitCommit) {
      // 没有历史记录，只获取当前 commit 的变更
      diffRange = `${gitCommit}~1..${gitCommit}`;
    }

    if (diffRange) {
      const filesOutput = await execGit(['diff', '--name-only', diffRange], projectRoot);
      const files = filesOutput.split('\n').filter(Boolean);
      if (files.length > MAX_CHANGED_FILES) {
        warnings.push(`变更文件超过 ${MAX_CHANGED_FILES} 个，仅记录前 ${MAX_CHANGED_FILES} 个。`);
      }

      changedFiles = files.slice(0, MAX_CHANGED_FILES).map((filePath) => {
        const classification = classifyFile(filePath, { frontendModules, services });
        return {
          path: filePath,
          ...classification
        };
      });
    }
  } catch (err) {
    // 如果是第一次打包（没有历史记录），diff 可能失败，尝试获取当前 commit 的文件
    try {
      if (gitCommit) {
        const filesOutput = await execGit(['diff-tree', '--root', '--no-commit-id', '-r', '--name-only', gitCommit], projectRoot);
        const files = filesOutput.split('\n').filter(Boolean);
        if (files.length > MAX_CHANGED_FILES) {
          warnings.push(`变更文件超过 ${MAX_CHANGED_FILES} 个，仅记录前 ${MAX_CHANGED_FILES} 个。`);
        }
        changedFiles = files.slice(0, MAX_CHANGED_FILES).map((filePath) => {
          const classification = classifyFile(filePath, { frontendModules, services });
          return { path: filePath, ...classification };
        });
      }
    } catch (err2) {
      warnings.push(`无法获取变更文件列表: ${err2.message}`);
    }
  }

  // 生成摘要和发布条目
  if (changedFiles.length > 0) {
    changeSummary = buildChangeSummary(changedFiles);
    releaseItems = buildReleaseItems(changedFiles, { services, frontendModules });
  }

  return {
    gitBranch,
    gitCommit,
    gitSubject,
    previousSuccessCommit: resolvedPreviousSuccessCommit || null,
    commits,
    changedFiles,
    changeSummary,
    releaseItems,
    metadataWarnings: warnings.length > 0 ? warnings : null
  };
}

module.exports = { collect, collectSnapshot };
