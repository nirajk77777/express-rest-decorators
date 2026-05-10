---
phase: 05-adapter-packages-build-docs-migration-publish
plan: 07
subsystem: release-publish-rc1
tags: [changesets, version-bump, changelog, npm-publish, rc-ladder, checkpoint-pending]
status: partial-checkpoint-pending
requires:
  - 05-06 (Changesets pre-mode + release.yml + scripts.release --tag next)
provides:
  - DOCS-04 (Keep-a-Changelog 1.0.0-rc.1 entry generated; CHANGELOG.md authored)
  - "[partial] D-03 RC ladder: package.json version bumped to 1.0.0-rc.1 (publish step pending user approval)"
affects:
  - package.json (version: 0.0.0 -> 1.0.0-rc.1)
  - CHANGELOG.md (new file; first 1.0.0-rc.1 entry)
  - .changeset/pre.json (changesets array updated to record consumed initial-release)
tech-stack:
  added: []
  patterns:
    - "Changesets pre-mode default version (0.1.0-rc.0) overridden to 1.0.0-rc.1 per D-03 (plan-authorized manual override path)"
    - "Pre-flight gate: 11 commands run before AND after version bump; all green"
key-files:
  created:
    - CHANGELOG.md
  modified:
    - package.json
    - .changeset/pre.json
decisions:
  - "Manual version override applied. `pnpm changeset version` produced 0.1.0-rc.0 (Changesets' canonical first-release semver under pre-mode applied to the seed changeset's `minor` bump from a `0.0.0` initialVersions baseline). D-03 locks the RC ladder at 1.0.0-rc.1, so package.json#version was edited via jq and CHANGELOG.md heading rewritten from `## 0.1.0-rc.0` to `## 1.0.0-rc.1`. Plan Task 1 explicitly authorized this fallback path."
  - "Halted before npm publish per orchestrator override. Plan is autonomous: false; Task 2 is a checkpoint:decision (path-a vs path-b vs path-c); Task 3 is the actual publish (one-way operation requiring credentials). Per orchestrator instruction: 'prepare everything up to but not including the publish, then return with a checkpoint describing what's ready to ship.'"
metrics:
  duration: ~3 minutes (preparation work only; publish + smoke install pending)
  tasks_completed: 1
  tasks_total: 4
  completed: 2026-05-10
---

# Phase 5 Plan 7: Publish 1.0.0-rc.1 — Preparation Complete, Awaiting Publish Approval

Generated `CHANGELOG.md` and bumped `package.json#version` to `1.0.0-rc.1`, ran the full local pre-flight pipeline (11 gates) green both before and after the version bump, and committed the staged version-bump artifacts. Halted at the user-approval checkpoint (Task 2) per orchestrator policy: the actual `npm publish` step is a one-way operation gated on user credentials and an explicit publish-path decision (GitHub Actions vs local) and cannot be auto-approved.

## What Was Built

### Task 1 — Local pre-flight + version bump + CHANGELOG generation (commit `2f75cf7`)

**Step 1 — Pre-bump pre-flight (all green):**

| # | Command | Result |
|---|---------|--------|
| 1 | `pnpm install --frozen-lockfile` | ✓ |
| 2 | `bash scripts/check-single-package.sh` | ✓ "BUILD-06 single-package invariant: OK" |
| 3 | `pnpm typecheck` | ✓ |
| 4 | `pnpm lint` | ✓ (1 cosmetic warning about a template-string assertion in a test name; 0 errors) |
| 5 | `pnpm test:forks` | ✓ 569/569 tests, 52/52 files |
| 6 | `pnpm test:threads` | ✓ 569/569 tests, 52/52 files |
| 7 | `pnpm build` | ✓ tshy emitted `dist/{esm,commonjs}` |
| 8 | `pnpm test:build` | ✓ 11/11 build smoke tests |
| 9 | `pnpm exec attw --pack . --profile node16` | ✓ all green (CJS, ESM, bundler all pass) |
| 10 | `pnpm exec publint` | ✓ "All good!" |

**Step 2 — Version bump.** `pnpm exec changeset version` consumed `.changeset/initial-release.md` and produced:
- `package.json#version`: `0.0.0` → `0.1.0-rc.0`
- `CHANGELOG.md` created at repo root with `## 0.1.0-rc.0` heading
- `.changeset/pre.json#changesets` updated to `["initial-release"]` (records consumed changesets in pre-mode)

The version came out as `0.1.0-rc.0`, NOT `1.0.0-rc.1`. This is Changesets' canonical pre-mode arithmetic: starting from `initialVersions: 0.0.0` and applying a `minor` bump under pre-tag `rc` yields `0.1.0-rc.0`. D-03 locks the RC ladder at `1.0.0-rc.1`, so the plan-authorized manual override was applied:

