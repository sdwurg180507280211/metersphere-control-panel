// Isolated browser QA: serves the built UI with synthetic APIs only.
// Never loads the backend, user config, shell commands or a database.
const express = require('express');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { WebSocketServer } = require('ws');
const app = express();
const server = http.createServer(app);
const ws = new WebSocketServer({ server, path: '/ws' });
const operations = [];
let queries = 0, cancellations = 0, connections = 0, disconnected = false;
app.use(express.json());
ws.on('connection', (socket) => {
  connections++;
  if (disconnected) { socket.close(1012, 'fixture interruption'); return; }
  socket.send(JSON.stringify({ type: 'connected', clientId: 'fixture' }));
  socket.on('message', () => {});
});
app.post('/__fixture/connection/:state', (req, res) => {
  disconnected = req.params.state === 'offline';
  if (disconnected) for (const socket of ws.clients) socket.close(1012, 'fixture interruption');
  res.json({ disconnected });
});
app.get('/__fixture/evidence', (_req, res) => res.json({ operations, queries, cancellations, connections }));
app.post('/api/projects/commands/:id/:action', (req, res) => {
  operations.push(req.params.action);
  res.json({ success: true, data: { id: 'fixture', running: null, statusKnown: false, phase: 'unknown', commandIssued: true } });
});
app.post('/api/sql/query', (req, res) => {
  queries++;
  const timer = setTimeout(() => res.json({ success: true, columns: ['value'], rows: [{ value: 1 }], rowCount: 1, rowCountExact: false, truncated: true, executionTime: 10000 }), 10000);
  res.on('close', () => { clearTimeout(timer); if (!res.writableEnded) cancellations++; });
});
app.get('/api/sql/status', (_req, res) => res.json({ connected: true, readonlyVerified: true, database: 'fixture', host: 'fixture-only' }));
const routes = {
  '/api/projects/commands': [{ id: 'fixture', type: 'command', name: '测试项目（无状态端口）', startCommand: 'fixture-start — never executed', stopCommand: 'fixture-stop — never executed' }],
  '/api/projects/commands/status': { fixture: { id: 'fixture', running: null, statusKnown: false, phase: 'unknown' } },
  '/api/projects/metersphere': { id: 'metersphere', type: 'metersphere', name: 'MeterSphere' },
  '/api/services/catalog': [], '/api/services/status': {}, '/api/services/infra/status': {},
  '/api/logs/commands': [], '/api/progress/active': [], '/api/package/active': null,
  '/api/build/modules': [], '/api/build/dev-server/status': {},
  '/api/services/tunnel/status': { status: 'stopped' },
  '/api/services/desktop-update/info': { currentVersion: 'fixture', installSupported: false }
};
app.get('/api/config', (_req, res) => {
  const editable = { port: 3000, projectRoot: '/fixture/metersphere', maxLogLines: 1000, services: {}, redis: {}, package: {}, properties: {}, jvmOptions: {}, claudeCode: {} };
  res.json({ success: true, data: { editable, resolved: editable, runtime: {}, diagnostics: {}, meta: { revision: 'fixture' }, validation: { valid: true, errors: [], warnings: [] } } });
});
for (const [url, data] of Object.entries(routes)) app.get(url, (_req, res) => res.json({ success: true, data }));
app.use('/api', (_req, res) => res.status(404).json({ success: false, error: 'Unsupported fixture API' }));
app.get('/vite.svg', (_req, res) => res.status(204).end());
app.get('/', (_req, res) => {
  const html = fs.readFileSync(path.resolve(__dirname, '../../frontend/dist/index.html'), 'utf8');
  const notice = '<div role="note" style="position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#713f12;color:#fef3c7;padding:8px;text-align:center;font:14px sans-serif;pointer-events:none">隔离测试 · 非真实项目 · 不连接本地 MeterSphere / DeepSeek / 数据库</div>';
  res.type('html').send(html.replace('</body>', notice + '</body>'));
});
app.use(express.static(path.resolve(__dirname, '../../frontend/dist')));
server.listen(0, '127.0.0.1', () => console.log(`Fixture URL: http://127.0.0.1:${server.address().port}/#project=fixture&tab=overview`));
function close() { for (const socket of ws.clients) socket.terminate(); ws.close(); server.close(); server.closeAllConnections(); }
process.on('SIGTERM', close);
process.on('SIGINT', close);
