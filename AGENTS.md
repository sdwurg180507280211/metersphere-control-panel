# Repository Guidelines

## Project Context

- This repo is a long-lived control panel for managing the sibling `../metersphere` project.
- The backend serves APIs, coordinates local processes, tracks build progress, and pushes realtime updates.
- The frontend is a Vite + React UI for service control, build operations, logs, and status views.
- Keep changes focused on this control-panel repo; do not modify the sibling `metersphere` repo unless the user explicitly asks.

## Preferred Workflow

- For non-trivial work, follow a lightweight Kiro-style flow: classify the work, clarify requirements or bugfix scope, then design, then implement.
- For feature work, decide whether the task is `Requirements-First` or `Design-First` before coding.
- For bugfix work, explicitly capture current incorrect behavior, expected behavior, and unchanged behavior that must continue working.
- Keep tasks granular and traceable when breaking work into steps or implementation phases.
- Do not force full spec ceremony for trivial edits, but keep the same reasoning discipline.

## Repo Structure

- `backend/` contains the Node/Express server, routes, controllers, runtime services, and utilities.
- `frontend/` contains the Vite React app, UI components, hooks, shared styles, and Zustand state.
- `docs/` stores implementation plans, operational notes, regressions, and roadmap documents.
- `config.json` is the primary control-panel configuration source.
- `scripts/` contains local developer utilities such as port cleanup.

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

- Use the existing npm scripts first:
  - root dev: `npm run dev`
  - root build: `npm run build`
  - root start: `npm start`
  - install all deps: `npm run install:all`
- Frontend-only commands live in `frontend/package.json`.
- There is no established automated test suite in this repo right now; do not invent a new framework just for a small change.
- When validating, prefer the narrowest useful command and avoid fixing unrelated issues.

## Change Boundaries

- Do not add dependencies unless they solve the task clearly and fit the existing stack.
- Do not rename files, APIs, websocket events, or config fields without a strong reason.
- Keep backward compatibility for `config.json`, runtime env vars, and current HTTP endpoints unless the user requests a breaking change.
- Favor root-cause fixes over superficial patches, but keep the patch set tight.
