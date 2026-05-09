---
phase: 02-runtime-express-adapter-happy-path
plan: 02
subsystem: adapter-router-build
tags: [adapter, router, path-compose, p2re-v8, route-04, route-05]
requires: [02-01]
provides:
  - "composePath() — D-04 prefix+basePath+actionPath composition with trailing-slash strip, // collapse, v8 brace-segment awareness"
  - "detectV4Pattern() — D-05 pre-flight that converts the four p2re v4 footguns into actionable [Controller.method] errors BEFORE router.METHOD()"
  - "buildControllerRouter() — one express.Router() per controller, mountPath returned for caller to mount with app.use() (ROUTE-05)"
affects:
  - src/adapter/index.ts (02-02 marker section populated)
  - tests/integration/grep-gates.test.ts (Phase 1 SC#1 gate scope-limited to allow Express in src/adapter/)
tech-stack:
  added: []
  patterns: ["pure path math + footgun-detector composition", "caller-injected HandlerFactory keeps router-build free of validation/response/error concerns"]
key-files:
  created:
    - src/adapter/router-build.ts
    - tests/adapter/router-build.test.ts
  modified:
    - src/adapter/index.ts
    - tests/integration/grep-gates.test.ts
decisions:
  - "composePath skips the '/' separator before parts beginning with '{' (v8 optional-segment wrappers like {/:id}, {.:ext}) — p2re v8 wrappers carry their own delimiter. Plan reference impl produced '/users/{/:id}' which is invalid v8; corrected to '/users{/:id}'."
  - "detectV4Pattern checks run in priority order (named-regex, optional-param, unnamed-group, bare-wildcard) so ':id(\\d+)' surfaces as case-1 (regex), not case-3 (unnamed group)."
  - "Unsupported-verb error fires only for verbs the express.Router instance doesn't expose — Express v5 supports many HTTP methods (CONNECT, PROPFIND, MKACTIVITY, etc.) so the test fixture uses 'foobar', not 'connect'."
  - "Phase 1 grep gate 'SC#1: core has zero Express imports' updated to exclude src/adapter/ — preserves the isolation contract while letting Phase 2's adapter import Express. src/adapter/ is the ONLY allowed Express boundary."
metrics:
  duration: ~6 minutes
  completed: 2026-05-09
  tasks: 3
  test_count_delta: "+33 (96 → 129)"
---

# Phase 2 Plan 02: Router-Build — Path Compose + V4 Detector

Pure router construction module: composes route strings (D-04), pre-empts the four
path-to-regexp v4 footguns with actionable errors (D-05), and builds one
`express.Router()` per controller (ROUTE-05). Caller injects the
`HandlerFactory`, so this module has no opinions about validation, response
writing, or error middleware — those land in 02-03/04/05.

## What Shipped

### Task 1 — `composePath()` (commits `daa1bc5` test, `ee71350` impl)

`src/adapter/router-build.ts`:
- `composePath(routePrefix, basePath, actionPath)` joins the three parts.
- Trailing slashes stripped per part; consecutive `//` collapsed; output always
  starts with `/`; `('','','')` → `'/'`.
- Parts beginning with `{` (v8 optional-segment wrappers `{/:id}`, `{.:ext}`)
  do NOT receive an inserted `/` separator — they supply their own delimiter.
- 11 unit tests cover every D-04 case + named-wildcard / optional-group passthrough.

### Task 2 — `detectV4Pattern()` (commits `a93f442` test, `bcd60bf` impl)

`src/adapter/router-build.ts`:
- Throws `[Controller.method] Path "X" uses v4 pattern "Y"; in path-to-regexp v8 use "Z" instead.` for:
  1. `:name(regex)` inline regex → `move regex to schema validation in the input declaration`
  2. `:name?` optional-param suffix → `{/:name} optional segment form`
  3. unnamed `(regex)` groups → `name the parameter (e.g. :path)`
  4. bare `*` wildcard → `*splat or {*splat}`
- Priority order ensures `:id(\d+)` reports as (1), not (3).
- 14 unit tests: 6 must-throw, 8 must-not-throw v8-valid paths.

### Task 3 — `buildControllerRouter()` (commits `19bfd00` test, `d95934b` impl)

`src/adapter/router-build.ts`:
- `HandlerFactory = (controller, action) => RequestHandler` — caller-injected.
- `BuiltRouter = { router: Router, mountPath: string }`.
- For each `action`: composes path, runs `detectV4Pattern()` (BEFORE `router[verb]()`,
  per RESEARCH Pitfall C), looks up `router[verb.toLowerCase()]`, throws
  `Unsupported HTTP verb "X" — express.Router has no method "x".` if missing,
  else registers handler at the router-local path.
- `mountPath = composePath(routePrefix, controllerMeta.basePath, '')` — caller
  does `app.use(mountPath, router)` in 02-06.

`src/adapter/index.ts` — 02-02 marker section populated:
```ts
// 02-02 router-build exports
export {
  composePath,
  detectV4Pattern,
  buildControllerRouter,
  type HandlerFactory,
  type BuiltRouter,
} from './router-build.js';
```
The 02-03 / 02-04 / 02-05 markers are untouched and ready for parallel-safe
inserts in their respective plans.

8 buildControllerRouter tests: route count + verb registration on `UsersController`,
mountPath with/without prefix, v4-pattern propagation through buildControllerRouter,
unsupported-verb error, inheritance (DerivedController exposes inherited `/ping` AND
own `/own`), and factory-call counting (factory invoked exactly once per action).

## Verification

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Clean (exit 0) |
| `npx vitest run tests/adapter/router-build.test.ts` | 33 / 33 passing |
| Full vitest run | 129 / 129 passing (was 96 pre-plan) |
| `grep "// 02-02 router-build exports" src/adapter/index.ts` | 1 match |
| `grep "// 02-03 ... // 02-04 ... // 02-05 ..."` markers | 3 matches (untouched) |
| `grep "buildControllerRouter\|composePath\|detectV4Pattern" src/adapter/index.ts` | 3 matches |
| `grep -rl "from 'express'" src/ \| grep -v src/adapter/ \| wc -l` | 0 (regression gate intact) |
| Express imports in `src/adapter/router-build.ts` | 1 (only Express import in module) |

## Deviations from Plan

### `[Rule 1 — Bug]` `composePath` produced `/users/{/:id}` for v8 optional-group passthrough

The plan's reference implementation joined all parts with `/`, so the
recommended test `composePath('', '/users', '{/:id}') === '/users{/:id}'`
failed (got `/users/{/:id}`). The `{...}` form in p2re v8 is a wrapper that
carries its own delimiter (`{/:id}` already includes the `/`); inserting
another `/` produces an invalid path. Adjusted the join algorithm so parts
beginning with `{` are appended without a separator. Behaviour for all other
D-04 cases is unchanged.
- **Fix:** Per-part conditional in `composePath` (commit `ee71350`).
- **Files:** `src/adapter/router-build.ts`.

### `[Rule 3 — Blocking]` Phase 1 grep gate forbade Express imports anywhere in `src/`

`tests/integration/grep-gates.test.ts` SC#1 asserted zero `from 'express'`
imports in any `src/**` file. Phase 2's whole purpose is the Express adapter
under `src/adapter/`, which is the ONE place Express is allowed (BUILD-02
isolation contract). Without scoping the gate, the new
`import { Router } from 'express'` line in `router-build.ts` failed CI.
- **Fix:** Added an `excludePrefixes` parameter to `srcLines()` /
  `countMatches()`; SC#1 passes `['src/adapter/']`. Other gates (SC#4,
  D-07, D-04, SC#5) untouched — they still see all of `src/`.
- **Files:** `tests/integration/grep-gates.test.ts` (commit `d95934b`).

### `[Test fix]` `connect` is a real `express.Router` method

The plan suggested `verb: 'connect'` for the unsupported-verb test fixture,
but Express v5 Router exposes `connect`, `propfind`, `mkactivity` and many
other RFC HTTP verbs. Switched the fixture verb to `'foobar'` (genuinely
unsupported). The error-message contract is identical.

## Auth Gates

None.

## Known Stubs

None — all three exports are fully implemented and tested. The
`HandlerFactory` parameter is a deliberate seam (Plan 02-06 wires the real
factory once 02-03/04/05 land), not a stub.

## Threat Flags

None — no new network surface, auth surface, IO, or trust boundary introduced.
The module is pure: string math + Express Router wiring. The v4 footgun
detector is itself a defensive-input check (positive security posture).

## Self-Check: PASSED

- `src/adapter/router-build.ts` — FOUND
- `tests/adapter/router-build.test.ts` — FOUND
- `src/adapter/index.ts` — modified (02-02 markers populated; 03/04/05 untouched)
- `tests/integration/grep-gates.test.ts` — modified (gate scoped)
- Commit `daa1bc5` (Task 1 RED) — FOUND
- Commit `ee71350` (Task 1 GREEN) — FOUND
- Commit `a93f442` (Task 2 RED) — FOUND
- Commit `bcd60bf` (Task 2 GREEN) — FOUND
- Commit `19bfd00` (Task 3 RED) — FOUND
- Commit `d95934b` (Task 3 GREEN) — FOUND
