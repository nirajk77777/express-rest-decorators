---
phase: 02-runtime-express-adapter-happy-path
plan: 07
type: execute
wave: 4
depends_on: [02-06]
files_modified:
  - tests/integration/02-sc-acceptance.test.ts
  - tests/integration/02-grep-gates.test.ts
autonomous: true
requirements: [API-01, API-02, API-03, ROUTE-04, ROUTE-05, INPUT-01, INPUT-02, INPUT-03, ERR-03, ERR-05, RES-08, BUILD-03]
must_haves:
  truths:
    - "ROADMAP SC #1 — useExpressControllers AND createExpressServer both work; multiple controllers + inheritance + routePrefix all behave (acceptance fixture)"
    - "ROADMAP SC #2 — Zod, Valibot, AND ArkType schemas in the same controller fixture all produce valid handler args on success and a single BadRequestError with field-level details + source on failure (acceptance fixture)"
    - "ROADMAP SC #3 — async throw reaches libraryErrorMiddleware EXACTLY once; no try/catch wrappers around handlers (verified via grep gate + behavior test)"
    - "ROADMAP SC #4 — all 4 v4 footguns (* / :id? / :id(\\d+) / unnamed (regex)) throw at registration with controller.method + suggestion; valid v8 patterns work end-to-end (acceptance fixture)"
    - "ROADMAP SC #5 — plain object → JSON (JsonController); string → text (Controller); Buffer → binary; stream piped; async iterable piped (acceptance fixture)"
    - "Grep gates: exactly one Express import in src/ (in router-build.ts AND boot.ts — count to be confirmed by gate); zero express imports outside src/adapter/; libraryErrorMiddleware mounted by app.use exactly once per useExpressControllers call"
  artifacts:
    - path: tests/integration/02-sc-acceptance.test.ts
      provides: "Five executable assertions, one per SC, that the verifier reads to confirm phase done"
    - path: tests/integration/02-grep-gates.test.ts
      provides: "FS-based grep checks (Phase 1 pattern from 01-06) confirming structural invariants"
  key_links:
    - from: tests/integration/02-sc-acceptance.test.ts
      to: src/index.ts
      via: "imports public surface; uses supertest for HTTP behavior"
      pattern: "from '../../src/index"
---

<objective>
Convert ROADMAP Phase 2's five Success Criteria into five executable Vitest tests, plus a grep-gate test that asserts the structural invariants Phase 2 promises (zero Express imports outside `src/adapter/`, exactly-once-mounted error middleware per call, no try/catch around handlers in Phase-2-owned source).

This is the goal-backward verification target — every must_have in this plan traces directly to an SC. `/gsd-verify-work` reads these tests to confirm Phase 2 is done.

Purpose: Make Phase 2 acceptance non-subjective.

Output: Two integration test files; both must pass green before Phase 2 is considered complete.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/02-runtime-express-adapter-happy-path/02-CONTEXT.md
@src/index.ts
@tests/adapter/fixtures/controllers.ts
@tests/adapter/fixtures/schemas.ts
@.planning/phases/01-metadata-decorator-skeleton/01-06-SUMMARY.md

<interfaces>
ROADMAP Phase 2 Success Criteria (verbatim from .planning/ROADMAP.md):

  1. useExpressControllers AND createExpressServer; multiple controllers; controller inheritance; routePrefix.
  2. {params, query, body, headers} schemas (Zod, Valibot, OR ArkType) → typed destructured object; validation failure → BadRequestError 400 with field-level error details + source.
  3. Async throw → library error middleware exactly once; no double-wrap; no headers-already-sent; native v5 propagation; no try/catch wrappers around handlers.
  4. v4 path patterns throw at registration with controller, method, v8 fix; valid v8 patterns work end-to-end.
  5. Plain object/primitive → JSON (matches @JsonController); stream / async iterable → piped to response.

Phase 1 grep-gate pattern (already proven): FS-based, uses Node fs.readFileSync + JS RegExp; see `.planning/phases/01-metadata-decorator-skeleton/01-06-SUMMARY.md` for the exact helper shape used in `tests/integration/01-grep-gates.test.ts`. Reuse that helper or copy it into a Phase-2-local test util.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: SC acceptance — five executable behavior tests</name>
  <files>tests/integration/02-sc-acceptance.test.ts</files>
  <read_first>
    - .planning/ROADMAP.md (Phase 2 Success Criteria — copy them as comments above each test)
    - tests/adapter/fixtures/controllers.ts + schemas.ts (Plan 02-01)
    - tests/adapter/boot.test.ts (Plan 02-06 — many overlap; this file consolidates SC traces)
    - src/index.ts (public surface)
  </read_first>
  <action>
