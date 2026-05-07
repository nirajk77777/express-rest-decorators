# Project Research Summary

**Project:** Express Controllers (working title) — modernized successor to `routing-controllers` for Express v5
**Domain:** Open-source TypeScript decorator-based REST controller library (npm package)
**Researched:** 2026-05-07
**Confidence:** HIGH

## Executive Summary

This is a 2026 greenfield rewrite of `routing-controllers` targeting **Express v5**, **TC39 Stage 3 decorators**, and **pluggable validation via Standard Schema**. All four research streams converge unambiguously on the same technical posture: no `reflect-metadata` in core, no module-level mutable metadata singleton, no hard-coded validator, and an optional `useContainer()`-style DI hook rather than a built-in container. The original library's three-layer design (decorators → metadata → driver/runtime) is sound and worth preserving — only the implementations of each layer need modernizing, not the architecture.

The single biggest forced-design-change is that **Stage 3 has no parameter decorators**. The entire `@Body() body`, `@Param('id') id`, `@QueryParam('q') q` surface from the original library cannot exist in this form. Every modern decorator-based library that has crossed this bridge (hono+zod-openapi, ts-rest, @ts-api-kit, oRPC) has converged on the same answer: a single method-level decorator (`@Get('/:id', { params, query, body })`) that declares all input shape at the route, with the handler receiving one destructured `{ params, query, body, req, res }` object. This is the recommended primary API and is the #1 entry in the migration guide.

The dominant risk is consumer/library decorator-mode mismatch silently miscompiling — many existing TS codebases still have `experimentalDecorators: true` for TypeORM/NestJS-pre-11/class-validator. Mitigation is a runtime guard in every decorator that loudly errors when `context` doesn't match Stage 3 shape, plus a required tsconfig snippet at the top of the README. Secondary risks (path-to-regexp v8 strictness, double-wrap of native async errors, dual-package hazard, global registry test pollution) are all well-understood and addressed by Phase 1 architectural decisions documented in ARCHITECTURE.md.

## Key Findings

### Recommended Stack

A `tsc`-based dual-build pipeline is non-negotiable for a decorator-centric library — esbuild/swc/tsdown have known Stage 3 gaps as of March 2026. Standard Schema is the right primary validation surface because Zod, Valibot, and ArkType all natively conform, eliminating per-validator adapter code.

**Core technologies:**
- **TypeScript ^5.8** (range `>=5.2 <7`) — Stage 3 decorators stable since 5.0; `Symbol.metadata` runtime emit since 5.2; avoid TS 6/7 turbulence
- **Node.js >=20** (recommend 22 LTS) — Express v5 floors at 18; 20 hits EOL April 2026
- **Express v5.1+** (peer) — native async error propagation is the whole reason the modernized library exists
- **tshy ^3** for dual ESM+CJS — uses `tsc` (decorator-safe), auto-manages `exports`
- **Vitest ^3** — ESM-native; project requirement
- **Biome ^2** lint+format (with ESLint 9 + `@typescript-eslint` 8 as documented fallback if a decorator-specific rule gap appears)
- **`@standard-schema/spec`** (type-only) as the primary validator surface; Zod v4 / Valibot v1 / class-validator v0.14 as optional peers
- **No `reflect-metadata`** in core — quarantined inside the optional class-validator legacy adapter package only
- **pnpm 10** for development (workspaces); `publint` + `@arethetypeswrong/cli` mandatory in CI

See [STACK.md](./STACK.md) for the full version matrix, tsconfig, and `package.json` skeleton.

### Expected Features

Feature surface targets parity-minus-Koa with `routing-controllers` v0.11.x, plus a tight set of "new on top" wins. The full inventory (≈40 decorators) was read directly from the reference source.

