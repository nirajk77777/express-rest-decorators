---
phase: 02-runtime-express-adapter-happy-path
plan: 05
subsystem: adapter
tags: [error-handling, async, express-v5, error-middleware, source-attribution]
requires: [02-01]
provides:
  - "wrapAction(controllerMeta, actionMeta, invokeAction) → RequestHandler"
  - "libraryErrorMiddleware (4-arg Express error middleware)"
  - "type InvokeAction"
affects:
  - 02-06 boot-wire-public-api (consumes wrapAction + libraryErrorMiddleware)
  - 02-07 end-to-end SC acceptance (validates ERR-03/ERR-05)
tech-stack:
  added: []
  patterns:
    - "Source-attribution wrapper: thin try/catch around invokeAction; never replaces v5 native rejection forwarding"
    - "Single 4-arg Express error middleware mounted last (Phase 3 user @Middleware after-handlers will mount AHEAD of it)"
    - "headersSent guard via res.destroy(err) — RESEARCH Pitfall B"
    - "Dev-vs-prod error disclosure: stack + _devMessage gated on NODE_ENV !== 'production'"
key-files:
  created:
    - src/adapter/handler-wrapper.ts
    - src/adapter/error-middleware.ts
    - tests/adapter/handler-wrapper.test.ts
    - tests/adapter/error-middleware.test.ts
  modified:
    - src/adapter/index.ts (added wrapAction + libraryErrorMiddleware exports under the 02-05 marker)
decisions:
  - "Set err.source only when missing — preserves user-set source on thrown HttpError (D-16)"
  - "Coerce null/undefined rejections to a synthetic Error before forwarding (defensive Pitfall A regression hardening)"
  - "On headersSent, destroy the socket with err and log via console.error — never attempt a second JSON write (D-14)"
  - "Production envelope: { status:500, name:'InternalServerError', message:'Internal Server Error' } — no err.message leak (D-18)"
metrics:
  duration: ~5 minutes
  completed: 2026-05-09
requirements: [ERR-03, ERR-05]
---

# Phase 2 Plan 05: Error Middleware + Handler Wrapper Summary

Two complementary modules — `wrapAction` for per-action source attribution and `libraryErrorMiddleware` for HTTP error serialization — landed as a tested pair, enabling Express v5 native async-rejection propagation to flow into a single 4-arg error handler with safe headersSent semantics and dev/prod-aware disclosure.

## Implementation

### Task 1 — `src/adapter/handler-wrapper.ts`

`wrapAction(controllerMeta, actionMeta, invokeAction): RequestHandler` precomputes `source = '${ControllerClass.name}.${String(method)}'` once at wrap time, then returns an async `(req, res, next) => void` that awaits `invokeAction` and on rejection:

1. Coerces `null`/`undefined` rejections to a synthetic `Error('Non-error value thrown from handler')`.
2. Attaches `err.source = source` only when the property is absent (preserves user-set source — required by D-16 and BadRequestError's optional `source` field).
3. Calls `next(err)` exactly once.

The wrapper is intentionally thin — Express v5 already auto-forwards async rejections, so this is purely a source-attribution point. There is exactly **one** try/catch block in the file (RESEARCH Pitfall A — no double-fire).

### Task 2 — `src/adapter/error-middleware.ts`

`libraryErrorMiddleware(err, req, res, next): void` is the canonical 4-arg signature. Behavior:

1. **headersSent guard (D-14, Pitfall B):** if `res.headersSent`, log via `console.error`, then `res.destroy(err)` and return. No second JSON write attempted.
2. **HttpError branch (D-18):** `res.status(err.status).json(err.toJSON())`. In dev, also attaches `body.stack`.
3. **Non-HttpError branch (D-18):** generic 500 envelope `{ status:500, name:'InternalServerError', message:'Internal Server Error' }`. Adds `body.source` if `err.source` is a string. In dev, adds `body.stack` and `body._devMessage = err.message`. In production, the original `err.message` never escapes the boundary.

## Tests

| File | Cases | All Pass |
|---|---|---|
| `tests/adapter/handler-wrapper.test.ts` | 8 | yes |
| `tests/adapter/error-middleware.test.ts` | 9 (incl. supertest end-to-end) | yes |

Coverage highlights:
- Async + sync throws inside async fn both caught (Pitfall A regression).
- Explicit `err.source` preserved (D-16).
- Symbol-method names produce a non-empty `Symbol(...)` source.
- HttpError → toJSON shape; BadRequestError details preserved.
- Production hides `err.message` and stack; dev exposes both as `_devMessage` + `stack`.
- headersSent path: middleware logs once, destroys socket, no `ERR_HTTP_HEADERS_SENT` thrown.
- res.json called exactly once per error response (no double-fire).

Full suite: **196/196 passing**, `tsc --noEmit` clean.

## Commits

| Task | Phase | Hash | Message |
|---|---|---|---|
| 1 RED | test | `c179d6e` | test(02-05): add failing tests for wrapAction source-attribution wrapper |
| 1 GREEN | feat | `df791c6` | feat(02-05): implement wrapAction source-attribution wrapper (D-16) |
| 2 RED | test | `1a46ff3` | test(02-05): add failing tests for libraryErrorMiddleware (D-14, D-15, D-18) |
| 2 GREEN | feat | `5805015` | feat(02-05): implement libraryErrorMiddleware with headersSent guard and dev/prod disclosure (D-14, D-15, D-18) |

## Deviations from Plan

**1. [Test-only] Class name uniqueness for source-attribution assertions**
- **Found during:** Task 2 GREEN run.
- **Issue:** Asserting `'Ctl.m'` against `controllerMeta.target.name` failed because the runtime exposed `'ErrCtl2.m'` even though only one `class ErrCtl` exists in the file (likely vite-node module evaluation suffixing class identifiers across hot reloads / isolation). `class Ctl` had the same problem and would also collide with `class Ctl` in the sibling `handler-wrapper.test.ts`.
- **Fix:** Switched assertion to `expect(res.body.source).toBe(`${ErrCtl.name}.m`)` — agnostic to whatever `.name` the runtime ends up exposing. The wrapper still produces `${target.name}.${method}` exactly as specified; the test no longer depends on a brittle string literal.
- **Files modified:** `tests/adapter/error-middleware.test.ts`
- **Commit:** `5805015`
- **Why this is in-scope:** Acceptance criterion #5 says "source from wrapper visible on generic 500" — the runtime-derived assertion proves that with no semantic loss.

No source-code-side deviations. The implementations match the plan's spec verbatim.

## Threat Flags

None — no new network surface, no new auth paths, no new file access.

## Self-Check: PASSED

- [x] `src/adapter/handler-wrapper.ts` exists
- [x] `src/adapter/error-middleware.ts` exists
- [x] `tests/adapter/handler-wrapper.test.ts` exists (8 tests)
- [x] `tests/adapter/error-middleware.test.ts` exists (9 tests)
- [x] `src/adapter/index.ts` 02-05 marker hosts both new exports; other markers untouched
- [x] Commits `c179d6e`, `df791c6`, `1a46ff3`, `5805015` all present in `git log`
- [x] `npx vitest run` → 196/196 passing
- [x] `npx tsc --noEmit` → clean
