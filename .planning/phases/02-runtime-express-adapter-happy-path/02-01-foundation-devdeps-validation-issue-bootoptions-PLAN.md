---
phase: 02-runtime-express-adapter-happy-path
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - src/errors/http-error.ts
  - tests/errors/http-error.test.ts
  - src/adapter/boot-options.ts
  - src/adapter/index.ts
  - tests/adapter/boot-options.test.ts
  - tests/adapter/fixtures/controllers.ts
  - tests/adapter/fixtures/schemas.ts
autonomous: true
requirements: [BUILD-03, API-03, INPUT-03]
must_haves:
  truths:
    - "Phase 1 ValidationIssue type carries { slot, path, message } so D-08 JSON shape can be emitted without type casts (traces SC #2)"
    - "express, supertest, zod, valibot, arktype installed as devDependencies; express ^5.1.0 also declared as a peerDependency (traces SC #1, BUILD-03)"
    - "BootOptions type declares every API-03 key (controllers, middlewares, interceptors, routePrefix, cors, defaultErrorHandler, validation, authorizationChecker, currentUserChecker, printRoutes) (traces SC #1)"
    - "tests/adapter/ directory exists with shared fixtures so Wave 2 plans can land in parallel without merge conflicts"
    - "src/adapter/index.ts pre-created with comment markers per Wave 2 plan ID, eliminating barrel-export merge conflicts when 02-02/02-03/02-04/02-05 land in parallel"
  artifacts:
    - path: src/errors/http-error.ts
      provides: "Widened ValidationIssue type with slot + string|array path"
    - path: src/adapter/boot-options.ts
      provides: "BootOptions interface + ClassConstructor[] controllers, plus defaultErrorHandler/validation/etc."
    - path: src/adapter/index.ts
      provides: "Empty barrel pre-seeded with `// 02-NN ...` comment markers so each Wave 2 plan inserts exports under its own marker"
    - path: tests/adapter/fixtures/controllers.ts
      provides: "Reusable controller fixtures for Wave 2/3 integration tests"
    - path: tests/adapter/fixtures/schemas.ts
      provides: "Reusable Zod/Valibot/ArkType schema fixtures for INPUT-02 conformance"
  key_links:
    - from: src/errors/subclasses.ts
      to: src/errors/http-error.ts
      via: "BadRequestError({ details: ValidationIssue[] }) — must still typecheck after widening"
      pattern: "ValidationIssue"
---

<objective>
Foundation work for Phase 2. Lands three things that every Wave 2 plan depends on:

1. **Widen Phase 1's `ValidationIssue`** to carry `slot` + string-or-array `path` so D-08's JSON shape is emittable without casts. Phase 1 D-04 explicitly pre-committed this widening (per CONTEXT.md `code_context`).
2. **Install Phase 2 dependencies** — `express` peer + dev, `supertest` for HTTP integration tests, and `zod` + `valibot` + `arktype` as devDeps for INPUT-02 conformance.
3. **Define the `BootOptions` type and adapter scaffolding** (`src/adapter/`, `tests/adapter/`, fixtures) so Wave 2 plans (router-build, validation, response, error-middleware) can land in parallel without merge conflicts.

Purpose: De-risk the only structural Phase-1 change Phase 2 forces, get test infra in place, and publish the BootOptions contract that Wave 2/3 modules will consume.

Output: Updated `http-error.ts` (additive widening), updated `package.json`, new `src/adapter/boot-options.ts` + `src/adapter/index.ts` scaffold, new `tests/adapter/` with shared fixtures.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/02-runtime-express-adapter-happy-path/02-CONTEXT.md
@.planning/phases/02-runtime-express-adapter-happy-path/02-RESEARCH.md
@CLAUDE.md
@src/errors/http-error.ts
@src/errors/subclasses.ts
@src/types/resolved.ts
@src/metadata/types.ts
@src/types/action.ts
@src/index.ts
@package.json

<interfaces>
Phase 1 shipped (read but do NOT change unless noted):

