---
phase: 04-uploads-cookies-sessions-render-request-context
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/adapter/request-context.ts
  - src/adapter/boot.ts
  - src/index.ts
  - test/request-context.test.ts
autonomous: true
requirements: [NEW-01, NEW-02]

must_haves:
  truths:
    - "Calling getRequestContext() inside a handler returns { req, res, requestId } populated."
    - "requestId is the X-Request-Id header verbatim when present and non-empty; otherwise crypto.randomUUID()."
    - "ALS context survives an `await` inside a handler, middleware, or downstream service call."
    - "getRequestContext() throws an actionable error when called outside an active request scope."
    - "ALS wrapper is mounted as the FIRST app.use() inside useExpressControllers — before CORS, before lib globals, before routers."
    - "requestId lives ONLY in the ALS store — not on req."
  artifacts:
    - path: "src/adapter/request-context.ts"
      provides: "AsyncLocalStorage singleton + createAlsMiddleware + getRequestContext"
      exports: ["createAlsMiddleware", "getRequestContext", "RequestContext"]
    - path: "test/request-context.test.ts"
      provides: "ALS smoke tests including cross-await propagation"
  key_links:
    - from: "src/adapter/boot.ts"
      to: "src/adapter/request-context.ts"
      via: "app.use(createAlsMiddleware()) as FIRST app.use call"
      pattern: "app\\.use\\(createAlsMiddleware\\(\\)\\)"
    - from: "src/index.ts"
      to: "src/adapter/request-context.ts"
      via: "public re-export of getRequestContext"
      pattern: "export .* getRequestContext"
---

<objective>
Establish the AsyncLocalStorage-backed request context as the OUTERMOST library middleware. Provides `getRequestContext()` accessible from any code reachable from a request handler — middleware, interceptors, downstream services, async continuations.

Purpose: Foundation for Phase 4. All other Wave-2 plans assume the ALS wrapper is mounted first; the cross-await guarantee is what makes `getRequestContext()` usable from arbitrary depth.
Output: A new `src/adapter/request-context.ts` module, integration into `boot.ts` (D-11 / D-18 outermost slot), public export from `src/index.ts`, and a smoke-test file that verifies cross-await propagation per ROADMAP SC #5.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/04-uploads-cookies-sessions-render-request-context/04-CONTEXT.md
@.planning/phases/04-uploads-cookies-sessions-render-request-context/04-RESEARCH.md
@src/adapter/boot.ts
@src/index.ts

<interfaces>
<!-- Existing public types — Phase 4 adds nothing here in this plan; only adds getRequestContext export. -->

From src/types/action.ts:
```typescript
export interface Action { request: unknown; response: unknown; next?: unknown; }
export type ClassConstructor<T = unknown> = new (...args: unknown[]) => T;
```

From src/adapter/boot-options.ts (current shape — DO NOT widen in this plan; that happens in 04-05):
```typescript
export interface BootOptions {
  controllers: ReadonlyArray<ClassConstructor<unknown>>;
  // ...other Phase 2/3 fields...
}
```

