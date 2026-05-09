# Requirements

**Project:** Express Controllers (working title) — modernized Express-v5-only successor to `routing-controllers`.
**Source:** [PROJECT.md](./PROJECT.md), [research/SUMMARY.md](./research/SUMMARY.md)
**Last updated:** 2026-05-08

---

## v1 Requirements

### Build & Distribution (BUILD)

- [ ] **BUILD-01**: Library builds dual ESM + CJS via `tshy` with TypeScript 5.8+
- [ ] **BUILD-02**: Library targets Node ≥20 (`engines.node: ">=20"`) with Node 22 recommended; CI matrix runs Node 20/22/24
- [x] **BUILD-03**: Library declares `express ^5.1.0` as a peer dependency; works with Express 5.1.x and 5.2.x
- [x] **BUILD-04**: Library uses legacy TypeScript decorators (`experimentalDecorators: true` + `emitDecoratorMetadata: true`); installs a runtime guard that throws an actionable error if either flag is missing or if `reflect-metadata` has not been imported by the consumer.
- [x] **BUILD-05**: Library imports `reflect-metadata` as a runtime dependency in core for reading TS-emitted type metadata (`design:paramtypes`, `design:returntype`, `design:type`); consumers must `import 'reflect-metadata'` once at app entry (documented in README).
- [ ] **BUILD-06**: Repo is a single-package repo (one `package.json`, one `src/`, one `dist/`); dual ESM+CJS published from the package root via `tshy`. Optional integrations live as sub-path exports within the same package.
- [ ] **BUILD-07**: `prepublishOnly` runs `attw` and `publint` to verify dual-package config
- [ ] **BUILD-08**: Vitest 3 test suite covers all public APIs; tests run on both `pool: 'forks'` and `pool: 'threads'`
- [ ] **BUILD-09**: Lint/format via Biome 2 (ESLint 9 + `@typescript-eslint` fallback if a decorator-aware rule is missing)

### Routing Decorators (ROUTE)

- [ ] **ROUTE-01**: User can declare a controller with `@Controller(basePath?)` or `@JsonController(basePath?)`
- [ ] **ROUTE-02**: User can declare HTTP methods on controller methods: `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`, `@Head`, `@All`, `@Method(verb, path)`
- [ ] **ROUTE-03**: Each method decorator accepts a path string and an optional input declaration object: `@Get('/:id', { params, query, body, headers })`
- [x] **ROUTE-04**: Path strings must be path-to-regexp v8-compatible; library validates path strings at registration time and throws an actionable error for v4-style patterns (`*`, `:id?`, `:id(\d+)`, etc.) with a fix suggestion
- [x] **ROUTE-05**: Library uses one `express.Router()` per controller; supports multiple controllers, controller inheritance, and class-level `routePrefix`

### Input Binding (INPUT)

- [x] **INPUT-01**: Handler receives a single destructured object containing parsed `params`, `query`, `body`, `headers`, `cookies`, `req`, `res`, `next` — typed from the input declaration
- [ ] **INPUT-02**: Each input slot (`params`, `query`, `body`, `headers`) accepts any Standard Schema-compatible schema (Zod, Valibot, ArkType all work natively); no schema means raw value
- [ ] **INPUT-03**: Validation failure on any input slot produces a typed `BadRequestError` with field-level error details
- [ ] **INPUT-04**: User can declare cookie params via input declaration; library uses `cookie` package
- [ ] **INPUT-05**: User can declare session/request-scoped data via input declaration when `express-session` middleware is wired

### Response Shaping (RES)

- [ ] **RES-01**: User can set HTTP status with `@HttpCode(code)`
- [ ] **RES-02**: User can override status when handler returns null/undefined: `@OnNull(code)`, `@OnUndefined(code)`
- [ ] **RES-03**: User can set response headers via `@Header(name, value)` and content type via `@ContentType(type)`
- [ ] **RES-04**: User can redirect via `@Redirect(template)` returning the redirect target from handler
- [ ] **RES-05**: User can set Location header via `@Location(template)`
- [ ] **RES-06**: User can render a view template via `@Render(template)` when an Express view engine is configured
- [ ] **RES-07**: Plain object/primitive returns from handlers are serialized as JSON by default (matching `@JsonController`); strings sent as-is for `@Controller`
- [ ] **RES-08**: Async iterables / streams returned from handlers are piped to the response

### Errors (ERR)

