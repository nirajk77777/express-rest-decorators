# Phase 3: Middleware, Interceptors, Auth, Error Handling — Research

**Researched:** 2026-05-10
**Domain:** Express v5 middleware composition, interceptor chains, authorization patterns, error handler ordering — layered onto the Phase 2 pipeline
**Confidence:** HIGH (decisions sourced entirely from locked CONTEXT.md + verified codebase inspection; no speculative choices remain)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

All 18 implementation decisions (D-01 through D-18) in `03-CONTEXT.md` are locked and reproduced verbatim here for planner consumption. See `03-CONTEXT.md §decisions` for full decision rationale.

**Pipeline order (D-01):**
```
app.use(...)                            (user-mounted, outside the library)
↓ lib globals BEFORE                    (BootOptions.middlewares filtered to @Middleware({type:'before'}))
↓ @UseBefore(controller-level)          (decorator args left-to-right)
↓ @UseBefore(method-level)              (decorator args left-to-right)
↓ @Authorized check                     (if route is decorated)
↓ input validation                      (Phase 2 D-06..D-10)
↓ handler                               (controller method)
↓ interceptor chain                     (controller-level then method-level, declaration order)
↓ response writer                       (Phase 2 D-11..D-13)
↓ @UseAfter(method-level)               (left-to-right)
↓ @UseAfter(controller-level)           (left-to-right)
↓ lib globals AFTER                     (non-error @Middleware({type:'after'}))
↓ user error @Middleware({type:'after'}) (4-arg use; chain in registration order)
↓ lib default error middleware          (Phase 2 D-15..D-18; catch-all)
```

**Ordering rules (D-02):** Between levels: controller before method for `before`; method before controller for `after`. Within a single decorator's args: always left-to-right. Test fixture required (MW-04).

**Auth check position (D-03):** After all `@UseBefore`, before input validation.

**`ExpressMiddlewareInterface` (D-04):** `use(req, res, next): void | Promise<void>` — native Express signature; no Action wrapping.

**DI for class-form mw/interceptors (D-05):** `getContainer().get(MwClass)` — same hook controllers use.

**Variadic mixed-form (D-06):** `@UseBefore(mwA, MwClassB, fnC)` accepted; form detected at boot by prototype probe.

**Interceptor placement (D-08):** After handler return, after `@OnNull`/`@OnUndefined` short-circuit, before response writer. Null/undefined paths skip interceptors.

**Interceptor chain order (D-09):** Global (outermost) → controller-level → method-level; within each, left-to-right.

**Interceptors skip errors (D-10):** Handler throws → straight to error mw; interceptor-thrown errors propagate without `err.source`.

**`@Authorized` shapes (D-11):** `()`, `('admin')`, `(['a','b'])` — normalized to `string[] | undefined`.

**401 vs 403 (D-12):** 401 = no checker / checker not registered / `currentUserChecker` returns falsy. 403 = `authorizationChecker` returns `false`. User-thrown `HttpError` from inside checkers passes through unchanged.

**`currentUserChecker` lazy + cached (D-13):** Invoked only if route is `@Authorized` or handler declares `currentUser` slot; cached on request for duration of request.

**`currentUser` as `InputDeclaration` slot (D-14):** `currentUser?: true | StandardSchemaV1`. Extends Phase 2's `resolveInputs`; validates through schema if provided.

**Error-handler detection by arity (D-15):** `MwInstance.use.length === 4` → Express error middleware. Document minification footgun (arrow field `use = (err, req, res, next) => {}` preserves arity; `use(...args)` does NOT).

**Error chain semantics (D-16):** Calling `next(err)` forwards to next error mw; writing response stops chain; calling `next()` with no arg is a footgun (document loudly).

**Multiple user error handlers (D-17):** Chain in `BootOptions.middlewares` registration order.

**`err.source` already set (D-18):** Phase 2 D-16 handler-wrapper; Phase 3 reads but does not re-implement.

### Claude's Discretion

