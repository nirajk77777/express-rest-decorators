---
phase: 04-uploads-cookies-sessions-render-request-context
plan: "01"
subsystem: adapter
tags: [als, async-local-storage, request-context, middleware, phase-4]
dependency_graph:
  requires: []
  provides: [getRequestContext, RequestContext, createAlsMiddleware]
  affects: [src/adapter/boot.ts, src/index.ts]
tech_stack:
  added: [node:async_hooks, node:crypto]
  patterns: [AsyncLocalStorage-singleton, outermost-middleware, module-scoped-store]
key_files:
  created:
    - src/adapter/request-context.ts
    - tests/request-context.test.ts
  modified:
    - src/adapter/boot.ts
    - src/index.ts
    - tests/integration/02-grep-gates.test.ts
decisions:
  - "ALS singleton is module-scoped (one per process), not per-app — als.run() scopes per-request"
  - "createExpressServer restructured to pass body parsers as middlewares option so ALS runs outermost before express.json()"
  - "02-grep-gates allow-lists extended for Phase 4 additions (additive, not breaking)"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-10"
  tasks: 3
  files: 5
---

# Phase 4 Plan 01: Request Context ALS Summary

**One-liner:** AsyncLocalStorage-backed request context with UUID/header requestId, cross-await propagation, and outermost middleware placement.

## What Was Built

### `src/adapter/request-context.ts` (new)

Module-scoped `AsyncLocalStorage<RequestContext>` singleton exposing:
- `createAlsMiddleware()` — returns an Express `RequestHandler` that reads `X-Request-Id` header (trimmed, verbatim) or generates `crypto.randomUUID()`, then wraps the request with `als.run({ req, res, requestId }, () => next())`.
- `getRequestContext()` — returns the current `{ req, res, requestId }` store; throws a specific actionable error if called outside an active request scope (D-14).
- `RequestContext` interface (exported type).

Key decisions:
- `node:async_hooks` and `node:crypto` imports (explicit module: prefix for ESM/CJS portability)
- Empty/whitespace-only header treated as absent (falls back to UUID)
- `requestId` NEVER stored on `req` (D-13 invariant)

### `src/adapter/boot.ts` (modified)

**ALS wrapper wired as the FIRST `app.use()` call inside `useExpressControllers` (D-11/D-18):**

```diff
+ import { createAlsMiddleware } from './request-context.js';
  
  export async function useExpressControllers(app, options) {
+   // Phase 4 D-11/D-18: ALS wrapper MUST be the outermost app.use() owned by the library.
+   app.use(createAlsMiddleware());
    
    const controllers = buildMetadata(...);  // existing Step 1
    ...
```

`createExpressServer` restructured so body parsers run AFTER ALS (D-11/D-18 anti-pattern: "Mounting the ALS wrapper after `app.use(express.json())`"):
- Body parsers now injected as function-form middlewares passed to `useExpressControllers` (which mounts them AFTER ALS)

app.use ordering inside `useExpressControllers` (line-numbered key positions):
- Line 115: `app.use(createAlsMiddleware())` ← ALS outermost
- Line 165: `app.use(...beforeHandlers)` ← global before middleware (incl. body parsers from createExpressServer)
- Line 196: `app.use(mountPath, router)` ← controller routers
- Line 202: `app.use(...afterNonErrorHandlers)` ← global after middleware
- Line 216+: error middleware chain

### `src/index.ts` (modified)

Added public Phase 4 exports:
```typescript
// Phase 4 — request context (AsyncLocalStorage)
export { getRequestContext } from './adapter/request-context.js';
export type { RequestContext } from './adapter/request-context.js';
```

`createAlsMiddleware` is NOT exported (internal adapter helper).

### `tests/request-context.test.ts` (new)

6 smoke tests proving ROADMAP SC #5:

| Test | Status |
|------|--------|
| `getRequestContext throws when called outside a request` — exact error message | PASS |
| `requestId from X-Request-Id header is used verbatim` — `trace-abc-123` | PASS |
| `requestId falls back to randomUUID when header absent` — UUID regex match | PASS |
| `requestId falls back to randomUUID when header is empty/whitespace` — `"   "` | PASS |
| ALS context survives an await boundary (cross-await smoke test) — `setImmediate` + external module-scope helper | PASS |
| `concurrent requests get different requestIds` — 5 parallel requests, all unique | PASS |

### `tests/integration/02-grep-gates.test.ts` (modified)

Extended Phase 2 grep gates to accommodate Phase 4 additive exports:
- Gate 2 allow-list: added `src/adapter/request-context.ts` (legitimate Express importer)
- Gate 8 allow-list: added `getRequestContext`, `RequestContext` (documented Phase 4 public surface)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Phase 2 grep gates needed extension for Phase 4**
- **Found during:** Task 3 — full test suite run
- **Issue:** 02-grep-gates.test.ts had static allow-lists that didn't include Phase 4 additions. Gate 2 flagged `request-context.ts` as an unexpected Express importer; Gate 8 flagged `getRequestContext` as an unexpected barrel export.
- **Fix:** Extended both allow-lists with Phase 4 entries. The gates remain stricter than before (Phase 4 symbols are now explicitly allowed, not any symbol).
- **Files modified:** `tests/integration/02-grep-gates.test.ts`
- **Commit:** fa64508

**2. [Rule 2 - Missing Critical Functionality] createExpressServer body-parser ordering vs ALS**
- **Found during:** Task 2 — reading the anti-pattern "Mounting the ALS wrapper after `app.use(express.json())`" in RESEARCH
- **Issue:** Original `createExpressServer` mounted body parsers (`app.use(express.json())`) BEFORE calling `useExpressControllers`, which meant ALS would mount AFTER body parsers — violating D-11/D-18.
- **Fix:** Restructured `createExpressServer` to inject body parsers as function-form entries in `middlewares` option, which `useExpressControllers` mounts AFTER the ALS wrapper.
- **Files modified:** `src/adapter/boot.ts`
- **Commit:** 86d9d4f

## Known Stubs

None. All exported symbols are fully implemented and wired.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| (none) | — | No new threat surface beyond what is documented in plan's threat_model (T-04-01 through T-04-04 are addressed by implementation) |

## Self-Check: PASSED

- src/adapter/request-context.ts: FOUND
- tests/request-context.test.ts: FOUND
- Commit c74aa97 (Task 1): FOUND
- Commit 86d9d4f (Task 2): FOUND
- Commit fa64508 (Task 3): FOUND
