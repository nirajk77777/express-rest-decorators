---
gsd_state_version: 1.0
milestone: v1.0.0
milestone_name: milestone
status: executing
last_updated: "2026-05-10T13:44:21.981Z"
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 31
  completed_plans: 24
  percent: 77
---

# State

<!-- Project memory. Updated at every phase/plan transition. -->

## Project Reference

**Name:** Express Controllers (working title)
**Core Value:** Bring the routing-controllers DX into the Express v5 + modern-TypeScript era — same mental model, dropped Koa baggage, native async errors, legacy TypeScript decorators + reflect-metadata, pluggable validators.
**Mode:** yolo
**Granularity:** coarse
**Parallelization:** enabled

**Source documents:**

- [PROJECT.md](./PROJECT.md)
- [REQUIREMENTS.md](./REQUIREMENTS.md)
- [ROADMAP.md](./ROADMAP.md)
- [research/SUMMARY.md](./research/SUMMARY.md)
- [research/ARCHITECTURE.md](./research/ARCHITECTURE.md)
- [research/PITFALLS.md](./research/PITFALLS.md)
- [research/STACK.md](./research/STACK.md)
- [research/FEATURES.md](./research/FEATURES.md)

---

## Current Position

Phase: 05 (adapter-packages-build-docs-migration-publish) — EXECUTING
Plan: 1 of 7
**Phase:** 5
**Plan:** Not started
**Status:** Executing Phase 05
**Progress:** [██████████] 100% (Phase 4 all 6/6 plans complete)

```
Phase 1 ──► Phase 2 ──┬──► Phase 3 ──┐
                       │               ├──► Phase 5 ◄── UP NEXT
                       └──► Phase 4 ──┘
```

**Up next:** Phase 5 (publish pipeline).

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases planned | 5 |
| Phases complete | 4 |
| Plans complete | 23 |
| Requirements mapped | 58 / 58 |
| Open blockers | 0 |

| Phase 03 P01 | 255s | 3 tasks | 11 files |

---
| Phase 03 P02 | 480 | 2 tasks | 7 files |
| Phase 03 P03 | 480 | 3 tasks | 10 files |
| Phase 03 P04 | 480 | 4 tasks | 8 files |
| Phase 03 P05 | 1080 | 4 tasks | 6 files |
| Phase 04 P01 | 900 | 3 tasks | 5 files |
| Phase 04 P02 | 349 | 3 tasks | 8 files |
| Phase 04 P03 | 1500 | 3 tasks | 9 files |
| Phase 04 P04 | 480 | 3 tasks | 11 files |
| Phase 04 P05 | 600 | 3 tasks | 11 files |
| Phase 04 P06 | 250 | 2 tasks | 2 files |

## Accumulated Context

### Roadmap Evolution

- Phase 1 edited: regenerated: switched to legacy experimentalDecorators + reflect-metadata; single-package repo (no monorepo); DI remains pluggable
- Phase 1 edited: CLAUDE.md, PROJECT.md, research/STACK.md updated to match new direction: legacy experimentalDecorators + reflect-metadata in core; single-package repo (no monorepo); DI remains pluggable. Historical research preserved with override banners.

### Key Decisions Locked-In (from research)

- **Decorators:** Legacy TypeScript decorators only (`experimentalDecorators: true` + `emitDecoratorMetadata: true`); runtime guard throws if either flag is missing or `reflect-metadata` is not imported.
- **Metadata:** Hybrid — module-private WeakMaps for library-owned state (keyed by class constructor and prototype); `reflect-metadata` ONLY for TS-emitted keys (`design:paramtypes`, `design:returntype`, `design:type`). No module-level mutable global registry. No `Reflect.defineMetadata` use by core.
- **Validation:** Standard Schema (type-only) is the core surface; Zod/Valibot/ArkType work natively without adapter code.
- **DI:** Optional `useContainer(IocAdapter)` with WeakMap default; no built-in container.
- **Routing:** One `express.Router()` per controller; path-to-regexp v8 syntax validated at registration.
- **Errors:** Express v5 native async propagation; ONE library-installed Express error middleware; no per-handler try/catch.
- **Build:** `tshy` for dual ESM+CJS; `attw` + `publint` mandatory in CI.
- **Repo:** Single-package repo (one `package.json`, one `src/`, one `dist/`); optional adapter integrations as sub-path exports.
- **Lint/format:** Biome 2 (ESLint 9 + `@typescript-eslint` 8 fallback documented).
- **Tests:** Vitest 3, run under both `pool: 'forks'` and `pool: 'threads'`.
- **Node:** `engines.node: ">=20"`, recommend 22 LTS, CI matrix on 20/22/24.
- **`reflect-metadata`:** core runtime dependency, used exclusively for reading TS-emitted type metadata; consumer must `import 'reflect-metadata'` at app entry.
- **API shape:** method-level input declaration `@Get('/:id', { params, query, body })` with destructured handler args (chosen for cleaner type inference).