- Exact decorator factory TypeScript generic signatures for `@UseBefore`, `@UseAfter`, `@UseInterceptor`, `@Middleware`, `@Interceptor`, `@Authorized`
- Internal file layout under `src/adapter/` and `src/decorators/`
- Where `currentUser` slot integrates with `validation.ts` (5th `Promise.all` arm vs sequential step)
- Form-detection heuristic for variadic decorator args (D-06 prototype probe)
- Interceptor chain implementation (for/await vs reduce vs next()-passing)
- MetadataBuilder extension shape (amend Phase 1's resolved-types vs Phase-3-owned extension type)
- `@Middleware({ type, priority? })` — default to no priority (registration order)

### Deferred Ideas (OUT OF SCOPE)

- `@Middleware({ scope, controllers, priority })` targeting
- Source attribution for mw/interceptor-thrown errors
- Function-form / object-form `defaultErrorHandler` boot option
- Interceptor short-circuit (`next()`-style chain)
- `@CurrentUser()` parameter decorator
- `@Authorized` with predicate functions
- Phase 4 features (cookies, sessions, uploads, render, redirect, location, CORS, glob loading, `printRoutes`, AsyncLocalStorage)
- Phase 5 features (build pipeline, dual ESM+CJS publish, TypeDI adapter, migration guide)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MW-01 | `@UseBefore(...)` / `@UseAfter(...)` at controller and method level; function and class forms | D-04 / D-06 — native Express RequestHandler and ExpressMiddlewareInterface; form detection at boot |
| MW-02 | `@Middleware({ type: 'before' \| 'after' })` class decorator + global mounting via `BootOptions.middlewares` | D-01 pipeline; `BootOptions.middlewares` already typed in Phase 2 (no-op'd) |
| MW-03 | `@Interceptor()` + `@UseInterceptor(...)` for handler-return-value transformation | D-07 / D-08 / D-09 — InterceptorInterface shape; placement after handler before response writer |
| MW-04 | Deterministic ordering documented + proven by a test fixture | D-01 / D-02; test fixture is an explicit success criterion |
| AUTH-01 | `@Authorized(roles?)` decorator | D-11 — three argument shapes, normalized to `string[] \| undefined` |
| AUTH-02 | Global `authorizationChecker(action, roles)` returning `boolean \| Promise<boolean>`; 401/403 distinction | D-12 — AuthorizationChecker type already in boot-options.ts; 401 vs 403 rule locked |
| AUTH-03 | Global `currentUserChecker(action)` resolving current user; exposed via input declaration | D-13 / D-14 — lazy + cached invocation; `currentUser` extends `InputDeclaration` |
| ERR-04 | User `@Middleware({ type: 'after' })` error handlers run ahead of lib default | D-15 / D-16 / D-17 — arity detection; chain semantics; multiple handlers |
</phase_requirements>

---

## Summary

Phase 3 is a composition phase: all architectural decisions are locked in CONTEXT.md, all foundational code exists in Phase 1 and Phase 2, and every new piece slots into clearly defined extension points. There are no new runtime concerns to invent — only a systematic extension of existing patterns.

**What actually needs to be built** can be partitioned into four independent streams:

1. **Decorator + storage layer** — six new decorators (`@UseBefore`, `@UseAfter`, `@Middleware`, `@Interceptor`, `@UseInterceptor`, `@Authorized`) writing into new WeakMap entries; two new interface types (`ExpressMiddlewareInterface`, `InterceptorInterface`); two new metadata fields (`authorized`, `useBefore`, `useAfter`, `interceptors`) added to `ControllerArgs`/`MethodArgs` and their resolved counterparts. All follow Phase 1's decorator-as-pure-registrar pattern exactly.

2. **Metadata builder extension** — `MetadataBuilder.build()` reads the new WeakMap entries and includes them in `ControllerMetadata`/`ActionMetadata`. Additive; the inheritance-walk logic already handles subclass-wins through the existing chain walk.

3. **Adapter composition** — three new adapter helpers (`middleware.ts` for mw resolution + Express mounting; `interceptor.ts` for the chain runner; `auth.ts` for `@Authorized` gate + checker invocation) hooked into `router-build.ts` and `boot.ts`. The `validation.ts` `resolveInputs` function gains a `currentUser` arm. The `error-middleware.ts` mounting order in `boot.ts` gains user error-mw insertion ahead of the library default.

4. **Public barrel update** — six decorators, two interfaces, and `InterceptorInterface` / `ExpressMiddlewareInterface` added to `src/index.ts`.

The most complex implementation decision left to the planner is how the D-01 pipeline ordering translates into Express router registration: specifically, how controller-level `@UseBefore` handlers are registered on the router (not on the app) so they run inside the controller-router boundary and after globals but before method-level ones. The answer is to register them as route-level middleware on the specific route with the correct array order — this is the only non-obvious Express API usage in Phase 3.

**Primary recommendation:** Implement each stream as an independent plan wave. Decorator/storage first (no Express dependencies), then metadata builder extension (no Express dependencies), then adapter composition (depends on both), then barrel update + integration tests.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `@UseBefore` / `@UseAfter` decorator registration | Metadata (WeakMap storage) | — | Decorators are pure registrars; no Express import needed |
| `@Middleware` global class decorator | Metadata (WeakMap storage) | Boot adapter | Class marks itself as global; boot wires it |
| `@Interceptor` / `@UseInterceptor` decorator | Metadata (WeakMap storage) | — | Same pure-registrar pattern |
| `@Authorized` decorator | Metadata (WeakMap storage) | — | Stores roles array on method/class |
| Global middleware mounting (BootOptions.middlewares) | Boot adapter (`boot.ts`) | — | Boot is the only place that holds the Express app ref |
| Per-route middleware ordering | Router build adapter (`router-build.ts`) | — | Router.METHOD() registration controls order |
| Interceptor chain execution | New `interceptor.ts` helper | Response adapter | Runs between handler return and writeResponse |
| Auth gate check | New `auth.ts` helper | Validation adapter | Runs between @UseBefore and resolveInputs |
| `currentUser` resolution + caching | New `auth.ts` helper | Validation adapter | Extends resolveInputs with 5th arm |
| User error mw mounting | Boot adapter (`boot.ts`) | Error middleware | Insertion ahead of libraryErrorMiddleware |
| Error handler arity detection | Error middleware module | — | `.length` probe at mount time |

---

## Standard Stack

### Core (already installed — no new dependencies)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `express` | peer `^5.1.0` | HTTP framework; Router.METHOD registration; 4-arg error mw arity detection | Already peer dep |
| `reflect-metadata` | runtime dep | Reading `design:paramtypes` (no new usage in Phase 3 beyond Phase 1 patterns) | Already in deps |
| TypeScript `^5.8.0` | dev dep | Decorator generic signatures for 6 new decorators | Already installed |

Phase 3 introduces **zero new runtime dependencies**. All capabilities are built from Express's own API surface and the project's existing decorator + container machinery.

### Supporting (dev / test only — already installed)

| Library | Version | Purpose |
|---------|---------|---------|
| `vitest` | `^3.x` | Test runner; ordering fixture tests |
| `supertest` | installed | Integration testing of the full Express pipeline |
| `unplugin-swc` | installed | `emitDecoratorMetadata` in Vitest transforms |

**Version verification:** No new packages to install. Confirmed via codebase inspection of `package.json` (Phase 2 already pulled all required deps). [VERIFIED: codebase grep]

---

## Architecture Patterns

### System Architecture Diagram

```
                     BootOptions.middlewares (global before)
                              │
                     app.use(globalBeforeMw...)      ← boot.ts wires
                              │
                     app.use(mountPath, router)       ← one per controller
                              │
                   ┌──────────▼──────────────────────────────────┐
                   │           Express Router (per controller)     │
                   │                                              │
                   │  router.METHOD(path,                         │
                   │    ctrlLevelBeforeMw...,    ← UseBefore ctrl │
                   │    methodLevelBeforeMw...,  ← UseBefore meth │
                   │    authGate,                ← @Authorized    │
                   │    inputResolver,           ← resolveInputs  │
                   │    handler,                 ← controller fn  │
                   │    interceptorChain,        ← intercept(val) │
                   │    responseWriter,          ← writeResponse  │
                   │    methodLevelAfterMw...,   ← UseAfter meth  │
                   │    ctrlLevelAfterMw...      ← UseAfter ctrl  │
                   │  )                                           │
                   └──────────────────────────────────────────────┘
                              │
                     app.use(globalAfterMw...)        ← non-error globals
                              │
                     app.use(userErrorMw...)           ← 4-arg, phase 3
                              │
                     app.use(libraryErrorMiddleware)   ← phase 2 catch-all
```

**Key insight on registration:** Express processes route-level middleware in array order when all are registered in the same `router.METHOD(path, mw1, mw2, ..., handler)` call. The phase 3 adapter builds this array explicitly using the resolved metadata arrays and passes them as spread args. `@UseAfter` middleware cannot be route-level in the normal sense — Express has no native "after handler" hook on a route — so they must be implemented as middleware that calls `next()` to continue and then executes after the response has been written. The standard pattern is to wrap them in the response-writing step or use `res.on('finish', ...)`. See Pattern 2 below for the correct approach.

### Recommended Project Structure (additions only)

```
src/
├── decorators/
│   ├── middleware.ts          # @UseBefore, @UseAfter, @Middleware, @Interceptor, @UseInterceptor, @Authorized
│   └── index.ts               # re-export new decorators
├── adapter/
│   ├── middleware.ts          # mw resolver (form detection, DI instantiation, Express handler conversion)
│   ├── interceptor.ts         # interceptor chain runner
│   ├── auth.ts                # @Authorized gate, currentUserChecker invocation + per-request cache
│   ├── router-build.ts        # extended: uses mw/interceptor/auth helpers in handler composition
│   ├── boot.ts                # extended: mounts globals before controllers and user error mw after
│   ├── error-middleware.ts    # extended: arity-detection helper exported for boot.ts use
│   └── validation.ts          # extended: currentUser slot (5th arm of Promise.all or sequential)
├── metadata/
│   ├── storage.ts             # extended: new WeakMap entries for mw/interceptor/auth per class/method
│   └── types.ts               # extended: ControllerArgs + MethodArgs gain new optional fields
├── types/
│   └── resolved.ts            # extended: ControllerMetadata + ActionMetadata gain new fields
└── index.ts                   # extended: new public exports
```

### Pattern 1: Decorator-as-Pure-Registrar (existing pattern, extended)

**What:** Every new Phase 3 decorator mutates a WeakMap entry and returns. No Express imports. No prototype walking.

**When to use:** All six new decorators.

**Example (UseBefore):**
```typescript
// Source: Phase 1 D-07 pattern, extended to new storage keys
// src/decorators/middleware.ts
import { getOrInitControllerArgs, getOrInitMethodArgs } from '../metadata/storage.js';
import type { HookEntry } from '../metadata/types.js';

export function UseBefore(...handlers: Array<Function>): ClassDecorator & MethodDecorator {
  // ClassDecorator overload
  function asClass(target: Function): void {
    const meta = getOrInitControllerArgs(target);
    meta.useBefore = [...(meta.useBefore ?? []), ...handlers];
  }
  // MethodDecorator overload
  function asMethod(target: object, key: string | symbol, _desc: PropertyDescriptor): void {
    const meta = getOrInitMethodArgs(target, key);
    meta.useBefore = [...(meta.useBefore ?? []), ...handlers];
  }
  return function (target: Function | object, key?: string | symbol, desc?: PropertyDescriptor): void {
    if (key === undefined) {
      asClass(target as Function);
    } else {
      asMethod(target as object, key, desc!);
    }
  } as ClassDecorator & MethodDecorator;
}
```
[VERIFIED: pattern matches Phase 1 D-07 + existing controller.ts decorator shape]

### Pattern 2: UseAfter Implementation — the `res.on('finish')` approach

**What goes wrong if naive:** `@UseAfter` middleware registered as Express route-level middleware before the handler never fires "after" the handler — it fires in the normal middleware chain before response serialization. The only way to run code truly after a response is written is `res.on('finish', callback)` or by registering the middleware with `router.use()` after the route.

**The correct approach for this library:** Given the D-01 pipeline diagram, `@UseAfter` middleware fires AFTER the response writer (which sends the response). The cleanest Express-compatible implementation is:

1. Register `@UseAfter` handlers as route-level middleware that comes AFTER the response-writer middleware in the route's handler array. Since Express continues calling next-registered handlers even after a response has been sent (for non-error paths), the `@UseAfter` middleware will be called by `next()` from the response writer.
2. Alternatively, collect `@UseAfter` handlers and register them using `router.use(path, ...)` (non-route-specific middleware on the router) which Express evaluates for all matching paths after the route handler chain.
3. The simplest correct approach: the response writer (`writeResponse`) calls `next()` at the end of each branch (where currently it just returns), and `@UseAfter` middleware is inserted in the route handler array after `writeResponse`. This keeps ordering deterministic and colocated with the route registration.

**Recommended implementation decision for planner:** Use approach 3. This requires `writeResponse` to call `next()` at the end of each code path (it currently does not call `next()` after writing). This is a small additive change to `response.ts`. [VERIFIED: checked response.ts — none of the success branches call next()]

**Warning:** Do NOT register `@UseAfter` as a middleware BEFORE the handler in the route handler array — it would run before the handler, not after. [VERIFIED: Express docs — route-level middleware runs in array order]

### Pattern 3: Express Error Middleware — 4-arg Arity Rule

**What:** Express distinguishes error middleware from regular middleware purely by the number of declared parameters. A function with `(err, req, res, next)` — exactly 4 named parameters — is treated as an error middleware. A function with `(req, res, next)` — 3 parameters — is regular middleware. This is detected via `fn.length`.

**When to use:** D-15 — detecting whether a `@Middleware({ type: 'after' })` class's `use` method should be mounted as Express error middleware.

**Critical footgun (D-15):** Arrow function class fields with rest params (`use = (...args) => {}`) have `fn.length === 0`. Document this clearly. The safe form is:
```typescript
// SAFE — length === 4
use = (err: unknown, req: Request, res: Response, next: NextFunction) => { ... }

// BROKEN — length === 0 (minification also breaks named params)
use = (...args: unknown[]) => { ... }
```
[VERIFIED: Express error-handling docs — https://expressjs.com/en/guide/error-handling.html; MDN Function.length]

### Pattern 4: Interceptor Chain — `for/await` Loop

**What:** D-07 specifies the chain transforms `content` through each interceptor in turn. The simplest implementation is a sequential `for/await` loop.

**When to use:** The `interceptor.ts` chain runner.

**Example:**
```typescript
// Source: D-07 / D-09 decisions; for/await chosen per Claude's Discretion
// src/adapter/interceptor.ts
import type { Action } from '../types/action.js';
import type { InterceptorInterface } from '../interfaces/interceptor.js';

export async function runInterceptors(
  interceptors: InterceptorInterface[],
  action: Action,
  content: unknown,
): Promise<unknown> {
  let value = content;
  for (const interceptor of interceptors) {
    value = await interceptor.intercept(action, value);
  }
  return value;
}
```
[VERIFIED: D-07 / D-09 pattern; for/await is the canonical sequential-chain idiom in async TS]

### Pattern 5: Form Detection for Variadic Decorator Args (D-06)

**What:** `@UseBefore(mwA, MwClassB, fnC)` accepts both function-form (arrow fn or named fn with no `prototype`) and class-form (constructor function with a `.prototype`).

**Detection heuristic:**
```typescript
// src/adapter/middleware.ts
function isClassForm(arg: Function): boolean {
  // Arrow functions and bound functions have no .prototype (or it is undefined).
  // Class constructors emitted by tsc always have .prototype set.
  // Regular function declarations also have .prototype — this is acceptable because
  // they'd lack a .use() method and the boot-time check catches that.
  return typeof arg === 'function' && arg.prototype !== undefined && arg.prototype !== null;
}
```

**Boot-time validation:** After detecting class-form, check that the resolved instance has a `.use` method of the right form:
```typescript
const instance = await getContainer().get(Cls as never);
if (typeof (instance as any).use !== 'function') {
  throw new Error(
    `[${Cls.name}] Class-form middleware/interceptor must implement a use() method. ` +
    `Check that ${Cls.name} implements ExpressMiddlewareInterface.`
  );
}
```
[VERIFIED: MDN Function.prototype — arrow functions lack .prototype; tsc-emitted classes always have it]

### Pattern 6: Per-Request `currentUser` Cache (D-13)

**What:** Cache `currentUserChecker` result on the request object to avoid double-invocation.

**Implementation:** Use a Symbol key to avoid colliding with any user-set property or Phase 4's ALS keys:
```typescript
// src/adapter/auth.ts
const CURRENT_USER_KEY = Symbol('express-controllers/currentUser');

export async function resolveCurrentUser(
  req: Record<string | symbol, unknown>,
  checker: CurrentUserChecker,
  action: Action,
): Promise<unknown> {
  if (CURRENT_USER_KEY in req) return req[CURRENT_USER_KEY];
  const user = await checker(action);
  req[CURRENT_USER_KEY] = user;
  return user;
}
```
[VERIFIED: D-13 / Phase 3 → Phase 4 integration note in CONTEXT.md — Symbol key avoids Phase 4 ALS key collisions]

### Anti-Patterns to Avoid

- **`@UseAfter` as pre-handler route middleware:** Express does not run it after the handler. Use post-handler position in the route handler array.
- **`Reflect.defineMetadata` in Phase 3 decorators:** Phase 1 D-04 — WeakMap only; `Reflect.defineMetadata` is for TS-emitted keys exclusively.
- **String property on `req` for currentUser cache:** Risks colliding with Phase 4's `requestId` and `ALS` context. Use Symbol key.
- **`app.use()` for controller-level middleware:** It would run for ALL routes on the app, not just this controller's routes. Use `router.use()` inside the controller's router, or route-level handler array.
- **Calling `wrapAction()` again around middleware:** D-04 / D-18 — `wrapAction` is for handlers only; it attaches `err.source`. Middleware errors do not get source attribution (deferred). Do NOT wrap mw in wrapAction.
- **Trying to detect function-form by `instanceof Function`:** All class constructors AND all arrow functions are `instanceof Function`. Use `.prototype` presence check (Pattern 5) instead.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Async error forwarding from middleware | Custom try/catch + next(err) wrappers | Express v5 native rejection forwarding | v5 auto-forwards rejected async middleware; wrapping causes double-invocation (Pitfall 8) |
| Express error middleware type detection | String-based config flag or wrapper | `fn.length === 4` check | Express's own algorithm; any other approach diverges from Express behavior |
| Current-user resolution caching | External cache / Map | Symbol property on req | Req object is the natural per-request store; Symbol avoids collisions |
| Interceptor promise chaining | `.then()` chaining | `for await` loop | Simpler, readable, correct for sequential async chain |
| Class instantiation of mw/interceptors | `new MwClass()` inline | `getContainer().get(MwClass)` | Uniform DI policy (D-05); users with tsyringe/Awilix get injection automatically |

**Key insight:** Express's native async handling in v5 means zero try/catch is needed around middleware — the existing pattern from Phase 2 (`wrapAction` being the single source-attribution wrapper) must NOT be replicated for middleware. Middleware just calls `next(err)` or lets a rejection propagate naturally.

---

## Common Pitfalls

### Pitfall 1: `@UseAfter` running before the handler
**What goes wrong:** Registering `@UseAfter` middleware before the handler in the route handler array makes it run before the handler, not after. This is the biggest ordering mistake.
**Why it happens:** Developers assume "register before = runs after" due to conceptual confusion between decorator evaluation order and Express execution order.
**How to avoid:** The `@UseAfter` middleware must appear AFTER the `writeResponse` call in the route's handler array (or use `res.on('finish', ...)` pattern). The `writeResponse` function must call `next()` to pass control to the after-middleware.
**Warning signs:** `@UseAfter` handler fires before the controller method; response has already been sent when `@UseAfter` tries to set headers (which throws).

### Pitfall 2: Arity detection broken by arrow class fields with rest params
**What goes wrong:** A user writes `use = (...args) => {}` on their error middleware class. `fn.length === 0`. Library mounts it as regular middleware, not error middleware. Errors bypass it.
**Why it happens:** D-15 explicitly warns about this. JavaScript `Function.length` counts named params before the first default or rest parameter.
**How to avoid:** Document the required form `use = (err, req, res, next) => {}` prominently. Consider adding a boot-time diagnostic if `MwInstance.use.length === 0` and `type === 'after'` (warn that arity may be wrong).
**Warning signs:** Error handler class that declares 4 params but uses rest params; runs as regular mw on success path only, never on error path.

### Pitfall 3: Global `@Middleware` registered via `app.use()` vs `router.use()`
**What goes wrong:** Mounting global before-middleware via `app.use(middleware)` BEFORE `app.use(mountPath, router)` achieves the "outermost" behavior correctly. However, mounting global after-middleware via `app.use(afterMw)` AFTER all routers but BEFORE the lib error mw ALSO needs to be mounted on the app (not on any router) to ensure it runs for all controller responses.
**Why it happens:** Confusion between app-level and router-level middleware scoping.
**How to avoid:** D-01 is the authoritative order. In `boot.ts`, the mounting sequence must be:
  1. `app.use(globalBeforeMw...)` — app-level
  2. `app.use(mountPath, router)` — for each controller
  3. `app.use(globalAfterMw...)` — app-level (non-error)
  4. `app.use(userErrorMw...)` — app-level (4-arg)
  5. `app.use(libraryErrorMiddleware)` — app-level (catch-all)
**Warning signs:** Global after-middleware or user error middleware not firing for some controllers.

### Pitfall 4: `currentUserChecker` invoked twice per request
**What goes wrong:** Without caching, a route that is both `@Authorized` AND has a `currentUser` input slot invokes the checker twice. If the checker hits a database or an external identity provider, this doubles the cost.
**Why it happens:** Auth gate (`auth.ts`) and input resolution (`validation.ts`) both need the user; without a shared cache on the request, they each invoke independently.
**How to avoid:** D-13 — use the Symbol-keyed per-request cache (Pattern 6). Both code paths call `resolveCurrentUser(req, checker, action)` which checks the cache before invoking.
**Warning signs:** Auth-related logs showing double queries per request; integration tests verifying checker call count failing.

### Pitfall 5: Interceptor receiving `null`/`undefined` from handler
**What goes wrong:** D-08 says null/undefined results short-circuit to `res.status(code).end()` and interceptors do NOT run. If the adapter does not check for null/undefined BEFORE starting the interceptor chain, interceptors receive `null` or `undefined` as `content` and must handle it themselves — breaking the spec and potentially masking bugs.
**Why it happens:** Connecting the interceptor chain to the handler result without checking D-13's short-circuit condition first.
**How to avoid:** The `invokeAction` flow in `boot.ts` must check null/undefined BEFORE calling `runInterceptors`. If null/undefined and a `@OnNull`/`@OnUndefined` shaper is set, go directly to `writeResponse` (which handles the short-circuit per Phase 2 D-13). If no shaper set, the 204 default branch in `writeResponse` handles it — still skip interceptors (nothing to transform).
**Warning signs:** Interceptors receiving `null` as `content`; tests showing interceptors running on 204 responses.

### Pitfall 6: Class-form `@UseBefore` middleware instantiated at decorator-apply time
**What goes wrong:** If the adapter resolves the class instance inside the decorator factory (at decoration time, not boot time), `getContainer()` is called before `useContainer()` has been called by the user — the WeakMap default container is used for every class. Users calling `useContainer(tsyringeContainer)` after decorating get the default container for mw, not their container.
**Why it happens:** Temptation to resolve instances eagerly.
**How to avoid:** Decorators store the class constructor only (pure registrar, D-07). `getContainer().get(Cls)` is called at route-build time in `router-build.ts`, after boot is complete and `useContainer()` has been called.
**Warning signs:** Mw class not receiving injected constructor args despite tsyringe being wired; `useContainer()` appears to have no effect on middleware.

### Pitfall 7: `writeResponse` not calling `next()` breaks `@UseAfter`
**What goes wrong:** Currently `writeResponse` ends the response and returns. If `@UseAfter` middleware is registered as subsequent handlers in the route's handler array, they will never be called because Express only advances to the next handler when `next()` is called (for non-error paths on routes where the response is written).
**Why it happens:** Phase 2 `writeResponse` was designed without `@UseAfter` hooks in mind.
**How to avoid:** Either (a) modify `writeResponse` to call `next()` at the end of each branch, or (b) implement `@UseAfter` via `res.on('finish', ...)` listener registered before the handler executes. Option (a) is simpler and keeps the linear array model. Option (b) works but requires care around error responses (the 'finish' event fires on error responses too, but `@UseAfter` should arguably not run on error paths — this is unspecified; default to not running).
**Recommended:** Option (a) — call `next()` at the end of each `writeResponse` branch. This enables the simple linear route-handler-array model.

---

## Code Examples

### MetadataTypes extension (additive)
```typescript
// Source: Phase 1 storage.ts pattern, extended
// src/metadata/types.ts — additions only

export type HookEntry = Function; // class constructor OR request handler function

export interface ControllerArgs {
  basePath: string;
  type: 'json' | 'default';
  responseHandlers: ResponseHandlerArgs[];
  // Phase 3 additions:
  useBefore?: HookEntry[];
  useAfter?: HookEntry[];
  interceptors?: Function[];     // class constructors only
  authorized?: string[] | null;  // null = @Authorized() (no roles); undefined = not decorated
}

export interface MethodArgs {
  verb: string;
  path: string;
  input?: InputDeclaration;
  returnType?: Function;
  paramTypes?: Function[];
  responseHandlers: ResponseHandlerArgs[];
  // Phase 3 additions:
  useBefore?: HookEntry[];
  useAfter?: HookEntry[];
  interceptors?: Function[];
  authorized?: string[] | null;
}

// Extended InputDeclaration for currentUser slot (D-14)
export interface InputDeclaration {
  params?: unknown;
  query?: unknown;
  body?: unknown;
  headers?: unknown;
  currentUser?: true | StandardSchemaV1;  // Phase 3 addition
}
```

### ResolvedMetadata extension (additive)
```typescript
// Source: types/resolved.ts — additions only
export interface ControllerMetadata {
  target: Function;
  basePath: string;
  type: 'json' | 'default';
  responseHandlers: ResponseHandlerArgs[];
  actions: ActionMetadata[];
  // Phase 3 additions:
  useBefore: HookEntry[];
  useAfter: HookEntry[];
  interceptors: Function[];
  authorized?: string[] | null;
}

export interface ActionMetadata {
  target: Function;
  method: string | symbol;
  verb: string;
  path: string;
  input?: InputDeclaration;
  returnType?: Function;
  paramTypes?: Function[];
  responseHandlers: ResponseHandlerArgs[];
  // Phase 3 additions:
  useBefore: HookEntry[];
  useAfter: HookEntry[];
  interceptors: Function[];
  authorized?: string[] | null;
}
```

### Auth gate (auth.ts)
```typescript
// Source: D-03 / D-12 / D-13 decisions
// src/adapter/auth.ts
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { Action } from '../types/action.js';
import type { AuthorizationChecker, CurrentUserChecker } from './boot-options.js';
import { UnauthorizedError, ForbiddenError } from '../errors/subclasses.js';

const CURRENT_USER_KEY = Symbol('express-controllers/currentUser');

export async function resolveCurrentUser(
  req: Request,
  checker: CurrentUserChecker,
  action: Action,
): Promise<unknown> {
  const reqAny = req as unknown as Record<symbol, unknown>;
  if (CURRENT_USER_KEY in reqAny) return reqAny[CURRENT_USER_KEY];
  const user = await checker(action);
  reqAny[CURRENT_USER_KEY] = user;
  return user;
}

// Returns a RequestHandler that acts as the auth gate for one route
export function makeAuthGate(
  authorized: string[] | null | undefined,
  authChecker: AuthorizationChecker | undefined,
  currentUserChecker: CurrentUserChecker | undefined,
): RequestHandler | null {
  if (authorized === undefined) return null; // route not @Authorized

  return async (req: Request, res: Response, next: NextFunction) => {
    const action: Action = { request: req, response: res, next };
    try {
      // D-12: No checker registered → 401
      if (!authChecker) {
        return next(new UnauthorizedError());
      }
      // D-12: currentUserChecker returns falsy → 401
      if (currentUserChecker) {
        const user = await resolveCurrentUser(req, currentUserChecker, action);
        if (!user && user !== false) {
          return next(new UnauthorizedError());
        }
      }
      // D-12: authChecker returns false → 403
      const ok = await authChecker(action, authorized ?? undefined);
      if (ok === false) {
        return next(new ForbiddenError());
      }
      next();
    } catch (err) {
      // User-thrown HttpError passes through unchanged (D-12 escape hatch)
      next(err);
    }
  };
}
```

### Public interface types
```typescript
// Source: D-04 / D-07 decisions
// src/interfaces/middleware.ts
import type { Request, Response, NextFunction } from 'express';

export interface ExpressMiddlewareInterface {
  use(req: Request, res: Response, next: NextFunction): void | Promise<void>;
}

// Error form — 4-arg (D-15)
export interface ExpressErrorMiddlewareInterface {
  use(err: unknown, req: Request, res: Response, next: NextFunction): void | Promise<void>;
}

// src/interfaces/interceptor.ts
import type { Action } from '../types/action.js';

export interface InterceptorInterface {
  intercept(action: Action, content: unknown): unknown | Promise<unknown>;
}
```

### `@Authorized` decorator
```typescript
// Source: D-11 — three argument shapes
// src/decorators/middleware.ts
export function Authorized(): ClassDecorator & MethodDecorator;
export function Authorized(role: string): ClassDecorator & MethodDecorator;
export function Authorized(roles: string[]): ClassDecorator & MethodDecorator;
export function Authorized(roleOrRoles?: string | string[]): ClassDecorator & MethodDecorator {
  // Normalize to string[] | null (null = @Authorized() with no roles)
  const normalized: string[] | null =
    roleOrRoles === undefined
      ? null
      : Array.isArray(roleOrRoles)
        ? roleOrRoles
        : [roleOrRoles];

  return function (target: Function | object, key?: string | symbol, desc?: PropertyDescriptor): void {
    if (key === undefined) {
      const meta = getOrInitControllerArgs(target as Function);
      meta.authorized = normalized;
    } else {
      const meta = getOrInitMethodArgs(target as object, key);
      meta.authorized = normalized;
    }
  } as ClassDecorator & MethodDecorator;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| routing-controllers v4-era try/catch wrapper around every handler | Express v5 native async rejection forwarding | Express v5 GA (Oct 2024) | No try/catch in adapter; error middleware sees every rejection exactly once |
| routing-controllers module-level `defaultMetadataArgsStorage` | Per-class WeakMap storage (Phase 1 D-04) | Phase 1 of this project | Multi-instance safe; Vitest-isolation safe; no HMR pollution |
| routing-controllers `@Middleware({ scope: 'global', controllers: [...] })` scoping | Registration-position scoping only (BootOptions.middlewares = global; @UseBefore = scoped) | Phase 3 design decision | Simpler; deferred advanced scoping to v1.x |
| routing-controllers `@CurrentUser()` parameter decorator | `currentUser` input-declaration slot (D-14) | Phase 3 design decision | Consistent with Phase 1's input-declaration model; no parameter decorators |

**Deprecated/outdated patterns for this codebase:**
- `res.send(status, body)` — Express v5 removed; use `res.status(x).send(body)` (already handled in Phase 2)
- `Reflect.defineMetadata` in library decorators — project uses WeakMap exclusively
- `require('express')` top-level in decorator files — decorators must have zero Express imports

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `writeResponse` calling `next()` at end of each branch is a safe additive change that won't break Phase 2 behavior | Pattern 2 / Pitfall 7 | Could cause double-next or unexpected subsequent middleware if Express routes have other handlers in the array — low risk since Phase 2 routes have no subsequent handlers today |
| A2 | Arrow function class field `use = (err, req, res, next) => {}` has `Function.length === 4` | Pattern 3 / Pitfall 2 | [VERIFIED: MDN spec — length counts named params before first default/rest; four named params = 4] |
| A3 | Symbol property on `req` for currentUser cache does not conflict with Express's internal request properties | Pattern 6 | [VERIFIED: Express does not use Symbol-keyed properties internally in v5 — codebase inspection of express source] [ASSUMED: comprehensive — may miss future Express versions] |

**If this table is near-empty:** The decisions sourced from CONTEXT.md eliminate essentially all speculation. A1 and A3 carry LOW risk; A2 is verified.

---

## Open Questions

1. **`@UseAfter` and error responses**
   - What we know: D-01 pipeline shows `@UseAfter` runs after the response writer, before the global after-middleware. Error paths skip to the error chain.
   - What's unclear: Should `@UseAfter` run when the handler throws (error path)? CONTEXT.md does not specify. RC does not run `@UseAfter` on error paths.
   - Recommendation: Follow RC — `@UseAfter` does NOT run on error paths. The `wrapAction` try/catch calls `next(err)` which skips to error middleware, bypassing the `@UseAfter` handlers in the route array. Document this.

2. **Controller-level `@Authorized` vs method-level**
   - What we know: D-11 normalizes the decorator; Phase 1's inheritance walk handles subclass-wins.
   - What's unclear: If both controller AND method have `@Authorized`, which wins? Should they combine (AND logic) or should method override controller?
   - Recommendation: Method-level wins (subclass-wins / last-write-wins per Phase 1 D-06). If only controller-level is set and method is not decorated, the controller-level applies. Document this. RC follows the same rule.

3. **Global interceptors ordering relative to controller-level**
   - What we know: D-09 says global `@Interceptor()` runs FIRST (outermost), then controller-level, then method-level.
   - What's unclear: `BootOptions.interceptors` currently typed as `ReadonlyArray<ClassConstructor<unknown>>`. The boot logic needs to resolve them and prepend to every route's interceptor chain.
   - Recommendation: In `boot.ts`, resolve global interceptors once at boot (via `getContainer().get()` for each), store as an array, and pass to `router-build.ts` as a parameter. The route-level chain becomes `[...globalInterceptors, ...ctrlInterceptors, ...methodInterceptors]`.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 3 is purely code changes with no new external tool dependencies. All required runtime deps (Express, reflect-metadata) and dev tools (Vitest, supertest, unplugin-swc) are already installed. [VERIFIED: codebase inspection of package.json]

---

## Runtime State Inventory

Step 2.5: SKIPPED — Phase 3 is a feature addition, not a rename/refactor/migration phase. No stored data, live service config, or OS-registered state is affected.

---

## Security Domain

Phase 3 introduces the authorization surface — the highest-security concern in the library.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Indirectly | `currentUserChecker` resolves identity; library does not own auth mechanism |
| V4 Access Control | YES | `@Authorized` + `authorizationChecker`; 401/403 distinction (D-12) |
| V5 Input Validation | YES | `currentUser` slot validation via StandardSchemaV1 (D-14) |
| V3 Session Management | No | Sessions deferred to Phase 4 |
| V6 Cryptography | No | No crypto in Phase 3 |

### Known Threat Patterns for Auth Decorator Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthenticated access to `@Authorized` route when no `authorizationChecker` registered | Elevation of privilege | D-12 — throw `UnauthorizedError` immediately when no checker registered; no silent pass-through |
| Auth check bypass if `@Authorized` metadata not read from subclass | Elevation of privilege | Phase 1 D-06 subclass-wins walk; tested by MetadataBuilder inheritance tests |
| `currentUser` data returned raw without type narrowing | Information disclosure | D-14 — optional StandardSchemaV1 validates/narrows the user value; encourage users to provide a schema |
| 401 vs 403 information disclosure (leaking route existence) | Information disclosure | D-03 — auth check fires BEFORE input validation; unauthenticated callers see 401, not 400 (no route detail leak) |
| Error mw exposing stack traces in production | Information disclosure | Phase 2 D-18 — `isProd` check in `libraryErrorMiddleware` already strips stack/devMessage in production; user error mw must do the same (document) |
| Interceptor transforming error values | Tampering | D-10 — interceptors do NOT run on error paths; errors go directly to error middleware |

---

## Sources

### Primary (HIGH confidence)
- `03-CONTEXT.md` — all 18 decisions (D-01 through D-18) are locked; this is the authoritative source for Phase 3 behavior [VERIFIED: read in full]
- `src/adapter/boot.ts` — existing mounting order; Phase 3 extension points [VERIFIED: codebase inspection]
- `src/adapter/router-build.ts` — existing route registration; Phase 3 extends handler array composition [VERIFIED: codebase inspection]
- `src/adapter/validation.ts` — `resolveInputs` function; Phase 3 adds `currentUser` arm [VERIFIED: codebase inspection]
- `src/adapter/error-middleware.ts` — existing `libraryErrorMiddleware`; Phase 3 inserts user error mw ahead [VERIFIED: codebase inspection]
- `src/adapter/handler-wrapper.ts` — `wrapAction` with `err.source`; Phase 3 must NOT rewrap [VERIFIED: codebase inspection]
- `src/metadata/storage.ts`, `src/metadata/types.ts`, `src/types/resolved.ts` — extension targets [VERIFIED: codebase inspection]
- Express error-handling docs — 4-arg arity rule [CITED: https://expressjs.com/en/guide/error-handling.html]
- MDN Function.length — arity counting rules, rest parameter interaction [CITED: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/length]

### Secondary (MEDIUM confidence)
- `.planning/research/PITFALLS.md` §Pitfall 13 — middleware ordering; §Pitfall 8 — async double-wrap [CITED: project research docs]
- routing-controllers ExpressDriver.ts ordering semantics (referenced in CONTEXT.md canonical refs) [ASSUMED — not re-verified in this session; decisions in CONTEXT.md already incorporate these semantics]

---

## Metadata

**Confidence breakdown:**
- Decorator patterns: HIGH — established by Phase 1 patterns; verified against existing controller.ts / routes.ts
- Middleware ordering (Express): HIGH — 4-arg arity rule, route-handler array order are standard Express mechanics
- Interceptor chain: HIGH — for/await sequential loop is canonical; D-07/D-09 specify all behaviors
- Auth gate: HIGH — D-12 specifies 401/403 rule precisely; UnauthorizedError/ForbiddenError already exist
- `@UseAfter` execution model: MEDIUM — requires `writeResponse` to call `next()`; this is a small but undiscussed change to Phase 2 code
- `currentUser` slot extension to `validation.ts`: HIGH — additive extension of existing `resolveInputs` pattern

**Research date:** 2026-05-10
**Valid until:** 90 days (stable; all patterns are Express and TypeScript fundamentals with no fast-moving dependencies)

---

## RESEARCH COMPLETE

**Phase:** 3 — Middleware, Interceptors, Auth, Error Handling
**Confidence:** HIGH

### Key Findings

- **Zero new runtime dependencies** — Phase 3 is a pure composition of Express's native middleware array, the existing `getContainer()` DI hook, and the existing WeakMap metadata storage. No new packages.
- **`@UseAfter` requires `writeResponse` to call `next()`** — This is the one non-obvious change to Phase 2 code. `writeResponse` currently ends response and returns; it must be extended to call `next()` so subsequent `@UseAfter` handlers in the route array fire.
- **Auth gate is a `RequestHandler` inserted between `@UseBefore` and `resolveInputs`** — `makeAuthGate()` returns `null` for unauthenticated routes (zero cost), or a standard async RequestHandler for `@Authorized` routes. Inserted in the route handler array at route-build time.
- **`currentUser` cache via Symbol key on `req`** — avoids double-invocation when both auth gate and input slot need the user; Symbol avoids Phase 4 ALS key collisions.
- **`@UseAfter` does NOT run on error paths** — errors go directly to error middleware chain, bypassing `@UseAfter` handlers. Follow RC semantics; document this clearly.
- **Arity-detection footgun is real** — `use = (...args) => {}` has `length === 0`. Document the safe form loudly; consider a boot-time warning.

### File Created
`.planning/phases/03-middleware-interceptors-auth-error-handling/03-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Decorator + storage layer | HIGH | Exact Phase 1 pattern; 6 decorators are structural clones of existing ones |
| Metadata builder extension | HIGH | Additive only; existing inheritance walk handles it |
| Middleware ordering in Express | HIGH | Standard Express route-array mechanics; verified against Express docs |
| Interceptor chain | HIGH | Spec'd completely by D-07/D-08/D-09; for/await is canonical |
| Auth gate | HIGH | D-12 fully specifies 401/403; existing error types are ready |
| `@UseAfter` execution model | MEDIUM | Requires undiscussed `writeResponse` change; low risk but plan must include it |
| User error mw ordering | HIGH | Standard Express error mw mounting; D-15/D-16/D-17 fully spec'd |

### Open Questions
1. Does `@UseAfter` run on error paths? (Recommendation: no — follow RC; document it)
2. Controller-level vs method-level `@Authorized` when both set? (Recommendation: method wins)
3. Global interceptors passed through boot.ts as a resolved array or resolved per-route? (Recommendation: resolved once at boot, passed as parameter to route builder)

### Ready for Planning
Research complete. Planner can create PLAN.md waves using the patterns, anti-patterns, and file layout in this document.
