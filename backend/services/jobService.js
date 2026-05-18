const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cacheService = require('./cacheService');
const websocketService = require('./websocketService');
const { createAppError } = require('../utils/errors');

const JOB_TTL_SECONDS = 24 * 60 * 60;
const FAILED_JOB_TTL_SECONDS = 72 * 60 * 60;
const LOCK_TTL_SECONDS = 10 * 60;
const JOB_HISTORY_LIMIT = 200;
const ACTIVE_JOBS_KEY = 'job:active';
const HISTORY_JOBS_KEY = 'job:history';
const RATE_LIMIT_TTL_SECONDS = Number.parseInt(process.env.MS_JOB_RATE_LIMIT_WINDOW_SECONDS || '30', 10);
const REDIS_WRITE_RETRY_TIMES = Number.parseInt(process.env.MS_JOB_REDIS_RETRY_TIMES || '2', 10);
const REDIS_WRITE_RETRY_DELAY_MS = Number.parseInt(process.env.MS_JOB_REDIS_RETRY_DELAY_MS || '500', 10);
const FLUSH_INTERVAL_MS = 5000;

/**
 * @typedef {Object} Job
 * @property {string} jobId - 任务唯一标识
 * @property {string} type - 任务类型
 * @property {string} status - 任务状态: pending|running|completed|failed|cancelled
 * @property {Object} metadata - 任务元数据
 * @property {Object} [result] - 任务结果
 * @property {Object} [error] - 错误信息
 * @property {string} createdAt - 创建时间
 * @property {string} [updatedAt] - 更新时间
 */

/**
 * 统一任务管理服务
 * 负责任务生命周期管理、Redis 降级处理、任务限流
 */
class JobService {
  constructor() {
    /** @type {Array<{method: string, args: any[], timestamp: number}>} */
    this.pendingRedisWrites = [];
    /** @type {string|null} */
    this.redisDegradedAt = null;
    /** @type {string|null} */
    this.redisDegradedReason = null;

    this.flushTimer = setInterval(() => {
      this._flushBufferedWritesIfReady().catch(() => {
        // 下一个周期继续尝试
      });
    }, FLUSH_INTERVAL_MS);

    this.flushTimer.unref?.();
  }

  /**
   * 创建唯一任务 ID
   * @returns {string} 任务 ID
   */
  createJobId() {
    return `job_${uuidv4().replace(/-/g, '')}`;
  }

  /**
   * @private
   * @param {string} jobId
   * @returns {string}
   */
  _jobKey(jobId) {
    return `job:${jobId}`;
  }

  /**
   * @private
   * @param {string} resourceKey
   * @returns {string}
   */
  _lockKey(resourceKey) {
    return `lock:${resourceKey}`;
  }

  /**
   * @private
   * @param {string} resourceKey
   * @returns {string}
   */
  _rateKey(resourceKey) {
    return `rate:${resourceKey}`;
  }

  /**
   * 检查是否强制要求 Redis
   * @private
   * @returns {boolean}
   */
  _redisRequiredForJobs() {
    const flag = process.env.MS_JOB_REDIS_REQUIRED;
    if (flag === 'true') {
      return true;
    }
    if (flag === 'false') {
      return false;
    }
    return cacheService.isRedisConfigured();
  }

  /**
   * @private
   * @param {number} ms
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 转换为结构化错误
   * @private
   * @param {Error|Object} error
   * @param {string} fallbackCode
   * @returns {{code: string, message: string, details: Object}}
   */
  _readRecentLogSnippet(job) {
    const serviceId = job.targetType === 'service' && job.targetId ? job.targetId : job.metadata?.serviceId;
    if (!serviceId || !/^[a-zA-Z0-9._-]{1,80}$/.test(serviceId)) {
      return null;
    }

    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(__dirname, '../../logs/error', `${serviceId}-${date}.log`);
    if (!fs.existsSync(logFile)) {
      return null;
    }

    try {
      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.split('\n').filter(Boolean).slice(-20);
      return lines.length > 0 ? lines.join('\n') : null;
    } catch (error) {
      return null;
    }
  }

  _toStructuredError(error, fallbackCode = 'INTERNAL_ERROR') {
    if (!error) {
      return { code: fallbackCode, message: '未知错误', details: {} };
    }

    if (error.code && error.message) {
      return {
        code: error.code,
        message: error.message,
        details: error.details || {}
      };
    }

    return {
      code: fallbackCode,
      message: error.message || String(error),
      details: error.details || {}
    };
  }

