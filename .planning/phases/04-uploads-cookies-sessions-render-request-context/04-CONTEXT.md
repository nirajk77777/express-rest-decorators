# Phase 4: Uploads, Cookies, Sessions, Render, Request Context - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete v1 feature parity with `routing-controllers` by adding the orthogonal capabilities the Phase 2 pipeline left out: cookie / session / file-upload slots on the `InputDeclaration`; `@Render` / `@Redirect` / `@Location` response shaper decorators; boot-option behaviors for CORS lazy-load, controller glob loading, and `printRoutes`; and an AsyncLocalStorage-backed request context exposed via `getRequestContext()`. Each feature is small, additive, and independently verifiable. Runs in parallel with Phase 3 — they share `metadata/types.ts` extensions but no source files of consequence.

In scope (from ROADMAP.md Phase 4):
- `cookies` slot on `InputDeclaration` parsed via the `cookie` package (INPUT-04).
- `session` slot on `InputDeclaration` requiring user-wired `express-session` (INPUT-05).
- `@UploadedFile(field, options)` / `@UploadedFiles(field, options)` markers populating a `files` slot on `InputDeclaration`, multer as optional peer; **explicit `limits` and `fileFilter` required** — registration throws if absent (UTIL-01, UTIL-02).
- `@Redirect(template)` (RES-04), `@Location(template)` (RES-05), `@Render(template)` (RES-06) method decorators.
- `cors: true | CorsOptions` boot option with lazy-loaded `cors` (UTIL-03).
- `controllers: (ClassConstructor | string)[]` mixed-array glob loading via `tinyglobby` (UTIL-04).
- `printRoutes: true` boot option logging a route table at boot (API-04).
- `getRequestContext(): { req, res, requestId }` backed by AsyncLocalStorage (NEW-01); `requestId` from `X-Request-Id` header or generated UUID (NEW-02).

Out of scope (deferred):
- Phase 3's middleware / interceptor / auth / user-error-mw surface — runs in parallel; Phase 4 does NOT redefine the pipeline shape.
- Build pipeline, dual ESM+CJS publish, TypeDI adapter, migration guide — Phase 5.
- `@CurrentUser()` parameter decorator — already deferred in Phase 3 D-14; Phase 4 keeps the InputDeclaration-slot model.
- Cross-cutting param-decorator-style accessors (`@Cookie('sid')`, `@Session()`, `@File()`) — rejected in favor of slot-based declaration, see D-01..D-03.
- Server-Sent Events / WebSocket integration — never in v1.
- `Response` instance manipulation helpers (e.g., `@HeaderParam`-style return-value injection) — out; user can call `res.setHeader` directly when needed.

</domain>

<decisions>
## Implementation Decisions

### InputDeclaration slot shapes (cookies, session, uploads)

- **D-01:** **Cookies use a per-key map** mirroring `params` / `query` / `body` / `headers`:
  ```ts
  cookies?: Record<string, true | StandardSchemaV1>
  ```
  Each declared cookie is parsed (via `cookie` package) and validated independently. `true` passes through the raw string; a Standard Schema validates and narrows. The handler destructures `({ cookies }) => cookies.sid`. Symmetric with the four existing slots; gives per-cookie schema control without forcing the user to re-shape inside a bag-level schema.