```ts
// src/errors/http-error.ts (current — TO BE WIDENED)
export interface ValidationIssue {
  path: ReadonlyArray<PropertyKey>;
  message: string;
}

// src/errors/subclasses.ts (consumer of ValidationIssue — must keep compiling)
export class BadRequestError extends HttpError {
  readonly details?: ReadonlyArray<ValidationIssue>;
  readonly source?: string;
  constructor(message = 'Bad Request',
    options?: HttpErrorOptions & { details?: ReadonlyArray<ValidationIssue>; source?: string });
}

// src/types/action.ts
export type ClassConstructor<T = unknown> = abstract new (...args: any[]) => T;
export interface Action { request: unknown; response: unknown; next?: unknown; }
```

D-08 target JSON detail shape (Phase 2 emits this):
```ts
{ slot: 'params'|'query'|'body'|'headers'; path: string; message: string }
```

Recommended widening (RESEARCH.md §VAL-DETAILS-SHAPE option 1, additive, backward compatible):
```ts
export type ValidationSlot = 'params' | 'query' | 'body' | 'headers';
export interface ValidationIssue {
  slot?: ValidationSlot;
  path: string | ReadonlyArray<PropertyKey>;
  message: string;
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Widen ValidationIssue in src/errors/http-error.ts (D-08 prep, RESEARCH.md §VAL-DETAILS-SHAPE option 1)</name>
  <files>src/errors/http-error.ts, tests/errors/http-error.test.ts</files>
  <read_first>
    - src/errors/http-error.ts (current narrow ValidationIssue interface — line 5-8)
    - src/errors/subclasses.ts (BadRequestError consumes ValidationIssue[] in constructor — must still typecheck)
    - src/errors/index.ts (uses `export * from './http-error.js'` — wildcard re-export will propagate ValidationSlot automatically; no edits required there)
    - tests/errors/http-error.test.ts (existing tests asserting current ValidationIssue shape)
    - .planning/phases/02-runtime-express-adapter-happy-path/02-RESEARCH.md §"VAL-DETAILS-SHAPE — Phase 1's ValidationIssue is too narrow for D-08"
  </read_first>
  <action>
Widen `ValidationIssue` in `src/errors/http-error.ts` ADDITIVELY per D-08 + RESEARCH.md option 1. Replace lines 5-8 with:

```ts
export type ValidationSlot = 'params' | 'query' | 'body' | 'headers';

export interface ValidationIssue {
  /**
   * Which input slot the issue originated from.
   * Optional for backward compatibility; Phase 2 always populates it.
   */
  slot?: ValidationSlot;
  /**
   * Path to the offending field. Phase 2 emits a rendered string (e.g. "items[0].name");
   * pre-Phase-2 callers may pass a ReadonlyArray<PropertyKey>. Both shapes are accepted.
   */
  path: string | ReadonlyArray<PropertyKey>;
  message: string;
}
```

`src/errors/index.ts` already uses `export * from './http-error.js'`, so `ValidationSlot` and the widened `ValidationIssue` propagate automatically — do NOT add a named re-export there (it would create a duplicate-export TS error).

In `tests/errors/http-error.test.ts`, ADD a test block named `"ValidationIssue widened shape (Phase 2 prep, D-08)"` with three assertions:

1. `const issue: ValidationIssue = { slot: 'body', path: 'user.email', message: 'Invalid' };` typechecks (string path).
2. `const issue2: ValidationIssue = { path: ['user', 'email'], message: 'Invalid' };` typechecks (array path, no slot — backward compat).
3. Constructing `new BadRequestError('Validation failed', { details: [issue, issue2], source: 'X.y' })` succeeds and `err.toJSON()` returns an object whose `details` field is the same array.

Do NOT change `BadRequestError` itself — it accepts `ReadonlyArray<ValidationIssue>` already and the widening is additive.

Why widen, not replace: per CONTEXT.md key_decisions D-04 (Phase 1) "BadRequestError carries details: ValidationIssue[] and source: string as optional fields — contract pre-committed for Phase 2 to populate at validation time without a breaking change."
  </action>
  <verify>
    <automated>cd /Users/niraj/Desktop/Projects/routing-controlles-express && pnpm exec tsc --noEmit && pnpm test --run tests/errors/http-error.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "export type ValidationSlot" src/errors/http-error.ts` returns one match
    - `grep -nE "slot\?: ValidationSlot" src/errors/http-error.ts` returns one match
    - `grep -nE "path: string \| ReadonlyArray<PropertyKey>" src/errors/http-error.ts` returns one match
    - `grep -nE "ValidationSlot|ValidationIssue" src/errors/http-error.ts` returns >= 1 match (the wildcard re-export in `src/errors/index.ts` propagates the type — verifying the source is sufficient)
    - `pnpm exec tsc --noEmit` exits 0 (Phase 1 BadRequestError still compiles)
    - `pnpm test --run tests/errors/` passes 100% (existing tests unaffected, new test block green)
    - `grep -c "ValidationIssue widened shape" tests/errors/http-error.test.ts` >= 1
  </acceptance_criteria>
  <done>ValidationIssue widened additively; Phase 1 callers still compile; new test block confirms both old (array) and new (slot+string) shapes are accepted.</done>
