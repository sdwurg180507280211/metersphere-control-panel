const jobService = require('../services/jobService');

describe('JobService', () => {
  describe('createJobId', () => {
    it('应该生成唯一的任务 ID', () => {
      const id1 = jobService.createJobId();
      const id2 = jobService.createJobId();

      expect(id1).toMatch(/^job_[a-f0-9]{32}$/);
      expect(id2).toMatch(/^job_[a-f0-9]{32}$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('_toStructuredError', () => {
    it('应该转换标准错误对象', () => {
      const error = new Error('测试错误');
      const result = jobService._toStructuredError(error);

      expect(result).toHaveProperty('code');
      expect(result).toHaveProperty('message', '测试错误');
      expect(result).toHaveProperty('details');
    });

    it('应该处理已结构化的错误', () => {
      const error = { code: 'TEST_ERROR', message: '测试', details: { foo: 'bar' } };
      const result = jobService._toStructuredError(error);

      expect(result.code).toBe('TEST_ERROR');
      expect(result.message).toBe('测试');
      expect(result.details.foo).toBe('bar');
    });
  });
});