  _getLegacyChannels(job) {
    if (!job) {
      return [];
    }

    if (job.type === 'frontend.build.batch') {
      return ['build:batchCompleted'];
    }

    if (job.type.startsWith('frontend.build')) {
      return ['build:progress', 'build:completed'];
    }

    if (job.type.startsWith('service.')) {
      return ['service:status'];
    }

    return [];
  }

  _decorateJob(job) {
    if (!job) {
      return null;
    }

    const buildId = job.result?.buildId || job.metadata?.buildId || null;
    const legacyChannels = this._getLegacyChannels(job);
    return {
      ...job,
      buildId,
      compatibility: {
        primaryChannels: ['job:progress', 'job:completed', 'job:failed'],
        legacyChannels,
        progressRoute: buildId ? '/api/progress/' + buildId : null,
        activeListRoute: buildId ? '/api/progress/active' : null,
        historyRoute: buildId ? '/api/progress/history/recent' : null,
        mode: legacyChannels.length > 0 ? 'dual-stack' : 'job-only'
      }
    };
  }

  _createRedisUnavailableError(details = {}) {
    return createAppError(503, 'REDIS_UNAVAILABLE', 'Redis 不可用，当前拒绝新的控制任务', {
      ...details,
      redis: {
        ...cacheService.getRedisState(),
        degradedAt: this.redisDegradedAt,
        degradedReason: this.redisDegradedReason,
        pendingWriteCount: this.pendingRedisWrites.length
      }
    });
  }

  _markRedisDegraded(reason) {
    this.redisDegradedAt = this.redisDegradedAt || new Date().toISOString();
    this.redisDegradedReason = reason || this.redisDegradedReason || 'Redis 写入失败';
  }

  async _executeStrictWrite(method, args) {
    let lastError = null;

    for (let attempt = 0; attempt <= REDIS_WRITE_RETRY_TIMES; attempt += 1) {
      try {
        return await cacheService[method](...args, { requireRedis: true, allowMemoryFallback: false });
      } catch (error) {
        lastError = error;
        if (attempt < REDIS_WRITE_RETRY_TIMES) {
          await this._sleep(REDIS_WRITE_RETRY_DELAY_MS);
        }
      }
    }

    throw lastError;
  }

  async _flushBufferedWritesIfReady() {
    if (!this._redisRequiredForJobs()) {
      this.pendingRedisWrites = [];
      this.redisDegradedAt = null;
      this.redisDegradedReason = null;
      return;
    }

    if (!cacheService.isRedisReady() || this.pendingRedisWrites.length === 0) {
      return;
    }

    const buffered = [...this.pendingRedisWrites];
    this.pendingRedisWrites = [];

    for (let index = 0; index < buffered.length; index += 1) {
      const item = buffered[index];
      try {
        await this._executeStrictWrite(item.method, item.args);
      } catch (error) {
        this._markRedisDegraded(error.message);
        this.pendingRedisWrites = [item, ...buffered.slice(index + 1), ...this.pendingRedisWrites];
        throw error;
      }
    }

    this.redisDegradedAt = null;
    this.redisDegradedReason = null;
  }

  async _writeCache(method, args, options = {}) {
    const { allowBufferedWrite = false } = options;

    if (!this._redisRequiredForJobs()) {
      return cacheService[method](...args);
    }

    await this._flushBufferedWritesIfReady();

    if (!cacheService.isRedisReady()) {
      if (!allowBufferedWrite) {
        throw this._createRedisUnavailableError();
      }

      this._markRedisDegraded('Redis 不可用，已写入内存恢复缓冲');
      const fallbackResult = await cacheService[method](...args);
      this.pendingRedisWrites.push({ method, args });
      return fallbackResult;
    }

    try {
      return await this._executeStrictWrite(method, args);
    } catch (error) {
      if (!allowBufferedWrite) {
        throw this._createRedisUnavailableError({ cause: error.message });
      }

      this._markRedisDegraded(error.message);
      const fallbackResult = await cacheService[method](...args);
      this.pendingRedisWrites.push({ method, args });
      return fallbackResult;
    }
  }

