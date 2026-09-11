const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
}

describe('Command Project API canonicalization', () => {
  test('legacy controller is a pure alias of the canonical controller', () => {
    const canonicalController = require('../controllers/commandProjectController');
    const legacyController = require('../controllers/desktopAppController');

    expect(legacyController).toBe(canonicalController);
  });

  test('canonical and legacy routes map the same operations to the same controller methods', () => {
    const canonicalRoutes = read('backend/routes/commandProjects.js');
    const legacyRoutes = read('backend/routes/services.js');

    expect(canonicalRoutes).toContain("router.get('/', commandProjectController.getCatalog)");
    expect(canonicalRoutes).toContain("router.post('/', commandProjectController.save)");
    expect(canonicalRoutes).toContain("router.get('/status', commandProjectController.getAllStatus)");
    expect(canonicalRoutes).toContain("router.post('/:id/start', commandProjectController.start)");
    expect(canonicalRoutes).toContain("router.post('/:id/stop', commandProjectController.stop)");
    expect(canonicalRoutes).toContain("router.delete('/:id', commandProjectController.remove)");

    expect(legacyRoutes).toContain("router.get('/desktop-apps/catalog', desktopAppController.getCatalog)");
    expect(legacyRoutes).toContain("router.get('/desktop-apps/status', desktopAppController.getAllStatus)");
    expect(legacyRoutes).toContain("router.post('/desktop-apps', desktopAppController.save)");
    expect(legacyRoutes).toContain("router.post('/desktop-apps/:id/start', desktopAppController.start)");
    expect(legacyRoutes).toContain("router.post('/desktop-apps/:id/stop', desktopAppController.stop)");
    expect(legacyRoutes).toContain("router.delete('/desktop-apps/:id', desktopAppController.remove)");
  });

  test('server mounts the canonical route without changing the legacy services mount', () => {
    const serverSource = read('backend/server.js');
    expect(serverSource).toContain("const commandProjectRoutes = require('./routes/commandProjects')");
    expect(serverSource).toContain("app.use('/api/projects/commands', commandProjectRoutes)");
    expect(serverSource).toContain("app.use('/api/services', serviceRoutes)");
  });

  test('Project Center uses canonical Command API while MeterSphere API stays unchanged', () => {
    const shellSource = read('frontend/src/components/DesktopShell.jsx');
    const editorSource = read('frontend/src/components/DesktopAppEditor.jsx');
    const frontendSource = `${shellSource}\n${editorSource}`;

    expect(frontendSource).not.toContain('/api/services/desktop-apps');
    expect(shellSource).toContain("requestJson('/api/projects/commands')");
    expect(shellSource).toContain("requestJson('/api/projects/commands/status')");
    expect(shellSource).toContain('/api/projects/commands/${encodeURIComponent(id)}/${action}');
    expect(editorSource).toContain("requestJson('/api/projects/commands'");
    expect(editorSource).toContain('/api/projects/commands/${encodeURIComponent(form.id)}');

    expect(shellSource).toContain("requestJson('/api/services/catalog')");
    expect(shellSource).toContain("requestJson('/api/services/status')");
  });

  test('historical DESKTOP_APP error contract remains in the Command Project domain', () => {
    const controllerSource = read('backend/controllers/commandProjectController.js');
    const runtimeSource = read('backend/services/commandProjectService.js');
    const configSource = read('backend/services/commandProjectConfigService.js');
    const combined = `${controllerSource}\n${runtimeSource}\n${configSource}`;

    expect(combined).toContain('DESKTOP_APP_NOT_FOUND');
    expect(combined).toContain('DESKTOP_APP_RUNNING');
    expect(combined).toContain('DESKTOP_APP_TYPE_UNSUPPORTED');
    expect(combined).not.toContain('COMMAND_PROJECT_NOT_FOUND');
  });
});
