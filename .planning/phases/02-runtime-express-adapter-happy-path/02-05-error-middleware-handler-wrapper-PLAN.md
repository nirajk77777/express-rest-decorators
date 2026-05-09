---
phase: 02-runtime-express-adapter-happy-path
plan: 05
type: execute
wave: 2
depends_on: [02-01]
files_modified:
  - src/adapter/handler-wrapper.ts
  - src/adapter/error-middleware.ts
  - src/adapter/index.ts
  - tests/adapter/error-middleware.test.ts
  - tests/adapter/handler-wrapper.test.ts
autonomous: true
requirements: [ERR-03, ERR-05]
must_haves:
  truths:
    - "wrapAction returns an Express RequestHandler that awaits invokeAction; rejected promises forward via next(err) exactly once (D-16, traces SC #3, ERR-03)"
    - "wrapAction attaches err.source = 'ControllerClass.methodName' BEFORE next(err); preserves explicit err.source if already set (D-16, traces SC #3, ERR-05)"
    - "Library error middleware is the canonical 4-arg signature (err, req, res, next) — exactly one mounted (D-15, traces SC #3)"
    - "Error middleware checks res.headersSent first; if true, destroys response and does NOT attempt second write (D-14, traces SC #3, RESEARCH Pitfall B)"
    - "HttpError instances serialize via toJSON() with status from err.status (D-18)"
    - "Non-HttpError → generic 500 envelope { status, name:'InternalServerError', message:'Internal Server Error' }; never leaks err.message in production (D-18)"
    - "Dev mode (NODE_ENV !== 'production') adds stack and _devMessage; stripped in production (D-18)"
  artifacts:
    - path: src/adapter/handler-wrapper.ts
      provides: "wrapAction(controllerMeta, actionMeta, invokeAction) → RequestHandler"
      exports: [wrapAction, type InvokeAction]
    - path: src/adapter/error-middleware.ts
      provides: "libraryErrorMiddleware — single 4-arg Express error middleware"
      exports: [libraryErrorMiddleware]
  key_links:
    - from: src/adapter/handler-wrapper.ts
      to: express
      via: "type RequestHandler, NextFunction"
      pattern: "RequestHandler"
    - from: src/adapter/error-middleware.ts
      to: src/errors/http-error.ts
      via: "instanceof HttpError discrimination + toJSON()"
      pattern: "instanceof HttpError"
---

<objective>
Implement the two pieces that make Express v5 native async error propagation work safely:

1. **handler-wrapper.ts** — a thin async fn (D-16) that awaits the user's handler invocation and, on rejection, attaches `err.source = 'Controller.method'` before `next(err)`. Pure source-attribution; does NOT replace v5's native rejection forwarding.

2. **error-middleware.ts** — the single 4-arg Express error middleware (D-15) that converts errors to HTTP responses per D-18, with the `res.headersSent` guard (D-14) protecting against the streaming-error footgun (Pitfall B).

These two land together because the wrapper produces `err.source` and the middleware consumes it — testing them in isolation is awkward but doable; testing them as a pair via supertest is conclusive.

Purpose: ERR-03 + ERR-05 satisfied; the Phase 3 hook position for `@Middleware({ type: 'after' })` is preserved (lib middleware = last, so Phase 3 user middleware can mount ahead).

Output: Two new modules + integration tests proving exactly-once error propagation, source attribution, headersSent guard behavior, dev-vs-prod disclosure.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/02-runtime-express-adapter-happy-path/02-CONTEXT.md
@.planning/phases/02-runtime-express-adapter-happy-path/02-RESEARCH.md
@src/errors/http-error.ts
@src/errors/subclasses.ts
@src/types/resolved.ts

<interfaces>
Phase 1 surfaces:

```ts
// src/errors/http-error.ts
export class HttpError extends Error {
  readonly status: number;
  toJSON(): Record<string, unknown>;  // { name, message, status }
}

// src/errors/subclasses.ts
export class BadRequestError extends HttpError {
  readonly details?: ReadonlyArray<ValidationIssue>;
  readonly source?: string;
  override toJSON(): Record<string, unknown>;  // includes details + source when set
}
```

