# Repository Guidelines

## Project Context

- This repo is a long-lived control panel for managing the sibling `../metersphere` project.
- The backend serves APIs, coordinates local processes, tracks build progress, and pushes realtime updates.
- The frontend is a Vite + React UI for service control, build operations, logs, and status views.
- Keep changes focused on this control-panel repo; do not modify the sibling `metersphere` repo unless the user explicitly asks.

## Commands

| Command | Purpose |
|---|---|
| `npm run install:all` | Install root + frontend dependencies |
| `npm run dev` | Dev mode: concurrently starts backend (nodemon :3000) + frontend (Vite :3001); auto-cleans port 3000/5000 |
| `npm run build` | Build frontend to `frontend/dist` |
| `npm start` | Production: `node backend/server.js`, serves API + static frontend on :3000 |
| `npm test` | Run Jest tests |
| `npm run test:watch` | Jest watch mode |
| `npm run electron:dev` | Start in Electron desktop mode |
| `npm run electron:build` | Build + package as macOS DMG |

Dev mode: frontend (`:3001`) proxies `/api` and `/ws` to backend (`:3000`).
Production: backend serves both API and static frontend on port 3000.

## Preferred Workflow

- For non-trivial work, follow a lightweight Kiro-style flow: classify the work, clarify requirements or bugfix scope, then design, then implement.
- For feature work, decide whether the task is `Requirements-First` or `Design-First` before coding.
- For bugfix work, explicitly capture current incorrect behavior, expected behavior, and unchanged behavior that must continue working.
- Keep tasks granular and traceable when breaking work into steps or implementation phases.
- Do not force full spec ceremony for trivial edits, but keep the same reasoning discipline.

## Architecture

### Backend: Route → Controller → Service

- Routes (`backend/routes/`) are thin Express routers; controllers (`backend/controllers/`) validate input and shape HTTP responses; all business logic lives in `backend/services/`.
- The `enqueueServiceTask` helper in `serviceController.js` standardizes the 202 + jobId pattern for async operations.

### Job-Centric Design (`jobService.js`)

All async operations (service start/stop/restart, frontend builds, package runs) create a unified Job with `jobId`, `type`, `status`, `stage`, `progress`. Jobs support parent/child relationships (batch operations), per-resource rate limiting, and distributed locking via Redis `setIfNotExists` or in-memory map. Every state transition broadcasts a WebSocket event. If Redis is unavailable, active jobs buffer to memory and auto-flush on recovery.

### ProcessManager Mixin Pattern (`backend/services/processManager/`)

`index.js` defines a base class; three mixins are applied to the prototype:
- `serviceLifecycle.js` — start/stop/compile services, batch operations
- `buildProcess.js` — frontend build orchestration (npm install, npm build, copy assets)
- `devServer.js` — Vite dev server management

Shared state maps (`serviceProcesses`, `serviceStatuses`, `buildProcesses`, `devServerProcesses`) live in `shared.js`.

### Dual-Stack Event Compatibility

The system is in a migration phase: the new `job:*` events coexist with legacy `build:*` and `service:status` events. Job responses include a `compatibility` object showing which legacy channels still apply. New features should target `job:*` events; do not remove legacy events without explicit migration.

### CacheService Dual-Mode (`cacheService.js`)

Default: in-memory Map with TTL. Optional Redis: full key/value/set/list operations. Redis errors fall back to memory cache automatically. Use `{ requireRedis: true, allowMemoryFallback: false }` for strict Redis mode.

### ConfigManager Singleton (`configManager.js`)

Manages config lifecycle: load from disk → normalize → validate → save (atomic write with backup) → apply. Apply hot-updates runtime consumers (logger, processManager, healthChecker, etc.) and is blocked if active jobs would be affected. Only `port` requires a server restart.

### Frontend State (Zustand)

6 stores in `useAppStore.js`: `useServiceStore`, `useLogStore`, `useBuildStore`, `usePackageStore`, `useWebSocketStore`, `useConfigStore`. Plus `useUiStore.js` for active tab + URL hash sync.

- No React Router — navigation is tab-based via Zustand state + `window.location.hash`.
- All store fetch operations use `runInFlightRequest` to prevent duplicate concurrent API calls for the same resource.
- Tab switch confirms if leaving Config tab with unsaved changes.

### WebSocket Hook (`useWebSocket.jsx`)

Single hook manages connection, auto-reconnect (max 5 attempts, 3s delay), channel subscription, and message routing to appropriate store actions.

## Repo Structure

