# Phase 2: Runtime + Express Adapter (Happy Path) - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

The smallest end-to-end vertical slice that proves the layered design from Phase 1 works as a real HTTP runtime: `useExpressControllers(app, options)` and `createExpressServer(options)` build one `express.Router()` per controller, mount them on a real Express v5 app, validate input via Standard Schema, serialize handler returns (JSON/stream/iterable), and propagate async errors natively to a single library-installed error middleware.

In scope (from ROADMAP.md Phase 2):
- `useExpressControllers(app, options)` and `createExpressServer(options)` — entry-point APIs (API-01, API-02)
- One `express.Router()` per controller, controller inheritance honored (subclass-wins per Phase 1 D-06), `routePrefix` composition (ROUTE-05)
- Method-level input declaration runtime: parse and validate `{ params, query, body, headers }` via Standard Schema's `~standard.validate`; produce a typed destructured object for the handler (INPUT-01, INPUT-02, INPUT-03)
- Path-to-regexp v8 registration check — flag v4 patterns at mount time with a controller+method+fix message (ROUTE-04)
- Native v5 async error propagation — no try/catch wrappers; one library-installed error middleware (ERR-03, ERR-05)
- Response writing for JSON, primitives, streams, and async iterables (RES-08, plus the runtime side of `@HttpCode`/`@OnNull`/`@OnUndefined`/`@Header`/`@ContentType`)
- `BootOptions` surface that types every API-03 key now (controllers, middlewares, interceptors, routePrefix, cors, defaultErrorHandler, validation, authorizationChecker, currentUserChecker, printRoutes); Phase 2 implements only the keys it owns and silently no-ops the rest

