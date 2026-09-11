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

test('Project Center uses persisted MeterSphere metadata when a persisted record exists', () => {
  const projects = buildProjectViewModel([], {
    persisted: true,
    project: {
      id: 'metersphere',
      type: 'metersphere',
      name: 'MeterSphere Local'
    }
  })

  assert.deepEqual(projects, [{
    id: 'metersphere',
    type: PROJECT_TYPES.METERSPHERE,
    source: PROJECT_SOURCES.PERSISTED,
    name: 'MeterSphere Local',
    capabilities: ['openWorkspace']
  }])
})

test('MeterSphere view-model allowlist strips operational and command fields', () => {
  const projects = buildProjectViewModel([], {
    persisted: true,
    project: {
      id: 'wrong-id',
      type: 'metersphere',
      name: 'MeterSphere Safe',
      source: 'persisted',
      projectRoot: '/bad-value',
      services: { gateway: {} },
      package: { mode: 'bad' },
      properties: { bad: true },
      startCommand: 'bad-start',
      stopCommand: 'bad-stop',
      statusPort: 1234
    }
  })

  const meterSphere = projects[0]
  assert.deepEqual(meterSphere, {
    id: 'metersphere',
    type: PROJECT_TYPES.METERSPHERE,
    source: PROJECT_SOURCES.PERSISTED,
    name: 'MeterSphere Safe',
    capabilities: ['openWorkspace']
  })
  assert.equal('projectRoot' in meterSphere, false)
  assert.equal('startCommand' in meterSphere, false)
  assert.equal('statusPort' in meterSphere, false)
})

test('normalized MeterSphere fallback stays builtin when API record is not persisted', () => {
  const projects = buildProjectViewModel([], {
    persisted: false,
    project: { id: 'metersphere', type: 'metersphere', name: 'MeterSphere' }
  })

  assert.equal(projects[0].source, PROJECT_SOURCES.BUILTIN)
  assert.deepEqual(projects[0].capabilities, ['openWorkspace'])
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
