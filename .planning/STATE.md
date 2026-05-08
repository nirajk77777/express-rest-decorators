---
gsd_state_version: 1.0
milestone: v1.0.0
milestone_name: milestone
status: executing
last_updated: "2026-05-08T00:00:00.000Z"
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 6
  completed_plans: 3
  percent: 0
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

Phase: 01 (metadata-decorator-skeleton) — EXECUTING
Plan: 1 of 6
**Phase:** 1 — Metadata & Decorator Skeleton
**Plan:** 01-03 complete (3/6 plans remaining in Phase 1)
**Status:** Executing Phase 01
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
| Plans complete | 3 |
| Requirements mapped | 58 / 58 |
| Open blockers | 0 |

---

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

### TODOs

(none yet — populated as phases progress)

### Blockers

(none)

---

## Session Continuity

**Last action:** 01-03-PLAN.md complete — All 15 decorators, MetadataBuilder.build() with inheritance walk, and runtime guard (probe-class strategy) implemented. 40/40 tests pass, tsc --noEmit clean.

**Resume command:** Continue Phase 01 with next plan (01-04 or beyond)

**Last updated:** 2026-05-08
