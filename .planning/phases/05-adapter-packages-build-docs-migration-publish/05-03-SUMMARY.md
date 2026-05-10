---
phase: 05-adapter-packages-build-docs-migration-publish
plan: 03
subsystem: build-publish-gates
tags: [build, smoke, attw, publint, emitDecoratorMetadata, BUILD-06, BUILD-07]
requires:
  - 05-02
provides:
  - build-smoke-test
  - single-package-invariant-gate
  - test:build-script
  - vitest.build.config.ts
affects:
  - vitest.config.ts
  - package.json
tech-stack:
  added:
    - attw (already devDep — exercised first time end-to-end)
    - publint (already devDep — exercised first time end-to-end)
  patterns:
    - "Separate vitest config (vitest.build.config.ts) for opt-in build smoke; main vitest.config.ts excludes tests/build/** so default `pnpm test` stays decoupled from dist/."
    - "Structural grep for /__metadata\\(|Reflect\\.metadata\\(/ across the entire dist subtree — primary emitDecoratorMetadata invariant. The barrel index.js is pure re-exports and does not contain helpers regardless of emit setting; the meaningful gate scans modules with actual decorator usage (e.g. dist/commonjs/guard/runtime-guard.js)."
key-files:
  created:
    - scripts/check-single-package.sh
    - tests/build/smoke.test.ts
    - vitest.build.config.ts
  modified:
    - vitest.config.ts (added exclude for tests/build/**)
    - package.json (added test:build script)
decisions:
  - "Used a separate vitest.build.config.ts instead of `vitest run tests/build` because vitest's --exclude appends to (rather than overrides) the config-level exclude. Two configs is cleaner and avoids having to remember CLI overrides."
  - "Inverted the structural grep target: scan the dist subtree, not just dist/{commonjs,esm}/index.js. The plan's literal assertion would always fail because the barrel re-exports nothing decorated. Documented in the test file."
metrics:
  tasks: 2
  duration_minutes: 4
  completed: 2026-05-10
---

# Phase 05 Plan 03: Build Smoke + Invariant Gates Summary

Wired the publish gates (attw, publint) and build-survival smoke test that prove BUILD-01 and BUILD-07 ahead of CI (Plan 05-04) and publish (Plan 05-07): tshy is honoring `emitDecoratorMetadata: true`, both CJS and ESM bundles load through Node's native loaders, attw and publint exit clean against a freshly built tarball, and a single-package invariant script (BUILD-06 lock) refuses to let a `packages/` dir or `pnpm-workspace.yaml` slip in.

## Outcomes

- `bash scripts/check-single-package.sh` exits 0 against the current tree; would exit 1 if `packages/`, `pnpm-workspace.yaml`, or a `"workspaces"` field appeared.
- `pnpm test:build` runs 11 assertions against `dist/` in 222 ms; all green.
- `pnpm exec attw --pack . --profile node16` exits 0. **No `--ignore-rules false-cjs` needed** — tshy's default `attw.json` already pins out node10 resolution; the node16-from-CJS, node16-from-ESM, and bundler rows are all green.
- `pnpm exec publint` reports `All good!` (exit 0).
- `pnpm test:forks` still runs the original 569-test suite (build smoke is correctly excluded from the default run).

## Key Findings

- The compiled metadata helpers in `dist/{commonjs,esm}/` use the **`__metadata(`** form (TS's helper), with one occurrence of the **`Reflect.metadata(`** ternary fallback inside the same emitted helper definition. Both patterns appear in `dist/{commonjs,esm}/guard/runtime-guard.js`. Plan 05-04's CI grep can target either form; the regex `/__metadata\(|Reflect\.metadata\(/` matches both.
- `dist/{commonjs,esm}/index.js` is a pure re-export barrel and contains zero decorator usage, hence zero `__metadata(` calls — independent of `emitDecoratorMetadata`. Asserting against just `index.js` would have been a structural false negative; the smoke scans the entire dist subtree instead.
- No `tsconfig.build.json` was needed. tshy 3.3.2 reads the root `tsconfig.json` and preserves `experimentalDecorators` + `emitDecoratorMetadata` exactly as `tsc` would.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Smoke grep target widened from `dist/index.js` to `dist/**/*.js`**
- **Found during:** Task 2 (verification of structural grep against built artifacts).
- **Issue:** The plan's `must_haves.truths` and acceptance criteria asserted that `dist/commonjs/index.js` and `dist/esm/index.js` contain `__metadata(` or `Reflect.metadata(`. Manual inspection of the freshly built `dist/commonjs/index.js` showed it is a 42-line `__exportStar(...)` barrel with no decorator usage and therefore no metadata helpers — *regardless* of whether `emitDecoratorMetadata` is enabled. Asserting against `index.js` would never have caught a regression because the assertion is structurally impossible to satisfy.
- **Fix:** The smoke test scans the entire `dist/{commonjs,esm}` subtree for files matching `/__metadata\(|Reflect\.metadata\(/`. This is the meaningful invariant: if tshy ever drops `emitDecoratorMetadata: true`, files like `dist/commonjs/guard/runtime-guard.js` will lose the helper calls and the assertion will fail.
- **Files modified:** `tests/build/smoke.test.ts` (added `walkJs` + `distContainsMetadataHelpers` helpers; documented the deviation in code comments).
- **Commit:** 557c58b

**2. [Rule 3 — Blocker] `test:build` needed its own vitest config**
- **Found during:** Task 2 first run of `pnpm test:build`.
- **Issue:** vitest's `--exclude` CLI flag *appends* to the config's exclude array rather than replacing it. With `tests/build/**` in the default config's exclude list, `vitest run tests/build` reported "No test files found." The CLI override `--exclude='!tests/build/**'` did not negate the config exclude.
- **Fix:** Added `vitest.build.config.ts` (build-only config: includes `tests/build/**`, excludes only `node_modules/**` + `dist/**`) and wired `test:build` to `vitest run --config vitest.build.config.ts`. Cleaner than fighting the CLI; also makes the smoke configuration explicit and discoverable.
- **Files modified:** `vitest.build.config.ts` (new), `package.json#scripts.test:build`.
- **Commit:** 557c58b

## Authentication / Manual Gates

None.

## Verification

| Check | Command | Result |
| --- | --- | --- |
| Single-package gate | `bash scripts/check-single-package.sh` | exit 0, "BUILD-06 single-package invariant: OK" |
| Build smoke | `pnpm test:build` | 1 file / 11 tests passed in 222 ms |
| attw | `pnpm exec attw --pack . --profile node16` | exit 0, all node16/bundler rows green |
| publint | `pnpm exec publint` | exit 0, "All good!" |
| Default test suite still independent | `pnpm test:forks` | 52 files / 569 tests passed |
| CJS bundle metadata helper present | `grep -rE '__metadata\(\|Reflect\.metadata\(' dist/commonjs` | matches in `dist/commonjs/guard/runtime-guard.js` |
| ESM bundle metadata helper present | `grep -rE '__metadata\(\|Reflect\.metadata\(' dist/esm` | matches in `dist/esm/guard/runtime-guard.js` |

## Notes for Plan 05-04 (CI)

- The CI workflow should run `pnpm build && pnpm test:build` (in that order — `test:build` requires `dist/` to exist).
- attw needs no `--ignore-rules` flag against the current build; if a future change breaks this, the prepublishOnly script will surface it.
- The smoke regex `/__metadata\(|Reflect\.metadata\(/` matches the helpers tshy 3.3.2 emits today; both forms coexist inside the same TS-emitted `__metadata` helper definition, so either match is sufficient.

## Commits

| Task | Commit | Message |
| --- | --- | --- |
| 1 | 8d6e787 | feat(05-03): add single-package gate script and test:build vitest target |
| 2 | 557c58b | feat(05-03): add build smoke test verifying CJS+ESM load and emitDecoratorMetadata survival |

## Self-Check

Verifications:
- `scripts/check-single-package.sh` — FOUND, executable bit set, exits 0.
- `tests/build/smoke.test.ts` — FOUND, 11 tests passing.
- `vitest.build.config.ts` — FOUND.
- `vitest.config.ts` — modified, contains `tests/build/**` in `exclude`.
- `package.json` — `scripts.test:build` set to `vitest run --config vitest.build.config.ts`.
- Commit 8d6e787 — FOUND in `git log`.
- Commit 557c58b — FOUND in `git log`.

## Self-Check: PASSED
