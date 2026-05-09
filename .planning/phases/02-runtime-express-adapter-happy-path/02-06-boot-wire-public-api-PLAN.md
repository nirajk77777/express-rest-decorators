---
phase: 02-runtime-express-adapter-happy-path
plan: 06
type: execute
wave: 3
depends_on: [02-01, 02-02, 02-03, 02-04, 02-05]
files_modified:
  - src/adapter/boot.ts
  - src/adapter/index.ts
  - src/index.ts
  - tests/adapter/boot.test.ts
autonomous: true
requirements: [API-01, API-02, API-03, BUILD-03, ROUTE-05, INPUT-01, ERR-03]
must_haves:
  truths:
    - "useExpressControllers(app, options) accepts an existing Express v5 app and returns it after mounting controllers (traces SC #1, API-01)"
    - "createExpressServer(options) creates a fresh Express app, mounts express.json() + express.urlencoded({extended:true}), then delegates to useExpressControllers (D-01, D-02, traces SC #1, API-02)"
    - "useExpressControllers does NOT mount any body-parser; consumers configure it themselves (D-02)"
    - "Mounting order: for each controller in options.controllers, app.use(mountPath, builtRouter); THEN app.use(libraryErrorMiddleware) when defaultErrorHandler !== false (D-15)"
    - "Controller instances obtained via getContainer().get(ControllerClass) — supports user-provided IocAdapter (Phase 1 hook)"
    - "Per-action handler factory: invokeAction = async (req, res, next) => { args = await resolveInputs(req, action.input); const instance = await getContainer().get(controllerMeta.target); const result = await instance[action.method]({...args, req, res, next}); writeResponse(res, next, result, controllerMeta, action); }"
    - "Public barrel src/index.ts adds named exports: useExpressControllers, createExpressServer, BootOptions, AuthorizationChecker, CurrentUserChecker (traces SC #1)"
    - "Each call to useExpressControllers is self-contained; no global Express middleware/listeners outside the passed app (CONTEXT.md established patterns)"
  artifacts:
    - path: src/adapter/boot.ts
      provides: "useExpressControllers, createExpressServer, makeHandlerFactory"
      exports: [useExpressControllers, createExpressServer]
    - path: src/index.ts
      provides: "Public re-exports of useExpressControllers, createExpressServer, BootOptions"
  key_links:
    - from: src/adapter/boot.ts
      to: src/adapter/router-build.ts
      via: "buildControllerRouter(meta, routePrefix, handlerFactory)"
      pattern: "buildControllerRouter"
    - from: src/adapter/boot.ts
      to: src/adapter/validation.ts
      via: "resolveInputs(req, action.input)"
      pattern: "resolveInputs"
    - from: src/adapter/boot.ts
      to: src/adapter/response.ts
      via: "writeResponse(res, next, result, controllerMeta, action)"
      pattern: "writeResponse"
    - from: src/adapter/boot.ts
      to: src/adapter/handler-wrapper.ts
      via: "wrapAction(controllerMeta, action, invokeAction)"
      pattern: "wrapAction"
    - from: src/adapter/boot.ts
      to: src/adapter/error-middleware.ts
      via: "app.use(libraryErrorMiddleware) when defaultErrorHandler !== false"
      pattern: "libraryErrorMiddleware"
    - from: src/adapter/boot.ts
      to: src/container/use-container.ts
      via: "getContainer().get(ControllerClass)"
      pattern: "getContainer"
    - from: src/index.ts
      to: src/adapter/boot.ts
      via: "public re-exports"
      pattern: "useExpressControllers"
---

<objective>
Wire all Wave 2 modules together via the public boot API:

1. `useExpressControllers(app, options)` — registers controllers on an existing Express app.
2. `createExpressServer(options)` — same, plus mounts body-parsers (D-02) on a fresh app.
3. The handler factory that buildControllerRouter calls — composes resolveInputs + container.get + invoke + writeResponse, wrapped with wrapAction (D-16).
4. Public barrel update — first time the library exports HTTP-runtime symbols.

