# Phase 2: Runtime + Express Adapter (Happy Path) — Research

**Researched:** 2026-05-09
**Domain:** Express v5.1+ HTTP runtime / path-to-regexp v8 / Standard Schema validation / Node streams
**Confidence:** HIGH (all seven research targets verified against official docs and current registry versions)

## Summary

Phase 2 sits on a stable, well-documented stack: Express 5.2.1 (current `latest` on npm), path-to-regexp 8.4.2 (transitive via Express 5), Standard Schema spec 1.1.0 (already installed). All 18 CONTEXT.md decisions hold up against the upstream evidence below — no contradictions. The research sharpens five places where the planner needs concrete shapes/snippets to write tasks against:

1. **Async error semantics in v5 are exactly what D-15/D-16 assume**: `next(err)` is auto-called for both sync throws and rejected promises in async handlers, the four-arg error middleware fires once, and `res.headersSent` is the canonical guard for the streaming case (D-14).
2. **path-to-regexp v8 already throws synchronously at `Router.METHOD(path, ...)`** for all four v4 footguns in D-05 — so the pre-flight detector's job is to *replace* p2re's "Missing parameter name at position N" message with our actionable controller-aware one *before* p2re sees the path. D-05 is necessary, not redundant.
3. **Standard Schema's `validate()` may return `Result<T> | Promise<Result<T>>`** and issues' `path` is `ReadonlyArray<PropertyKey | PathSegment>` where `PathSegment = { key: PropertyKey }`. Phase 2's path renderer must handle both shapes (D-09).
4. **Phase 1's `ValidationIssue` type is too narrow** — it has only `{ path, message }`. Phase 2 needs `{ slot, path, message }` per D-08. Either widen `ValidationIssue` or define a Phase-2-local error-detail type. Flagged below as the only structural change Phase 2 forces on Phase 1's outputs.
5. **`.pipe(res)` is the canonical Node-stream→Express-response mechanism** and `Readable.from(asyncIterable).pipe(res)` works for async generators. Both attach `.on('error', next)` to forward stream errors into the v5 native chain (D-12, D-14).

**Primary recommendation:** Implement Phase 2 in five module groups under `src/adapter/`: `boot.ts` (entry-point pair), `router-build.ts` (per-controller `express.Router()`, path composition, p2re v8 detector), `validation.ts` (four-slot Standard Schema executor + issue formatter), `response.ts` (JsonController vs Controller writer + stream/iterable detection), `error-middleware.ts` (the single library middleware with dev/prod disclosure rules). Keep all Express imports inside `src/adapter/`; the rest of `src/` stays HTTP-agnostic.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Boot / app composition | Adapter (`src/adapter/boot.ts`) | — | Only place that constructs `express()` and mounts middleware (D-01, D-02) |
| Path composition + v8 syntax check | Adapter (`router-build.ts`) | — | Express-specific; respects Phase 1 boundary (D-05) |
| Per-controller `Router` construction | Adapter (`router-build.ts`) | Container (instance resolution) | Reads Phase 1 metadata; instantiates via `getContainer()` |
| Standard Schema execution | Adapter (`validation.ts`) | Errors (Phase 1 `BadRequestError`) | Adapter owns `req.params|query|body|headers` access; reuses Phase 1 error |
| Response writing | Adapter (`response.ts`) | — | Reads Phase 1 `responseHandlers` metadata; calls Express `res.*` |
| Native v5 async error catch | Express runtime (built-in) | Adapter wrapper (source attribution) | Express forwards rejections; our wrapper enriches `err.source` only |
| Error→HTTP serialization | Adapter (`error-middleware.ts`) | Phase 1 `HttpError.toJSON()` | Adapter owns the four-arg signature; Phase 1 owns the JSON shape |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---|---|---|---|
| `express` | peer `^5.1.0` (5.2.1 current `latest` on npm — verified 2026-05-09) | HTTP framework being wrapped | Project peer dep; v5 is the *whole point* of this library [VERIFIED: `npm view express version`] |
| `path-to-regexp` | 8.4.2 transitive via Express 5 | Path parsing | Already a transitive of Express; do **not** add as direct dep [VERIFIED: `npm view path-to-regexp version`; CITED: pillarjs/path-to-regexp README] |
| `@standard-schema/spec` | `^1.0.0` (1.1.0 installed) | Validator-agnostic interface | Type-only; Zod v4, Valibot v1, ArkType v2 all conform natively [VERIFIED: package.json devDependencies; CITED: standardschema.dev] |
| `reflect-metadata` | `^0.2.2` (already a core dep) | Constructor-paramtypes (Phase 1) | Phase 2 does not call `Reflect.*` itself; consumer must `import 'reflect-metadata'` per BUILD-04/05 |

### Supporting (Node built-ins — no install)

| Module | Purpose | When |
|---|---|---|
| `node:stream` `Readable.from()` | Wrap async iterables for `.pipe(res)` | D-12 path 2 |
| `node:stream` `pipeline()` | Optional alternative to `.pipe(res) + .on('error', next)` | If we want stream cleanup automation |

### Alternatives Considered (and rejected for Phase 2)

