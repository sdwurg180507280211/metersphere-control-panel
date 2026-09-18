import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transformSync } from 'esbuild'
import * as presentation from '../src/utils/servicePresentation.js'
import { SERVICE_BUSY_PHASES } from '../src/store/useAppStore.js'

const file = new URL('../src/components/ServiceCard.jsx', import.meta.url)
const nativeRequire = createRequire(file)
const module = { exports: {} }
const source = transformSync(fs.readFileSync(file, 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'cjs' }).code
vm.runInNewContext(source, { module, exports: module.exports, require: (name) => {
  if (name.endsWith('.css')) return {}
  if (name === '../store/useAppStore') return { SERVICE_BUSY_PHASES }
  if (name === '../utils/servicePresentation') return presentation
  return nativeRequire(name)
} })
const Card = module.exports.default
function render(status, props = {}) {
  return renderToStaticMarkup(React.createElement(Card, { service: { id: 'gateway', name: '网关' }, status, ...props }))
}

test('compact card separates lifecycle, health and explicit actions without a clickable card body', () => {
  const html = render({ phase: 'running', running: true, processAlive: true, health: { healthy: false, error: 'HTTP 503' } })
  assert.match(html, /运行中/)
  assert.match(html, /HTTP 503/)
  assert.match(html, /aria-label="停止 网关"/)
  assert.match(html, /aria-label="重启 网关"/)
  assert.doesNotMatch(html, /service-btn-main|点击停止|重新检查|service-diagnostics/)
})
test('failed-but-running service retains stop and explicit restart', () => {
  const html = render({ phase: 'failed', running: true })
  assert.match(html, /aria-label="停止 网关"/)
  assert.match(html, /aria-label="重启 网关"/)
  assert.doesNotMatch(html, /aria-label="启动 网关"/)
})
test('stopped failure retains start, stop cleanup and restart controls', () => {
  const html = render({ phase: 'failed', running: false })
  for (const action of ['启动', '停止', '重启']) assert.match(html, new RegExp(`aria-label="${action} 网关"`))
})
test('busy lifecycle phases disable destructive actions but keep logs and details available', () => {
  for (const phase of SERVICE_BUSY_PHASES) {
    const html = render({ phase, running: true })
    assert.match(html, /aria-label="停止 网关" disabled=""/)
    assert.match(html, /aria-label="重启 网关" disabled=""/)
    assert.doesNotMatch(html, /aria-label="查看 网关 的服务日志"[^>]*disabled/)
    assert.match(html, /aria-haspopup="dialog"/)
  }
})
test('selected log target has visible and accessible state', () => {
  const html = render({ phase: 'stopped' }, { selected: true })
  assert.match(html, /is-log-selected/)
  assert.match(html, /正在查看日志/)
  assert.match(html, /aria-pressed="true"/)
  assert.doesNotMatch(render({ phase: 'stopped' }), /is-log-selected/)
})
test('unknown and stale compact observations cannot claim healthy confirmation', () => {
  assert.match(presentation.compactServicePresentation({ running: true }).summary, /健康状态未知/)
  const view = presentation.compactServicePresentation({ processAlive: true, health: { healthy: true } }, true)
  assert.match(view.summary, /待刷新/)
  assert.equal(view.summaryTone, 'unknown')
  assert.match(render({ phase: 'running' }, { stale: true }), /待刷新/)
})
test('stale error remains visible as previous evidence, not a current diagnosis', () => {
  const view = presentation.compactServicePresentation({ error: 'HTTP 503', healthStale: true })
  assert.match(view.summary, /状态待刷新.*上次异常.*503/)
  assert.equal(view.summaryTone, 'unknown')
})
test('unready dependencies have a compact hint and stale dependency evidence does not', () => {
  const status = { phase: 'running', dependencyStatus: { ready: false } }
  assert.match(render(status), /依赖提示/)
  assert.doesNotMatch(render({ ...status, dependencyStatusStale: true }), /依赖提示/)
})

test('development StrictMode close event cannot dismiss a reopened diagnostic drawer', () => {
  const drawerFile = new URL('../src/components/ServiceDiagnostics.jsx', import.meta.url)
  const drawerModule = { exports: {} }
  let effect, closed = 0
  const dialog = { open: false, showModal() { this.open = true }, close() { this.open = false } }
  const code = transformSync(fs.readFileSync(drawerFile, 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'cjs' }).code
  vm.runInNewContext(code, { module: drawerModule, exports: drawerModule.exports, document: { body: {} }, require: (name) => {
    if (name === 'react') return { useEffect: (fn) => { effect = fn }, useRef: () => ({ current: dialog }) }
    if (name === 'react-dom') return { createPortal: (node) => node }
    if (name === '../utils/servicePresentation') return presentation
    if (name.endsWith('.css')) return {}
    return nativeRequire(name)
  } })
  const element = drawerModule.exports.default({ service: { id: 'gateway' }, status: {}, onClose: () => { closed++ } })
  const cleanup = effect()
  assert.equal(dialog.open, true)
  cleanup()
  effect()
  // Browser close events are queued; React development mode has reopened it.
  element.props.onClose({ currentTarget: dialog })
  assert.equal(closed, 0)
  dialog.close()
  element.props.onClose({ currentTarget: dialog })
  assert.equal(closed, 1)
})
