const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
}

describe('MeterSphere Project record API contract', () => {
  test('canonical resource exposes GET and PUT only', () => {
    const routes = read('backend/routes/meterSphereProject.js');

    expect(routes).toContain("router.get('/', meterSphereProjectController.get)");
    expect(routes).toContain("router.put('/', meterSphereProjectController.save)");
    expect(routes).not.toContain('router.delete');
    expect(routes).not.toContain("'/start'");
    expect(routes).not.toContain("'/stop'");
  });

  test('server mounts the fixed MeterSphere Project resource beside Command Project API', () => {
    const serverSource = read('backend/server.js');

    expect(serverSource).toContain("const meterSphereProjectRoutes = require('./routes/meterSphereProject')");
    expect(serverSource).toContain("app.use('/api/projects/metersphere', meterSphereProjectRoutes)");
    expect(serverSource).toContain("app.use('/api/projects/commands', commandProjectRoutes)");
  });

  test('Project Center reads MeterSphere project identity from canonical API while operational APIs stay unchanged', () => {
    const shellSource = read('frontend/src/components/DesktopShell.jsx');

    expect(shellSource).toContain("requestJson('/api/projects/metersphere')");
    expect(shellSource).toContain("requestJson('/api/services/catalog')");
    expect(shellSource).toContain("requestJson('/api/services/status')");
    expect(shellSource).not.toContain("requestJson('/api/projects/metersphere/start')");
    expect(shellSource).not.toContain("requestJson('/api/projects/metersphere/stop')");
  });

  test('MeterSphere persistence remains separate from Command Project domain', () => {
    const meterSphereService = read('backend/services/meterSphereProjectConfigService.js');
    const commandService = read('backend/services/commandProjectConfigService.js');

    expect(meterSphereService).not.toContain("require('./commandProjectConfigService')");
    expect(commandService).not.toContain('meterSphereProjectConfigService');
    expect(commandService).not.toContain('METERSPHERE_PROJECT_TYPE');
  });

  test('source stays a frontend view-model concern rather than persisted MeterSphere metadata', () => {
    const serviceSource = read('backend/services/meterSphereProjectConfigService.js');
    const modelSource = read('frontend/src/projectModel.js');

    expect(serviceSource).not.toContain("source: 'persisted'");
    expect(serviceSource).not.toContain("source: 'builtin'");
    expect(modelSource).toContain('PROJECT_SOURCES.PERSISTED');
    expect(modelSource).toContain('PROJECT_SOURCES.BUILTIN');
  });
});
