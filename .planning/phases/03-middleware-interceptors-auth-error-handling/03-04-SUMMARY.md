---
phase: 03-middleware-interceptors-auth-error-handling
plan: "04"
subsystem: adapter-orchestration
tags: [wiring, boot, pipeline, async, breaking-change]
dependency_graph:
  requires: [03-01, 03-02, 03-03]
  provides: [D-01-pipeline, async-boot, public-barrel-phase3]
  affects: [src/adapter/boot.ts, src/adapter/router-build.ts, src/adapter/response.ts, src/adapter/error-middleware.ts, src/index.ts]
tech_stack:
  added: []
  patterns:
    - D-01 pipeline composition (global mw → controllers → global after → user error mw → library error mw)
    - Async-at-boot DI resolution (container.get may return Promise)
    - res.on('finish', () => next()) pattern for stream/iterable branches
    - isErrorMiddlewareInstance() arity detection via use.length === 4
key_files:
  created:
    - tests/adapter/response-next.test.ts
    - tests/adapter/error-middleware-arity.test.ts
    - tests/adapter/router-build-phase3.test.ts
    - tests/adapter/boot-phase3.test.ts
  modified:
    - src/adapter/response.ts
    - src/adapter/error-middleware.ts
    - src/adapter/router-build.ts
    - src/adapter/boot.ts
    - src/index.ts
    - tests/adapter/boot.test.ts
    - tests/adapter/router-build.test.ts
    - tests/integration/02-sc-acceptance.test.ts
    - tests/integration/02-grep-gates.test.ts
decisions:
  - "async-boot: useExpressControllers and createExpressServer are now async (Promise<Express>) — required for eager DI resolution and arity detection at boot time"
  - "isErrorMiddlewareInstance: use.length === 4 mirrors Express's own error-middleware detection algorithm"
  - "res.on('finish') registered BEFORE pipe() call for safety — guarantees next() fires after streaming completes"
  - "D-08 short-circuit: interceptors skipped when handler returns null or undefined"
  - "global interceptors resolved ONCE before controller loop and passed pre-resolved to buildControllerRouter"
  - "function-form middleware entries default to 'before' (class-form entries use getMiddlewareType)"
  - "method-wins for @Authorized: action.authorized !== undefined takes precedence over controllerMeta.authorized"
metrics:
  duration_seconds: 520
  completed_date: "2026-05-10"
  tasks_completed: 4
  tests_added: 41
  files_modified: 13
---

# Phase 3 Plan 04: Router-Build Wiring and Boot Orchestration Summary

Wire all Phase 3 helpers into the existing Phase 2 pipeline. Orchestration plan: minimal new logic, maximum composition — `writeResponse` gains `next()` calls, `buildControllerRouter` becomes async with D-01 handler array ordering, `boot.ts` orchestrates global mounting, public barrel exports Phase 3 surface.

## What Was Built

### Task 1: writeResponse — next() on every success branch (RESEARCH Pitfall 7 + Pattern 2)

**File:** `src/adapter/response.ts`

Every success branch now calls `next()` after writing the response, enabling `@UseAfter` handlers to fire:

| Branch | Change |
|--------|--------|
| null | `res.end(); next(); return;` |
| undefined | `res.end(); next(); return;` |
| JSON (`res.json`) | `res.json(value); next(); return;` |
| String (`res.send`) | `res.send(value); next(); return;` |
| Buffer (`res.send`) | `res.send(value); next(); return;` |
| Default catch-all | `res.json(value); next();` |
| Stream | `res.on('finish', () => next())` registered BEFORE `value.pipe(res)` |
| Async-iterable | `res.on('finish', () => next())` registered BEFORE `stream.pipe(res)` |

Stream error paths still call `next(err)` — `@UseAfter` is NOT invoked on error paths (D-10).

**Grep verification:** `grep -cE '\bnext\(\);' src/adapter/response.ts` → 6; `grep -n "res.on" src/adapter/response.ts` → 2 `finish` registrations.

### Task 2: isErrorMiddlewareInstance() helper in error-middleware.ts

**File:** `src/adapter/error-middleware.ts`

```typescript
export function isErrorMiddlewareInstance(instance: unknown): boolean {
  if (instance === null || typeof instance !== 'object') return false;
  const useFn = (instance as { use?: unknown }).use;
  if (typeof useFn !== 'function') return false;
  return useFn.length === 4;
}
```

D-15 arity detection: mirrors Express's own algorithm (`fn.length === 4`). Pitfall 2 footgun documented: rest-args arrow (`use = (...args) => {}`) has `length === 0` — returns false.

