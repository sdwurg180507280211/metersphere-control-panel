const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../..');
function temp(t) {
  // macOS /var is an alias of /private/var; real inspectors return canonical cwd.
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-reliability-test-')));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function load(relative, mocks = {}, globals = {}) {
  const file = path.join(root, relative);
  const module = { exports: {} };
  const native = createRequire(file);
  const sandbox = { module, exports: module.exports, require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : native(name),
    __dirname: path.dirname(file), __filename: file, process, console, Buffer, URL, URLSearchParams,
    AbortController, AbortSignal, Headers, Response, setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, structuredClone, ...globals };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  return module.exports;
}
module.exports = { root, temp, load };
