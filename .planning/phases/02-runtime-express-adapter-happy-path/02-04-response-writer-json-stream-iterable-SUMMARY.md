---
phase: 02-runtime-express-adapter-happy-path
plan: 04
subsystem: adapter
tags: [response, writer, json, stream, async-iterable, response-shapers, RES-08, D-11, D-12, D-13, D-14]
requires:
  - 02-01  # ControllerMetadata / ActionMetadata / ResponseHandlerArgs types
  - 01     # Phase 1 metadata: HttpCode/Header/ContentType/OnNull/OnUndefined
provides:
  - applyResponseHandlers
  - writeResponse
affects:
  - src/adapter/index.ts
tech-stack:
  added: []
  patterns:
    - "Stream-before-iterable detection ordering (D-12) — `.pipe` is checked before `Symbol.asyncIterator` because Node Readables satisfy both"
    - "Forward stream errors via NextFunction with `err.source = ${ControllerClass.name}.${methodName}` attribution (INFO #7); preserve pre-set `err.source` from upstream wrappers (D-16 contract)"
    - "headersSent guard (D-14): destroy the response when an error fires after the body has begun, so the lib error middleware never attempts a second write"
key-files:
  created:
    - src/adapter/response.ts
    - tests/adapter/response.test.ts
  modified:
    - src/adapter/index.ts
decisions:
  - "Header decorator stores the header name in `value` and the value in `secondaryValue` (matched Phase 1's actual `ResponseHandlerArgs` shape — plan referenced `'http-code'` but real literal is `'success-code'`)"
  - "`AnonymousController` fallback for `target.name` so `err.source` is always a usable string even if a synthetic ControllerMetadata is constructed at runtime"
  - "Test 11 (mid-pipe error) asserts socket-hang-up + zero error-middleware invocations — the headersSent path destroys the socket; the lib error middleware does NOT see the error (D-14)"
metrics:
  duration: 4m
  completed: 2026-05-09
---

# Phase 02 Plan 04: Response Writer (JSON / Stream / Async-Iterable) Summary

Pure response writer — applies Phase 1 `@HttpCode`/`@Header`/`@ContentType` shapers, then dispatches by `@JsonController` vs `@Controller` and by value type (object/string/Buffer/stream/async-iterable/null/undefined). Streams pipe with backpressure; async iterables are wrapped via `Readable.from`; stream errors forward to `next(err)` with `err.source` attribution unless headers have already been sent (then the response is destroyed). Lands RES-08 plus the runtime side of the Phase 1 response shapers in a single tested unit.

## What Shipped

- **`applyResponseHandlers(res, controllerHandlers, actionHandlers)`** — iterates controller-first then action so Express's last-write-wins semantics make method-level decorators override controller-level ones for the same status/header. Maps the actual Phase 1 literals (`success-code` → `res.status`, `header` → `res.set(value, secondaryValue)`, `content-type` → `res.type`). `null-result-code` / `undefined-result-code` are deferred to `writeResponse`. Unknown types are ignored silently.
- **`writeResponse(res, next, value, controllerMeta, actionMeta)`** — six-branch dispatcher per D-11/D-12/D-13:
  1. Apply Phase 1 shapers.
  2. `value === null` → `@OnNull` shaper override or 204 default; empty body.
  3. `value === undefined` → `@OnUndefined` shaper override or 204 default; empty body.
  4. Stream (anything with `.pipe`) → wire `error` listener and `value.pipe(res)` (D-12 ordering — checked before iterable because streams are also iterable).
  5. Async iterable → `Readable.from(value).pipe(res)` (RES-08).
  6. Plain value → `@JsonController` always uses `res.json`; `@Controller` content-negotiates (string/Buffer → `res.send`, otherwise `res.json`).
