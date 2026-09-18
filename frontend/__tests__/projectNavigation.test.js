import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_ROUTE, METERSPHERE_TABS, normalizeRoute, parseProjectHash } from '../src/projectNavigation.js'

test('MeterSphere 默认进入开发工作台', () => {
  assert.deepEqual(DEFAULT_ROUTE, { projectId: 'metersphere', tab: 'workspace' })
  assert.equal(normalizeRoute({ projectId: 'metersphere', tab: 'unknown' }).tab, 'workspace')
})

test('新增工作台、任务与诊断路由，同时保留旧路由', () => {
  assert.ok(METERSPHERE_TABS.includes('workspace'))
  assert.ok(METERSPHERE_TABS.includes('tasks'))
  assert.ok(METERSPHERE_TABS.includes('diagnosis'))
  assert.deepEqual(parseProjectHash('#services'), { projectId: 'metersphere', tab: 'services' })
  assert.deepEqual(parseProjectHash('#workspace'), { projectId: 'metersphere', tab: 'workspace' })
})
