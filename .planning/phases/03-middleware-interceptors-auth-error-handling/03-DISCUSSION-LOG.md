# Phase 3: Middleware, Interceptors, Auth, Error Handling - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-10
**Phase:** 03-Middleware, Interceptors, Auth, Error Handling
**Areas discussed:** Pipeline ordering, Mw/Interceptor shape, Auth semantics, User error handler

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Pipeline ordering | Exact execution order across hook layers (globals, UseBefore/After, Authorized, validation, handler, interceptor, response, after-mw, user error mw, lib default error mw). Routing-controllers semantics or modernized? | ✓ |
| Mw/Interceptor shape | ExpressMiddlewareInterface and InterceptorInterface signatures, async support, multi-interceptor chain order, interceptor placement vs response writer, class-form DI policy. | ✓ |
| Auth semantics | @Authorized argument shapes, currentUserChecker invocation policy, 401 vs 403 rule, currentUser exposure (slot vs param decorator). | ✓ |
| User error handler | ERR-04: detect user @Middleware({type:'after'}) error mw by arity / option / separate decorator; chain semantics; multi-handler support; err.source flow. | ✓ |

**User's choice:** All four selected.

---

## Pipeline ordering

### Where do GLOBAL middlewares execute relative to controller-scoped @UseBefore/@UseAfter?

| Option | Description | Selected |
|--------|-------------|----------|
| Globals outermost (Recommended) | app.use → lib globals BEFORE → @UseBefore(ctrl) → @UseBefore(method) → @Authorized → handler → interceptors → res → @UseAfter(method) → @UseAfter(ctrl) → lib globals AFTER → user error @Middleware → lib default err mw. Matches RC; cross-cutting concerns wrap whole stack. | ✓ |
| Globals per-router | Globals mount on each controller's express.Router() at the top, so they're inside routePrefix. Cleaner isolation but breaks RC parity. | |
| Globals innermost | Globals run AFTER @UseBefore(method), just before the handler. Treats globals as 'last-line' guards. Unusual; not how RC works. | |

**User's choice:** Globals outermost (Recommended).

### MW-04 ordering for multiple args within @UseBefore(a, b, c)?

| Option | Description | Selected |
|--------|-------------|----------|
| Args left-to-right (Recommended) | Both before and after expand a→b→c; reversal applies between LEVELS only. Matches RC. | ✓ |
| Args reversed for after | @UseAfter(a, b, c) runs c→b→a (mirror). More 'symmetric' but less intuitive. RC does NOT do this. | |
| Stacked decorators only | Disallow variadic args; require one mw per decorator. Verbose; breaks RC parity. | |

**User's choice:** Args left-to-right (Recommended).

### Where does @Authorized fire in the per-request pipeline?

| Option | Description | Selected |
|--------|-------------|----------|
| After all UseBefore (Recommended) | ...UseBefore(method) → @Authorized → input validation → handler. Mw can prepare context (decode JWT) before auth check. Matches RC. | ✓ |
| Before UseBefore | Auth check FIRST. Stricter but mw can't decode tokens to feed checker. | |
| After input validation | ...UseBefore → validation → @Authorized → handler. Can inspect parsed body but leaks route existence to unauthenticated callers via 400 before 401. | |

**User's choice:** After all UseBefore (Recommended).

---

## Mw/Interceptor shape

### ExpressMiddlewareInterface shape

| Option | Description | Selected |
|--------|-------------|----------|
| RC-compatible (Recommended) | `use(req, res, next): void \| Promise<void>`. Native Express signature; async via v5 propagation. | ✓ |
| Use Action arg | `use(action, next)` — wraps req/res in Action. Cleaner conceptually but breaks RC parity and Express idioms. | |
| Both supported | Detect by arity. Two ways to do same thing; doc burden. | |

**User's choice:** RC-compatible (Recommended).

### Class-form mw/interceptor instantiation

| Option | Description | Selected |
|--------|-------------|----------|
| Same as controllers (Recommended) | `getContainer().get(MwClass)` with default WeakMap caching. Uniform DI policy across all class-based hooks. | ✓ |
| Always lazy-new | Skip container hook for mw/interceptors. Simpler but surprising for users with DI wired up. | |

**User's choice:** Same as controllers (Recommended).

### InterceptorInterface signature and placement

| Option | Description | Selected |
|--------|-------------|----------|
| RC-style, pre-serialization (Recommended) | `intercept(action, content): unknown \| Promise<unknown>`. Returned value REPLACES content. Multi-interceptors chain in declaration order. Runs after @OnNull/@OnUndefined status resolution but BEFORE response writer. | ✓ |
| Post-serialization hook | Receives serialized bytes. More powerful but breaks RC parity and complicates streaming. | |
| Either via type tag | Two interceptor kinds. Flexible but adds API surface. | |

**User's choice:** RC-style, pre-serialization (Recommended).

---

## Auth semantics

### @Authorized argument shape

| Option | Description | Selected |
|--------|-------------|----------|
| All three forms (Recommended) | `@Authorized()`, `@Authorized('admin')`, `@Authorized(['admin', 'editor'])`. Normalized to `string[] \| undefined`. Matches RC. | ✓ |
| Array only | Force `@Authorized(['admin'])` always. Simpler internal type but more verbose. Breaks RC parity. | |
| Variadic strings | `@Authorized('admin', 'editor')`. Cleaner but loses dynamic role-list support. | |

