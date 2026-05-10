---
phase: 03-middleware-interceptors-auth-error-handling
plan: "03"
subsystem: adapter-helpers
tags: [middleware, interceptor, auth, validation, express-v5]
dependency_graph:
  requires:
    - 03-01 (Phase 3 decorators and storage helpers)
    - 03-02 (MetadataBuilder Phase 3 extension)
  provides:
    - src/adapter/middleware.ts (isClassForm, resolveMiddlewareClass, toRequestHandlers)
    - src/adapter/interceptor.ts (runInterceptors, resolveInterceptorClasses)
    - src/adapter/auth.ts (makeAuthGate, resolveCurrentUser, CURRENT_USER_KEY)
    - src/adapter/validation.ts extended with currentUser slot
  affects:
    - 03-04 (router-build wiring — consumes all four helpers)
tech_stack:
  added: []
  patterns:
    - "for/await interceptor chain (D-09)"
    - "Symbol key per-request cache (D-13)"
    - "401/403 distinction with false exception (D-12)"
    - "5th Promise.all arm for currentUser slot (D-14)"
key_files:
  created:
    - src/adapter/middleware.ts
    - src/adapter/interceptor.ts
    - src/adapter/auth.ts
    - tests/adapter/middleware.test.ts
    - tests/adapter/interceptor.test.ts
    - tests/adapter/auth.test.ts
    - tests/adapter/validation-current-user.test.ts
  modified:
    - src/adapter/validation.ts (currentUser slot extension)
    - src/errors/http-error.ts (ValidationSlot extended with 'currentUser')
    - tests/integration/02-grep-gates.test.ts (updated Gates 2 and 3 for Phase 3)
decisions:
  - "isClassForm uses prototype presence check (arg.prototype !== undefined && arg.prototype !== null) per D-06"
  - "toRequestHandlers resolves class instances once at compose time (not per request)"
  - "runInterceptors uses for/await loop — simplest, matches RC, no short-circuit needed"
  - "resolveCurrentUser uses in-operator cache so undefined user values are also cache hits"
  - "makeAuthGate: false from currentUserChecker is the strict exception that flows to authChecker (D-12)"
  - "validateCurrentUser as a 5th Promise.all arm keeps currentUser resolution parallel with four slots"
  - "ValidationSlot extended with 'currentUser' additively — existing callers unaffected"
  - "auth.ts try/catch exemption added to grep-gate (D-12 escape hatch is required correctness)"
  - "middleware.ts and auth.ts added to Express import allow-list in grep-gate (type-only imports)"
metrics:
  duration: "8 minutes"
  completed: "2026-05-10"
  tasks_completed: 3
  files_modified: 10
---

# Phase 3 Plan 03: Adapter Helpers (Middleware, Interceptor, Auth, Validation) Summary

**One-liner:** Three new adapter helpers (middleware form-detection/DI, interceptor for/await chain, auth gate with Symbol cache) plus currentUser slot extension in validation.ts — all runtime executors for Plan 04 wiring.

## What Was Built

### src/adapter/middleware.ts (NEW)

**Public API:**
- `isClassForm(arg: unknown): boolean` — returns `true` iff `typeof arg === 'function'` AND `arg.prototype !== undefined && arg.prototype !== null`. Distinguishes class-form from function-form (arrow/bound) per D-06.
- `resolveMiddlewareClass(cls: Function): Promise<ResolvedMiddleware>` — resolves via `getContainer().get(cls)`, validates presence of `use()` method, throws actionable error if missing (including class name).
- `toRequestHandlers(hooks: ReadonlyArray<Function>): Promise<RequestHandler[]>` — converts mixed function/class array to Express `RequestHandler[]`. Function-form entries pass through unchanged; class-form entries are resolved once (DI at compose-time) and wrapped in a handler that calls `instance.use(req, res, next)`. No try/catch — native v5 rejection forwarding.

**Key invariant:** No `try { }` blocks — Express v5 async error propagation handles rejections natively.

### src/adapter/interceptor.ts (NEW)

**Public API:**
- `resolveInterceptorClasses(classes: ReadonlyArray<Function>): Promise<InterceptorInstance[]>` — resolves each class via `getContainer().get(cls)`, validates `intercept` method, returns ordered list.
- `runInterceptors(instances: ReadonlyArray<InterceptorInstance>, action: Action, content: unknown): Promise<unknown>` — sequential `for/await` loop; each interceptor's return value becomes the next one's `content`. Empty array returns `content` unchanged.

**Key invariant:** No Express imports — fully Express-agnostic; works with any Action-compatible host.

### src/adapter/auth.ts (NEW)

**Public API:**
- `CURRENT_USER_KEY = Symbol('express-controllers/currentUser')` — namespaced Symbol for per-request user cache.
- `resolveCurrentUser(req, checker, action): Promise<unknown>` — lazy+cached via `in`-operator check on `req[CURRENT_USER_KEY]`. Undefined user values ARE cached (second call is a no-op).
- `makeAuthGate(authorized, authChecker, currentUserChecker): RequestHandler | null` — factory for the authorization Express middleware.

**401/403 Truth Table (D-12):**

