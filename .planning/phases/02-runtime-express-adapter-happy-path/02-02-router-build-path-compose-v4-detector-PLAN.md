---
phase: 02-runtime-express-adapter-happy-path
plan: 02
type: execute
wave: 2
depends_on: [02-01]
files_modified:
  - src/adapter/router-build.ts
  - src/adapter/index.ts
  - tests/adapter/router-build.test.ts
autonomous: true
requirements: [ROUTE-04, ROUTE-05]
must_haves:
  truths:
    - "Composed route string follows D-04: trailing slashes stripped, consecutive // collapsed, empty parts allowed (traces SC #4)"
    - "Bare *, :name?, :name(regex), unnamed (regex) groups throw with [Controller.method] Path \"X\" uses v4 pattern \"Y\"; in path-to-regexp v8 use \"Z\" instead. (traces SC #4, ROUTE-04)"
    - "buildControllerRouter() returns one express.Router() per controller, mounted later by boot.ts at composed prefix (traces SC #1, ROUTE-05)"
    - "Pre-flight v4 detector runs BEFORE router.METHOD() so users see our message, not p2re's terse 'Missing parameter name at position N' (RESEARCH.md Pitfall C)"
  artifacts:
    - path: src/adapter/router-build.ts
      provides: "composePath, detectV4Pattern, buildControllerRouter — pure functions; no body-parser or error-middleware concerns"
      exports: [composePath, detectV4Pattern, buildControllerRouter]
  key_links:
    - from: src/adapter/router-build.ts
      to: src/metadata/builder.ts
      via: "consumes ControllerMetadata from buildMetadata([...])"
      pattern: "ControllerMetadata"
    - from: src/adapter/router-build.ts
      to: express
      via: "express.Router() and router[verb](path, handler) calls"
      pattern: "express\\.Router\\(\\)"
---

<objective>
Build the per-controller router factory: compose final route strings (D-04), detect v4 path-pattern footguns at registration time (D-05, ROUTE-04), and produce one `express.Router()` per controller (ROUTE-05). This module is pure — it accepts a handler factory injected by `boot.ts`, so it has no opinions about validation, response writing, or error middleware. Those land in parallel sibling plans (02-03, 02-04, 02-05).

Purpose: Isolate path math + p2re v8 footgun translation in one tested module, before any HTTP behavior depends on it.

Output: `src/adapter/router-build.ts` with three exports, plus comprehensive unit tests covering all four v4 patterns and path composition edge cases.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/02-runtime-express-adapter-happy-path/02-CONTEXT.md
@.planning/phases/02-runtime-express-adapter-happy-path/02-RESEARCH.md
@src/types/resolved.ts
@src/metadata/types.ts
@src/metadata/builder.ts
@src/types/action.ts
@src/adapter/boot-options.ts

<interfaces>
Phase 1 metadata shapes this module reads (do NOT modify):

```ts
// src/types/resolved.ts
export interface ControllerMetadata {
  target: Function;
  basePath: string;
  type: 'json' | 'default';
  responseHandlers: ResponseHandlerArgs[];
  actions: ActionMetadata[];
}
export interface ActionMetadata {
  target: Function;
  method: string | symbol;
  verb: string;          // 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'all' | <custom>
  path: string;
  input?: InputDeclaration;
  returnType?: Function;
  paramTypes?: Function[];
  responseHandlers: ResponseHandlerArgs[];
}
```

Express v5 Router API (from `import { Router, type Router as RouterT } from 'express'`):
- `const router: RouterT = Router();`
- `router.get(path, handler)`, `router.post(...)`, etc. — `router[verb](path, handler)` works for any string verb.
- `router.all(path, handler)` for the 'all' verb.