| Instead of | Could Use | Why Rejected |
|---|---|---|
| `.pipe(res) + .on('error', next)` (D-12+D-14) | `stream.pipeline(value, res, next)` | Pipeline auto-handles cleanup, but composes awkwardly with our pre-existing wrapper-based error attribution; `.pipe + .on('error')` matches D-14 verbatim and is what every Express tutorial shows |
| Per-validator branching (Zod-aware, Valibot-aware) | Single `~standard.validate` call | Project requirement (VAL-01) and CONTEXT decision; non-negotiable |
| `body-parser` package | Built-in `express.json()` / `express.urlencoded()` | v5 ships these built-in [CITED: PITFALLS.md #7]; D-02 confirms |

**Installation:** Phase 2 adds **no** new runtime dependencies. Vitest fixtures may want `supertest` as a devDep; recommend `supertest@^7` for end-to-end HTTP tests.

## Architecture Patterns

### Module Layout

```
src/
├── adapter/                   # NEW in Phase 2 — only place with Express imports
│   ├── boot.ts                # useExpressControllers + createExpressServer (D-01, D-02)
│   ├── router-build.ts        # per-controller Router; path compose; p2re v8 footgun detector (D-04, D-05)
│   ├── validation.ts          # 4-slot Standard Schema runner + issue formatter (D-06..D-10)
│   ├── response.ts            # JsonController/Controller dispatch; stream/iterable; null/undefined (D-11..D-13)
│   ├── error-middleware.ts    # the one error middleware (D-14, D-17, D-18)
│   ├── handler-wrapper.ts     # per-handler async fn that adds err.source (D-16)
│   ├── boot-options.ts        # BootOptions type — every API-03 key, only used keys implemented (D-03)
│   └── index.ts               # internal barrel
└── index.ts                   # public barrel — adds useExpressControllers, createExpressServer, BootOptions
```

### Pattern 1: Boot factoring (D-01)

```ts
// boot.ts (illustrative; not final code)
export function createExpressServer(options: BootOptions): Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));   // D-02 asymmetry
  return useExpressControllers(app, options);
}

export function useExpressControllers(app: Express, options: BootOptions): Express {
  const controllers = buildMetadata(options.controllers);  // Phase 1 entry point
  for (const cm of controllers) mountController(app, cm, options);
  if (options.defaultErrorHandler !== false) app.use(libraryErrorMiddleware);  // D-15, D-17
  return app;
}
```

### Pattern 2: Per-handler wrapper (D-16) — async function that lets v5 propagate

```ts
// handler-wrapper.ts
function wrapAction(ControllerClass: Function, methodName: string | symbol, action: ActionMetadata) {
  const source = `${ControllerClass.name}.${String(methodName)}`;
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. validate 4 slots (Promise.all per D-06) → throws BadRequestError on failure
      const args = await resolveInputs(req, res, next, action);
      // 2. instantiate controller via container
      const instance = await getContainer().get(ControllerClass);
      // 3. call user method
      const result = await (instance as any)[methodName](args);
      // 4. write response (D-11..D-13)
      await writeResponse(res, result, action);
    } catch (err) {
      if (err && typeof err === 'object' && !('source' in err)) {
        (err as any).source = source;
      }
      next(err);
    }
  };
}
```

**Why this is correct under v5:** v5 already auto-forwards async rejections [CITED: expressjs.com/en/guide/error-handling.html]. Our wrapper exists *only* to attach `source` before forwarding. We do **not** also call `next(err)` from outside `catch` — that would double-fire (PITFALLS.md #8). The single `next(err)` inside `catch` is the only path; the unhandled-rejection path is impossible because everything is awaited.

### Pattern 3: Four-slot validation (D-06, D-07, D-09, D-10)

```ts
// validation.ts (illustrative)
async function resolveInputs(req: Request, res: Response, next: NextFunction, action: ActionMetadata) {
  const decl = action.input ?? {};
  const slots = (['params', 'query', 'body', 'headers'] as const);
  // Promise.all over slots; each slot resolves to { slot, value, issues? }
  const results = await Promise.all(slots.map(s => validateSlot(s, decl[s], req[s])));
  const issues = results.flatMap(r => r.issues ?? []);
  if (issues.length > 0) {
    throw new BadRequestError('Validation failed', {
      details: issues,                          // [{ slot, path, message }]  ⚠ see VAL-DETAILS-SHAPE below
      source: undefined,                        // wrapper attaches via D-16
    });
  }
  const args = Object.fromEntries(results.map(r => [r.slot, r.value]));
  return { ...args, req, res, next };           // INPUT-01 destructured shape
}

function validateSlot(slot, schema, raw) {
  if (!isStandardSchema(schema)) return { slot, value: raw };       // unvalidated → raw passthrough (D-10)
  const out = schema['~standard'].validate(raw);                     // sync OR Promise
  // Standard Schema spec: validate may return Result<T> | Promise<Result<T>>
  return Promise.resolve(out).then(r =>
    r.issues
      ? { slot, issues: r.issues.map(iss => ({ slot, path: renderPath(iss.path), message: iss.message })) }
      : { slot, value: r.value }
  );
}

function isStandardSchema(x: unknown): x is StandardSchemaV1 {
  return !!x && typeof x === 'object' && '~standard' in (x as object)
      && typeof (x as any)['~standard']?.validate === 'function';
}
```

**Path rendering (D-09):** Standard Schema `path` entries are `PropertyKey | PathSegment` where `PathSegment = { key: PropertyKey }`. Renderer must:

```ts
function renderPath(p?: ReadonlyArray<PropertyKey | { key: PropertyKey }>): string {
  if (!p || p.length === 0) return '';
  let out = '';
  for (const seg of p) {
    const key: PropertyKey = (typeof seg === 'object' && seg !== null && 'key' in seg) ? seg.key : seg;
    if (typeof key === 'number') out += `[${key}]`;
    else if (typeof key === 'string') out += out.length === 0 ? key : `.${key}`;
    else out += `.${String(key)}`;             // symbol — render via String()
  }
  return out;
}
```

[CITED: github.com/standard-schema/standard-schema — `Issue.path: ReadonlyArray<PropertyKey | PathSegment>`, `PathSegment.key: PropertyKey`]

### Pattern 4: Response writer (D-11, D-12, D-13)

```ts
// response.ts
async function writeResponse(res: Response, value: unknown, action: ActionMetadata) {
  // 1. Apply @HttpCode + @Header + @ContentType from action.responseHandlers
  applyResponseHandlers(res, action.responseHandlers);

  // 2. null / undefined branch (D-13)
  if (value === null || value === undefined) {
    const shaper = action.responseHandlers.find(
      h => h.type === (value === null ? 'null-result-code' : 'undefined-result-code')
    );
    res.status(shaper ? Number(shaper.value) : 204);
    return res.end();
  }

  // 3. Stream first, iterable second (D-12 — order matters)
  if (value && typeof (value as any).pipe === 'function') {
    (value as NodeJS.ReadableStream).on('error', err => res.headersSent ? res.destroy(err) : nextErr(err));
    return (value as NodeJS.ReadableStream).pipe(res);
  }
  if (value && typeof (value as any)[Symbol.asyncIterator] === 'function') {
    const stream = Readable.from(value as AsyncIterable<unknown>);
    stream.on('error', err => res.headersSent ? res.destroy(err) : nextErr(err));
    return stream.pipe(res);
  }

  // 4. Plain value branch (D-11)
  if (controller.type === 'json' /* @JsonController */) {
    return res.json(value);                    // covers objects, arrays, primitives, null
  }
  // @Controller — content-negotiate
  if (typeof value === 'string')        return res.send(value);
  if (Buffer.isBuffer(value))           return res.send(value);
  return res.json(value);                       // object/array → json
}
```

Note the `nextErr` capture above — the response writer must close over the `next` from the wrapper so stream errors enter the same error-middleware chain (D-14). Implementation detail for the planner.

### Pattern 5: The single error middleware (D-14, D-17, D-18)

```ts
// error-middleware.ts — exactly four args; mounted exactly once after all routers
export function libraryErrorMiddleware(err: unknown, req: Request, res: Response, next: NextFunction) {
  // D-14 streaming guard
  if (res.headersSent) {
    // log + destroy; do NOT attempt to write body
    console.error('[express-controllers] error after headers sent:', err);
    return res.destroy(err instanceof Error ? err : new Error(String(err)));
  }

  // D-18: HttpError vs anything else
  if (err instanceof HttpError) {
    res.status(err.status);
    const body = err.toJSON();                 // Phase 1 contract; BadRequestError adds details + source
    if (process.env.NODE_ENV !== 'production' && err.stack) (body as any).stack = err.stack;
    return res.json(body);
  }

  // Non-HttpError → generic 500 with no message leak
  const source = (err as any)?.source;          // attached by wrapper (D-16)
  res.status(500);
  const body: Record<string, unknown> = {
    status: 500, name: 'InternalServerError', message: 'Internal Server Error',
    ...(source ? { source } : {}),
  };
  if (process.env.NODE_ENV !== 'production') {
    if (err instanceof Error) {
      body.stack = err.stack;
      body._devMessage = err.message;
    }
  }
  res.json(body);
}
```

### Anti-Patterns to Avoid

- **Don't** use `try { handler() } catch (e) { next(e) }` *outside* the per-handler wrapper, and don't `.catch(next)` on the route. v5 already does this; doubling causes "headers already sent" or double-fire (PITFALLS.md #8).
- **Don't** call `pipe()` *after* writing any body — once `res.write(...)` or `res.json(...)` has happened, `pipe()` will append and break the framing. Stream/iterable returns are mutually exclusive with `res.json` / `res.send`.
- **Don't** auto-instantiate controllers in module scope — always go through `getContainer().get(Class)` so user-provided IocAdapter wins (Phase 1 D-09 contract).
- **Don't** mutate `req.params/query/body/headers` in place — D-10 says the *handler arg* receives the validated value, not that we overwrite Express's request properties.
- **Don't** import from `path-to-regexp` directly to validate paths — its error surface is unstable across patch versions. Run a string-level regex pre-flight (D-05) and let Express+p2re catch residual edge cases with their own (now-unwrapped) errors.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Async-error try/catch around handlers | `asyncHandler`-style wrapper | Native v5 forwarding (just `await` and `next(err)` once in our `source`-attribution catch) | v5 does it correctly; double-wrapping is a known footgun (PITFALLS.md #8) [CITED: expressjs.com/2024/10/15/v5-release.html] |
| Path-regexp parsing | Custom regex compiler | `path-to-regexp` v8 (already in Express) | Express does it; we only *pre-validate* with a string-level v4-pattern detector |
| Validator dispatch per library | Zod-aware / Valibot-aware code paths | `schema['~standard'].validate()` | VAL-01 / Standard Schema is the contract |
| Body parsing | Custom JSON / urlencoded parsing | `express.json()` / `express.urlencoded({ extended: true })` (built-in to v5) | PITFALLS.md #7; D-02 |
| Stream backpressure | Manual `data`/`drain` listeners | `.pipe(res)` (handles backpressure) | Node stream API handles it; pipeline alternative possible but heavier |
| Async-iterable→stream conversion | Custom `Readable` subclass | `Readable.from(asyncIterable)` | Built-in since Node 12 |

**Key insight:** Phase 2 is largely *connecting* well-tested upstream behavior (Express v5's native async, p2re v8's strictness, Standard Schema's validate, Node streams' pipe). The original-engineering surface is small: the four-slot orchestrator, the source-attribution wrapper, and the v4-pattern detector.

## Common Pitfalls (Phase-2-specific — extends PITFALLS.md)

### Pitfall A: Double-fire of error middleware via belt-and-braces wrapper

**What goes wrong:** Implementer reads "v5 forwards async errors" and *also* writes `app.get(path, async (req,res,next) => { try { ... } catch (e) { next(e) } })`. Then somewhere upstream a sibling middleware *also* `.catch(next)`s. Result: error middleware fires twice; second fire hits "headers already sent."

**Why it happens:** Conservative engineers add try/catch defensively; reviewers don't catch it because tests pass with one wrapper.

**How to avoid:** Exactly one `try/catch` per handler, in `handler-wrapper.ts` (D-16), and its only job is to attach `err.source` before `next(err)`. No other layer catches.

**Warning sign:** Test that throws once and asserts error middleware was called ≥2 times.

### Pitfall B: Stream error after headers sent crashes process

**What goes wrong:** Handler returns a stream that errors mid-pipe. Without `res.headersSent` guard in error middleware, code calls `res.json({...})`, throws `ERR_HTTP_HEADERS_SENT`, which (because we're in error middleware) goes to Express's *default* handler, which then ALSO can't write — connection hangs/aborts.

**Why it happens:** Devs forget to guard; the v5 docs *explicitly* call this out [CITED: expressjs.com/en/guide/error-handling.html].

**How to avoid:** D-14 mandates the `res.headersSent` check at the very top of `libraryErrorMiddleware`. Test must include "stream that errors after first chunk" → assert connection closed cleanly, no second body write attempted.

### Pitfall C: path-to-regexp v8 throws *before* our v4 detector if order is wrong

**What goes wrong:** Implementer calls `app.get(composedPath, handler)` first, then runs the v4-pattern check. If `composedPath` contains a v4 footgun, p2re v8 throws "Missing parameter name at position N" at the `app.get()` line, before the user-friendly message has a chance to fire.

**Why it happens:** Iteration order accident.

**How to avoid:** Run the D-05 footgun detector on `composedPath` *before* `router.METHOD(composedPath, ...)`. The check is cheap (one regex per pattern); always run first.

**Warning sign:** Error message in test is "Missing parameter name at position N" rather than the expected `[Controller.method] Path "..." uses v4 pattern ...`.

### Pitfall D: Standard Schema returns Promise even when underlying validator is sync

**What goes wrong:** Implementer treats `schema['~standard'].validate(input)` as sync, gets `Promise<Result>` back from a wrapper, calls `.issues` on it → `undefined` → "no issues" → invalid data passes through.

**Why it happens:** Spec allows `Result<T> | Promise<Result<T>>` [CITED: github.com/standard-schema/standard-schema]. Some libraries (most Zod schemas) are sync; but if any field uses `.refine(async ...)` it becomes async. Mixing modes in one schema is allowed.

**How to avoid:** Always wrap with `Promise.resolve(out)` and `.then(...)` (or `await` the result). Per D-06, all four slots run under `Promise.all` already, which forces this anyway.

### Pitfall E: PathSegment vs PropertyKey discrimination in path renderer

**What goes wrong:** Renderer assumes `path` is always `PropertyKey[]` and crashes/mis-renders when entry is a `PathSegment` object `{ key: 0 }`. Or vice versa — assumes always object form and treats string `'name'` as `Object` with `.key === undefined`.

**Why it happens:** Spec is `ReadonlyArray<PropertyKey | PathSegment>` — *both shapes* legal in the same array.

**How to avoid:** Renderer code in Pattern 3 above: `(typeof seg === 'object' && seg !== null && 'key' in seg) ? seg.key : seg`. Test fixture must include both shapes.

### Pitfall F: Validated value mutation breaks reruns

**What goes wrong:** D-10 says "validated value replaces raw input." Implementer writes `req.body = validated.value`. Now downstream middleware that reads `req.body` sees the validated/coerced version (sometimes desirable, sometimes not). More importantly: under HMR or repeated test runs, mutation is observable across requests if the same `req` shape is reused (it isn't in production, but test fixtures sometimes reuse).

**Why it happens:** Easiest implementation = mutation.

**How to avoid:** Build a fresh `args` object; pass to handler; do NOT mutate `req.params|query|body|headers`.

### Pitfall G: BootOptions silent no-op of `middlewares` / `interceptors` etc. compiles but confuses

**What goes wrong:** D-03 says BootOptions types every API-03 key today and silently no-ops keys Phase 2 doesn't own. User passes `middlewares: [AuthMW]` thinking Phase 3 features work; they don't, no warning, debug session ensues.

**Why it happens:** D-03 chose forward compatibility over loud failure.

**How to avoid:** Ship a *one-line console.warn* the first time an unimplemented key is observed at boot, gated by `process.env.NODE_ENV !== 'production'`. Or document loudly. The planner should weigh: D-03 is locked, but a dev-mode warning is consistent with it.

## Code Examples (Verified API Surface)

### Express 5 native async error forwarding (no try/catch needed)

```js
// CITED: expressjs.com/2024/10/15/v5-release.html, expressjs.com/en/guide/error-handling.html
app.get('/user/:id', async (req, res) => {
  const user = await getUserById(req.params.id);  // throws → next(err) auto
  res.send(user);
});

// Four-arg error middleware (signature unchanged from v4)
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);          // delegate to default → close socket
  res.status(500).send({ error: err.message });
});
```

### path-to-regexp v8 — valid syntax

```js
// CITED: github.com/pillarjs/path-to-regexp (v8.4.2)
'/users/:id'                  // OK (named param)
'/users/:id/posts/:postId'    // OK (multiple named)
'/files/*splat'               // OK (NAMED wildcard, one or more segments)
'/files{/*splat}'             // OK (zero or more — splat optional)
'/users{/:id}'                // OK (optional segment)
'/files/:file{.:ext}'         // OK (optional sub-segment for .ext)

// All of these THROW SYNCHRONOUSLY at router registration:
'*'             // bare wildcard — "Missing parameter name at position 1"
'/users/:id?'   // ? not supported
'/users/:id(\\d+)'  // inline regex removed
'/(.*)'         // unnamed regex group — reserved character
```

### Standard Schema — exact validate signature

```ts
// CITED: github.com/standard-schema/standard-schema (spec 1.1.0)
interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown)
      => Result<Output> | Promise<Result<Output>>;
    readonly types?: { input: Input; output: Output };
  };
}
type Result<O> = SuccessResult<O> | FailureResult;
interface SuccessResult<O> { readonly value: O; readonly issues?: undefined; }
interface FailureResult   { readonly issues: ReadonlyArray<Issue>; readonly value?: undefined; }
interface Issue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | PathSegment>;
}
interface PathSegment { readonly key: PropertyKey; }
```

### Stream + Express response — pipe with error forwarding

```ts
// CITED: nodejs.org/api/stream.html#readablefromiterable-options
import { Readable } from 'node:stream';

// Async generator → stream → response
async function* gen() { yield 'a'; yield 'b'; }
const stream = Readable.from(gen());
stream.on('error', next);                  // forward to error middleware
stream.pipe(res);                          // backpressure-aware
// res.end() is called automatically when source ends (pipe default)
```

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | Vitest 3.1+ (already configured per Phase 1) |
| Config file | `vitest.config.ts` (existing — uses `unplugin-swc` for legacy decorator metadata emit) |
| Quick run command | `pnpm test` (Vitest run mode) |
| Full suite command | `pnpm test && pnpm typecheck` |
| HTTP test helper (recommended new devDep) | `supertest@^7` — covers end-to-end HTTP requests against an in-memory app |

### Phase Requirements → Test Map

| REQ ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| BUILD-03 | `express ^5.1.0` peer accepted; works on 5.1.x and 5.2.x | unit (CI matrix) | `pnpm test` (deferred to Phase 5 CI matrix) | ❌ Wave 0 |
| ROUTE-04 | v4 patterns throw with controller.method + suggestion | unit | `vitest run tests/adapter/router-build.test.ts -t "v4 pattern"` | ❌ Wave 0 |
| ROUTE-05 | One Router per controller; `routePrefix`; inheritance | integration (supertest) | `vitest run tests/adapter/routing.test.ts` | ❌ Wave 0 |
| INPUT-01 | Destructured `{params, query, body, headers, req, res, next}` | integration (supertest) | `vitest run tests/adapter/input-binding.test.ts` | ❌ Wave 0 |
| INPUT-02 | Zod, Valibot, ArkType all work via Standard Schema | integration | `vitest run tests/adapter/standard-schema.test.ts` | ❌ Wave 0 |
| INPUT-03 | Validation failure → BadRequestError with `errors[]` | integration | `vitest run tests/adapter/validation-errors.test.ts` | ❌ Wave 0 |
| ERR-03 | Async throw → error middleware exactly once | integration | `vitest run tests/adapter/async-error.test.ts` | ❌ Wave 0 |
| ERR-05 | `err.source` = `Controller.method` | unit | `vitest run tests/adapter/error-source.test.ts` | ❌ Wave 0 |
| RES-08 | Streams piped; async iterables piped; null→204 | integration | `vitest run tests/adapter/response-writing.test.ts` | ❌ Wave 0 |
| API-01 | `useExpressControllers(app, opts)` mounts on existing app | integration | `vitest run tests/adapter/boot.test.ts -t useExpressControllers` | ❌ Wave 0 |
| API-02 | `createExpressServer(opts)` returns ready Express app | integration | `vitest run tests/adapter/boot.test.ts -t createExpressServer` | ❌ Wave 0 |
| API-03 | All BootOptions keys typed; unimplemented silently no-op | unit (type test + runtime) | `vitest run tests/adapter/boot-options.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm test --run tests/adapter/<file>.test.ts`
- **Per wave merge:** `pnpm test && pnpm typecheck`
- **Phase gate:** Full suite green; v4-pattern, async-error-once, stream-error, and Standard Schema (Zod+Valibot+ArkType) integration tests all green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/adapter/` directory + per-feature test files (12 listed above)
- [ ] `tests/fixtures/controllers/` — sample controllers for routing/inheritance tests
- [ ] `tests/fixtures/schemas/` — Zod/Valibot/ArkType examples for INPUT-02
- [ ] devDep install: `pnpm add -D supertest @types/supertest zod valibot arktype`
- [ ] Existing test infra (`unplugin-swc`, vitest config) is sufficient — no framework changes

## User Constraints (from CONTEXT.md)

### Locked Decisions

D-01..D-18 from `02-CONTEXT.md` — research has verified each against upstream sources:

- **D-01 (single impl, both exports):** Compatible with Express's design — `express()` returns a function-with-app shape, can be passed back into `useExpressControllers`. ✓
- **D-02 (asymmetric body parsing):** v5 ships `express.json()` / `express.urlencoded()` built-in. ✓ [CITED: PITFALLS.md #7]
- **D-03 (BootOptions types every key, silent no-op):** No upstream constraint. Research note: consider dev-mode warning (Pitfall G).
- **D-04 (path composition):** Standard pattern; no upstream contradiction. ✓
- **D-05 (v4-pattern detector at mount time):** Necessary, NOT redundant — p2re v8 throws but with terse messages. ✓ [CITED: pillarjs/path-to-regexp]
- **D-06 (Promise.all over 4 slots):** Standard Schema spec allows mixed sync/async. `Promise.all` flattens. ✓ [CITED: standardschema.dev]
- **D-07 (aggregate every issue):** No upstream constraint; UX call. ✓
- **D-08 (error JSON shape):** ⚠️ See "Conflicts / structural notes" below — `BadRequestError.details` type widening required.
- **D-09 (dotted+bracketed paths):** Renderer code provided in Pattern 3. ✓
- **D-10 (validated value replaces raw):** Standard pattern; do NOT mutate req. ✓
- **D-11 (JsonController vs Controller):** Express `res.json()` / `res.send()` are the right primitives. ✓
- **D-12 (.pipe before asyncIterator):** Confirmed correct order — Node streams are also iterable; checking iterator first would lose `.pipe`. ✓
- **D-13 (null/undefined → 204):** Standard HTTP semantics; matches routing-controllers. ✓
- **D-14 (`res.headersSent` guard):** Express docs explicitly recommend this. ✓ [CITED: expressjs.com/en/guide/error-handling.html]
- **D-15 (lib middleware after routers, single):** Express convention. ✓
- **D-16 (per-handler async wrapper attaches source):** Compatible with v5 native forwarding — wrapper is async, throws/rejects propagate. ✓
- **D-17 (`defaultErrorHandler: boolean`):** No upstream constraint. ✓
- **D-18 (HttpError.toJSON + dev disclosure):** Compatible with Phase 1 contract. ✓

### Claude's Discretion

Research-informed answers to the discretion items in CONTEXT.md:

- **Single-implementation factoring:** `createExpressServer` calls `useExpressControllers`. Body parsing inside `createExpressServer` only. Single `BootOptions` interface (don't split — D-03 is forward-compatible single shape). ✓ Pattern in §"Pattern 1".
- **Per-Router options (`caseSensitive`/`strict`/`mergeParams`):** Express defaults are `{ caseSensitive: false, strict: false, mergeParams: false }` [CITED: expressjs Router docs]. **Recommendation:** Defer until Phase 4+ unless a v1 use case forces it. Phase 2 uses defaults. Don't expose; can add via boot options later non-breaking.
- **Controller mount order:** Order = order in `options.controllers` array. Phase 1's MetadataBuilder walk is deterministic; mount in array order. Document the rule in JSDoc on `useExpressControllers`.
- **IocAdapter integration:** `getContainer().get(ControllerClass)` per call (NOT cached separately by Phase 2 — Phase 1's DefaultContainer already WeakMap-caches). `await` the result (IocAdapter.get returns `T | Promise<T>`). ✓
- **Standard Schema runtime probe:** See `isStandardSchema()` in Pattern 3 — `'~standard' in obj && typeof obj['~standard'].validate === 'function'`. Test fixture should include "schema-shaped imposter" (object with `~standard` but no `validate` function) → treat as no-schema, pass raw.
- **`validation` boot option semantics:** Spec doesn't constrain; no current use case. **Recommendation:** Type it as `validation?: { /* reserved */ }` and document "reserved for future overrides; ignored in v1". No-op in Phase 2.
- **v4-pattern detector location:** `src/adapter/router-build.ts` (private helper). Not exported.

### Deferred Ideas (OUT OF SCOPE)

Per CONTEXT.md `<deferred>`:
- `@Middleware({ type: 'after' })` user error handler — Phase 3
- Function-form / object-form `defaultErrorHandler` — Phase 3 (D-17 boolean only)
- Per-Router options surface — likely v1.x
- Auto-injection by paramtypes — deferred from Phase 1
- Glob loading of controllers — Phase 4
- `printRoutes: true` table — Phase 4
- Lazy-loaded `cors` — Phase 4
- AsyncLocalStorage `getRequestContext()` — Phase 4

## Phase Requirements

| ID | Description | Research Support |
|---|---|---|
| BUILD-03 | `express ^5.1.0` peer; works on 5.1.x and 5.2.x | Verified `latest` is 5.2.1 [npm view]; v5 native async + path-to-regexp v8 are stable across both [CITED: expressjs releases]. Peer range `^5.1.0` covers both. |
| ROUTE-04 | v4 patterns throw at registration with controller.method + fix | D-05 detector logic; p2re v8 reserves `()[]?+!`, requires named wildcards [CITED: pillarjs/path-to-regexp] |
| ROUTE-05 | One Router per controller; multi; inheritance; `routePrefix` | Phase 1 metadata builder already handles inheritance (subclass-wins, D-06 from Phase 1); Express Router supports nesting via `app.use(prefix, router)` |
| INPUT-01 | Destructured `{params, query, body, headers, req, res, next}` | Pattern 3 + 4 above; INPUT-01's "cookies" slot is Phase 4, not Phase 2 |
| INPUT-02 | Zod / Valibot / ArkType via Standard Schema | All three implement `~standard` natively [CITED: standardschema.dev maintainers list] |
| INPUT-03 | Failure → typed `BadRequestError` with field-level details | Phase 1 `BadRequestError({ details, source })` constructor exists; D-07/D-08 shape |
| ERR-03 | Single error middleware; native v5 propagation; no try/catch wrappers | Pattern 2 + 5; v5 auto-`next(err)` [CITED: expressjs error-handling guide] |
| ERR-05 | Errors include `source` field | D-16 wrapper attaches `'Controller.method'`; Phase 1 `HttpError`/`BadRequestError` already have `source?: string` slot |
| RES-08 | Streams + async iterables piped to response | D-12 detection order; `Readable.from(asyncIterable).pipe(res)` [CITED: nodejs.org/api/stream] |
| API-01 | `useExpressControllers(app, options)` mounts on existing app | Pattern 1 |
| API-02 | `createExpressServer(options)` returns configured Express app | Pattern 1; D-02 body-parsing |
| API-03 | All boot option keys typed; unimplemented silently no-op | D-03; recommend dev-mode warning per Pitfall G |

## Conflicts / Structural Notes (Planner must reconcile)

### VAL-DETAILS-SHAPE — Phase 1's `ValidationIssue` is too narrow for D-08

Phase 1 shipped (`src/errors/http-error.ts:5-8`):
```ts
export interface ValidationIssue {
  path: ReadonlyArray<PropertyKey>;
  message: string;
}
```

D-08 requires `details: [{ slot, path, message }]` where `slot ∈ 'params' | 'query' | 'body' | 'headers'` and `path` is the *rendered string* (`items[0].name`), not a `ReadonlyArray<PropertyKey>`.

**Three reconciliation options for the planner:**
1. **Widen `ValidationIssue` in Phase 1's `http-error.ts`** to `{ slot?: 'params'|'query'|'body'|'headers'; path: string | ReadonlyArray<PropertyKey>; message: string }`. Backward-compatible (`path` accepts both shapes; `slot` optional). Phase 2 always emits the new shape.
2. **Add a new Phase-2 type** `ValidationErrorDetail` and pass via `BadRequestError({ details: ValidationErrorDetail[] as any })` — pragmatic but loses Phase 1's type safety.
3. **Keep Phase 1 narrow; Phase 2 builds JSON shape inside the error middleware** by reading `details` (still `ReadonlyArray<PropertyKey>`-typed) plus a parallel `slot` array. Awkward.

**Recommendation:** Option 1. `ValidationIssue` was explicitly designed in Phase 1 D-04 as a Phase-2-extensible contract (per CONTEXT.md `code_context` block: "BadRequestError carries details: ValidationIssue[] and source: string as optional fields — contract pre-committed for Phase 2 to populate at validation time without a breaking change"). Pre-render path to string in Phase 2 (or store both raw + rendered) and add `slot`. Both are additive widenings.

This is the **only structural change Phase 2 forces on Phase 1's outputs**, and it was anticipated. Planner should make it Wave 0 / Wave 1 work in `src/errors/http-error.ts` and update the test in `tests/errors/`.

### BootOptions silent no-op — UX trade-off (Pitfall G)

D-03 locks "silent no-op." Research recommends a *dev-mode console.warn* on first observed unimplemented key. This is *consistent* with D-03 (no error, no production noise) but improves debuggability. Planner discretion — flagging here so it's a conscious choice, not an oversight.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| `try/catch` + `next(err)` shim around every handler | `await` inside handler; v5 auto-forwards rejections | Express 5.0 (Oct 2024) | Phase 2 wrapper exists ONLY to attach `err.source`, not to catch errors that v5 would otherwise miss |
| `body-parser` package | `express.json()` / `express.urlencoded()` built-in | Express 4.16 (built-in); v5 confirmed canonical | No `body-parser` dep needed (D-02) |
| `path-to-regexp` v6 with `*`, `:id?`, `:id(regex)` | v8 with `*splat`, `{/:id}`, schema-validated `id` | path-to-regexp 8 / Express 5 | D-05 detector translates user error messages |
| Per-validator adapter (zod/valibot/yup) | `~standard.validate()` once | Standard Schema 1.0 (2024-12) | One code path covers Zod v4, Valibot v1, ArkType v2, and any future spec-compliant validator |

**Deprecated/outdated guidance (do not follow):**
- "Wrap every handler in `expressAsyncHandler` or `.catch(next)`" — obsolete under v5; causes double-fire (Pitfall A)
- "Install `body-parser`" — built into v5
- "Use `req.param('name')`" — removed in v5; use `req.params.name` etc. [CITED: PITFALLS.md #7]
- "Use `:id?` for optional params" — v8 throws; use `{/:id}` [CITED: pillarjs/path-to-regexp]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | `supertest@^7` is the right HTTP-testing devDep for Phase 2 fixtures | Validation Architecture | Low — alternatives exist (undici fetch + http.createServer); cosmetic |
| A2 | Dev-mode warning for unused BootOptions keys is *consistent* with D-03 (locked: silent no-op) | Pitfall G | Medium — D-03 says "without warnings or errors at boot." A warn() arguably violates "without warnings." Planner must decide. |
| A3 | Widening `ValidationIssue` to add `slot` and string-form `path` is backward-compatible enough not to be a Phase 1 break | VAL-DETAILS-SHAPE | Low — additive; existing fields preserved. |
| A4 | Express 5's "automatic `next(err)` for async" works the same in 5.1 and 5.2.x | Pattern 2 | Low — verified in expressjs.com docs which cover the v5 line; no patch-version asterisks |

All other claims in this document are tagged inline with `[CITED: ...]` (official source) or `[VERIFIED: ...]` (tool output) — no other unverified assumptions.

## Open Questions

1. **`validation` BootOption shape** — what is it for, beyond a future override? CONTEXT.md says "reserved for future overrides; initial implementation: accept and ignore."
   - What we know: typed in BootOptions (D-03), no-op in Phase 2.
   - What's unclear: is `validation: false` meant to disable validation globally? Or is it a hook like `{ validate: (schema, value) => ... }` for users who want a non-Standard-Schema escape hatch?
   - Recommendation: type as `validation?: unknown` (or `validation?: never` to reserve) and document "reserved." Don't paint into a corner.

2. **`.pipe(res)` vs `pipeline(value, res, callback)`** — D-12 picks `.pipe`. Is there a v1 use case where stream cleanup automation matters more than wrapper-based error attribution?
   - What we know: `.pipe + .on('error', next)` is canonical and matches D-14.
   - What's unclear: long-running SSE streams (V1X-01) might benefit from `pipeline` for guaranteed cleanup on client disconnect. Phase 2 doesn't ship SSE; planner can defer.
   - Recommendation: `.pipe` for Phase 2 per D-12. Re-evaluate at SSE time.

3. **Aggregating issues from a fully-async slot when other slots fail synchronously** — `Promise.all` waits for all. If body schema is async (1s) and params schema is sync-fails-instantly, user waits 1s for the response. Acceptable?
   - What we know: D-06 chooses Promise.all for simplicity.
   - What's unclear: real-world async schemas are rare; ~no users write async refines on fast routes.
   - Recommendation: ship Promise.all per D-06. If a perf complaint surfaces post-v1, can add a "fail-fast on first sync issue" optimization later.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js | Runtime | ✓ | ≥20 (peer engines floor) | — |
| Express 5 | Adapter (peer dep) | ✓ (will install in tests) | ^5.1.0 (5.2.1 available) | — |
| `path-to-regexp` v8 | Path validation (transitive of Express 5) | ✓ | 8.4.2 transitive | — |
| `@standard-schema/spec` | Validation contract | ✓ already installed | 1.1.0 | — |
| `supertest` | HTTP integration tests (Wave 0 install) | ✗ | — | undici fetch + http.createServer (heavier) |
| Zod / Valibot / ArkType | INPUT-02 conformance tests | ✗ | — | install as devDeps in Wave 0 |

**Missing dependencies with no fallback:** none — all blockers resolvable via `pnpm add` in Wave 0.

## Sources

### Primary (HIGH confidence)
- [Express v5 release announcement (Oct 2024)](https://expressjs.com/2024/10/15/v5-release.html) — native async error propagation, body-parser built-in
- [Express error handling guide](https://expressjs.com/en/guide/error-handling.html) — exact four-arg signature, `res.headersSent` guard pattern
- [Migrating to Express 5](https://expressjs.com/en/guide/migrating-5.html) — removed APIs, path-to-regexp v8 changes
- [path-to-regexp v8 README + jsdocs.io](https://github.com/pillarjs/path-to-regexp) — v8.4.2 syntax rules, reserved characters, sync parse
- [Standard Schema spec repo](https://github.com/standard-schema/standard-schema) — exact `Result<T> | Promise<Result<T>>` validate signature, `Issue.path: ReadonlyArray<PropertyKey | PathSegment>`
- [Standard Schema docs site](https://standardschema.dev/schema) — sync/async semantics, library conformance
- [Node.js stream docs](https://nodejs.org/api/stream.html) — `Readable.from()` async iterable wrapper, pipe semantics
- npm registry verification (2026-05-09): `express@5.2.1`, `path-to-regexp@8.4.2`, `@standard-schema/spec@1.1.0`

### Secondary (MEDIUM confidence)
- [Express v5 wildcard issue #6606](https://github.com/expressjs/express/issues/6606) — confirms p2re v8 strictness
- [DEV: Express v5 path errors guide](https://dev.to/aryanneupane/express-v5-error-missing-parameter-name-at-position-1-caused-by-in-routes-50d4) — community confirmation of the four v4 footguns

### Tertiary (LOW confidence)
- None used for any LOCKED decision; all CONTEXT.md decisions backed by primary sources above.

## Metadata

**Confidence breakdown:**
- Express v5 async-error semantics: HIGH — official docs explicit on auto-`next(err)` and `headersSent` guard
- path-to-regexp v8 syntax + error surface: HIGH — README + jsdocs.io v8.4.2 confirm sync parse and reserved-char list
- Standard Schema validate signature: HIGH — interface read directly from standard-schema repo
- Stream/async-iterable in v5: HIGH — Node docs explicit on `Readable.from` + `.pipe` semantics
- Body parser policy: HIGH — built into v5; PITFALLS.md #7 corroborates
- Router options & defaults: MEDIUM — defaults `{caseSensitive:false, strict:false, mergeParams:false}` confirmed; expose-vs-not is a UX call
- Pitfalls extension: HIGH — extends existing PITFALLS.md, no contradictions

**Research date:** 2026-05-09
**Valid until:** ~2026-06-09 (30 days; Express v5 line is stable; path-to-regexp v8 is settled; Standard Schema 1.x is stable)