Plan 02-07 then runs end-to-end SC verification against this boot API.

Purpose: End-to-end vertical slice live; users can boot a real Express v5 app from this library.

Output: `src/adapter/boot.ts` + updated public barrel + integration tests covering API-01/02/03 and the full vertical slice (Zod body → handler → JSON response, BadRequestError flow, async error → middleware path).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/02-runtime-express-adapter-happy-path/02-CONTEXT.md
@.planning/phases/02-runtime-express-adapter-happy-path/02-RESEARCH.md
@src/adapter/boot-options.ts
@src/adapter/router-build.ts
@src/adapter/validation.ts
@src/adapter/response.ts
@src/adapter/handler-wrapper.ts
@src/adapter/error-middleware.ts
@src/metadata/builder.ts
@src/container/use-container.ts
@src/index.ts

<interfaces>
Wave 2 modules (all already shipped via Plans 02-01..02-05):

```ts
// src/adapter/boot-options.ts
export interface BootOptions { controllers, routePrefix?, defaultErrorHandler?, ... }

// src/adapter/router-build.ts
export function buildControllerRouter(meta, routePrefix, handlerFactory): { router, mountPath };
export type HandlerFactory = (controller, action) => RequestHandler;

// src/adapter/validation.ts
export async function resolveInputs(req, input?): Promise<ResolvedArgs>;

// src/adapter/response.ts
export function writeResponse(res, next, value, controllerMeta, actionMeta): void;

// src/adapter/handler-wrapper.ts
export function wrapAction(controllerMeta, actionMeta, invokeAction): RequestHandler;

// src/adapter/error-middleware.ts
export function libraryErrorMiddleware(err, req, res, next): void;

// Phase 1
import { buildMetadata } from './metadata/builder.js';
import { getContainer } from './container/use-container.js';
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Implement makeHandlerFactory + useExpressControllers + createExpressServer</name>
  <files>src/adapter/boot.ts, src/adapter/index.ts</files>
  <read_first>
    - src/adapter/boot-options.ts (BootOptions interface — Plan 02-01)
    - src/adapter/router-build.ts (buildControllerRouter signature — Plan 02-02)
    - src/adapter/validation.ts (resolveInputs signature — Plan 02-03)
    - src/adapter/response.ts (writeResponse signature — Plan 02-04)
    - src/adapter/handler-wrapper.ts + error-middleware.ts (Plan 02-05)
    - src/metadata/builder.ts (buildMetadata signature)
    - src/container/use-container.ts (getContainer signature)
    - .planning/phases/02-runtime-express-adapter-happy-path/02-CONTEXT.md §decisions D-01, D-02, D-15, D-16
    - .planning/phases/02-runtime-express-adapter-happy-path/02-RESEARCH.md §"Pattern 1: Boot factoring"
  </read_first>
  <action>
Create `src/adapter/boot.ts`:

```ts
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { buildMetadata } from '../metadata/builder.js';
import { getContainer } from '../container/use-container.js';
import type { ControllerMetadata, ActionMetadata } from '../types/resolved.js';
import type { BootOptions } from './boot-options.js';
import { buildControllerRouter, type HandlerFactory } from './router-build.js';
import { resolveInputs } from './validation.js';
import { writeResponse } from './response.js';
import { wrapAction } from './handler-wrapper.js';
import { libraryErrorMiddleware } from './error-middleware.js';

/**
 * Build the per-action Express RequestHandler. Composes:
 *   1. resolveInputs(req, action.input)              — D-06/D-07/D-10
 *   2. getContainer().get(controllerMeta.target)     — Phase 1 IocAdapter hook
 *   3. instance[action.method]({...args, req, res, next})  — INPUT-01 destructured shape
 *   4. writeResponse(res, next, result, ...)         — D-11/D-12/D-13
 * Wrapped by wrapAction() for source-attribution + native v5 forwarding (D-16).
 */