- **Stream error forwarding (D-14, INFO #7)** — both branches 4 and 5 wire `forwardStreamError(res, next, source, err)`. It computes `source = `${target.name}.${methodName}`` (with `AnonymousController` fallback), sets `err.source` only when not already set (preserves upstream wrapper attribution from D-16), then either calls `next(err)` or destroys the response if `res.headersSent`.
- **Adapter barrel** — `src/adapter/index.ts` 02-04 marker now exports `applyResponseHandlers` + `writeResponse`. Other Wave 2 markers (02-02, 02-03, 02-05) untouched.

## Tests (22 total, all green)

- **`applyResponseHandlers` (7 cases):** success-code, content-type, header (`value`+`secondaryValue` shape), controller-then-action ordering, null-skip, undefined-skip, unknown-type silent ignore.
- **`writeResponse` (15 cases) — supertest end-to-end:**
  1. JSON object via `@JsonController`
  2. JSON `null` → 204 empty
  3. JSON `undefined` → 204 empty
  4. `@OnNull(404)` honored
  5. `@OnUndefined(202)` honored
  6. String via `@Controller` → `res.send` text response
  7. Buffer via `@Controller` → `res.send` bytes
  8. Object via `@Controller` falls back to `res.json`
  9. Async iterable piped via `Readable.from` (RES-08)
  10. Stream piped via `.pipe` (RES-08, D-12 stream-first order)
  11. Mid-pipe stream error: connection closes; error middleware NOT invoked twice; no `ERR_HTTP_HEADERS_SENT`
  12. Stream error before first byte → `next(err)` → error middleware writes JSON 500
  13. `@HttpCode(201)` shaper applied to plain JSON value
  14. INFO #7: `err.source === 'StreamCtl.boom'` after a stream-error fixture
  15. INFO #7: pre-set `err.source` survives writeResponse (`'CustomSource.preset'`)

`pnpm exec tsc --noEmit` clean. Full suite: **179/179 passing across 17 files**.

## Decisions Made

- **Plan-vs-source literal:** Plan 02-04 referred to `'http-code'`; Phase 1's `metadata/types.ts` actually uses `'success-code'`. Adopted the real literal (the plan explicitly said "if names differ, use the actual ones").
- **Header arg shape:** Confirmed via `src/decorators/response.ts` that `@Header(name, value)` stores `name` in `value` and the header value in `secondaryValue`. `applyResponseHandlers` reads accordingly: `res.set(String(h.value), String(h.secondaryValue ?? ''))`.
- **Anonymous controller fallback:** `target.name` defaults to `'AnonymousController'` so `err.source` always renders cleanly even if `ControllerMetadata` is constructed synthetically (e.g. test fixtures or future dynamic-controller paths).
- **Variable naming for acceptance grep:** Acceptance criteria require `grep -nE 'source.*=.*\${.*target\.name\}\.\${'` to match. Used `const source = …` (not `streamSource`) so the lowercase regex matches.

## Deviations from Plan

None functionally. Two small adjustments to match acceptance criteria + reality:

1. **[Rule 3 — Blocking]** Plan referenced `'http-code'` and a guessed `h.name` field for `@Header`. Read Phase 1 source first per the plan's own `<read_first>` instruction; used real literal `'success-code'` and real shape `value`+`secondaryValue`.
2. **[Rule 1 — Bug-prevention]** Initial implementation named the attribution variable `streamSource`. Acceptance criteria regex required the lowercase `source` token before `=`. Renamed to `source` (kept the attribution semantics identical).

## Authentication Gates

None — pure module, no external services.

## Known Stubs

None.

## Threat Flags

None — module reads only Phase 1 metadata it received as parameters; introduces no new network surface, file access, or trust boundaries beyond Express's existing `res.send` / `res.json` / `pipe` semantics.

## Self-Check: PASSED

- `[ -f src/adapter/response.ts ]` → FOUND
- `[ -f tests/adapter/response.test.ts ]` → FOUND
- `git log --oneline | grep 6086b22` → FOUND (RED test commit)
- `git log --oneline | grep 712203f` → FOUND (GREEN implementation commit)
- `grep -n "export function applyResponseHandlers" src/adapter/response.ts` → 1 match
- `grep -n "export function writeResponse" src/adapter/response.ts` → 1 match
- `grep -nE "Symbol\.asyncIterator|Readable\.from" src/adapter/response.ts` → 3 matches
- `grep -nE "headersSent" src/adapter/response.ts` → 2 matches
- `grep -nE 'source.*=.*\$\{.*target\.name\}\.\$\{' src/adapter/response.ts` → 1 match
- `grep -n "// 02-04 response exports" src/adapter/index.ts` → 1 match
- `grep -n "// 02-02 router-build exports\|// 02-03 validation exports\|// 02-05 error-middleware" src/adapter/index.ts` → 3 matches (other markers untouched)
- `npx tsc --noEmit` → exit 0
- `npx vitest run` → 179/179 passed across 17 files
