---
phase: 02-runtime-express-adapter-happy-path
plan: 04
type: execute
wave: 2
depends_on: [02-01]
files_modified:
  - src/adapter/response.ts
  - src/adapter/index.ts
  - tests/adapter/response.test.ts
autonomous: true
requirements: [RES-08]
must_haves:
  truths:
    - "writeResponse applies Phase 1 responseHandlers (HttpCode/Header/ContentType) before writing body (traces SC #5)"
    - "Plain return from @JsonController serializes via res.json() — objects, arrays, primitives, null included (D-11, traces SC #5)"
    - "Plain return from @Controller content-negotiates: string→res.send(), Buffer→res.send(), object/array→res.json() (D-11)"
    - "Stream values (anything with .pipe function) are piped via .pipe(res); checked BEFORE asyncIterator (D-12, traces SC #5, RES-08)"
    - "Async-iterable values (Symbol.asyncIterator) are wrapped in Readable.from() and piped (D-12, RES-08)"
    - "Stream/iterable error event forwards to next() so library error middleware sees it; never swallowed (D-14)"
    - "null/undefined return values: when @OnNull/@OnUndefined response-shaper present, status applied + res.end() with no body; otherwise default 204 No Content (D-13)"
  artifacts:
    - path: src/adapter/response.ts
      provides: "applyResponseHandlers, writeResponse — pure functions consumed by Plan 02-05's wrapper"
      exports: [applyResponseHandlers, writeResponse]
  key_links:
    - from: src/adapter/response.ts
      to: src/types/resolved.ts
      via: "reads ControllerMetadata.type ('json'|'default') and action.responseHandlers"
      pattern: "ResponseHandlerArgs"
    - from: src/adapter/response.ts
      to: node:stream
      via: "Readable.from() for async iterables"
      pattern: "Readable\\.from"
---

<objective>
Implement the response writer: apply Phase 1's `@HttpCode`/`@Header`/`@ContentType` metadata, then dispatch by `@JsonController` vs `@Controller` and value type. Streams pipe with backpressure; async iterables are wrapped via `Readable.from`; null/undefined honor `@OnNull`/`@OnUndefined` (Phase 1) or default to 204 (D-13).

Pure module — accepts a `next: NextFunction` callback so stream errors forward into the library's single error middleware (D-14). No validation, no wrapping, no boot — those are sibling/downstream plans.

Purpose: Land RES-08 + the runtime side of Phase-1 response shapers in a single tested unit.

Output: `src/adapter/response.ts` exporting `applyResponseHandlers` + `writeResponse`. Tests cover JSON/string/Buffer/stream/iterable/null/undefined paths and the headersSent stream-error guard interaction.
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

<interfaces>
Phase 1 metadata this module reads:

```ts
// src/metadata/types.ts (read this file to confirm exact ResponseHandlerType values)
// Phase 1 supports: 'http-code', 'header', 'content-type', 'null-result-code', 'undefined-result-code'
//   (verify against actual src/metadata/types.ts before coding)
export type ResponseHandlerType = ...; // confirm in source
export interface ResponseHandlerArgs {
  type: ResponseHandlerType;
  value: unknown;
  // additional fields per type — confirm in source
}

// src/types/resolved.ts
export interface ControllerMetadata {
  type: 'json' | 'default';   // 'json' = @JsonController, 'default' = @Controller
  responseHandlers: ResponseHandlerArgs[];   // controller-level
  // ...
}
export interface ActionMetadata {
  responseHandlers: ResponseHandlerArgs[];   // method-level
  // ...
}
```

Express types (type-only):
- `import type { Response, NextFunction } from 'express'`
- `res.status(n)`, `res.set(name, value)`, `res.type(contentType)`, `res.json(value)`, `res.send(value)`, `res.end()`, `res.headersSent: boolean`, `res.destroy(err?)`