</task>

<task type="auto">
  <name>Task 2: Install Phase 2 dependencies (express peer+dev, supertest, zod, valibot, arktype)</name>
  <files>package.json</files>
  <read_first>
    - package.json (current dependencies, devDependencies, peerDependencies sections)
    - .planning/phases/02-runtime-express-adapter-happy-path/02-RESEARCH.md §"Standard Stack" + §"Wave 0 Gaps"
    - CLAUDE.md §"Technology Stack" (Express v5 peer dep policy)
  </read_first>
  <action>
Update `package.json`:

1. Under `peerDependencies` add (or add the section if missing):
   - `"express": "^5.1.0"` — BUILD-03 declares Express v5 as a peer dep.

2. Under `peerDependenciesMeta` (create if missing):
   - `"express": { "optional": false }` — required peer.

3. Under `devDependencies` add:
   - `"express": "^5.1.0"` — for tests/typecheck (works with the peer range)
   - `"@types/express": "^5"` — typings (Express 5 ships its own but @types/express still useful for ecosystem alignment; if @types/express ^5 unavailable at install time, fall back to whatever is current — adjust the range to whatever installs cleanly)
   - `"supertest": "^7.0.0"` — HTTP integration test client (RESEARCH.md §"Validation Architecture")
   - `"@types/supertest": "^6.0.0"` — typings
   - `"zod": "^4.0.0"` — INPUT-02 Standard Schema conformance fixture
   - `"valibot": "^1.0.0"` — INPUT-02 conformance fixture
   - `"arktype": "^2.0.0"` — INPUT-02 conformance fixture

Then run `pnpm install` and verify `node_modules/express`, `node_modules/supertest`, `node_modules/zod`, `node_modules/valibot`, `node_modules/arktype` all exist.

Commit produced lockfile changes (`pnpm-lock.yaml`).

Do NOT add Express to `dependencies` — it's a peer, never a runtime dep.
  </action>
  <verify>
    <automated>cd /Users/niraj/Desktop/Projects/routing-controlles-express && pnpm install --frozen-lockfile=false && node -e "require.resolve('express'); require.resolve('supertest'); require.resolve('zod'); require.resolve('valibot'); require.resolve('arktype'); console.log('OK')"</automated>
  </verify>
  <acceptance_criteria>
    - `node -e "console.log(require('./package.json').peerDependencies.express)"` prints `^5.1.0`
    - `node -e "console.log(require('./package.json').devDependencies.express)"` prints a version starting with `^5.`
    - `node -e "console.log(require('./package.json').devDependencies.supertest)"` prints `^7.0.0` (or higher 7.x)
    - `node -e "['zod','valibot','arktype','@types/supertest'].forEach(p => console.log(p, require('./package.json').devDependencies[p]))"` shows all four present
    - `node -e "console.log(JSON.stringify(require('./package.json').dependencies))" | grep -v express` (express NOT in dependencies)
    - `pnpm-lock.yaml` updated (file mtime newer than start of task)
  </acceptance_criteria>
  <done>All five new packages installed and resolvable; package.json declares express as peer + dev; lockfile updated; nothing in `dependencies` references express.</done>
