# Phase 3: Middleware, Interceptors, Auth, Error Handling - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Layer orthogonal extensibility — middleware, interceptors, authorization, and user-defined error handlers — onto the Phase 2 pipeline (`useExpressControllers` / `createExpressServer` / one `express.Router()` per controller / native v5 async error propagation / single library error middleware) with deterministic, documented ordering. No new HTTP-runtime concerns invented here; everything slots into the pipeline shape Phase 2 designed for.

In scope (from ROADMAP.md Phase 3):
- `@UseBefore(...)` / `@UseAfter(...)` accepting **function-form** (Express `RequestHandler`) and **class-form** (`ExpressMiddlewareInterface`) middleware, attachable at controller and method level (MW-01).
- `@Middleware({ type: 'before' | 'after' })` class decorator marking a class as a global/scoped middleware implementing `ExpressMiddlewareInterface` (MW-02).
- `@Interceptor()` class decorator + `@UseInterceptor(...)` for handler-return-value transformation before serialization (MW-03).
- Deterministic ordering: globals outermost; controller-level before method-level for `before`; reversed for `after`; multi-arg decorators left-to-right always (MW-04).
- `@Authorized(roles?)` decorator + global `authorizationChecker` and `currentUserChecker` runtime; 401 / 403 distinction; `currentUser` exposed via the `InputDeclaration` slot (AUTH-01, AUTH-02, AUTH-03).
- User `@Middleware({ type: 'after' })` classes whose `use` method has 4-arg arity are mounted as Express **error middleware** ahead of the library default error middleware, with `err.source` (Phase 2 D-16) already populated (ERR-04).
- `BootOptions.middlewares: []` and `BootOptions.interceptors: []` runtime — Phase 2 typed and silently no-op'd these (Phase 2 D-03); Phase 3 wires them up.
- `Action` (Phase 1 `{ request, response, next? }`) is the canonical hook arg passed to `authorizationChecker`, `currentUserChecker`, and `InterceptorInterface.intercept`.

