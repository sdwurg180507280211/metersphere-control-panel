const fs = require('fs');
const os = require('os');
const path = require('path');

const originalConfigPath = process.env.MS_CONFIG_PATH;
const tempRoots = [];

function writeConfig(configPath, value) {
  fs.writeFileSync(configPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

function readConfig(configPath) {
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function loadServices(initialConfig) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-project-config-'));
  const configPath = path.join(root, 'config.json');
  tempRoots.push(root);
  writeConfig(configPath, initialConfig);
  process.env.MS_CONFIG_PATH = configPath;
  jest.resetModules();
  return {
    configPath,
    configService: require('../services/desktopAppConfigService'),
    runtimeService: require('../services/desktopAppService')
  };
}

afterEach(() => {
  if (originalConfigPath === undefined) delete process.env.MS_CONFIG_PATH;
  else process.env.MS_CONFIG_PATH = originalConfigPath;
  jest.resetModules();
  while (tempRoots.length > 0) {
    fs.rmSync(tempRoots.pop(), { recursive: true, force: true });
  }
});

describe('Command project config migration', () => {
  test('reads legacy desktopApplications without mutating the file', () => {
    const initial = {
      projectRoot: '/tmp/metersphere',
      desktopApplications: {
        deepseek: {
          name: 'DeepSeek Harness',
          startCommand: 'npm start',
          stopCommand: 'npm stop',
          statusPort: 3080
        }
      }
    };
    const { configPath, configService } = loadServices(initial);

    expect(configService.getApps()).toEqual([{
      id: 'deepseek',
      type: 'command',
      name: 'DeepSeek Harness',
      startCommand: 'npm start',
      stopCommand: 'npm stop',
      statusPort: 3080
    }]);
    expect(readConfig(configPath)).toEqual(initial);
  });

  test('reads only command entries from projects', () => {
    const { configService } = loadServices({
      projects: {
        deepseek: {
          type: 'command',
          name: 'DeepSeek Harness',
          startCommand: 'npm start',
          stopCommand: 'npm stop'
        },
        advanced: {
          type: 'metersphere',
          name: 'Advanced Workspace'
        }
      }
    });

    expect(configService.getApps()).toEqual([
      expect.objectContaining({ id: 'deepseek', type: 'command', statusPort: null })
    ]);
    expect(configService.hasApp('advanced')).toBe(false);
  });

  test('projects is the source of truth when both schemas exist', () => {
    const { configService } = loadServices({
      projects: {
        current: {
          type: 'command',
          name: 'Current',
          startCommand: 'current-start',
          stopCommand: 'current-stop'
        }
      },
      desktopApplications: {
        legacy: {
          name: 'Legacy',
          startCommand: 'legacy-start',
          stopCommand: 'legacy-stop'
        }
      }
    });

    expect(configService.getApps().map((item) => item.id)).toEqual(['current']);
    expect(configService.hasApp('legacy')).toBe(false);
  });

  test('adding a project migrates every legacy command project into projects', () => {
    const { configPath, configService } = loadServices({
      projectRoot: '/workspace/metersphere',
      services: { gateway: { name: 'Gateway', port: 8001 } },
      desktopApplications: {
        deepseek: {
          name: 'DeepSeek Harness',
          startCommand: 'deepseek-start',
          stopCommand: 'deepseek-stop'
        }
      }
    });

    const saved = configService.saveApp({
      name: 'Node API',
      startCommand: 'node server.js',
      stopCommand: 'pkill -f server.js',
      statusPort: 8080
    });
    const raw = readConfig(configPath);

    expect(raw.desktopApplications).toBeUndefined();
    expect(raw.projectRoot).toBe('/workspace/metersphere');
    expect(raw.services).toEqual({ gateway: { name: 'Gateway', port: 8001 } });
    expect(raw.projects.deepseek).toMatchObject({ type: 'command', name: 'DeepSeek Harness' });
    expect(raw.projects[saved.id]).toMatchObject({ type: 'command', name: 'Node API', statusPort: 8080 });
  });

  test('editing a legacy project performs the natural migration', () => {
    const { configPath, configService } = loadServices({
      desktopApplications: {
        deepseek: {
          name: 'DeepSeek Harness',
          startCommand: 'old-start',
          stopCommand: 'old-stop'
        }
      }
    });

    configService.saveApp({
      id: 'deepseek',
      name: 'DeepSeek Harness 2',
      startCommand: 'new-start',
      stopCommand: 'new-stop'
    });
    const raw = readConfig(configPath);

    expect(raw.desktopApplications).toBeUndefined();
    expect(raw.projects.deepseek).toEqual({
      type: 'command',
      name: 'DeepSeek Harness 2',
      startCommand: 'new-start',
      stopCommand: 'new-stop'
    });
  });

  test('deleting the final legacy project leaves projects as the source of truth', () => {
    const { configPath, configService } = loadServices({
      desktopApplications: {
        deepseek: {
          name: 'DeepSeek Harness',
          startCommand: 'deepseek-start',
          stopCommand: 'deepseek-stop'
        }
      }
    });

    configService.removeApp('deepseek');
    expect(readConfig(configPath)).toMatchObject({ projects: {} });
    expect(readConfig(configPath).desktopApplications).toBeUndefined();

    jest.resetModules();
    process.env.MS_CONFIG_PATH = configPath;
    const reloaded = require('../services/desktopAppConfigService');
    expect(reloaded.getApps()).toEqual([]);
  });

  test('ignores non-command projects, rejects unsupported writes and preserves their ids', () => {
    const { configPath, configService } = loadServices({
      projects: {
        advanced: {
          type: 'metersphere',
          name: 'Advanced Workspace'
        }
      }
    });

    expect(configService.hasApp('advanced')).toBe(false);
    let unsupportedError;
    try {
      configService.saveApp({
        type: 'python',
        name: 'Python Project',
        startCommand: 'python app.py',
        stopCommand: 'pkill python'
      });
    } catch (error) {
      unsupportedError = error;
    }
    expect(unsupportedError).toMatchObject({ code: 'DESKTOP_APP_TYPE_UNSUPPORTED' });

    const saved = configService.saveApp({
      name: 'Advanced',
      startCommand: 'command-start',
      stopCommand: 'command-stop'
    });
    const raw = readConfig(configPath);
    expect(saved.id).not.toBe('advanced');
    expect(raw.projects.advanced.type).toBe('metersphere');
    expect(raw.projects[saved.id].type).toBe('command');
  });

  test('statusPort remains optional and preserves unknown/manual-running runtime semantics', async () => {
    const { runtimeService } = loadServices({
      projects: {
        manual: {
          type: 'command',
          name: 'Manual Project',
          startCommand: 'manual-start',
          stopCommand: 'manual-stop'
        }
      }
    });

    await expect(runtimeService.getStatus('manual')).resolves.toEqual({
      id: 'manual',
      running: null,
      statusKnown: false,
      phase: 'unknown',
      port: null
    });
  });
});
