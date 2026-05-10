# Roadmap

**Project:** Express Controllers (working title) — modernized Express-v5-only successor to `routing-controllers`.
**Source:** [PROJECT.md](./PROJECT.md), [REQUIREMENTS.md](./REQUIREMENTS.md), [research/SUMMARY.md](./research/SUMMARY.md)
**Granularity:** coarse (5 phases)
**Mode:** yolo
**Parallelization:** enabled (Phases 3 and 4 run concurrently after Phase 2)
**Last updated:** 2026-05-07

---

## Phases

- [x] **Phase 1: Metadata & Decorator Skeleton** — Stage 3 decorators, per-class metadata, IoC contract, runtime mode guard; pure logic, no HTTP yet.
- [x] **Phase 2: Runtime + Express Adapter (Happy Path)** — End-to-end vertical slice: input resolution via Standard Schema, ExpressAdapter, native async error middleware.
- [ ] **Phase 3: Middleware, Interceptors, Auth, Error Handling** — Orthogonal additions on top of Phase 2 pipeline (parallel with Phase 4).
- [ ] **Phase 4: Uploads, Cookies, Sessions, Render, Request Context** — Feature-parity edge cases plus AsyncLocalStorage and `printRoutes` (parallel with Phase 3).
- [ ] **Phase 5: Adapter Packages, Build, Docs, Migration, Publish** — Monorepo packaging, dual ESM+CJS verification, migration guide, v1.0.0 to npm.

---

## Phase Details