Node stream:
- `import { Readable } from 'node:stream'` for `Readable.from(asyncIterable)`
- `value.pipe(res)` for any stream that has `.pipe`
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: applyResponseHandlers — Phase 1 shaper metadata application</name>
  <files>src/adapter/response.ts, tests/adapter/response.test.ts</files>
  <read_first>
    - src/metadata/types.ts (confirm exact ResponseHandlerType string literals — 'http-code', 'header', 'content-type', 'null-result-code', 'undefined-result-code'; if names differ, use the actual ones)
    - src/types/resolved.ts (ResponseHandlerMetadata)
    - src/decorators/index.ts (verify @HttpCode, @Header, @ContentType, @OnNull, @OnUndefined exist and produce which ResponseHandlerType values)
    - .planning/phases/02-runtime-express-adapter-happy-path/02-CONTEXT.md §decisions D-11, D-13
  </read_first>
  <behavior>
    applyResponseHandlers(res, controllerHandlers, actionHandlers):
    - Method-level overrides controller-level for the same type (action loop runs AFTER controller loop)
    - For type 'http-code': res.status(value)
    - For type 'header': res.set(name, value) — read the actual ResponseHandlerArgs shape from Phase 1 to know how name+value are stored
    - For type 'content-type': res.type(value)
    - For 'null-result-code' and 'undefined-result-code': skipped here (writeResponse Task 2 handles them)
    - Unknown types: ignored silently
  </behavior>
  <action>
First, READ `src/metadata/types.ts` and `src/decorators/response/*.ts` (or wherever the response decorators live) to learn the EXACT shape of `ResponseHandlerArgs` for each decorator. Specifically determine:
- For `@Header(name, value)`: is the arg shape `{ type: 'header', name: string, value: string }` or `{ type: 'header', value: { name, value } }` or something else?
- For `@HttpCode(code)`: where is the numeric code stored?
- For `@OnNull(code)` / `@OnUndefined(code)`: confirm type literals.

Then write `src/adapter/response.ts`:

```ts
import type { Response } from 'express';
import type { ResponseHandlerArgs } from '../metadata/types.js';

/**
 * Apply Phase 1 response-shaper metadata (@HttpCode, @Header, @ContentType) to the response.
 * Method-level handlers override controller-level handlers for the same type
 * (called in order: controller first, then action).
 *
 * Null/undefined-result-code shapers are NOT applied here — writeResponse handles them
 * in the null/undefined branch (D-13).
 */
export function applyResponseHandlers(
  res: Response,
  controllerHandlers: ReadonlyArray<ResponseHandlerArgs>,
  actionHandlers: ReadonlyArray<ResponseHandlerArgs>
): void {
  for (const h of [...controllerHandlers, ...actionHandlers]) {
    switch (h.type) {
      case 'http-code':
        // Adapt the field access to the ACTUAL ResponseHandlerArgs shape from Phase 1.
        res.status(Number(h.value));
        break;
      case 'header':
        // Adapt — likely something like res.set(h.name, String(h.value))
        // CONFIRM the shape from Phase 1 source before coding.
        res.set((h as any).name, String(h.value));
        break;
      case 'content-type':
        res.type(String(h.value));
        break;
      // 'null-result-code' / 'undefined-result-code' — handled in writeResponse, skip here
      default:
        // ignore unknown types silently
        break;
    }
  }
}
```

> **CRITICAL:** the field access for each handler MUST match Phase 1's actual shape. Do not guess. Read the metadata types and decorator implementations first; if Phase 1 stores `@Header` as `{ type:'header', value: { name, value } }`, adjust accordingly.

Tests in `tests/adapter/response.test.ts` under `describe('applyResponseHandlers')`. Mock `Response` with vitest:

```ts
function makeRes() {
  const calls: any[] = [];
  return {
    res: {
      status: (n: number) => { calls.push(['status', n]); return this; },
      set: (k: string, v: string) => { calls.push(['set', k, v]); return this; },
      type: (t: string) => { calls.push(['type', t]); return this; },
    } as unknown as Response,
    calls,
  };
}
```