**Must have for v1 (table stakes):**
- Routing: `@Controller`, `@JsonController`, `@Get`/`@Post`/`@Put`/`@Patch`/`@Delete`/`@Head`/`@All`/`@Method`, `routePrefix`
- Input binding (forced into method-decorator shape — see Architecture): params, query, body, headers, cookies, session, `@Req`/`@Res`
- File uploads (`@UploadedFile`/`@UploadedFiles` via multer peer)
- Response shaping: `@HttpCode`, `@OnNull`/`@OnUndefined`, `@Header`, `@ContentType`, `@Location`, `@Redirect`
- HTTP errors (`HttpError` family + `toJSON`) + default error handler leveraging Express v5 native async propagation
- Middleware (`@UseBefore`/`@UseAfter`/`@Middleware`), interceptors, error middleware
- Auth hooks (`@Authorized`, `@CurrentUser`, `authorizationChecker`, `currentUserChecker`)
- `createParamDecorator` extension API
- Validation/transformation via Standard Schema adapter; ship class-validator adapter for migration users
- DI via optional `IocAdapter`/`useContainer` hook
- Glob loading, CORS option, `useExpressServer` / `createExpressServer` entrypoints
- Dual ESM+CJS, Vitest test suite, migration guide
- **AsyncLocalStorage request context** (`getRequestContext()`) — the one new feature confidently in v1
- Dev-time route table dump (`printRoutes: true`)

**Should have (v1.x differentiators):**
- Valibot adapter (post-v1 to keep surface tight)
- `@SseStream` / async iterable streaming
- Lifecycle hooks (`onAppInit`, `onAppShutdown`)
- Structured logging hook (accept user logger; ALS-bound child)
- `@RateLimit`, `@Timeout` decorators
- `@Render` (parity, low cost)
- OpenAPI emit (zod-driven, separate package)

**Defer or never:**
- WebSocket / GraphQL / microservice decorators — out of scope (different surface area)
- File-based routing — conflicts with decorator paradigm
- ts-rest-style typed RPC client codegen — fundamentally inverts source-of-truth
- Built-in DI container, NestJS-style module system
- Hot reload — `node --watch` already does it
- Koa adapter, Express v4, `experimentalDecorators` mode

See [FEATURES.md](./FEATURES.md) for the full feature matrix and competitor comparison.

### Architecture Approach

Preserve `routing-controllers`' three-layer design (decorator → metadata → driver/runtime) with four targeted modernizations: (1) replace parameter-decorator API with single-object method-decorator pattern (`@Get('/:id', { params, query, body })`), (2) replace `MetadataArgsStorage` global singleton with per-class `Symbol.metadata` storage to avoid HMR/multi-instance/dual-package hazards, (3) replace `class-transformer`+`class-validator` hard-coupling with Standard Schema adapter (zero-runtime-dep type-only contract), (4) drop the per-handler try/catch wrapper in favor of Express v5 native async propagation + a single library-installed error middleware.

**Major components:**
1. **Decorator layer** (`decorators/`) — pure metadata registrars; class & method decorators only (no parameter decorators)
2. **Metadata layer** (`metadata/`) — flat args storage + `MetadataBuilder` that resolves into typed tree (`ControllerMetadata` → `ActionMetadata` → input schemas + uses + interceptors)
3. **Runtime layer** (`runtime/`) — `RoutingControllers` orchestrator, schema-driven `input-resolver` (replaces `ActionParameterHandler`), interceptor chain, response writer; framework-agnostic
4. **Adapter layer** (`adapter/`) — only place that imports Express; one `express.Router()` per controller, library-installed error middleware
5. **Validation layer** (`validation/`) — type-only Standard Schema contract + issue-formatter
6. **Container layer** (`container/`) — `IocAdapter` interface + WeakMap default; ~50 LOC

**Distribution:** monorepo with batteries-included core (`@yourname/express-controllers`) plus optional adapter packages (`@yourname/express-controllers-class-validator`, `@yourname/express-controllers-typedi`). Standard Schema means no per-validator adapter packages are needed — Zod/Valibot/ArkType "just work" through the type-only interface.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the request-lifecycle trace, the four parameter-decorator design options compared, and the full `packages/core/src/` layout.

