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
- [ ] Pluggable validation/transformation adapters (zod, valibot, class-validator) instead of hard-coded class-validator
- [ ] Pluggable DI via `useContainer()`-style adapter (pending research outcome — see Open Questions)
- [ ] Dual ESM + CJS distribution
- [ ] Vitest test suite written from scratch covering all public APIs
- [ ] Migration guide doc for users coming from `routing-controllers`
- [ ] Modest set of "new features on top" of original (specific list to be defined during requirements phase)
- [ ] Published to npm under a name TBD

### Out of Scope

- Koa support — explicit non-goal; user wants Express-only to keep the package focused
- Express v4 support — moving forward, not maintaining the past
- Hard dependency on a specific validator (class-validator) — replaced by pluggable adapters
- Drop-in API compatibility with routing-controllers — we're willing to break things where it helps
- Codemod tool for migration — migration guide doc only for v1
- Built-in DI container — at most a pluggable hook (subject to research outcome)
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
| Dual ESM + CJS | Broad compatibility; same as original | — Pending |
| Vitest, fresh tests | Modern runner, ESM-native; original Jest tests are Koa-coupled and dated | — Pending |
| API: mostly compatible, breaking where it helps | Familiar mental model without being shackled by legacy quirks | — Pending |
| Lean into Express v5 native async errors | Drop legacy try/catch wrappers in adapter | — Pending |

## Open Questions

<!-- Resolved during research / requirements / planning phases -->

- **DI: required at all?** — Should the package ship a `useContainer()`-style adapter, or be entirely DI-agnostic (plain class instantiation, factory hook for advanced users)? Investigate how routing-controllers users actually use DI today, what NestJS / tsoa / fastify-decorators do, and whether the abstraction earns its complexity. *Resolution: research phase.*
- **Specific "new features on top"** — Concrete list to define during requirements (candidates: streaming/SSE helpers, hooks/lifecycle, route-level rate limit decorator, AsyncLocalStorage context, structured logging hooks, OpenAPI hint pass).
- **Node version target** — Node 20 LTS only? Node 22+? Need to align with Express v5's own minimums.
- **Package name** — Deferred until before publish.
- **Repo/dev tooling** — Single package vs monorepo (e.g., adapters as separate packages); pnpm/npm/bun; biome vs eslint+prettier.

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