### Task 3: buildControllerRouter — async, BuildRouterOptions, D-01 handler arrays

**File:** `src/adapter/router-build.ts`

New signature:
```typescript
export async function buildControllerRouter(
  controllerMeta: ControllerMetadata,
  options: BuildRouterOptions,
): Promise<BuiltRouter>
```

**Per-route handler array (D-01 steps 3-12):**
```
[...ctrlBefore, ...methodBefore, authGate?, invokeHandler, ...methodAfter, ...ctrlAfter]
```

**HandlerFactory updated:** third param `resolvedInterceptors: ReadonlyArray<InterceptorInterface>` — receives `[...globalInterceptors, ...ctrlInterceptors, ...methodInterceptors]`.

**Method-wins rule:** `action.authorized !== undefined ? action.authorized : controllerMeta.authorized` (D-06).

Controller-level middleware/interceptors resolved once per controller; method-level per action.

**Breaking change:** All existing `buildControllerRouter(meta, routePrefix, factory)` call sites updated to `await buildControllerRouter(meta, { routePrefix, handlerFactory, globalInterceptors, ... })`.

### Task 4: boot.ts orchestration + public barrel

**File:** `src/adapter/boot.ts`

**Async-boot breaking change:** `useExpressControllers` and `createExpressServer` now return `Promise<Express>`. Rationale: container.get() may return a Promise, and arity detection for user error middleware requires resolving the class at boot time.

**Mounting order (D-01):**

| Step | `app.use(...)` call | Condition |
|------|---------------------|-----------|
| 1 | global `@Middleware({type:'before'})` classes + function-form entries | Always |
| 2 | `app.use(mountPath, router)` per controller | Always |
| 3 | global `@Middleware({type:'after'})` non-error instances | Always |
| 4 | user error middleware (4-arg `use`) | `defaultErrorHandler !== false` |
| 5 | `libraryErrorMiddleware` | `defaultErrorHandler !== false` |

**Global middleware partition logic:**
- class-form with `getMiddlewareType(cls) === 'before'` → globalBefore
- class-form with `getMiddlewareType(cls) === 'after'` AND `!isErrorMiddlewareInstance(instance)` → globalAfterNonError
- class-form with `getMiddlewareType(cls) === 'after'` AND `isErrorMiddlewareInstance(instance)` → userErrorMw
- function-form → globalBefore (default)

**Global interceptors:** resolved ONCE via `resolveInterceptorClasses(options.interceptors ?? [])` before the controller loop. Passed as `globalInterceptors` (pre-resolved) to every `buildControllerRouter` call. Never re-resolved per controller.

**Handler factory:**
```ts
const currentUserResolver = options.currentUserChecker
  ? () => resolveCurrentUser(req, options.currentUserChecker!, actionObj)
  : undefined;
const args = await resolveInputs(req, action.input, currentUserResolver);
const result = await fn.call(instance, handlerArgs);
// D-08 short-circuit
let final = result;
if (result !== null && result !== undefined && resolvedInterceptors.length > 0) {
  final = await runInterceptors(resolvedInterceptors, actionObj, result);
}
writeResponse(res, next, final, controllerMeta, action);
```

**File:** `src/index.ts` — added:
```ts
export type {
  ExpressMiddlewareInterface,
  ExpressErrorMiddlewareInterface,
  InterceptorInterface,
} from './interfaces/index.js';
```
(`UseBefore`, `UseAfter`, `Middleware`, `Interceptor`, `UseInterceptor`, `Authorized` already exported via `export * from './decorators/index.js'`)

## Open Question Resolutions

| # | Question | Resolution |
|---|----------|------------|
| #1 | @UseAfter on error path? | NO — error path calls `next(err)` which skips @UseAfter handlers (D-10). writeResponse only calls `next()` on success paths. |
| #2 | Controller vs method @Authorized wins? | METHOD WINS — `action.authorized !== undefined ? action.authorized : controllerMeta.authorized` |
| #3 | Global interceptors: when resolved, how scoped? | Pre-resolved ONCE at boot, passed as already-resolved `InterceptorInterface[]` to every route's interceptor chain (prepended before controller/method interceptors). |

## Async-Boot Breaking Change (Migration Note for Phase 5 Docs)

**Before (Phase 2):**
```ts
const app = express();
useExpressControllers(app, { controllers: [MyController] });
// OR
const app = createExpressServer({ controllers: [MyController] });
```