Out of scope (deferred):
- Cookies, sessions, uploads, render, redirect, location, CORS lazy-load, glob-loading, `printRoutes`, AsyncLocalStorage `getRequestContext()` — Phase 4 (parallelizable with Phase 3).
- Build pipeline, dual ESM+CJS, publish, TypeDI adapter, migration guide — Phase 5.
- Auto-injection by constructor `design:paramtypes` — remains deferred from Phase 1 (DI works via `useContainer()` only; constructor-type-based auto-wire is opt-in via the user's container, not the library).
- `@Middleware({ scope: 'global' | 'controller' })` / `@Middleware({ controllers: [Ctrl] })` targeting — not in this phase; class is scoped solely by where it is registered (in `BootOptions.middlewares` for global, in `@UseBefore/@UseAfter(MwClass)` for scoped). Revisit if v1.x demand appears.
- Function-form / object-form `defaultErrorHandler` — explicitly deferred in Phase 2 D-17. Phase 3's user error `@Middleware({ type: 'after' })` is the supported user-error hook.

</domain>

<decisions>
## Implementation Decisions

### Pipeline ordering (per-request, in execution order)

- **D-01:** **Canonical pipeline order** for a request that matches a route:
  ```
  app.use(...)                            (user-mounted, outside the library)
  ↓ lib globals BEFORE                    (BootOptions.middlewares filtered to @Middleware({type:'before'}))
  ↓ @UseBefore(controller-level)          (decorator args left-to-right)
  ↓ @UseBefore(method-level)              (decorator args left-to-right)
  ↓ @Authorized check                     (if route is decorated)
  ↓ input validation                      (Phase 2 D-06..D-10)
  ↓ handler                               (controller method)
  ↓ interceptor chain                     (controller-level then method-level, declaration order)
  ↓ response writer                       (Phase 2 D-11..D-13: JSON / stream / iterable / null+undefined)
  ↓ @UseAfter(method-level)               (left-to-right)
  ↓ @UseAfter(controller-level)           (left-to-right)
  ↓ lib globals AFTER                     (BootOptions.middlewares filtered to @Middleware({type:'after'}), non-error)
  ↓ user error @Middleware({type:'after'}) (4-arg `use`; chain in registration order)
  ↓ lib default error middleware          (Phase 2 D-15..D-18; the catch-all)
  ```
  Globals outermost matches routing-controllers and is the only ordering that lets cross-cutting concerns (logging, request-id) wrap the entire controller stack including 404s for routes the library registered.

- **D-02:** **MW-04 ordering rules made explicit:**
  - Between LEVELS: controller-level `@UseBefore` runs **before** method-level `@UseBefore`; controller-level `@UseAfter` runs **after** method-level `@UseAfter` (the level-reversal mandated by MW-04).
  - WITHIN a single decorator's args: `@UseBefore(a, b, c)` runs `a → b → c`; `@UseAfter(a, b, c)` ALSO runs `a → b → c`. The reversal applies between LEVELS only, not within a decorator's argument list. Matches RC; reads naturally; no mental "reverse the args for after" tax.
  - Multiple stacked decorators on the same target: each decorator's args expand left-to-right per the rule above; stacking order then follows source order top-to-bottom for `before`, bottom-to-top for `after` only at the level boundary already covered.
  - A test fixture that proves the ordering (per MW-04's "documented with a test fixture proving the rule") is part of Phase 3 deliverables.

- **D-03:** **`@Authorized` check fires AFTER all `@UseBefore` middleware and BEFORE input validation.** Rationale: middleware can prepare request context (decode JWT, attach `req.user`) before the auth check inspects it, but auth still gates BEFORE we expose validation errors that would leak route existence to unauthenticated callers. Matches RC. (Note: `currentUserChecker` may run earlier or be skipped — see D-13.)

### Middleware shape & DI

- **D-04:** **`ExpressMiddlewareInterface` is RC-compatible:**
  ```ts
  interface ExpressMiddlewareInterface {
    use(req: Request, res: Response, next: NextFunction): void | Promise<void>;
  }
  ```
  Native Express signature — async support comes free from v5's native rejection propagation (no try/catch wrappers in the library's mw adapter beyond the existing Phase 2 D-16 source-attribution wrapper, and that wraps HANDLERS only, not middleware). Function-form `@UseBefore(fn)` / `@UseAfter(fn)` accepts standard Express `RequestHandler` directly with no transformation.

- **D-05:** **Class-form middleware and interceptor instances are obtained via `getContainer().get(MwClass)`** — the same Phase 1 IoC hook controllers use, with the same default lazy-`new` WeakMap-cached fallback. One uniform DI policy across all class-based hook types. Users with tsyringe/Awilix/typedi wired via `useContainer()` get consistent constructor-injection for mw, interceptors, and controllers; users with no container wired pay zero config and get cached lazy-`new`.

- **D-06:** **Variadic decorator args:** `@UseBefore(mwA, MwClassB, fnC)` accepts a mix of function-form and class-form in one call. The mw adapter detects each arg's form at registration time:
  - `typeof arg === 'function' && arg.prototype === undefined` (or arrow function) → function-form, mount directly.
  - `typeof arg === 'function' && arg.prototype` → class-form, instantiate via container, bind `instance.use` (must exist; throw at boot if it doesn't, naming the class).
  - Anything else → throw at boot with a clear "must be a function or a class implementing ExpressMiddlewareInterface" message.

### Interceptors

- **D-07:** **`InterceptorInterface` shape (RC-compatible):**
  ```ts
  interface InterceptorInterface {
    intercept(action: Action, content: unknown): unknown | Promise<unknown>;
  }
  ```
  - `action` is Phase 1's `{ request, response, next? }`.
  - `content` is the value returned by the previous step in the chain (the handler's raw return value for the first interceptor; the previous interceptor's return for the rest).
  - The returned value REPLACES `content` for the next interceptor or, for the last interceptor, becomes the value passed to the response writer.
  - Async support is native; the chain `await`s each interceptor in turn.

- **D-08:** **Interceptor placement in the response path: AFTER the handler returns and AFTER `@OnNull`/`@OnUndefined` status resolution have decided whether to short-circuit to a no-body response, but BEFORE the response writer (Phase 2 D-11..D-13) serializes JSON / pipes stream / iterates async-iterable.** Concretely:
  1. Handler returns a value.
  2. If value is `null`/`undefined` and a `@OnNull(status)`/`@OnUndefined(status)` shaper is set → short-circuit to `res.status(status).end()`; interceptors do NOT run (matches Phase 2 D-13 semantics — there's no value to transform).
  3. Otherwise → run the interceptor chain over the value.
  4. Pass the (possibly transformed) value to the Phase 2 response writer.
  Rationale: interceptors transform domain values (envelope wrapping, field redaction, snake_case-ification), not transport bytes. Wrapping streams would require buffering and break the streaming contract.

- **D-09:** **Interceptor chain order:** controller-level `@UseInterceptor(I1, I2)` runs before method-level `@UseInterceptor(I3, I4)`; within a single decorator, args are left-to-right (`I1 → I2 → I3 → I4`). Mirrors the `@UseBefore` order rule (D-02) for consistency. Also: a global `@Interceptor()` class registered via `BootOptions.interceptors: []` runs OUTSIDE controller-level (i.e., FIRST in the chain) — symmetric with global mw being outermost (D-01).

- **D-10:** **Interceptors do NOT run on error paths.** If the handler throws or returns a rejected promise, the value goes straight to the error middleware chain — no interceptor sees an error value. Errors thrown INSIDE an interceptor flow through the error middleware normally (with no `err.source` since interceptors don't go through the Phase 2 D-16 handler-wrapper; downstream agents may add a source extension in v1.x if requested — see <deferred>).

### Auth runtime

- **D-11:** **`@Authorized()` accepts three argument shapes** — normalized to `string[] | undefined` internally:
  - `@Authorized()` → roles is `undefined` (route requires authentication; no specific role).
  - `@Authorized('admin')` → roles is `['admin']`.
  - `@Authorized(['admin', 'editor'])` → roles is `['admin', 'editor']` (ANY role matches; semantics determined by the user's `authorizationChecker`).
  Matches RC; minimal migration friction.

- **D-12:** **401 vs 403 rule:**
  - 401 Unauthorized → throw `UnauthorizedError` (Phase 1 subclass) when (a) `authorizationChecker` is not registered at all, OR (b) `currentUserChecker` is registered AND it returns `null`/`undefined`/anything falsy other than `false`.
  - 403 Forbidden → throw `ForbiddenError` when `authorizationChecker(action, roles)` returns `false` (or a Promise that resolves false).
  - User-thrown `HttpError` from inside `authorizationChecker` / `currentUserChecker` flows through unchanged (the library does NOT wrap or relabel it). This is the escape hatch for users who want a different code or shape.
  Both errors flow through the standard error middleware chain (D-01 step 14+) and are formatted by Phase 2 D-18.

- **D-13:** **`currentUserChecker` invocation is LAZY:** invoked only if (a) the route is `@Authorized` (so the checker may be needed for a 401), OR (b) the handler's `InputDeclaration` includes the `currentUser` slot. Public routes that declare neither pay zero cost. When invoked, the result is cached on the request for the duration of the request so a second access (e.g., interceptor reading `currentUser`) doesn't re-invoke.

- **D-14:** **`currentUser` exposure via `InputDeclaration` slot** — Phase 1's `InputDeclaration` interface is extended with an optional `currentUser?: true | StandardSchemaV1` slot (additive, no breaking change to Phase 2's input runner). Handler destructures `({ currentUser }) => ...`. If a Standard Schema is provided, the `currentUserChecker`'s return value is validated through it (gives type narrowing and runtime safety); if `true`, the value is passed through with the type inferred from the checker's return type. Consistent with the input-declaration model Phase 1 established (params/query/body/headers); no parameter decorators reintroduced. The lazy invocation rule (D-13) applies.

### User error middleware (ERR-04)

- **D-15:** **Error-handler detection by ARITY.** A `@Middleware({ type: 'after' })` class is mounted as Express ERROR middleware iff `MwInstance.use.length === 4` (i.e., the method's signature is `(err, req, res, next)`). Otherwise it's mounted as a regular after-middleware (`(req, res, next)`). Matches Express's own detection rule. Documentation MUST warn about minification / wrapping that drops arity (e.g., `use = (err, req, res, next) => { ... }` arrow fields preserve arity; `use(...args)` rest-args do NOT — explicitly call this out).

- **D-16:** **Error chain semantics** (standard Express, just documented):
  - User error mw calls `next(err)` (same or different err) → forwards to the NEXT error mw in registration order, ultimately reaching the lib default error middleware (D-01 last step).
  - User error mw writes a response (`res.json(...)` / `res.end()` / `res.status(x).send(...)`) and does NOT call `next` → chain stops; lib default error middleware sees `res.headersSent === true` and skips per Phase 2 D-14.
  - User error mw calls `next()` with no arg → Express treats the error as handled and looks for the next NON-error middleware; since none follow at this point, the response just sits open. Document this as a footgun.

- **D-17:** **Multiple user error handlers are supported** and chain in `BootOptions.middlewares: []` registration order. Composes naturally with D-15 / D-16 — e.g., a logger error mw that always `next(err)`s, followed by a formatter error mw that writes the response, followed by the lib default as last-line. Symmetric with how user can register multiple before/after middlewares.

- **D-18:** **`err.source` already attached by the Phase 2 D-16 handler-wrapper.** No new work in Phase 3 — user error mw can read `err.source` to know which controller/method threw. Errors that originate in middleware/interceptors themselves do NOT have a source field (the Phase 2 wrapper only wraps handlers); user mw should treat `err.source` as optional. Extending source attribution to mw/interceptor-thrown errors is deferred (see <deferred>).

### Claude's Discretion

The user accepted recommended options for every decision; these are intentionally left to research + planner:

- **Exact decorator factory signatures and TypeScript generics** for `@UseBefore`, `@UseAfter`, `@UseInterceptor`, `@Middleware`, `@Interceptor`, `@Authorized` — must compose with Phase 1's class+method decorator surface. Constraint: legacy `experimentalDecorators` semantics (Phase 1 D-04..D-07).
- **Internal file layout** under `src/adapter/` — likely a new `middleware.ts` (registration/composition), `interceptor.ts` (chain runner), `auth.ts` (Authorized check + checker invocation, `currentUser` slot extension hooked into `validation.ts`), and an extension of `error-middleware.ts` to mount user error mw before the lib default. Open to the planner to optimize.
- **Where the `currentUser` slot integrates with `validation.ts`** — likely a parallel resolution alongside the four existing slots (Phase 2 D-06's `Promise.all`), gated on D-13's lazy rule. Planner decides whether it's a 5th `Promise.all` arm or a separate sequential step.
- **Form-detection heuristic for variadic decorator args** (D-06) — exact runtime probe (`prototype === undefined`, `Object.getPrototypeOf`, `instanceof Function`, etc.). Planner picks the most robust form against TS-emitted classes.
- **Interceptor chain implementation** — straight `for/await` loop over a sorted interceptor list vs reduce vs middleware-style `next()`-passing. The first is simplest and matches RC; the third would let an interceptor short-circuit, which we have NOT specified as a requirement. Default to the simplest unless research surfaces a need.
- **MetadataBuilder extension shape for Phase 3** — Phase 1's `ControllerMetadata` / `ActionMetadata` need to gain `useBefore: HookEntry[]`, `useAfter: HookEntry[]`, `interceptors: ClassConstructor[]`, `authorized?: string[] | undefined`. Planner decides whether to amend Phase 1's resolved-types file or add a Phase-3-owned extension type that the adapter consumes.
- **`@Middleware({ type, priority? })`** — RC has a numeric `priority` for ordering globals. We did not discuss it; default to NO priority field (registration order in `BootOptions.middlewares` is the order). Planner can surface a counter-proposal if research finds it load-bearing for migration.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project direction (truth — read first)
- `CLAUDE.md` §"Project" + §"Technology Stack" + §"Direction Override (2026-05-08)" — authoritative direction; legacy `experimentalDecorators` + `reflect-metadata`, single-package repo, Express v5 peer dep, Standard Schema first-class.
- `.planning/PROJECT.md` — project mission, constraints, audience (modest-adoption OSS).
- `.planning/ROADMAP.md` §"Phase 3: Middleware, Interceptors, Auth, Error Handling" — goal, depends-on (Phase 2), parallelizable with Phase 4, 8 mapped REQ-IDs, **5 success criteria** (the goal-backward verification target).

### Requirements (Phase 3 owns these REQ-IDs)
- `.planning/REQUIREMENTS.md` — `MW-01`, `MW-02`, `MW-03`, `MW-04`, `AUTH-01`, `AUTH-02`, `AUTH-03`, `ERR-04`. (Lines 55, 60–63, 67–69 in the requirements file.)

### Phase 1 outputs (cross-phase contract — Phase 3 consumes these)
- `.planning/phases/01-metadata-decorator-skeleton/01-CONTEXT.md` — full Phase 1 decision log; D-04..D-07 (WeakMap storage, decorator-as-pure-registrar, MetadataBuilder inheritance walk) constrain how Phase 3 decorators are authored.
- `src/types/resolved.ts` — `ControllerMetadata`, `ActionMetadata`, `ResponseHandlerMetadata` shapes Phase 3 EXTENDS with `useBefore`/`useAfter`/`interceptors`/`authorized` fields.
- `src/types/action.ts` — `Action = { request, response, next? }` and `ClassConstructor`. `Action` is the canonical hook arg passed to `authorizationChecker`, `currentUserChecker`, and `InterceptorInterface.intercept`.
- `src/metadata/types.ts` — `InputDeclaration` (extended with `currentUser?: true | StandardSchemaV1` per D-14), `MethodArgs`, `ControllerArgs`.
- `src/metadata/builder.ts` — `MetadataBuilder.build([Class])`; Phase 3 metadata read happens through this same entry point.
- `src/metadata/storage.ts` — WeakMap storage helpers for new Phase 3 decorator metadata (mw/interceptor/authorized lists per controller/method).
- `src/errors/http-error.ts` + `src/errors/named.ts` — `UnauthorizedError`, `ForbiddenError` are thrown by D-12; `HttpError.toJSON()` is what user error mw and the lib default ultimately serialize.
- `src/container/use-container.ts` + `src/container/default-container.ts` + `src/container/ioc-adapter.ts` — `getContainer()` is invoked for every class-form mw / interceptor / global per D-05.
- `src/types/standard-schema.ts` — re-exported `StandardSchemaV1` type spec; used to type the optional `currentUser?: StandardSchemaV1` slot.
- `src/index.ts` — public barrel; Phase 3 will add `@UseBefore`, `@UseAfter`, `@Middleware`, `@Interceptor`, `@UseInterceptor`, `@Authorized`, `ExpressMiddlewareInterface`, `InterceptorInterface`.

### Phase 2 outputs (the pipeline Phase 3 inserts into)
- `.planning/phases/02-runtime-express-adapter-happy-path/02-CONTEXT.md` — full Phase 2 decision log. **Especially:** D-03 (BootOptions key forward-compat), D-06..D-10 (validation pipeline that the `currentUser` slot extends), D-11..D-13 (response writer that interceptors feed into), D-14 (`res.headersSent` guard for the user-handles-response case), D-15 (lib error middleware mounted last; Phase 3 inserts user error mw immediately ahead), D-16 (per-handler wrapper attaches `err.source` — Phase 3 reads but does not re-implement), D-17 (`defaultErrorHandler: false` skip toggle still applies — when false, NEITHER lib default NOR user error mw chain are mounted, since user is owning everything), D-18 (lib default error JSON shape).
- `src/adapter/boot.ts` — `useExpressControllers` / `createExpressServer`; Phase 3 extends to wire global `BootOptions.middlewares` and `BootOptions.interceptors`.
- `src/adapter/boot-options.ts` — `BootOptions` interface (already typed for `middlewares`, `interceptors`, `authorizationChecker`, `currentUserChecker` per Phase 2 D-03; `AuthorizationChecker` and `CurrentUserChecker` signatures fixed at lines 6 and 11).
- `src/adapter/handler-wrapper.ts` — `wrapAction` already does the `err.source` attribution (D-18 above is unchanged; do NOT rewrap).
- `src/adapter/error-middleware.ts` — extended in Phase 3 to mount user-error-arity middleware ahead of itself per D-15..D-17.
- `src/adapter/router-build.ts` — extended to call into Phase 3's mw/interceptor/auth registration helpers when building each controller's router per D-01.
- `src/adapter/validation.ts` — extended for the `currentUser` slot per D-13/D-14.
- `src/adapter/response.ts` — interceptor chain inserts immediately ahead of this per D-08; response.ts itself unchanged.

### Research (read for context — Phase-3-relevant sections)
- `.planning/research/ARCHITECTURE.md` — three-layer model (decorator → metadata → driver). Phase 3 adds new decorators in layer 1, new resolved-metadata fields in layer 2, new pipeline composition in layer 3 (the adapter).
- `.planning/research/PITFALLS.md` — relevant for Express error-middleware arity rules (D-15) and `res.headersSent` semantics (D-16).
- `.planning/research/FEATURES.md` — feature catalogue traced to MW/AUTH/ERR-04 requirements.
- `.planning/research/SUMMARY.md` §"Research Flags" — Phase 3 is **NOT pre-flagged** for `/gsd-research-phase` ("well-documented standard patterns"). The patterns are RC-derived and Express-native; standard discuss-phase context should suffice. Planner can still opt into research if a specific decision (e.g., interceptor chain implementation, auth checker async semantics) would benefit.

### State
- `.planning/STATE.md` — current position (Phase 1 COMPLETE; Phase 2 in progress; Phase 3 will run parallel with Phase 4 once Phase 2 lands).

### External (Express + ecosystem references)
- Express v5 release notes (https://expressjs.com/2024/10/15/v5-release.html) — async error propagation semantics that D-04 and D-15..D-17 rely on (no try/catch wrappers in mw adapter; native rejection forwarding).
- Express error middleware docs (https://expressjs.com/en/guide/error-handling.html) — the 4-arg arity rule that D-15 piggybacks on. **Recommended for the planner to read** before locking the arity-detection logic.
- routing-controllers source (https://github.com/typestack/routing-controllers) — reference implementation for `@UseBefore` / `@UseAfter` / `@Middleware` / `@Interceptor` / `@UseInterceptor` / `@Authorized` semantics that D-01..D-14 mirror. Specifically `src/driver/express/ExpressDriver.ts` for ordering and `src/Authorization*` for the checker contract.
- `path-to-regexp` v8 README — unchanged from Phase 2; mw added to a controller-prefixed route inherits the same composed-path semantics.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phase 1 + Phase 2)
- **`getContainer()` / `IocAdapter`** (`src/container/`) — D-05 reuses the Phase 1 hook for class-form mw/interceptor instantiation; default WeakMap caching means zero-config users still get singletons-per-class.
- **`HttpError` + `UnauthorizedError` + `ForbiddenError`** (`src/errors/`) — D-12 throws these; serialization handled by Phase 2 D-18 already.
- **`Action`** (`src/types/action.ts`) — passed unchanged to `authorizationChecker`, `currentUserChecker`, and `InterceptorInterface.intercept`. No new shape needed.
- **`StandardSchemaV1`** (`src/types/standard-schema.ts`) — type-only; used in D-14 to optionally validate the `currentUserChecker` return value through a schema.
- **`buildMetadata([Class])`** (`src/metadata/builder.ts`) — Phase 3 reads through the same entry point; the builder will be extended to merge new mw/interceptor/auth decorator output into each ControllerMetadata/ActionMetadata.
- **WeakMap storage primitives** (`src/metadata/storage.ts`) — Phase 3 decorators write into the same module-private WeakMaps; no `Reflect.defineMetadata` (Phase 1 D-04).
- **`wrapAction`** (`src/adapter/handler-wrapper.ts`, lines 16–36) — already attaches `err.source` per Phase 2 D-16. Phase 3 does NOT rewrap; user error mw reads `err.source` directly.
- **`BootOptions.middlewares` / `interceptors` / `authorizationChecker` / `currentUserChecker`** (`src/adapter/boot-options.ts`, lines 33–49) — already typed; Phase 3 wires runtime behind them. Their signatures (`AuthorizationChecker`, `CurrentUserChecker` at lines 6 and 11) are LOCKED — do not change them; Phase 2 boot already accepts call-site shapes that depend on these.
- **Phase 2 error middleware** (`src/adapter/error-middleware.ts`) — Phase 3 extends the mounting logic in `boot.ts` to insert user-error-arity middleware ahead of this; the file's internals stay intact.

### Established Patterns (must be honored)
- **Decorator-as-pure-registrar** (Phase 1 D-07) — every Phase 3 decorator (`@UseBefore`, `@UseAfter`, `@Middleware`, `@Interceptor`, `@UseInterceptor`, `@Authorized`) MUST be a pure registrar that mutates the appropriate WeakMap and returns. No prototype walking inside decorators.
- **Zero global state in core** (Phase 2 implicit) — Phase 3 must not register any global Express middleware, listeners, or error handlers outside the `app` it was given. Multi-app scenarios stay supported.
- **Subclass wins on inheritance** (Phase 1 D-06) — when a subclass redeclares `@UseBefore`/`@UseAfter`/`@UseInterceptor`/`@Authorized` on the same method, the subclass declaration replaces the base class's; controller-level metadata follows the same rule. The MetadataBuilder walk handles this without Phase 3 needing custom merge logic.
- **Module-private internals** (Phase 1 D-07 + Phase 2) — only the decorators and the two interface types (`ExpressMiddlewareInterface`, `InterceptorInterface`) are added to the public barrel. Adapter helpers (mw composer, interceptor chain runner, auth gate, form detector) live under `src/adapter/` and stay non-public.
- **Validation runs before handler, after auth** (D-03) — preserves Phase 2 D-06..D-10 ordering inside the auth-gated step.

### Integration Points
- **Phase 3 → Phase 4** — `getRequestContext()` (Phase 4) will need ALS to be initialized BEFORE any mw runs so middleware can also read context. Phase 3 must not create per-request state on `req` that conflicts with Phase 4's planned ALS keys (e.g., a `req.requestId` field that Phase 4 also wants to own). Coordinate at the planner level — Phase 3 should namespace any per-req state under a Symbol key, not arbitrary string properties.
- **Phase 3 → Phase 5** — public surface added in Phase 3 (`@UseBefore`, `@UseAfter`, `@Middleware`, `@Interceptor`, `@UseInterceptor`, `@Authorized`, `ExpressMiddlewareInterface`, `InterceptorInterface`) is part of the v1 API contract; renames or signature changes here are breaking once v1.0.0 ships from Phase 5.
- **Phase 3 ⇄ Phase 4** (parallel) — share no source files of consequence per ROADMAP. Both extend `InputDeclaration` (Phase 3 adds `currentUser`; Phase 4 adds `cookies`/`session`/uploads). Order doesn't matter as long as the extensions are additive. Coordinate in `metadata/types.ts` so the Phase 4 PR doesn't conflict with the Phase 3 PR; planner of whichever ships second handles the trivial merge.

</code_context>

<specifics>
## Specific Ideas

- **Globals outermost** (D-01) — `BootOptions.middlewares` runs OUTSIDE `@UseBefore(controller)`; `@Middleware({type:'after'})` non-error globals run AFTER `@UseAfter(controller)`. Cross-cutting concerns (logging, request-id) wrap the whole controller stack including 404s the lib's own routers don't match.
- **Args left-to-right always** (D-02) — `@UseBefore(a, b, c)` and `@UseAfter(a, b, c)` BOTH expand `a → b → c`. The level reversal applies between controller-level and method-level decorators only, not within a single decorator's args. Test fixture proves this.
- **Auth check after `@UseBefore`** (D-03) — middleware can prepare context (decode JWT into `req.user`) before the auth check inspects it; auth still gates BEFORE input validation so 401 is returned BEFORE 400.
- **`ExpressMiddlewareInterface` matches Express signature exactly** (D-04) — `use(req, res, next)` with optional `Promise<void>`. No `Action` wrapping for mw — keeps Express idioms intact for the most common hook type.
- **Class-form mw/interceptor/global all DI'd via `getContainer()`** (D-05) — uniform DI policy; users with tsyringe/Awilix get constructor-injection automatically.
- **Variadic mixed-form `@UseBefore(mw1, MwClass2, fn3)`** (D-06) — form detection at boot time (function-vs-class-with-prototype heuristic).
- **Interceptors transform values, not bytes** (D-08) — runs after `@OnNull`/`@OnUndefined` short-circuit, before the response writer; null-result paths skip interceptors entirely.
- **Interceptors don't run on errors** (D-10) — error path goes straight to error middleware chain; interceptor-thrown errors propagate normally but without `err.source`.
- **`@Authorized()` accepts `()`, `('admin')`, and `(['a','b'])`** (D-11) — normalized to `string[] | undefined`.
- **401 = no checker / no user; 403 = checker false** (D-12) — RC semantics; user-thrown HttpError from inside a checker passes through unchanged (escape hatch).
- **`currentUserChecker` is lazy + cached per request** (D-13) — invoked only when the route is `@Authorized` or the handler declares the `currentUser` slot; cached so a second access doesn't re-invoke.
- **`currentUser` is an InputDeclaration slot, not a parameter decorator** (D-14) — `currentUser?: true | StandardSchemaV1`. Consistent with the input-declaration model; no parameter-decorator reintroduction.
- **Error middleware detected by 4-arg arity** (D-15) — `MwInstance.use.length === 4` ⇒ Express error middleware. Document the minification footgun loudly (use named arrow field `use = (err, req, res, next) => {}`, NOT `use(...args)`).
- **Multiple user error handlers chain in registration order** (D-17) — composes naturally with `next(err)` → next user error mw → eventually lib default.
- **`err.source` already attached by Phase 2 D-16** (D-18) — no Phase 3 work; user error mw just reads it.

</specifics>

<deferred>
## Deferred Ideas

- **`@Middleware({ scope, controllers, priority })`** — RC supports scoping a global to specific controllers and ordering globals by numeric priority. Not in v1 Phase 3; default to registration order in `BootOptions.middlewares`. Revisit in v1.x if migration feedback demands it.
- **Source attribution for mw/interceptor-thrown errors** — Phase 3 errors thrown inside middleware or interceptors do NOT carry `err.source`. Extending the wrapping pattern (e.g., `'AuthMiddleware'`, `'CacheInterceptor.before-Ctrl.method'`) is deferred to v1.x; user error mw handles them as untagged.
- **Function-form / object-form `defaultErrorHandler` boot option** — explicitly deferred from Phase 2 D-17. The user `@Middleware({type:'after'})` error class is the supported user-error hook in v1; the boolean toggle stays as the only `defaultErrorHandler` shape.
- **Interceptor short-circuit (`next()`-style chain)** — current spec is straight `for/await` value transform (D-07/D-09). If a real use case appears for an interceptor to skip remaining interceptors (e.g., a cache hit), revisit the chain implementation in v1.x. Not now.
- **`@CurrentUser()` parameter decorator** — alternate exposure path for the current user. Rejected in D-14 in favor of the InputDeclaration slot to preserve the Phase 1 model. Keep as a v1.x consideration if migration feedback shows users want both.
- **`@Authorized` with predicate functions instead of role strings** — `@Authorized((action) => boolean)` for inline policies. Useful but expands the decorator's semantics; defer to v1.x. The escape hatch in D-12 (throwing an HttpError from inside `authorizationChecker`) covers most needs.
- **Phase 4 features** (cookies, sessions, uploads, render, redirect, location, CORS, glob loading, `printRoutes`, AsyncLocalStorage `getRequestContext`) — runs in parallel; not Phase 3's concern.
- **Phase 5 features** (build pipeline, dual ESM+CJS publish, TypeDI adapter, migration guide) — final phase; not Phase 3's concern.

</deferred>

---

*Phase: 3-Middleware, Interceptors, Auth, Error Handling*
*Context gathered: 2026-05-10*