</task>

<task type="auto">
  <name>Task 3: Create src/adapter/ scaffold with BootOptions type (D-03, API-03)</name>
  <files>src/adapter/boot-options.ts, src/adapter/index.ts, tests/adapter/boot-options.test.ts</files>
  <read_first>
    - src/types/action.ts (ClassConstructor type)
    - .planning/phases/02-runtime-express-adapter-happy-path/02-CONTEXT.md §decisions D-03 + §specifics
    - .planning/phases/02-runtime-express-adapter-happy-path/02-RESEARCH.md §"Architecture Patterns" §"Module Layout"
    - .planning/REQUIREMENTS.md (API-03 list of boot option keys)
  </read_first>
  <action>
Create `src/adapter/boot-options.ts` with the COMPLETE BootOptions type per D-03 (every API-03 key, even Phase 3/4 keys):

```ts
import type { ClassConstructor, Action } from '../types/action.js';

/**
 * Authorization checker signature — Phase 3 (AUTH-02). Phase 2 accepts but no-ops.
 */
export type AuthorizationChecker = (action: Action, roles?: string[]) => boolean | Promise<boolean>;

/**
 * Current-user checker signature — Phase 3 (AUTH-03). Phase 2 accepts but no-ops.
 */
export type CurrentUserChecker = (action: Action) => unknown | Promise<unknown>;

/**
 * Library boot options. Every API-03 key is typed today so call sites are
 * forward-compatible across Phases 2-4. Phase 2 implements:
 *   - controllers, routePrefix, defaultErrorHandler
 * Phase 2 silently no-ops (typed, ignored at runtime):
 *   - middlewares, interceptors, cors, validation,
 *     authorizationChecker, currentUserChecker, printRoutes
 *
 * @see D-03 in 02-CONTEXT.md
 */
export interface BootOptions {
  /** Controller classes to register. Phase 2 accepts ClassConstructor[] only; glob loading is Phase 4 (UTIL-04). */
  controllers: ReadonlyArray<ClassConstructor<unknown>>;

  /** Optional path prefix prepended to every controller. D-04 path composition rules apply. */
  routePrefix?: string;

  /** When false, library does not mount its error middleware (D-17). Default true. */
  defaultErrorHandler?: boolean;

  /** Phase 3 — middleware classes/functions. Phase 2 accepts and ignores. */
  middlewares?: ReadonlyArray<ClassConstructor<unknown> | Function>;

  /** Phase 3 — interceptor classes. Phase 2 accepts and ignores. */
  interceptors?: ReadonlyArray<ClassConstructor<unknown>>;

  /** Phase 4 — CORS option. Phase 2 accepts and ignores. */
  cors?: boolean | Record<string, unknown>;

  /** Reserved for future validation overrides (e.g., a non-Standard-Schema escape hatch). Phase 2 accepts and ignores. */
  validation?: unknown;

  /** Phase 3 — global authorization checker. Phase 2 accepts and ignores. */
  authorizationChecker?: AuthorizationChecker;

  /** Phase 3 — global current-user checker. Phase 2 accepts and ignores. */
  currentUserChecker?: CurrentUserChecker;

  /** Phase 4 — log a route table at boot. Phase 2 accepts and ignores. */
  printRoutes?: boolean;
}
```

Create `src/adapter/index.ts` as an EMPTY barrel pre-seeded with one comment marker per Wave 2 plan, plus the boot-options re-export this plan owns. **CRITICAL — Wave 2 merge-conflict prevention:** each Wave 2 plan (02-02, 02-03, 02-04, 02-05) inserts its export line(s) DIRECTLY UNDER its own `// 02-NN ...` marker; no plan touches another plan's marker section. Layout:

```ts
// Internal barrel for src/adapter — populated as Wave 2 modules land.
// Public re-exports from this folder go through src/index.ts.
//
// Wave 2 plans append exports under their own marker only — DO NOT touch other markers' sections.

// 02-01 boot-options exports
export type { BootOptions, AuthorizationChecker, CurrentUserChecker } from './boot-options.js';

// 02-02 router-build exports

// 02-03 validation exports

// 02-04 response exports

// 02-05 error-middleware + handler-wrapper exports
```