NEW exports this plan adds (target shape):
```typescript
// src/adapter/request-context.ts
export interface RequestContext {
  req: import('express').Request;
  res: import('express').Response;
  requestId: string;
}
export function createAlsMiddleware(): import('express').RequestHandler;
export function getRequestContext(): RequestContext;  // throws if outside scope
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement request-context.ts (ALS singleton + middleware + getter)</name>
  <files>src/adapter/request-context.ts</files>
  <read_first>
    - .planning/phases/04-uploads-cookies-sessions-render-request-context/04-RESEARCH.md (Pattern 8, Pitfall 7)
    - .planning/phases/04-uploads-cookies-sessions-render-request-context/04-CONTEXT.md (D-11, D-12, D-13, D-14)
    - src/adapter/boot.ts (existing app.use ordering — to know where this slots in for Task 2)
    - src/errors/http-error.ts (Error subclass conventions; this file uses plain Error per D-14 wording — match exactly)
  </read_first>
  <behavior>
    - Module-scoped `AsyncLocalStorage<RequestContext>` instance (single per process — DO NOT create per-request).
    - `createAlsMiddleware()` returns an Express RequestHandler that:
      - Reads `req.headers['x-request-id']`. If string and `.trim().length > 0` → use trimmed value verbatim. Otherwise call `randomUUID()` from `node:crypto`.
      - Calls `als.run({ req, res, requestId }, next)`. The `next` MUST be invoked inside `als.run` so all async continuations see the store.
    - `getRequestContext()` returns `als.getStore()`. If undefined, throws `Error` with EXACT message: `"getRequestContext() called outside an active request scope — ensure useExpressControllers() is mounted on the app before this code runs."`
    - Test: middleware sets context; handler awaits a `setImmediate` then calls `getRequestContext()` and observes the same `requestId` (cross-await proof).
    - Test: `X-Request-Id` header `"trace-abc"` arrives → context.requestId === `"trace-abc"`.
    - Test: empty/whitespace `X-Request-Id` → falls through to randomUUID (regex match `/^[0-9a-f-]{36}$/`).
    - Test: `getRequestContext()` called with no active store throws with the exact message above.
  </behavior>
  <action>
    Create `src/adapter/request-context.ts` with:

    ```typescript
    import { AsyncLocalStorage } from 'node:async_hooks';
    import { randomUUID } from 'node:crypto';
    import type { Request, Response, NextFunction, RequestHandler } from 'express';

    export interface RequestContext {
      req: Request;
      res: Response;
      requestId: string;
    }

    const als = new AsyncLocalStorage<RequestContext>();

    export function createAlsMiddleware(): RequestHandler {
      return function alsMiddleware(req: Request, res: Response, next: NextFunction): void {
        const headerVal = req.headers['x-request-id'];
        const fromHeader = typeof headerVal === 'string' ? headerVal.trim() : '';
        const requestId = fromHeader.length > 0 ? fromHeader : randomUUID();
        als.run({ req, res, requestId }, () => next());
      };
    }

    export function getRequestContext(): RequestContext {
      const store = als.getStore();
      if (!store) {
        throw new Error(
          'getRequestContext() called outside an active request scope — ensure useExpressControllers() is mounted on the app before this code runs.'
        );
      }
      return store;
    }
    ```

    Notes:
    - Use `node:crypto` import (not global crypto) — explicit, ESM/CJS portable per Pattern 8.
    - Use `node:async_hooks` import.
    - DO NOT cast or widen `Request` / `Response` — use Express's exported types directly.
    - DO NOT add `requestId` to `req` (D-13).
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -q "AsyncLocalStorage" src/adapter/request-context.ts && grep -q "node:crypto" src/adapter/request-context.ts && ! grep -E "req\\.requestId\\s*=" src/adapter/request-context.ts</automated>
  </verify>
  <acceptance_criteria>
    - File `src/adapter/request-context.ts` exists.
    - `grep -q "export function getRequestContext" src/adapter/request-context.ts` succeeds.
    - `grep -q "export function createAlsMiddleware" src/adapter/request-context.ts` succeeds.
    - `grep -q "export interface RequestContext" src/adapter/request-context.ts` succeeds.
    - No top-level imports of `multer`, `cors`, `cookie`, `tinyglobby`, or `express-session` in this file: `! grep -E "^import .* from ['\\\"](multer|cors|cookie|tinyglobby|express-session)['\\\"]" src/adapter/request-context.ts`.
    - `req.requestId` assignment forbidden: `! grep -E "req\\.requestId\\s*=" src/adapter/request-context.ts` (D-13).
    - `npx tsc --noEmit` exits 0.
  </acceptance_criteria>
  <done>The module compiles, exports the three public symbols, and contains no namespace-pollution code paths.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire ALS middleware as FIRST app.use in boot.ts; export getRequestContext</name>
  <files>src/adapter/boot.ts, src/index.ts</files>
  <read_first>
    - src/adapter/boot.ts (current FULL file — find the first `app.use(` call inside `useExpressControllers`; insert ALS BEFORE it)
    - src/index.ts (public barrel — add the new export beside existing Phase 2/3 exports)
    - .planning/phases/04-uploads-cookies-sessions-render-request-context/04-CONTEXT.md (D-11, D-18 boot order)
  </read_first>
  <action>
    1. Edit `src/adapter/boot.ts`:
       - Add `import { createAlsMiddleware } from './request-context.js';` to the top of the file (per existing import style — `.js` extension, single quotes if existing file uses them, otherwise match existing).
       - Inside `useExpressControllers(app, options)`, BEFORE any other `app.use(...)` calls owned by this function (including any Phase 3 lib-globals BEFORE handler), insert:
         ```typescript
         // Phase 4 D-11/D-18: ALS wrapper MUST be the outermost app.use() owned by the library.
         app.use(createAlsMiddleware());
         ```
       - This must be the literal first `app.use(...)` call inside `useExpressControllers`. The Phase 3 globals and any other middleware come AFTER.
       - Also update `createExpressServer` if it calls `app.use(express.json())` or similar — the ALS wrapper must be installed BEFORE `express.json()` (per RESEARCH anti-pattern: "Mounting the ALS wrapper after `app.use(express.json())`"). If `createExpressServer` delegates to `useExpressControllers`, ensure the ALS wrapper runs before any pre-router middleware that `createExpressServer` itself adds.

    2. Edit `src/index.ts`:
       - Add a new public export block after the Phase 3 interfaces export:
         ```typescript
         // Phase 4 — request context (AsyncLocalStorage)
         export { getRequestContext } from './adapter/request-context.js';
         export type { RequestContext } from './adapter/request-context.js';
         ```
       - DO NOT export `createAlsMiddleware` from the barrel — it is internal; only the public getter and type ship.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -q "createAlsMiddleware" src/adapter/boot.ts && grep -q "getRequestContext" src/index.ts && ! grep -q "createAlsMiddleware" src/index.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "app.use(createAlsMiddleware" src/adapter/boot.ts` returns a line before any other `app.use(` line that lives inside `useExpressControllers`. (Verify by inspecting file order: the ALS app.use should come earliest in the function body.)
    - `grep -q "export { getRequestContext }" src/index.ts` succeeds.
    - `grep -q "export type { RequestContext }" src/index.ts` succeeds.
    - `! grep -q "createAlsMiddleware" src/index.ts` succeeds (internal helper not leaked).
    - `npx tsc --noEmit` exits 0.
  </acceptance_criteria>
  <done>Booting an Express app via `useExpressControllers` makes `getRequestContext()` work for all subsequent middleware, handlers, and async continuations.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Smoke test — ALS context survives await; X-Request-Id precedence; outside-scope throw</name>
  <files>test/request-context.test.ts</files>
  <read_first>
    - test/ existing tests (find the closest analog — likely `test/adapter/boot.test.ts` or similar — for supertest+vitest setup pattern)
    - .planning/phases/04-uploads-cookies-sessions-render-request-context/04-RESEARCH.md (Pattern 8 + Pitfall 7)
    - src/adapter/request-context.ts (the implementation under test)
    - src/adapter/boot.ts (to know how to bootstrap a test app)
  </read_first>
  <behavior>
    Tests in `test/request-context.test.ts`:
    1. `getRequestContext throws when called outside a request` — calls the function directly, asserts the exact error message `"getRequestContext() called outside an active request scope — ensure useExpressControllers() is mounted on the app before this code runs."`
    2. `requestId from X-Request-Id header is used verbatim` — boot a tiny Express app with one controller; controller method records `getRequestContext().requestId`; supertest GET with header `X-Request-Id: trace-abc-123` → assert recorded === `"trace-abc-123"`.
    3. `requestId falls back to randomUUID when header absent` — same setup, no header → assert recorded matches `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/`.
    4. `requestId falls back to randomUUID when header is empty/whitespace` — header `"   "` → recorded matches UUID regex.
    5. **CROSS-AWAIT smoke test** — controller method does `await new Promise(r => setImmediate(r))` and then calls `getRequestContext()` from inside a freshly-defined async helper function defined OUTSIDE the controller class; both call sites observe the same `req` and the same `requestId`. This proves ALS propagates across an await boundary AND across function call sites in the same async chain (ROADMAP SC #5).
    6. `concurrent requests get different requestIds` — fire 5 supertest requests in `Promise.all`; record each's requestId in a shared array; assert all 5 are unique.
  </behavior>
  <action>
    Create `test/request-context.test.ts` using vitest + supertest. Copy the boot/teardown idiom from the closest existing test (likely under `test/adapter/`). The test file MUST be runnable with `npx vitest run test/request-context.test.ts`.

    Use the public API only: import `getRequestContext` from the package barrel (`../src/index.js` per existing test convention). Do NOT import `createAlsMiddleware` directly.

    For the cross-await smoke test, define a helper at module scope:
    ```typescript
    async function readContextAfterAwait() {
      await new Promise(r => setImmediate(r));
      return getRequestContext();
    }
    ```
    Have the controller call `await readContextAfterAwait()` and verify the result.
  </action>
  <verify>
    <automated>npx vitest run test/request-context.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - File `test/request-context.test.ts` exists.
    - `npx vitest run test/request-context.test.ts` exits 0 with all 6 tests passing.
    - Test file does NOT import internal modules — only the public barrel: `! grep -E "from ['\\\"]\\.\\./src/adapter/" test/request-context.test.ts`.
    - The cross-await test is named with the substring `cross-await` or `await boundary` so it's discoverable.
  </acceptance_criteria>
  <done>All ROADMAP SC #5 properties (header verbatim, UUID fallback, cross-await propagation, scope error) are proven by a green test.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| External client → Express app | `X-Request-Id` header arrives from possibly-untrusted origin (or trusted reverse proxy). |
| Per-request ALS scope → application code | ALS store is shared by all code reachable from the request; cross-request leakage would be a security incident. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04-01 | Spoofing | `X-Request-Id` header trust | accept | D-12 explicitly passes header verbatim; document in README that consumers behind UNTRUSTED proxies should sanitize upstream. The library does not validate format because corrupting trace IDs from trusted infrastructure is worse than accepting arbitrary strings. (Per RESEARCH Security Domain.) |
| T-04-02 | Information Disclosure | Cross-request ALS context leakage | mitigate | Each request gets a fresh `als.run({...}, next)` invocation; ALS guarantees per-async-context isolation per Node docs. Test #6 (concurrent requests get different requestIds) is the load-bearing proof. |
| T-04-03 | Denial of Service | Unbounded `X-Request-Id` length | accept | Header is stored only in ALS for the duration of one request; no persistence, no log emission by the library. Memory pressure equals one short-lived string per concurrent request. Consumers who log requestId are responsible for length-capping in their logger. |
| T-04-04 | Tampering | `req.requestId` overwrite by user middleware | mitigate | D-13: requestId is NEVER stored on `req`. ALS-only access. Grep gate `! grep -E "req\\.requestId\\s*=" src/` enforces this. |
</threat_model>

<verification>
- `npx tsc --noEmit` clean.
- `npx vitest run test/request-context.test.ts` exits 0 with 6 tests passing.
- `! grep -E "^import .* from ['\"](multer|cors|cookie|tinyglobby|express-session)['\"]" src/adapter/request-context.ts src/adapter/boot.ts` (no top-level optional-peer imports).
- `! grep -E "req\\.requestId\\s*=" src/` (D-13 invariant).
- `grep -q "app.use(createAlsMiddleware" src/adapter/boot.ts` (ALS wrapper installed).
- `grep -q "export { getRequestContext }" src/index.ts` (public surface).
</verification>

<success_criteria>
- ROADMAP SC #5 proven by `test/request-context.test.ts` cross-await test.
- ALS wrapper sits as the first `app.use()` inside `useExpressControllers` (verified by file inspection).
- `getRequestContext` is reachable from the public package barrel; `createAlsMiddleware` is not.
- No state pollution on `req`.
</success_criteria>

<output>
After completion, create `.planning/phases/04-uploads-cookies-sessions-render-request-context/04-01-SUMMARY.md` documenting:
- Files created / modified.
- The exact `app.use` ordering inside `useExpressControllers` (line-numbered diff).
- The 6 test names and their pass status.
- Any deviations from D-11/D-12/D-13/D-14 (none expected).
</output>

## Truths — Decision Citations

This plan implements the following CONTEXT.md decisions:

- **D-11** — ALS middleware is mounted as the FIRST `app.use()` inside `useExpressControllers`, before CORS, lib globals, and routers (enforced in Task 2 and the `key_links` boot order check).
- **D-12** — `requestId` is taken verbatim from the `X-Request-Id` header when present and non-empty; otherwise falls back to `crypto.randomUUID()` — implemented in `createAlsMiddleware` and proven by smoke tests 2–4 in Task 3.
- **D-14** — `getRequestContext()` is the sole public API for consuming the ALS store; it throws a specific actionable error message when called outside an active request scope — implemented in `request-context.ts` and exported from the public barrel.