| Condition | Result |
|-----------|--------|
| `authorized === undefined` | `null` (no gate — public route) |
| No `authChecker` registered | `next(new UnauthorizedError())` — 401 |
| `currentUserChecker` returns `null` | `next(new UnauthorizedError())` — 401 |
| `currentUserChecker` returns `undefined` | `next(new UnauthorizedError())` — 401 |
| `currentUserChecker` returns `0` or `''` | `next(new UnauthorizedError())` — 401 |
| `currentUserChecker` returns `false` (strict) | Flow continues to authChecker — NOT 401 |
| `authChecker` returns `false` | `next(new ForbiddenError())` — 403 |
| `authChecker` returns truthy | `next()` — allowed |
| Error thrown by checker | `next(err)` — escape hatch (D-12) |

**The `false` exception:** `false` is reserved for authChecker's vocabulary; currentUserChecker returning `false` (strict) does NOT trigger 401 — flow continues to authChecker. All other falsy values (`null`, `undefined`, `0`, `''`) do trigger 401.

**CURRENT_USER_KEY constant** (for Plan 04 reference): `Symbol('express-controllers/currentUser')`

### src/adapter/validation.ts (EXTENDED)

**Signature change:**
```typescript
// Before (Phase 2):
export async function resolveInputs(
  req: Pick<Request, 'params' | 'query' | 'body' | 'headers'>,
  input?: InputDeclaration
): Promise<ResolvedArgs>

// After (Phase 3):
export async function resolveInputs(
  req: Pick<Request, 'params' | 'query' | 'body' | 'headers'>,
  input?: InputDeclaration,
  currentUserResolver?: () => Promise<unknown>,  // NEW — optional closure
): Promise<ResolvedArgs>
```

**ResolvedArgs.currentUser added:**
```typescript
export interface ResolvedArgs {
  params: unknown;
  query: unknown;
  body: unknown;
  headers: unknown;
  currentUser?: unknown;  // NEW
}
```

**ValidationSlot extended:**
```typescript
// Before: 'params' | 'query' | 'body' | 'headers'
// After:  'params' | 'query' | 'body' | 'headers' | 'currentUser'
```

**currentUser resolution:** Runs as a 5th arm of `Promise.all` alongside the four existing slots. If `input.currentUser === true`, raw value is returned. If a Standard Schema, validation runs and issues are aggregated into the same BadRequestError. If no resolver provided, `currentUser` is `undefined` (no error).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Tests use arrow functions not vi.fn() for function-form detection**
- **Found during:** Task 1
- **Issue:** `vi.fn()` spy functions have `.prototype` defined (vitest creates them as regular functions), so `isClassForm(vi.fn())` returns `true`. Test expected identity-pass for "function-form" entries but `vi.fn()` was classified as class-form.
- **Fix:** Changed tests to use real arrow functions `(_req, _res, _next) => {}` for function-form entries.
- **Files modified:** tests/adapter/middleware.test.ts

**2. [Rule 1 - Bug] grep-gate Gate 3 needed auth.ts exemption**
- **Found during:** Task 3 (full suite run)
- **Issue:** Gate 3 ("no try/catch in src/adapter/ except handler-wrapper.ts") flagged auth.ts. The D-12 escape hatch requires try/catch in auth.ts to catch user-thrown HttpErrors from checkers and forward via `next(err)`.
- **Fix:** Added `auth.ts` to Gate 3's exemption list with a comment explaining it's the D-12 escape hatch.
- **Files modified:** tests/integration/02-grep-gates.test.ts

**3. [Rule 1 - Bug] grep-gate Gate 2 needed middleware.ts and auth.ts additions**
- **Found during:** Task 3 (full suite run)
- **Issue:** Gate 2 ("Express imports only in expected files") rejected middleware.ts and auth.ts which legitimately import Express types for RequestHandler.
- **Fix:** Added both files to Gate 2's allow-list with a comment.
- **Files modified:** tests/integration/02-grep-gates.test.ts

**4. [Rule 2 - Missing] ValidationSlot type narrowing for SLOTS array**
- **Found during:** Task 3 (tsc --noEmit)
- **Issue:** After adding `'currentUser'` to `ValidationSlot`, the `SLOTS.map(s => ... req[s])` call failed because `req` doesn't have a `currentUser` key. The type needed to be narrowed.
- **Fix:** Introduced `type ReqSlot = 'params' | 'query' | 'body' | 'headers'` and used it for `SLOTS` and `validateSlot` parameters while keeping `ValidationSlot` as the broader union type.
- **Files modified:** src/adapter/validation.ts

## Test Coverage

| File | Tests Added |
|------|------------|
| tests/adapter/middleware.test.ts | 16 |
| tests/adapter/interceptor.test.ts | 11 |
| tests/adapter/auth.test.ts | 20 |
| tests/adapter/validation-current-user.test.ts | 8 |
| **Total new** | **55** |

Full suite: 342 tests pass (was 287 before this plan).

## Self-Check: PASSED

- [x] src/adapter/middleware.ts exists and exports isClassForm, resolveMiddlewareClass, toRequestHandlers
- [x] src/adapter/interceptor.ts exists and exports runInterceptors, resolveInterceptorClasses
- [x] src/adapter/auth.ts exists and exports makeAuthGate, resolveCurrentUser, CURRENT_USER_KEY
- [x] src/adapter/validation.ts has currentUser in ResolvedArgs, resolveInputs has third param
- [x] tsc --noEmit: exit 0
- [x] All 342 tests pass
- [x] No Express imports in interceptor.ts (confirmed by grep-gate and direct check)
- [x] No try/catch in middleware.ts (confirmed by grep-gate)