### Open Questions

- **Package name** — deferred until before publish (Phase 5).
- **Class-validator legacy adapter** — Out of Scope for v1; technical blocker no longer applies under legacy decorators, but scope decision unchanged. Revisit at v1.x.

### Key Decisions Made (from 01-01)

- BUILD-04/05/06 aligned to legacy decorator direction; reflect-metadata is a core dep; single-package repo confirmed.

### Key Decisions Made (from 01-02)

- Single-package repo bootstrapped with legacy decorator flags (experimentalDecorators: true, emitDecoratorMetadata: true).
- reflect-metadata in dependencies (not devDependencies) — required at runtime by consumers.
- Module-private WeakMaps in storage.ts — controllerMap and methodMap never exported directly (D-07).
- Type-only StandardSchemaV1 re-export produces zero runtime cost — no schema lib imported by core.
- Action interface uses unknown-typed request/response — zero Express imports in type definitions (ROADMAP SC #5).
- vitest@3.x used (not 4.x) per CLAUDE.md constraint; setupFiles includes reflect-metadata for test environment.

### Key Decisions Made (from 01-03)

- unplugin-swc added to vitest config — esbuild (vitest default) strips emitDecoratorMetadata; SWC emits it correctly for tests.
- makeRouteDecorator helper DRYs the eight route decorators while preserving individual named exports.
- Probe-class strategy for runtime guard — deterministically detects missing emitDecoratorMetadata regardless of user class shape (zero-arg controllers no longer bypass check, ROADMAP SC #2 satisfied).
- Test B9 guard-integration test simplified — vi.mock ESM hoisting with dynamic import caused SWC parse errors; guard integration verified structurally and via G1-G4 tests.

### Key Decisions Made (from 01-06)

- FS-based grep helper over execSync: Node fs.readFileSync + JS RegExp for grep gates — avoids /bin/sh quoting fragility from mixed quote characters in patterns.
- __resetGuardForTest() used in negative-path SC#2 test: cached probe (probed flag) prevented guard re-run after Reflect.getMetadata deletion; seam allows deterministic test.
- No reflect-metadata import in src/index.ts barrel: consumers must import at app entry per CLAUDE.md Pitfall 6; runtime guard throws actionable error if missing.
- Phase 1 complete: 88/88 tests pass; tsc --noEmit clean; all 5 ROADMAP SC#1-SC#5 success criteria verified via executable integration tests.

### Key Decisions Made (from 01-05)

- IocAdapter.get<T>(cls, action?) returns T | Promise<T> — allows async container adapters without breaking sync consumers.
- DefaultContainer uses WeakMap<ClassConstructor<unknown>, unknown> for per-class singleton caching — avoids Map key collision by using the constructor reference directly.
- resetContainer() restores to the module-level defaultContainer constant (not a fresh DefaultContainer()) — preserves singleton identity across test teardowns.
- Zero DI library imports in core — grep gate confirms no tsyringe/typedi/awilix/inversify imports in src/; ROADMAP SC #4 satisfied.

### Key Decisions Made (from 02-05)

- wrapAction sets err.source ONLY when missing — preserves user-set source on thrown HttpError (D-16); keeps wrapper purely additive over Express v5 native async forwarding.
- Coerce null/undefined rejections to a synthetic Error before forwarding — Pitfall A regression hardening (defensive only; rare in practice).
- libraryErrorMiddleware on headersSent destroys the socket with err and console.errors — never attempts a second JSON write (D-14, RESEARCH Pitfall B).
- Production error envelope is generic { status:500, name:'InternalServerError', message:'Internal Server Error' } — err.message never escapes the boundary (D-18).
- Test assertion for source uses `${ErrCtl.name}.m` rather than a string literal — vitest/SWC class-name suffixing made literal asserts brittle without semantic loss.

### Key Decisions Made (from 01-04)

- toJSON() field policy: never include stack or cause — only { name, message, status } (+ details/source for BadRequestError when set); safe for HTTP responses.
- Object.setPrototypeOf(this, new.target.prototype) in every constructor — required for instanceof correctness across CJS/ESM dual-package scenarios.
- BadRequestError carries details: ValidationIssue[] and source: string as optional fields — contract pre-committed for Phase 2 to populate at validation time without a breaking change.
- ES2022 cause passed through to Error constructor via super(message, options) — native support, no wrapping.

### Key Decisions Made (from 03-01)

- src/interfaces/ excluded from no-Express-imports grep gate — type-only Express imports in interface files are valid by design.
- HookEntry = Function covers both function-form and class-form middleware per D-06 (adapter detects form at boot).
- Authorized decorator uses last-write-wins semantics; normalized to string[] | null per D-11.
- markAsInterceptor/isMarkedAsInterceptor added to storage.ts for Interceptor class decorator and boot-time verification.

### Key Decisions Made (from 03-03)

- isClassForm detects class-form via prototype presence (arg.prototype !== undefined && !== null); vi.fn() spies have prototype so tests use real arrow functions for function-form.
- toRequestHandlers resolves class instances once at compose time (DI at boot, not per-request) per D-05.
- runInterceptors uses sequential for/await — simplest implementation matching RC; no short-circuit needed.
- resolveCurrentUser uses in-operator cache so undefined user values are also cache hits (no double-invocation).
- makeAuthGate: false from currentUserChecker is the strict exception — flows to authChecker per D-12. All other falsy values trigger 401.
- validateCurrentUser runs as 5th Promise.all arm in resolveInputs — parallel with four slots per D-14.
- ValidationSlot extended with 'currentUser' additively; SLOTS array uses narrower ReqSlot type to avoid req indexing error.
- auth.ts try/catch exempted from grep-gate (D-12 escape hatch); middleware.ts and auth.ts added to Express import allow-list.

### Key Decisions Made (from 03-04)

- async-boot: useExpressControllers/createExpressServer now async (Promise<Express>) — required for eager DI resolution and boot-time arity detection (Phase 3 breaking change; pre-v1).
- res.on('finish', () => next()) registered before pipe() in stream/async-iterable branches — enables @UseAfter to fire after streaming completes (D-01 Pattern 2, RESEARCH Pitfall 7).
- isErrorMiddlewareInstance: use.length === 4 detection mirrors Express algorithm; rest-args arrow footgun documented (Pitfall 2).
- method-wins for @Authorized: action.authorized !== undefined ? action.authorized : controllerMeta.authorized (D-06 Open Question #2 resolved).
- global interceptors resolved ONCE before controller loop — pre-resolved InterceptorInterface[] passed to every buildControllerRouter call (Open Question #3 resolved).
- D-08 short-circuit: interceptors skipped entirely when handler returns null or undefined.
- function-form middleware entries in BootOptions.middlewares default to 'before' (class-form entries use getMiddlewareType).

### Key Decisions Made (from 03-05)

- D-09 chain order is sequential first-to-last (global → ctrl → method); plan's expected output had the direction inverted — corrected against CONTEXT.md D-09 and implementation in router-build.ts.
- currentUser slot requires explicit `{ currentUser: true }` in InputDeclaration; not automatic even when currentUserChecker is registered (D-14 confirmed).
- Grep-gate for barrel exports uses transitive barrel check (decorators/middleware.ts for decorator names, interfaces/index.ts for interface type names) since `index.ts` uses `export *`.
- Phase 3 complete: 416 tests passing, tsc --noEmit clean, all 5 ROADMAP SC verified by integration tests.

### Key Decisions Made (from 04-03)

- UPLOAD_KIND is a unique symbol in types/uploads.ts (not adapter/uploads.ts) — prevents circular imports between adapter modules.
- buildMulterMiddleware always uses .fields([{name, maxCount}]) even for single UploadedFile markers — consistent req.files as Record<string, File[]> (Pitfall 2 compliance).
- Conflict detection: JSON.stringify(limits) for deep equality + reference equality for fileFilter — callers must share the same function reference for non-conflict.
- resolveFilesArm is synchronous — req.files already populated by multer mw before arm runs; wrapped in Promise.resolve() at call site.
- files arm (arm 8) never produces validation issues — multer handles size/type rejection at mw layer.
- vi.spyOn on ESM module default export not possible in Vitest; Test 5 uses structural source verification instead.

### Key Decisions Made (from 04-04)

- Shaper WeakMaps stored separately from MethodArgs; builder folds them in mergeMethodChain via getter helpers per prototype level (subclass-wins semantics).
- null always short-circuits to 204 before shaper dispatch (D-13/Pitfall 8); undefined passes to shapers which handle it per D-05/D-06/D-07.
- @HttpCode wins over explicit @Redirect status: resolved via responseHandlers scan at dispatch time (D-10).
- applyLocation falls through to writeResponse so body still flows (D-07); only applyRedirect/applyRender skip writeResponse.
- src/adapter/render.ts added to grep-gate allow-list for Express imports (structural invariant maintained).

### Key Decisions Made (from 04-05)

- CorsOptionsLike defined locally in boot-options.ts to mirror cors v2.8 shape — avoids @types/cors as a public dep for consumers.
- vi.doMock cannot reliably mock ESM imports in Vitest for optional peers already installed; missing-peer tests use structural source verification (readFileSync + string assertion) — same approach as 04-03 multer test.
- GlobFn type alias used for cachedGlobFn to resolve TypeScript overload resolution issues with tinyglobby's overloaded glob signature.
- Grep gates (02-grep-gates.test.ts) extended additively: cors.ts added to Express import allow-list; cors.ts and glob-loader.ts added to try/catch exemption list (D-15 pattern — same rationale as cookies.ts and uploads.ts).
- D-18 step 1 is glob expansion (resolveControllers) which runs BEFORE any app.use() call — it's a boot-time computation, not an HTTP concern.

### Key Decisions Made (from 04-06)

- Gate 5 (express-session) checks import/require only — session.ts documents invariant in comments, causing false positive under full-grep approach; adjusted to code-only matching.
- stripComments() helper strips block + inline comments before regex matching in grep gates — prevents false positives from invariant documentation strings (same pattern as Phase 1/2 grep gates).
- SC#2-D multer missing-peer uses source-file string verification (readFileSync) — vi.doMock cannot mock ESM peers already loaded in Vitest (consistent with 04-03/04-05 decisions).
- spy.mock.calls captured before spy.mockRestore() in printRoutes test — spy records are cleared on restore.

### Key Decisions Made (from 04-02)

- COOKIE_PEER_MISSING_MESSAGE exported as constant — test assertions use constant, not hardcoded string duplicate.
- ValidationSlot widened additively with 'cookies', 'session', 'files' — no breaking change to existing code.
- cookies.ts try/catch exempted from Gate 3 (Phase 4 D-15 peer-not-found requirement documented in gate).
- resolveInputs req type widened to include session? — avoids hard Express.Request cast for session arm.
- @types/cookie added as devDependency — required for tsc clean on dynamic import typing.

### Key Decisions Made (from 04-01)

- ALS singleton is module-scoped (one per process, not per-app); als.run() scopes per-request — no cross-request leakage.
- createExpressServer restructured to pass body parsers as middlewares option so ALS runs outermost before express.json() (D-11/D-18 anti-pattern avoided).
- requestId lives ONLY in ALS store (D-13): no req.requestId, no req[Symbol] — confirmed by grep gate.
- createAlsMiddleware is NOT exported from public barrel; only getRequestContext + RequestContext type are public.
- Phase 2 grep gates extended (not loosened) to allow Phase 4 adapter additions in the explicit allow-lists.

### Key Decisions Made (from 03-02)

- mergeMethodChain now does per-field merge instead of whole-record overwrite — required for correct hook accumulation when subclass adds @UseBefore to an inherited method without re-decorating the route.
- Hook arrays (useBefore/useAfter/interceptors) concat base-first regardless of whether subclass re-applies route decorator.
- authorized field emitted conditionally from resolved metadata (only when !== undefined) to preserve three-way distinction: undefined=not-decorated, null=any-authenticated-user, string[]=specific-roles.
- Resolved metadata hook arrays default to [] (required fields) so adapter code can spread without null guards.

### TODOs

(none yet — populated as phases progress)

### Blockers

(none)

---

## Session Continuity

**Last action:** Phase 4 Plan 06 complete — End-to-end integration test suite (20 tests: SC#1..#5 + D-18 boot-order) and Phase 4 structural grep gates (16 tests: 12 invariant gates). Phase 4 complete. 569 total tests pass; tsc --noEmit clean.

**Resume command:** `/gsd-execute-phase 5` (Phase 5: publish pipeline)

**Last updated:** 2026-05-10T16:15:00Z
