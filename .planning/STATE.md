---
gsd_state_version: 1.0
milestone: v1.0.0
milestone_name: milestone
status: Roadmap created; ready for `/gsd-plan-phase 1`
last_updated: "2026-05-07T20:33:30.216Z"
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# State

<!-- Project memory. Updated at every phase/plan transition. -->

## Project Reference

**Name:** Express Controllers (working title)
**Core Value:** Bring the routing-controllers DX into the Express v5 + modern-TypeScript era — same mental model, dropped Koa baggage, native async errors, TC39 Stage 3 decorators, pluggable validators.
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

**Phase:** 1 — Metadata & Decorator Skeleton
**Plan:** Not started
**Status:** Roadmap created; ready for `/gsd-plan-phase 1`
**Progress:** [░░░░░░░░░░] 0% (0 / 5 phases complete)

```
Phase 1 ──► Phase 2 ──┬──► Phase 3 ──┐
                       │               ├──► Phase 5
                       └──► Phase 4 ──┘
```

**Up next:** `/gsd-plan-phase 1` — decompose Phase 1 into executable plans.

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases planned | 5 |
| Phases complete | 0 |
| Plans complete | 0 |
| Requirements mapped | 58 / 58 |
| Open blockers | 0 |

---

## Accumulated Context

### Roadmap Evolution

- Phase 1 edited: regenerated: switched to legacy experimentalDecorators + reflect-metadata; single-package repo (no monorepo); DI remains pluggable
- Phase 1 edited: CLAUDE.md, PROJECT.md, research/STACK.md updated to match new direction: legacy experimentalDecorators + reflect-metadata in core; single-package repo (no monorepo); DI remains pluggable. Historical research preserved with override banners.

### Key Decisions Locked-In (from research)

- **Decorators:** TC39 Stage 3 only; runtime guard rejects `experimentalDecorators: true` consumers.
- **Metadata:** Per-class via `Symbol.metadata` + WeakMap; no module-level mutable global registry.
- **Validation:** Standard Schema (type-only) is the core surface; Zod/Valibot/ArkType work natively without adapter code.
- **DI:** Optional `useContainer(IocAdapter)` with WeakMap default; no built-in container.
- **Routing:** One `express.Router()` per controller; path-to-regexp v8 syntax validated at registration.
- **Errors:** Express v5 native async propagation; ONE library-installed Express error middleware; no per-handler try/catch.
- **Build:** `tshy` for dual ESM+CJS; `attw` + `publint` mandatory in CI.
- **Repo:** pnpm workspaces monorepo (`packages/core` + `packages/typedi`).
- **Lint/format:** Biome 2 (ESLint 9 + `@typescript-eslint` 8 fallback documented).
- **Tests:** Vitest 3, run under both `pool: 'forks'` and `pool: 'threads'`.
- **Node:** `engines.node: ">=20"`, recommend 22 LTS, CI matrix on 20/22/24.
- **`reflect-metadata`:** banned from core; quarantined to optional adapter packages only.
- **API shape:** method-level input declaration `@Get('/:id', { params, query, body })` with destructured handler args (forced by Stage 3, not chosen).

### Open Questions

- **Package name** — deferred until before publish (Phase 5).
- **Exact Stage 3 decorator generic signatures** — Phase 1 research-flag item; resolve during `/gsd-plan-phase 1`.
- **Class-validator legacy adapter** — currently Out of Scope for v1 per REQUIREMENTS.md; revisit at v1.x if migration users demand it.

### TODOs

(none yet — populated as phases progress)

### Blockers

(none)

---

## Session Continuity

**Last action:** Roadmap created from requirements + research synthesis. 5 phases, 58/58 v1 requirements mapped, parallelization metadata captured for Phases 3 and 4.

**Resume command:** `/gsd-plan-phase 1`

**Last updated:** 2026-05-07
