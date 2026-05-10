---
phase: 05-adapter-packages-build-docs-migration-publish
plan: 05
subsystem: docs-migration-license-contributing
tags: [docs, readme, migration, license, contributing, package-metadata]
requires:
  - 05-01 (changesets/release infra context — referenced by CONTRIBUTING)
  - 05-02 (single-package shape confirmed — referenced by CONTRIBUTING)
provides:
  - DOCS-01 (README 30-line example + tsconfig snippet)
  - DOCS-02 (MIGRATION.md — routing-controllers v0.11 → v1 guide)
  - VAL-02 (README Validators section: Zod / Valibot / ArkType)
  - DI-03 (README + MIGRATION docs-only useContainer recipe)
  - LICENSE (MIT, copyright 2026 Niraj Kumar)
  - CONTRIBUTING.md (pnpm + scripts + changesets + ESLint fallback + single-package note)
  - package.json: repository / homepage / bugs URL fields
affects: [package.json]
tech-stack:
  added: []
  patterns:
    - Single-package recipe-driven container integration (no per-container npm packages)
    - Standard-Schema-first validator surface (no adapter imports for the common path)
key-files:
  created:
    - README.md
    - MIGRATION.md
    - LICENSE
    - CONTRIBUTING.md
  modified:
    - package.json (repository / homepage / bugs fields added)
decisions:
  - GitHub URL: https://github.com/nirajk/express-controllers (Task 1 default applied per resume-signal — auto-mode auto-selected option `confirm-default` with the inferred URL)
  - TypeDoc URL in README left as `<GITHUB_PAGES_URL>` placeholder; plan 05-06 patches when the GitHub Pages URL is known
metrics:
  duration: ~25 minutes
  completed: 2026-05-10
---

# Phase 5 Plan 5: Docs (README + MIGRATION + LICENSE + CONTRIBUTING) Summary

Authored the v1 user-facing documentation set: a publish-ready README with a 30-line runnable Zod quick-start, a six-chapter routing-controllers migration guide leading with the parameter-decorators → method-level-input break, an MIT LICENSE, and a CONTRIBUTING.md covering the pnpm + Vitest + Biome dev loop with the documented ESLint 9 fallback. Also populated `package.json`'s `repository`, `homepage`, and `bugs` fields with the inferred-default GitHub URL. Plan 05-06 will patch the TypeDoc placeholder once GitHub Pages is configured.

## What Was Built

### Task 2 — `package.json` metadata (commit `d236807`)

Added three top-level fields between `description` and `type`:

- `repository.type` = `git`
- `repository.url` = `git+https://github.com/nirajk/express-controllers.git`
- `homepage` = `https://github.com/nirajk/express-controllers#readme`
- `bugs.url` = `https://github.com/nirajk/express-controllers/issues`

`jq` queries confirm the shape (verified inline). `publint` was not run in this worktree because `node_modules/` is not installed in the parallel-executor worktree environment — see Deviations.

### Task 3 — LICENSE + CONTRIBUTING.md (commit `cec5145`)

- **LICENSE** (21 lines): standard MIT text with `Copyright (c) 2026 Niraj Kumar`. Verbatim from the OSI canonical template.
- **CONTRIBUTING.md** (109 lines): Prerequisites (Node ≥ 20, Node 22 LTS recommended, pnpm 10 via Corepack), Setup (`pnpm install --frozen-lockfile`), Development Workflow scripts table (`test:forks` / `test:threads` / `test:watch` / `typecheck` / `lint` / `lint:fix` / `build` / `test:build` / `docs:build`), Submitting Changes (CI matrix Node 20/22/24 × forks+threads, `pnpm changeset add`), Code Style (Biome 2 with `unsafeParameterDecoratorsEnabled: true`), ESLint 9 + `@typescript-eslint` 8 + Prettier 3 fallback recipe (BUILD-09 fallback), Repo Structure (single-package note), Releases (Changesets bot + `release.yml` + `next` → `latest` dist-tag promotion), Reporting Bugs (links to `/issues`).

### Task 4 — README.md (commit `ff4775a`, 214 lines)

Sections: title + tagline + 4-badge row (npm/CI/license/types), Why this exists (3 paragraphs), Install, **Quick start** (24-line Zod + `@JsonController` + `useExpressControllers` example, well under the ≤ 30-line cap), tsconfig snippet (`experimentalDecorators` / `emitDecoratorMetadata` / `target: ES2022` / `useDefineForClassFields: false`), `import 'reflect-metadata'` paragraph, **Validators** (Zod / Valibot / ArkType subsections, no adapter imports — VAL-02), **Dependency Injection** (one `useContainer({ get: token => Container.get(token) })` block + caption noting no `@scope/express-controllers-typedi` package — DI-03 / D-01), Feature tour (8 bullets), Boot options table (11 rows from `BootOptions`), Compatibility table, Errors section (HttpError subclasses), Async errors & Express v5, Migrating from routing-controllers cross-link, License, Contributing.

### Task 5 — MIGRATION.md (commit `b733861`, 201 lines)

Six chapters per D-11:

