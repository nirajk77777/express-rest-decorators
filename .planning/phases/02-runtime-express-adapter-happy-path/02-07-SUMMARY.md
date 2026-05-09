---
phase: 02-runtime-express-adapter-happy-path
plan: 07
subsystem: integration
tags: [acceptance, success-criteria, grep-gates, integration, verifier-target]
requires: [02-01, 02-02, 02-03, 02-04, 02-05, 02-06]
provides:
  - "Executable proof that Phase 2 SC #1-#5 hold end-to-end (tests/integration/02-sc-acceptance.test.ts)"
  - "Structural invariants enforced by grep gates: Express isolation, no try/catch outside wrapper, exactly-once error middleware mount, body-parser asymmetry, no reflect-metadata leak, public barrel surface (tests/integration/02-grep-gates.test.ts)"
affects:
  - "Phase 2 verification — /gsd-verify-work reads these tests to confirm SC pass"
  - "Future phases — gates will catch regressions if Phase 3 wiring breaks isolation"
tech-stack:
  added: []
  patterns:
    - "FS-based grep gate helper (Node fs + comment-strip + JS RegExp), tooling-agnostic; mirrors Phase 1 grep-gates pattern from 01-06"
    - "One describe per ROADMAP SC, quoting the SC verbatim — verifier reads pass/fail directly"
    - "Self-contained inline fixtures per SC describe — independent of other plans' shared fixtures"
    - "Multi-vendor schema acceptance: Zod (body), Valibot (query), ArkType (params) all in one acceptance file via Standard Schema spec"
    - "Counter-middleware-between-routers pattern proves single-fire of error chain (mount with defaultErrorHandler:false, inject counter, second useExpressControllers([]) to mount lib middleware last)"
key-files:
  created:
    - tests/integration/02-sc-acceptance.test.ts
    - tests/integration/02-grep-gates.test.ts
  modified: []
decisions:
  - "SC #3 single-fire test mounts the counter middleware AFTER controllers (via defaultErrorHandler:false) and BEFORE the lib middleware (via a second useExpressControllers([])) — Express runs error middlewares only AFTER the failing route's stack position, so a counter mounted before useExpressControllers would not see route-handler errors"
  - "SC #2 ArkType params slot uses 'string.numeric.parse' to coerce numeric strings — mirrors Zod's z.coerce.number() so the assertion shape (id: 42, number) is consistent across vendors"
  - "SC #5 stream test uses Readable.from(['chunk-a','chunk-b']) — already a stream (.pipe present), takes the stream-first branch in writeResponse, not the async-iterable branch"
  - "Gate 2 allow-list includes all six adapter source files that import Express today (router-build, boot, handler-wrapper, error-middleware, response, validation); boot-options.ts must remain pure-type-only and is explicitly excluded — gate fails loudly if Express leaks there"
  - "Gate 8 parses re-export blocks `{ ... }` rather than full ESM AST; supports both `export { X } from './adapter/...'` and `export type { X } from './adapter/...'`; sufficient because Phase 2 doesn't use star re-exports from adapter/"
metrics:
  duration: ~12 minutes
  completed: 2026-05-09
  commits: 2
  tasks_completed: 2
  files_created: 2
  files_modified: 0
requirements: [API-01, API-02, API-03, ROUTE-04, ROUTE-05, INPUT-01, INPUT-02, INPUT-03, ERR-03, ERR-05, RES-08, BUILD-03]
---

# Phase 2 Plan 07: End-to-End SC Acceptance Summary

**One-liner:** Convert ROADMAP Phase 2's five Success Criteria + structural invariants into 31 executable Vitest tests (23 SC behavioral + 8 grep gates), making Phase 2 acceptance non-subjective and regression-proof.

## What was built

### `tests/integration/02-sc-acceptance.test.ts` — 23 behavioral tests

One `describe` per ROADMAP SC, quoting the SC verbatim:

- **SC #1 (3 tests)** — `createExpressServer` mounts body-parsers and routes; `useExpressControllers` honors `routePrefix` across multiple controllers; controller inheritance exposes both inherited and own routes (Phase 1 D-06 subclass-wins).
- **SC #2 (4 tests)** — Zod body, Valibot query, ArkType params all happy-path; multi-slot failure → single `BadRequestError` 400 with aggregated `details[]` carrying both `body` and `params` slot issues plus `source: 'MultiCtl.boom'` (D-16 attribution via `wrapAction`).
- **SC #3 (4 tests)** — Async throw → 500 `InternalServerError` envelope with `source` ending `.boom`; `HttpError` subclass throw preserves `toJSON` shape and status (404 with `name: 'NotFoundError'`); pre-headers single-fire counter middleware proves error chain visits exactly once; post-headers stream-error fires `headersSent` guard without surfacing `ERR_HTTP_HEADERS_SENT` to the process.
- **SC #4 (5 tests)** — All four v4 footguns (`*`, `:id?`, `:id(\d+)`, `(.*)`) throw at boot with `[FixtureX.method] Path "..." uses v4 pattern "..."; ... "<v8 fix>" instead.`; valid v8 patterns (`/files/*splat`, `/users{/:id}`) work end-to-end including the optional-segment case (route matches both `/v8/users` and `/v8/users/7`).
- **SC #5 (7 tests)** — Object → JSON; primitive → JSON; null → 204 default; string → text/html (`@Controller`); Readable stream piped; async iterable piped via `Readable.from`; `@Header('X-Custom-Header', 'phase2')` decorator end-to-end (Phase 1 metadata → Phase 2 `applyResponseHandlers` → wire).

