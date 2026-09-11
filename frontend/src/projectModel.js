export const PROJECT_TYPES = Object.freeze({
  METERSPHERE: 'metersphere',
  COMMAND: 'command'
})

export const PROJECT_SOURCES = Object.freeze({
  BUILTIN: 'builtin',
  PERSISTED: 'persisted'
})

const METERSPHERE_CAPABILITIES = Object.freeze(['openWorkspace'])
const COMMAND_CAPABILITIES = Object.freeze(['start', 'stop', 'edit', 'delete'])

export const BUILTIN_METERSPHERE_PROJECT = Object.freeze({
  id: 'metersphere',
  type: PROJECT_TYPES.METERSPHERE,
  source: PROJECT_SOURCES.BUILTIN,
  name: 'MeterSphere',
  capabilities: METERSPHERE_CAPABILITIES
})

function buildMeterSphereProject(meterSphereProjectState) {
  const project = meterSphereProjectState?.project
  if (!project || project.type !== PROJECT_TYPES.METERSPHERE) {
    return BUILTIN_METERSPHERE_PROJECT
  }

  return {
    id: 'metersphere',
    type: PROJECT_TYPES.METERSPHERE,
    source: meterSphereProjectState.persisted === true
      ? PROJECT_SOURCES.PERSISTED
      : PROJECT_SOURCES.BUILTIN,
    name: String(project.name || 'MeterSphere'),
    capabilities: METERSPHERE_CAPABILITIES
  }
}

export function buildProjectViewModel(commandProjects = [], meterSphereProjectState = null) {
  const persistedCommandProjects = Array.isArray(commandProjects)
    ? commandProjects.filter((project) => project && (!project.type || project.type === PROJECT_TYPES.COMMAND))
    : []

  return [
    buildMeterSphereProject(meterSphereProjectState),
    ...persistedCommandProjects.map((project) => ({
      ...project,
      type: PROJECT_TYPES.COMMAND,
      source: PROJECT_SOURCES.PERSISTED,
      capabilities: COMMAND_CAPABILITIES
    }))
  ]
}
