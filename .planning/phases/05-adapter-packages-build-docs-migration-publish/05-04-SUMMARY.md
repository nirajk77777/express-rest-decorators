---
phase: 05-adapter-packages-build-docs-migration-publish
plan: 04
subsystem: infra
tags: [ci, github-actions, matrix, pnpm, node-matrix, build-gates]

requires:
  - phase: 05-adapter-packages-build-docs-migration-publish
    plan: 02
    provides: pnpm 10 lockfile, tshy dual build, lint+test scripts
provides:
  - GitHub Actions CI workflow (.github/workflows/ci.yml) defining a 6-cell matrix (Node 20/22/24 × {forks, threads}) running typecheck → lint → test → build → build smoke → attw → publint → single-package invariant
affects: [05-07-publish]

tech-stack:
  added:
    - GitHub Actions workflow at .github/workflows/ci.yml
    - pnpm/action-setup@v6
    - actions/setup-node@v4
    - actions/checkout@v4
  patterns:
    - "ubuntu-latest only (D-07 — no Windows/macOS)"
    - "fail-fast: false to surface independent matrix-cell failures"
    - "concurrency.cancel-in-progress: true so superseded PRs do not burn CI minutes"
    - "No permissions block in ci.yml — id-token:write belongs in release.yml (Plan 05-06)"
    - "Tests run BEFORE build: vitest operates on src/ via unplugin-swc; dist-dependent smoke runs in pnpm test:build after pnpm build"

key-files:
  created:
    - .github/workflows/ci.yml
    - .planning/phases/05-adapter-packages-build-docs-migration-publish/05-04-SUMMARY.md
  modified: []

key-decisions:
  - "Did NOT add --ignore-rules false-cjs to attw step — Plan 05-03 SUMMARY does not yet exist on disk (parallel wave 2 sibling); the bare attw command from the plan template was used. If Plan 05-03 ends up requiring the flag, a small follow-up edit will sync ci.yml with package.json#scripts.prepublishOnly."
  - "Action versions pinned to current major (checkout@v4, setup-node@v4, action-setup@v6) per plan template — no SHA pinning yet (acceptable for pre-1.0 OSS; revisit at v1)."
  - "pnpm/action-setup@v6 with version: 10 (not packageManager-derived) — explicit pin matches packageManager pnpm@10.33.4 in package.json without coupling CI to lockfile parsing."

requirements-completed: [BUILD-02, BUILD-09]

duration: 3min
completed: 2026-05-10
---

# Phase 5 Plan 04: CI Matrix Workflow Summary

**GitHub Actions CI workflow authored at `.github/workflows/ci.yml` defining a 6-cell matrix (Node 20/22/24 × {forks, threads} pool) on ubuntu-latest that runs the full quality gate (typecheck, lint, test, build, build smoke, attw, publint, single-package invariant) on every PR and every push to main.**

## Performance

- **Duration:** ~3 min
- **Tasks:** 1
- **Files created:** 1 (.github/workflows/ci.yml)

## Accomplishments

- `.github/workflows/ci.yml` authored with the canonical Plan 05-04 template:
  - **Triggers:** push to main, pull_request to main only.
  - **Matrix:** 3 (Node 20, 22, 24) × 2 (pool: forks, threads) = 6 cells.
  - **Runner:** ubuntu-latest (D-07 — Linux only).
  - **fail-fast: false** — independent cell failures all reported.
  - **concurrency.cancel-in-progress: true** — superseded PRs cancel cleanly.
  - **No `permissions:` block** — CI does not publish; release-time `id-token: write` lives in `release.yml` (Plan 05-06).
- Each matrix cell runs (in order):
  1. `pnpm install --frozen-lockfile`
  2. `bash scripts/check-single-package.sh` (BUILD-06 invariant)
  3. `pnpm typecheck`
  4. `pnpm lint`
  5. `pnpm test:${{ matrix.pool }}` (forks or threads)
  6. `pnpm build` (tshy dual ESM+CJS)
  7. `pnpm test:build` (BUILD-01 build smoke + emitDecoratorMetadata assertion — runs 6× per PR, once per cell)
  8. `pnpm exec attw --pack . --profile node16` (BUILD-07)
  9. `pnpm exec publint` (BUILD-07)

