import test from 'node:test'
import assert from 'node:assert/strict'
import { servicePresentation, dependencyPresentation, errorText } from '../src/utils/servicePresentation.js'

test('error text accepts strings and structured errors but never renders objects', () => {
  assert.equal(errorText('failed'), 'failed')
  assert.equal(errorText({ message: 'failed' }), 'failed')
  for (const value of [null, {}, [], { message: {} }, false]) assert.equal(errorText(value), '')
})
test('running process and failed health probe are presented separately', () => {
  const result = servicePresentation({ running: true, phase: 'running', processAlive: true, health: { healthy: false, error: 'HTTP 503' } })
  assert.equal(result.processLabel, '进程存活')
  assert.equal(result.healthLabel, '健康检查异常')
  assert.equal(result.hasIssue, true)
})
test('missing health data is unknown, not healthy', () => {
  assert.equal(servicePresentation({ running: true }).healthLabel, '健康状态未知')
  assert.equal(servicePresentation({ running: true }).processLabel, '进程状态未确认')
})
test('stale observations cannot produce green confirmation labels', () => {
  const result = servicePresentation({ processAlive: true, health: { healthy: true } }, true)
  assert.equal(result.healthTone, 'unknown')
  assert.match(result.healthLabel, /待刷新/)
  assert.match(result.processLabel, /待刷新/)
})
test('a process flag carried over a partial event is explicitly stale', () => {
  assert.equal(servicePresentation({ processAlive: true, processStale: true }).processLabel, '进程状态待刷新')
})
test('an observed unhealthy response is an issue even without top-level error', () => {
  assert.equal(servicePresentation({ health: { healthy: false } }).hasIssue, true)
})
test('port ownership conflict takes priority over generic health advice', () => {
  assert.match(servicePresentation({ portOccupied: true, error: 'HTTP 404' }).hint, /归属/)
})
test('404 and authorization failures get specific, non-destructive advice', () => {
  assert.match(servicePresentation({ error: { message: 'HTTP 404' } }).hint, /路径和管理端口/)
  assert.match(servicePresentation({ error: 'HTTP 403' }).hint, /不要直接关闭/)
})
test('absence of a dependency model does not claim the service has no dependencies', () => {
  for (const status of [{}, { dependencyStatus: null }, { dependencyStatus: { source: 'none', dependencies: [] } }]) {
    assert.equal(dependencyPresentation(status), null)
  }
})
const dependent = (available) => ({ dependencyStatus: { source: 'preset', ready: available,
  dependencies: [{ id: 'eureka', name: 'Eureka', available }] } })
test('true, false and null dependencies have different labels', () => {
  assert.equal(dependencyPresentation(dependent(true)).items[0].tone, 'ok')
  assert.equal(dependencyPresentation(dependent(false)).items[0].tone, 'warning')
  assert.equal(dependencyPresentation(dependent(null)).items[0].tone, 'unknown')
})
test('stale dependencies hide previously confirmed readiness', () => {
  const result = dependencyPresentation({ ...dependent(true), dependencyStatusStale: true })
  assert.equal(result.items[0].label, '待刷新')
  assert.equal(result.items[0].tone, 'unknown')
})
test('preset relationships are never described as the cause of a failure', () => {
  const result = dependencyPresentation(dependent(false))
  assert.match(result.note, /预设关系/)
  assert.match(result.note, /不代表此次异常原因/)
})
test('disabled or absent local dependencies remain unknown rather than unavailable', () => {
  for (const reason of ['NOT_CONFIGURED', 'DISABLED']) {
    const status = dependent(null)
    status.dependencyStatus.dependencies[0].reason = reason
    assert.match(dependencyPresentation(status).items[0].label, /状态未知/)
    assert.equal(dependencyPresentation(status).items[0].tone, 'unknown')
  }
})
