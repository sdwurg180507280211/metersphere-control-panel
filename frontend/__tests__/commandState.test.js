import test from 'node:test'
import assert from 'node:assert/strict'
import { commandState } from '../src/commandState.js'

test('a remembered start is an action receipt, not verified running state', () => {
  const state = commandState({}, { statusKnown: false }, true)
  assert.equal(state.running, false)
  assert.equal(state.label, '运行状态未验证')
  assert.equal(state.tone, 'unknown')
  assert.equal(state.lastStartIssued, true)
  assert.equal(state.canVisit, false)
})
test('only a confirmed listening port enables visiting; busy operations disable it', () => {
  const project = { statusPort: 3080 }
  const status = { statusKnown: true, running: true, phase: 'running' }
  assert.equal(commandState(project, status).canVisit, true)
  assert.equal(commandState(project, status).label, '端口可访问')
  assert.equal(commandState(project, status, false, 'stopping').canVisit, false)
  assert.equal(commandState(project, { ...status, running: false, phase: 'stopped' }).label, '端口未监听')
})