Handler factory signature this module accepts (caller-provided so 02-02 stays pure):
```ts
type HandlerFactory = (
  controller: ControllerMetadata,
  action: ActionMetadata
) => import('express').RequestHandler;
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: composePath() — D-04 path composition rules</name>
  <files>src/adapter/router-build.ts, tests/adapter/router-build.test.ts</files>
  <read_first>
    - .planning/phases/02-runtime-express-adapter-happy-path/02-CONTEXT.md §decisions D-04
    - src/types/resolved.ts (ControllerMetadata.basePath, ActionMetadata.path)
  </read_first>
  <behavior>
    - composePath('', '', '/users') === '/users'
    - composePath('/api', '/users', '/:id') === '/api/users/:id'
    - composePath('/api/', '/users/', '/:id') === '/api/users/:id' (trailing slashes stripped)
    - composePath('/api', '', '/health') === '/api/health' (empty controller basePath OK)
    - composePath('', '/users', '') === '/users' (empty action path → controller root)
    - composePath('/api', '/users', '') === '/api/users'
    - composePath('//api//', '//users//', '//:id//') === '/api/users/:id' (collapse consecutive //)
    - composePath('', '', '') === '/' (everything empty → root)
    - Leading slash always present on the output
  </behavior>
  <action>
Create `src/adapter/router-build.ts` with the `composePath` export (other exports added by Tasks 2-3 in this plan):

```ts
/**
 * Compose the final route string from routePrefix + controller basePath + action path.
 * Per D-04:
 *   - strip a trailing '/' from each part
 *   - collapse consecutive '/' to one
 *   - allow empty parts (controller mounts at the prefix root)
 *   - output always starts with '/'
 */
export function composePath(routePrefix: string, basePath: string, actionPath: string): string {
  const parts = [routePrefix, basePath, actionPath]
    .map(p => p ?? '')
    .map(p => p.replace(/\/+$/g, ''))   // strip trailing slashes
    .filter(p => p.length > 0);

  const joined = '/' + parts.join('/');
  // Collapse any consecutive slashes that resulted from the join (e.g. leading '/').
  const collapsed = joined.replace(/\/{2,}/g, '/');
  return collapsed === '' ? '/' : collapsed;
}
```

Add `tests/adapter/router-build.test.ts` covering every behavior bullet plus:
- Single-segment paths without leading slashes: `composePath('api', 'users', ':id') === '/api/users/:id'` (RECOMMENDED — implementation must add the leading slash)
- A v8-valid named wildcard passes through: `composePath('', '/files', '/*splat') === '/files/*splat'`
- Optional v8 group passes through: `composePath('', '/users', '{/:id}') === '/users{/:id}'`
  </action>
  <verify>
    <automated>cd /Users/niraj/Desktop/Projects/routing-controlles-express && pnpm test --run tests/adapter/router-build.test.ts -t composePath</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "export function composePath" src/adapter/router-build.ts` returns one match
    - `pnpm test --run tests/adapter/router-build.test.ts -t composePath` reports >= 8 passing assertions
    - `composePath('//api//', '//users//', '//:id//')` returns exactly `'/api/users/:id'` (no double slashes anywhere in output)
    - `composePath('', '', '')` returns `'/'` exactly
    - `pnpm exec tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Path composition produces clean v8-valid path strings for every D-04 case.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: detectV4Pattern() — D-05 footgun pre-flight</name>
  <files>src/adapter/router-build.ts, tests/adapter/router-build.test.ts</files>
  <read_first>
    - src/adapter/router-build.ts (composePath from Task 1 already present)
    - .planning/phases/02-runtime-express-adapter-happy-path/02-CONTEXT.md §decisions D-05 (the four footguns + exact error format)
    - .planning/phases/02-runtime-express-adapter-happy-path/02-RESEARCH.md §"Pitfall C" (must run BEFORE router.METHOD)
    - .planning/phases/02-runtime-express-adapter-happy-path/02-RESEARCH.md §"Code Examples" §"path-to-regexp v8 — valid syntax"
  </read_first>
  <behavior>
    Test cases that MUST throw with the exact error format `[ControllerClass.methodName] Path "<composed>" uses v4 pattern "<offending>"; in path-to-regexp v8 use "<suggestion>" instead.`:

    1. `'/files/*'` (bare wildcard, not preceded by name) → offending `*`, suggestion `*splat or {*splat}`
    2. `'*'` (bare wildcard alone) → offending `*`, suggestion `*splat or {*splat}`
    3. `'/users/:id?'` → offending `:id?`, suggestion `{/:id} optional segment form`
    4. `'/posts/:id(\\d+)'` → offending `:id(\d+)`, suggestion `move regex to schema validation in the input declaration`
    5. `'/(.*)'` → offending `(.*)`, suggestion `name the parameter (e.g. :path)`
    6. `'/users/:id(\\d+)/posts/:postId(\\d+)'` → reports the FIRST offending pattern only

    Test cases that MUST NOT throw (valid v8):
    - `/users/:id`
    - `/users/:id/posts/:postId`
    - `/files/*splat`
    - `/files{/*splat}`
    - `/users{/:id}`
    - `/files/:file{.:ext}`
    - `/health`
    - `/`
  </behavior>
  <action>
Add to `src/adapter/router-build.ts`:

```ts
/**
 * Detect path-to-regexp v4 patterns that v8 rejects. Throws an actionable error
 * naming the controller, method, offending substring, and a v8 fix suggestion.
 * Must run BEFORE router.METHOD(path, ...) so users see our message, not p2re's
 * terse "Missing parameter name at position N" (per RESEARCH Pitfall C).
 *
 * Detected patterns (D-05):
 *   1. :name(regex) inline regex — e.g. ':id(\\d+)'  → move to schema validation
 *   2. :name? optional-param suffix — e.g. ':id?'    → use '{/:id}' optional-segment
 *   3. Unnamed (regex) groups — e.g. '(.*)' or '(\\d+)' → name the parameter
 *   4. Bare * wildcard (not preceded by an identifier char) — e.g. '/files/*' → '*splat' or '{*splat}'
 *
 * Order matters: check (1) before (3) so ':id(\\d+)' is reported as case (1),
 * not case (3); check (2) before (4) for similar reasons.
 */