function makeHandlerFactory(): HandlerFactory {
  return (controllerMeta: ControllerMetadata, action: ActionMetadata) => {
    const invokeAction = async (req: Request, res: Response, next: NextFunction) => {
      const args = await resolveInputs(req, action.input);
      const instance = await getContainer().get(controllerMeta.target as never);
      const handlerArgs = { ...args, req, res, next };
      const result = await (instance as Record<string | symbol, (a: unknown) => unknown>)[action.method](handlerArgs);
      writeResponse(res, next, result, controllerMeta, action);
    };
    return wrapAction(controllerMeta, action, invokeAction);
  };
}

/**
 * Mount controllers on an existing Express v5 app. Body parsing is the caller's
 * responsibility — this function does NOT install express.json() (D-02 asymmetry).
 *
 * Mounting order:
 *   1. one express.Router() per controller, app.use(mountPath, router)
 *   2. libraryErrorMiddleware (skipped if options.defaultErrorHandler === false)
 *
 * Phase 3 may insert user middleware (@Middleware({type:'after'})) AHEAD of
 * libraryErrorMiddleware in a future change; mounting position chosen for that.
 *
 * @returns the same `app`, for chaining.
 */
export function useExpressControllers(app: Express, options: BootOptions): Express {
  const controllers = buildMetadata(options.controllers);
  const routePrefix = options.routePrefix ?? '';
  const factory = makeHandlerFactory();

  for (const controllerMeta of controllers) {
    const { router, mountPath } = buildControllerRouter(controllerMeta, routePrefix, factory);
    app.use(mountPath, router);
  }

  if (options.defaultErrorHandler !== false) {
    app.use(libraryErrorMiddleware);
  }

  return app;
}

/**
 * Create a fresh Express v5 app, install body-parsers (express.json() and
 * express.urlencoded({extended:true}) per D-02), then mount controllers.
 * Convenience entry point — equivalent to:
 *
 *   const app = express();
 *   app.use(express.json());
 *   app.use(express.urlencoded({ extended: true }));
 *   useExpressControllers(app, options);
 */
export function createExpressServer(options: BootOptions): Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  return useExpressControllers(app, options);
}
```

Update `src/adapter/index.ts`:
```ts
export type { BootOptions, AuthorizationChecker, CurrentUserChecker } from './boot-options.js';
export {
  composePath,
  detectV4Pattern,
  buildControllerRouter,
  type HandlerFactory,
  type BuiltRouter,
} from './router-build.js';
export {
  isStandardSchema,
  renderPath,
  resolveInputs,
  type ResolvedArgs,
} from './validation.js';
export { applyResponseHandlers, writeResponse } from './response.js';
export { wrapAction, type InvokeAction } from './handler-wrapper.js';
export { libraryErrorMiddleware } from './error-middleware.js';
export { useExpressControllers, createExpressServer } from './boot.js';
```
  </action>
  <verify>
    <automated>cd /Users/niraj/Desktop/Projects/routing-controlles-express && pnpm exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "export function useExpressControllers" src/adapter/boot.ts` returns one match
    - `grep -n "export function createExpressServer" src/adapter/boot.ts` returns one match
    - `grep -nE "express\\.json\\(\\)|express\\.urlencoded" src/adapter/boot.ts` returns >= 2 matches (both body-parsers in createExpressServer)
    - `grep -c "express.json\|express.urlencoded" src/adapter/boot.ts` shows body-parsers ONLY referenced inside createExpressServer (search via line-range — confirm not in useExpressControllers function body)
    - `grep -n "buildMetadata\|getContainer\|buildControllerRouter\|resolveInputs\|writeResponse\|wrapAction\|libraryErrorMiddleware" src/adapter/boot.ts` returns >= 7 matches (all Wave 2 modules wired)
    - `grep -n "defaultErrorHandler !== false" src/adapter/boot.ts` returns one match (D-17)
    - `pnpm exec tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>boot.ts wires all Wave 2 modules; tsc clean.</done>
</task>

<task type="auto">
  <name>Task 2: Public barrel — add useExpressControllers, createExpressServer, BootOptions to src/index.ts</name>
  <files>src/index.ts</files>
  <read_first>
    - src/index.ts (current public exports)
    - .planning/phases/02-runtime-express-adapter-happy-path/02-CONTEXT.md §canonical_refs (Phase 1 outputs preserved)
  </read_first>
  <action>
Append to `src/index.ts`:

```ts
// Phase 2 — Express adapter (boot APIs)
export { useExpressControllers, createExpressServer } from './adapter/boot.js';