The four trailing markers MUST be present even though their sections are empty at end-of-Plan-02-01 — Wave 2 plans rely on the markers existing.

Create `tests/adapter/boot-options.test.ts` covering D-03:

```ts
import { describe, it, expect, expectTypeOf } from 'vitest';
import type { BootOptions } from '../../src/adapter/boot-options.js';

describe('BootOptions (D-03 — every API-03 key typed)', () => {
  it('accepts a minimal options object with only controllers', () => {
    const opts: BootOptions = { controllers: [] };
    expect(opts.controllers).toEqual([]);
  });

  it('accepts every API-03 key without compile error', () => {
    const opts: BootOptions = {
      controllers: [],
      routePrefix: '/api',
      defaultErrorHandler: false,
      middlewares: [],
      interceptors: [],
      cors: true,
      validation: undefined,
      authorizationChecker: () => true,
      currentUserChecker: () => null,
      printRoutes: true,
    };
    expect(opts).toBeDefined();
  });

  it('all keys except controllers are optional', () => {
    expectTypeOf<BootOptions>().toMatchTypeOf<{ controllers: unknown }>();
  });
});
```

Do NOT add anything to the public `src/index.ts` barrel yet — Plan 02-06 wires the public exports.
  </action>
  <verify>
    <automated>cd /Users/niraj/Desktop/Projects/routing-controlles-express && pnpm exec tsc --noEmit && pnpm test --run tests/adapter/boot-options.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - File `src/adapter/boot-options.ts` exists and exports `BootOptions`, `AuthorizationChecker`, `CurrentUserChecker`
    - `grep -cE "^\s+(controllers|routePrefix|defaultErrorHandler|middlewares|interceptors|cors|validation|authorizationChecker|currentUserChecker|printRoutes)\??:" src/adapter/boot-options.ts` returns 10 (every API-03 key present in the BootOptions interface)
    - File `src/adapter/index.ts` exists and re-exports BootOptions
    - `grep -c "// 02-02 router-build exports" src/adapter/index.ts` returns 1 (Wave 2 marker present)
    - `grep -c "// 02-03 validation exports" src/adapter/index.ts` returns 1
    - `grep -c "// 02-04 response exports" src/adapter/index.ts` returns 1
    - `grep -c "// 02-05 error-middleware + handler-wrapper exports" src/adapter/index.ts` returns 1
    - File `tests/adapter/boot-options.test.ts` exists and the test passes
    - `pnpm exec tsc --noEmit` exits 0
    - `grep -n "useExpressControllers\|createExpressServer" src/index.ts` returns NO matches (wiring still Plan 02-06's job)
  </acceptance_criteria>
  <done>BootOptions type lands with every API-03 key; src/adapter/index.ts pre-seeded with four Wave 2 markers (so 02-02/02-03/02-04/02-05 can append in parallel without touching each other's sections); existing public surface unchanged.</done>
</task>

<task type="auto">
  <name>Task 4: Create tests/adapter/fixtures/ for Wave 2 reuse</name>
  <files>tests/adapter/fixtures/controllers.ts, tests/adapter/fixtures/schemas.ts</files>
  <read_first>
    - src/decorators/index.ts (verify Controller/JsonController/Get/Post/HttpCode exports)
    - src/types/standard-schema.ts (StandardSchemaV1 type)
    - .planning/phases/02-runtime-express-adapter-happy-path/02-RESEARCH.md §"Validation Architecture" §"Wave 0 Gaps"
  </read_first>
  <action>
Create `tests/adapter/fixtures/schemas.ts` exporting one schema per Standard Schema vendor — Wave 2 plans (router-build, validation, response, error-middleware) and Wave 4 SC tests reuse these:

```ts
import { z } from 'zod';
import * as v from 'valibot';
import { type } from 'arktype';

// Zod v4 — implements Standard Schema natively
export const zodUserBody = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

export const zodIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

// Valibot v1 — implements Standard Schema natively
export const valibotUserBody = v.object({
  email: v.pipe(v.string(), v.email()),
  name: v.pipe(v.string(), v.minLength(1)),
});

// ArkType v2 — implements Standard Schema natively
export const arktypeUserBody = type({
  email: 'string.email',
  name: 'string > 0',
});
```

Create `tests/adapter/fixtures/controllers.ts` exporting a small set of fixture controllers Wave 2/3 reuse. Use the actual decorators from `src/decorators/index.ts`. Example skeleton (adapt to actual exported names):

```ts
import 'reflect-metadata';
import { Controller, JsonController, Get, Post, HttpCode, OnNull, OnUndefined } from '../../../src/index.js';
import { zodUserBody, zodIdParams } from './schemas.js';

@JsonController('/users')
export class UsersController {
  @Get('/:id', { params: zodIdParams })
  getById({ params }: { params: { id: number } }) {
    return { id: params.id, name: `user-${params.id}` };
  }

  @Post('/', { body: zodUserBody })
  create({ body }: { body: { email: string; name: string } }) {
    return { created: true, email: body.email, name: body.name };
  }

  @Get('/null')
  @OnNull(404)
  alwaysNull() { return null; }

  @Get('/undef')
  @OnUndefined(204)
  alwaysUndef() { return undefined; }
}

@Controller('/text')
export class TextController {
  @Get('/hello')
  hello() { return 'hello world'; }

  @Get('/buffer')
  buf() { return Buffer.from('binary'); }
}

// Inheritance fixture for ROUTE-05 (subclass-wins semantics from Phase 1 D-06)
@JsonController('/base')
export class BaseController {
  @Get('/ping') ping() { return { from: 'base' }; }
}

@JsonController('/derived')
export class DerivedController extends BaseController {
  @Get('/own') own() { return { from: 'derived' }; }
}
```

If any decorator import name is wrong, fix it by reading `src/decorators/index.ts` first — do NOT guess.

Add a single sanity test `tests/adapter/fixtures/fixtures.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildMetadata } from '../../../src/index.js';
import { UsersController, TextController, BaseController, DerivedController } from './controllers.js';

describe('Phase 2 fixture controllers', () => {
  it('build a non-empty metadata tree', () => {
    const meta = buildMetadata([UsersController, TextController, BaseController, DerivedController]);
    expect(meta.length).toBe(4);
    expect(meta.every(c => c.actions.length > 0)).toBe(true);
  });
});
```
  </action>
  <verify>
    <automated>cd /Users/niraj/Desktop/Projects/routing-controlles-express && pnpm exec tsc --noEmit && pnpm test --run tests/adapter/fixtures/</automated>
  </verify>
  <acceptance_criteria>
    - `tests/adapter/fixtures/controllers.ts` exists and exports UsersController, TextController, BaseController, DerivedController
    - `tests/adapter/fixtures/schemas.ts` exists and exports schemas for all three vendors (zod, valibot, arktype)
    - `grep -c "^export " tests/adapter/fixtures/schemas.ts` >= 3
    - `pnpm test --run tests/adapter/fixtures/` passes (sanity test green)
    - `pnpm exec tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Fixtures published; Wave 2 plans can import them without re-defining controllers/schemas.</done>
</task>

</tasks>

<verification>
- `pnpm exec tsc --noEmit` clean
- `pnpm test --run tests/errors/ tests/adapter/` all green
- All five new dev/peer dependencies installed
- `src/adapter/boot-options.ts` exports BootOptions with every API-03 key
- `src/errors/http-error.ts` ValidationIssue widened (slot optional, path string|array)
- `src/adapter/index.ts` contains four Wave 2 comment markers (02-02/02-03/02-04/02-05) for conflict-free parallel barrel inserts
</verification>

<success_criteria>
Foundation complete when ValidationIssue is widened, all five Phase 2 deps install, BootOptions covers every API-03 key, adapter test fixtures are reusable, and src/adapter/index.ts is pre-seeded with Wave 2 markers.
</success_criteria>

<output>
Create `.planning/phases/02-runtime-express-adapter-happy-path/02-01-SUMMARY.md`
</output>
