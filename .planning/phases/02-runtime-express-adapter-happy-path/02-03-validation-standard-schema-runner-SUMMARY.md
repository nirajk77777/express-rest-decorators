---
phase: 02-runtime-express-adapter-happy-path
plan: 03
subsystem: adapter-validation
tags: [adapter, validation, standard-schema, input-01, input-02, input-03, d-06, d-07, d-08, d-09, d-10]
requires: [02-01]
provides:
  - "isStandardSchema() — runtime probe for Standard Schema feature detection (object OR function carrying ~standard.validate)"
  - "renderPath() — D-09 dotted+bracketed path renderer; handles PropertyKey + PathSegment shapes (Pitfall E)"
  - "resolveInputs() — D-06/D-07/D-10 four-slot concurrent validator; aggregates issues into one BadRequestError; never mutates req"
  - "ResolvedArgs type — destructured handler-arg shape consumed by Plan 02-05's wrapper"
affects:
  - src/adapter/index.ts (02-03 marker section populated; other markers untouched)
tech-stack:
  added: []
  patterns:
    - "Promise.all four-slot fan-out with no short-circuit — every slot runs even when earlier slots fail"
    - "Pure-function module — caller (Plan 02-05) injects req and decl, attaches err.source after throw"
    - "Imposter-tolerant probe — schema-shaped objects without a validate fn fall through to raw passthrough rather than crashing"
key-files:
  created:
    - src/adapter/validation.ts
    - tests/adapter/validation.test.ts
  modified:
    - src/adapter/index.ts
decisions:
  - "isStandardSchema accepts callables (typeof === 'function') as well as plain objects. ArkType's schema is a callable bearing ~standard; rejecting functions broke INPUT-02 parity. Standard Schema spec is silent on the host shape — Zod, Valibot, ArkType all conform once functions are admitted."
  - "validateSlot wraps schema['~standard'].validate(raw) with Promise.resolve(...) so sync and async vendors interoperate transparently (Pitfall D)."
  - "Validated value replaces raw in args; req.params/query/body/headers are never assigned to (Pitfall F). Test 'does NOT mutate req when schema transforms value' guards this with a Zod transform."
  - "Aggregation uses for…of push instead of flatMap to avoid an extra allocation pass; order is slot-array order (params, query, body, headers)."
metrics:
  duration: ~5 minutes
  completed: 2026-05-09
  tasks: 2
  test_count_delta: "+28 (validation.test.ts new file)"
---

# Phase 2 Plan 03: Validation — Standard Schema Runner

Pure four-slot validator. `resolveInputs(req, input)` runs every declared
Standard Schema concurrently, aggregates every issue from every failing slot
into one `BadRequestError`, and returns the destructured handler-arg object
without mutating `req`. No Express-router knowledge, no response writer, no
error-middleware coupling — Plan 02-05's per-handler wrapper consumes this and
attaches `err.source` on throw.

## What Shipped

### Task 1 — `isStandardSchema` + `renderPath` (commits `8a58c04` test, `7fa7601` impl)

`src/adapter/validation.ts`:
- `isStandardSchema(x)` returns `true` iff `x` is object-or-function-shaped,
  carries a `~standard` object, and that object has a `validate` function.
  Rejects null, undefined, primitives, plain objects without `~standard`, and
  imposters (objects with `~standard` but no `validate`).
- `renderPath(p)` produces D-09 dotted+bracketed strings:
  - `['user', 'email']` → `'user.email'`
  - `['items', 0, 'name']` → `'items[0].name'`
  - `[{key:'user'}, {key:0}, {key:'name'}]` → `'user[0].name'` (Pitfall E)
  - mixed shapes interleave correctly; first segment never gets a leading dot.
- 14 unit tests — every behavior bullet plus the imposter and PathSegment cases.

### Task 2 — `resolveInputs()` four-slot runner (commits `eefa76e` test, `8166709` impl)

`src/adapter/validation.ts`:
- `SLOTS = ['params', 'query', 'body', 'headers']`.
- `validateSlot(slot, schema, raw)`:
  - Non-Standard-Schema → `{slot, value: raw}` passthrough (D-10 unvalidated half).
  - Standard Schema → `Promise.resolve(schema['~standard'].validate(raw))`,
    map `result.issues` to `ValidationIssue[]` with `{slot, path: renderPath(iss.path), message}`.
