const cacheService = require('../services/cacheService');

describe('CacheService', () => {
  beforeEach(() => {
    cacheService.clear();
  });

  describe('set and get', () => {
    it('应该能存储和获取值', async () => {
      await cacheService.set('test-key', 'test-value');
      const value = await cacheService.get('test-key');
      expect(value).toBe('test-value');
    });

    it('应该能存储对象', async () => {
      const obj = { foo: 'bar', num: 123 };
      await cacheService.set('test-obj', obj);
      const value = await cacheService.get('test-obj');
      expect(value).toEqual(obj);
    });
  });

  describe('delete', () => {
    it('应该能删除键', async () => {
      await cacheService.set('test-key', 'value');
      await cacheService.delete('test-key');
      const value = await cacheService.get('test-key');
      expect(value).toBeNull();
    });
  });
});