  async assertWritableRequestAllowed(resourceKey, details = {}) {
    if (!this._redisRequiredForJobs()) {
      const rateLimit = await this.checkRateLimit(resourceKey);
      if (rateLimit.limited) {
        throw createAppError(429, 'RATE_LIMITED', '同一资源已有运行中的任务，请稍后再试', {
          ...details,
          resourceKey,
          retryAfter: rateLimit.retryAfter,
          recentJob: rateLimit.recentJob
        }, {
          headers: {
            'Retry-After': rateLimit.retryAfter
          }
        });
      }
      return;
    }

    try {
      await this._flushBufferedWritesIfReady();
    } catch (error) {
      throw this._createRedisUnavailableError({
        ...details,
        cause: error.message
      });
    }

    if (!cacheService.isRedisReady()) {
      throw this._createRedisUnavailableError(details);
    }

    const rateLimit = await this.checkRateLimit(resourceKey);
    if (rateLimit.limited) {
      throw createAppError(429, 'RATE_LIMITED', '同一资源已有运行中的任务，请稍后再试', {
        ...details,
        resourceKey,
        retryAfter: rateLimit.retryAfter,
        recentJob: rateLimit.recentJob
      }, {
        headers: {
          'Retry-After': rateLimit.retryAfter
        }
      });
    }
  }

  async createJob(payload = {}) {
    if (this._redisRequiredForJobs()) {
      await this._flushBufferedWritesIfReady().catch(() => {
        throw this._createRedisUnavailableError();
      });

      if (!cacheService.isRedisReady()) {
        throw this._createRedisUnavailableError({
          type: payload.type,
          targetType: payload.targetType,
          targetId: payload.targetId
        });
      }
    }

    const now = new Date().toISOString();
    const job = {
      jobId: payload.jobId || this.createJobId(),
      type: payload.type || 'generic.task',
      targetType: payload.targetType || 'generic',
      targetId: payload.targetId || null,
      status: payload.status || 'pending',
      stage: payload.stage || 'prepare',
      progress: payload.progress ?? 0,
      message: payload.message || '任务已创建',
      createdAt: now,
      startedAt: payload.startedAt || null,
      finishedAt: payload.finishedAt || null,
      error: payload.error || null,
      result: payload.result || null,
      metadata: payload.metadata || {},
      parentJobId: payload.parentJobId || null,
      subJobs: payload.subJobs || [],
      summary: payload.summary || null
    };

    await this._persistJob(job);
    return job;
  }

  async deleteJob(jobId) {
    await this._writeCache('delete', [this._jobKey(jobId)], { allowBufferedWrite: true });
    await this._writeCache('removeFromSet', [ACTIVE_JOBS_KEY, jobId], { allowBufferedWrite: true });
  }

  async startJob(jobId, patch = {}) {
    const next = await this.updateJob(jobId, {
      status: 'running',
      startedAt: patch.startedAt || new Date().toISOString(),
      ...patch
    });

    const resourceKey = next.metadata?.resourceKey;
    if (resourceKey) {
      await this.markRateLimit(resourceKey, next);
    }

    return next;
  }

  async updateJob(jobId, patch = {}) {
    const current = await this.getJob(jobId);
    if (!current) {
      throw createAppError(404, 'JOB_NOT_FOUND', '任务不存在', { jobId });
    }

    const next = {
      ...current,
      ...patch,
      metadata: {
        ...current.metadata,
        ...(patch.metadata || {})
      }
    };

    await this._persistJob(next, { allowBufferedWrite: true });

    if (['pending', 'running'].includes(next.status)) {
      websocketService.broadcastJobProgress(next);
    }

    return next;
  }

  async completeJob(jobId, result = null, patch = {}) {
    const current = await this.getJob(jobId);
    if (!current) {
      throw createAppError(404, 'JOB_NOT_FOUND', '任务不存在', { jobId });
    }

    const completed = {
      ...current,
      ...patch,
      status: patch.status || 'succeeded',
      progress: patch.progress ?? 100,
      stage: patch.stage || current.stage,
      message: patch.message || current.message || '任务已完成',
      finishedAt: patch.finishedAt || new Date().toISOString(),
      result: result ?? patch.result ?? current.result,
      error: patch.error || null
    };

    await this._persistJob(completed, { completed: true, allowBufferedWrite: true });
    if (completed.metadata?.resourceKey) {
      await this.clearRateLimit(completed.metadata.resourceKey, completed.jobId);
      await this.releaseLock(completed.metadata.resourceKey, completed.jobId);
    }
    websocketService.broadcastJobCompleted(completed);
    return completed;
  }