### `tests/integration/02-grep-gates.test.ts` — 8 structural gates

FS-based with comment-strip + JS RegExp (mirrors Phase 1 pattern):

1. **Express isolation** — zero `from 'express'` imports outside `src/adapter/` (catches accidental leak into core).
2. **Adapter Express importers** — non-empty allow-list of six files; `boot-options.ts` explicitly excluded (must stay pure-type-only).
3. **Single try/catch source** — `src/adapter/` has zero `try {` blocks except in `handler-wrapper.ts` (Pitfall A — exactly one source-attribution wrapper).
4. **Single error-middleware mount** — `app.use(libraryErrorMiddleware)` literal appears exactly once in `boot.ts`.
5. **Body-parser asymmetry (D-02)** — `express.json` and `express.urlencoded` appear inside `createExpressServer` body but NOT inside `useExpressControllers` body.
6. **Single buildMetadata** — `useExpressControllers` body contains exactly one `buildMetadata(` call.
7. **No reflect-metadata in Phase 2** — `src/adapter/` has zero `from 'reflect-metadata'` imports (Phase 1 D-02 reserves that for the consumer entry point).
8. **Public barrel surface** — every adapter symbol re-exported by `src/index.ts` is in the allowed set `{useExpressControllers, createExpressServer, BootOptions, AuthorizationChecker, CurrentUserChecker}`; explicit forbidden list catches accidental internal leaks (`buildControllerRouter`, `resolveInputs`, `writeResponse`, `wrapAction`, `libraryErrorMiddleware`, `composePath`, `detectV4Pattern`, `applyResponseHandlers`, `isStandardSchema`, `renderPath`, `makeHandlerFactory`).

## Test results

- `npx vitest run tests/integration/02-sc-acceptance.test.ts` → **23 passed**
- `npx vitest run tests/integration/02-grep-gates.test.ts` → **8 passed**
- Full suite: **22 test files, 240 tests passing** (was 209 before; +31 from this plan)
- `npx tsc --noEmit` → clean

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] SC #3 single-fire counter test asserted counter === 1 but counter === 0**

- **Found during:** Task 1 first run
- **Issue:** Initial implementation mounted the counter middleware via `app.use(errorMiddleware)` BEFORE `useExpressControllers`. Express only invokes error middlewares declared AFTER the failing route's stack position, so the counter never saw the route handler's thrown error.
- **Fix:** Mount controllers via `useExpressControllers(app, { ..., defaultErrorHandler: false })` first, then `app.use(counter)`, then a second `useExpressControllers(app, { controllers: [] })` call to mount the lib middleware last. This places the counter between routes and lib handler so it sees the error exactly once before the lib middleware writes the 500 envelope.
- **Files modified:** `tests/integration/02-sc-acceptance.test.ts`
- **Commit:** `c03d325` (still part of Task 1's atomic commit — fix happened before commit)

No other deviations. Plan executed exactly as written.

## Acceptance Criteria — Coverage

| Plan acceptance criterion | Status |
|---|---|
| File has five `describe` blocks, one per SC (`grep -cE "^describe\\('SC #[1-5]"` >= 5) | PASS — `grep -cE "^describe\\('SC #[1-5]" tests/integration/02-sc-acceptance.test.ts` returns 5 |
| All `it` cases pass | PASS — 23/23 |
| SC #2 ≥ 4 it cases | PASS — 4 (Zod, Valibot, ArkType, multi-slot failure) |
| SC #4 ≥ 5 it cases | PASS — 5 (4 footgun rejections + 1 v8-works) |
| SC #5 ≥ 7 it cases | PASS — 7 (object, primitive, null→204, string→text, stream, iter, @Header) |
| SC #3 includes pre-headers single-fire AND post-headers headersSent guard | PASS — both `error middleware fires exactly once` and `post-headers stream error → headersSent guard` |
| ≥ 8 grep gates | PASS — 8 |
| All gates pass | PASS — 8/8 |
| Gate 1 zero `from 'express'` outside src/adapter/ | PASS |
| Gate 3 zero try/catch in src/adapter/ except handler-wrapper.ts | PASS |
| Gate 4 exactly one `app.use(libraryErrorMiddleware)` | PASS |
| Gate 5 body-parser only in createExpressServer | PASS |
| Gate 8 public barrel doesn't leak adapter internals | PASS |

## Phase 2 Done — Final Status

- All five ROADMAP Phase 2 SCs have executable behavioral proof (23 tests).
- Structural invariants enforceable by 8 grep gates.
- Full Phase 2 test surface: 240 tests across 22 files, all green.
- `npx tsc --noEmit` clean.
- Phase 2 ready for `/gsd-verify-work`.

## Self-Check: PASSED

- `tests/integration/02-sc-acceptance.test.ts` — FOUND
- `tests/integration/02-grep-gates.test.ts` — FOUND
- Commit `c03d325` (SC acceptance) — FOUND
- Commit `452d953` (grep gates) — FOUND
