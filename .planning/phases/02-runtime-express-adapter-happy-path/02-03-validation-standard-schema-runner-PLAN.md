---
phase: 02-runtime-express-adapter-happy-path
plan: 03
type: execute
wave: 2
depends_on: [02-01]
files_modified:
  - src/adapter/validation.ts
  - src/adapter/index.ts
  - tests/adapter/validation.test.ts
autonomous: true
requirements: [INPUT-01, INPUT-02, INPUT-03]
must_haves:
  truths:
    - "Each of params, query, body, headers slots is validated via schema['~standard'].validate(raw) when a Standard Schema is supplied; otherwise raw value passes through unchanged (traces SC #2, INPUT-02)"
    - "All four slots are validated concurrently via Promise.all; sync schemas resolve immediately, async ones overlap (D-06)"
    - "Validation failure on ANY slot collects every issue from every failing slot into a single BadRequestError; no short-circuit (D-07)"
    - "BadRequestError.details is ValidationIssue[] with { slot, path: string, message } where path is rendered dotted+bracketed (D-08, D-09)"
    - "isStandardSchema rejects imposters (objects with ~standard but no validate function) so they pass raw (RESEARCH Claude's Discretion)"
    - "Validated value replaces raw in handler arg; req.params/query/body/headers NOT mutated (D-10, RESEARCH Pitfall F)"
  artifacts:
    - path: src/adapter/validation.ts
      provides: "isStandardSchema, renderPath, resolveInputs — pure functions consumed by Plan 02-05's handler-wrapper"
      exports: [isStandardSchema, renderPath, resolveInputs, type ResolvedArgs]
  key_links:
    - from: src/adapter/validation.ts
      to: src/errors/subclasses.ts
      via: "throws BadRequestError({ details: ValidationIssue[] }) on aggregate failure"
      pattern: "new BadRequestError"
    - from: src/adapter/validation.ts
      to: src/types/standard-schema.ts
      via: "type-only import of StandardSchemaV1"
      pattern: "StandardSchemaV1"
---

<objective>
Implement the four-slot Standard Schema runner. This is the heart of INPUT-01/02/03: take an `ActionMetadata.input` declaration plus the Express `req`, validate every declared slot concurrently, aggregate all failures into one `BadRequestError`, and return the destructured handler-arg object.

Pure module — no Express types beyond `Request` (read-only). No response writing, no error middleware, no routing concerns. Plan 02-05's handler-wrapper consumes this; Plan 02-06's boot wires it.

Purpose: Make INPUT-01/02/03 land as a single tested unit independent of error middleware and response writer.

Output: `src/adapter/validation.ts` exporting `resolveInputs`, `isStandardSchema`, `renderPath`, plus the `ResolvedArgs` type. Comprehensive tests covering Zod, Valibot, ArkType conformance and all five RESEARCH pitfalls (D, E, F).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/02-runtime-express-adapter-happy-path/02-CONTEXT.md
@.planning/phases/02-runtime-express-adapter-happy-path/02-RESEARCH.md
@src/types/standard-schema.ts
@src/types/resolved.ts
@src/metadata/types.ts
@src/errors/http-error.ts
@src/errors/subclasses.ts

<interfaces>
Phase 1 + Plan 02-01 surfaces this module consumes:

```ts
// src/types/standard-schema.ts (re-exported from @standard-schema/spec)
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) => Result<Output> | Promise<Result<Output>>;
    readonly types?: { input: Input; output: Output };
  };
}
type Result<O> = { value: O; issues?: undefined } | { issues: ReadonlyArray<Issue>; value?: undefined };
interface Issue {
  message: string;
  path?: ReadonlyArray<PropertyKey | { key: PropertyKey }>;
}

// src/metadata/types.ts
export interface InputDeclaration {
  params?: unknown;   // expected to be StandardSchemaV1 or undefined; runtime probe narrows
  query?: unknown;
  body?: unknown;
  headers?: unknown;
}

// src/errors/http-error.ts (after Plan 02-01 widening)
export type ValidationSlot = 'params' | 'query' | 'body' | 'headers';
export interface ValidationIssue {
  slot?: ValidationSlot;
  path: string | ReadonlyArray<PropertyKey>;
  message: string;
}

// src/errors/subclasses.ts
export class BadRequestError extends HttpError {
  constructor(message?: string, options?: { cause?: unknown; details?: ReadonlyArray<ValidationIssue>; source?: string });
}
```

