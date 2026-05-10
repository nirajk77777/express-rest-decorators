---
phase: 05-adapter-packages-build-docs-migration-publish
plan: 02
subsystem: infra
tags: [pnpm, tshy, biome, dual-esm-cjs, decorators, build, publishing]

requires:
  - phase: 04-uploads-cookies-sessions-render-request-context
    provides: stable src/ tree, lazy-peer runtime imports, 569-test suite
provides:
  - pnpm 10 as committed dev package manager (corepack-managed)
  - tshy@3.3.2 (exact pin) producing dual ESM+CJS dist with legacy decorators preserved
  - biome.json with unsafeParameterDecoratorsEnabled and Phase 1-4-compatible rule overrides
  - publish-ready package.json shape (@nirajk/express-controllers scoped, peer deps declared, all build/release/lint scripts)
  - .gitignore extended with .tshy/, .tshy-build/, docs/, pnpm-debug.log*
affects: [05-03-runtime-smoke-attw-publint, 05-04-ci-matrix, 05-05-docs-readme, 05-06-changesets-release, 05-07-publish]

tech-stack:
  added:
    - pnpm@10.33.4 (packageManager field, lockfile committed)
    - tshy@3.3.2 (dual ESM+CJS build via tsc, manages exports)
    - "@biomejs/biome@2.4.15 (lint only; formatter disabled)"
    - "@arethetypeswrong/cli@0.18.2 (publish-time type-export validator)"
    - publint@0.3.20 (publish-time exports/types validator)
    - typedoc@0.28.19 (API docs generator — wired in plan 05-05)
    - "@changesets/cli@2.31.0 (versioning + changelog — wired in plan 05-06)"
  patterns:
    - "Pin tshy to exact version 3.3.2 (no caret) — tshy 4.x defaults to TS6 and breaks legacy decorators"
    - "tshy field at root manages exports/main/types dynamically; never hand-edit the auto-generated keys"
    - "Lazy peers (multer/cors/cookie/express-session/tinyglobby) declared with peerDependenciesMeta.<name>.optional=true so consumers only install what they use"
    - "Biome 2 'includes' (negative globs) replaces Biome 1 'ignore'"
    - "Biome formatter disabled (linter-only) until a v1.x cleanup pass aligns Phase 1-4 source style"

key-files:
  created:
    - biome.json
    - pnpm-lock.yaml
    - .planning/phases/05-adapter-packages-build-docs-migration-publish/05-02-SUMMARY.md
  modified:
    - package.json
    - .gitignore

key-decisions:
  - "Adopt pnpm 10.33.4 (latest 10.x at execution time) over hard-coded pnpm@10.0.0 — corepack activates exactly the packageManager field"
  - "Disable Biome formatter project-wide (linter-only) — Phase 1-4 source uses wider line widths than Biome's 100ch default; auto-formatting stable code is out of scope per plan rule"
  - "Disable lint rules incompatible with decorator/reflect-metadata patterns: noNonNullAssertion, noExplicitAny, noBannedTypes, useArrowFunction, useTemplate, noUnusedImports, noUnusedFunctionParameters, noUnusedVariables, organizeImports — revisit in v1.x cleanup"
  - "Add .tshy/ to .gitignore (in addition to plan's .tshy-build/) — tshy 3.3.2 actually creates .tshy/ for build state, not .tshy-build/"

patterns-established:
  - "package.json shape for v1 publish: scoped name, packageManager pinned, tshy field with src/index.ts entry, no top-level main/types (tshy auto-manages exports/main/types/module)"
  - "biome.json: linter-only, unsafeParameterDecoratorsEnabled, includes-style negative globs, rule overrides documented inline"

requirements-completed: [BUILD-01, BUILD-06, BUILD-08, BUILD-09]

duration: 12min
completed: 2026-05-10
---

# Phase 5 Plan 02: Build Foundation Summary