## Task Commits

1. **Task 1: Author `.github/workflows/ci.yml`** — `9b633b6` (ci)

## Verification

- `python3` not available with PyYAML in env; YAML validity verified via `pnpm dlx js-yaml` — exits 0 (parse OK).
- `grep -F "node: [20, 22, 24]" .github/workflows/ci.yml` → 1 match.
- `grep -F "pool: [forks, threads]" .github/workflows/ci.yml` → 1 match.
- `grep -c "matrix:" .github/workflows/ci.yml` → 1 (one strategy.matrix block).
- `grep -c "runs-on: ubuntu-latest" .github/workflows/ci.yml` → 1 (Linux only).
- `grep -c "permissions:" .github/workflows/ci.yml` → 0 (correct — no publish privileges in CI).
- All seven script invocations present (`pnpm typecheck`, `pnpm lint`, `pnpm test:${{ matrix.pool }}`, `pnpm build`, `pnpm test:build`, `pnpm exec attw --pack . --profile node16`, `pnpm exec publint`) plus the `bash scripts/check-single-package.sh` invariant gate.
- Action versions: `actions/checkout@v4`, `pnpm/action-setup@v6`, `actions/setup-node@v4` — matches plan template.

## Decisions Made

- **No `--ignore-rules false-cjs` on attw step.** Plan instructed cross-referencing `05-03-SUMMARY.md` to decide whether to add this flag. At execution time of this parallel-wave plan, `05-03-SUMMARY.md` does not yet exist on disk (Plan 05-03 is the sibling wave-2 plan running concurrently). The bare `pnpm exec attw --pack . --profile node16` form was used — if Plan 05-03 ends up needing the flag in `package.json#scripts.prepublishOnly`, a one-line follow-up edit will sync ci.yml.
- **No SHA-pinning of third-party actions.** Tag-pinning at the major version (`@v4`, `@v6`) was used per the plan template. Acceptable for pre-1.0 OSS; revisit (Dependabot + SHA pinning) at v1 hardening.

## Deviations from Plan

None — plan executed exactly as written. The plan-level note about consulting 05-03-SUMMARY for `--ignore-rules false-cjs` was honored: the file does not exist yet (parallel wave), so the default bare form was used. This is documented above as a Decision, not a Deviation.

## CI Workflow Status

- The workflow has NOT yet been exercised against GitHub. The first live run will occur at Plan 05-07 (RC publish), after the GitHub remote URL is captured in Plan 05-05 and the user pushes the worktree branch.
- Local YAML parse passes (`pnpm dlx js-yaml` clean exit).

## Next Phase Readiness

- **Plan 05-05 (README + governance):** unblocked. README will reference the CI status badge once a GitHub repo URL exists.
- **Plan 05-06 (changesets):** unblocked. `release.yml` (separate workflow) will be authored there with the `id-token: write` permission this CI workflow intentionally lacks.
- **Plan 05-07 (publish):** the very first push to GitHub will trigger this workflow; failure in any of the 6 cells gates the RC publish.

## Self-Check

- `.github/workflows/ci.yml` exists — confirmed (`test -f`).
- YAML parses — confirmed (`pnpm dlx js-yaml .github/workflows/ci.yml` exit 0).
- Matrix `[20, 22, 24] × [forks, threads]` present — confirmed via grep.
- All required script invocations present — confirmed via grep.
- No `permissions:` block — confirmed (`grep -c permissions:` returned 0).
- ubuntu-latest only — confirmed (`grep -c runs-on: ubuntu-latest` returned 1).
- Commit `9b633b6` exists on this worktree branch — confirmed via `git log --oneline`.

## Self-Check: PASSED

---
*Phase: 05-adapter-packages-build-docs-migration-publish*
*Completed: 2026-05-10*
