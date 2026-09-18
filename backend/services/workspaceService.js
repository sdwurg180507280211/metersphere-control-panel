const configManager = require('./configManager');
const processManager = require('./processManager');
const infraChecker = require('./infraChecker');
const healthChecker = require('./healthChecker');
const jobService = require('./jobService');
const { toCatalog, buildProblems } = require('./workspaceModel');

class WorkspaceService {
  async getSnapshot(options = {}) {
    const deep = options.deep !== false;
    const resolved = configManager.getResolvedConfig();
    const configPage = configManager.getConfigPageData();
    const catalog = toCatalog(resolved);

    const [statuses, infrastructure, activeJobs, recentJobs] = await Promise.all([
      processManager.getAllStatus(),
      infraChecker.checkAll({ useCache: true }),
      jobService.getActiveJobs(),
      jobService.getRecentJobs(8)
    ]);

    const runningIds = catalog
      .filter((service) => statuses?.[service.id]?.running)
      .map((service) => service.id);

    const healthByService = {};
    if (deep && runningIds.length > 0) {
      const healthResults = await Promise.allSettled(
        runningIds.map(async (serviceId) => [serviceId, await healthChecker.check(serviceId)])
      );

      healthResults.forEach((entry, index) => {
        const serviceId = runningIds[index];
        if (entry.status === 'fulfilled') {
          const [id, health] = entry.value;
          healthByService[id] = health;
        } else {
          healthByService[serviceId] = {
            healthy: false,
            error: entry.reason?.message || '健康检查失败',
            failureCode: 'HEALTH_CHECK_FAILED'
          };
        }
      });
    }

    const services = catalog.map((service) => {
      const status = statuses?.[service.id] || {};
      return {
        id: service.id,
        name: service.name || service.id,
        phase: status.phase || (status.running ? 'running' : 'stopped'),
        running: Boolean(status.running),
        pid: status.pid || null,
        error: status.error || null,
        health: healthByService[service.id] || null
      };
    });

    const validation = configPage.validation || { valid: true, errors: [], warnings: [] };
    const problems = buildProblems({ infrastructure, services, validation });
    const runningServices = services.filter((service) => service.running).length;
    const failedServices = services.filter((service) => service.phase === 'failed' || service.error).length;
    const blockers = problems.filter((problem) => problem.severity === 'blocker').length;
    const infrastructureReachable = infrastructure?.allReachable ?? null;
    const projectConfigured = Boolean(resolved.projectRoot);

    return {
      project: {
        id: 'metersphere',
        name: 'MeterSphere',
        root: resolved.projectRoot || null,
        configured: projectConfigured
      },
      summary: {
        totalServices: services.length,
        runningServices,
        failedServices,
        activeJobs: activeJobs.length,
        problems: problems.length,
        blockers,
        infrastructureReachable,
        configValid: validation.valid !== false,
        environmentReady: projectConfigured
          && infrastructureReachable === true
          && failedServices === 0
          && blockers === 0
          && validation.valid !== false
      },
      infrastructure,
      services,
      jobs: {
        active: activeJobs,
        recent: recentJobs
      },
      config: {
        valid: validation.valid !== false,
        errors: validation.errors || [],
        warnings: validation.warnings || [],
        hasUnappliedChanges: Boolean(configPage.meta?.hasUnappliedChanges)
      },
      problems,
      generatedAt: new Date().toISOString()
    };
  }
}

module.exports = new WorkspaceService();