- [x] **ERR-01**: Library exports a `HttpError` base class and 4xx/5xx subclasses (`BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `MethodNotAllowedError`, `ConflictError`, `InternalServerError`, etc.)
- [x] **ERR-02**: `HttpError` instances have `status`, `message`, optional `cause` (ES2022), and a `toJSON()` for consistent serialization
- [x] **ERR-03**: Library installs ONE Express error middleware that converts thrown errors to HTTP responses; handlers do not need try/catch for async code (Express v5 native rejection forwarding)
- [ ] **ERR-04**: User can register custom error handlers via `@Middleware({ type: 'after' })` ahead of the library default
- [x] **ERR-05**: Errors include a `source` field identifying which controller/method threw, for debuggability

### Middleware & Interceptors (MW)

- [ ] **MW-01**: User can attach Express middleware to controllers/methods via `@UseBefore(...)` and `@UseAfter(...)` accepting function and class forms
- [ ] **MW-02**: User can declare a global or scoped middleware class with `@Middleware({ type: 'before' | 'after' })` implementing an `ExpressMiddlewareInterface`
- [ ] **MW-03**: User can declare an interceptor class with `@Interceptor()` and attach via `@UseInterceptor(...)` to transform handler return values before serialization
- [ ] **MW-04**: Middleware execution order is deterministic, top-to-bottom (controller-level before method-level for `before`; reversed for `after`); documented with a test fixture proving the rule

### Authorization (AUTH)

- [ ] **AUTH-01**: User can mark controllers/methods as `@Authorized(roles?)`
- [ ] **AUTH-02**: User registers a global `authorizationChecker(action, roles)` function returning boolean/Promise<boolean>; failed checks return 401/403
- [ ] **AUTH-03**: User registers a global `currentUserChecker(action)` resolving the current user; user is exposed via input declaration

### File Upload, Cookies, Static (UTIL)

- [ ] **UTIL-01**: Library supports file upload declarations in input declaration object via `multer` (optional peer dep); explicit limits and fileFilter required (no implicit defaults)
- [ ] **UTIL-02**: Library exposes `@UploadedFile(field, options?)` / `@UploadedFiles(field, options?)` on the input declaration object
- [ ] **UTIL-03**: Library supports CORS via a single `cors` boot option (lazy import of `cors` package)
- [ ] **UTIL-04**: Library supports controller glob loading via `tinyglobby`: `useExpressControllers(app, { controllers: ['src/controllers/**/*.ts'] })`

### DI Hook (DI)

- [x] **DI-01**: Library exposes `useContainer(IocAdapter)` to register an external DI container; the `IocAdapter` interface has a single `get<T>(cls: Class<T>, action?: Action): T | Promise<T>` method
- [x] **DI-02**: Default container is a lazy `new Class()` cached in a `WeakMap<Class, instance>`; no DI lib required
- [ ] **DI-03**: A separate `@scope/express-controllers-typedi` adapter package is published alongside core (TypeDI 0.x reference adapter)

### Bootstrap & Public API (API)

- [x] **API-01**: Library exports `useExpressControllers(app, options)` that mounts routers on an existing Express app
- [x] **API-02**: Library exports `createExpressServer(options)` returning a configured Express app for users who don't have one
- [x] **API-03**: Boot options include: `controllers`, `middlewares`, `interceptors`, `routePrefix`, `cors`, `defaultErrorHandler`, `validation`, `authorizationChecker`, `currentUserChecker`, `printRoutes`
- [ ] **API-04**: When `printRoutes: true`, library logs a route table at boot for dev-time visibility

### New Features on Top (NEW)

- [ ] **NEW-01**: Library provides `getRequestContext()` returning the current request via AsyncLocalStorage; available anywhere in the call chain without injection
- [ ] **NEW-02**: Each request automatically populates the AsyncLocalStorage context with `{ req, res, requestId }`; `requestId` from `X-Request-Id` header or generated UUID

### Validation Adapter (VAL)

- [x] **VAL-01**: Core depends on type-only `StandardSchemaV1` interface; runtime dispatch via the spec's `~standard` property (no per-validator branching in core)
- [ ] **VAL-02**: README documents Zod, Valibot, and ArkType usage examples (no adapter code needed; they implement Standard Schema natively)

### Documentation & Migration (DOCS)

- [ ] **DOCS-01**: README opens with a runnable example using Zod + Express 5 in under 30 lines, including required `tsconfig.json` snippet
- [ ] **DOCS-02**: Migration guide doc covers every breaking change vs `routing-controllers` v0.11; the parameter-decorator → method-level input change is the lead item with before/after examples
- [ ] **DOCS-03**: TypeDoc API reference generated and published alongside README
- [ ] **DOCS-04**: CHANGELOG follows Keep-a-Changelog; releases via Changesets with npm provenance

---

## v1.x Requirements (deferred from v1)

These ship after v1.0 in additive minor releases.

- [ ] **V1X-01**: SSE / async-iterable streaming helpers (`@SseStream` decorator)
- [ ] **V1X-02**: Lifecycle hooks (`onAppInit`, `onAppShutdown`)
- [ ] **V1X-03**: Structured logging hook (pluggable logger interface)
- [ ] **V1X-04**: `@RateLimit` decorator (express-rate-limit wrapper)
- [ ] **V1X-05**: `@Timeout` decorator
- [ ] **V1X-06**: OpenAPI spec emit from Zod-typed input declarations (separate package)
- [ ] **V1X-07**: Valibot reference adapter / docs
- [ ] **V1X-08**: TypeDI alternatives (Awilix, tsyringe) adapter packages — community-contributed welcome

---

## Out of Scope

- **Koa support** — Express-only is the focused-package goal
- **Express v4 fallback** — moving forward only
- **class-validator support** — out of scope for v1; the technical blocker (Stage 3 incompatibility) no longer applies under the legacy decorator direction, but scope remains v1.x at earliest.
- **Parameter decorators (`@Param`, `@Body`, `@QueryParam` as parameter decorators)** — replaced by method-level input declaration; cleaner type inference and avoids per-arg decorator boilerplate.
- **Built-in DI container** — only an optional `useContainer()` hook
- **Drop-in API compatibility with routing-controllers** — input binding break is forced; other breaks are opportunistic
- **Codemod tool** — migration guide doc only for v1
- **WebSocket decorators** — out of scope; users compose WebSocket handling separately
- **Microservices / GraphQL decorators** — different problem domain
- **File-based routing** — class-based only
- **Typed RPC client codegen** — different problem (see ts-rest)
- **Hot reload / dev mode improvements beyond `printRoutes`** — defer to userland
- **Replacing `routing-controllers` as THE successor** — modest adoption is fine

---

## Traceability

Every v1 requirement maps to exactly one phase. v1.x and Out-of-Scope items are intentionally unmapped.

| REQ-ID | Phase |
|--------|-------|
| BUILD-01 | Phase 5 |
| BUILD-02 | Phase 5 |
| BUILD-03 | Phase 2 |
| BUILD-04 | Phase 1 |
| BUILD-05 | Phase 1 |
| BUILD-06 | Phase 5 |
| BUILD-07 | Phase 5 |
| BUILD-08 | Phase 5 |
| BUILD-09 | Phase 5 |
| ROUTE-01 | Phase 1 |
| ROUTE-02 | Phase 1 |
| ROUTE-03 | Phase 1 |
| ROUTE-04 | Phase 2 |
| ROUTE-05 | Phase 2 |
| INPUT-01 | Phase 2 |
| INPUT-02 | Phase 2 |
| INPUT-03 | Phase 2 |
| INPUT-04 | Phase 4 |
| INPUT-05 | Phase 4 |
| RES-01 | Phase 1 |
| RES-02 | Phase 1 |
| RES-03 | Phase 1 |
| RES-04 | Phase 4 |
| RES-05 | Phase 4 |
| RES-06 | Phase 4 |
| RES-07 | Phase 1 |
| RES-08 | Phase 2 |
| ERR-01 | Phase 1 |
| ERR-02 | Phase 1 |
| ERR-03 | Phase 2 |
| ERR-04 | Phase 3 |
| ERR-05 | Phase 2 |
| MW-01 | Phase 3 |
| MW-02 | Phase 3 |
| MW-03 | Phase 3 |
| MW-04 | Phase 3 |
| AUTH-01 | Phase 3 |
| AUTH-02 | Phase 3 |
| AUTH-03 | Phase 3 |
| UTIL-01 | Phase 4 |
| UTIL-02 | Phase 4 |
| UTIL-03 | Phase 4 |
| UTIL-04 | Phase 4 |
| DI-01 | Phase 1 |
| DI-02 | Phase 1 |
| DI-03 | Phase 5 |
| API-01 | Phase 2 |
| API-02 | Phase 2 |
| API-03 | Phase 2 |
| API-04 | Phase 4 |
| NEW-01 | Phase 4 |
| NEW-02 | Phase 4 |
| VAL-01 | Phase 1 |
| VAL-02 | Phase 5 |
| DOCS-01 | Phase 5 |
| DOCS-02 | Phase 5 |
| DOCS-03 | Phase 5 |
| DOCS-04 | Phase 5 |

**Coverage:** 58 / 58 v1 requirements mapped (100%). 0 orphans, 0 duplicates.

### Phase distribution

| Phase | Count | Categories represented |
|-------|-------|------------------------|
| Phase 1 | 14 | BUILD, ROUTE, RES, ERR, VAL, DI |
| Phase 2 | 12 | BUILD, ROUTE, INPUT, ERR, RES, API |
| Phase 3 | 8 | MW, AUTH, ERR |
| Phase 4 | 12 | INPUT, RES, UTIL, API, NEW |
| Phase 5 | 12 | BUILD, DI, VAL, DOCS |

---

## Acceptance Criteria Notes

- "Feature parity" is verified by porting each example from `routing-controllers/sample/` to the new API and confirming behavioral equivalence (where the API allows; the input-binding change requires an idiomatic rewrite).
- "Standard Schema works natively" verified by running the same controller against Zod, Valibot, and ArkType schemas and observing identical behavior.
- "Express v5 native async errors" verified by deliberately throwing in an async handler with no try/catch and confirming the library's error middleware converts it to a typed HTTP response.
- "Decorator-mode mismatch" verified by a fixture project with `experimentalDecorators: true` that should throw the runtime guard with an actionable error message.