Express Request shape (type-only import: `import type { Request } from 'express'`):
- `req.params: Record<string, string>`
- `req.query: ParsedQs` (treat as `Record<string, unknown>`)
- `req.body: unknown` (set by express.json()/urlencoded middleware)
- `req.headers: Record<string, string | string[] | undefined>`
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: isStandardSchema runtime probe + renderPath (D-09)</name>
  <files>src/adapter/validation.ts, tests/adapter/validation.test.ts</files>
  <read_first>
    - src/types/standard-schema.ts
    - .planning/phases/02-runtime-express-adapter-happy-path/02-CONTEXT.md §decisions D-09 + Claude's Discretion §"Standard Schema feature detection"
    - .planning/phases/02-runtime-express-adapter-happy-path/02-RESEARCH.md §"Pattern 3" §"Pitfall E"
  </read_first>
  <behavior>
    isStandardSchema(x):
    - returns true for objects where x['~standard'] is an object with `validate` of type function
    - returns false for null, undefined, primitives, plain objects without ~standard, objects with ~standard but no validate, objects with ~standard where validate is non-function
    - narrows TypeScript type to StandardSchemaV1

    renderPath(p):
    - undefined or empty array → ''
    - ['user', 'email'] → 'user.email'
    - ['items', 0, 'name'] → 'items[0].name'
    - [{key: 'user'}, {key: 0}, {key: 'name'}] → 'user[0].name' (PathSegment shape; Pitfall E)
    - mixed: ['user', {key: 0}, 'name'] → 'user[0].name'
    - first segment never gets a leading dot: ['name'] → 'name', not '.name'
    - symbols rendered via String(): [Symbol('s')] → 'Symbol(s)' (whatever String() returns; just don't crash)
  </behavior>
  <action>
Create `src/adapter/validation.ts` with the two utility exports:

```ts
import type { StandardSchemaV1 } from '../types/standard-schema.js';

export function isStandardSchema(x: unknown): x is StandardSchemaV1 {
  if (!x || typeof x !== 'object') return false;
  const ss = (x as Record<string, unknown>)['~standard'];
  if (!ss || typeof ss !== 'object') return false;
  return typeof (ss as Record<string, unknown>).validate === 'function';
}

/**
 * Render a Standard Schema Issue.path into D-09 dotted+bracketed string form.
 * Handles both PropertyKey and PathSegment ({ key }) entries (Pitfall E).
 *   ['user', 'email']           -> 'user.email'
 *   ['items', 0, 'name']        -> 'items[0].name'
 *   [{key:'user'}, {key:0}]     -> 'user[0]'
 */
export function renderPath(
  p?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>
): string {
  if (!p || p.length === 0) return '';
  let out = '';
  for (const seg of p) {
    const key: PropertyKey =
      (typeof seg === 'object' && seg !== null && 'key' in seg)
        ? (seg as { key: PropertyKey }).key
        : (seg as PropertyKey);
    if (typeof key === 'number') {
      out += `[${key}]`;
    } else if (typeof key === 'string') {
      out += out.length === 0 ? key : `.${key}`;
    } else {
      // symbol — render via String(); only legal as object-key fallback
      out += out.length === 0 ? String(key) : `.${String(key)}`;
    }
  }
  return out;
}
```

Tests in `tests/adapter/validation.test.ts` under `describe('isStandardSchema')` and `describe('renderPath (D-09)')`. Cover every behavior bullet. For isStandardSchema, include the imposter case from RESEARCH Claude's Discretion: `{ '~standard': { vendor: 'fake', version: 1 /* no validate */ } }` returns false.
  </action>
  <verify>
    <automated>cd /Users/niraj/Desktop/Projects/routing-controlles-express && pnpm test --run tests/adapter/validation.test.ts -t "isStandardSchema|renderPath"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "export function isStandardSchema" src/adapter/validation.ts` returns one match
    - `grep -n "export function renderPath" src/adapter/validation.ts` returns one match
    - All tests for behavior bullets above pass
    - Imposter test (object with ~standard but no validate) returns false
    - PathSegment-shape test (`[{key:'user'},{key:0},{key:'name'}]`) renders to `'user[0].name'`
    - `pnpm exec tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Probe + path renderer handle every shape; ready for resolveInputs to consume.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: resolveInputs() — D-06/D-07/D-10 four-slot runner</name>
  <files>src/adapter/validation.ts, tests/adapter/validation.test.ts</files>
  <read_first>
    - src/adapter/validation.ts (Task 1 utilities already present)
    - src/adapter/index.ts (Plan 02-01 pre-seeded the file with `// 02-03 validation exports` marker — insert under that marker only; do NOT touch other markers' sections)
    - src/errors/subclasses.ts (BadRequestError constructor signature)
    - src/metadata/types.ts (InputDeclaration shape)
    - .planning/phases/02-runtime-express-adapter-happy-path/02-CONTEXT.md §decisions D-06, D-07, D-08, D-09, D-10
    - .planning/phases/02-runtime-express-adapter-happy-path/02-RESEARCH.md §"Pattern 3" §"Pitfall D" §"Pitfall F"
    - tests/adapter/fixtures/schemas.ts (Zod, Valibot, ArkType fixtures)
  </read_first>
  <behavior>
    resolveInputs(req, input):
    - For each slot s in ['params','query','body','headers']:
        if input[s] is StandardSchema → run schema['~standard'].validate(req[s])
        else → pass req[s] through as raw
    - All four runs in parallel via Promise.all (D-06)
    - If ANY slot returns issues:
        Aggregate all issues from all failing slots into ValidationIssue[]
        Each issue has { slot: s, path: renderPath(issue.path), message: issue.message }
        Throw new BadRequestError('Validation failed', { details: [...] }) — source NOT set here (Plan 02-05's wrapper sets it)
        Do not short-circuit on first failure
    - If all slots succeed, return { params, query, body, headers } where each is the validated value (or raw if no schema). req object is NOT mutated (Pitfall F).
    - Async schemas (validate returns Promise) are handled by Promise.resolve wrapping (Pitfall D).
    - returnedArgs.params etc. carry the schema's transformed/coerced output, not raw req.params (D-10).

    Edge cases:
    - input is undefined → returns { params: req.params, query: req.query, body: req.body, headers: req.headers } with no validation
    - input is empty {} → same as undefined
    - Only some slots have schemas → unvalidated slots pass raw
  </behavior>
  <action>
Add to `src/adapter/validation.ts`:

```ts
import type { Request } from 'express';
import type { InputDeclaration } from '../metadata/types.js';
import { BadRequestError } from '../errors/subclasses.js';
import type { ValidationIssue, ValidationSlot } from '../errors/http-error.js';

export interface ResolvedArgs {
  params: unknown;
  query: unknown;
  body: unknown;
  headers: unknown;
}

const SLOTS: ReadonlyArray<ValidationSlot> = ['params', 'query', 'body', 'headers'];

interface SlotResult {
  slot: ValidationSlot;
  value?: unknown;
  issues?: ValidationIssue[];
}

async function validateSlot(slot: ValidationSlot, schema: unknown, raw: unknown): Promise<SlotResult> {
  if (!isStandardSchema(schema)) {
    return { slot, value: raw };
  }
  // Pitfall D: validate may return Result<T> OR Promise<Result<T>>.
  const out = schema['~standard'].validate(raw);
  const result = await Promise.resolve(out);
  if (result.issues) {
    const issues: ValidationIssue[] = result.issues.map(iss => ({
      slot,
      path: renderPath(iss.path),
      message: iss.message,
    }));
    return { slot, issues };
  }
  return { slot, value: result.value };
}

/**
 * Run all four input slots through Standard Schema validators concurrently (D-06).
 * Aggregates every issue from every failing slot into a single BadRequestError (D-07).
 * Validated values replace raw req values in the returned object; req is NOT mutated (D-10, Pitfall F).
 *
 * The wrapper in Plan 02-05 attaches err.source after this throws.
 */
export async function resolveInputs(
  req: Pick<Request, 'params' | 'query' | 'body' | 'headers'>,
  input?: InputDeclaration
): Promise<ResolvedArgs> {
  const decl = input ?? {};
  const results = await Promise.all(
    SLOTS.map(s => validateSlot(s, (decl as Record<ValidationSlot, unknown>)[s], req[s]))
  );

  const allIssues: ValidationIssue[] = [];
  for (const r of results) if (r.issues) allIssues.push(...r.issues);

  if (allIssues.length > 0) {
    throw new BadRequestError('Validation failed', { details: allIssues });
  }

  const args: ResolvedArgs = { params: undefined, query: undefined, body: undefined, headers: undefined };
  for (const r of results) {
    args[r.slot] = r.value;
  }
  return args;
}
```

**Update `src/adapter/index.ts`:** insert export line(s) DIRECTLY UNDER the existing `// 02-03 validation exports` comment marker (Plan 02-01 pre-created this for parallel-safe Wave 2 inserts). Do NOT touch the `// 02-01`, `// 02-02`, `// 02-04`, or `// 02-05` marker sections. Final shape of the 02-03 section:

```ts
// 02-03 validation exports
export {
  isStandardSchema,
  renderPath,
  resolveInputs,
  type ResolvedArgs,
} from './validation.js';
```

Tests in `tests/adapter/validation.test.ts` under `describe('resolveInputs (D-06/D-07/D-10, INPUT-01/02/03)')`:

1. **No input declaration → raw passthrough**: `resolveInputs({params:{a:'1'},query:{},body:null,headers:{}}, undefined)` returns `{params:{a:'1'}, query:{}, body:null, headers:{}}`.

2. **Single-slot Zod success**: pass `{ body: zodUserBody }` and a valid `req.body`. Assert `args.body` is the validated/coerced object.

3. **Single-slot Zod failure → BadRequestError**: pass invalid email; assert thrown error is `instanceof BadRequestError`, `err.status === 400`, `err.details` has one entry with `slot:'body'`, `path:'email'`, message describing email.

4. **Multi-slot failure aggregation (D-07)**: pass `{ params: zodIdParams, body: zodUserBody }` with BOTH invalid (e.g. params `id:'abc'`, body missing email). Assert `err.details.length === 2`; assert one entry has `slot:'params'` and one has `slot:'body'`. Assert order: params before body (slots resolved in array order, but order in details may differ — accept either, just confirm both present).

5. **Validator parity — Zod, Valibot, ArkType (INPUT-02)**: same valid input (`{email:'a@b.co', name:'Niraj'}`), three separate calls with each vendor's schema in `body`; assert all succeed and return equivalent shape.

6. **Validator parity on failure**: same invalid input, all three vendors; assert all throw BadRequestError with at least one issue.

7. **Async schema (Pitfall D)**: hand-craft a StandardSchema-shaped object whose `validate` returns `Promise.resolve({ issues: [{ message: 'async fail', path: ['x'] }] })`. Assert resolveInputs awaits and produces the issue.

8. **req NOT mutated (Pitfall F)**: pass `req.body = { email: 'A@B.CO' }` (uppercase); use a Zod schema that lowercases via `.transform`. After resolveInputs, assert `req.body.email === 'A@B.CO'` (untouched) AND `args.body.email === 'a@b.co'` (transformed).

9. **Imposter schema → raw passthrough**: pass `{ body: { '~standard': { vendor:'fake', version:1 } } }` (no validate). resolveInputs treats as no-schema; returns raw req.body.

10. **Path rendering integrated**: nested zod schema (e.g. `z.object({ user: z.object({ email: z.string().email() }) })`) with invalid email. Issue path should render as `'user.email'`.

11. **Array path rendering (D-09)**: zod array schema like `z.object({ items: z.array(z.object({ name: z.string().min(1) })) })`; provide `items: [{name:''}]`. Path should render as `'items[0].name'`.
  </action>
  <verify>
    <automated>cd /Users/niraj/Desktop/Projects/routing-controlles-express && pnpm test --run tests/adapter/validation.test.ts && pnpm exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "export async function resolveInputs" src/adapter/validation.ts` returns one match
    - `grep -n "Promise.all" src/adapter/validation.ts` returns at least one match (D-06)
    - All 11 test cases above pass
    - Test 4 (multi-slot aggregation) confirms `err.details.length === 2` — proves no short-circuit (D-07)
    - Test 5 (Zod, Valibot, ArkType parity) all green — proves INPUT-02
    - Test 8 (req not mutated) passes — proves Pitfall F mitigation
    - `grep -n "// 02-03 validation exports" src/adapter/index.ts` returns one match (marker preserved)
    - `grep -n "resolveInputs" src/adapter/index.ts` returns one match (export inserted under the 02-03 marker)
    - `grep -n "// 02-02 router-build exports\|// 02-04 response exports\|// 02-05 error-middleware" src/adapter/index.ts` returns 3 matches (other Wave 2 markers untouched)
    - `pnpm exec tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Four-slot validator covers every Standard Schema vendor, aggregates failures, leaves req untouched.</done>
</task>

</tasks>

<verification>
- INPUT-01 (destructured args), INPUT-02 (Zod/Valibot/ArkType), INPUT-03 (BadRequestError with details) all proven by tests in this plan
- D-06, D-07, D-08, D-09, D-10 each have a corresponding test
- Pitfalls D, E, F each have a regression test
- `pnpm test --run tests/adapter/validation.test.ts` all green
</verification>

<success_criteria>
INPUT-01/02/03 are testable in isolation. Plan 02-05 will integrate `resolveInputs` into the per-handler wrapper.
</success_criteria>

<output>
Create `.planning/phases/02-runtime-express-adapter-happy-path/02-03-SUMMARY.md`
</output>