### Critical Pitfalls

1. **No parameter decorators in Stage 3** (Pitfall #1, MUST address Phase 1) — `@Body()` on a parameter cannot exist. Use method-level `@Get('/:id', { params, query, body })` with destructured object handler signature. Headline migration-guide breaking change.
2. **Decorator-mode mismatch silently miscompiles** (Pitfall #3) — consumer with `experimentalDecorators: true` gets `context is undefined` errors. Every decorator must runtime-check `context.kind` and throw a loud actionable message; required tsconfig snippet in README installation section.
3. **Global `MetadataArgsStorage` singleton breaks under HMR / monorepo / multi-instance / dual-package** (Pitfall #4) — store per-class via `Symbol.metadata`/WeakMap; `createExpressApp({ controllers })` reads from passed classes, never from a global.
4. **Express v5 path-to-regexp v8 strictness** (Pitfall #6) — bare `*`, `:id?`, and `:id(\d+)` all throw at boot. Validate path strings at registration; codemod table in migration guide.
5. **Native async error double-wrap** (Pitfall #8) — Express v5 already forwards rejected promises; porting v4 try/catch + `next(err)` shim causes double-fire and "headers already sent." Library installs ONE Express error middleware; handlers just throw.
6. **Hard-coding the validator** (Pitfall #9) — class-validator requires `experimentalDecorators` and is fundamentally incompatible with Stage 3. Standard Schema adapter from day 1; zero schema libs in core.

See [PITFALLS.md](./PITFALLS.md) for all 17 pitfalls, integration gotchas, performance traps, security mistakes, and the "looks done but isn't" checklist.

## Contradictions Between Research and PROJECT.md

These items require explicit resolution during the requirements phase before roadmap finalization.

| # | PROJECT.md says | Research says | Resolution path |
|---|------------------|----------------|------------------|
| 1 | "Pluggable validators (zod, valibot, **class-validator**)" | class-validator requires `experimentalDecorators: true` and is structurally incompatible with the project's Stage 3 stance. It can be supported only as an isolated optional adapter package that consumers opt into knowing they pull legacy decorator runtime back in for *that adapter's* schemas. | Confirm in requirements: ship class-validator adapter with a loud "requires `reflect-metadata`; isolated to migration users only" caveat. Standard Schema (zod/valibot/arktype) is the primary path. |
| 2 | "Dual ESM + CJS distribution" | Pitfalls research suggests reconsidering ESM-only given the dual-package hazard class is severe and modest-adoption greenfield in 2026 + Node 20+ peer + Vitest is a defensible ESM-only stance. | Decide explicitly in requirements. Recommendation: **keep dual** but make the no-global-state architectural decision (Pitfall #4) so the dual-instance hazard's worst symptom is neutralized, and require `attw` + `publint` green in CI. |
| 3 | "API: mostly compatible, breaking where it helps" | Stage 3 *forces* breaking the most-used decorators (`@Body`, `@Param`, `@QueryParam`, `@Req`, `@Res`, `@CurrentUser`). The library has ~zero choice here — these become method-decorator options or destructured-input fields. | This is the **#1 migration-guide entry** and the headline breaking change in the README. Frame as "forced by Stage 3, not chosen — and the entire ecosystem (hono, ts-rest, @ts-api-kit, oRPC) has converged on the same answer." |
| 4 | "DI: required at all?" (open question) | Resolved: optional `useContainer(IocAdapter)` adapter with sensible default. ~50 LOC, supports both no-DI users (zero config) and DI-heavy users (one line of `useContainer(typediAdapter)`). Stage 3 has no parameter decorators, so auto-injection by type is structurally impossible without `reflect-metadata` — another reason DI stays out of core. | Mark this open question **resolved** in PROJECT.md after requirements review. |

## Implications for Roadmap

Based on combined research, the canonical 5-phase decomposition (also derived independently in ARCHITECTURE.md §8 and corroborated by PITFALLS.md's pitfall-to-phase mapping):

### Phase 1: Metadata & Decorator Skeleton (Foundation)
**Rationale:** Every other phase consumes this. Pure logic, easy to test, sets the public API shape early. Most critical pitfalls (#1, #2, #3, #4, #5, #9, #10, #15) are *prevented* here — getting the API/architecture wrong here means a v2 rewrite.
**Delivers:** `MetadataArgsStorage` (per-class via `Symbol.metadata`, no module-level mutable global), `MetadataBuilder` + resolved metadata classes, all Stage 3 class+method decorators (`@Controller`, `@Get` family with `{ params, query, body, headers, response }` options, `@HttpCode`, `@Header`, `@OnUndefined`, etc.), `@Inject` accessor decorator, `IocAdapter` contract, decorator-mode runtime guard, public type exports including `StandardSchemaV1` re-export.
**Addresses:** All v1 routing/response decorators; foundational `IocAdapter` interface.
**Avoids:** Parameter-decorator pitfall (#1), reflect-metadata coupling (#2), mode mismatch (#3), global-registry hazards (#4), side-effectful imports (#5), validator coupling (#9), DI surface confusion (#10), type inference loss (#15).
**Deliverable test:** decorate a class, call `MetadataBuilder.build([Class])`, assert resolved tree shape — no Express involved.

### Phase 2: Runtime + Express Adapter (Happy Path)
**Rationale:** Smallest end-to-end vertical slice. Validates the layered design with real HTTP. First contact with Express v5's pitfalls (#6, #7, #8, #17).
**Delivers:** `RoutingControllers` orchestrator, Standard-Schema-driven `input-resolver`, `ExpressAdapter` (one `express.Router()` per controller, route registration, body parsing via `express.json()`/`express.urlencoded()` built-ins), `useExpressControllers()` entrypoint, default WeakMap IoC fallback, library-installed Express error middleware (NO try/catch wrapper).
**Uses:** Express ^5.1, `path-to-regexp` v8 (transitive), Vitest + supertest for end-to-end tests.
**Implements:** Adapter + Runtime layers from ARCHITECTURE.md.
**Avoids:** Path syntax errors (#6), removed-API errors (#7), double-wrap of native async errors (#8), trust-proxy/async-chain breakage (#17), debuggability black holes (#14 baseline — errors carry `cause`).
**Deliverable test:** end-to-end "hit `/users/:id`, get JSON, get correct status code"; throw inside handler → error fires exactly once.

### Phase 3: Middleware, Interceptors, Auth, Error Handling
**Rationale:** Orthogonal additions consuming Phase 2's pipeline. Where middleware-ordering pitfall (#13) bites.
**Delivers:** `@UseBefore`/`@UseAfter`/`@Middleware({ type, priority, global })`, `@UseInterceptor`/`@Interceptor` + interceptor chain, `@Authorized` + `authorizationChecker` + `currentUserChecker`, library error middleware integration with user `@Middleware` error handlers, `useContainer(IocAdapter)` integration across all of the above.
**Avoids:** Middleware ordering surprises (#13 — single documented top-to-bottom rule, deterministic test fixture), debuggability black holes (#14 — every layer wraps with `cause` and a `source` discriminator).

### Phase 4: File Upload, Cookies, Sessions, Render, Edge Cases
**Rationale:** Completes feature parity. Each item small and independent; convenient to bundle. Parallelizable with Phase 3 after Phase 2.
**Delivers:** `@UploadedFile`/`@UploadedFiles` (multer optional peer), `@CookieParam`/`@CookieParams`, `@SessionParam`/`@Session`, `@Render`, `@Redirect`, full Express v5 path-to-regexp v8 quirks audit, `AsyncLocalStorage` `getRequestContext()`, dev-time route table dump.
**Deliverable test:** parity with `routing-controllers` v0.11 Express test suite (relevant subset, written from scratch).

### Phase 5: Adapter Packages, Docs, Migration Guide, Publish
**Rationale:** Public OSS positioning means README, CHANGELOG, semver discipline, and migration guide all matter from v1. Dual-package hazards (#11) and peer-dep range (#12) addressed at publish time.
**Delivers:** `@yourname/express-controllers-class-validator` (migration adapter, isolates `reflect-metadata`), `@yourname/express-controllers-typedi` (DI bridge), README with copy-pasteable runnable example, typedoc API reference, migration guide from `routing-controllers` (with codemod table for the forced API breaks), `attw` + `publint` green in CI, CI matrix across Node 20/22/24 × Express 5.1/5.2 × TS 5.2/5.8, changesets, npm publish setup.
**Deliverable:** v1.0.0 on npm.

### Phase Ordering Rationale

- **Phase 1 first** because the architectural decisions (no parameter decorators, no global registry, no `reflect-metadata`, no validator in core, decorator-mode guard, type-inference-preserving signatures) are the *only* phase where the recovery cost is HIGH. Every other phase's pitfalls are LOW-to-MEDIUM cost to fix in patch/minor releases.
- **Phase 2 before 3/4** because it's the smallest end-to-end slice that proves the layered design under real HTTP. Cheaper to validate one vertical than to build all of Phase 3+4 against an unvalidated runtime.
- **Phases 3 and 4 parallelizable** — both consume Phase 2's pipeline, neither depends on the other.
- **Phase 5 last** because publish-time pitfalls (`attw`/`publint`, peer-dep range, dual-package, CI matrix) need the full surface stable to be meaningful.

### Research Flags

Phases likely needing deeper research (`/gsd-research-phase`) during planning:
- **Phase 1 — Stage 3 decorator type signatures.** ARCHITECTURE.md §2.3 commits to method-level `@Get(path, { params, query, body })` but the *exact* generic signature that preserves return-type inference, infers `params` from path-template literals, and types the destructured handler input is non-trivial. Worth a focused research pass on `tsd`/`expect-type` patterns and the hono-zod-openapi / @ts-api-kit / oRPC reference implementations before writing decorators.
- **Phase 2 — Express v5 native async error semantics in detail.** PITFALLS.md #8 calls out the double-wrap hazard but the precise interaction between library-installed error middleware, user `@Middleware({ type: 'after' })` error handlers, and Express's default 4-arg handler chain deserves a focused trace before implementation.
- **Phase 5 — Dual-package + Standard Schema adapter ergonomics under real bundlers.** Verify ESM-consumer + CJS-consumer + webpack + vite + rollup smoke matrix before publish; verify class-validator adapter `reflect-metadata` quarantine actually keeps it out of core consumers' bundles.

Phases with well-documented standard patterns (skip research-phase):
- **Phase 3** — middleware/interceptor/auth patterns are essentially ports from `routing-controllers` with one new ordering rule documented; no novel territory.
- **Phase 4** — multer/cookies/sessions/render are all wrappers around well-known packages.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | TypeScript 5.x, Express v5, tshy, Vitest, Standard Schema all verified against official docs and current 2026 ecosystem articles. Biome v2 vs ESLint flagged as MEDIUM with explicit fallback documented. |
| Features | HIGH | Reference codebase (`routing-controllers` v0.11.x) read directly; competitor surfaces (NestJS, tsoa, ts-rest, hono, fastify-decorators) well-documented and stable. |
| Architecture | HIGH | `routing-controllers` internals read directly from source; TC39 Stage 3 / Standard Schema verified against multiple current sources; ecosystem convergence on method-decorator pattern (hono+zod-openapi, ts-rest, @ts-api-kit, oRPC) corroborates the recommended fork. |
| Pitfalls | HIGH | Express v5 migration, Stage 3 decorators, dual-package hazard verified against official docs and GitHub issues; routing-controllers-specific pitfalls cross-referenced against its CHANGELOG. |

**Overall confidence:** HIGH

### Gaps to Address

- **Exact `@Get` decorator generic signature** preserving return-type inference + path-template-literal inference for `params` — flagged for Phase 1 research-phase. Reference: hono-zod-openapi / @ts-api-kit / oRPC.
- **class-validator adapter viability under Stage 3** — research says it's structurally awkward (requires `experimentalDecorators` for the consumer's schema classes). Resolve in requirements: ship as opt-in legacy adapter with loud documentation, or drop entirely. Recommendation: ship with caveat; migration users need it.
- **ESM-only vs dual-package final call** — defer to requirements phase. Research recommends keeping dual but neutralizing the dual-instance hazard via no-global-state architecture (Phase 1).
- **Node version floor** — recommended `>=20.0.0` (Node 20 EOL April 2026). May want to set `>=22` for a 2026-shipping library; defer to requirements.
- **Package name** — deferred until before publish per PROJECT.md.
- **OpenAPI emit shape** — confirmed v1.x territory, zod-only first; the shape of the metadata-introspection API third parties would consume needs Phase 5 research.

## Sources

### Primary (HIGH confidence)
- `routing-controllers` v0.11.x source — `/Users/niraj/Desktop/Projects/routing-controllers/src/{RoutingControllers,ActionParameterHandler,container,metadata-builder/*,metadata/*,driver/express/*,decorator/*}.ts`
- [Express v5 release announcement](https://expressjs.com/2024/10/15/v5-release.html) + [Migrating to Express 5](https://expressjs.com/en/guide/migrating-5.html)
- [TypeScript 5.0 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html) + [TypeScript 5.2 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html)
- [TC39 proposal-decorators](https://github.com/tc39/proposal-decorators), [proposal-class-method-parameter-decorators](https://github.com/tc39/proposal-class-method-parameter-decorators), [proposal-decorator-metadata](https://github.com/tc39/proposal-decorator-metadata)
- [Standard Schema spec](https://standardschema.dev/schema)
- [tshy docs](https://isaacs.github.io/tshy/), [zshy](https://github.com/colinhacks/zshy)
- [tsdown target docs](https://tsdown.dev/options/target)
- [Are The Types Wrong? (`attw`)](https://github.com/arethetypeswrong/arethetypeswrong.github.io), [publint](https://publint.dev/)
- [expressjs/express#6606](https://github.com/expressjs/express/issues/6606)
- [routing-controllers CHANGELOG + README](https://github.com/typestack/routing-controllers)

### Secondary (MEDIUM confidence)
- [Hono + zod-openapi](https://hono.dev/examples/hono-openapi), [@ts-api-kit/core](https://jsr.io/@ts-api-kit/core), oRPC, ts-rest
- [Biome v2 vs ESLint vs Oxlint 2026](https://www.pkgpulse.com/guides/biome-vs-eslint-vs-oxlint-2026)
- [Valibot vs Zod v4 2026](https://www.pkgpulse.com/guides/valibot-vs-zod-v4-typescript-validator-2026)
- [tsup vs tsdown vs unbuild 2026](https://www.pkgpulse.com/guides/tsup-vs-tsdown-vs-unbuild-typescript-library-bundling-2026)
- [TypeScript ESM/CJS publishing 2025/2026 (Liran Tal)](https://lirantal.com/blog/typescript-in-2025-with-esm-and-cjs-npm-publishing)
- [Standard Schema explained (OpenReplay)](https://blog.openreplay.com/standard-schema-explained-flexible-validation/)
- NestJS, tsoa, fastify-decorators feature surfaces

### Tertiary (LOW confidence)
- InversifyJS Stage 3 migration discussions — illustrative only

---
*Research completed: 2026-05-07*
*Ready for roadmap: yes*