// Phase 2 — public boot options type
export type {
  BootOptions,
  AuthorizationChecker,
  CurrentUserChecker,
} from './adapter/boot-options.js';
```

Do NOT add internal adapter helpers (buildControllerRouter, resolveInputs, writeResponse, wrapAction, libraryErrorMiddleware, etc.) to the public barrel — those remain module-private per CONTEXT.md "Module-private internals" pattern. Only the three public API surfaces ship.

Do NOT remove or reorder existing Phase 1 exports.
  </action>
  <verify>
    <automated>cd /Users/niraj/Desktop/Projects/routing-controlles-express && pnpm exec tsc --noEmit && node -e "const m = require('./src/index.ts'); console.log('skip — TS source')" 2>/dev/null; grep -nE "^export (\\{|type)" src/index.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "useExpressControllers" src/index.ts` returns one match (the new export)
    - `grep -n "createExpressServer" src/index.ts` returns one match
    - `grep -n "BootOptions" src/index.ts` returns one match
    - `grep -n "buildControllerRouter\|resolveInputs\|writeResponse\|wrapAction\|libraryErrorMiddleware" src/index.ts` returns ZERO matches (internals stay private)
    - All Phase 1 exports still present: `grep -cE "Controller\|JsonController\|HttpError\|useContainer\|buildMetadata\|StandardSchemaV1" src/index.ts` >= 6
    - `pnpm exec tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Public barrel has the three new Phase 2 surfaces and nothing else from src/adapter/.</done>
</task>

<task type="auto">
  <name>Task 3: Boot integration tests — API-01, API-02, API-03, full vertical slice</name>
  <files>tests/adapter/boot.test.ts</files>
  <read_first>
    - src/adapter/boot.ts (Tasks 1-2)
    - src/index.ts (public surface)
    - tests/adapter/fixtures/controllers.ts + schemas.ts (Plan 02-01)
    - .planning/phases/02-runtime-express-adapter-happy-path/02-CONTEXT.md §decisions D-01, D-02, D-03, D-15
  </read_first>
  <action>
Create `tests/adapter/boot.test.ts`. Use supertest + the public barrel:

```ts
import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { useExpressControllers, createExpressServer, resetContainer } from '../../src/index.js';
import { UsersController, TextController, BaseController, DerivedController } from './fixtures/controllers.js';