export function detectV4Pattern(
  composedPath: string,
  controllerName: string,
  methodName: string
): void {
  const ctx = `[${controllerName}.${methodName}]`;

  // Check 1: :name(regex) inline regex
  const namedRegex = composedPath.match(/:[A-Za-z_$][A-Za-z0-9_$]*\([^)]*\)/);
  if (namedRegex) {
    throw new Error(
      `${ctx} Path "${composedPath}" uses v4 pattern "${namedRegex[0]}"; ` +
      `in path-to-regexp v8 use "move regex to schema validation in the input declaration" instead.`
    );
  }

  // Check 2: :name? optional-param suffix
  const optionalParam = composedPath.match(/:[A-Za-z_$][A-Za-z0-9_$]*\?/);
  if (optionalParam) {
    const name = optionalParam[0].slice(1, -1); // strip ':' and '?'
    throw new Error(
      `${ctx} Path "${composedPath}" uses v4 pattern "${optionalParam[0]}"; ` +
      `in path-to-regexp v8 use "{/:${name}} optional segment form" instead.`
    );
  }

  // Check 3: unnamed (regex) groups — anything (...) not preceded by ':name'
  // We've already eliminated :name(...) above, so any remaining '(' is unnamed.
  const unnamedGroup = composedPath.match(/\([^)]*\)/);
  if (unnamedGroup) {
    throw new Error(
      `${ctx} Path "${composedPath}" uses v4 pattern "${unnamedGroup[0]}"; ` +
      `in path-to-regexp v8 use "name the parameter (e.g. :path)" instead.`
    );
  }

  // Check 4: bare * wildcard. v8 requires *splat (named) or {*splat} (optional).
  // A '*' is "bare" if not immediately followed by an identifier character.
  const bareWildcard = composedPath.match(/\*(?![A-Za-z_$])/);
  if (bareWildcard) {
    throw new Error(
      `${ctx} Path "${composedPath}" uses v4 pattern "*"; ` +
      `in path-to-regexp v8 use "*splat or {*splat}" instead.`
    );
  }
}
```

Add tests in `tests/adapter/router-build.test.ts` under a `describe('detectV4Pattern (D-05)')` block. For each must-throw case, assert the thrown message:
- Starts with `[FixtureCtl.actionM]`
- Contains `uses v4 pattern "..."` (the exact offending substring)
- Contains `in path-to-regexp v8 use "..."` (the suggestion)

For each must-not-throw case, assert `expect(() => detectV4Pattern(p, 'X', 'y')).not.toThrow()`.
  </action>
  <verify>
    <automated>cd /Users/niraj/Desktop/Projects/routing-controlles-express && pnpm test --run tests/adapter/router-build.test.ts -t "detectV4Pattern"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "export function detectV4Pattern" src/adapter/router-build.ts` returns one match
    - All 6 must-throw cases pass; all 8 must-not-throw cases pass
    - Error messages start with `[<Controller>.<method>]` and contain both `uses v4 pattern` and `in path-to-regexp v8 use`
    - Test for `'/posts/:id(\\d+)/posts/:postId(\\d+)'` confirms only the FIRST offender is reported
    - `pnpm exec tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>v4 footgun pre-flight produces actionable errors for all four patterns; valid v8 paths pass through.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: buildControllerRouter() — one express.Router() per controller (ROUTE-05)</name>
  <files>src/adapter/router-build.ts, src/adapter/index.ts, tests/adapter/router-build.test.ts</files>
  <read_first>
    - src/adapter/router-build.ts (composePath + detectV4Pattern from Tasks 1-2 already present)
    - src/adapter/index.ts (Plan 02-01 pre-seeded the file with `// 02-02 router-build exports` marker — insert under that marker only; do NOT touch other markers' sections)
    - src/types/resolved.ts (ControllerMetadata, ActionMetadata)
    - .planning/phases/02-runtime-express-adapter-happy-path/02-CONTEXT.md §decisions D-04, D-05
    - .planning/phases/02-runtime-express-adapter-happy-path/02-RESEARCH.md §"Pattern 1: Boot factoring"
  </read_first>
  <behavior>
    - Returns `{ router, mountPath }` where `router` is `express.Router()` and `mountPath` is `composePath(routePrefix, controllerMeta.basePath, '')` (the prefix where the router itself mounts).
    - For each action in `controllerMeta.actions`:
      1. Compute `composed = composePath(routePrefix, controllerMeta.basePath, action.path)`.
      2. Call `detectV4Pattern(composed, controllerMeta.target.name, String(action.method))` — throws on v4 patterns.
      3. Compute `routerLocalPath = composePath('', '', action.path)` — path relative to the router's own mount.
      4. Call `router[verb.toLowerCase()](routerLocalPath, handlerFactory(controllerMeta, action))` — Express verb dispatch.
    - Verb 'all' uses `router.all(...)`. Custom verbs from `@Method(verb, path)` follow the same `router[verb.toLowerCase()]` pattern; throw a clear error if `typeof router[verb] !== 'function'`.
    - The function does NOT mount the router on the app — the caller (boot.ts in Plan 02-06) does `app.use(mountPath, router)`.
  </behavior>
  <action>