  async failJob(jobId, error, patch = {}) {
    const current = await this.getJob(jobId);
    if (!current) {
      throw createAppError(404, 'JOB_NOT_FOUND', '任务不存在', { jobId });
    }

    const structuredError = this._toStructuredError(error, patch.code || 'INTERNAL_ERROR');
    const logSnippet = patch.logSnippet || structuredError.details?.logSnippet || this._readRecentLogSnippet(current);
    if (logSnippet) {
      structuredError.details = {
        ...structuredError.details,
        logSnippet
      };
    }
    const failed = {
      ...current,
      ...patch,
      status: patch.status || 'failed',
      stage: patch.stage || current.stage,
      message: patch.message || structuredError.message,
      finishedAt: patch.finishedAt || new Date().toISOString(),
      error: structuredError,
      result: patch.result ?? current.result
    };

    await this._persistJob(failed, { completed: true, failed: true, allowBufferedWrite: true });
    if (failed.metadata?.resourceKey) {
      await this.clearRateLimit(failed.metadata.resourceKey, failed.jobId);
      await this.releaseLock(failed.metadata.resourceKey, failed.jobId);
    }
    websocketService.broadcastJobFailed(failed);
    return failed;
  }

  async getJob(jobId) {
    const job = await cacheService.get(this._jobKey(jobId));
    return this._decorateJob(job);
  }

  async getActiveJobs() {
    const jobIds = await cacheService.getSet(ACTIVE_JOBS_KEY);
    const jobs = await Promise.all(jobIds.map((jobId) => this.getJob(jobId)));
    return jobs.filter(Boolean);
  }

  async getRecentJobs(limit = 20) {
    const jobs = await cacheService.getList(HISTORY_JOBS_KEY, 0, limit - 1);
    return jobs.map((job) => this._decorateJob(job));
  }

  async getLock(resourceKey) {
    return cacheService.get(this._lockKey(resourceKey));
  }

  async acquireLock(resourceKey, job, ttlSeconds = LOCK_TTL_SECONDS) {
    const lockValue = {
      jobId: job.jobId,
      type: job.type,
      targetId: job.targetId,
      createdAt: new Date().toISOString(),
      resourceKey
    };

    try {
      const acquired = await this._writeCache('setIfNotExists', [this._lockKey(resourceKey), lockValue, ttlSeconds], {
        allowBufferedWrite: false
      });
      if (!acquired) {
        const currentLock = await this.getLock(resourceKey);
        return { acquired: false, lock: currentLock };
      }
    } catch (error) {
      if (error.code === 'REDIS_UNAVAILABLE') {
        throw error;
      }
      throw this._createRedisUnavailableError({ resourceKey, cause: error.message });
    }

    return { acquired: true, lock: lockValue };
  }

  async renewLock(resourceKey, jobId, ttlSeconds = LOCK_TTL_SECONDS) {
    const currentLock = await this.getLock(resourceKey);
    if (!currentLock || currentLock.jobId !== jobId) {
      return false;
    }

    return this._writeCache('expire', [this._lockKey(resourceKey), ttlSeconds], { allowBufferedWrite: true });
  }

  async releaseLock(resourceKey, jobId) {
    const currentLock = await this.getLock(resourceKey);
    if (!currentLock) {
      return true;
    }

    if (currentLock.jobId !== jobId) {
      return false;
    }

    await this._writeCache('delete', [this._lockKey(resourceKey)], { allowBufferedWrite: true });
    return true;
  }

  async checkRateLimit(resourceKey) {
    const entry = await cacheService.get(this._rateKey(resourceKey));
    if (!entry) {
      return { limited: false, retryAfter: 0, recentJob: null };
    }

    const recentJob = entry.jobId ? await this.getJob(entry.jobId) : null;
    if (!recentJob || !['pending', 'running'].includes(recentJob.status)) {
      await this._writeCache('delete', [this._rateKey(resourceKey)], { allowBufferedWrite: true });
      return { limited: false, retryAfter: 0, recentJob: null };
    }

    const retryAfter = Math.max(
      1,
      Math.ceil(((entry.expiresAt ? new Date(entry.expiresAt).getTime() : Date.now()) - Date.now()) / 1000)
    );

    return {
      limited: true,
      retryAfter,
      recentJob: {
        jobId: recentJob.jobId,
        type: recentJob.type,
        status: recentJob.status,
        stage: recentJob.stage,
        targetType: recentJob.targetType,
        targetId: recentJob.targetId,
        startedAt: recentJob.startedAt,
        message: recentJob.message
      }
    };
  }

  async markRateLimit(resourceKey, job, ttlSeconds = RATE_LIMIT_TTL_SECONDS) {
    if (!resourceKey) {
      return;
    }

    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    await this._writeCache('set', [this._rateKey(resourceKey), {
      jobId: job.jobId,
      resourceKey,
      startedAt: job.startedAt || new Date().toISOString(),
      expiresAt
    }, ttlSeconds], {
      allowBufferedWrite: true
    });
  }