**pnpm 10 + tshy 3.3.2 producing dual ESM+CJS dist from a single-package repo, with Biome 2 lint enforcing decorator-aware syntax and the existing 569-test suite passing under both fork and thread pools.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2
- **Files modified:** 3 (package.json, .gitignore, biome.json) + 1 added (pnpm-lock.yaml) + 1 deleted (package-lock.json)

## Accomplishments

- pnpm 10.33.4 activated via corepack and committed as `packageManager`; package-lock.json deleted, pnpm-lock.yaml committed (4388-line lockfile)
- Package renamed to `@nirajk/express-controllers` (scoped — unscoped name is taken on npm)
- tshy@3.3.2 pinned EXACTLY (avoids tshy 4.x TS6 trap that breaks legacy decorators) and produces:
  - `dist/esm/index.js` + `dist/esm/index.d.ts` (ESM bundle)
  - `dist/commonjs/index.js` + `dist/commonjs/index.d.ts` (CJS bundle)
  - `dist/commonjs/package.json` with `{"type":"commonjs"}` (auto-generated)
  - tshy auto-populated `package.json#exports`, `module` fields
- Lazy peers (multer, cors, cookie, express-session, tinyglobby) declared in peerDependencies with `peerDependenciesMeta.<name>.optional=true` — first time these are formally declared (Phase 4 treated them as runtime-optional via lazy `import()`)
- Express peer bumped from `^5.0.0` to `^5.1.0` (BUILD-03 alignment)
- biome.json seeded with `unsafeParameterDecoratorsEnabled: true` (load-bearing for legacy parameter decorators)
- `pnpm lint` exits 0 (1 informational warning, 1 info — both deferred to v1.x cleanup)
- `pnpm test:forks` and `pnpm test:threads` both pass: **569 tests / 52 files**, no regressions

## Task Commits

1. **Task 1: pnpm 10 migration + package.json mutations + devDeps install** — `9e33035` (chore)
2. **Task 2: biome.json + first lint run + first tshy build smoke** — `e63cc36` (build)

## Files Created/Modified

- `package.json` — scoped name, packageManager=pnpm@10.33.4, tshy field, lazy peers w/ optional, six new scripts, six new devDeps; tshy auto-added `exports` and `module` on first build
- `pnpm-lock.yaml` — created from scratch by pnpm install (4388 lines)
- `package-lock.json` — deleted
- `.gitignore` — added `.tshy/`, `.tshy-build/`, `docs/`, `pnpm-debug.log*`
- `biome.json` — created at repo root; linter-only with decorator-aware parser flag

## Lockfile-Resolved Versions (Phase 5 stack)

Confirmed from pnpm-lock.yaml after `pnpm install`:

| Tool                       | Resolved Version |
| -------------------------- | ---------------- |
| pnpm (packageManager)      | 10.33.4          |
| tshy                       | 3.3.2 (pinned)   |
| @biomejs/biome             | 2.4.15           |
| @arethetypeswrong/cli      | 0.18.2           |
| publint                    | 0.3.20           |
| typedoc                    | 0.28.19          |
| @changesets/cli            | 2.31.0           |
| typescript                 | 5.9.3            |
| express                    | 5.2.1 (dev)      |
| vitest                     | 3.2.4            |
| @vitest/coverage-v8        | 3.2.4            |

## Build Smoke Results

- `pnpm build` → exit 0
- `dist/esm/index.js` (1027 B), `dist/esm/index.d.ts` (1283 B)
- `dist/commonjs/index.js` (3086 B), `dist/commonjs/index.d.ts` (1283 B), `dist/commonjs/package.json` (`{"type":"commonjs"}`)
- `node -e "require('./dist/commonjs/index.js')"` → exit 0 (CJS loads cleanly)
- `node --input-type=module -e "import('./dist/esm/index.js')"` → exit 0 (ESM loads cleanly)

## Test Pool Results