**User's choice:** All three forms (Recommended).

### 401 vs 403 rule

| Option | Description | Selected |
|--------|-------------|----------|
| RC semantics (Recommended) | 401 when no checker / no user; 403 when checker returns false. Throws UnauthorizedError / ForbiddenError. Matches RC and HTTP semantics. | ✓ |
| Always 403 | Don't distinguish. Simpler but loses auth-vs-authz signal. | |
| Checker controls code | Checker can throw HttpError directly. Two code paths increase confusion. | |

**User's choice:** RC semantics (Recommended).

### currentUser exposure

| Option | Description | Selected |
|--------|-------------|----------|
| InputDeclaration slot (Recommended) | Extend InputDeclaration with `currentUser?: true \| StandardSchemaV1`. Consistent with the input-declaration model from Phase 1/2. | ✓ |
| @CurrentUser() param decorator | Separate parameter decorator like RC. Familiar to migrators but reintroduces param decorators that Phase 1 explicitly avoided. | |
| Both | Slot AND param decorator. Maximum compatibility but two ways to do same thing. | |

**User's choice:** InputDeclaration slot (Recommended).

### currentUserChecker invocation timing

| Option | Description | Selected |
|--------|-------------|----------|
| Lazy — only when needed (Recommended) | Run only if route is @Authorized OR handler declares the currentUser slot. Public routes pay zero cost. | ✓ |
| Eager — always | Run on every request when registered. Predictable but wastes work on public routes. | |

**User's choice:** Lazy — only when needed (Recommended).

---

## User error handler

### How does the lib detect a user error mw?

| Option | Description | Selected |
|--------|-------------|----------|
| Arity (Recommended) | Check `MwInstance.use.length === 4`. Matches Express's own rule. Document the minification footgun. | ✓ |
| Explicit option | `@Middleware({type: 'after', error: true})` flag. Robust against minification but adds API surface. | |
| Separate decorator | `@ErrorMiddleware()` distinct from `@Middleware`. Explicit but diverges from RC. | |

**User's choice:** Arity (Recommended).

### Chain behavior when user error mw runs

| Option | Description | Selected |
|--------|-------------|----------|
| next(err) chains, response ends (Recommended) | Standard Express behavior — `next(err)` forwards; writing response stops chain naturally via `res.headersSent` guard. | ✓ |
| Lib always runs as fallback | Even after user writes response, lib still tries. Conflicts with Phase 2 D-14/D-18. | |
| User handler is terminal | Once user error mw registered, lib default not mounted. Users lose safety net. | |

**User's choice:** next(err) chains, response ends (Recommended).

### Multiple user error handlers?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, chain in registration order (Recommended) | Multiple 4-arg mw chain in BootOptions.middlewares order; lib default last. Standard Express composition. | ✓ |
| Single only | Throw at boot if more than one. Artificial limitation. | |

**User's choice:** Yes, chain in registration order (Recommended).

### err.source flow

| Option | Description | Selected |
|--------|-------------|----------|
| Already attached, no change (Recommended) | Phase 2 D-16 wrapper already attaches `err.source`. User mw reads it. No new work. | ✓ |
| Extend to mw/interceptors | Tag mw/interceptor errors with their source too. More info but more wrapping overhead. Defer to v1.x. | |

**User's choice:** Already attached, no change (Recommended).

---

## Claude's Discretion

User accepted recommended options for every decision; the following are intentionally delegated to research + planner:

- Exact decorator factory signatures and TypeScript generics for `@UseBefore`, `@UseAfter`, `@UseInterceptor`, `@Middleware`, `@Interceptor`, `@Authorized`.
- Internal file layout under `src/adapter/` (likely `middleware.ts`, `interceptor.ts`, `auth.ts`, plus an extension of `error-middleware.ts`).
- Where the `currentUser` slot integrates with `validation.ts` (parallel `Promise.all` arm vs sequential step).
- Form-detection heuristic for variadic decorator args (function vs class with prototype).
- Interceptor chain implementation (`for/await` loop vs reduce vs `next()`-style chain — defaulted to simplest).
- MetadataBuilder extension shape — amend Phase 1's `resolved.ts` or add a Phase-3-owned extension type.
- Whether to add `@Middleware({ priority })` (RC's numeric priority for global ordering) — defaulted to NO; registration order in `BootOptions.middlewares` is the only ordering.

## Deferred Ideas

- `@Middleware({ scope, controllers, priority })` global-targeting variants.
- Source attribution for mw/interceptor-thrown errors.
- Function-form / object-form `defaultErrorHandler` boot option.
- Interceptor short-circuit (`next()`-style chain).
- `@CurrentUser()` parameter decorator.
- `@Authorized` with predicate functions.
- All Phase 4 features (cookies, sessions, uploads, render, redirect, location, CORS, glob loading, `printRoutes`, AsyncLocalStorage).
- All Phase 5 features (build pipeline, dual ESM+CJS publish, TypeDI adapter, migration guide).