Create `tests/integration/02-sc-acceptance.test.ts`. ONE `describe` per SC; each `describe` has 1-3 `it`s that, together, prove the SC. Quote the SC verbatim above its describe.

```ts
import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Readable } from 'node:stream';
import { z } from 'zod';
import * as v from 'valibot';
import { type as arkType } from 'arktype';
import {
  Controller, JsonController, Get, Post,
  HttpCode, OnNull, OnUndefined,
  useExpressControllers, createExpressServer,
  resetContainer,
} from '../../src/index.js';

beforeEach(() => resetContainer());
```

**SC #1 — boot APIs + multi-controller + inheritance + routePrefix:**

```ts
describe('SC #1 — useExpressControllers / createExpressServer; multi-controller; inheritance; routePrefix', () => {
  // (define inline fixture controllers here OR import from tests/adapter/fixtures)
  it('createExpressServer mounts body-parsers and routes (D-01, D-02)', async () => {
    // POST /users body → echoed (proves body-parser auto-mount)
  });
  it('useExpressControllers respects routePrefix and multiple controllers', async () => {
    // GET /api/users/3 → 200 AND GET /api/text/hello → 200
  });
  it('controller inheritance — derived controller exposes both inherited and own routes', async () => {
    // GET /derived/ping (inherited) AND /derived/own (own) both 200
  });
});
```

**SC #2 — input schemas across Zod, Valibot, ArkType + BadRequestError on failure:**

```ts
describe('SC #2 — Standard Schema validation (Zod/Valibot/ArkType); failure → BadRequestError 400', () => {
  // Build three controllers, one per vendor, registering schemas in different slots:
  //   ZodCtl   — body via zod
  //   ValiCtl  — query via valibot
  //   ArkCtl   — params via arktype
  it('Zod body schema — happy path returns transformed value in handler arg', async () => { /* POST 200 */ });
  it('Valibot query schema — happy path', async () => { /* GET ?x=valid 200 */ });
  it('ArkType params schema — happy path', async () => { /* GET /things/123 200 */ });
  it('failure on multiple slots → single BadRequestError with aggregate details + source', async () => {
    // Build a controller with body+params schemas; send request that fails BOTH slots
    // Assert response.status === 400, body.name === 'BadRequestError',
    //   body.details.length >= 2, body.source === 'CtlClass.methodName'
  });
});
```

**SC #3 — async throw reaches lib error middleware exactly once; no try/catch wrappers:**

```ts
describe('SC #3 — async throw → libraryErrorMiddleware exactly once; native v5 propagation', () => {
  it('async handler that throws → 500 with InternalServerError envelope; err.source attached', async () => {
    // GET /boom → status 500, body.name === 'InternalServerError', body.source ends with '.boom'
  });
  it('handler that throws HttpError → status from err.status, toJSON shape preserved', async () => {
    // throws NotFoundError('user 9') → 404, body.name === 'NotFoundError', body.message === 'user 9'
  });
  it('error middleware fires exactly once per pre-headers error (spy/counter)', async () => {
    // Spy approach: install a counter middleware AHEAD of libraryErrorMiddleware that increments
    // on every error pass; throw once from a handler that has NOT yet written headers.
    // Assert: counter === 1 AND libraryErrorMiddleware writes JSON 500 once.
  });
  it('post-headers stream error → headersSent guard destroys response without "headers already sent" throw', async () => {
    // Explicit mid-stream-error fixture: handler returns a Readable that emits 'data' then errors
    // AFTER first byte. Assert: res.headersSent === true path is taken (capture via spy on res.destroy);
    // NO ERR_HTTP_HEADERS_SENT thrown in the test harness; libraryErrorMiddleware did NOT call res.json again.
  });
});
```

**SC #4 — v4 patterns throw at registration; valid v8 works:**

```ts
describe('SC #4 — path-to-regexp v8 footguns rejected at boot; valid v8 works end-to-end', () => {
  // For each of 4 v4 patterns, build a fixture controller with that path
  //   class FixtureA { @Get('/files/*') a() {} }
  //   class FixtureB { @Get('/users/:id?') b() {} }
  //   class FixtureC { @Get('/posts/:id(\\d+)') c() {} }
  //   class FixtureD { @Get('/(.*)') d() {} }
  // For each, expect createExpressServer({controllers:[Fixture]}) to throw with
  //   /\[Fixture[A-D]\.\w+\] Path ".+" uses v4 pattern ".+"; in path-to-regexp v8 use ".+" instead/
  it('rejects bare * with named-wildcard suggestion', () => { ... });
  it('rejects :id? with optional-segment suggestion', () => { ... });
  it('rejects :id(regex) with schema-validation suggestion', () => { ... });
  it('rejects (regex) unnamed group with named-param suggestion', () => { ... });
  it('valid v8 patterns work end-to-end', async () => {
    // controller with @Get('/files/*splat') and @Get('/users{/:id}') boots; supertest hits both → 200
  });
});
```