Add to `src/adapter/router-build.ts`:

```ts
import { Router, type Router as RouterT, type RequestHandler } from 'express';
import type { ControllerMetadata, ActionMetadata } from '../types/resolved.js';

export type HandlerFactory = (
  controller: ControllerMetadata,
  action: ActionMetadata
) => RequestHandler;

export interface BuiltRouter {
  router: RouterT;
  mountPath: string;
}

/**
 * Build one express.Router() per controller (ROUTE-05). Validates every
 * composed route path with detectV4Pattern() before registering with the
 * router (ensures users see our v8-suggestion error, not p2re's terse one).
 *
 * Returns the router plus the mount path (routePrefix + basePath) so the caller
 * can do app.use(mountPath, router).
 *
 * @param controllerMeta Resolved metadata for one controller (from buildMetadata).
 * @param routePrefix Global route prefix from BootOptions; '' if none.
 * @param handlerFactory Caller-provided factory that produces the Express RequestHandler
 *                       for one action. Plan 02-06 wires this to validation+invoke+response.
 */
export function buildControllerRouter(
  controllerMeta: ControllerMetadata,
  routePrefix: string,
  handlerFactory: HandlerFactory
): BuiltRouter {
  const router: RouterT = Router();
  const controllerName = controllerMeta.target.name;

  for (const action of controllerMeta.actions) {
    const composed = composePath(routePrefix, controllerMeta.basePath, action.path);
    detectV4Pattern(composed, controllerName, String(action.method));

    const routerLocalPath = composePath('', '', action.path);
    const verb = action.verb.toLowerCase();

    const fn = (router as unknown as Record<string, unknown>)[verb];
    if (typeof fn !== 'function') {
      throw new Error(
        `[${controllerName}.${String(action.method)}] Unsupported HTTP verb "${action.verb}" — ` +
        `express.Router has no method "${verb}".`
      );
    }

    const handler = handlerFactory(controllerMeta, action);
    (fn as (path: string, h: RequestHandler) => void).call(router, routerLocalPath, handler);
  }

  const mountPath = composePath(routePrefix, controllerMeta.basePath, '');
  return { router, mountPath };
}
```

