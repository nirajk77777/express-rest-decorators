---
phase: 04-uploads-cookies-sessions-render-request-context
plan: "02"
subsystem: input-validation
tags: [cookies, session, standard-schema, lazy-load, input-declaration]
dependency_graph:
  requires: [04-01]
  provides: [cookies-slot, session-slot]
  affects: [src/adapter/validation.ts, src/metadata/types.ts]
tech_stack:
  added: ["@types/cookie (devDep)"]
  patterns: ["lazy dynamic import with module-level cache", "Promise.all parallel resolution arms"]
key_files:
  created:
    - src/adapter/cookies.ts
    - src/adapter/session.ts
    - tests/adapter/cookies.test.ts
    - tests/adapter/session.test.ts
  modified:
    - src/metadata/types.ts
    - src/errors/http-error.ts
    - src/adapter/validation.ts
    - tests/integration/02-grep-gates.test.ts
decisions:
  - "COOKIE_PEER_MISSING_MESSAGE exported as constant for test assertions and documentation"
  - "ValidationSlot union widened additively: added 'cookies', 'session', 'files'"
  - "cookies.ts try/catch exempted from Gate 3 (Phase 4 D-15 peer-not-found requirement)"
  - "cookies.ts and session.ts added to Gate 2 allow-list (both use Express Request type)"
  - "resolveInputs req type widened to include session? to support session arm wiring"
metrics:
  duration: "~349s"
  completed: "2026-05-10"
  tasks: 3
  files: 8
---

# Phase 04 Plan 02: Cookies + Session Input Slots Summary

**One-liner:** Cookie (lazy `cookie.parse`, per-key Standard Schema) and session (req.session pass-through or schema validated) slots added to InputDeclaration, wired as parallel Promise.all arms in validation.ts.

## What Was Built

Implemented INPUT-04 (cookies) and INPUT-05 (session) by adding two new slots to `InputDeclaration` and wiring resolvers as new parallel arms in the validation pipeline.

### src/adapter/cookies.ts
- `resolveCookiesArm(req, declaration)` — parses `Cookie` header via dynamically-imported `cookie.parse`, validates each declared key independently via Standard Schema, returns `{ value }` or `{ issues }`.
- Module-level `cachedParse` caches the parse function after first successful load — O(1) on subsequent requests.
- `try/catch` in `loadCookieParse()` converts any import failure into the exact peer-missing error: `"cookies slot requires cookie as a peer dependency. Install it with: pnpm add cookie"`.
- `COOKIE_PEER_MISSING_MESSAGE` exported constant for test assertions.
- `__resetCookieCacheForTest()` test seam for lazy-load verification.

### src/adapter/session.ts
- `resolveSessionArm(req, declaration)` — reads `req.session` (never imports `express-session`), passes through when `declaration === true`, or validates via Standard Schema.
- Zero coupling to session middleware — consumer wires their own session middleware.

### src/metadata/types.ts
- `cookies?: Record<string, true | StandardSchemaV1>` added to `InputDeclaration` (D-01).
- `session?: true | StandardSchemaV1` added to `InputDeclaration` (D-02).

### src/errors/http-error.ts
- `ValidationSlot` union widened: added `'cookies' | 'session' | 'files'` (additive, no breaking change).

### src/adapter/validation.ts
- Imported `resolveCookiesArm` and `resolveSessionArm`.
- `ResolvedArgs` extended with `cookies?` and `session?` fields.
- Two new arms added to the existing `Promise.all` call (arms 6 and 7 per D-04).
- Issues from both new arms aggregated into the existing `BadRequestError` details array.
- `resolveInputs` req parameter type widened to include `session?: unknown`.

## Test Results

| File | Tests | Status |
|------|-------|--------|
| tests/adapter/cookies.test.ts | 13 | All pass |
| tests/adapter/session.test.ts | 9 | All pass |
| Full suite | 447 | All pass (was 425 before plan 04-01, 444 before this plan) |

## Verification Gate Results

| Gate | Command | Result |
|------|---------|--------|
| TypeScript clean | `npx tsc --noEmit` | PASS |
| cookies? in InputDeclaration | `grep -q "cookies?:"` | PASS |
| session? in InputDeclaration | `grep -q "session?:"` | PASS |
| No top-level cookie import | `!grep -E "^import .* from 'cookie'"` | PASS |
| No express-session import | import lines check | PASS (comment mentions it; no import) |
| Exact peer error message | source grep | PASS |
| All existing tests | `npx vitest run` | PASS (447/447) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Updated Phase 2 grep gates for Phase 4 adapters**
- **Found during:** Task 1 GREEN phase
- **Issue:** Gate 2 (Express imports allowed-list) and Gate 3 (no try/catch exceptions) did not account for Phase 4 adapter files.
- **Fix:** Added `cookies.ts` and `session.ts` to Gate 2 allow-list; added `cookies.ts` to Gate 3 exception (Phase 4 D-15 requires try/catch for peer-not-found detection).
- **Files modified:** `tests/integration/02-grep-gates.test.ts`
- **Commit:** 421de03

**2. [Rule 2 - Missing Critical Functionality] Added @types/cookie devDependency**
- **Found during:** Task 1 GREEN phase
- **Issue:** `tsc --noEmit` failed with TS7016 (implicit any) for `import('cookie')` without type declarations.
- **Fix:** Installed `@types/cookie` as devDependency.
- **Commit:** 421de03

**3. [Rule 1 - Bug] Fixed session.test.ts "no express-session import" test**
- **Found during:** Task 1 GREEN phase
- **Issue:** The test used `source.not.toMatch(/express-session/)` but `session.ts` has a JSDoc comment mentioning "express-session". The test intent was no import statements.
- **Fix:** Changed test to only check `import` lines, not the whole file.
- **Commit:** 421de03

## Known Stubs

None — both `cookies` and `session` slots are fully wired from declaration through resolution.

## Threat Flags

No new security-relevant surface beyond what the plan's `<threat_model>` covers:
- T-04-07 (cookie injection via `\r\n`): mitigated by delegating to `cookie.parse()`.
- T-04-05 (unsigned cookie tampering): accepted — documented in threat register.

## Self-Check: PASSED

All created files exist. All task commits verified present in git log.

| Item | Status |
|------|--------|
| src/adapter/cookies.ts | FOUND |
| src/adapter/session.ts | FOUND |
| tests/adapter/cookies.test.ts | FOUND |
| tests/adapter/session.test.ts | FOUND |
| Commit ddc08ab (RED tests) | FOUND |
| Commit 421de03 (feat GREEN) | FOUND |
| Commit 262139d (validation wiring) | FOUND |
| Commit e14a517 (test task3) | FOUND |
