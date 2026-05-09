---
phase: 02-runtime-express-adapter-happy-path
plan: 01
subsystem: adapter-foundation
tags: [foundation, devdeps, validation, boot-options, fixtures]
requires: [01-04, 01-06]
provides:
  - "Widened ValidationIssue (slot + string|array path) — D-08 emitter ready"
  - "BootOptions interface with every API-03 key typed"
  - "src/adapter/ scaffold + Wave 2 marker barrel"
  - "Reusable Zod/Valibot/ArkType + controller fixtures for tests/adapter/"
affects:
  - src/errors/http-error.ts
  - src/errors/subclasses.ts (consumer; remains compiling)
  - package.json
  - package-lock.json
tech-stack:
  added: [express@5.1.0, "@types/express@5", supertest@7, "@types/supertest@6", zod@4, valibot@1, arktype@2]
  patterns: ["Standard Schema fixture trio (Zod/Valibot/ArkType)", "Wave-conflict-free barrel marker pattern"]
key-files:
  created:
    - src/adapter/boot-options.ts
    - src/adapter/index.ts
    - tests/adapter/boot-options.test.ts
    - tests/adapter/fixtures/controllers.ts
    - tests/adapter/fixtures/schemas.ts
    - tests/adapter/fixtures/fixtures.test.ts
  modified:
    - src/errors/http-error.ts
    - tests/errors/http-error.test.ts
    - package.json
    - package-lock.json
decisions:
  - "ValidationIssue widened additively (option 1 from RESEARCH.md §VAL-DETAILS-SHAPE) — slot optional, path accepts string OR ReadonlyArray<PropertyKey>; Phase 1 BadRequestError still typechecks unchanged."
  - "BootOptions includes Phase 3/4 keys (middlewares, interceptors, cors, authorizationChecker, currentUserChecker, printRoutes) typed but no-op in Phase 2 — keeps the public type stable across phases."
  - "src/adapter/index.ts pre-seeded with one comment marker per Wave 2 plan (02-02..02-05) so parallel plans append to disjoint regions and never conflict at the barrel."
  - "Used npm (existing package-lock.json) rather than pnpm — project already initialised with npm in Phase 1; no functional impact on the published artifact."
  - "peerDependenciesMeta.express flipped from optional:true → optional:false per BUILD-03 (express is a hard peer requirement, not optional)."
metrics:
  duration: ~5 minutes
  completed: 2026-05-09
  tasks: 4
  test_count_delta: "+8 (88 → 96)"
---

# Phase 2 Plan 01: Foundation — Devdeps, ValidationIssue, BootOptions

Foundation work for Phase 2: widened `ValidationIssue` for D-08 emission, installed Phase 2 dev/peer deps (express + supertest + zod + valibot + arktype), and shipped the `BootOptions` contract plus a Wave-conflict-free `src/adapter/` barrel scaffold and reusable test fixtures.

## What Shipped

### Task 1 — Widen `ValidationIssue` (commit `502e1d2`)

`src/errors/http-error.ts`:
- Added `ValidationSlot = 'params' | 'query' | 'body' | 'headers'`.
- `ValidationIssue.slot?: ValidationSlot` (optional, backward compat).
- `ValidationIssue.path: string | ReadonlyArray<PropertyKey>` (accepts both shapes).
- `tests/errors/http-error.test.ts` adds three assertions covering string-path, legacy array-path, and BadRequestError JSON round-trip.
- `src/errors/index.ts` already wildcards from `./http-error.js`, so `ValidationSlot` propagates without an explicit re-export.

### Task 2 — Phase 2 dependencies (commit `3cfd0de`)

`package.json`:
- `peerDependencies.express ^5.1.0` (already present from Phase 1, kept).
- `peerDependenciesMeta.express.optional`: `true` → `false` (Express is a hard peer for this library).
- `devDependencies` added: `express ^5.1.0`, `@types/express ^5`, `supertest ^7`, `@types/supertest ^6`, `zod ^4`, `valibot ^1`, `arktype ^2`.
- Express stays out of `dependencies` — peer + dev only.
- `package-lock.json` regenerated.
- All five packages resolve via `require.resolve`.

### Task 3 — `BootOptions` + adapter scaffold (commit `058c9f8`)

`src/adapter/boot-options.ts`:
- `BootOptions` interface with every API-03 key (controllers, routePrefix, defaultErrorHandler, middlewares, interceptors, cors, validation, authorizationChecker, currentUserChecker, printRoutes).
- `AuthorizationChecker` and `CurrentUserChecker` Phase-3 type stubs.