```
backend/
  server.js            # Entry: Express + HTTP + WebSocket + graceful shutdown
  config.js            # Pure config functions: normalize, resolve, validate
  config/              # Sub-config: redis.js, package.js
  controllers/         # Thin HTTP handlers
  routes/              # Express route definitions (/api/*)
  services/            # Business logic core
    jobService.js      # Unified job lifecycle, locking, rate limiting
    serviceTaskService.js  # Service start/stop/restart as job-based flows
    processManager/    # Process lifecycle (mixin pattern)
    configManager.js   # Config lifecycle singleton
    cacheService.js    # Dual-mode cache (memory / Redis)
    healthChecker.js   # HTTP + port probe, adaptive intervals
    buildProgressService.js  # Build step tracking + WS broadcast
    websocketService.js # WS server, channel pub/sub, heartbeat
    ...other services
  utils/               # errors.js, logger.js, validator.js
  __tests__/           # Jest test files
frontend/
  src/
    App.jsx            # Shell: sidebar + tab panels + waifu
    main.jsx           # React root
    store/             # Zustand stores (useAppStore.js, useUiStore.js)
    hooks/             # useWebSocket.jsx
    components/        # ~25 components (each .jsx + .css pair)
    live2d/            # Optional Live2D waifu system (feature-flagged)
    styles/            # Global CSS
    utils/             # passwordCache.js
config.json.example    # Example config with all fields
scripts/               # Dev utilities (clean-port, bootstrap-kiro-spec)
docs/                  # Plans, operational notes, regressions, roadmap
.pids/                 # Runtime PID files
```

## Configuration

### Config File Location

- Production/Electron: `~/.metersphere-control-panel/config.json` (overridable via `MS_CONFIG_PATH` env var)
- Repo-root `config.json` is gitignored and only used for local dev convenience

### Key Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `MS_PORT` | 3000 | Server port |
| `MS_PROJECT_ROOT` | `../metersphere` | MeterSphere project root |
| `MS_CONFIG_PATH` | `~/.metersphere-control-panel/config.json` | Config file path |
| `MS_CACHE_MODE` | `memory` | Cache mode (`memory` or `redis`) |
| `MS_REDIS_HOST` | localhost | Redis host |
| `MS_REDIS_PORT` | 6379 | Redis port |
| `MS_REDIS_PASSWORD` | (empty) | Redis password |
| `MS_REDIS_DB` | 0 | Redis database |
| `MS_CACHE_KEY_PREFIX` | `ms-panel:` | Redis key prefix |
| `MS_JOB_REDIS_REQUIRED` | auto | Whether jobs require Redis |
| `MS_JOB_RATE_LIMIT_WINDOW_SECONDS` | 30 | Rate limit window |
| `MS_MAX_LOG_LINES` | 1000 | Max log buffer lines |

### Config Sections

`config.json` has sections for: `port`, `projectRoot`, `npmPath`, `maxLogLines`, `jvmOptions`, `redis`, `services` (per-service definitions with pom/port/healthCheck/startOrder/critical/enabled), `package` (build config), `properties` (MeterSphere properties file paths), `waifu` (AI chat config), `claudeCode` (Claude Code integration).

The config page exposes three views: `editable` (writable fields), `runtime` (read-only env-derived), `resolved` (final merged snapshot).

## WebSocket Event Channels

Server broadcasts on these channels — clients subscribe via the WebSocket hook:

| Channel | Data |
|---|---|
| `logs:service` | Service process logs |
| `logs:build` | Build process logs |
| `logs:package` | Package process logs |
| `build:progress` | Build step progress (legacy, coexists with job:) |
| `build:completed` / `build:batchCompleted` | Build completion (legacy) |
| `service:status` | Service status updates (legacy, coexists with job:) |
| `job:progress` / `job:completed` / `job:failed` | Unified job lifecycle events |
| `package:started/heartbeat/completed/failed` | Package task lifecycle |
| `cancelBuild` | Client → Server: cancel a running build |

## Backend Conventions

- Keep route handlers thin: validate input, delegate business logic, and shape HTTP responses.
- Put orchestration, process control, health checks, cache behavior, and websocket coordination in `backend/services/`.
- Keep shared validation and logging helpers in `backend/utils/`.
- Preserve existing API shapes and websocket event names unless the task explicitly requires a contract change.
- Be careful with long-running process management, cancellation, rollback, and log streaming; these are core behaviors.

## Frontend Conventions

- Follow the existing component split under `frontend/src/components/` instead of adding large multi-purpose files.
- Keep stateful cross-view behavior in the Zustand store or dedicated hooks, not scattered through unrelated components.
- Keep presentational styles in the adjacent CSS files and match the current naming/style patterns.
- Preserve realtime update behavior for websocket-driven status, build progress, and logs.
- Prefer small, local edits that align with current React patterns in this repo.

## Docs and Planning

- Update `README.md` when the user-facing behavior, commands, architecture, or configuration model changes materially.
- Add or update files in `docs/` when the task introduces a meaningful plan, operational rule, regression note, or roadmap-level change.
- Keep documentation concrete and repository-specific rather than generic.

## Validation

- There is no established automated test suite in this repo right now; do not invent a new framework just for a small change.
- When validating, prefer the narrowest useful command and avoid fixing unrelated issues.
- Existing tests use Jest (`npm test`, `npm run test:watch`).

## Change Boundaries

- Do not add dependencies unless they solve the task clearly and fit the existing stack.
- Do not rename files, APIs, websocket events, or config fields without a strong reason.
- Keep backward compatibility for `config.json`, runtime env vars, and current HTTP endpoints unless the user requests a breaking change.
- Favor root-cause fixes over superficial patches, but keep the patch set tight.
