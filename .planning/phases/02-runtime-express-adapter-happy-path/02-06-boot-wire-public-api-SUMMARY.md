---
phase: 02-runtime-express-adapter-happy-path
plan: 06
subsystem: adapter
tags: [boot, public-api, express-v5, integration, vertical-slice]
requires: [02-01, 02-02, 02-03, 02-04, 02-05]
provides:
  - "useExpressControllers(app, options) — mount controllers on existing Express app"
  - "createExpressServer(options) — fresh app with body-parsers + controllers (D-02)"
  - "Public barrel re-exports: useExpressControllers, createExpressServer, BootOptions, AuthorizationChecker, CurrentUserChecker"
affects:
  - 02-07 end-to-end SC acceptance (consumes the public boot API)
tech-stack:
  added: []
  patterns:
    - "Per-action handler factory composes resolveInputs → container.get → invoke({...args, req, res, next}) → writeResponse, then wraps with wrapAction for source attribution"
    - "Asymmetric body-parser mounting (D-02): createExpressServer auto-mounts express.json + urlencoded; useExpressControllers does NOT"
    - "libraryErrorMiddleware mounted last when defaultErrorHandler !== false; Phase 3 user after-middleware will slot in ahead without restructuring (D-15, D-17)"
    - "Internal adapter helpers stay module-private; only the three Phase 2 surfaces ship through src/index.ts"
key-files:
  created:
    - src/adapter/boot.ts
    - tests/adapter/boot.test.ts
  modified:
    - src/adapter/index.ts (added 02-06 boot marker re-exports)
    - src/index.ts (added Phase 2 boot APIs + BootOptions type)
decisions:
  - "Handler invocation uses fn.call(instance, handlerArgs) (not direct property call) — preserves `this` binding and surfaces a clean error if the method shape ever drifts"
  - "Defensive runtime check: throw a controller+method-attributed Error if the resolved instance lacks the expected method, rather than letting v8 surface a cryptic TypeError"
  - "Test 11 (@OnNull) uses a local ItemsController fixture instead of UsersController — the shared fixture's /users/:id Zod-coerced route swallows /users/null before /null can match (route-order coupling pre-existing in fixtures, out of scope to refactor here)"
metrics:
  duration: ~6 minutes
  completed: 2026-05-09
  commits: 3
  tasks_completed: 3
  files_created: 2
  files_modified: 2
requirements: [API-01, API-02, API-03, BUILD-03, ROUTE-05, INPUT-01, ERR-03]
---

# Phase 2 Plan 06: Boot + Wire Public API Summary

**One-liner:** Wire all Wave 2 modules (router-build + validation + response + handler-wrapper + error-middleware) under `useExpressControllers` and `createExpressServer`, ship Phase 2's first public HTTP-runtime surfaces, and prove the vertical slice with 13 integration tests.

## What was built

- **`src/adapter/boot.ts`** — three exports:
  - `makeHandlerFactory()` (module-private) returns a `HandlerFactory` whose produced `RequestHandler` runs `resolveInputs` → `getContainer().get(target)` → `instance[method]({...args, req, res, next})` → `writeResponse`, all wrapped by `wrapAction` for D-16 source attribution.
  - `useExpressControllers(app, options)` calls `buildMetadata(controllers)`, builds one `express.Router()` per controller via `buildControllerRouter`, mounts at the composed `mountPath`, then mounts `libraryErrorMiddleware` when `defaultErrorHandler !== false`. Returns the same `app`.
  - `createExpressServer(options)` creates a fresh `express()` app, mounts `express.json()` and `express.urlencoded({extended:true})` per D-02, then delegates to `useExpressControllers`.
- **Public barrel update** (`src/index.ts`) — adds `useExpressControllers`, `createExpressServer`, and the `BootOptions` / `AuthorizationChecker` / `CurrentUserChecker` types. Internal adapter helpers stay private.
- **`tests/adapter/boot.test.ts`** — 13 supertest-driven integration cases proving:
  1. createExpressServer auto-mounts body-parsers (POST JSON works without manual `express.json()`).
  2. useExpressControllers honors caller-mounted `express.json()`.
  3. useExpressControllers does NOT auto-mount → body undefined → BadRequestError (D-02 asymmetry).
  4. useExpressControllers returns the same app instance.
  5. API-03 — every BootOptions key (controllers, routePrefix, defaultErrorHandler, middlewares, interceptors, cors, validation, authorizationChecker, currentUserChecker, printRoutes) accepted at runtime with no `console.error`/`console.warn` calls.
  6. routePrefix composition `/api/v1` + `/users` + `/:id` → `/api/v1/users/3` (D-04).
  7. Multiple controllers (UsersController + TextController) on the same app (ROUTE-05).
  8. Controller inheritance — DerivedController exposes both `/derived/own` (own) and `/derived/ping` (inherited from BaseController, composed under the subclass basePath).
  9. `defaultErrorHandler: false` skips libraryErrorMiddleware → response is NOT the JSON envelope.
  10. Async throw → libraryErrorMiddleware envelope with `source` ending `.boom`, dev `_devMessage === 'fail-async'` (ERR-03 + D-18 dev disclosure).
  11. Zod validation failure → 400, `body.name === 'BadRequestError'`, `details` length 2, both slot:'body', paths sorted ['email','name'] (INPUT-03).
  12. `null` return + `@OnNull(404)` → 404 with empty body (D-13).
  13. Public-export surface check — boot APIs present, internal helpers absent, Phase 1 exports preserved.

## Verification results

- `node_modules/.bin/tsc --noEmit` → clean.
- `node_modules/.bin/vitest run` → **209/209 tests pass** (full repo). Adapter suite alone: 117/117.
- Each task committed as a discrete atomic commit.

## Deviations from Plan

### Auto-fixed issues

1. **[Rule 1 / Rule 3] Strict-null property access on instance method** — TS flagged `instance[action.method]` as `((a) => unknown) | undefined` once exact-optional types kicked in. Added a defensive `typeof fn !== 'function'` guard that throws a controller+method-attributed Error before invocation. Net effect: cleaner runtime diagnostic for any future drift between metadata and class shape.
2. **[Rule 1] Test 11 routing conflict** — The plan called for `GET /users/null` against `UsersController`, but the shared fixture registers `@Get('/:id', { params: zodIdParams })` ahead of `@Get('/null')`, so `:id` (with Zod coercion) matches `/null` first and rejects with 400. The shared fixture's route ordering is pre-existing (Plan 02-01 territory) and out of scope. **Fix:** introduced a local `ItemsController` with `@Get('/missing') @OnNull(404)` inside the test file — proves the same D-13 contract without touching shared fixtures.

### Architectural changes

None — all wiring matches the plan's interfaces exactly.

### Authentication gates

None.

## Known stubs / deferred items

None. The vertical slice is end-to-end functional.

## Self-Check: PASSED

- `src/adapter/boot.ts` — present (file exists; verified by typecheck + 13 passing integration tests).
- `tests/adapter/boot.test.ts` — present (13 tests, all green).
- Commits exist on `main`:
  - `6934372` feat(02-06): wire useExpressControllers + createExpressServer boot APIs
  - `c473b68` feat(02-06): export useExpressControllers, createExpressServer, BootOptions from public barrel
  - `5bf930d` test(02-06): boot integration tests covering API-01/02/03 + vertical slice
- Acceptance criteria for all three tasks satisfied (`grep` checks + tsc clean + vitest green).