`src/adapter/index.ts`:
- Internal barrel re-exporting `BootOptions`, `AuthorizationChecker`, `CurrentUserChecker`.
- Four trailing comment markers (`// 02-02 router-build exports` … `// 02-05 error-middleware + handler-wrapper exports`) so Wave 2 plans append into disjoint sections.

`tests/adapter/boot-options.test.ts`:
- Minimal options accepted.
- Full options (every API-03 key) accepted at compile time.
- `controllers` is the only required key (verified via `expectTypeOf`).

`src/index.ts` is **not** wired to `src/adapter/index.ts` yet — Plan 02-06 owns that.

### Task 4 — Adapter test fixtures (commit `24539e1`)

`tests/adapter/fixtures/schemas.ts`:
- `zodUserBody`, `zodIdParams`, `valibotUserBody`, `arktypeUserBody` — one per Standard Schema vendor; consumed by Wave 2/4 plans.

`tests/adapter/fixtures/controllers.ts`:
- `UsersController` (JsonController, body/params validation, OnNull/OnUndefined).
- `TextController` (Controller, string + Buffer responses).
- `BaseController` / `DerivedController` (inheritance fixture for ROUTE-05 subclass-wins).
- All decorator imports verified against `src/decorators/index.ts` actual exports — no guesswork.

`tests/adapter/fixtures/fixtures.test.ts` — `buildMetadata([...])` returns 4 controllers, all with non-empty `actions`.

## Verification

| Check                           | Result                            |
| ------------------------------- | --------------------------------- |
| `tsc --noEmit`                  | Clean (exit 0)                    |
| Full vitest run                 | 96 / 96 passing (was 88 pre-plan) |
| `tests/adapter/`                | 4 / 4 passing                     |
| `tests/errors/http-error.test`  | 9 / 9 passing                     |
| `node -e require('express')`    | OK                                |
| `node -e require('supertest')`  | OK                                |
| `node -e require('zod')`        | OK                                |
| `node -e require('valibot')`    | OK                                |
| `node -e require('arktype')`    | OK                                |
| Wave 2 markers in adapter/index | 4 / 4 present                     |
| `src/index.ts` adapter wiring   | Absent (correct — owned by 02-06) |

## Deviations from Plan

### `[Rule 3 — Blocking]` npm cache permission corruption

The plan specifies `pnpm install` but pnpm is not on `PATH` in this environment, and the project's existing lockfile is `package-lock.json` (npm). The first `npm install` failed with `EACCES` on a stale root-owned directory inside `~/.npm/_cacache/content-v2/sha512/08`. Worked around by passing `--cache /tmp/npm-cache-rce` plus `--no-package-lock` for the install reify, then `--package-lock-only` to regenerate the lockfile. Net result: lockfile updated cleanly, all five new packages resolved, no pnpm artefact introduced.

### `[Rule 1 — Bug]` `peerDependenciesMeta.express.optional`

`package.json` already declared `express` as a peer in Phase 1 but with `optional: true`. BUILD-03 and the plan's `must_haves.truths` require Express as a non-optional peer. Flipped to `false` as part of Task 2.

### Plan vs reality: `pnpm` → `npm`

All `pnpm` invocations in the plan (verify blocks and acceptance criteria) executed via `npm` / `npx` instead. No functional difference for the artefacts produced.

## Auth Gates

None.

## Known Stubs

None — all code paths typed and tested. Phase 3/4 BootOptions keys are intentionally typed-but-runtime-ignored per D-03; this is contract design, not a stub.

## Threat Flags

None — no new network surface, auth surface, or trust-boundary IO introduced (devDeps + types + fixtures only).

## Self-Check: PASSED

- `src/errors/http-error.ts` — FOUND (modified, ValidationSlot + widened ValidationIssue present)
- `src/adapter/boot-options.ts` — FOUND
- `src/adapter/index.ts` — FOUND (4 Wave 2 markers verified via grep)
- `tests/adapter/boot-options.test.ts` — FOUND
- `tests/adapter/fixtures/schemas.ts` — FOUND
- `tests/adapter/fixtures/controllers.ts` — FOUND
- `tests/adapter/fixtures/fixtures.test.ts` — FOUND
- Commit `502e1d2` (task 1) — FOUND
- Commit `3cfd0de` (task 2) — FOUND
- Commit `058c9f8` (task 3) — FOUND
- Commit `24539e1` (task 4) — FOUND