| Pool    | Files | Tests | Duration | Status |
| ------- | ----- | ----- | -------- | ------ |
| forks   | 52    | 569   | 2.40s    | PASS   |
| threads | 52    | 569   | 1.83s    | PASS   |

No test count regression vs. STATE.md baseline (569).

## Decisions Made

- **Resolved pnpm 10.33.4 dynamically** instead of pinning the plan's illustrative `pnpm@10.0.0` — per plan Step 1c "substitute the resolved value at execution time".
- **Disabled Biome formatter** (linter-only mode). The four `javascript.formatter` rules in the plan template (single quotes, all-trailing commas, semicolons-always, arrow parens) plus the 100-char `lineWidth` produced 61 formatter diffs against Phase 1-4 stable code. Per plan rule "do not auto-format Phase 1–4 stable code without permission", the safer choice was to disable the formatter; lint enforcement remains.
- **Used `includes` (negative globs) instead of `ignore`** in biome.json — Biome 2.4.15 removed the `ignore` key (caught by deserialize error on first lint run).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Biome 2.4.15 schema removed the `ignore` key**
- **Found during:** Task 2 (`pnpm lint`)
- **Issue:** The plan's biome.json template used `files.ignore: [...]` which Biome 2.4.15 rejects with `Found an unknown key 'ignore'`. The known keys are `maxSize`, `ignoreUnknown`, `includes`, `experimentalScannerIgnores`.
- **Fix:** Replaced with `files.includes: ["**", "!dist", "!.tshy-build", "!node_modules", "!docs", "!coverage"]` (Biome 2 negative-glob style).
- **Files modified:** biome.json
- **Verification:** `pnpm lint` no longer errors on configuration parse.
- **Committed in:** e63cc36 (Task 2 commit)

**2. [Rule 1 — Bug] Biome formatter would have rewritten 61 Phase 1-4 source files**
- **Found during:** Task 2 (`pnpm lint`)
- **Issue:** With formatter enabled at lineWidth=100, 61 stable source files (boot.ts, router-build.ts, cookies.ts, type-heavy interfaces) had multi-line formatting drift. Per plan rule, auto-formatting Phase 1-4 stable code without explicit permission is forbidden.
- **Fix:** Set `formatter.enabled = false` in biome.json (linter still active). Documented as a project decision to revisit in a v1.x cleanup pass.
- **Files modified:** biome.json
- **Verification:** `pnpm lint` exits 0.
- **Committed in:** e63cc36 (Task 2 commit)

**3. [Rule 2 — Missing Critical] Phase 1-4 lint rule overrides for decorator/reflect-metadata patterns**
- **Found during:** Task 2 (`pnpm lint`)
- **Issue:** With `recommended: true` only, biome reported 138 errors / 383 warnings on Phase 1-4 source. Breakdown by rule:
  - 169 noNonNullAssertion (decorator metadata bang assertions)
  - 99 noExplicitAny (Reflect.getMetadata return types)
  - 78 organizeImports (assist auto-fix that would reorder Phase 1-4 import blocks)
  - 66 noBannedTypes (`Function`/`Object` in decorator signatures)
  - 19 useArrowFunction (class methods/decorators)
  - 19 noUnusedImports (type-only imports affected by emitDecoratorMetadata)
  - 4 noUnusedFunctionParameters
  - 3 useTemplate, 1 noTemplateCurlyInString, 1 noUselessEscapeInRegex, 1 noUnusedVariables
- **Fix:** Per plan rule "add the minimal `linter.rules.<group>.<rule>` override to disable that one rule with a comment ... Do NOT fix Phase 1–4 source", disabled the offending rules in biome.json `linter.rules`. Also disabled `assist.actions.source.organizeImports`. Each of these is a stylistic preference incompatible with idiomatic decorator/reflect-metadata code; the project will revisit them during a v1.x cleanup pass.
- **Files modified:** biome.json
- **Verification:** `pnpm lint` exits 0; only 1 informational warning (noTemplateCurlyInString in tests/adapter/response.test.ts:342, which is intentional placeholder syntax in a string literal) and 1 info remain.
- **Committed in:** e63cc36 (Task 2 commit)

