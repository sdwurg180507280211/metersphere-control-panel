import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BUILTIN_METERSPHERE_PROJECT,
  PROJECT_SOURCES,
  PROJECT_TYPES,
  buildProjectViewModel
} from '../src/projectModel.js'

test('Project Center builds one Project[] with builtin MeterSphere and persisted command projects', () => {
  const commandProjects = [{
    id: 'deepseek',
    type: 'command',
    name: 'DeepSeek Harness',
    startCommand: 'npm start',
    stopCommand: 'npm stop',
    statusPort: 3080
  }]

  const projects = buildProjectViewModel(commandProjects)

  assert.equal(projects.length, 2)
  assert.deepEqual(projects[0], BUILTIN_METERSPHERE_PROJECT)
  assert.equal(projects[0].type, PROJECT_TYPES.METERSPHERE)
  assert.equal(projects[0].source, PROJECT_SOURCES.BUILTIN)
  assert.deepEqual(projects[0].capabilities, ['openWorkspace'])
  assert.equal('startCommand' in projects[0], false)
  assert.equal('stopCommand' in projects[0], false)
  assert.equal('statusPort' in projects[0], false)

  assert.equal(projects[1].type, PROJECT_TYPES.COMMAND)
  assert.equal(projects[1].source, PROJECT_SOURCES.PERSISTED)
  assert.deepEqual(projects[1].capabilities, ['start', 'stop', 'edit', 'delete'])
  assert.equal(projects[1].capabilities.includes('openWorkspace'), false)
  assert.equal(projects[1].statusPort, 3080)
})

test('Project view-model construction does not mutate persisted command data', () => {
  const persisted = { id: 'node-api', name: 'Node API', startCommand: 'node server.js', stopCommand: 'pkill node' }
  const input = [persisted]

  const projects = buildProjectViewModel(input)

  assert.deepEqual(input, [persisted])
  assert.equal(input[0].type, undefined)
  assert.equal(input[0].source, undefined)
  assert.equal(projects[1].type, PROJECT_TYPES.COMMAND)
  assert.equal(projects[1].source, PROJECT_SOURCES.PERSISTED)
})

test('Project Center does not reinterpret non-command persisted entries as command projects', () => {
  const projects = buildProjectViewModel([
    { id: 'advanced', type: 'metersphere', name: 'Persisted advanced project' },
    { id: 'deepseek', type: 'command', name: 'DeepSeek', startCommand: 'start', stopCommand: 'stop' }
  ])

  assert.deepEqual(projects.map((project) => project.id), ['metersphere', 'deepseek'])
  assert.equal(projects.filter((project) => project.source === PROJECT_SOURCES.BUILTIN).length, 1)
  assert.equal(projects[0].id, 'metersphere')
})