**After (Phase 3):**
```ts
const app = express();
await useExpressControllers(app, { controllers: [MyController] });
// OR
const app = await createExpressServer({ controllers: [MyController] });
```

This is a pre-v1 change; Phase 5 ships v1.0.0. All existing Phase 2 tests updated to use `await`.

## Test Coverage

| File | Tests |
|------|-------|
| `tests/adapter/response-next.test.ts` | 10 — per-branch next() verification |
| `tests/adapter/error-middleware-arity.test.ts` | 9 — isErrorMiddlewareInstance cases |
| `tests/adapter/router-build-phase3.test.ts` | 9 — handler array ordering, auth gate, interceptors |
| `tests/adapter/boot-phase3.test.ts` | 13 — global mw mounting, interceptors, error mw, auth |

Total tests: 383 (up from 342).

## Commits

| Hash | Description |
|------|-------------|
| f1f72ca | feat(03-04): add next() calls to all writeResponse success branches |
| 3a6ef43 | feat(03-04): add isErrorMiddlewareInstance arity-detection helper |
| 8ba136f | feat(03-04): extend buildControllerRouter to compose D-01 per-route handler arrays |
| 04b594b | feat(03-04): wire Phase 3 pipeline in boot.ts; async boot; public barrel updates |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated existing router-build.test.ts for new async signature**
- **Found during:** Task 3
- **Issue:** Phase 2 `buildControllerRouter.test.ts` tests called the synchronous 3-arg signature `buildControllerRouter(meta, '', factory)`. The new signature is async with a structured options object.
- **Fix:** Converted all 8 existing tests to `async`, added `makeOpts()` helper, used `await buildControllerRouter(meta, makeOpts(...))`. Added `expect(...).rejects.toThrow()` for error cases.
- **Files modified:** `tests/adapter/router-build.test.ts`
- **Commit:** 8ba136f

**2. [Rule 1 - Bug] Updated boot.test.ts for async boot**
- **Found during:** Task 4
- **Issue:** Phase 2 `boot.test.ts` tests called `createExpressServer(...)` and `useExpressControllers(...)` synchronously; now returns `Promise<Express>`.
- **Fix:** Added `await` to all boot call sites. Test 3 ("returns same app") now checks `await useExpressControllers(app, {})` returns `app`.
- **Files modified:** `tests/adapter/boot.test.ts`
- **Commit:** 04b594b

**3. [Rule 1 - Bug] Updated 02-sc-acceptance.test.ts for async boot**
- **Found during:** Task 4
- **Issue:** Integration SC tests called `createExpressServer(...)` synchronously. SC#4 used `expect(() => createExpressServer(...)).toThrow(...)` which can't work with an async function.
- **Fix:** Added `await` to all `createExpressServer/useExpressControllers` calls. SC#4 error cases converted to `await expect(createExpressServer(...)).rejects.toThrow(...)`.
- **Files modified:** `tests/integration/02-sc-acceptance.test.ts`
- **Commit:** 04b594b

**4. [Rule 1 - Bug] Updated 02-grep-gates.test.ts for async function signatures**
- **Found during:** Task 4
- **Issue:** Gates 5 and 6 searched for `'export function useExpressControllers'` — now the functions are `export async function`. Gates returned -1 and failed.
- **Fix:** Used `Math.max()` to search for both `'export function'` and `'export async function'` variants.
- **Files modified:** `tests/integration/02-grep-gates.test.ts`
- **Commit:** 04b594b

## Known Stubs

None. All hooks are wired end-to-end; Plan 05 adds the SC-level acceptance tests.

## Threat Flags

No new trust boundaries introduced in this plan. The auth gate ordering (auth before input validation per T-03-02) is preserved: `makeAuthGate` produces a handler at position 3 in the array, before `invokeHandler` (position 4), before `resolveInputs` runs inside the invoke step.

## Self-Check: PASSED

- `src/adapter/response.ts` exists: FOUND
- `src/adapter/error-middleware.ts` exists: FOUND (with `isErrorMiddlewareInstance`)
- `src/adapter/router-build.ts` exists: FOUND (with `async function buildControllerRouter`)
- `src/adapter/boot.ts` exists: FOUND (with `async function useExpressControllers`)
- `src/index.ts` exists: FOUND (with `InterceptorInterface` export)
- Commit f1f72ca: FOUND
- Commit 3a6ef43: FOUND
- Commit 8ba136f: FOUND
- Commit 04b594b: FOUND
- Test count: 383 / 383 pass
- `tsc --noEmit`: exit 0
