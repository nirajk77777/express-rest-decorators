---
phase: 01-metadata-decorator-skeleton
plan: 04
subsystem: api
tags: [typescript, error-handling, http-errors, express]

# Dependency graph
requires: []
provides:
  - HttpError base class with status, message, ES2022 cause, toJSON()
  - BadRequestError(400) with details/source fields for Phase 2 validation failures
  - UnauthorizedError(401), ForbiddenError(403), NotFoundError(404), MethodNotAllowedError(405), ConflictError(409), InternalServerError(500)
  - Barrel re-export from src/errors/index.ts
affects: [phase-2-express-adapter, phase-3-validation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - HttpError subclass hierarchy with Object.setPrototypeOf for instanceof correctness across CJS/ESM
    - toJSON() shape policy: { name, message, status } only — never stack or cause

key-files:
  created:
    - src/errors/http-error.ts
    - src/errors/subclasses.ts
    - src/errors/index.ts
    - tests/errors/http-error.test.ts
    - tests/errors/subclasses.test.ts
  modified: []

key-decisions:
  - "toJSON() field policy: never include stack or cause — only { name, message, status } (+ details/source for BadRequestError when set)"
  - "Object.setPrototypeOf(this, new.target.prototype) in every constructor — required for instanceof correctness across CJS/ESM dual-package scenarios"
  - "BadRequestError carries details: ValidationIssue[] and source: string — contract pre-committed for Phase 2 to populate at validation time"
  - "ES2022 cause passed through to Error constructor via super(message, options) — no wrapping, no copying, native support"

patterns-established:
  - "Pattern: HttpError subclass — extends HttpError, super(statusCode, message, options), Object.setPrototypeOf(this, new.target.prototype), name set via this.constructor.name in base"
  - "Pattern: Conditional toJSON spread — only include details/source keys when defined (not null, not undefined), preventing stale undefined keys in JSON"

requirements-completed: [ERR-01, ERR-02]

# Metrics
duration: 10min
completed: 2026-05-08
---

# Phase 1 Plan 04: HttpError Hierarchy Summary

**HttpError class hierarchy with ES2022 cause chaining, prototype-safe instanceof, and BadRequestError carrying Phase 2 validation issue contract (details + source) — zero Express imports**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-08T17:59:00Z
- **Completed:** 2026-05-08T18:00:30Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 5 (3 src, 2 tests)

## Accomplishments

- HttpError base class: status, message, ES2022 cause, toJSON returning `{ name, message, status }` without stack/cause
- Seven subclasses (BadRequestError 400, UnauthorizedError 401, ForbiddenError 403, NotFoundError 404, MethodNotAllowedError 405, ConflictError 409, InternalServerError 500) all with correct defaults
- BadRequestError carries `details: ReadonlyArray<ValidationIssue>` and `source: string` for Phase 2 to populate with field-level validation failures
- All 19 tests pass; tsc --noEmit clean; zero Express imports in the errors module

## Task Commits

TDD task — two commits:

1. **RED: Failing tests** - `a8aa8c2` (test)
2. **GREEN: Implementation** - `830f5b4` (feat)

## Files Created/Modified

- `src/errors/http-error.ts` - HttpError base class, HttpErrorOptions and ValidationIssue interfaces
- `src/errors/subclasses.ts` - All 7 subclasses: BadRequestError through InternalServerError
- `src/errors/index.ts` - Barrel re-export
- `tests/errors/http-error.test.ts` - H1-H6 base class tests
- `tests/errors/subclasses.test.ts` - S1-S13 subclass tests

## Decisions Made

- **toJSON field policy:** Only `{ name, message, status }` in base; BadRequestError conditionally spreads `details` and `source` only when not undefined. `stack` and `cause` are never serialized — security-safe for HTTP responses.
- **Object.setPrototypeOf placement:** Called in every constructor (base + all subclasses) to guarantee instanceof correctness whether the class is loaded via ESM or CJS bundle.
- **BadRequestError contract pre-committed:** `details: ReadonlyArray<ValidationIssue>` and `source: string` fields are present in Phase 1 as empty/optional — Phase 2 will populate them during validation middleware. This avoids a breaking change when the adapter layer is added.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None — all classes are fully wired. `details` and `source` on BadRequestError are intentionally optional (undefined when not provided) — Phase 2 populates them with actual validation data.

## Next Phase Readiness

- HttpError hierarchy is complete and usable by Phase 2 ExpressAdapter for error middleware
- BadRequestError's `details` and `source` fields are ready for Phase 2 to populate from validator output
- ROADMAP SC #3 satisfied: errors usable independently of any adapter

---
*Phase: 01-metadata-decorator-skeleton*
*Completed: 2026-05-08*
