---
phase: "04"
plan: "04"
subsystem: response-shapers
tags: [decorators, render, redirect, location, response, express-v5]
dependency_graph:
  requires: [04-01, 04-03]
  provides: [Render, Redirect, Location, render-shaper-dispatch]
  affects: [src/adapter/boot.ts, src/metadata/storage.ts, src/metadata/builder.ts, src/types/resolved.ts]
tech_stack:
  added: [src/adapter/render.ts]
  patterns: [WeakMap-storage, pure-registrar-decorator, shaper-dispatch, template-interpolation]
key_files:
  created:
    - src/adapter/render.ts
    - tests/adapter/render.test.ts
    - tests/decorators/render-redirect-location.test.ts
    - tests/integration/render-redirect-location.test.ts
    - tests/fixtures/views/test.html
  modified:
    - src/metadata/storage.ts
    - src/decorators/response.ts
    - src/metadata/types.ts
    - src/types/resolved.ts
    - src/metadata/builder.ts
    - src/adapter/boot.ts
    - tests/integration/02-grep-gates.test.ts
decisions:
  - "Shaper WeakMaps stored separately from MethodArgs; builder folds them in mergeMethodChain via getter helpers per prototype level"
  - "null always short-circuits to 204 before shaper dispatch; undefined passes to shapers which handle it per D-05/D-06/D-07"
  - "@HttpCode wins over explicit @Redirect status per D-10: resolved via responseHandlers scan at dispatch time"
  - "applyLocation falls through to writeResponse so body still flows (D-07)"
  - "src/adapter/render.ts added to grep-gate allow-list (Rule 3 auto-fix)"
metrics:
  duration_seconds: 480
  completed_date: "2026-05-10"
  tasks_completed: 3
  files_changed: 11
requirements_satisfied: [RES-04, RES-05, RES-06]
---

# Phase 04 Plan 04: Response Shapers (@Render/@Redirect/@Location) Summary

**One-liner:** `@Render`/`@Redirect`/`@Location` decorators with WeakMap storage, template interpolation via `:name` regex substitution, and shaper dispatch in the handler pipeline before `writeResponse`.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | WeakMap storage + decorators + builder fold | 16b4688 | storage.ts, response.ts, types.ts, resolved.ts, builder.ts |
| 2 | Shaper helpers + dispatch in boot.ts | 1de95c6 | render.ts, boot.ts, 02-grep-gates.test.ts |
| 3 | Integration tests + public barrel verification | 429f26c | render-redirect-location.test.ts, boot.ts (null fix) |

## What Was Built

### `src/metadata/storage.ts`
Added three module-private WeakMaps (`renderMap`, `redirectMap`, `locationMap`) with getter/setter helpers:
- `setRenderMeta` / `getRenderMeta` — stores `{ template: string }`
- `setRedirectMeta` / `getRedirectMeta` — stores `{ template: string; status?: number }`
- `setLocationMeta` / `getLocationMeta` — stores `{ template: string }`

### `src/decorators/response.ts`
Added three pure-registrar decorators (no `Reflect.defineMetadata`):
- `@Render(template)` — calls `setRenderMeta`
- `@Redirect(template, status?)` — calls `setRedirectMeta`
- `@Location(template)` — calls `setLocationMeta`

All re-exported from `src/decorators/index.ts` via `export * from './response.js'` and transitively from `src/index.ts`.

### `src/metadata/types.ts` + `src/types/resolved.ts`
Extended `MethodArgs` and `ActionMetadata` with optional `render?`, `redirect?`, `location?` fields.

### `src/metadata/builder.ts`
`mergeMethodChain` folds the three shaper WeakMaps for each prototype level in the chain, applying subclass-wins semantics (last-write wins as chain walks base→derived).

### `src/adapter/render.ts` (new)
Four exported functions:
- `interpolateTemplate(template, data, source)` — `:name` regex substitution; throws actionable error on missing key
- `applyRedirect(res, template, status, value, source)` — string overrides, object interpolates, undefined/null uses bare template
- `applyRender(res, template, value, source)` — undefined/null renders with no locals, object passes as locals, non-object throws
- `applyLocation(res, template, value, source)` — sets `Location` header only, does NOT redirect

