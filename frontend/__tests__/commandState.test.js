import test from 'node:test'
import assert from 'node:assert/strict'
import { commandState, canVisitAccessLink } from '../src/commandState.js'

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


test('a cloud URL without a local port can be visited without claiming it is running', () => {
  const project = { accessUrl: 'http://39.102.212.37/image-gallery/' }
  const state = commandState(project, { statusKnown: false })
  assert.equal(state.canVisit, true)
  assert.equal(state.running, false)
  assert.equal(state.known, false)
  assert.equal(commandState(project, {}, false, 'starting').canVisit, false)
})

test('an explicit URL with a local tunnel port still requires that port to be running', () => {
  const project = { accessUrl: 'http://127.0.0.1:18317/management.html', statusPort: 18317 }
  assert.equal(commandState(project, { statusKnown: false }).canVisit, false)
  assert.equal(commandState(project, { statusKnown: true, running: false }).canVisit, false)
  assert.equal(commandState(project, { statusKnown: true, running: true }).canVisit, true)
})

test('cloud pages stay accessible while the same project is stopped or changing local state', () => {
  const project = { statusPort: 3036 }
  const link = { url: 'http://39.102.212.37:3036/admin', requiresRunning: false }
  for (const status of [{}, { statusKnown: true, running: false }, { statusKnown: true, running: true }]) {
    assert.equal(canVisitAccessLink(project, status, link), true)
    assert.equal(canVisitAccessLink(project, status, link, 'stopping'), true)
  }
})

test('local page links require a confirmed running project and remain unavailable during transitions', () => {
  const project = { statusPort: 3036 }
  const link = { url: 'http://127.0.0.1:3036/admin', requiresRunning: true }
  assert.equal(canVisitAccessLink(project, {}, link), false)
  assert.equal(canVisitAccessLink(project, { statusKnown: true, running: false }, link), false)
  assert.equal(canVisitAccessLink(project, { statusKnown: true, running: true }, link), true)
  assert.equal(canVisitAccessLink(project, { statusKnown: true, running: true }, link, 'starting'), false)
  assert.equal(canVisitAccessLink({}, { statusKnown: true, running: true }, link), false)
})
