---
phase: 03-middleware-interceptors-auth-error-handling
plan: "02"
subsystem: metadata
tags: [metadata, builder, inheritance, middleware, interceptors, auth, resolved-types]
dependency_graph:
  requires:
    - phase: 03-01
      provides: "HookEntry type, useBefore/useAfter/interceptors/authorized fields in ControllerArgs/MethodArgs, six Phase 3 decorators"
  provides:
    - src/types/resolved.ts (ControllerMetadata + ActionMetadata with Phase 3 fields)
    - src/metadata/builder.ts (mergeControllerChain + mergeMethodChain + buildController with Phase 3 inheritance semantics)
    - tests/metadata/builder-phase3.test.ts (17 new tests covering all inheritance scenarios)
  affects:
    - 03-03 (router-build adapter consumes resolved metadata Phase 3 fields)
    - 03-04 (any further adapter work)
tech-stack:
  added: []
  patterns:
    - Concat-base-first for hook array inheritance (useBefore, useAfter, interceptors)
    - Last-write-wins for authorized field in inheritance chain
    - Per-field method merge (replaces whole-record overwrite for correct hook accumulation)
    - Default [] for required hook array fields in resolved metadata
key-files:
  created:
    - tests/metadata/builder-phase3.test.ts
  modified:
    - src/types/resolved.ts
    - src/metadata/builder.ts
    - tests/adapter/error-middleware.test.ts
    - tests/adapter/handler-wrapper.test.ts
    - tests/adapter/response.test.ts
    - tests/adapter/router-build.test.ts
key-decisions:
  - "mergeMethodChain now does per-field merge instead of whole-record overwrite — required for correct hook accumulation when subclass adds @UseBefore to an inherited method without re-decorating the route"
  - "Hook arrays (useBefore/useAfter/interceptors) always concat base-first regardless of whether subclass re-applies route decorator"
  - "authorized uses last-write-wins across the prototype chain — subclass null (@Authorized() with no args) overrides base string[] correctly"
  - "Test fixtures in adapter tests updated to include required Phase 3 fields (useBefore/useAfter/interceptors) — Rule 1 auto-fix"
patterns-established:
  - "Resolved metadata fields default to [] so adapter code can spread/iterate without ?? [] guards"
  - "authorized field omitted from resolved object entirely when not decorated (undefined), preserving the three-way distinction: undefined=not-decorated, null=any-authenticated-user, array=specific-roles"
requirements-completed: [MW-01, MW-03, AUTH-01]
duration: ~8min
completed: "2026-05-10"
tasks: 2
files_modified: 7
---

# Phase 03 Plan 02: MetadataBuilder Phase 3 Extension Summary

**ControllerMetadata and ActionMetadata extended with useBefore/useAfter/interceptors/authorized fields; MetadataBuilder inheritance merge updated to concat hooks base-first and apply last-write-wins for authorized.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-10T08:52:00Z
- **Completed:** 2026-05-10T09:00:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Extended `ControllerMetadata` and `ActionMetadata` in `src/types/resolved.ts` with four new Phase 3 fields: `useBefore: HookEntry[]`, `useAfter: HookEntry[]`, `interceptors: Function[]` (required, default `[]`), and `authorized?: string[] | null` (optional, preserving three-way distinction).
- Updated `mergeControllerChain` to fold Phase 3 fields with concat-base-first for hook arrays and last-write-wins for `authorized`.
- Updated `mergeMethodChain` from a whole-record overwrite to per-field merge — enabling correct accumulation of hook arrays when a subclass adds `@UseBefore` to an inherited method without re-decorating the route.
- Updated `buildController` to default hook arrays to `[]` and conditionally emit `authorized` only when explicitly decorated.
- Added 17 new tests in `builder-phase3.test.ts` covering all documented inheritance scenarios.
- All 287 tests pass; `tsc --noEmit` clean.

## Final Shape of ControllerMetadata and ActionMetadata

```typescript
interface ControllerMetadata {
  target: Function;
  basePath: string;
  type: 'json' | 'default';
  responseHandlers: ResponseHandlerArgs[];
  actions: ActionMetadata[];
  // Phase 3 (required, default [])
  useBefore: HookEntry[];
  useAfter: HookEntry[];
  interceptors: Function[];
  // Phase 3 (optional — only present when decorated)
  authorized?: string[] | null;
}

interface ActionMetadata {
  target: Function;
  method: string | symbol;
  verb: string;
  path: string;
  input?: InputDeclaration;
  returnType?: Function;
  paramTypes?: Function[];
  responseHandlers: ResponseHandlerArgs[];
  // Phase 3 (required, default [])
  useBefore: HookEntry[];
  useAfter: HookEntry[];
  interceptors: Function[];
  // Phase 3 (optional — only present when decorated)
  authorized?: string[] | null;
}
```

