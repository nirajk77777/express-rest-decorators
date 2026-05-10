---
phase: 05-adapter-packages-build-docs-migration-publish
plan: 01
subsystem: docs
tags: [docs, roadmap, requirements, direction-alignment]
requires: []
provides:
  - "REQUIREMENTS.md DI-03 reflects docs-only useContainer recipe"
  - "ROADMAP.md Phase 5 Goal/SC#1/SC#4/Plans block reflects single-package + docs-only direction"
affects:
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/05-adapter-packages-build-docs-migration-publish/05-01-SUMMARY.md
  modified:
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
decisions:
  - "Task 1 (DI-03 reword) was already committed in a6fb860 prior to this worktree; verified acceptance criteria still hold and no further edit was required."
  - "Phase 5 Plans block replaced wholesale: 04-01..04-06 copy-paste typo replaced with 05-01..05-07 plan filenames."
metrics:
  duration: ~120s
  tasks: 2
  files: 2
  completed: 2026-05-10
---

# Phase 5 Plan 01: Direction-alignment doc rewrites Summary

Reconciled REQUIREMENTS.md and ROADMAP.md with the locked single-package + docs-only-DI direction (CLAUDE.md Direction Override 2026-05-08, BUILD-06) so every downstream Phase 5 plan reads source docs that match the actual ship target.

## What Changed

### REQUIREMENTS.md — DI-03 (already committed in a6fb860, verified intact)
- Old: "A separate `@scope/express-controllers-typedi` adapter package is published alongside core (TypeDI 0.x reference adapter)"
- New: "README documents a `useContainer` recipe wiring TypeDI (and any `.get(token)`-shaped container) into the core `useContainer(IocAdapter)` hook from Phase 1; no separate `@scope/express-controllers-typedi` adapter package is published — the single-package rule (BUILD-06) precludes a sibling package."
- Traceability table row (DI-03 → Phase 5) untouched; checkbox state `[ ]` preserved.

### ROADMAP.md Phase 5 — Goal, SC #1, SC #4, Plans block (commit f3833e6)
- **Goal**: dropped "monorepo build pipeline … TypeDI adapter"; replaced with "single-package build pipeline (one `package.json`, one `src/`, one `dist/`) … docs-only TypeDI `useContainer` recipe".
- **SC #1**: replaced "monorepo (pnpm workspaces, `packages/core` + `packages/typedi`)" with "single-package repo (one `package.json`, one `src/`, one `dist/`; no workspaces, no `packages/*`)"; added "(Linux)" qualifier on the CI matrix.
- **SC #4**: replaced "A separate `@scope/express-controllers-typedi` adapter package is published alongside core …" with the README `useContainer` recipe wording.
- **Plans block**: replaced the 6-entry copy-pasted Phase 4 list (04-01..04-06) with the correct 7-entry Phase 5 list (05-01..05-07) plus brief objectives + wave assignments. SC #2/#3/#5, `**Depends on**`, and `**Requirements**` lines untouched. Phase 4's own block remains intact (6 `04-0` references preserved).

## Verification

All five plan-level verification gates pass:
1. `grep -F "useContainer" .planning/REQUIREMENTS.md` matches the new DI-03 line.
2. `grep -cF "single-package" .planning/ROADMAP.md` returns 4 (Goal + SC#1 + SC#4 + verification subtext).
3. `grep -cE "^\s+- \[ \] 05-0[1-7]-PLAN.md" .planning/ROADMAP.md` returns 7.
4. `grep -cF "monorepo (pnpm workspaces, \`packages/core\` + \`packages/typedi\`)" .planning/ROADMAP.md` returns 0.
5. `grep -cF "A separate \`@scope/express-controllers-typedi\` adapter package" .planning/ROADMAP.md` returns 0.

Phase 4 block integrity confirmed: `awk '/^### Phase 4:/,/^### Phase 5:/' | grep -c "04-0"` returns 6 (unchanged).

## Deviations from Plan

None — plan executed exactly as written. Task 1's edit was already on disk from a previous commit (a6fb860) before this worktree was branched; Task 1 acceptance criteria were verified rather than re-applied (re-applying an identical edit would be a no-op).

## Commits

- `a6fb860` (pre-worktree): docs(05-01): reword REQUIREMENTS.md DI-03 to docs-only useContainer recipe — Task 1
- `f3833e6` (this worktree): docs(05-01): align ROADMAP Phase 5 with single-package + docs-only DI direction — Task 2

## Self-Check: PASSED

- File `.planning/REQUIREMENTS.md` exists and contains the new DI-03 line.
- File `.planning/ROADMAP.md` exists and contains all four Phase 5 edits (Goal, SC#1, SC#4, Plans block).
- Commit `f3833e6` exists in `git log --oneline`.
- Commit `a6fb860` exists in `git log --oneline` (Task 1, pre-worktree).