**Update `src/adapter/index.ts`:** insert export line(s) DIRECTLY UNDER the existing `// 02-02 router-build exports` comment marker. Do NOT touch the `// 02-01`, `// 02-03`, `// 02-04`, or `// 02-05` marker sections — Plan 02-01 pre-created those for parallel-safe Wave 2 inserts. Final shape of the 02-02 section:

```ts
// 02-02 router-build exports
export {
  composePath,
  detectV4Pattern,
  buildControllerRouter,
  type HandlerFactory,
  type BuiltRouter,
} from './router-build.js';
```

Tests in `tests/adapter/router-build.test.ts` add a `describe('buildControllerRouter (ROUTE-05)')` block. Use the fixtures from `tests/adapter/fixtures/controllers.ts` (Plan 02-01 created these) plus `buildMetadata`. Cover:

1. **Each verb on a built router**: build UsersController; assert `router.stack` has entries for GET /:id, POST /, GET /null, GET /undef.
2. **No-op handler factory**: pass `() => (_req, _res) => {}` as handlerFactory; assert no throw and `router.stack.length === 4` (UsersController has 4 actions).
3. **mountPath**: `buildControllerRouter(usersMeta, '/api', noop).mountPath === '/api/users'`.
4. **v4 pattern in any action throws**: register a fixture controller with `@Get('/:id?')`, call buildControllerRouter, assert it throws with `[FixtureCtl.method]` + `uses v4 pattern ":id?"`.
5. **Unsupported verb throws**: hand-craft an ActionMetadata with `verb: 'connect'` (not on Router); assert clear "Unsupported HTTP verb" error.
6. **Inheritance fixture (BaseController + DerivedController)**: build router for DerivedController; assert it has BOTH `/ping` (inherited) and `/own` (own) routes — confirms ROUTE-05 inheritance. (If Phase 1 MetadataBuilder already merges parent actions into the child controller's metadata, this works out of the box; if not, the failure tells us the test correctly catches it.)

To inspect router routes, use `router.stack` — each `Layer` has `route?.path` and `route?.methods`. Iterate to count and check.
  </action>
  <verify>
    <automated>cd /Users/niraj/Desktop/Projects/routing-controlles-express && pnpm test --run tests/adapter/router-build.test.ts && pnpm exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "export function buildControllerRouter" src/adapter/router-build.ts` returns one match
    - `grep -nE "import.*from 'express'" src/adapter/router-build.ts` returns one match (only Express import in this module)
    - `grep -n "// 02-02 router-build exports" src/adapter/index.ts` returns one match (marker preserved)
    - `grep -n "buildControllerRouter\|composePath\|detectV4Pattern" src/adapter/index.ts` returns >= 3 matches (exports inserted under the 02-02 marker)
    - `grep -n "// 02-03 validation exports\|// 02-04 response exports\|// 02-05 error-middleware" src/adapter/index.ts` returns 3 matches (other Wave 2 markers untouched)
    - All buildControllerRouter tests green; specifically the inheritance test confirms both inherited and own routes appear on the derived router
    - `pnpm exec tsc --noEmit` exits 0
    - All Express imports under `src/adapter/`: `grep -rlE "import.*from 'express'" src/ | grep -v "^src/adapter/" | wc -l` returns 0 (the global "Express imported only inside src/adapter/" gate that 02-07 enforces — this plan must not regress it)
  </acceptance_criteria>
  <done>One Router per controller, v4 patterns rejected pre-mount with actionable messages, inheritance honored, src/adapter/index.ts barrel updated under the 02-02 marker only.</done>
</task>

</tasks>

<verification>
- `pnpm test --run tests/adapter/router-build.test.ts` all green
- `pnpm exec tsc --noEmit` clean
- All four D-05 v4 footguns flagged
- All D-04 path composition cases pass
- Express imported only under src/adapter/ (regression gate)
- src/adapter/index.ts: 02-02 marker section populated; other Wave 2 markers untouched
</verification>

<success_criteria>
ROUTE-04 and ROUTE-05 (router construction half) are testable in isolation. Plan 02-06 will wire `buildControllerRouter` to a real handlerFactory that calls validation+invoke+response.
</success_criteria>

<output>
Create `.planning/phases/02-runtime-express-adapter-happy-path/02-02-SUMMARY.md`
</output>
