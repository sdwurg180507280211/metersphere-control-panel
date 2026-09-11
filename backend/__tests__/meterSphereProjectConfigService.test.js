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

function loadService(initialConfig) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'metersphere-project-config-'));
  const configPath = path.join(root, 'config.json');
  tempRoots.push(root);
  writeConfig(configPath, initialConfig);
  process.env.MS_CONFIG_PATH = configPath;
  jest.resetModules();
  return {
    configPath,
    service: require('../services/meterSphereProjectConfigService')
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

describe('MeterSphere Project record persistence', () => {
  test('returns builtin fallback for legacy config without mutating config content', () => {
    const initial = {
      projectRoot: '/workspace/metersphere',
      services: { gateway: { port: 8001 } },
      desktopApplications: {
        deepseek: {
          name: 'DeepSeek',
          startCommand: 'start',
          stopCommand: 'stop'
        }
      }
    };
    const { configPath, service } = loadService(initial);

    expect(service.getProject()).toEqual({
      project: { id: 'metersphere', type: 'metersphere', name: 'MeterSphere' },
      persisted: false
    });
    expect(readConfig(configPath)).toEqual(initial);
  });

  test('prefers persisted MeterSphere record and strips fields outside the metadata allowlist', () => {
    const initial = {
      projectRoot: '/real-root',
      projects: {
        metersphere: {
          type: 'metersphere',
          name: 'MeterSphere Local',
          projectRoot: '/bad-value',
          services: { bad: true },
          package: { bad: true },
          properties: { bad: true },
          startCommand: 'bad-start',
          stopCommand: 'bad-stop',
          statusPort: 9000,
          source: 'persisted',
          id: 'bad-id'
        }
      }
    };
    const { configPath, service } = loadService(initial);

    expect(service.getProject()).toEqual({
      project: { id: 'metersphere', type: 'metersphere', name: 'MeterSphere Local' },
      persisted: true
    });
    expect(readConfig(configPath)).toEqual(initial);
  });

  test('PUT materializes only MeterSphere metadata and preserves operational top-level config', () => {
    const { configPath, service } = loadService({
      projectRoot: '/workspace/metersphere',
      services: { gateway: { port: 8001 } },
      package: { target: 'desktop' },
      properties: { env: 'local' },
      projects: {
        deepseek: {
          type: 'command',
          name: 'DeepSeek',
          startCommand: 'start',
          stopCommand: 'stop'
        }
      }
    });

    const saved = service.saveProject({
      id: 'wrong-id',
      type: 'command',
      name: '  MeterSphere Dev  ',
      source: 'persisted',
      projectRoot: '/bad-value',
      services: { bad: true },
      startCommand: 'bad-start',
      stopCommand: 'bad-stop',
      statusPort: 9999
    });
    const raw = readConfig(configPath);

    expect(saved).toEqual({
      project: { id: 'metersphere', type: 'metersphere', name: 'MeterSphere Dev' },
      persisted: true
    });
    expect(raw.projects.metersphere).toEqual({
      type: 'metersphere',
      name: 'MeterSphere Dev'
    });
    expect(raw.projects.deepseek.type).toBe('command');
    expect(raw.projectRoot).toBe('/workspace/metersphere');
    expect(raw.services).toEqual({ gateway: { port: 8001 } });
    expect(raw.package).toEqual({ target: 'desktop' });
    expect(raw.properties).toEqual({ env: 'local' });
  });

  test('first MeterSphere PUT naturally migrates legacy command definitions before projects becomes source of truth', () => {
    const { configPath, service } = loadService({
      projectRoot: '/workspace/metersphere',
      desktopApplications: {
        deepseek: {
          name: 'DeepSeek Harness',
          startCommand: 'legacy-start',
          stopCommand: 'legacy-stop',
          statusPort: 3080
        }
      }
    });

    service.saveProject({ name: 'MeterSphere' });
    const raw = readConfig(configPath);

    expect(raw.desktopApplications).toBeUndefined();
    expect(raw.projectRoot).toBe('/workspace/metersphere');
    expect(raw.projects.deepseek).toEqual({
      type: 'command',
      name: 'DeepSeek Harness',
      startCommand: 'legacy-start',
      stopCommand: 'legacy-stop',
      statusPort: 3080
    });
    expect(raw.projects.metersphere).toEqual({ type: 'metersphere', name: 'MeterSphere' });
  });

  test('PUT preserves unrelated persisted projects', () => {
    const { configPath, service } = loadService({
      projects: {
        deepseek: { type: 'command', name: 'DeepSeek', startCommand: 'start', stopCommand: 'stop' },
        advanced: { type: 'python', name: 'Reserved for later' }
      }
    });

    service.saveProject({ name: 'MeterSphere Local' });
    const raw = readConfig(configPath);

    expect(raw.projects.deepseek.type).toBe('command');
    expect(raw.projects.advanced).toEqual({ type: 'python', name: 'Reserved for later' });
    expect(raw.projects.metersphere).toEqual({ type: 'metersphere', name: 'MeterSphere Local' });
  });

  test('does not overwrite an existing non-MeterSphere project at the reserved key', () => {
    const { configPath, service } = loadService({
      projects: {
        metersphere: {
          type: 'command',
          name: 'Conflicting Command',
          startCommand: 'start',
          stopCommand: 'stop'
        }
      }
    });

    let conflictError;
    try {
      service.saveProject({ name: 'MeterSphere' });
    } catch (error) {
      conflictError = error;
    }
    expect(conflictError).toMatchObject({ code: 'METERSPHERE_PROJECT_ID_CONFLICT', statusCode: 409 });
    expect(readConfig(configPath).projects.metersphere.type).toBe('command');
  });
});