## Merge Rules Table

| Field | Scope | Merge rule |
|-------|-------|------------|
| `useBefore` | Controller (class-level) | Concat base-first: `[...base.useBefore, ...sub.useBefore]` |
| `useAfter` | Controller (class-level) | Concat base-first: `[...base.useAfter, ...sub.useAfter]` |
| `interceptors` | Controller (class-level) | Concat base-first: `[...base.interceptors, ...sub.interceptors]` |
| `authorized` | Controller (class-level) | Last-write-wins (subclass overrides; `null` beats string[]) |
| `useBefore` | Action (method-level) | Concat: base method entry first, then subclass additions |
| `useAfter` | Action (method-level) | Concat: base method entry first, then subclass additions |
| `interceptors` | Action (method-level) | Concat: base method entry first, then subclass additions |
| `authorized` | Action (method-level) | Last-write-wins across prototype chain |
| verb/path/input | Action (method-level) | Subclass wins ONLY when re-applying a route decorator |

## Task Commits

1. **Task 1: Extend ControllerMetadata + ActionMetadata** - `38195cd` (feat)
2. **Task 2: Extend MetadataBuilder + write tests** - `6f8d9ea` (feat)

## Files Created/Modified

- `src/types/resolved.ts` — Extended with Phase 3 fields; re-exports HookEntry
- `src/metadata/builder.ts` — Updated merge functions with Phase 3 inheritance semantics
- `tests/metadata/builder-phase3.test.ts` — 17 new tests for Phase 3 inheritance scenarios
- `tests/adapter/error-middleware.test.ts` — Fixture updated with required Phase 3 fields
- `tests/adapter/handler-wrapper.test.ts` — Fixture updated with required Phase 3 fields
- `tests/adapter/response.test.ts` — Fixture updated with required Phase 3 fields
- `tests/adapter/router-build.test.ts` — Fixture updated with required Phase 3 fields

## Decisions Made

- Per-field method merge (not whole-record overwrite) is required to support the mid-chain `@UseBefore`-only pattern where a subclass adds hooks to an inherited route without re-decorating the verb/path.
- Hook arrays default to `[]` (required fields) on resolved metadata so that the adapter layer in Plans 03/04 can spread without null-guarding.
- `authorized` is emitted conditionally (only when `!== undefined`) to preserve the three-way distinction critical for auth policy decisions: `undefined` (no decorator), `null` (@Authorized() any user), `string[]` (@Authorized('role')).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated adapter test fixtures to include required Phase 3 fields**
- **Found during:** Task 2 (after extending resolved.ts, tsc reported missing required fields)
- **Issue:** Test object literals in `error-middleware.test.ts`, `handler-wrapper.test.ts`, `response.test.ts`, `router-build.test.ts` constructed `ControllerMetadata` and `ActionMetadata` inline without the new required `useBefore`, `useAfter`, `interceptors` fields. TypeScript reported TS2739 errors.
- **Fix:** Added `useBefore: [], useAfter: [], interceptors: []` to each inline metadata object literal in the four test files.
- **Files modified:** tests/adapter/error-middleware.test.ts, tests/adapter/handler-wrapper.test.ts, tests/adapter/response.test.ts, tests/adapter/router-build.test.ts
- **Verification:** `tsc --noEmit` clean after fix; all 287 tests pass.
- **Committed in:** `6f8d9ea` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug — missing required fields in test fixtures)
**Impact on plan:** Necessary correctness fix caused by the intentional interface extension. No scope creep.

## Regression Confirmation

- Phase 1 builder tests (builder.test.ts): 10/10 pass
- Phase 2 adapter tests: all pass
- Phase 3 new tests (builder-phase3.test.ts): 17/17 pass
- Full suite: 287/287 pass

## Known Stubs

None - all new fields are wired through the full builder pipeline and emit real data from decorator storage.

## Threat Flags

None - no new network endpoints, auth paths, or trust boundary changes introduced.

## Self-Check: PASSED

- `src/types/resolved.ts` — exists and contains 6 required hook fields (3 per interface) and 2 authorized optional fields
- `src/metadata/builder.ts` — exists with updated merge logic
- `tests/metadata/builder-phase3.test.ts` — exists with 17 tests
- Commits `38195cd` and `6f8d9ea` confirmed in git log