Cases:
1. http-code applies status: pass `[{ type:'http-code', value: 201 }]` → calls includes `['status', 201]`.
2. content-type applies: `[{ type:'content-type', value: 'text/plain' }]` → calls includes `['type', 'text/plain']`.
3. Method overrides controller: controller `[{ type:'http-code', value: 200 }]`, action `[{ type:'http-code', value: 201 }]` → both calls present in order, last write wins as Express semantics.
4. null-result-code is NOT applied: pass `[{ type:'null-result-code', value: 404 }]` — calls is empty.
5. Unknown type ignored: pass `[{ type:'made-up' as any, value: 1 }]` — calls is empty.
6. Header applied: confirm shape from src; e.g. `[{ type:'header', name:'X-Custom', value:'v' }]` → calls includes `['set','X-Custom','v']`.
  </action>
  <verify>
    <automated>cd /Users/niraj/Desktop/Projects/routing-controlles-express && pnpm test --run tests/adapter/response.test.ts -t applyResponseHandlers</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "export function applyResponseHandlers" src/adapter/response.ts` returns one match
    - applyResponseHandlers tests for http-code, content-type, header, null-skip, unknown-skip all pass
    - Method-overrides-controller test passes (call order: controller first, then action)
    - `pnpm exec tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Response shapers applied before body write; field accesses match the actual Phase 1 metadata shape.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: writeResponse — JSON/string/Buffer/stream/async-iterable/null/undefined dispatch</name>
  <files>src/adapter/response.ts, src/adapter/index.ts, tests/adapter/response.test.ts</files>
  <read_first>
    - src/adapter/response.ts (Task 1 already present)
    - src/types/resolved.ts (ControllerMetadata.type discriminator)
    - .planning/phases/02-runtime-express-adapter-happy-path/02-CONTEXT.md §decisions D-11, D-12, D-13, D-14
    - .planning/phases/02-runtime-express-adapter-happy-path/02-RESEARCH.md §"Pattern 4" §"Pitfall B"
  </read_first>
  <behavior>
    writeResponse(res, next, value, controllerMeta, actionMeta):
    1. Apply response handlers via applyResponseHandlers (controller + action).
    2. If value === null:
       - Look for action.responseHandlers entry with type==='null-result-code'; if found, status to its value; else status 204.
       - res.end() with no body. Return.
    3. If value === undefined:
       - Same as null branch but type==='undefined-result-code'.
    4. Stream-first detection (D-12): if value && typeof value.pipe === 'function':
       - value.on('error', err => { if (res.headersSent) res.destroy(err); else next(err); })
       - value.pipe(res) — backpressure handled by pipe.
       - Return (do NOT call res.json/send afterward).
    5. Else if value && typeof value[Symbol.asyncIterator] === 'function':
       - const stream = Readable.from(value)
       - stream.on('error', forward) — same as case 4.
       - stream.pipe(res); return.
    6. Plain value (D-11):
       - controllerMeta.type === 'json' → res.json(value)  [covers objects, arrays, primitives, etc.]
       - controllerMeta.type === 'default':
           typeof value === 'string' → res.send(value)
           Buffer.isBuffer(value) → res.send(value)
           else → res.json(value)
  </behavior>
  <action>
Add to `src/adapter/response.ts`:

```ts
import { Readable } from 'node:stream';
import type { NextFunction, Response } from 'express';
import type { ControllerMetadata, ActionMetadata } from '../types/resolved.js';

function isStreamLike(v: unknown): v is { pipe: (dest: unknown) => unknown; on: (ev: string, cb: (e: unknown) => void) => unknown } {
  return !!v && typeof v === 'object' && typeof (v as any).pipe === 'function';
}

function isAsyncIterable(v: unknown): v is AsyncIterable<unknown> {
  return !!v && typeof v === 'object' && typeof (v as any)[Symbol.asyncIterator] === 'function';
}

function findShaper(handlers: ReadonlyArray<{ type: string; value: unknown }>, type: string): number | undefined {
  const found = handlers.find(h => h.type === type);
  return found ? Number(found.value) : undefined;
}

/**
 * Write the handler's return value to the response per D-11/D-12/D-13.
 * Stream errors (D-14) forward to next() unless headers were already sent
 * (in which case the stream is destroyed; the lib error middleware does not
 * attempt to write a second body).
 */
export function writeResponse(
  res: Response,
  next: NextFunction,
  value: unknown,
  controllerMeta: ControllerMetadata,
  actionMeta: ActionMetadata
): void {
  // 1. Apply HttpCode/Header/ContentType
  applyResponseHandlers(res, controllerMeta.responseHandlers, actionMeta.responseHandlers);

  // 2. null branch (D-13)
  if (value === null) {
    const code = findShaper(actionMeta.responseHandlers, 'null-result-code')
      ?? findShaper(controllerMeta.responseHandlers, 'null-result-code')
      ?? 204;
    res.status(code);
    res.end();
    return;
  }

  // 3. undefined branch (D-13)
  if (value === undefined) {
    const code = findShaper(actionMeta.responseHandlers, 'undefined-result-code')
      ?? findShaper(controllerMeta.responseHandlers, 'undefined-result-code')
      ?? 204;
    res.status(code);
    res.end();
    return;
  }

  // 4. Stream first (D-12 — order matters; streams are also iterable)
  if (isStreamLike(value)) {
    value.on('error', (err: unknown) => {
      if (res.headersSent) {
        res.destroy(err instanceof Error ? err : new Error(String(err)));
      } else {
        next(err);
      }
    });
    (value as unknown as NodeJS.ReadableStream).pipe(res);
    return;
  }

  // 5. Async iterable second (D-12)
  if (isAsyncIterable(value)) {
    const stream = Readable.from(value);
    stream.on('error', (err: unknown) => {
      if (res.headersSent) {
        res.destroy(err instanceof Error ? err : new Error(String(err)));
      } else {
        next(err);
      }
    });
    stream.pipe(res);
    return;
  }

  // 6. Plain value (D-11)
  if (controllerMeta.type === 'json') {
    res.json(value);
    return;
  }
  // @Controller content-negotiate
  if (typeof value === 'string') {
    res.send(value);
    return;
  }
  if (Buffer.isBuffer(value)) {
    res.send(value);
    return;
  }
  res.json(value);
}
```

Update `src/adapter/index.ts`:
```ts
export { applyResponseHandlers, writeResponse } from './response.js';
```

Tests in `tests/adapter/response.test.ts` under `describe('writeResponse (D-11/D-12/D-13, RES-08)')`. Use a real Express app + supertest for integration to make the stream/pipe mechanics realistic. Build a tiny ad-hoc app that registers a single route directly with `writeResponse`:

```ts
import express from 'express';
import request from 'supertest';
import { Readable } from 'node:stream';
import { writeResponse } from '../../src/adapter/response.js';

function makeApp(value: unknown, ctlType: 'json'|'default' = 'json') {
  const app = express();
  app.get('/', (_req, res, next) => {
    writeResponse(res, next, value,
      { type: ctlType, basePath: '', target: class C{}, responseHandlers: [], actions: [] },
      { target: class C{}, method: 'h', verb: 'get', path: '/', responseHandlers: [] });
  });
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ error: err?.message }));
  return app;
}
```

Cases (each is a separate `it`):

1. **JSON object @JsonController**: `value = { ok: 1 }`, ctlType='json'. `request(app).get('/')` → 200, body `{ ok: 1 }`, content-type `application/json`.
2. **JSON null @JsonController → 204**: `value = null`, no shaper. → status 204, body empty.
3. **JSON undefined @JsonController → 204**: same.
4. **@OnNull(404) honored**: pass action.responseHandlers `[{ type: 'null-result-code', value: 404 }]`. → status 404, empty body.
5. **@OnUndefined(204) explicit**: same idea.
6. **String @Controller → text response**: ctlType='default', value='hello'. → 200, body 'hello'. Content-type starts with 'text/' (Express default for send(string)).
7. **Buffer @Controller**: ctlType='default', value=`Buffer.from('xy')`. → 200, body bytes.
8. **Object @Controller falls back to JSON**: ctlType='default', value=`{a:1}`. → JSON.
9. **Async iterable piped (RES-08)**: `value = (async function* () { yield 'a'; yield 'b'; })()`. → 200, body 'ab'.
10. **Stream piped (RES-08)**: `value = Readable.from(['x','y'])`. Note Readable is itself iterable; D-12 detection order picks .pipe path. → body 'xy'.
11. **Stream that errors mid-pipe (Pitfall B)**: build a Readable that emits 'data' then 'error'. Build app with an error middleware that records calls. Assert: response is closed (request promise rejects with socket-hang-up OR returns truncated body); error middleware NOT called twice; no 'ERR_HTTP_HEADERS_SENT' thrown.
12. **Stream error BEFORE first byte**: build a Readable that errors before any data. Headers NOT yet sent → next(err) called → error middleware writes JSON 500.
13. **HttpCode applied via shaper (action)**: value `{ ok:1 }`, action.responseHandlers `[{ type:'http-code', value: 201 }]`. → status 201.