```bash
jq '.version = "1.0.0-rc.1"' package.json > package.json.tmp && mv package.json.tmp package.json
# CHANGELOG.md heading rewritten via Edit: ## 0.1.0-rc.0 → ## 1.0.0-rc.1
```

After the override:
- `jq -r .version package.json` → `1.0.0-rc.1` ✓
- `head -3 CHANGELOG.md` → starts with `# @nirajk/express-controllers` then `## 1.0.0-rc.1` ✓
- `grep -c '@' CHANGELOG.md` shows the seed changeset's bullets all present (`JsonController`, `useContainer`, `getRequestContext`, `Standard Schema`, `provenance`-relevant items, `HttpError`, etc.) — 19 of 19 bullets carried through.

**Step 3 — Post-bump pre-flight (all green):**

| # | Command | Result |
|---|---------|--------|
| 1 | `pnpm install --frozen-lockfile` | ✓ (lockfile already in sync — version-only change) |
| 2 | `pnpm test:forks` | ✓ 569/569 |
| 3 | `pnpm build` | ✓ banner now reads `@nirajk/express-controllers@1.0.0-rc.1` |
| 4 | `pnpm test:build` | ✓ 11/11 |
| 5 | `pnpm exec attw --pack . --profile node16` | ✓ |
| 6 | `pnpm exec publint` | ✓ "All good!" |

**Step 4 — Staged + committed.** All staged files are non-source: `package.json`, `CHANGELOG.md`, `.changeset/pre.json`. No code changes. Commit `2f75cf7`.

### Task 2 — User decision checkpoint (PENDING — see "Awaiting" below)

Not executed. This is a `checkpoint:decision` task. Auto-mode policy would auto-select the first option (Path A — GitHub Actions), but the orchestrator override forbids the executor from triggering an `npm publish` (one-way operation with no rollback after 72h). Halted here for user input.

### Task 3 — Execute publish (PENDING — depends on Task 2)

Not executed. Requires Task 2 decision and live credentials (`NPM_TOKEN` in shell or in GitHub Actions secrets).

### Task 4 — Fresh-project smoke install (PENDING — depends on Task 3)

Not executed. Cannot run until `@nirajk/express-controllers@1.0.0-rc.1` exists on the npm registry.

## Acceptance Criteria — Task 1 only

- [x] `jq -r .version package.json` prints `1.0.0-rc.1` ✓
- [x] `CHANGELOG.md` exists at repo root and contains the string `1.0.0-rc.1` at heading depth `## ` ✓
- [x] `CHANGELOG.md` contains at least 5 of the seed bullets (`JsonController`, `useContainer`, `getRequestContext`, `Standard Schema`, provenance/HttpError) — all 19 bullets present ✓
- [x] All 11 pre-flight commands exit 0 (Step 1 + Step 3) ✓
- [x] `git diff --cached --name-only` showed only `package.json`, `CHANGELOG.md`, `.changeset/pre.json` ✓
- [⚠️] `.changeset/initial-release.md` no longer exists — **partial.** The file is still on disk but `.changeset/pre.json#changesets` records it as consumed (`["initial-release"]`). This is Changesets pre-mode behavior — consumed changesets are retained in the working tree until `pnpm changeset pre exit`, at which point `pre exit` deletes them in a single sweep before the final stable release. The plan's acceptance bullet pre-dated this nuance. Not a bug; documented decision.

## Deviations from Plan

### [Rule 0 — Plan-authorized] Manual version override 0.1.0-rc.0 → 1.0.0-rc.1