Out of scope (deferred to later phases):
- `@UseBefore`/`@UseAfter`/`@Middleware`/`@Interceptor` runtime (Phase 3)
- `@Authorized` + `authorizationChecker`/`currentUserChecker` runtime (Phase 3)
- User-provided `@Middleware({ type: 'after' })` error handlers running ahead of the lib default (Phase 3 — but the lib's error middleware MUST be designed today so the Phase 3 hook can slot in without restructuring)
- Cookies, sessions, uploads, render, redirect, location, CORS lazy-loading, glob loading, `printRoutes` log table, AsyncLocalStorage `getRequestContext` (Phase 4)
- Build pipeline, dual ESM+CJS, publish, TypeDI adapter, migration guide (Phase 5)

</domain>

<decisions>
## Implementation Decisions

### Bootstrap API & registration

- **D-01:** `useExpressControllers(app: Express, options: BootOptions): Express` and `createExpressServer(options: BootOptions): Express` are both exported. They share one implementation: `createExpressServer` does `const app = express(); … return useExpressControllers(app, options);`. Both return the `app` for chaining.
- **D-02:** **Body-parser policy is asymmetric.** `createExpressServer` auto-mounts `express.json()` and `express.urlencoded({ extended: true })` *before* mounting controllers — opinionated entry point. `useExpressControllers` **never** touches the middleware stack — it assumes the caller already configured body parsing. README's 30-line example uses `createExpressServer`; the "I already have an app" example explicitly shows `app.use(express.json())` before `useExpressControllers(...)`.
- **D-03:** **`BootOptions` types every API-03 key today; Phase 2 silently no-ops keys it doesn't own.** Unknown-but-typed keys (`middlewares`, `interceptors`, `cors`, `authorizationChecker`, `currentUserChecker`, `printRoutes`) are accepted at boot without warnings or errors. Rationale: forward-compatible call sites — users wiring up the lib in Phase 2 keep the same boot call as Phase 3/4 ship features.
- **D-04:** **Path composition rule for the final route string:** concatenate `routePrefix` + `@Controller(basePath)` + `@<Verb>(path)`; strip trailing `/` from each part, collapse consecutive `//`, allow empty `basePath` and empty `routePrefix` (controller mounts at the prefix root). The composed string is what gets handed to `path-to-regexp` and what the v4-pattern check inspects. Matches routing-controllers semantics; reduces user friction.
- **D-05:** **v4-pattern detection lives in the Phase 2 adapter at router-mount time** — preserves Phase 1's "zero Express imports / zero HTTP knowledge" boundary (Phase 1 D-04..D-07). The check runs over the *composed* path string from D-04 against four explicit footguns:
  1. Bare `*` (suggest `*splat` or `{*splat}`)
  2. `:name?` optional-param suffix (suggest `{/:name}` optional-segment form)
  3. `:name(regex)` inline regex (suggest moving to schema validation in the input declaration)
  4. Unnamed `(regex)` groups (no v8 equivalent — suggest a named param)
  Error message: `[ControllerClass.methodName] Path "<composed>" uses v4 pattern "<offending>"; in path-to-regexp v8 use "<suggestion>" instead.` Throws synchronously at boot; lets path-to-regexp v8 catch any residual edge cases with its own (now-unwrapped) errors.

### Validation execution & error shape

- **D-06:** **All four slots (`params`, `query`, `body`, `headers`) are validated via `Promise.all`.** Sync Standard Schema validators resolve immediately; async ones overlap. Single `await`. Standard Schema validators are pure by spec, so concurrent execution is safe.
- **D-07:** **Aggregate every issue into one `BadRequestError`.** Do NOT short-circuit on first failure. Collect issues from every failing slot into a single `details: ValidationIssue[]` (the field name reuses Phase 1's `BadRequestError` constructor signature) so the client sees every field problem at once. Matches routing-controllers UX.
- **D-08:** **Canonical error JSON shape (validation errors):**
  ```json
  {
    "status": 400,
    "name": "BadRequestError",
    "message": "Validation failed",
    "source": "UsersController.update",
    "errors": [
      { "slot": "body", "path": "user.email", "message": "Invalid email" },
      { "slot": "params", "path": "id", "message": "Expected number, received string" }
    ]
  }
  ```
  - `slot` ∈ `'params' | 'query' | 'body' | 'headers'`
  - `path` rendered via D-09 below
  - `message` is the Standard Schema issue's `message`
  - `source` format: `"ControllerClass.methodName"`
  - Top-level `message` is a generic `"Validation failed"` summary (not concatenated issue messages)
- **D-09:** **Path notation:** dotted with bracketed indices — strings joined by `.`, numbers wrapped in `[N]`. Example: `items[0].name`, `user.addresses[2].zip`. Matches Zod/Joi conventions; reads naturally in logs.
- **D-10:** **Validated value replaces raw input.** The handler's destructured argument receives Standard Schema's `value` output (which may be transformed/coerced by the schema), not the raw `req.params`/`req.query`/`req.body`/`req.headers`. Unvalidated slots (no schema) pass the raw Express value through. Phase 1's `InputDeclaration.params|query|body|headers` typed `unknown` accommodates both states.

### Response writing: JSON, streams, async iterables

- **D-11:** **`@JsonController` vs `@Controller` differ at runtime:**
  - `@JsonController`: every plain return goes through `res.json(value)` with `Content-Type: application/json` (objects, arrays, primitives, `null`).
  - `@Controller`: content-negotiate by return type — object/array → `res.json()`; string → `res.send()` (Express default `text/html`); `Buffer` → `res.send()` raw; stream / async-iterable → piped per D-12.
- **D-12:** **Stream / iterable detection — order matters:**
  1. If `value && typeof value.pipe === 'function'` → call `value.pipe(res)` directly (Node `Readable`, also catches Web `ReadableStream` adapters that expose `.pipe`).
  2. Else if `value && typeof value[Symbol.asyncIterator] === 'function'` → `Readable.from(value).pipe(res)` (generators, async iterables).
  Backpressure is handled by `pipe()`. **`.pipe` is checked first** because some streams are also iterable; mistaking a stream for an iterable would lose backpressure semantics.
- **D-13:** **Null/undefined return values honor Phase 1 response-shaper metadata.** Phase 2 reads `MethodMeta.responseHandlers` (already populated by `@OnNull(status)` / `@OnUndefined(status)` decorators in Phase 1) and applies `res.status(value).end()` (no body). If neither shaper is present and the handler returns `null` or `undefined`, default to **204 No Content**. Matches routing-controllers; honors the Phase 1 contract.
- **D-14:** **Stream-error handling (mid-response):** `stream.on('error', next)` forwards via Express's native chain. The library's error middleware checks `res.headersSent`:
  - `headersSent === true`: log the error, call `res.destroy()` to terminate the response, do NOT attempt to send a new body (avoids the "headers already sent" crash).
  - `headersSent === false`: format JSON error normally per D-17.

### Error middleware integration

- **D-15:** **The library's error middleware is mounted automatically after all controller routers.** `useExpressControllers` performs in order: (controller routers) → (lib error middleware). User code added to the app *after* the call is fine for non-error paths but cannot intercept errors before the lib until Phase 3's `@Middleware({ type: 'after' })` hook ships. Predictable; matches Express convention.
- **D-16:** **`source` field is attached by a per-handler wrapper at registration time.** The adapter wraps each registered handler in a thin async fn:
  ```ts
  async (req, res, next) => {
    try {
      await invokeHandler(req, res, next);
    } catch (err) {
      if (err && typeof err === 'object' && !('source' in err)) {
        (err as any).source = `${ControllerClass.name}.${methodName}`;
      }
      next(err);
    }
  };
  ```
  - User-thrown `HttpError` instances with an explicit `source` win (we only set if missing).
  - Works for both sync throws and rejected promises (v5 forwards rejections natively; the wrapper just enriches before forwarding).
  - Native `Error` from a handler is mutated to add `source` — accepted trade-off (the runtime owns the error briefly before next(err)).
- **D-17:** **`defaultErrorHandler` boot option = boolean toggle.** Default `true` (lib mounts its error middleware). `false` skips mounting entirely; user provides their own. `err.source` is still attached by D-16's wrapper, so user middleware can read it. The function-form / object-form variants are explicitly NOT introduced in Phase 2 — they overlap with Phase 3's `@Middleware({ type: 'after' })` error handler and would create two ways to do the same thing.
- **D-18:** **Error JSON shape (non-validation errors):**
  - `HttpError` instances: serialize via Phase 1's `toJSON()` — `{ status, name, message, source, cause?, details? }`. `cause` and `details` only when present.
  - Non-`HttpError`: coerce to a generic envelope `{ status: 500, name: 'InternalServerError', message: 'Internal Server Error', source }`. Do **NOT** leak `err.message` — could expose internal details.
  - **Dev-mode disclosure:** when `process.env.NODE_ENV !== 'production'`, additionally include `stack: err.stack` (and the original `err.message` under a `_devMessage` key) for debugging. Stripped in production.

### Claude's Discretion

The user accepted recommended options or moved on without deep follow-up — these are delegated to research + planner:

- **Single-implementation factoring** — exact internal boundary between `useExpressControllers` and `createExpressServer`, where the body-parser auto-mount is performed (D-02), and how the BootOptions surface is structured (one shared interface vs split). Constraint: Phase 2 SC #1 must hold.
- **Per-`Router` options** — whether to expose `caseSensitive`/`strict`/`mergeParams` via boot options or per `@Controller`. Default: Express defaults. Open for the planner to surface if a use case forces it.
- **Controller mount order** when multiple controllers are passed — order in `controllers` array, with controller inheritance resolved by Phase 1's `MetadataBuilder` walk. Document the rule; no API surface to choose.
- **IocAdapter integration** — Phase 2 obtains controller instances via `getContainer().get(ControllerClass)` (Phase 1's exported hook with default WeakMap-cached lazy-`new`). No new container API in Phase 2; the existing `useContainer` from Phase 1 is sufficient.
- **Standard Schema feature detection** — exact runtime probe to confirm a slot's value implements `StandardSchemaV1` (presence of `'~standard'` property with `validate` function). Treat anything else as "no schema" and pass raw. Phase 1 stores schemas as `unknown`, so the runtime owns the type narrowing.
- **`validation` boot option semantics** — default behavior covers Standard Schema directly; the option is reserved for future overrides. Initial implementation: accept and ignore unless a concrete use case forces a specific shape (research can verify).
- **Where the v4-pattern detector code lives** — utility module under the adapter, called once per registered route. Internals open.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project direction (truth — read first)
- `CLAUDE.md` §"Project" + §"Technology Stack" + §"Direction Override (2026-05-08)" — authoritative direction; legacy `experimentalDecorators` + `reflect-metadata` in core, single-package repo, Express v5 peer dep, Standard Schema first-class.
- `.planning/PROJECT.md` — project mission, constraints, audience.
- `.planning/ROADMAP.md` §"Phase 2: Runtime + Express Adapter (Happy Path)" — goal, depends-on (Phase 1), 12 mapped requirements, **5 success criteria** (the goal-backward verification target).

### Requirements (Phase 2 owns these REQ-IDs)
- `.planning/REQUIREMENTS.md` — `BUILD-03`, `ROUTE-04`, `ROUTE-05`, `INPUT-01`, `INPUT-02`, `INPUT-03`, `ERR-03`, `ERR-05`, `RES-08`, `API-01`, `API-02`, `API-03`. (Note: `BUILD-04`/`BUILD-05`/`BUILD-06` were rewritten in Phase 1 D-02 — that rewrite stands.)

### Phase 1 outputs (cross-phase contract — Phase 2 consumes these)
- `.planning/phases/01-metadata-decorator-skeleton/01-CONTEXT.md` — full Phase 1 decision log; especially D-04..D-07 (WeakMap storage, decorator-as-pure-registrar, MetadataBuilder inheritance walk).
- `src/types/resolved.ts` — `ControllerMetadata`, `ActionMetadata`, `ResponseHandlerMetadata` shapes Phase 2 reads.
- `src/metadata/types.ts` — `InputDeclaration`, `MethodArgs`, `ControllerArgs`, `ResponseHandlerArgs` shapes.
- `src/metadata/builder.ts` — `buildMetadata([Class])` / `MetadataBuilder.build` — the entry point Phase 2 calls to resolve the controller list.
- `src/errors/http-error.ts` — `HttpError` base, `HttpErrorOptions`, `ValidationIssue` (the type Phase 2 produces for `details`), `toJSON()` contract.
- `src/errors/subclasses.ts` — `BadRequestError({ details, source })`, `NotFoundError`, etc. — the constructor signatures Phase 2 invokes.
- `src/container/use-container.ts` — `useContainer`, `getContainer`, `resetContainer` — Phase 2 obtains controller instances via `getContainer().get(ControllerClass)`.
- `src/types/standard-schema.ts` — re-exported `StandardSchemaV1` type spec (used to narrow the runtime probe in D-10/Claude's-Discretion).
- `src/types/action.ts` — `Action`, `ClassConstructor`.
- `src/index.ts` — current public barrel; Phase 2 will add `useExpressControllers`, `createExpressServer`, and the `BootOptions` type.

### Research (read for context — Phase-2-relevant sections)
- `.planning/research/ARCHITECTURE.md` — three-layer model (decorator → metadata → driver). Phase 2 implements the driver (Express adapter) for the Phase 1 metadata.
- `.planning/research/STACK.md` — Express v5.1+ peer dep, Vitest 3, Node 20+. Tooling section.
- `.planning/research/PITFALLS.md` — relevant especially for v4 path-pattern footguns (D-05) and dual-package-hazard avoidance.
- `.planning/research/FEATURES.md` — feature catalogue traced to requirements.
- `.planning/research/SUMMARY.md` §"Research Flags" — Phase 2 is pre-flagged for `/gsd-research-phase`: "Express v5 native async error semantics: precise interaction between library error middleware, user `@Middleware({ type: 'after' })` error handlers, and Express's default 4-arg handler chain." The research output should sharpen D-15..D-17.

### State
- `.planning/STATE.md` — current position (Phase 1 COMPLETE; Phase 2 next).

### External (Standard Schema spec & Express docs)
- `@standard-schema/spec` package types — already a dep; Phase 2 calls `schema['~standard'].validate(input)`.
- Express v5 release notes (https://expressjs.com/2024/10/15/v5-release.html) — async error propagation semantics consumed by D-15/D-16.
- path-to-regexp v8 README — for the v4 → v8 migration suggestions encoded in D-05's error messages.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phase 1 — already shipped)
- **`buildMetadata([Class])`** (`src/metadata/builder.ts`) — call once at boot with `options.controllers`, walk the resulting `ControllerMetadata[]` to register routes. Inheritance + subclass-wins already handled by Phase 1 D-06.
- **`HttpError` + subclasses** (`src/errors/`) — `BadRequestError({ details, source })` is the exact constructor Phase 2 throws for validation failures. `toJSON()` is what D-18 invokes for serialization.
- **`getContainer()` / `IocAdapter`** (`src/container/`) — Phase 2 instantiates controllers via `getContainer().get(ControllerClass)`. Default WeakMap fallback means zero config for users who don't wire a container.
- **`StandardSchemaV1`** (`src/types/standard-schema.ts`) — type-only re-export. Runtime detection per Claude's Discretion.
- **`Action`** (`src/types/action.ts`) — `{ request, response, next? }`. Note: Phase 2's destructured handler arg is the *resolved* shape `{ params, query, body, headers, req, res, next }` from INPUT-01, NOT this `Action` type. `Action` remains for adapter-package consumers and Phase 3 middleware/interceptor signatures.
- **Response-shaper metadata** (`@HttpCode`, `@OnNull`, `@OnUndefined`, `@Header`, `@ContentType`) — already populated into `MethodMeta.responseHandlers` and `ControllerMeta.responseHandlers` by Phase 1. Phase 2 is the first phase to *interpret* them at HTTP runtime.

### Established Patterns (from Phase 1, must be honored)
- **Decorator-as-pure-registrar** (Phase 1 D-07) — Phase 2 introduces NO new decorators that mutate prototype-chain state at registration. All Phase 2 work happens at `useExpressControllers(...)` boot time, not at decorator evaluation time.
- **Zero global state in core** — adapter must not register any global Express middleware, listeners, or error handlers outside the `app` it was given. Each call to `useExpressControllers` is self-contained (supports multi-app scenarios and the dual-package-hazard mitigation in Phase 1 D-05).
- **WeakMap-keyed metadata read** — Phase 2 reads metadata via `buildMetadata`; never via `Reflect.getMetadata` (Phase 1 reserves `reflect-metadata` for `design:paramtypes` only).
- **Module-private internals** — adapter helpers (path normalizer, v4-pattern detector, handler wrapper, response writer, error formatter) live under a Phase 2 module folder; only `useExpressControllers`, `createExpressServer`, and `BootOptions` go into the public barrel.

### Integration Points
- **Phase 2 → Phase 3** — the lib's error middleware (D-15) is the slot where Phase 3's user `@Middleware({ type: 'after' })` error handler runs ahead. Phase 2 should design the error middleware as the *fallback* / *last-line* handler so Phase 3 can insert ahead of it without restructuring.
- **Phase 2 → Phase 4** — uploads/cookies/sessions/render extend the input declaration shape (`cookies`, `session`, etc.) and add `@UploadedFile` + render decorators. Phase 2's input-declaration parser must be extensible (new slots additive, not breaking).
- **Phase 2 → Phase 5** — the public surface added in Phase 2 (`useExpressControllers`, `createExpressServer`, `BootOptions`) is part of the v1 API contract; renames here are breaking once v1 ships.

</code_context>

<specifics>
## Specific Ideas

- BootOptions surface types EVERY API-03 key today (`controllers`, `middlewares`, `interceptors`, `routePrefix`, `cors`, `defaultErrorHandler`, `validation`, `authorizationChecker`, `currentUserChecker`, `printRoutes`); Phase 2 silently no-ops the keys it doesn't yet implement (D-03).
- Asymmetric body-parser: `createExpressServer` mounts `express.json()` + `express.urlencoded({ extended: true })`; `useExpressControllers` doesn't (D-02). README must show both flows.
- Path composition: strip trailing `/`, collapse `//`, allow empty parts (D-04). The composed path is the input to both v4-pattern detection (D-05) and `path-to-regexp` itself.
- v4 patterns flagged: bare `*`, `:name?`, `:name(regex)`, unnamed `(regex)` groups — with explicit fix suggestions in the error message (D-05).
- Validation: `Promise.all` over four slots (D-06), aggregate every issue into one `BadRequestError` (D-07), JSON shape `{ status, name, message, source, errors: [{ slot, path, message }] }` (D-08), path rendered as `items[0].name` (D-09).
- `@JsonController` always uses `res.json()`; `@Controller` content-negotiates by return type (D-11).
- Stream detection order: `.pipe` first, then `Symbol.asyncIterator` via `Readable.from` (D-12).
- Default 204 No Content for `null`/`undefined` returns when `@OnNull`/`@OnUndefined` are not set (D-13).
- Stream errors → `next(err)`; error middleware respects `res.headersSent` (D-14).
- Library error middleware mounted automatically after routers (D-15); `defaultErrorHandler: false` skips mounting (D-17).
- `err.source` attached by per-handler wrapper as `'ControllerClass.methodName'`, only if not already set (D-16).
- Non-`HttpError` coerced to generic 500; `err.stack` only in non-production (D-18).

</specifics>

<deferred>
## Deferred Ideas

- **`@Middleware({ type: 'after' })` user error handler running ahead of the lib default** — Phase 3 (ERR-04). Phase 2 must mount its error middleware in a position that lets Phase 3 insert ahead without restructuring.
- **Function-form / object-form `defaultErrorHandler`** — explicitly NOT introduced in Phase 2 (D-17). Overlaps with Phase 3's `@Middleware({ type: 'after' })`. Revisit in Phase 3 if the user-decorator hook proves insufficient.
- **Per-`Router` options** (`caseSensitive`, `strict`, `mergeParams`) — Express defaults for now; planner can surface a proposal if a real use case forces it. Likely a future v1.x feature.
- **Auto-injection by constructor type via `design:paramtypes`** — already deferred in Phase 1; remains deferred. Phase 2 uses `getContainer().get(ControllerClass)`; no auto-wiring by parameter type.
- **Glob-loading of controllers** (`controllers: ['src/**/*.controller.ts']`) — Phase 4 (UTIL-02 with `tinyglobby`). Phase 2 accepts only an explicit `ClassConstructor[]`.
- **`printRoutes: true` boot-time route table log** — Phase 4 (API-04, UTIL-03). Phase 2 silently no-ops the option.
- **Lazy-loaded `cors` integration** — Phase 4 (UTIL-04). Phase 2 silently no-ops the option.
- **AsyncLocalStorage `getRequestContext()`** — Phase 4 (NEW-01). Phase 2 does not introduce ALS; the per-handler wrapper from D-16 is sufficient for `source` attribution.

</deferred>

---

*Phase: 2-Runtime + Express Adapter (Happy Path)*
*Context gathered: 2026-05-09*