**SC #5 — JSON serialization + stream + async-iterable piping:**

```ts
describe('SC #5 — response writing: JSON, primitive, stream, async iterable, @Header', () => {
  it('@JsonController returning plain object → application/json', async () => { ... });
  it('@JsonController returning primitive → JSON-encoded primitive', async () => { ... });
  it('@JsonController returning null → 204 No Content (default, no @OnNull)', async () => { ... });
  it('@Controller returning string → text/html', async () => { ... });
  it('@JsonController returning a Node Readable stream → piped to response with backpressure', async () => {
    // value: Readable.from(['chunk-a','chunk-b']) → response body 'chunk-achunk-b'
  });
  it('@JsonController returning an async iterable → piped via Readable.from', async () => {
    // value: (async function* () { yield 'x'; yield 'y'; })() → response body 'xy'
  });
  it('@Header() decorator end-to-end — header from Phase 1 decorator arrives on the wire (MINOR #3 fix)', async () => {
    // class HeaderCtl { @Get('/h') @Header('X-Custom-Header','phase2') hi(){ return {ok:1}; } }
    // const app = createExpressServer({ controllers: [HeaderCtl] });
    // const res = await request(app).get('/h');
    // expect(res.status).toBe(200);
    // expect(res.headers['x-custom-header']).toBe('phase2');
    // Proves the @Header metadata shape used by Plan 02-04's applyResponseHandlers
    // matches the Phase 1 decorator's actual emit (no fabricated literal).
  });
});
```

For each fixture controller, define inline within the test file (or import from `tests/adapter/fixtures/controllers.ts` if reusable). Use `expect(...).rejects.toThrow(/regex/)` for SC #4 boot-time throws.

Total expected test count in this file: ~20 it() cases. All must pass.
  </action>
  <verify>
    <automated>cd /Users/niraj/Desktop/Projects/routing-controlles-express && pnpm test --run tests/integration/02-sc-acceptance.test.ts && pnpm exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - File exists with five `describe` blocks, one per SC (grep matches: `grep -cE "^describe\\('SC #[1-5]" tests/integration/02-sc-acceptance.test.ts` >= 5)
    - All `it` cases pass
    - SC #2 has at least 4 `it` cases (one per vendor + aggregate-failure)
    - SC #4 has at least 5 `it` cases (4 v4 footgun rejections + 1 v8-works)
    - SC #5 has at least 7 `it` cases (json object, primitive, null→204, string→text, stream, async-iterable, @Header end-to-end)
    - SC #3 includes a test asserting err.source ends with the throwing method name
    - SC #3 includes BOTH a pre-headers single-fire test (spy/counter) AND a post-headers stream-error test (headersSent guard, no ERR_HTTP_HEADERS_SENT) — proves error middleware exactly-once across both phases of the response lifecycle (MINOR #4)
    - `pnpm test --run tests/integration/02-sc-acceptance.test.ts` reports 100% pass and >= 20 total tests
  </acceptance_criteria>
  <done>Every ROADMAP Phase 2 SC has executable tests proving it; verifier can read pass/fail directly.</done>
</task>

<task type="auto">
  <name>Task 2: Grep gates — structural invariants of Phase 2</name>
  <files>tests/integration/02-grep-gates.test.ts</files>
  <read_first>
    - tests/integration/01-grep-gates.test.ts (Phase 1 pattern — copy the FS-based helper from 01-06-SUMMARY)
    - .planning/phases/02-runtime-express-adapter-happy-path/02-CONTEXT.md §code_context "Module-private internals" + "Zero global state in core"
    - src/adapter/ (verify which files import 'express')
  </read_first>
  <action>
Create `tests/integration/02-grep-gates.test.ts`. Use the FS-based grep helper Phase 1 established (Node `fs.readFileSync` + JS RegExp; comment-stripping where needed — see Phase 1 SUMMARY for the exact pattern).

Cases:

1. **Express imported only inside src/adapter/**:
   - Walk all .ts files under `src/` excluding `src/adapter/`.
   - For each file, read content, strip lines beginning with `//` and lines wholly inside `/* ... */`.
   - Assert NO line matches `/from ['"]express['"]/` or `/require\(['"]express['"]\)/`.
   - Failure message: list any offending file path.

2. **Express imported in src/adapter/ — at least once, but only in expected files**:
   - Expected files: `src/adapter/router-build.ts`, `src/adapter/boot.ts`, plus possibly `src/adapter/handler-wrapper.ts`, `src/adapter/error-middleware.ts`, `src/adapter/response.ts`, `src/adapter/validation.ts` (each may import only `type`s — those still register as a `from 'express'` line).
   - Assert that the LIST of files in src/adapter/ that contain `from 'express'` (any form, including `import type`) is non-empty AND every such file is named in the allowed set above.
   - This catches accidental Express imports in src/adapter/boot-options.ts (which should stay pure-type-only).

3. **No try/catch around handler calls outside handler-wrapper.ts**:
   - For each .ts file under `src/adapter/` EXCEPT `handler-wrapper.ts`:
     - Strip comments.
     - Count `try {` occurrences.
     - Assert count === 0 for that file (Pitfall A — exactly one try/catch in Phase-2-owned source, in wrapper).
   - Note: `tests/` excluded; `src/errors/` and `src/metadata/` excluded (Phase 1 owns them).

4. **libraryErrorMiddleware mounted exactly once per useExpressControllers call**:
   - Read `src/adapter/boot.ts`.
   - Count `app.use(libraryErrorMiddleware)` literal occurrences (use a fixed string match, not a wildcard).
   - Assert count === 1.

5. **No body-parser usage in useExpressControllers (D-02 asymmetry)**:
   - Read `src/adapter/boot.ts`.
   - Locate the `useExpressControllers` function body (find lines between `export function useExpressControllers` and the next top-level `export function` or end-of-file).
   - Within that range: assert NO `express.json` and NO `express.urlencoded` references.
   - Then: assert in `createExpressServer` body, BOTH references appear at least once.

6. **buildMetadata called exactly once per useExpressControllers**:
   - Read `src/adapter/boot.ts`.
   - Within `useExpressControllers` body range: count `buildMetadata(` occurrences === 1.

7. **No reflect-metadata import added by Phase 2**:
   - For each .ts file under `src/adapter/`: assert NO line matches `/from ['"]reflect-metadata['"]/`. Phase 2 should not import reflect-metadata directly (Phase 1 D-02 reserves it for consumer entry).

8. **Public barrel exposes only the three Phase-2 surfaces from adapter/**:
   - Read `src/index.ts`.
   - Lines re-exporting from `./adapter/...` should match exactly the symbols `useExpressControllers`, `createExpressServer`, `BootOptions`, `AuthorizationChecker`, `CurrentUserChecker` — no others (no `buildControllerRouter`, `resolveInputs`, `writeResponse`, `wrapAction`, `libraryErrorMiddleware`, `composePath`, `detectV4Pattern`, `applyResponseHandlers`, `isStandardSchema`, `renderPath`).

Helper code to start from (FS + comment-strip — match Phase 1's approach):

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...listTsFiles(p));
    else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

function readWithoutComments(file: string): string {
  const raw = readFileSync(file, 'utf8');
  // strip /* ... */ blocks
  const noBlock = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  // strip // line comments
  return noBlock.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
}
```
  </action>
  <verify>
    <automated>cd /Users/niraj/Desktop/Projects/routing-controlles-express && pnpm test --run tests/integration/02-grep-gates.test.ts && pnpm exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - File exists with at least 8 grep-gate `it` cases
    - All cases pass
    - Gate 1 confirms zero `from 'express'` outside src/adapter/
    - Gate 3 confirms zero `try {` blocks in src/adapter/ except handler-wrapper.ts
    - Gate 4 confirms exactly one `app.use(libraryErrorMiddleware)` in src/adapter/boot.ts
    - Gate 5 confirms body-parser ONLY in createExpressServer, not in useExpressControllers
    - Gate 8 confirms public barrel doesn't leak adapter internals
    - `pnpm test --run tests/integration/02-grep-gates.test.ts` reports 100% pass
  </acceptance_criteria>
  <done>Phase 2 structural invariants enforceable; future regressions caught by gates.</done>
</task>

</tasks>

<verification>
- `pnpm test` (full suite) green
- `pnpm exec tsc --noEmit` clean
- All 5 ROADMAP SC have at least one executable test passing
- All 8 grep gates green
- Phase 2 ready for `/gsd-verify-work`
</verification>

<success_criteria>
Phase 2 done when:
- 02-sc-acceptance.test.ts: all 5 SC pass via supertest behavior tests
- 02-grep-gates.test.ts: all structural invariants hold
- Full Phase 2 test suite (tests/adapter/ + tests/integration/02-*) is green
- `pnpm exec tsc --noEmit` clean
</success_criteria>

<output>
Create `.planning/phases/02-runtime-express-adapter-happy-path/02-07-SUMMARY.md`
</output>