For Test 11 (stream error mid-response), an end-to-end pipe-with-error fixture:

```ts
import { Readable } from 'node:stream';
class ErroringStream extends Readable {
  private sent = false;
  _read() {
    if (!this.sent) { this.push('partial'); this.sent = true; }
    else this.destroy(new Error('mid-stream'));
  }
}
```

Note for Test 11: it tests the happy-path "stream error after headers" specifically — not the error middleware's handling of it. Plan 02-05's error middleware tests cover that side. Here we just assert: connection closed cleanly, no second body write attempted, no ERR_HTTP_HEADERS_SENT thrown into the test harness.
  </action>
  <verify>
    <automated>cd /Users/niraj/Desktop/Projects/routing-controlles-express && pnpm test --run tests/adapter/response.test.ts && pnpm exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "export function writeResponse" src/adapter/response.ts` returns one match
    - `grep -nE "Symbol\\.asyncIterator|Readable\\.from" src/adapter/response.ts` returns >= 2 matches (D-12 detection)
    - `grep -nE "headersSent" src/adapter/response.ts` returns >= 1 match (D-14 guard)
    - `grep -nE "source.*=.*\\$\{.*target\\.name\\}\\.\\$\{" src/adapter/response.ts` returns >= 1 match — confirms streamSource template applied (INFO #7 fix)
    - All 13 test cases above pass
    - Test 9 (async iterable) and Test 10 (stream) both produce body bytes — confirms RES-08
    - Test 11 (stream error mid-response) does not throw ERR_HTTP_HEADERS_SENT
    - **NEW (INFO #7):** stream-error integration test asserts `err.source` matches `${ControllerClass.name}.${methodName}` (build a fixture controller `class StreamCtl { boom(){ ... }}` returning an erroring stream; capture the error in the test's error middleware; assert `err.source === 'StreamCtl.boom'`)
    - **NEW (INFO #7):** when wrapAction has already set `err.source` upstream, writeResponse does NOT overwrite it (test injects a custom `source` on the error before piping; assert it survives)
    - `grep -n "// 02-04 response exports" src/adapter/index.ts` returns one match (marker preserved)
    - `grep -n "writeResponse\|applyResponseHandlers" src/adapter/index.ts` returns >= 2 matches (exports inserted under the 02-04 marker)
    - `grep -n "// 02-02 router-build exports\|// 02-03 validation exports\|// 02-05 error-middleware" src/adapter/index.ts` returns 3 matches (other Wave 2 markers untouched)
  </acceptance_criteria>
  <done>RES-08 satisfied; D-11/D-12/D-13 all tested end-to-end via supertest.</done>
</task>

</tasks>

<verification>
- `pnpm test --run tests/adapter/response.test.ts` all green
- RES-08 covered (streams + async iterables piped)
- D-11 (JsonController vs Controller dispatch), D-12 (stream-first order), D-13 (null/undefined → 204), D-14 (headersSent guard) all tested
- `pnpm exec tsc --noEmit` clean
</verification>

<success_criteria>
Response writer dispatches every value type correctly with backpressure-safe stream piping and Phase-1 shaper integration. Plan 02-06 wires it through the boot path.
</success_criteria>

<output>
Create `.planning/phases/02-runtime-express-adapter-happy-path/02-04-SUMMARY.md`
</output>