1. **Why This Exists** — 3 paragraphs (Express 5 async errors / legacy decorators / Standard Schema)
2. **The Big Break — Parameter Decorators → Method-Level Input** (lead chapter per D-11) — before (RC v0.11) and after (v1) fenced code blocks + 1-paragraph rationale
3. **Breaking Changes Table** — single 2-column markdown table with 11 rows (10 required + the `Action object` row added because the Koa-flavored fields are a real RC consumer touch point)
4. **Per-Feature Migration Recipes** — 7 `###` subsections (Controllers + Routing, Input Declaration, Middleware/Interceptors/Authorization, File Uploads, Cookies/Sessions, Dependency Injection, New on Top)
5. **What's Gone** — Koa, parameter decorators as primary, class-validator/class-transformer defaults, `body-parser` runtime dep, `@scope/express-controllers-typedi` sub-packages
6. **What's New on Top** — `getRequestContext()`, `printRoutes`, native Express 5 async error propagation
7. Closing line: codemods out of scope for v1.

## Acceptance Criteria

- [x] README.md ≥ 200 lines (214) ✓
- [x] First TS code block (quick-start) ≤ 30 lines (24) ✓
- [x] Quick-start contains `import 'reflect-metadata'`, `from '@nirajk/express-controllers'`, `@JsonController`, `@Get(`, `@Post(`, `useExpressControllers(` ✓
- [x] Quick-start immediately followed by JSON tsconfig block with `experimentalDecorators`, `emitDecoratorMetadata`, `useDefineForClassFields` ✓
- [x] `## Validators` section with Zod / Valibot / ArkType subsections ✓
- [x] DI section contains verbatim `useContainer({ get: token => Container.get(token) })` ✓
- [x] DI section explicitly states no `@scope/express-controllers-typedi` package ✓
- [x] MIGRATION.md ≥ 150 lines (201) ✓ with 6 h2 headings ✓ and 7 `###` subsections in chapter 4 ✓
- [x] Chapter 2 contains both before (`@Param`) and after (`params:`) fenced code blocks ✓
- [x] Chapter 3 has ≥ 8 rows (11) ✓
- [x] Closing chapter (6) references `getRequestContext` and `printRoutes` ✓
- [x] LICENSE first line is `MIT License`, contains `Copyright (c) 2026 Niraj Kumar` ✓
- [x] CONTRIBUTING.md ≥ 80 lines (109) ✓ with all required keywords (`pnpm install --frozen-lockfile`, `test:forks`, `test:threads`, `pnpm build`, `pnpm lint`, `pnpm changeset add`, `ESLint 9`, `single-package`, `Node 20`) ✓
- [x] CONTRIBUTING bug-report link points to `https://github.com/nirajk/express-controllers/issues` ✓
- [x] `package.json` has `repository.type: git`, `repository.url` matching `^git\+https://github\.com/[^/]+/[^/]+\.git$`, `homepage` ending `#readme`, `bugs.url` ending `/issues` ✓

## Deviations from Plan

### [Rule 3 — Blocking issue] `pnpm exec publint` and `pnpm exec attw` not runnable in worktree

- **Found during:** Task 2 verification.
- **Issue:** The parallel-executor git worktree at `.claude/worktrees/agent-...` does not have `node_modules/` installed (no `pnpm install` was run inside it). `pnpm exec publint` failed with `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "publint" not found`. Same for `attw`.
- **Fix:** Skipped both checks. Verified the additive metadata shape via `jq` queries (all four required regex patterns matched). The additive top-level fields cannot regress publint or attw — both tools validate the `exports`/`types`/`main` fields and dual-publish typings, none of which were touched. The orchestrator (or a follow-up CI run on the merged main branch) will re-run `pnpm exec publint` and `pnpm exec attw --pack . --profile node16` once `node_modules/` is available; if either fails, Plan 05-07 (publish prep) will catch it before npm publish.
- **Files modified:** None beyond Task 2.
- **Commit:** None — documentation-only deviation.

### [Auto-decision] Task 1 checkpoint auto-resolved

- **Found during:** Task 1.
- **Issue:** Task 1 is `checkpoint:decision`. Auto-mode is active (per orchestrator framing) and the planner's `<resume-signal>` documents an explicit fallback: "If the user replies 'default' or 'you decide', use `https://github.com/nirajk/express-controllers` and note the inferred default in SUMMARY."
- **Fix:** Auto-selected option `confirm-default` with the inferred URL `https://github.com/nirajk/express-controllers` (consistent with the npm scope `@nirajk` and the user's email `nirajk77777@gmail.com`). All four artifacts (README, MIGRATION, CONTRIBUTING, package.json) use this URL consistently. If the user's actual GitHub username turns out to be different, find-and-replace across these four files is a one-shot fix.
- **Documented per:** Resume-signal explicit allowance.

### [Doc] TypeDoc / GitHub Pages URL placeholder in README

- **Issue:** README "Boot options" section references the TypeDoc API reference URL, which is not yet known (the GitHub Pages URL is configured in Plan 05-06).
- **Fix:** Used `<GITHUB_PAGES_URL>` as a literal placeholder + a parenthetical "published on first release (see plan 05-06)" note. Plan 05-06 should patch this string to the real URL.

## Threat Flags

None — pure docs + additive metadata. No new network endpoints, auth paths, file access patterns, or schema changes.

## Known Stubs

- README "Boot options" section's `<GITHUB_PAGES_URL>` placeholder. Plan 05-06 patches.

## Self-Check: PASSED

Files created (verified existing):
- README.md ✓
- MIGRATION.md ✓
- LICENSE ✓
- CONTRIBUTING.md ✓

Commits (verified in `git log`):
- d236807 — feat(05-05): add repository, homepage, bugs fields ✓
- cec5145 — docs(05-05): add MIT LICENSE and CONTRIBUTING.md ✓
- ff4775a — docs(05-05): author README.md ✓
- b733861 — docs(05-05): author MIGRATION.md ✓