beforeEach(() => resetContainer());
```

Cases:

1. **API-02 — createExpressServer returns ready app with body-parsers (D-02)**:
   - app = createExpressServer({ controllers: [UsersController] })
   - request(app).post('/users').send({ email:'a@b.co', name:'Niraj' }).expect(200) → body has created:true, email:'a@b.co'
   - Confirms body-parser auto-mounted (POST JSON works without manual express.json()).

2. **API-01 — useExpressControllers requires caller-mounted body-parser**:
   - app = express(); app.use(express.json()); useExpressControllers(app, { controllers: [UsersController] });
   - Same POST → 200.
   - Variant without express.json() pre-mount → POST body undefined → resolveInputs sees undefined body → if a body schema is required, BadRequestError → 400. (Confirms D-02 asymmetry.)

3. **API-01 returns the same app**: const app = express(); const ret = useExpressControllers(app, { controllers: [] }); expect(ret).toBe(app).

4. **API-03 — every BootOptions key accepted at runtime without warning/throw**:
   - createExpressServer({ controllers:[UsersController], routePrefix:'/api', defaultErrorHandler:true, middlewares:[], interceptors:[], cors:true, validation: undefined, authorizationChecker:()=>true, currentUserChecker:()=>null, printRoutes:true })
   - request(app).get('/api/users/7').expect(200) → confirms routePrefix applied.
   - No console.error/warn was triggered (spy on both).

5. **routePrefix composition (D-04)**: createExpressServer({ controllers:[UsersController], routePrefix:'/api/v1' }) → GET /api/v1/users/3 → 200 body has id:3.

6. **Multiple controllers (ROUTE-05)**: createExpressServer({ controllers:[UsersController, TextController] }) → GET /users/9 returns JSON; GET /text/hello returns 'hello world' as text.

7. **Controller inheritance (ROUTE-05)**: createExpressServer({ controllers:[DerivedController] }) → BOTH /derived/ping (inherited from BaseController) and /derived/own (own) work. (If Phase 1's MetadataBuilder doesn't merge parent actions into the child controller's own basePath, this test catches that — and the planner has already flagged this in Plan 02-02 Task 3 acceptance.)

8. **defaultErrorHandler:false skips lib middleware (D-17)**:
   - createExpressServer({ controllers:[errorThrowingController], defaultErrorHandler:false })
   - GET endpoint that throws Error → response is whatever Express's default handler does (HTML error page or 500). Specifically: response is NOT the JSON envelope { name:'InternalServerError' } produced by libraryErrorMiddleware.

9. **Vertical slice — async throw → libraryErrorMiddleware (ERR-03 + SC #3)**:
   - Fixture controller method: `@Get('/boom') async boom() { throw new Error('fail-async'); }`
   - GET /boom → 500, body.name === 'InternalServerError', body.source ends with '.boom', body.message === 'Internal Server Error' (in non-prod the _devMessage === 'fail-async' too).

10. **Vertical slice — Zod validation failure → 400 with details (INPUT-03)**:
    - POST /users with body `{ email: 'not-email', name: '' }` → 400, body.name === 'BadRequestError', body.details has 2 entries with slot:'body', paths 'email' and 'name'.

11. **Vertical slice — null return + @OnNull(404) → 404 empty body**:
    - GET /users/null → status 404, body length 0 (assert via `.expect(404)` and check `res.text === ''` or `res.body` is empty).

12. **Public exports surface**: `import { useExpressControllers, createExpressServer, BootOptions, HttpError, BadRequestError, Controller, JsonController, Get, Post, useContainer, buildMetadata, StandardSchemaV1 } from '../../src/index.js'` — all resolve at typecheck (this is implicit if the test file compiles).
  </action>
  <verify>
    <automated>cd /Users/niraj/Desktop/Projects/routing-controlles-express && pnpm test --run tests/adapter/boot.test.ts && pnpm exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `tests/adapter/boot.test.ts` exists with at least 12 test cases
    - All 12 cases pass under `pnpm test --run tests/adapter/boot.test.ts`
    - Test 4 (every BootOptions key) confirms zero console warnings/errors
    - Test 7 (inheritance) confirms BOTH parent and own routes available on derived controller
    - Test 9 (async throw) confirms `body.source` ends with `.boom` (proves wrapAction integration end-to-end)
    - Test 10 (Zod validation) confirms `body.details` array length === 2 (proves resolveInputs + BadRequestError + libraryErrorMiddleware integration)
    - Test 11 (@OnNull(404)) confirms status 404 with empty body
    - `pnpm exec tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Boot APIs proven; vertical slice from HTTP request → resolveInputs → handler → writeResponse → libraryErrorMiddleware works end-to-end with Zod.</done>
</task>

</tasks>

<verification>
- `pnpm test --run tests/adapter/` ALL adapter tests green (Plans 02-01..02-06 combined)
- `pnpm exec tsc --noEmit` clean
- Public barrel exports the three new Phase 2 surfaces
- Vertical slice covers Zod validation, async error propagation, response writing, OnNull
</verification>

<success_criteria>
End-to-end Phase 2 vertical slice runs. SC #1 (boot APIs) and large parts of SC #2/#3/#4/#5 are testable; Plan 02-07 finalizes goal-backward verification.
</success_criteria>

<output>
Create `.planning/phases/02-runtime-express-adapter-happy-path/02-06-SUMMARY.md`
</output>