- **D-02:** **Session uses a single flag/schema** mirroring Phase 3's `currentUser`:
  ```ts
  session?: true | StandardSchemaV1
  ```
  Sessions are typically opaque user-shaped objects; per-key validation is rare. `true` passes `req.session` through (typed as the user's `SessionData` augmentation if they declared one); a schema narrows the whole object. `req.session` is owned by `express-session` middleware the user wires — Phase 4 never installs `express-session` itself, never auto-augments `SessionData`.

- **D-03:** **Uploads use slot-based markers, NOT parameter decorators.**
  ```ts
  files?: {
    avatar: UploadedFile('avatar', { limits, fileFilter }),
    photos: UploadedFiles('photos', { limits, fileFilter }),
  }
  ```
  `UploadedFile` / `UploadedFiles` are plain factory functions (NOT decorators). They return a marker the metadata builder reads at registration time to mount multer middleware on the route and populate the `files` slot before validation runs. **`limits` and `fileFilter` are required** — registration throws an actionable error naming the controller / method / field if either is absent (SC #2 plus the explicit project rule against implicit defaults). The handler destructures `({ files }) => files.avatar.buffer`. Consistent with the input-declaration model; no reintroduction of parameter decorators.

- **D-04:** **Slot resolution slots into Phase 2 D-06's `Promise.all` as additional parallel arms.** Cookies / session / files become arms 6, 7, 8 alongside params / query / body / headers / currentUser. The multer-driven file population happens in a registration-time middleware that runs **before** the validation step (so `req.files` is populated by the time the file-slot arm reads it). Uniform model; planner just adds arms to the existing resolver.

### @Render / @Redirect / @Location semantics

- **D-05:** **`@Redirect(template)` interpolates the handler's returned object into the template.**
  - Handler returns `{ id: 42 }` with `@Redirect('/users/:id')` → 302 redirect to `/users/42`.
  - Handler returns a string → that string overrides the template entirely (free-form URL).
  - Handler returns `undefined` → bare template used as-is.
  Matches routing-controllers; covers the common "compute id then redirect" case; minimal migration friction.

- **D-06:** **`@Render` consumes the handler's return value as the locals object.**
  - `@Render('user-profile')` + handler returning `{ name, email }` → `res.render('user-profile', { name, email })`.
  - Handler returning `undefined` → renders with no locals.
  - Handler returning a non-object → throws actionable error at runtime ("@Render expects an object or undefined; got <type> from Ctrl.method").
  Matches Express `res.render(view, locals)` and matches RC. Express view-engine configuration is the user's responsibility.

- **D-07:** **`@Location(template)` sets the `Location` response header without changing status.**
  Template interpolation rule mirrors `@Redirect` (D-05) — handler-returned object substitutes named placeholders; string return overrides; undefined uses bare template. The handler's return value (if any, after `Location` extraction) is then passed through the standard response writer per `@JsonController` / interceptor rules.

- **D-08:** **Render / Redirect / Location override `@JsonController` JSON serialization** for that method. `@JsonController` no longer applies once one of these decorators is present on a method — the response shaper takes precedence. Coexistence on the same method is allowed (it's the explicit override).

- **D-09:** **Phase 3 interceptors run on the value BEFORE the response shaper consumes it.** Interceptor chain transforms the raw handler return; the transformed value is then passed to the redirect-template interpolator / `Location` setter / `res.render(view, locals)`. Preserves the Phase 3 D-08 invariant ("interceptors transform domain values, not transport bytes"); no special-casing for these paths. Null/undefined short-circuit (Phase 3 D-08 step 2) still applies — `@OnNull(204)` on a `@Render` method short-circuits to a 204 with no render call.

- **D-10:** **Default status codes:** Redirect → **302**; Location → **200** (header set without status change, matching `res.location`); Render → **200**. `@HttpCode(...)` overrides apply uniformly (e.g., `@Redirect('/x') @HttpCode(301)` → permanent redirect). Matches Express defaults and RC.

### AsyncLocalStorage + requestId

- **D-11:** **The ALS wrapper mounts as the OUTERMOST library middleware** — `useExpressControllers` installs `als.run(ctx, next)` as the very first `app.use(...)` it owns, BEFORE Phase 3's lib globals BEFORE, BEFORE CORS, BEFORE controller routers. Every middleware (lib globals, `@UseBefore`, `@UseAfter`), interceptor, handler, and downstream service called via `await` sees `getRequestContext()` populated.
  Documented limitation: user-mounted `app.use(...)` BEFORE `useExpressControllers` runs OUTSIDE the library and will NOT see ALS context. README must call this out.

- **D-12:** **`requestId` resolution rule:**
  1. If `X-Request-Id` request header is present and non-empty → use it verbatim (no validation, no sanitization — passing through proxy/LB-injected trace IDs is the user's contract).
  2. Otherwise → generate via Node's built-in `crypto.randomUUID()` (no `uuid` dep).
  Matches SC #5 wording exactly. The header name is **fixed at `X-Request-Id`** in v1 — no boot option to override. (See `<deferred>` for the v1.x configurable-header-source idea.)
  No automatic `X-Request-Id` response header emission in v1 — leave to user's logging middleware. (See `<deferred>` if migration feedback demands it.)

- **D-13:** **`requestId` lives ONLY in ALS, not on `req`.** `getRequestContext()` is the sole accessor; `req` carries no Phase 4 state — no `req.requestId`, no `req[kRequestId]` Symbol property, nothing. Honors Phase 3's namespacing concern fully — zero collision risk with user middleware. The cross-await ALS smoke test (SC #5) is the load-bearing proof.

- **D-14:** **`getRequestContext()` API shape:**
  ```ts
  function getRequestContext(): { req: Request; res: Response; requestId: string };
  ```
  Throws an actionable error when called outside an active request scope: `"getRequestContext() called outside an active request scope — ensure useExpressControllers() is mounted on the app before this code runs."` Single function export; no class wrapper, no `current()` static, no soft `| undefined` fallback (silent undefined hides bugs).

### Boot ergonomics: CORS, glob loading, printRoutes, lazy peers

- **D-15:** **Lazy import at first-use for ALL optional peers.** Each integration only `import()`s its peer when the corresponding feature is actually used:
  - `cors: true | CorsOptions` → `import('cors')` at boot when the option is set.
  - `UploadedFile` / `UploadedFiles` marker present in any controller's input declaration → `import('multer')` at registration of that route.
  - Glob string in `controllers` array → `import('tinyglobby')` at boot.
  - `cookies` slot present in any input declaration → `import('cookie')` at registration.
  - `session` slot present → no peer to import (the user wires `express-session` themselves; Phase 4 just reads `req.session`).
  Missing peer throws an actionable, install-instruction-bearing error: `"<feature> requires <pkg> as a peer dependency. Install it with: pnpm add <pkg>"`. Zero cost for users who don't use the feature; matches Phase 1's pluggability ethos.

- **D-16:** **Glob loading via mixed array.**
  ```ts
  controllers: (ClassConstructor | string)[]
  ```
  Strings are expanded by `tinyglobby`; classes pass through unchanged. Strings and classes can be freely interleaved in one array. Default extensions: `['.ts', '.tsx', '.js', '.mjs', '.cjs']`. Globs are resolved relative to `process.cwd()`. Each matched module is `import()`d (ESM-first; file-URL normalization handled internally) and **all exported classes** are treated as controllers. Non-class exports are silently skipped (consistent with RC; users intermix utilities in controller files).

- **D-17:** **`printRoutes: true` logs a fixed-format column table to `console.log`** at boot, AFTER all routers have been mounted:
  ```
  METHOD  PATH                          CONTROLLER.METHOD
  GET     /users/:id                    UserController.getById
  POST    /users                        UserController.create
  ```
  Sorted by mount order. Single-form opt-in (boolean only — no pluggable sink, no return-value variant in v1). Cheap, dev-time, zero-dep. (See `<deferred>` for a pluggable-sink v1.x idea.)

- **D-18:** **Boot order locked:**
  ```
  Glob expansion (resolves controllers list)
    ↓
  app.use(als.run wrapper)               ← D-11, outermost
    ↓
  app.use(cors(...))                     ← if cors option set; lazy import
    ↓
  app.use(lib globals BEFORE)            ← Phase 3 D-01
    ↓
  for each controller:
    app.use(routePrefix, controllerRouter)
    (router includes: @UseBefore → @Authorized → input validation → handler → interceptors → response shaper / @Render / @Redirect / @Location → @UseAfter)
    ↓
  app.use(lib globals AFTER, non-error)  ← Phase 3 D-01
    ↓
  app.use(user error middleware chain)   ← Phase 3 D-15..D-17
    ↓
  app.use(lib default error middleware)  ← Phase 2 D-15
    ↓
  if (printRoutes) console.table(routes) ← D-17, after all routers mounted
  ```
  Adds two outer layers (ALS, CORS) and one boot-time post-step (printRoutes) to Phase 3's locked pipeline. CORS gets a dedicated outer slot — preflight responses skip the entire controller stack (auth, validation, handler) per CORS-spec semantics.

### Claude's Discretion

The user accepted recommended options for every decision; these are intentionally left to research + planner:

- **`UploadedFile` / `UploadedFiles` exact factory return shape** — internal marker symbol vs structural shape (`{ __kind: 'file', field, options }`). Planner picks the form that integrates cleanly with the existing slot resolver.
- **Multer middleware composition** — whether the multer mw is mounted as a hidden `@UseBefore` equivalent in the router-build composer, or as a dedicated registration step before the validation arm. Phase 2 D-06's `Promise.all` shape is fixed; the planner decides where the multer mount sits relative to it.
- **Internal file layout under `src/adapter/`** — likely new files: `cookies.ts`, `session.ts`, `uploads.ts`, `render.ts` (covering `@Render`, `@Redirect`, `@Location`), `request-context.ts` (ALS + `getRequestContext()`), `print-routes.ts`, `glob-loader.ts`. Planner organizes; subject to Phase 1 D-07 / Phase 2 / Phase 3 conventions (decorator-as-pure-registrar, module-private internals).
- **Template-interpolation regex / parser for `@Redirect` and `@Location`** — `:name` placeholder substitution from a flat object. Planner picks a robust form (handles missing keys = throw actionable error vs leave literal vs URL-encode) per current Express path-to-regexp v8 conventions.
- **Glob-loader ESM/CJS interop edge cases** — how `import()` behaves for `.ts` files in `tsx`-loaded vs `node --import tsx`-loaded vs compiled environments. Planner researches `tinyglobby` + dynamic-import patterns and locks defaults.
- **`req.session` typing** — whether the library exports a type-augmentation helper (`declare module 'express-session' { interface SessionData { ... } }`) snippet in docs, or leaves `req.session` typed as the user's own augmentation. Likely docs-only; planner confirms.
- **`crypto.randomUUID()` import path** — Node 20+ exposes `crypto.randomUUID()` both as a top-level static on the `crypto` module and globally via the `crypto` global. Planner picks per ESM/CJS portability.
- **`MetadataBuilder` extension shape for Phase 4** — `ControllerMetadata` / `ActionMetadata` need fields for `render?` / `redirect?` / `location?` decorator metadata. Coordinate with the Phase 3 builder extension via `metadata/types.ts`. Planner of whichever ships second handles the trivial merge.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project direction (truth — read first)
- `CLAUDE.md` §"Project" + §"Technology Stack" + §"Direction Override (2026-05-08)" — authoritative direction; legacy `experimentalDecorators` + `reflect-metadata`, single-package repo, Express v5 peer dep, Standard Schema first-class, optional peers (multer, cors, express-session, tinyglobby).
- `.planning/PROJECT.md` — project mission, constraints, modest-adoption OSS audience.
- `.planning/ROADMAP.md` §"Phase 4: Uploads, Cookies, Sessions, Render, Request Context" — goal, depends-on (Phase 2), parallelizable with Phase 3, **5 success criteria** (the goal-backward verification target).

### Requirements (Phase 4 owns these REQ-IDs)
- `.planning/REQUIREMENTS.md` — `INPUT-04` (line 36), `INPUT-05` (line 37), `RES-04` (line 44), `RES-05` (line 45), `RES-06` (line 46), `UTIL-01` (line 73), `UTIL-02` (line 74), `UTIL-03` (line 75), `UTIL-04` (line 76), `API-04` (line 89), `NEW-01` (line 93), `NEW-02` (line 94).

### Phase 1 outputs (cross-phase contract — Phase 4 consumes these)
- `.planning/phases/01-metadata-decorator-skeleton/01-CONTEXT.md` — full Phase 1 decision log; D-04..D-07 (WeakMap storage, decorator-as-pure-registrar, MetadataBuilder inheritance walk) constrain how Phase 4 decorators (`@Render`, `@Redirect`, `@Location`) are authored.
- `src/types/resolved.ts` — `ControllerMetadata`, `ActionMetadata`, `ResponseHandlerMetadata` shapes Phase 4 EXTENDS with `render?`, `redirect?`, `location?` fields.
- `src/types/action.ts` — `Action = { request, response, next? }`; ALS context wraps the lifecycle of any handler invoked through this contract.
- `src/metadata/types.ts` — `InputDeclaration` is EXTENDED with `cookies?`, `session?`, `files?` slots per D-01..D-03. Coordinate with Phase 3's `currentUser` extension via the same file (additive merge).
- `src/metadata/builder.ts` — `MetadataBuilder.build([Class])`; Phase 4 metadata read happens through this same entry point.
- `src/metadata/storage.ts` — WeakMap storage helpers for new Phase 4 decorator metadata (`@Render`, `@Redirect`, `@Location` per controller method).
- `src/errors/http-error.ts` + `src/errors/named.ts` — `BadRequestError` is what cookie/session/file slot validation failures throw (matches Phase 2 D-09 aggregation rules).
- `src/types/standard-schema.ts` — re-exported `StandardSchemaV1` type spec; used to type the optional `cookies?: Record<string, true|StandardSchemaV1>`, `session?: true|StandardSchemaV1` slots.
- `src/index.ts` — public barrel; Phase 4 will add `@Render`, `@Redirect`, `@Location`, `UploadedFile`, `UploadedFiles`, `getRequestContext`.

### Phase 2 outputs (the pipeline Phase 4 inserts into)
- `.planning/phases/02-runtime-express-adapter-happy-path/02-CONTEXT.md` — full Phase 2 decision log. **Especially:** D-06..D-10 (validation pipeline that the new slots extend per D-04), D-11..D-13 (response writer that `@Render`/`@Redirect`/`@Location` override per D-08), D-13 (null/undefined short-circuit that still applies on Render paths per D-09).
- `src/adapter/boot.ts` — `useExpressControllers` / `createExpressServer`; Phase 4 extends to install ALS wrapper outermost (D-11), CORS lazy-load (D-15), glob expansion before mount (D-16), printRoutes after mount (D-17).
- `src/adapter/boot-options.ts` — `BootOptions` interface; Phase 4 extends with `cors?: boolean | CorsOptions`, `printRoutes?: boolean`. The `controllers` array type widens to `(ClassConstructor | string)[]` per D-16.
- `src/adapter/router-build.ts` — Phase 4's render shaper / redirect shaper / location shaper hook into the per-route registration logic; multer mw mount happens here per D-04.
- `src/adapter/validation.ts` — extended for the cookies / session / files slots per D-01..D-04; new arms in Phase 2 D-06's `Promise.all`.
- `src/adapter/response.ts` — Render / Redirect / Location shapers extend (or override) the response-write step per D-08; interceptor chain (Phase 3 D-08) still feeds into them per D-09.

### Phase 3 outputs (parallel phase — coordinate, don't conflict)
- `.planning/phases/03-middleware-interceptors-auth-error-handling/03-CONTEXT.md` — full Phase 3 decision log. **Especially:** D-01 (canonical pipeline order — Phase 4 adds two outer layers per D-18), D-08 (interceptor placement: Phase 4 shapers consume the interceptor-transformed value per D-09), D-14 (`currentUser` slot — Phase 4 adds cookies/session/files slots additively in `metadata/types.ts`; trivial merge), and the Phase 3 explicit warning that Phase 4 should NOT put per-request state on `req` directly (honored by D-13: ALS-only).
- `src/adapter/auth.ts`, `src/adapter/middleware.ts`, `src/adapter/interceptor.ts` — Phase 4 does not modify; reads through them via the Phase 3-defined pipeline order only.

### Research
- `.planning/research/SUMMARY.md` §"Research Flags" — Phase 4 is **NOT pre-flagged** for `/gsd-research-phase` ("well-documented standard patterns"). The patterns are Express-native (cookies, sessions, multer, cors, view engines, AsyncLocalStorage); standard discuss-phase context should suffice. Planner can still opt into a research pass if a specific decision (e.g., multer-as-mw composition with Express v5, ALS perf overhead at the outermost slot) needs deeper grounding.
- `.planning/research/ARCHITECTURE.md` — three-layer model (decorator → metadata → driver). Phase 4 adds decorators (`@Render`/`@Redirect`/`@Location`), metadata fields, and adapter-layer composition; same shape Phase 3 uses.
- `.planning/research/PITFALLS.md` — likely relevant for `cookie`-package edge cases, multer field-name vs body-parsing ordering, and Express view-engine resolution timing.
- `.planning/research/FEATURES.md` — feature catalogue traced to INPUT-04/05, RES-04/05/06, UTIL-01..04, API-04, NEW-01/02 requirements.

### State
- `.planning/STATE.md` — current position; Phase 4 will run parallel with Phase 3 (Phase 3 currently In Progress 4/5 plans complete).

### External (Express + ecosystem references — read before locking decorator/runtime details)
- Express v5 release notes (https://expressjs.com/2024/10/15/v5-release.html) — async error propagation; route handler arity; native body-parser built-ins (relevant: do NOT install `body-parser` for cookies/uploads — Express 5 ships `express.json()` / `express.urlencoded()`, but **`cookie-parser` is still a separate concern** — Phase 4 uses the lower-level `cookie` package directly per INPUT-04 and parses on demand).
- Express `res.redirect` / `res.location` / `res.render` docs (https://expressjs.com/en/5x/api.html#res.redirect) — status defaults, header rules, view-engine resolution that D-05..D-10 piggyback on.
- multer README (https://github.com/expressjs/multer) — `single` / `array` / `fields` / `any` shapes; `limits` and `fileFilter` semantics; required-fields error shape (D-03).
- `cookie` package (https://www.npmjs.com/package/cookie) — `parse(header, options?)` / `serialize(name, value, options?)`; tiny zero-dep parser used by D-01.
- `express-session` README (https://github.com/expressjs/session) — user-side wiring (Phase 4 only consumes `req.session`; never installs).
- `cors` package (https://www.npmjs.com/package/cors) — `CorsOptions` shape D-15 lazy-imports.
- `tinyglobby` (https://github.com/SuperchupuDev/tinyglobby) — modern fast-glob alternative; ESM-friendly; D-16.
- Node `node:async_hooks` AsyncLocalStorage docs (https://nodejs.org/api/async_context.html#class-asynclocalstorage) — `als.run(store, callback)` semantics; cross-await guarantees that D-11 / D-13 / SC #5 rely on.
- Node `crypto.randomUUID()` docs (https://nodejs.org/api/crypto.html#cryptorandomuuid) — built-in v4 UUID; no `uuid` dep needed for D-12.
- routing-controllers source (https://github.com/typestack/routing-controllers) — reference implementation for `@Redirect` / `@Location` / `@Render` semantics that D-05..D-10 mirror; reference for glob-loading semantics D-16.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phase 1 + Phase 2; some shared with Phase 3)
- **`MetadataBuilder.build([Class])`** (`src/metadata/builder.ts`) — Phase 4 reads through the same entry point; the builder will be extended to merge new render/redirect/location decorator output into each `ActionMetadata`.
- **WeakMap storage primitives** (`src/metadata/storage.ts`) — Phase 4 decorators (`@Render`, `@Redirect`, `@Location`) write into module-private WeakMaps; no `Reflect.defineMetadata` (Phase 1 D-04 / D-07 — decorator-as-pure-registrar).
- **`InputDeclaration`** (`src/metadata/types.ts`) — extended with `cookies?: Record<string, true|StandardSchemaV1>`, `session?: true|StandardSchemaV1`, `files?: Record<string, UploadedFileMarker | UploadedFilesMarker>`. Additive — Phase 3 also extends this same type with `currentUser?` per its D-14; coordinate via metadata/types.ts.
- **Phase 2 validation runner** (`src/adapter/validation.ts`) — `Promise.all` over slot resolvers per Phase 2 D-06; Phase 4 adds three more arms (cookies, session, files) per D-04.
- **Phase 2 response writer** (`src/adapter/response.ts`) — JSON / string / Buffer / stream / async-iterable / null / undefined paths per D-11..D-13. `@Render` / `@Redirect` / `@Location` shapers consume the (post-interceptor) value and override the writer per D-08.
- **`HttpError` family** (`src/errors/`) — `BadRequestError` aggregates cookie/session/file slot validation failures (matches Phase 2 D-09 source-attribution).
- **`useExpressControllers` / `createExpressServer`** (`src/adapter/boot.ts`) — boot pipeline Phase 4 extends with the four new outer-layer slots (ALS, CORS, glob expansion pre-mount, printRoutes post-mount) per D-18.

### Established Patterns (must be honored)
- **Decorator-as-pure-registrar** (Phase 1 D-07) — `@Render`, `@Redirect`, `@Location` MUST be pure registrars that mutate the appropriate WeakMap and return; no prototype walking inside decorators.
- **Module-private internals** (Phase 1 + Phase 2 + Phase 3) — only the decorators (`@Render`, `@Redirect`, `@Location`), the slot-marker factories (`UploadedFile`, `UploadedFiles`), and `getRequestContext()` are added to the public barrel. Adapter helpers (multer composer, render shaper, ALS wrapper, glob loader, route-table formatter) live under `src/adapter/` and stay non-public.
- **Subclass wins on inheritance** (Phase 1 D-06) — when a subclass redeclares `@Render`/`@Redirect`/`@Location` on the same method, the subclass declaration replaces the base class's. The MetadataBuilder walk handles this without Phase 4 needing custom merge logic.
- **Lazy peer imports** (D-15) — every optional peer is `import()`d at first use, never required at top level. Project-wide rule: keep `package.json` dependencies free of multer / cors / express-session / tinyglobby; they are `peerDependenciesMeta: { optional: true }` only.
- **Zero global state in core** (Phase 2 implicit) — Phase 4 must not register any global Express middleware, listeners, or error handlers outside the `app` it was given. ALS storage IS global, but per-process (`AsyncLocalStorage` instance is module-scoped); per-request stores are scoped by `als.run()` only — multi-app scenarios stay supported.
- **No `req.*` namespace pollution** (Phase 3 explicit warning) — Phase 4 carries NO state on `req`. ALS context is the sole accessor for cross-cutting data per D-13.

### Integration Points
- **Phase 4 ⇄ Phase 3** (parallel) — share no source files of consequence per ROADMAP. Both extend `metadata/types.ts` (`InputDeclaration`); additive, no conflict. Whichever PR ships second handles the trivial merge in `metadata/types.ts` and the `MetadataBuilder` extension type.
- **Phase 4 → Phase 5** — public surface added in Phase 4 (`@Render`, `@Redirect`, `@Location`, `UploadedFile`, `UploadedFiles`, `getRequestContext`, plus `BootOptions.cors` / `BootOptions.printRoutes` and the widened `controllers` array type) is part of the v1 API contract; renames or signature changes here are breaking once v1.0.0 ships from Phase 5. Phase 5 also verifies dual ESM+CJS behavior of the lazy-import paths (the `import('cors')` etc. expressions must transpile correctly under tshy in both module formats — Phase 5 `attw` / `publint` runs cover this).
- **Phase 4 → Phase 5 docs** — README's opening 30-line example (Phase 5 SC #2) should NOT depend on any Phase 4 feature beyond what fits in 30 lines; cookies / sessions / uploads / render are documented in their own README sections; `getRequestContext` warrants its own section because the "outermost ALS wrapper" caveat (D-11) is non-obvious to migrators.

</code_context>

<specifics>
## Specific Ideas

- **Mixed-array glob loading** (D-16) — `controllers: [UserController, 'src/controllers/**/*.ts', AdminController]` is the canonical example; planner should make this work without users having to think about ordering.
- **Multer `limits` / `fileFilter` are required at registration** (D-03) — registration THROWS if either is absent, naming the controller / method / field. Explicit project rule: no implicit defaults that could allow accidental upload of unbounded files.
- **`X-Request-Id` header takes precedence; UUID v4 fallback** (D-12) — exactly the SC #5 wording. Header value passed through verbatim; user enforces format upstream if they care.
- **ALS-only requestId, never on `req`** (D-13) — direct response to Phase 3's namespacing warning. Cross-await ALS smoke test is the load-bearing proof.
- **Outermost ALS wrapper** (D-11) — README must explicitly document that user-mounted `app.use(...)` BEFORE `useExpressControllers` will NOT see ALS context. This is a known migrator footgun.
- **Decorator override of `@JsonController`** (D-08) — `@Render` on a `@JsonController` method renders HTML (the decorator wins). Document the precedence rule.
- **Interceptors run on the value, then shapers consume** (D-09) — interceptor chain transforms the raw return; the redirect interpolator / `Location` setter / `res.render(view, locals)` consumes the transformed result. Preserves Phase 3's "transform values, not transport bytes" invariant.
- **printRoutes is fixed-format console.log** (D-17) — METHOD | PATH | CONTROLLER.METHOD columns, sorted by mount order. Boolean-only opt-in. No pluggable sink in v1.
- **Lazy-import error message format** (D-15) — `"<feature> requires <pkg> as a peer dependency. Install it with: pnpm add <pkg>"`. Consistent across all four peers.

</specifics>

<deferred>
## Deferred Ideas

- **Configurable `requestIdHeader`** (override `X-Request-Id`) — boot option to read from `CF-Ray` / `X-Trace-Id` / etc., or disable header sourcing entirely. Defer to v1.x; in v1, the header is fixed.
- **Auto-emit `X-Request-Id` response header** — distributed-tracing convenience (let clients correlate the request by reading the response header). Defer to v1.x; in v1, users add their own logging middleware if they want this.
- **`@CurrentUser()` parameter decorator** — already deferred in Phase 3; keep deferred for Phase 4. The InputDeclaration `currentUser` slot is the v1 surface.
- **`@Cookie('sid')` / `@Session()` parameter decorators** — alternate accessors. Rejected in favor of slot-based declaration (D-01 / D-02). Keep as a v1.x consideration if migration feedback shows users want them.
- **Single bag-level cookies/session schema** — both slots support per-key map (cookies) or single flag/schema (session) but NOT both forms. If users want a bag-level cookies schema, they validate inside their handler. Revisit in v1.x if real demand surfaces.
- **Multer `defaults` boot option** — global default `limits` / `fileFilter` to avoid repeating per-route. Adds opinion + foot-gun (silent defaults). Defer to v1.x.
- **`Upload` parameter decorator (back-compat with RC `@UploadedFile()` parameter style)** — RC migrators may want the old syntax. Phase 5 migration guide documents the slot rewrite; defer back-compat to v1.x if migration friction is real.
- **`@Render` shared-locals merging** — `@Render(template, defaultLocals?)` where decorator-supplied locals merge with handler return. Useful for layout data; adds API surface. Defer.
- **Pluggable `printRoutes` sink** — `printRoutes: true | (routes) => void` for structured logging integration (pino, winston). Defer to v1.x.
- **`printRoutes` return-value variant** — return the routes table from `useExpressControllers(...)` so user code can do its own thing. Defer.
- **303 See Other default for `@Redirect`** — REST-purist alternative to 302. RC parity wins; default stays 302. Defer (and likely never).
- **CORS as ordinary user-positioned global** — let users insert auth in front of CORS by passing `cors()` in `BootOptions.middlewares`. Phase 4 carves a dedicated outer slot per D-18 because preflight semantics demand it. If a real use case for re-ordering surfaces, revisit in v1.x.
- **Per-controller `routePrefix` glob filter** — load only matching glob results into a specific prefix. Out of scope; users can split their controllers array if they need this.
- **Request context typed extensions** — let users augment `getRequestContext()` return type with their own keys (`{ req, res, requestId, tenantId }`). Phase 5 / v1.x — needs a module-augmentation contract; in v1, the shape is fixed.
- **Auto-injection by constructor `design:paramtypes`** — already deferred from Phase 1; remains deferred. Phase 4 doesn't reopen the question.
- **Phase 5 features** (build pipeline, dual ESM+CJS publish, TypeDI adapter, migration guide) — final phase; not Phase 4's concern.

</deferred>

---

*Phase: 4-Uploads, Cookies, Sessions, Render, Request Context*
*Context gathered: 2026-05-10*
