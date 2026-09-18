const { buildProblems } = require('../services/workspaceModel');

describe('Workspace problem model', () => {
  it('应该把基础设施不可达识别为阻塞问题', () => {
    const problems = buildProblems({
      infrastructure: {
        mysql: { name: 'MySQL', reachable: false, host: '127.0.0.1', port: 3306, error: 'ECONNREFUSED' }
      },
      services: [],
      validation: { errors: [], warnings: [] }
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      id: 'infra:mysql',
      severity: 'blocker',
      source: 'infrastructure'
    });
  });

  it('应该只把运行中且健康检查失败的服务列为健康问题', () => {
    const problems = buildProblems({
      infrastructure: {},
      services: [
        { id: 'gateway', name: '网关', running: true, phase: 'running', health: { healthy: false, error: 'HTTP 503' } },
        { id: 'project', name: '项目管理', running: false, phase: 'stopped', health: { healthy: false } }
      ],
      validation: { errors: [], warnings: [] }
    });

    expect(problems).toHaveLength(1);
    expect(problems[0].id).toBe('health:gateway');
  });

  it('应该优先返回 blocker 和 error，再返回 warning', () => {
    const problems = buildProblems({
      infrastructure: {
        redis: { name: 'Redis', reachable: false, host: '127.0.0.1', port: 6379 }
      },
      services: [],
      validation: {
        errors: [{ path: 'projectRoot', message: '项目路径不存在' }],
        warnings: [{ path: 'package', message: '未配置打包脚本' }]
      }
    });

    expect(problems.map((problem) => problem.severity)).toEqual(['blocker', 'error', 'warning']);
  });
});