- **Found during:** Task 1 Step 2.
- **Issue:** `pnpm changeset version` produced `0.1.0-rc.0` (Changesets' arithmetic from `initialVersions: 0.0.0` + minor bump + pre-tag `rc`), but D-03 locks the RC ladder at `1.0.0-rc.1`.
- **Fix:** Applied the override path explicitly authorized by the plan: `jq '.version = "1.0.0-rc.1"'` on `package.json`; Edit on `CHANGELOG.md` heading.
- **Files:** `package.json`, `CHANGELOG.md`.
- **Commit:** `2f75cf7`.
- **Forward implication for the next plan:** When Phase 6 (or follow-up) drops pre-mode (`changeset pre exit && changeset version`), the resulting version will continue from `1.0.0-rc.1` → `1.0.0` cleanly because Changesets reads the current `package.json#version` as the baseline. The override does not poison the future release ladder.

### [Pre-mode behavior, not a bug] Consumed changeset retained in `.changeset/`

- **Issue:** Plan's acceptance bullet expects `.changeset/initial-release.md` to be deleted after `changeset version`.
- **Reality:** Changesets pre-mode retains consumed changeset `.md` files until `changeset pre exit`. Their consumed state is tracked in `.changeset/pre.json#changesets`. Deletion happens in a batched sweep at pre-exit time. This is documented Changesets behavior, not a bug — see https://github.com/changesets/changesets/blob/main/docs/prereleases.md.
- **Action:** Documented; no code change.

### [Orchestrator policy override] Halted before publish

- **Issue:** Plan tasks 2–4 are `checkpoint:decision` + actual `npm publish` + post-publish smoke install. Auto-mode default would auto-approve the checkpoint and execute `pnpm release`.
- **Override:** Orchestrator instructions explicitly direct: "If the plan's final task is `npm publish` itself or pushing tags to remote, prepare everything up to but not including the publish (commit version bump, generate CHANGELOG, run all gates), then return with a checkpoint describing what's ready to ship."
- **Action:** Stopped after Task 1 commit. Tasks 2–4 wait on user input.

## Awaiting

**The repository is ready to ship `1.0.0-rc.1`.** Required user input before Task 2/3/4 can execute:

### Decision (Task 2)

Choose one:

- **Path A — GitHub Actions release flow (D-08 canonical, recommended).** Requires:
  - [ ] `NPM_TOKEN` set in GitHub repo Settings → Secrets and variables → Actions → New repository secret. Token must have publish scope for `@nirajk/*` (or be an account-wide automation token).
  - [ ] (Optional, for the docs site) GitHub Pages enabled (Source: `gh-pages` branch, root path).
  - [ ] You own the `@nirajk` npm scope.

- **Path B — Local `pnpm release`.** Requires:
  - [ ] `NPM_TOKEN` exported in your local shell, or `~/.npmrc` contains a publish-scope token.
  - [ ] `npm whoami` returns the @nirajk owner.

- **Path C — Abort.** No publish; revert the staged commit, resume later.

### Resume signal

Reply to the orchestrator with one of: `path-a` / `path-b` / `path-c`.

### What ships when the user picks path-a or path-b

- `@nirajk/express-controllers@1.0.0-rc.1` published to npm under dist-tag `next` (D-03).
- Provenance attestation via OIDC (path-a only) or local-token publish (path-b — no provenance).
- (path-a) gh-pages docs site live at `https://nirajk.github.io/express-controllers/`.
- Smoke-install rehearsal in fresh `/tmp` project (Task 4) running the README's 30-line example end-to-end.

### Watch-list during the eventual publish (Task 3 follow-ups for the next executor)

1. **dist-tag verification.** After `pnpm release` runs, immediately run `npm view @nirajk/express-controllers dist-tags`. D-03 mandates `next: 1.0.0-rc.1`. If Changesets pre-mode silently overrode `--tag next` and published under `rc:`, re-tag with: `npm dist-tag add @nirajk/express-controllers@1.0.0-rc.1 next`.
2. **Provenance attestation (RESEARCH A1).** After path-a, verify on npm UI (or `npm view @nirajk/express-controllers --json | jq .dist.attestations`) that the package has a Sigstore attestation bundle. If missing, document for follow-up — the package itself ships either way, but the supply-chain provenance story requires the attestation.
3. **README smoke test (Task 4 / DOCS-01).** Extract the README's 30-line example via the `awk` helper in the plan, run with `tsx index.ts`, and curl the three smoke endpoints (`GET /users/42`, valid `POST /users`, malformed `POST /users` → expect 400). Any failure = release-blocker; queue an `rc.2` changeset and re-run.

## Pre-flight Gate Snapshot

Recorded for the next executor's audit:

- Version: `1.0.0-rc.1` (in `package.json`)
- Tree status pre-commit: `M package.json`, `M .changeset/pre.json`, `?? CHANGELOG.md`
- Commit: `2f75cf7 chore(05-07): version packages (1.0.0-rc.1)`
- Test count: 569 tests across 52 files (forks + threads runs both green)
- Build artifacts in `dist/{esm,commonjs}` reflect version `1.0.0-rc.1` in source-map banners
- attw profile node16: all 4 resolution modes green; node10 ignored per package config
- publint: "All good!"

## Threat Flags

None — version bump + CHANGELOG generation only. No new code surface, no schema changes, no auth boundaries touched. Provenance attestation (when path-a runs) tightens the supply-chain story (positive).

## Known Stubs

None. The plan's "stub" risk surface is the `<GITHUB_PAGES_URL>` placeholder, which Plan 05-06 already resolved to the live URL.

## Self-Check: PASSED

Files created (verified present on disk):
- `CHANGELOG.md` ✓
- `.planning/phases/05-adapter-packages-build-docs-migration-publish/05-07-SUMMARY.md` ✓ (this file)

Files modified (verified):
- `package.json` (version field is `1.0.0-rc.1`) ✓
- `.changeset/pre.json` (`changesets` array contains `initial-release`) ✓

Commits (verified in `git log --oneline -1`):
- `2f75cf7` — chore(05-07): version packages (1.0.0-rc.1) ✓

Pending (out of scope for this checkpoint return — will execute on resume):
- Task 2: User picks publish path
- Task 3: `npm publish` (one-way, requires credentials)
- Task 4: Fresh-project smoke install (DOCS-01 acceptance test)
