---
phase: 01-metadata-decorator-skeleton
plan: "01"
subsystem: docs
tags: [docs, requirements, state, direction-override, legacy-decorators]
dependency_graph:
  requires: []
  provides:
    - consistent REQUIREMENTS.md BUILD-04/05/06 wording aligned to legacy decorator direction
    - consistent STATE.md Key Decisions aligned to legacy decorator direction
  affects:
    - .planning/REQUIREMENTS.md
    - .planning/STATE.md
tech_stack:
  added: []
  patterns: []
key_files:
  modified:
    - .planning/REQUIREMENTS.md
    - .planning/STATE.md
decisions:
  - "BUILD-04 rewritten to legacy experimentalDecorators + emitDecoratorMetadata + runtime guard for missing reflect-metadata"
  - "BUILD-05 rewritten: reflect-metadata IS a core dep (was 'zero reflect-metadata in core')"
  - "BUILD-06 rewritten: single-package repo (was pnpm workspaces monorepo)"
  - "Out-of-Scope class-validator rationale updated: Stage 3 incompatibility no longer applies, scope decision unchanged"
  - "STATE.md Key Decisions: all 4 stale bullets replaced with legacy decorator direction wording"
  - "Open Questions: removed resolved Stage 3 decorator generic signatures item"
metrics:
  duration: "~5 minutes"
  completed_date: "2026-05-08"
  tasks_completed: 2
  files_modified: 2
---

# Phase 01 Plan 01: Direction Override Doc Rewrite Summary

**One-liner:** Surgical rewrite of REQUIREMENTS.md BUILD-04/05/06 and STATE.md Key Decisions to reflect legacy `experimentalDecorators` + `reflect-metadata` direction, replacing stale Stage-3 / monorepo wording before any implementation begins.

---

## What Was Done

This plan executed the D-01 and D-02 pre-planning chore from `01-CONTEXT.md`: aligning REQUIREMENTS.md and STATE.md with the CLAUDE.md Direction Override (2026-05-08) before any code is written in subsequent plans.

### Task 1: REQUIREMENTS.md BUILD-04/05/06 + Out-of-Scope rewrite

**Edits applied:**

- **BUILD-04** (was: "TC39 Stage 3 only; guard rejects `experimentalDecorators: true`")
  Now: "Library uses legacy TypeScript decorators (`experimentalDecorators: true` + `emitDecoratorMetadata: true`); runtime guard throws if either flag is missing or `reflect-metadata` not imported."

- **BUILD-05** (was: "zero `reflect-metadata` dependency in core")
  Now: "Library imports `reflect-metadata` as a runtime dependency in core for reading TS-emitted type metadata (`design:paramtypes`, `design:returntype`, `design:type`); consumers must `import 'reflect-metadata'` once at app entry."

- **BUILD-06** (was: "pnpm workspaces monorepo (`packages/core` + adapter packages)")
  Now: "Repo is a single-package repo (one `package.json`, one `src/`, one `dist/`); dual ESM+CJS published from the package root via `tshy`. Optional integrations live as sub-path exports within the same package."

- **Out of Scope — class-validator:** Removed Stage 3 incompatibility rationale; replaced with "technical blocker no longer applies under legacy decorator direction, but scope remains v1.x at earliest."

- **Out of Scope — parameter decorators:** Removed "Stage 3 doesn't support them" rationale; replaced with cleaner type inference rationale.

- **Out of Scope — `reflect-metadata` in core:** Removed entirely (it is now IN scope as a core dep).

- **Last updated:** Updated to 2026-05-08.

### Task 2: STATE.md Key Decisions rewrite

**Edits applied:**

- **Decorators bullet** (was: "TC39 Stage 3 only; runtime guard rejects `experimentalDecorators: true` consumers")
  Now: "Legacy TypeScript decorators only (`experimentalDecorators: true` + `emitDecoratorMetadata: true`); runtime guard throws if either flag is missing or `reflect-metadata` is not imported."

- **Metadata bullet** (was: "Per-class via `Symbol.metadata` + WeakMap; no module-level mutable global registry")
  Now: Hybrid WeakMap + reflect-metadata for TS-emitted keys only; no `Reflect.defineMetadata` by core.

- **Repo bullet** (was: "pnpm workspaces monorepo (`packages/core` + `packages/typedi`)")
  Now: "Single-package repo (one `package.json`, one `src/`, one `dist/`); optional adapter integrations as sub-path exports."

- **`reflect-metadata` bullet** (was: "banned from core; quarantined to optional adapter packages only")
  Now: "core runtime dependency, used exclusively for reading TS-emitted type metadata; consumer must `import 'reflect-metadata'` at app entry."

- **API shape bullet:** Removed "forced by Stage 3, not chosen"; replaced with "chosen for cleaner type inference."

- **Project Reference core value:** Updated from "TC39 Stage 3 decorators" to "legacy TypeScript decorators + reflect-metadata."

- **Open Questions:** Removed resolved "Exact Stage 3 decorator generic signatures" item; updated class-validator note.

- **`last_updated` frontmatter:** Set to `"2026-05-08T00:00:00.000Z"`.

---

## Deviations from Plan

None — plan executed exactly as written. All 8 action items in Task 1 and all 8 action items in Task 2 were applied as specified.

---

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | `2319296` | docs(01-01): rewrite BUILD-04/05/06 and Out-of-Scope |
| Task 2 | `24dd32c` | docs(01-01): rewrite STATE.md Key Decisions |

---

## Verification Results

All acceptance criteria passed:

**REQUIREMENTS.md:**
- `grep "experimentalDecorators: true"` — 1 hit
- `grep "single-package repo"` — 1 hit
- `grep "Stage 3 decorators only"` — 0 hits
- `grep "pnpm workspaces monorepo"` — 0 hits
- `grep "zero \`reflect-metadata\` dependency"` — 0 hits
- BUILD-0 ID count: 18 (unchanged)

**STATE.md:**
- `grep "Legacy TypeScript decorators only"` — 1 hit
- `grep "Single-package repo"` — 1 hit
- `grep "TC39 Stage 3 only"` — 0 hits
- `grep "pnpm workspaces monorepo"` — 0 hits
- `grep "banned from core"` — 0 hits
- `last_updated` = `"2026-05-08T00:00:00.000Z"`

---

## Known Stubs

None — this plan modifies documentation files only; no code stubs introduced.

## Threat Flags

None — documentation-only changes; no new network endpoints, auth paths, file access patterns, or schema changes.

## Self-Check: PASSED