  async clearRateLimit(resourceKey, jobId) {
    if (!resourceKey) {
      return true;
    }

    const current = await cacheService.get(this._rateKey(resourceKey));
    if (!current) {
      return true;
    }

    if (jobId && current.jobId && current.jobId !== jobId) {
      return false;
    }

    await this._writeCache('delete', [this._rateKey(resourceKey)], { allowBufferedWrite: true });
    return true;
  }

  async cleanupOrphanResourceState(activeJobs = null) {
    const activeJobList = activeJobs || await this.getActiveJobs();
    const activeJobMap = new Map(activeJobList.map((job) => [job.jobId, job]));
    const cleanedLocks = [];
    const cleanedRates = [];

    const lockKeys = await cacheService.listKeys('lock:');
    for (const lockKey of lockKeys) {
      const lockValue = await cacheService.get(lockKey);
      if (!lockValue?.jobId) {
        await this._writeCache('delete', [lockKey], { allowBufferedWrite: true });
        cleanedLocks.push({ key: lockKey, reason: 'empty_lock_value' });
        continue;
      }

      const relatedJob = activeJobMap.get(lockValue.jobId) || await this.getJob(lockValue.jobId);
      if (!relatedJob || !['pending', 'running'].includes(relatedJob.status)) {
        await this._writeCache('delete', [lockKey], { allowBufferedWrite: true });
        cleanedLocks.push({
          key: lockKey,
          jobId: lockValue.jobId,
          reason: relatedJob ? 'job_not_active' : 'job_missing'
        });
      }
    }

    const rateKeys = await cacheService.listKeys('rate:');
    for (const rateKey of rateKeys) {
      const rateValue = await cacheService.get(rateKey);
      const rateJobId = rateValue?.jobId;
      const relatedJob = rateJobId ? (activeJobMap.get(rateJobId) || await this.getJob(rateJobId)) : null;
      if (!rateJobId || !relatedJob || !['pending', 'running'].includes(relatedJob.status)) {
        await this._writeCache('delete', [rateKey], { allowBufferedWrite: true });
        cleanedRates.push({
          key: rateKey,
          jobId: rateJobId || null,
          reason: rateJobId ? (relatedJob ? 'job_not_active' : 'job_missing') : 'empty_rate_value'
        });
      }
    }

    return {
      cleanedLocks,
      cleanedRates
    };
  }

  async recoverActiveJobs() {
    const activeJobs = await this.getActiveJobs();
    const cleanup = await this.cleanupOrphanResourceState(activeJobs);

    if (activeJobs.length === 0) {
      return {
        recoveredJobs: [],
        cleanup
      };
    }

    const recoveredJobs = [];
    const processManager = require('./processManager');

    for (const job of activeJobs) {
      let recovered;
      if (job.type.startsWith('service.') && job.targetType === 'service' && job.targetId) {
        const status = await processManager.getStatus(job.targetId);
        recovered = await this.completeJob(job.jobId, {
          recovered: true,
          serviceStatus: status
        }, {
          status: status.running ? 'succeeded_after_recovery' : 'interrupted',
          stage: 'recovery',
          message: status.running ? '服务状态已在恢复扫描中收敛' : '任务在服务重启后被中断，需要人工确认'
        });
      } else {
        recovered = await this.completeJob(job.jobId, {
          recovered: true
        }, {
          status: 'interrupted',
          stage: 'recovery',
          message: '任务在控制面板重启后被中断，需要人工确认'
        });
      }
      recoveredJobs.push(recovered);
    }

    return {
      recoveredJobs,
      cleanup
    };
  }

  async _persistJob(job, options = {}) {
    const ttlSeconds = options.failed ? FAILED_JOB_TTL_SECONDS : JOB_TTL_SECONDS;
    const allowBufferedWrite = options.allowBufferedWrite === true;

    await this._writeCache('set', [this._jobKey(job.jobId), job, ttlSeconds], { allowBufferedWrite });

    if (['pending', 'running'].includes(job.status)) {
      await this._writeCache('addToSet', [ACTIVE_JOBS_KEY, job.jobId], { allowBufferedWrite });
      return;
    }

    await this._writeCache('removeFromSet', [ACTIVE_JOBS_KEY, job.jobId], { allowBufferedWrite });
    await this._writeCache('pushToList', [HISTORY_JOBS_KEY, {
      jobId: job.jobId,
      type: job.type,
      targetType: job.targetType,
      targetId: job.targetId,
      status: job.status,
      stage: job.stage,
      message: job.message,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      error: job.error,
      result: job.result
    }, JOB_HISTORY_LIMIT], { allowBufferedWrite });
  }

  destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

module.exports = new JobService();