InvokeAction contract (this plan defines it; Plan 02-06 supplies the implementation):
```ts
type InvokeAction = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
// Returns the value the user's handler returned (so wrapper can hand off to writeResponse OR
// alternatively the implementation can write the response itself and return undefined).
// Plan 02-06 chooses the exact contract; this plan accepts it as a generic async fn.
```

Express:
- 4-arg middleware: `(err, req, res, next) => void`
- Mounted last via `app.use(libraryErrorMiddleware)`
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: wrapAction — D-16 source-attribution wrapper</name>
  <files>src/adapter/handler-wrapper.ts, src/adapter/index.ts, tests/adapter/handler-wrapper.test.ts</files>
  <read_first>
    - .planning/phases/02-runtime-express-adapter-happy-path/02-CONTEXT.md §decisions D-16, D-17 (boolean defaultErrorHandler)
    - .planning/phases/02-runtime-express-adapter-happy-path/02-RESEARCH.md §"Pattern 2" §"Pitfall A"
    - src/adapter/index.ts (Plan 02-01 pre-seeded the file with `// 02-05 error-middleware + handler-wrapper exports` marker — Task 1 and Task 2 BOTH insert under that single marker; do NOT touch other markers' sections)
    - src/types/resolved.ts (ControllerMetadata, ActionMetadata)
  </read_first>
  <behavior>
    wrapAction(controllerMeta, actionMeta, invokeAction):
    - Returns an async (req, res, next) => void
    - Computes source = `${controllerMeta.target.name}.${String(actionMeta.method)}` once at wrap time
    - Inside: try { await invokeAction(req, res, next); } catch (err) { … next(err); }
    - In catch:
        - If err is null/undefined: convert to a new Error('Non-error thrown') (defensive; very rare)
        - If err is an object and lacks 'source' own property → assign source via Object.defineProperty (writable + enumerable + configurable) so it appears in toJSON via spread for plain Errors. For HttpError subclasses, the existing source field already exists optionally; setting it via `(err as any).source = source` is fine when not present.
        - Concretely: `if (err && typeof err === 'object' && !('source' in err)) (err as any).source = source;`
        - call next(err)
    - Does NOT call next() in the success path — invokeAction is responsible for sending the response (Plan 02-06 wires that).
    - Does NOT add a second try/catch layer or .catch() chain (Pitfall A).

    Edge cases:
    - Sync throw inside an async function is caught by the same try/catch (becomes a rejected promise).
    - Explicit `err.source` set by user code (e.g., they threw a BadRequestError with source already populated) is preserved.
  </behavior>
  <action>
Create `src/adapter/handler-wrapper.ts`:

```ts
import type { RequestHandler, Request, Response, NextFunction } from 'express';
import type { ControllerMetadata, ActionMetadata } from '../types/resolved.js';

export type InvokeAction = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/**
 * Per D-16, this wrapper exists ONLY to attach err.source before forwarding.
 * Express v5 already auto-forwards async rejections [CITED: expressjs error-handling guide];
 * this wrapper is the single source-attribution point. NO additional try/catch
 * elsewhere in the pipeline (RESEARCH Pitfall A).
 */
export function wrapAction(
  controllerMeta: ControllerMetadata,
  actionMeta: ActionMetadata,
  invokeAction: InvokeAction
): RequestHandler {
  const source = `${controllerMeta.target.name}.${String(actionMeta.method)}`;
  return async (req, res, next) => {
    try {
      await invokeAction(req, res, next);
    } catch (rawErr) {
      const err = (rawErr === null || rawErr === undefined)
        ? new Error('Non-error value thrown from handler')
        : rawErr;
      if (err && typeof err === 'object' && !('source' in err)) {
        (err as { source?: string }).source = source;
      }
      next(err);
    }
  };
}
```

**Update `src/adapter/index.ts`:** insert export line DIRECTLY UNDER the existing `// 02-05 error-middleware + handler-wrapper exports` comment marker (Plan 02-01 pre-created this for parallel-safe Wave 2 inserts). Task 2 will append the `libraryErrorMiddleware` export under the same marker. Do NOT touch the `// 02-01`, `// 02-02`, `// 02-03`, or `// 02-04` marker sections. After Task 1 the 02-05 section reads:

```ts
// 02-05 error-middleware + handler-wrapper exports
export { wrapAction, type InvokeAction } from './handler-wrapper.js';
```

Tests in `tests/adapter/handler-wrapper.test.ts`:

1. **Async throw → next(err) once with source attached**: invokeAction = `async () => { throw new Error('boom'); }`. Use a vitest mock for next. Assert next called once with an Error whose `.source === 'Ctl.m'`.
2. **Sync throw inside async fn → caught**: invokeAction = `async () => { throw new TypeError('sync'); }` — same outcome; next called once.
3. **Successful handler → next NOT called**: invokeAction = `async () => {}`. Assert next NOT called.
4. **Explicit err.source preserved (user threw HttpError with source)**: invokeAction throws `new BadRequestError('bad', { source: 'CustomSrc' })`. Assert `next.mock.calls[0][0].source === 'CustomSrc'` (not overwritten).
5. **Non-error rejection coerced**: invokeAction returns `Promise.reject(null)`. Assert next called with an Error instance whose source is set.
6. **Source format**: ensure source string is exactly `'Ctl.m'` for `class Ctl { m(){} }` and method name `'m'`. Use a class with name 'UsersController' and method `'update'` → source `'UsersController.update'`.
7. **Symbol-method support**: build ActionMetadata with `method: Symbol('s')`. Source string contains `'Symbol(s)'` (whatever String(Symbol('s')) returns). Assert no crash and source is non-empty.
8. **No double-fire**: invokeAction throws; assert next called EXACTLY once (Pitfall A regression).
  </action>
  <verify>
    <automated>cd /Users/niraj/Desktop/Projects/routing-controlles-express && pnpm test --run tests/adapter/handler-wrapper.test.ts && pnpm exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "export function wrapAction" src/adapter/handler-wrapper.ts` returns one match
    - `grep -nE "try\\s*\\{|catch\\s*\\(" src/adapter/handler-wrapper.ts | wc -l` shows exactly ONE try/catch block
    - All 8 tests pass
    - Test 4 (explicit source preserved) green — proves D-16 "we only set if missing"
    - Test 8 (no double-fire) confirms next called exactly once
    - `grep -n "wrapAction" src/adapter/index.ts` returns >= 1 match (export inserted under the 02-05 marker)
    - `grep -n "// 02-05 error-middleware + handler-wrapper exports" src/adapter/index.ts` returns one match (marker preserved)
  </acceptance_criteria>
  <done>Source-attribution wrapper isolated and proven; ready for boot.ts to consume.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: libraryErrorMiddleware — D-14, D-15, D-17, D-18</name>
  <files>src/adapter/error-middleware.ts, src/adapter/index.ts, tests/adapter/error-middleware.test.ts</files>
  <read_first>
    - src/adapter/handler-wrapper.ts (Task 1, for integration testing)
    - src/errors/http-error.ts + src/errors/subclasses.ts (HttpError, BadRequestError, toJSON contract)
    - .planning/phases/02-runtime-express-adapter-happy-path/02-CONTEXT.md §decisions D-14, D-15, D-17, D-18
    - .planning/phases/02-runtime-express-adapter-happy-path/02-RESEARCH.md §"Pattern 5" §"Pitfall B"
  </read_first>
  <behavior>
    libraryErrorMiddleware(err, req, res, next): exact 4-arg signature.

    Step 1 — headersSent guard (D-14, Pitfall B):
      if (res.headersSent) { console.error(...); res.destroy(...); return; }
      Do NOT attempt res.json/status when headers are sent — that throws ERR_HTTP_HEADERS_SENT.

    Step 2 — HttpError branch (D-18):
      if (err instanceof HttpError):
        res.status(err.status)
        body = err.toJSON()  // already includes name, message, status; BadRequestError adds details, source
        if NODE_ENV !== 'production' AND err.stack: body.stack = err.stack
        res.json(body)
        return

    Step 3 — Non-HttpError (D-18):
      res.status(500)
      body = { status: 500, name: 'InternalServerError', message: 'Internal Server Error' }
      if err && err.source: body.source = err.source
      if NODE_ENV !== 'production':
        if err instanceof Error: body.stack = err.stack; body._devMessage = err.message
      res.json(body)

    Step 4 — never call next(err) onward in normal paths (this IS the last handler in Phase 2).
      Exception: when headers are sent (Step 1), we do NOT call next either — just destroy and return.
  </behavior>
  <action>
Create `src/adapter/error-middleware.ts`:

```ts
import type { Request, Response, NextFunction } from 'express';
import { HttpError } from '../errors/http-error.js';

/**
 * The single library-installed Express error middleware (D-15). Mounted automatically
 * by useExpressControllers AFTER all controller routers when defaultErrorHandler !== false.
 *
 * Phase 3 will mount user @Middleware({ type: 'after' }) error handlers AHEAD of this one
 * (ERR-04). This middleware is therefore the *fallback* / *last-line* handler.
 *
 * D-14 — checks res.headersSent first; if true, destroys the socket and does NOT
 * attempt a second body write (avoids ERR_HTTP_HEADERS_SENT, RESEARCH Pitfall B).
 * D-18 — HttpError → toJSON; non-HttpError → generic 500 envelope; dev disclosure
 * adds stack + _devMessage when NODE_ENV !== 'production'.
 */
export function libraryErrorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // D-14 / Pitfall B
  if (res.headersSent) {
    // eslint-disable-next-line no-console
    console.error('[express-controllers] error after headers sent:', err);
    res.destroy(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  const isProd = process.env.NODE_ENV === 'production';

  // D-18 — HttpError branch
  if (err instanceof HttpError) {
    const body = err.toJSON();
    if (!isProd && err.stack) {
      (body as Record<string, unknown>).stack = err.stack;
    }
    res.status(err.status).json(body);
    return;
  }

  // D-18 — non-HttpError branch (no message leak)
  const source = (err && typeof err === 'object' && 'source' in err)
    ? (err as { source?: unknown }).source
    : undefined;

  const body: Record<string, unknown> = {
    status: 500,
    name: 'InternalServerError',
    message: 'Internal Server Error',
  };
  if (typeof source === 'string') body.source = source;

  if (!isProd) {
    if (err instanceof Error) {
      body.stack = err.stack;
      body._devMessage = err.message;
    }
  }

  res.status(500).json(body);
}
```

**Update `src/adapter/index.ts`:** APPEND this export line directly under the same `// 02-05 error-middleware + handler-wrapper exports` comment marker (Task 1 already inserted `wrapAction` there). Do NOT touch other markers' sections. After Task 2 the 02-05 section reads:

```ts
// 02-05 error-middleware + handler-wrapper exports
export { wrapAction, type InvokeAction } from './handler-wrapper.js';
export { libraryErrorMiddleware } from './error-middleware.js';
```

Tests in `tests/adapter/error-middleware.test.ts`. Use express+supertest+wrapAction together (proves the integration end-to-end):

```ts
import express from 'express';
import request from 'supertest';
import { libraryErrorMiddleware } from '../../src/adapter/error-middleware.js';
import { wrapAction } from '../../src/adapter/handler-wrapper.js';
import { BadRequestError, NotFoundError } from '../../src/index.js';

function makeApp(invoke: (req:any,res:any,next:any)=>Promise<unknown>) {
  const app = express();
  const ctlMeta = { type: 'json' as const, basePath:'', target: class Ctl{}, responseHandlers:[], actions:[] };
  const actMeta = { target: class Ctl{}, method:'m', verb:'get', path:'/', responseHandlers:[] };
  app.get('/', wrapAction(ctlMeta, actMeta, invoke));
  app.use(libraryErrorMiddleware);
  return app;
}
```

Cases (use `process.env.NODE_ENV` toggling between 'test' (dev-default) and 'production'):

1. **HttpError → 4xx with toJSON shape**: invoke throws `new NotFoundError('user 7')`. → status 404, body `{ name:'NotFoundError', message:'user 7', status:404 }` (plus source from wrapper, plus stack in dev).
2. **BadRequestError details preserved**: invoke throws `new BadRequestError('bad', { details: [{ slot:'body', path:'x', message:'y' }] })`. → status 400, body has details array of length 1.
3. **Source from wrapper visible**: invoke throws `new Error('boom')`. → status 500, body.source === 'Ctl.m' (set by wrapAction).
4. **Generic 500 hides err.message in production**: set `process.env.NODE_ENV = 'production'`, invoke throws `new Error('SECRET DETAIL')`. → body.message === 'Internal Server Error', body has NO _devMessage, NO stack. Restore env after test.
5. **Dev mode adds stack and _devMessage**: NODE_ENV='test' (or any non-production), invoke throws `new Error('detail')`. → body.stack truthy, body._devMessage === 'detail'.
6. **HttpError stack present in dev**: invoke throws `new BadRequestError('x')`. → body.stack truthy. Set NODE_ENV='production' → body.stack absent.
7. **headersSent guard (Pitfall B)**: invoke does `res.write('partial'); throw new Error('after-headers');`. Manually flushHeaders(). Assert: middleware does NOT throw ERR_HTTP_HEADERS_SENT, response truncated/destroyed cleanly. Test asserts `request(app).get('/').expect(...)` resolves with an aborted/truncated response (supertest may surface 'socket hang up' or partial body). The key acceptance: no second JSON write attempted, no test-runner crash.
8. **Single error middleware contract**: build app with the middleware; throw inside handler; spy on `console.error` during a non-prod headersSent case → called exactly once.
9. **No double-fire**: throw once in handler; intercept `res.json` via spy → called exactly once across the whole request.

Important: For Test 4 (production), use `vi.stubEnv('NODE_ENV', 'production')` and restore in afterEach.
  </action>
  <verify>
    <automated>cd /Users/niraj/Desktop/Projects/routing-controlles-express && pnpm test --run tests/adapter/error-middleware.test.ts && pnpm exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "export function libraryErrorMiddleware" src/adapter/error-middleware.ts` returns one match
    - `grep -n "headersSent" src/adapter/error-middleware.ts` returns >= 1 match (D-14)
    - `grep -nE "instanceof HttpError" src/adapter/error-middleware.ts` returns one match (D-18 discrimination)
    - `grep -nE "process\\.env\\.NODE_ENV" src/adapter/error-middleware.ts` returns >= 1 match (D-18 dev gate)
    - All 9 test cases above pass
    - Test 4 (production) confirms `body.message === 'Internal Server Error'` AND no stack/devMessage
    - Test 5 (dev) confirms stack + _devMessage present
    - Test 9 (no double-fire) confirms res.json called exactly once per error response
    - `grep -n "libraryErrorMiddleware" src/adapter/index.ts` returns one match (export inserted under the 02-05 marker)
    - `grep -n "// 02-05 error-middleware + handler-wrapper exports" src/adapter/index.ts` returns one match (single marker hosts both 02-05 exports)
    - `grep -n "// 02-02 router-build exports\|// 02-03 validation exports\|// 02-04 response exports" src/adapter/index.ts` returns 3 matches (other Wave 2 markers untouched)
  </acceptance_criteria>
  <done>ERR-03, ERR-05 satisfied; D-14/D-15/D-17/D-18 each have a regression test; safe under streaming-error footgun.</done>
</task>

</tasks>

<verification>
- `pnpm test --run tests/adapter/handler-wrapper.test.ts tests/adapter/error-middleware.test.ts` all green
- `pnpm exec tsc --noEmit` clean
- ERR-03 (single middleware, native v5 propagation) and ERR-05 (err.source attribution) covered
- Pitfalls A (no double-fire) and B (headersSent guard) each have a regression test
</verification>

<success_criteria>
Wrapper + middleware land as a tested pair. Plan 02-06 wires them via `useExpressControllers`. Phase 3's `@Middleware({ type:'after' })` will mount AHEAD of `libraryErrorMiddleware` without restructuring this code.
</success_criteria>

<output>
Create `.planning/phases/02-runtime-express-adapter-happy-path/02-05-SUMMARY.md`
</output>