- `resolveInputs(req, input?)`:
  - `Promise.all(SLOTS.map(s => validateSlot(s, decl[s], req[s])))` (D-06).
  - Concatenate all `issues` arrays; if non-empty, throw
    `new BadRequestError('Validation failed', { details: [...] })` — no
    short-circuit, no `source` (the wrapper sets it later) (D-07, D-08).
  - Otherwise return `{params, query, body, headers}` with each slot's
    schema-output (D-10).
- `ResolvedArgs` interface exported for Plan 02-05's wrapper to type its
  destructured arg.

`src/adapter/index.ts`:
- Inserted `isStandardSchema, renderPath, resolveInputs, type ResolvedArgs`
  exports under the existing `// 02-03 validation exports` marker. Markers
  for 02-01, 02-02, 02-04, 02-05 untouched.

14 new tests cover every plan bullet + INPUT-02 vendor parity (Zod, Valibot,
ArkType) on success and failure, async-schema awaiting (Pitfall D), req
non-mutation under a transforming schema (Pitfall F), imposter passthrough,
nested-object path rendering, and array-index path rendering (D-09).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `isStandardSchema` rejected ArkType schemas**
- **Found during:** Task 2, "validator parity failure" test (INPUT-02).
- **Issue:** ArkType's `type({...})` returns a callable (`typeof === 'function'`)
  whose `~standard` lives on the function object. The plan's reference
  implementation guards `typeof x !== 'object'` and so rejected ArkType
  outright — breaking INPUT-02 parity since ArkType is one of the three
  vendors the plan explicitly tests.
- **Fix:** Accept both `'object'` and `'function'` typeofs in
  `isStandardSchema`. Standard Schema spec is silent on host shape, and Zod /
  Valibot still pass since they're plain objects.
- **Regression test:** Added `'returns true for a callable (function) carrying
  ~standard.validate (ArkType shape)'` in `isStandardSchema` describe block
  to lock the behavior in.
- **Files modified:** `src/adapter/validation.ts`, `tests/adapter/validation.test.ts`.
- **Commit:** `8166709` (rolled into Task 2 GREEN).

**2. [Rule 1 - Test bug] `expect.fail(...)` swallowed by surrounding `try/catch`**
- **Found during:** Task 2 "validator parity failure" iteration.
- **Issue:** The plan's reference test pattern was `try { await ...;
  expect.fail('should have thrown'); } catch (err) { expect(err).toBeInstanceOf(BadRequestError); }`.
  When the validator did NOT throw (e.g. ArkType bug above), `expect.fail`'s
  AssertionError was caught by the surrounding `catch` and re-asserted as
  BadRequestError — masking the real problem behind a confusing message.
- **Fix:** Capture into a `caught: unknown` and assert outside the try block.
  Same pattern applied locally only to the "validator parity failure" test —
  other tests retained the plan's pattern since they were already green.
- **Files modified:** `tests/adapter/validation.test.ts`.

No architectural changes; no Rule 4 surfacing.

## Verification

- `npx vitest run tests/adapter/validation.test.ts` → **28 passed / 0 failed**.
- `npx tsc --noEmit` exits 0.
- All 11 plan-listed test cases pass; plus 17 utility tests for
  `isStandardSchema` / `renderPath`.
- Acceptance criteria all green:
  - `grep` confirms `isStandardSchema`, `renderPath`, `resolveInputs`,
    `Promise.all` all present in `src/adapter/validation.ts`.
  - `// 02-03 validation exports` marker preserved at line 18 of
    `src/adapter/index.ts`; `resolveInputs` exported under it.
  - Other Wave 2 markers (02-02, 02-04, 02-05) all still present and unmodified.

## Requirements Satisfied

- **INPUT-01** — Destructured `{params, query, body, headers}` arg returned
  with validated/coerced values per slot.
- **INPUT-02** — Zod v4, Valibot v1, ArkType v2 all exercised in the parity
  tests on both success and failure.
- **INPUT-03** — Failure produces `BadRequestError(status: 400, details:
  ValidationIssue[])` with full per-issue `{slot, path, message}` triples.

## Hand-off to Plan 02-05

Plan 02-05's per-handler wrapper will:
1. Call `resolveInputs(req, methodMeta.input)` to obtain `ResolvedArgs`.
2. Pass the destructured args to the user's controller method.
3. On `BadRequestError` (or any thrown error), assign
   `err.source = "${ControllerClass.name}.${methodName}"` if not present, then
   `next(err)` per D-16.

## Self-Check: PASSED

- src/adapter/validation.ts → FOUND
- tests/adapter/validation.test.ts → FOUND
- src/adapter/index.ts (02-03 marker populated) → FOUND
- Commits: 8a58c04, 7fa7601, eefa76e, 8166709 → all FOUND in `git log`.