**4. [Rule 3 — Blocking] tshy creates `.tshy/` not `.tshy-build/` for build state**
- **Found during:** Task 2 (post-build `git status`)
- **Issue:** Plan instructed adding `.tshy-build/` to .gitignore, but tshy 3.3.2 actually creates `.tshy/` (containing `build.json`, `commonjs.json`, `esm.json` build state). Without ignoring it, those files would have been committed.
- **Fix:** Added `.tshy/` to .gitignore alongside the existing `.tshy-build/` entry (kept both for forward-compat).
- **Files modified:** .gitignore
- **Verification:** `git status` clean of build state after `pnpm build`.
- **Committed in:** e63cc36 (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (2 blocking, 1 bug, 1 missing critical)
**Impact on plan:** All four deviations preserve the plan's intent (lint runs green, build emits dual artifacts, no Phase 1-4 source touched). No scope creep — overrides are contained to biome.json and one .gitignore line.

## Issues Encountered

- One Biome warning remains: `tests/adapter/response.test.ts:342:52 lint/suspicious/noTemplateCurlyInString` — the test intentionally uses `'${ ... }'` inside a string literal to assert a templating boundary. Not blocking (warning only; lint exits 0). Recorded for v1.x review; can be silenced with a `biome-ignore` comment when that test is touched next.

## Deferred Items (for v1.x cleanup pass)

- Re-enable Biome formatter (`formatter.enabled: true`) and apply a one-shot reformat to Phase 1-4 source on a dedicated branch.
- Re-enable `noNonNullAssertion`, `noExplicitAny`, `noBannedTypes`, `useArrowFunction`, `noUnusedImports`, `noUnusedFunctionParameters`, `noUnusedVariables`, `useTemplate`, `organizeImports` and remediate violation-by-violation (or keep them off intentionally with documented rationale).
- Resolve `noTemplateCurlyInString` warning in `tests/adapter/response.test.ts:342`.

## Next Phase Readiness

- **Plan 05-03 (runtime smoke + attw + publint):** unblocked — `dist/{esm,commonjs}/index.{js,d.ts}` exist, both load cleanly via `node`, `attw`/`publint` already installed at the pinned versions.
- **Plan 05-04 (CI matrix):** unblocked — pnpm-lock.yaml committed, `pnpm install --frozen-lockfile` exits 0, `test:forks`/`test:threads`/`lint`/`build` scripts all green.
- **Plan 05-05 (README + governance):** ready to add `repository`, `homepage`, `bugs` fields to package.json once the GitHub URL is confirmed with the user.
- **Plan 05-06 (changesets):** unblocked — `@changesets/cli@2.31.0` installed; `release` script wired (just needs `.changeset/config.json` from that plan).
- **Plan 05-07 (publish):** unblocked once 05-03..05-06 land.

## Self-Check: PASSED

- biome.json present and contains `unsafeParameterDecoratorsEnabled` — confirmed.
- pnpm-lock.yaml present (4388 lines) — confirmed.
- package-lock.json absent — confirmed.
- dist/esm/index.js, dist/commonjs/index.js, dist/esm/index.d.ts, dist/commonjs/index.d.ts present after `pnpm build` — confirmed via `ls -la`.
- dist/commonjs/package.json contains `{"type":"commonjs"}` — confirmed.
- pnpm lint exits 0 — confirmed.
- `pnpm test:forks` and `pnpm test:threads` both pass 569/569 — confirmed.
- Commits 9e33035 and e63cc36 exist on this worktree branch — confirmed via `git log --oneline a6fb860..HEAD`.

---
*Phase: 05-adapter-packages-build-docs-migration-publish*
*Completed: 2026-05-10*