### Phase 1: Metadata & Decorator Skeleton
**Goal**: Establish the foundational decorator surface, per-class metadata model, validation contract, and pluggable IoC interface — all decoupled from HTTP — built on legacy `experimentalDecorators` + `reflect-metadata` so constructor/parameter type metadata is available to the runtime. Every other phase consumes this layer. Single-package repo (no monorepo).
**Depends on**: Nothing (foundation).
**Requirements**: BUILD-04, BUILD-05, ROUTE-01, ROUTE-02, ROUTE-03, RES-01, RES-02, RES-03, RES-07, ERR-01, ERR-02, VAL-01, DI-01, DI-02
**Success Criteria** (what must be TRUE):
  1. A user can decorate a class with `@Controller` / `@JsonController` and methods with `@Get`/`@Post`/`@Put`/`@Patch`/`@Delete`/`@Head`/`@All`/`@Method`, then call `MetadataBuilder.build([Class])` and observe a fully-resolved metadata tree (controllers → actions → input declarations → response shapers) with zero Express imports.
  2. The library compiles and runs only with `experimentalDecorators: true` and `emitDecoratorMetadata: true`; a clear runtime error is thrown when either flag is missing, naming the project and pointing to documentation. Constructor and parameter type metadata is read via `Reflect.getMetadata("design:paramtypes", ...)` and surfaced in the metadata tree.
  3. The library exports a `HttpError` base class with `status`, `message`, `cause`, and `toJSON()`, plus 4xx/5xx subclasses (`BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `MethodNotAllowedError`, `ConflictError`, `InternalServerError`, …) usable independently of any adapter.
  4. The library exposes a `useContainer(IocAdapter)` hook with a default lazy-`new` WeakMap-cached fallback; the IoC layer remains pluggable — no specific container (tsyringe, Awilix, TypeDI, etc.) is imported by core, and a grep test asserts core has zero container-library imports. Consumers can wire any container via the hook.
  5. Public type exports include the type-only `StandardSchemaV1` re-export and the `Action` value shape — no schema library is imported by core at runtime. The package builds and publishes from a single root (`src/` → `dist/`) with no workspaces, pnpm/yarn workspace protocol, or sub-packages.
**Plans**: 6 plans
  - [x] 01-01-PLAN.md — Doc rewrite: align REQUIREMENTS.md BUILD-04/05/06 + STATE.md key decisions with Direction Override (Wave 0)
  - [x] 01-02-PLAN.md — Repo bootstrap (package.json, tsconfig, vitest) + storage WeakMaps + public type-only types (Wave 1)
  - [x] 01-03-PLAN.md — Decorators (controller/route/response) + MetadataBuilder + runtime guard (Wave 2)
  - [x] 01-04-PLAN.md — HttpError base + 4xx/5xx subclasses (Wave 2)
  - [x] 01-05-PLAN.md — IocAdapter contract + DefaultContainer + useContainer/resetContainer (Wave 2)
  - [x] 01-06-PLAN.md — Public barrel src/index.ts + grep-gate + end-to-end SC integration tests (Wave 3)

### Phase 2: Runtime + Express Adapter (Happy Path)
**Goal**: Deliver the smallest end-to-end vertical slice that proves the layered design — a real Express v5 app serving routes, validating input via Standard Schema, and propagating async errors natively to one library-installed error middleware.
**Depends on**: Phase 1.
**Requirements**: BUILD-03, ROUTE-04, ROUTE-05, INPUT-01, INPUT-02, INPUT-03, ERR-03, ERR-05, RES-08, API-01, API-02, API-03
**Success Criteria** (what must be TRUE):
  1. A user can call `useExpressControllers(app, { controllers, routePrefix, validation, ... })` or `createExpressServer(options)` and observe HTTP requests routed via one `express.Router()` per controller; multiple controllers, controller inheritance, and `routePrefix` all behave as documented.
  2. A handler that declares `{ params, query, body, headers }` schemas (Zod, Valibot, or ArkType) receives a single typed destructured object with parsed values; validation failure on any slot produces a `BadRequestError` (HTTP 400) with field-level error details and a `source` field naming the controller/method.
  3. Throwing or rejecting a promise inside an async handler reaches the library's single Express error middleware exactly once (no double-wrap, no "headers already sent"); v5 native async propagation is used — no try/catch wrappers around handlers.
  4. Decorator path strings using legacy v4 patterns (`*`, `:id?`, `:id(\d+)`) throw an actionable error at registration time naming the controller, method, and a v8 fix suggestion; valid v8 patterns work end-to-end.
  5. A handler returning a plain object/primitive serializes to JSON (matching `@JsonController`); a handler returning a Node stream or async iterable is piped to the response.
**Plans**: 7 plans
  - [x] 02-01-PLAN.md — Foundation: widen ValidationIssue, install Phase 2 devDeps + express peer, scaffold src/adapter/ + tests/adapter/ fixtures (Wave 1)
  - [x] 02-02-PLAN.md — router-build.ts: composePath (D-04) + detectV4Pattern (D-05) + buildControllerRouter (ROUTE-05) (Wave 2)
  - [x] 02-03-PLAN.md — validation.ts: 4-slot Standard Schema runner, isStandardSchema, renderPath, BadRequestError aggregation (INPUT-01/02/03) (Wave 2)
  - [x] 02-04-PLAN.md — response.ts: applyResponseHandlers + writeResponse (JSON/string/Buffer/stream/async-iterable/null/undefined, RES-08) (Wave 2)
  - [x] 02-05-PLAN.md — handler-wrapper.ts + error-middleware.ts: D-16 source attribution + D-14/D-15/D-17/D-18 single error middleware (ERR-03, ERR-05) (Wave 2)
  - [x] 02-06-PLAN.md — boot.ts: useExpressControllers + createExpressServer wiring; public barrel updates (API-01, API-02, API-03, BUILD-03) (Wave 3)
  - [x] 02-07-PLAN.md — End-to-end SC acceptance tests + structural grep gates (all 5 ROADMAP SC, BUILD-03 enforcement) (Wave 4)
**UI hint**: no

### Phase 3: Middleware, Interceptors, Auth, Error Handling
**Goal**: Layer orthogonal extensibility — middleware, interceptors, authorization, and user error handlers — onto the Phase 2 pipeline with deterministic, documented ordering.
**Depends on**: Phase 2. **Parallelizable** with Phase 4.
**Requirements**: MW-01, MW-02, MW-03, MW-04, AUTH-01, AUTH-02, AUTH-03, ERR-04
**Success Criteria** (what must be TRUE):
  1. A user can attach Express middleware (function or class form) via `@UseBefore(...)`/`@UseAfter(...)` at controller and method level; execution order is deterministic top-to-bottom (controller-level before method-level for `before`; reversed for `after`) and proven by a fixture test.
  2. A user can declare a global or scoped `@Middleware({ type: 'before' | 'after' })` class implementing `ExpressMiddlewareInterface` and have it run in the documented order across the request pipeline.
  3. A user can declare an `@Interceptor()` class and attach it via `@UseInterceptor(...)` to transform a handler's return value before serialization.
  4. A user can mark routes `@Authorized(roles?)` and register global `authorizationChecker` and `currentUserChecker` functions; failed checks return 401 (no checker / no user) or 403 (forbidden); the resolved current user is exposed via the input declaration.
  5. A user-defined `@Middleware({ type: 'after' })` error handler runs ahead of the library default error middleware and can format/replace the HTTP response.
**Plans**: 5 plans
  - [x] 03-01-PLAN.md — Decorator + storage layer: 6 new decorators, type extensions, public interfaces (Wave 1)
  - [x] 03-02-PLAN.md — MetadataBuilder extension: fold useBefore/useAfter/interceptors/authorized into resolved metadata with inheritance semantics (Wave 2)
  - [ ] 03-03-PLAN.md — Adapter helpers: middleware.ts (form detection + DI), interceptor.ts (for/await chain), auth.ts (gate + currentUser cache), validation.ts currentUser slot (Wave 2)
  - [ ] 03-04-PLAN.md — Wiring: response.ts next() per branch, error-middleware arity helper, router-build handler array per D-01, boot.ts global mounting + public barrel (Wave 3)
  - [ ] 03-05-PLAN.md — Integration tests: SC#1-#5 + ordering fixture + structural grep gates (Wave 4)

### Phase 4: Uploads, Cookies, Sessions, Render, Request Context
**Goal**: Complete v1 feature parity by adding file upload, cookies, sessions, render/redirect/location, CORS, glob loading, route-table dump, and the AsyncLocalStorage-backed request context — each feature small and independently verifiable.
**Depends on**: Phase 2. **Parallelizable** with Phase 3.
**Requirements**: INPUT-04, INPUT-05, RES-04, RES-05, RES-06, UTIL-01, UTIL-02, UTIL-03, UTIL-04, NEW-01, NEW-02, API-04
**Success Criteria** (what must be TRUE):
  1. A user can declare cookie and session inputs via the input declaration object (using `cookie` and `express-session`) and receive parsed values in the destructured handler argument.
  2. A user can declare file uploads via `@UploadedFile(field, options)` / `@UploadedFiles(field, options)` on the input declaration with multer as an optional peer; explicit `limits` and `fileFilter` are required (registration throws if absent).
  3. A handler decorated with `@Redirect(template)` returning a target string issues a 3xx redirect; `@Location(template)` sets the Location header; `@Render(template)` renders an Express view-engine template with the returned data.
  4. A user can boot the app with `cors: true | CorsOptions` (lazy-loaded `cors` package) and with `controllers: ['src/controllers/**/*.ts']` glob loading via `tinyglobby`; `printRoutes: true` logs a route table at boot.
  5. From anywhere in the request call chain (handler, middleware, interceptor, downstream service) `getRequestContext()` returns `{ req, res, requestId }` with `requestId` sourced from `X-Request-Id` or a generated UUID — verified by an ALS smoke test that crosses await boundaries.
**Plans**: TBD

### Phase 5: Adapter Packages, Build, Docs, Migration, Publish
**Goal**: Ship a publishable v1.0.0: monorepo build pipeline, dual ESM+CJS distribution verified by `attw`/`publint`, CI matrix, TypeDI adapter, migration guide, and a runnable README — all on npm under provenance.
**Depends on**: Phases 1-4 complete (full surface stable).
**Requirements**: BUILD-01, BUILD-02, BUILD-06, BUILD-07, BUILD-08, BUILD-09, DI-03, VAL-02, DOCS-01, DOCS-02, DOCS-03, DOCS-04
**Success Criteria** (what must be TRUE):
  1. The monorepo (pnpm workspaces, `packages/core` + `packages/typedi`) builds dual ESM+CJS via `tshy` against TypeScript 5.8+; `prepublishOnly` runs `attw` and `publint` green; CI matrix passes across Node 20/22/24, and Vitest 3 suites pass under both `pool: 'forks'` and `pool: 'threads'`.
  2. A new user can copy the README's opening 30-line Zod + Express 5 example (with the required tsconfig snippet) into a fresh project and run it successfully against the published package.
  3. A migration guide documents every breaking change vs `routing-controllers` v0.11 with before/after code, leading with the parameter-decorator → method-level input declaration change; README documents Zod, Valibot, and ArkType usage with no adapter code.
  4. A separate `@scope/express-controllers-typedi` adapter package is published alongside core and demonstrably wires TypeDI into `useContainer(IocAdapter)` in an example app.
  5. v1.0.0 is published to npm with provenance, a Keep-a-Changelog `CHANGELOG.md` driven by Changesets, generated TypeDoc API reference, and Biome 2 (with documented ESLint 9 + `@typescript-eslint` 8 fallback) enforced in CI.
**Plans**: TBD

---

## Parallelization Plan

```
Phase 1 ──► Phase 2 ──┬──► Phase 3 ──┐
                       │               ├──► Phase 5
                       └──► Phase 4 ──┘
```

- **Sequential**: 1 → 2 → (3 ∥ 4) → 5
- **Parallel window**: Phases 3 and 4 share no source files of consequence; both consume Phase 2's runtime + adapter pipeline. The executor MAY run them concurrently after Phase 2 completes.
- **Phase 5** is strictly last: publish-time concerns (`attw`/`publint`, peer-dep ranges, dual-package, CI matrix, docs) require the full surface stable.

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Metadata & Decorator Skeleton | 6/6 | Complete | 2026-05-09 |
| 2. Runtime + Express Adapter | 0/0 | Not started | — |
| 3. Middleware, Interceptors, Auth | 2/5 | In Progress|  |
| 4. Uploads, Cookies, Sessions, Render, Context | 0/0 | Not started | — |
| 5. Adapter Packages, Build, Docs, Publish | 0/0 | Not started | — |

---

## Coverage Summary

- **Total v1 requirements:** 58
- **Mapped:** 58 / 58 (100%)
- **Orphans:** 0
- **Duplicates:** 0
- **v1.x and Out-of-Scope items:** intentionally unmapped per scope decision.

See [REQUIREMENTS.md](./REQUIREMENTS.md#traceability) for the full REQ-ID → Phase table.

---

## Research Flags

Phases pre-flagged for `/gsd-research-phase` during planning (per research/SUMMARY.md §"Research Flags"):
- **Phase 1** — exact Stage 3 decorator generic signatures (return-type inference, path-template-literal `params` inference, destructured handler input typing). Reference: hono+zod-openapi, @ts-api-kit, oRPC, `tsd`/`expect-type` patterns.
- **Phase 2** — Express v5 native async error semantics: precise interaction between library error middleware, user `@Middleware({ type: 'after' })` error handlers, and Express's default 4-arg handler chain.
- **Phase 5** — dual-package + Standard Schema ergonomics under real bundlers (webpack/vite/rollup smoke matrix); verify the (deferred-to-v1.x) class-validator quarantine pattern doesn't leak `reflect-metadata` into core consumer bundles.

Phases with well-documented standard patterns (skip research-phase): Phase 3, Phase 4.