### `src/adapter/boot.ts`
Shaper dispatch inserted in `makeHandlerFactory` after interceptors, before `writeResponse`:
- `null` always short-circuits before shapers (D-13/Pitfall 8) → 204
- `undefined` passes to shapers (each handles it per its semantics)
- `@Redirect`: D-10 status resolution: `action.responseHandlers['success-code']` → `action.redirect.status` → `302`
- `@Location`: calls `applyLocation` then falls through to `writeResponse` (body still written, D-07)
- `@Render`/`@Redirect`: call `next()` after apply, do NOT call `writeResponse`

## Test Coverage

| Test | Description | Invariant |
|------|-------------|-----------|
| T1-01..T1-10 | Decorator + builder unit tests | WeakMap registration, ActionMetadata fields, subclass-wins |
| T2-01..T2-20 | Helper function unit tests | interpolateTemplate, applyRedirect, applyRender, applyLocation |
| Integration 1-5 | @Redirect scenarios | Template, string override, undefined, HttpCode, explicit status |
| Integration 6-8 | @Render scenarios | Object locals, undefined locals, non-object error |
| Integration 9 | @Location | Header set + body written |
| Integration 10 | Missing placeholder | Actionable error message |
| Integration 11 | D-08 override | @JsonController + @Render → rendered view not JSON |
| Integration 12 | D-09 interceptor-before-shaper | Interceptor transforms value; shaper sees post-intercept |
| Integration 13 | Pitfall 8 null short-circuit | null + @Redirect → 204, not redirect |

**Total: 43 new tests. All 516 tests pass.**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] grep-gate allow-list needed `src/adapter/render.ts`**
- **Found during:** Task 2
- **Issue:** Gate 2 in `tests/integration/02-grep-gates.test.ts` checks that only allowed files import from `express`; `render.ts` imports `Response` from express.
- **Fix:** Added `src/adapter/render.ts` to the allowed set in Gate 2.
- **Files modified:** `tests/integration/02-grep-gates.test.ts`
- **Commit:** 1de95c6

**2. [Rule 1 - Bug] null/undefined shaper guard was too aggressive**
- **Found during:** Task 3 integration testing
- **Issue:** Initial guard `if (final !== null && final !== undefined)` blocked shapers for both null AND undefined. But D-05/D-06 semantics require `undefined` to pass to shapers (bare template / no locals). Test 3 (@Redirect undefined → bare template) and Test 7 (@Render undefined → no locals) both failed.
- **Fix:** Changed guard to `if (final !== null)` so only null is short-circuited (D-13/Pitfall 8). Undefined passes to shapers which handle it per their own semantics.
- **Files modified:** `src/adapter/boot.ts`
- **Commit:** 429f26c

**3. [Rule 1 - Bug] Test 8/10 error handler ordering**
- **Found during:** Task 3 integration testing
- **Issue:** Error handler added to Express app BEFORE `useExpressControllers`, so it wasn't in the error-handler chain position (Express requires 4-arg middleware after routes).
- **Fix:** Moved `app.use(errorHandler)` to after `useExpressControllers` call in affected tests.
- **Files modified:** `tests/integration/render-redirect-location.test.ts`
- **Commit:** 429f26c

## Threat Surface Scan

T-04-16 mitigated: `interpolateTemplate` uses strict regex `/:([A-Za-z_$][A-Za-z0-9_$]*)/g` — only valid JS identifiers matched. Values from handler return are stringified via `String(...)` only. Templates are developer-authored at decorator time. Test 10 verifies missing-key throws actionable error (not silently substitutes empty string).

T-04-18 mitigated: Single `replace()` call — O(n) in template length, no recursion.

No new threat surface discovered beyond what the plan's `<threat_model>` already covers.

## Known Stubs

None — all three decorators are fully wired end-to-end with real Express behavior.

## Self-Check: PASSED

- `src/adapter/render.ts` — created and verified
- `tests/integration/render-redirect-location.test.ts` — created with 13 tests
- `tests/adapter/render.test.ts` — created with 20 tests
- `tests/decorators/render-redirect-location.test.ts` — created with 10 tests
- Commits: 16b4688, 1de95c6, 429f26c — verified in git log
- `npx tsc --noEmit` — exits 0
- `npx vitest run` — 516 tests, 47 files, all passed
