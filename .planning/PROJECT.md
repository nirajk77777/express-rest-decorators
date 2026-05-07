# Express Controllers (working title)

## What This Is

An open-source TypeScript library for building structured, decorator-based REST APIs on Express v5 — a modernized, Express-only successor to [`routing-controllers`](https://github.com/typestack/routing-controllers). Targets TypeScript developers who want class-based controllers with modern decorators, native async error handling, and a pluggable validation/DI story. Public OSS package, modest adoption goal.

## Core Value

**Bring the routing-controllers DX into the Express v5 + modern-TypeScript era** — same mental model, dropped Koa baggage, native async errors, TC39 decorators, pluggable validators.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Feature parity with routing-controllers v0.11.x for the Express adapter (controllers, routing decorators, params, middleware, interceptors, error handlers, auth)
- [ ] Drop all Koa support — remove Koa adapter, Koa types, Koa-specific code paths
- [ ] Express v5 as the supported runtime (peer dep), leveraging native async error propagation
- [ ] TC39 Stage 3 decorators (TypeScript 5+ native), no `experimentalDecorators`
- [ ] Standard-Schema-based validation surface (Zod, Valibot, ArkType work natively); no hard-coded validator
- [ ] Optional `useContainer(IocAdapter)` DI hook with default WeakMap fallback (~50 LOC); no built-in container
- [ ] Method-level input declaration API: `@Get('/:id', { params, query, body })` with destructured handler args (forced by Stage 3 — no parameter decorators)
- [ ] Dual ESM + CJS distribution (no-global-state architecture neutralizes the dual-package hazard)
- [ ] Node ≥20 (Symbol.metadata polyfill on 20, native on 22)
- [ ] Vitest test suite written from scratch covering all public APIs
- [ ] Migration guide doc for users coming from `routing-controllers`
- [ ] Modest set of "new features on top" of original (specific list to be defined during requirements phase)
- [ ] Published to npm under a name TBD

### Out of Scope

- Koa support — explicit non-goal; user wants Express-only to keep the package focused
- Express v4 support — moving forward, not maintaining the past
- Hard dependency on a specific validator (class-validator) — replaced by Standard Schema surface
- class-validator support — incompatible with Stage 3 decorators (requires `experimentalDecorators` + `reflect-metadata`); migration users must swap validator at the same time they swap library
- Parameter decorators (`@Param`, `@Body`, `@QueryParam` as parameter decorators) — Stage 3 doesn't support them; replaced by method-level input declaration
- Drop-in API compatibility with routing-controllers — forced break on input binding, plus we'll break other things where it helps
- Codemod tool for migration — migration guide doc only for v1
- Built-in DI container — only an optional `useContainer()` hook
- Aiming to "replace" routing-controllers as THE successor — modest adoption is fine; no need for ecosystem dominance

## Context

- Source of inspiration lives at `/Users/niraj/Desktop/Projects/routing-controllers` (v0.11.3) — current target to study and selectively port from.
- Original supports both Express and Koa via an adapter abstraction; removing Koa simplifies adapter, types, and tests significantly.
- Express v5 brings native async error handling, removed deprecated APIs, stricter routing — affects how the adapter wraps handlers.
- TC39 Stage 3 decorators differ meaningfully from legacy `experimentalDecorators`: no parameter decorators, different metadata story, no `reflect-metadata` for the decorator runtime itself (still possibly useful for type metadata via tools).
- Validation engines vary in API: zod is schema-first, class-validator is decorator-on-class, valibot is functional. Pluggable adapter must accommodate these without leaking specifics.
- Public OSS positioning means README, CHANGELOG, semver discipline, and a real migration guide matter from v1.

## Constraints

- **Tech stack**: TypeScript 5+, Express v5 (peer dep), Node 20+ (target TBD — confirm during requirements)
- **Module format**: Dual ESM + CJS — broad ecosystem compatibility
- **Decorators**: TC39 Stage 3 only — no `experimentalDecorators`
- **Validation**: Pluggable adapters — must not hard-depend on any single schema lib
- **DI**: Pluggable hook at most — no opinionated container in core (pending research)
- **Tests**: Vitest only — no Jest carry-over
- **Compatibility**: Express v5 only — no v4 fallback
- **Audience**: Public OSS, modest adoption — docs/examples/migration guide required for v1

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Express v5 only, drop Koa | User wants focused, modern package; Koa adds adapter/typing burden with little benefit for target audience | — Pending |
| TC39 Stage 3 decorators | Future-proof, native to TS 5; legacy decorators on the way out | — Pending |
| Pluggable validation adapters (zod/valibot/class-validator) | Schema-lib choice is opinionated; adapter pattern lets users pick | — Pending |
| Dual ESM + CJS | Broad compatibility; no-global-state architecture neutralizes hazard | — Pending |
| Vitest, fresh tests | Modern runner, ESM-native; original Jest tests are Koa-coupled and dated | — Pending |
| API: forced break on input binding, opportunistic breaks elsewhere | Stage 3 has no parameter decorators; ecosystem (hono+zod-openapi, ts-rest, ts-api-kit) converged on method-level pattern | — Pending |
| Lean into Express v5 native async errors | Drop legacy try/catch wrappers in adapter | — Pending |
| Standard Schema as validation surface (drop class-validator) | Zod/Valibot/ArkType all implement natively; class-validator structurally incompatible with Stage 3 | — Pending |
| Optional `useContainer()` DI hook with WeakMap default | Not required, not absent; matches ecosystem pattern; ~50 LOC | — Pending |
| Monorepo (pnpm workspaces) with core + adapter packages | Cleaner peer deps than single-package optional dependencies | — Pending |
| `tshy` for build | Only `tsc`-based dual build that handles Stage 3 reliably; tsup/tsdown/swc/esbuild have Stage 3 gaps | — Pending |

## Open Questions

<!-- Resolved during research / requirements / planning phases -->

- **Specific "new features on top"** — v1 includes AsyncLocalStorage request context + dev-time `printRoutes`. v1.x candidates: SSE/streaming, lifecycle hooks, structured logging hook, `@RateLimit`, `@Timeout`, OpenAPI emit (Zod-first). To finalize during requirements.
- **Package name** — Deferred until before publish.

## Resolved Decisions (from research)

- **DI** — Optional `useContainer(IocAdapter)` hook, default WeakMap; no built-in container. (Architecture research)
- **Validation** — Standard Schema interface, no class-validator support. Zod is the v1 canonical adapter; Valibot in v1.x. (Stack + Architecture research)
- **API shape** — Method-level input declaration `@Get('/:id', { params, query, body })`. Forced by Stage 3 (no parameter decorators). (Architecture research)
- **Node** — `engines: ">=20"`, recommend Node 22 LTS, CI matrix Node 20/22/24.
- **Module format** — Dual ESM+CJS, neutralized via no-global-state architecture.
- **Build tool** — `tshy` (only `tsc`-based dual build that handles Stage 3 reliably).
- **Lint/format** — Biome 2 (ESLint 9 + `@typescript-eslint` 8 fallback if needed).
- **Repo shape** — Monorepo (pnpm workspaces): batteries-included core + small optional adapter packages (`-typedi`, etc.). class-validator adapter dropped per validator decision.

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-07 after initialization*
