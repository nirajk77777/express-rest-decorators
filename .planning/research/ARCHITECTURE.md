# Architecture Research

**Domain:** Decorator-based REST controller library (Express v5 + TC39 Stage 3 decorators)
**Researched:** 2026-05-07
**Confidence:** HIGH (routing-controllers internals read directly from source; TC39 / Standard Schema verified against multiple current sources)

---

## 1. Standard Architecture (lessons from routing-controllers internals)

routing-controllers v0.11.x is built around a clean three-layer separation: **decorator layer → metadata layer → driver/runtime layer**. That separation is the right starting point and should be preserved. Only the *implementations* of each layer need modernizing.

### 1.1 Layered system overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                       PUBLIC DECORATOR LAYER                         │
│  @Controller / @Get / @Post / @Body / @QueryParam / @UseBefore /     │
│  @UseAfter / @Authorized / @CurrentUser / @OnUndefined / @HttpCode    │
│  Each decorator is a thin function that pushes a record into the     │
│  global MetadataArgsStorage singleton.                                │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ push(args)
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        METADATA LAYER                                 │
│  MetadataArgsStorage  (raw, flat arrays per decorator kind)           │
│         │                                                             │
│         ▼  build()                                                    │
│  MetadataBuilder → ControllerMetadata, ActionMetadata,                │
│                    ParamMetadata, UseMetadata, InterceptorMetadata,   │
│                    ResponseHandlerMetadata                            │
│  (Builder cross-references the flat args arrays into a               │
│   tree: Controller → Actions → Params + Uses + Interceptors.)         │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ tree of *Metadata instances
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    RUNTIME / DRIVER LAYER                             │
│  RoutingControllers<T extends BaseDriver>                             │
│   │   - executeAction(): orchestrates pipeline                        │
│   │   - parameterHandler: ActionParameterHandler (resolve + transform │
│   │                        + validate per param)                      │
│   │   - prepareInterceptors(): map metadata → fn[]                    │
│   ▼                                                                   │
│  BaseDriver  ◄── ExpressDriver / KoaDriver                            │
│   - registerAction(meta, executeCallback)                             │
│   - registerMiddleware(meta, opts)                                    │
│   - getParamFromRequest(action, param)  (driver-specific param read)  │
│   - handleSuccess(result, meta, action) (response writer)             │
│   - handleError(err, meta, action)      (error writer)                │
└──────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                       Express app/router
```

### 1.2 Component responsibilities

| Component | Responsibility | Source-of-truth file |
|-----------|----------------|----------------------|
| Decorator functions | Pure registrars: side-effect = push args into global storage. Zero logic. | `src/decorator/*.ts` |
| `MetadataArgsStorage` | Flat-arrays-per-kind global singleton, plus filter helpers (`filterParamsWithTargetAndMethod`, `filterActionsWithTarget`, etc). | `src/metadata-builder/MetadataArgsStorage.ts` |
| `MetadataBuilder` | One-shot transformer: walks classes, joins flat args into a typed tree of `*Metadata` objects with all inheritance and option-merging resolved. | `src/metadata-builder/MetadataBuilder.ts` |
| `*Metadata` classes | Resolved, normalized view of decorator output (full route, http code defaults, param order, header map, etc). The shape that the driver consumes. | `src/metadata/*.ts` |
| `RoutingControllers` | Pipeline orchestrator: param resolution → method invocation → interceptor chain → driver write. Driver-agnostic. | `src/RoutingControllers.ts` |
| `ActionParameterHandler` | Per-param: read raw value (via driver) → normalize primitive → JSON parse → class-transform → class-validate. **Currently hard-couples class-transformer + class-validator.** | `src/ActionParameterHandler.ts` |
| `BaseDriver` / `ExpressDriver` | Framework adapter: route registration, body-parser/multer wiring, raw param extraction (`req.body`, `req.params`, etc.), response shaping (status, headers, JSON/buffer/stream), default error handling. | `src/driver/express/ExpressDriver.ts` |
| `container.ts` (`useContainer` / `getFromContainer`) | DI hook: optional user-supplied `IocAdapter` with a fallback in-memory map keyed by class. Resolved per controller-instance and per middleware/interceptor instance. | `src/container.ts` |

### 1.3 Request lifecycle (end-to-end trace)

This is the live data flow inside routing-controllers. Our successor should preserve the *shape* of this pipeline; the boxes marked **MODERNIZE** are where Express v5 and Stage 3 let us simplify.

```
HTTP request hits Express
  │
  ▼
[express] → routeGuard (no-op-if-already-started flag)         ◄── DROP (Express 5 fixes the GET/HEAD double-fire issue cleanly with router; keep only if a real test reproduces double-dispatch)
  ▼
[express] → before-middlewares (UseBefore, controller-level uses, global)
  ▼
[express] → defaultMiddlewares (body-parser.json/text, multer, authChecker)
  ▼
[express] → routeHandler  (calls executeCallback({req,res,next}))
  │
  ▼
RoutingControllers.executeAction(actionMeta, action)
  │
  ├─► For each ParamMetadata, sorted by index:
  │      ActionParameterHandler.handle(action, param)
  │        ├─ driver.getParamFromRequest(action, param)        // req.body / req.params[name] / req.query / etc.
  │        ├─ normalizeParamValue: primitive coercion (number/boolean/date), JSON.parse
  │        ├─ transformValue: class-transformer plainToInstance ◄── MODERNIZE: replace with pluggable validator adapter
  │        ├─ validateValue:  class-validator validateOrReject  ◄── MODERNIZE: replace with pluggable validator adapter (Standard Schema)
  │        └─ required-check (throw ParamRequiredError)
  │
  ├─► Promise.all(params) → call controllerInstance[method](...params)
  │     - controllerInstance via container.getFromContainer(target, action)  ◄── MODERNIZE: keep useContainer adapter; default = naive new
  │
  ├─► If method returned a promise → resolve recursively
  │
  ├─► Run interceptor chain in sequence (runInSequence)
  │     each interceptor: (action, result) => newResult
  │
  ├─► driver.handleSuccess(result, actionMeta, action)
  │     - applies @HttpCode / @OnUndefined / @OnNull / @Header / @ContentType /
  │       @Location / @Redirect / @Render
  │     - branches on Buffer / Uint8Array / stream (.pipe) / json / send
  │
  └─► On any thrown/rejected error → driver.handleError(error, actionMeta, action)
        - sets status from error.httpCode || 500
        - writes processJsonError or processTextError
        - calls next(error)                                   ◄── MODERNIZE: with Express 5's auto-promise-forwarding, the
                                                                  outer try/catch + manual next(err) wrappers can be
                                                                  removed; just `throw` and let Express route to error mw.
```

### 1.4 What's good and worth preserving

1. **Two-pass metadata model** (raw args storage → built tree). The flat-args storage is intentionally dumb because decorators run in unpredictable order across files; only at `registerControllers()` time do we have all classes available. **Keep this pattern.**
2. **Driver abstraction.** Even though we're dropping Koa, keeping `BaseDriver`/`ExpressDriver` as separate concepts is still valuable: it isolates Express types from the core, lets the core be unit-tested without HTTP, and leaves the door open for a Fastify/uWS adapter later (without committing to one).
3. **Param pipeline = read → normalize → transform → validate → required-check.** This four-stage pipeline is correct; only the transform+validate stages need to be made pluggable.
4. **Interceptor chain runs after method, before write.** Cleanly separates response-shape mutation from route logic.
5. **Per-action default middleware injection** (body-parser, multer, auth) — driver decides what Express middleware a given decorator combination requires. **Keep.**

### 1.5 Koa-coupling points to excise

Identified in source:

| Location | Coupling | Action |
|----------|----------|--------|
| `src/driver/koa/` (entire dir) | KoaDriver, KoaMiddlewareInterface, etc. | **Delete.** |
| `src/driver/BaseDriver.ts` | Has methods both drivers share (`useClassTransformer`, `processJsonError`, etc.) plus abstract methods both implement. | **Keep, but rename to `ExpressAdapter` or similar — no longer needs to be "base" since there's only one impl. Optionally keep an `Adapter` interface so a future Fastify package can satisfy it.** |
| `src/decorator/Ctx.ts`, `State.ts`, `SessionParam.ts` (partial) | `@Ctx` is Koa-specific; `@State` throws at runtime in ExpressDriver; `Session` semantics differ. | **Drop `@Ctx` and `@State` entirely. Keep `@Session` / `@SessionParam` (works fine in Express via `express-session`).** |
| `index.ts` re-exports for Koa types | `KoaMiddlewareInterface`, etc. | **Delete from barrel.** |
| `package.json` peerDeps and `loadKoa()` dynamic require in driver | — | **Delete.** |
| `RoutingControllersOptions.controllers` shape works for both — fine | — | Keep. |

### 1.6 Legacy patterns worth modernizing (beyond Koa removal)

1. **`reflect-metadata` dependency for `design:type`.** `ActionParameterHandler.normalizeParamValue` calls `(Reflect as any).getMetadata('design:type', ...)` to figure out whether a param should be coerced to `Number` / `Boolean` / etc. Stage 3 decorators don't emit `design:type`, and `emitDecoratorMetadata` is a legacy-only flag. **Replacement strategy:** drive type info from the validator adapter (the schema knows the type) rather than from TS-emitted metadata. For the trivial `@QueryParam('id') id: number` case where no schema is provided, document that explicit coercion via `{ type: Number }` option is required, OR accept a string and let downstream code coerce.
2. **Global mutable singleton `MetadataArgsStorage`.** Fine for app code, but causes test pollution and prevents multiple isolated apps in one process. **Improvement:** keep the singleton as the default registration target (decorators have no other way), but make `RoutingControllers` snapshot+freeze its view on `registerControllers()` and expose a `resetMetadataStorage()` for tests. Stage 3 `Symbol.metadata` per-class storage gives us a partial path away from the global, but inheritance + cross-class lookups (e.g. "all params for this action") still need a central index — pragmatic answer is **keep the global, document it**.
3. **Per-action try/catch + manual `next(err)`.** Express 5 forwards rejected promises automatically. The `routeHandler` becomes a one-liner: `async (req,res,next) => res.locals._result = await execute({req,res,next})` — no `.catch(driver.handleError)` wrapper needed. Custom error formatting becomes a normal Express error-handling middleware that the library auto-registers.
4. **`routingControllersStarted` route guard.** Was a workaround for Express 4 quirks (HEAD auto-firing GET, regex overlap double-dispatch). Validate against Express 5; if reproducible only in pathological setups, drop. Otherwise reimplement minimally.
5. **`appendBaseRoute` regex munging.** Express 5 router supports nested `Router` instances cleanly; controller base routes should map to `app.use(baseRoute, controllerRouter)` rather than string-concatenation. **Modernize: one `express.Router()` per controller.**
6. **`class-transformer` + `class-validator` hard-wired.** Replace with **Standard Schema** adapter (see §3).
7. **Cookie / template-url `require()` calls.** Express 5 + modern `cookie` package can be `import`ed at the top; lazy-load only the optional ones (multer, body-parser is now built into Express 5 via `express.json()` / `express.text()` — drop `body-parser` peer dep entirely).

---

## 2. TC39 Stage 3 decorators — the parameter-decorator problem

This is the single biggest architectural fork from the original.

### 2.1 The constraint

TC39 Stage 3 decorators (TS 5.0+) support `class | method | getter | setter | accessor | field` decorators. **Parameter decorators are NOT in Stage 3.** They live in a separate proposal (`proposal-class-method-parameter-decorators`) which has not advanced. ([proposal-class-method-parameter-decorators](https://github.com/tc39/proposal-class-method-parameter-decorators))

This breaks `@Body() body`, `@QueryParam('id') id`, `@Param('userId') userId` directly — these are precisely parameter decorators in the legacy emit.

### 2.2 The four real options

**Option A — Method-decorator with positional encoding.**
```ts
@Get('/:id')
@Params({ id: '@param.id' })          // method decorator
@Query({ verbose: '@query.verbose' })  // method decorator
async getOne(id: string, verbose?: string) { ... }
```
Decorators stack on the method, encoding "argument N comes from X". Order is fragile (positional). ❌ Worse DX than the original.

**Option B — Single object-arg method decorator + destructuring.**
```ts
@Get('/:id')
async getOne(@Input() input: { params: { id: string }, query: { verbose?: string }, body: never }) { ... }
```
Still needs a parameter decorator.

**Option C — Single object argument from a method-level `@Route` decorator.**
```ts
@Route.Get('/:id', {
  params: z.object({ id: z.string() }),
  query:  z.object({ verbose: z.boolean().optional() }),
})
async getOne({ params, query }: InferRoute<typeof this.getOne>) {
  return { id: params.id };
}
```
**One decorator per method**, all input shape declared at the decorator (Stage 3 compliant). Validation happens via Standard Schema on each declared key. The handler signature is a single destructured object. **This is the pattern hono+zod-openapi, ts-rest, oRPC, and ts-api-kit all use.** ([Hono OpenAPI](https://hono.dev/examples/hono-openapi), [@ts-api-kit/core](https://jsr.io/@ts-api-kit/core)) — meaning the ecosystem has converged here. ✅

**Option D — Stay on legacy `experimentalDecorators`.** Out of scope per PROJECT.md.

### 2.3 Recommendation: **Option C with optional Option-A escape hatch.**

- **Primary API:** method-level `@Get` / `@Post` / `@Put` / `@Patch` / `@Delete` accept a second options arg `{ params, query, body, headers, response }` whose values are Standard-Schema-compliant schemas (or undefined for "no validation, raw value"). The handler receives a single typed `{ params, query, body, headers, req, res }` object.
- **Escape hatch (later phase):** also support a `@Req() / @Res() / @Next()` style via the *class-method-parameter-decorators* proposal once TS implements it (still Stage 1/2 today). For v1, expose `req`/`res` as fields on the destructured input.
- **Inheritance:** class decorators (`@Controller('/users')`) and method decorators are both Stage 3 — keep these unchanged in spirit.
- **DI for controller dependencies:** moves from constructor-parameter decorators (`constructor(@Inject(Foo) foo)` — not available in Stage 3) to constructor injection via the class decorator + container metadata, OR to `accessor` field decorators (`@Inject() accessor foo: Foo`). See §4.

### 2.4 Metadata storage with Stage 3

Stage 3 gives us `context.metadata` per decoration, accessible later as `Class[Symbol.metadata]`. ([proposal-decorator-metadata](https://github.com/tc39/proposal-decorator-metadata), TS 5.2 release notes)

**Design:** keep a global `MetadataArgsStorage`-style index (because cross-class lookups during `registerControllers()` are simpler against a single store) **AND** mirror the per-method record into `context.metadata[METHOD_NAME]` so consumers (OpenAPI generators, tests) can introspect a single class without going through the global. The global is the source of truth for the registration pass; `Symbol.metadata` is the introspection convenience layer.

`reflect-metadata` is **not required** and should be a non-dependency. Type info that the original library got from `design:type` comes from the schema instead.

---

## 3. Validation adapter design

### 3.1 The right abstraction: Standard Schema

[Standard Schema](https://standardschema.dev/schema) is a ~60-line TypeScript interface co-authored by the Zod, Valibot, and ArkType maintainers. Any schema with a `~standard` property satisfies it. ([Standard Schema Explained](https://blog.openreplay.com/standard-schema-explained-flexible-validation/))

```ts
// What Standard Schema gives us — paraphrased
interface StandardSchemaV1<Input = unknown, Output = Input> {
  '~standard': {
    version: 1;
    vendor: string;
    validate: (input: unknown) =>
      | { value: Output }
      | { issues: ReadonlyArray<{ message: string; path?: PropertyKey[] }> }
      | Promise<...>;
    types?: { input: Input; output: Output };
  };
}
```

### 3.2 Adapter interface for our library

```ts
// Internal contract — accepts ANY Standard Schema, no per-library shim needed.
interface ValidationAdapter {
  // Default impl: read schema['~standard'].validate(input). Done.
  validate<S extends StandardSchemaV1>(
    schema: S,
    input: unknown,
  ): Promise<StandardSchemaV1.InferOutput<S>>;

  // Convert a Standard Schema validation issue list into our HttpError shape.
  formatError(issues: readonly StandardIssue[], context: { paramName: string; paramKind: ParamKind }): HttpError;
}
```

That's it. Zod, Valibot, ArkType, and any future StandardSchema-compliant library work with **zero adapter code**. Class-validator is the awkward exception — it's not Standard-Schema-compliant. We provide a small `@pkg/class-validator` adapter package as a convenience to ease migration from routing-controllers. ([Standard JSON Schema](https://standardschema.dev/json-schema))

### 3.3 Where validation hooks into the pipeline

Inside the `executeAction` flow (§1.3):

```
For each declared input key (params|query|body|headers) on the @Get/@Post options:
  ├─ raw = driver.read(key, action)              // req.params, req.query, etc.
  ├─ if schema present:
  │     result = await ValidationAdapter.validate(schema, raw)
  │     on issue → throw new BadRequestError(adapter.formatError(...))
  │     value = result.value                     // typed!
  ├─ else:
  │     value = raw                              // user opted out
  └─ inputObject[key] = value

Call handler with the assembled inputObject.
```

No transform step is needed — Standard Schema *is* the transform (Zod's `transform`, Valibot's `pipe(transform(...))`, ArkType's morphs all pass through `validate`).

### 3.4 What the adapter does NOT do

- **No coercion fallback.** If user wants `?id=42` to become `number`, their schema does that (`z.coerce.number()`, `v.pipe(v.string(), v.transform(Number))`, ArkType `'string.numeric.parse'`).
- **No reflect-metadata.** Type info comes from the schema, not from emitted metadata.
- **No leakage of vendor types in core.** Core depends only on the StandardSchemaV1 interface (a type-only import — zero runtime dep).

---

## 4. DI architecture — concrete recommendation

### 4.1 The four positions

| Position | Examples | Cost | Benefit |
|----------|----------|------|---------|
| Built-in container, required | NestJS | Massive: modules, providers, scope semantics, async providers. Locks users in. | Best-in-class DX for users who buy in. |
| Optional adapter (`useContainer`) | routing-controllers, TypeORM | Low. Default = `new SomeClass()`. Plug typedi/inversify/awilix if desired. | Works for everyone. |
| Constructor-injection-only via factory | InversifyJS users without framework | User wires manually. | Minimal lib code. |
| No DI at all | hono, ts-rest, oRPC, Fastify-decorators | Zero lib code. Users do `new Controller(deps)` themselves… but then they can't pass classes to `useExpressControllers([UserController])` — they must pass instances. | Library stays tiny; users not fighting an opinion. |

### 4.2 Recommendation: **Optional adapter with sensible default — `useContainer()` pattern, modernized.**

**Reasoning:**

1. routing-controllers' actual usage data: most users register controller *classes* (`controllers: [UserController]`), not instances. The library has to instantiate them somehow. Removing the container hook entirely forces every user to construct + inject manually, which is a meaningful regression.
2. The cost is small — ~50 lines (see `container.ts`). The interface is one method:
   ```ts
   interface IocAdapter {
     get<T>(target: ClassConstructor<T>, action?: Action): T;
   }
   ```
3. Standardizing on this exact interface means existing typedi / typeorm-typedi-extensions / tsyringe / awilix bridges that already work with routing-controllers continue to work.
4. The default no-DI path stays trivial: lazy `new Class()` cached in a `WeakMap` keyed by class. Users who don't call `useContainer()` see zero behavior change.
5. Stage-3-compatible field injection is *additive*: we can ship `@Inject() accessor svc: Service` later as a thin wrapper around `iocAdapter.get(Service)` without breaking the constructor-injection path.

**What we explicitly DO NOT ship:**

- A module system (NestJS-style `@Module({ providers, imports, exports })`). Out of scope; users wanting that should use NestJS.
- Decorator-based DI metadata (`@Injectable`, `@Inject(TOKEN)` at constructor parameters). Stage 3 has no parameter decorators. The IoC adapter takes a class constructor; the user's container (typedi, tsyringe, etc.) handles the actual graph resolution by class identity.
- Async providers, scopes (transient/request/singleton). Delegate to whatever container the user plugs in. Default container is request-singleton (one instance per process, reused across requests) — same as routing-controllers' default.

**Open: per-request scoping.** routing-controllers' `IocAdapter.get` receives an optional `action` parameter to support per-request resolution. Keep this — it costs nothing in core and is the only way request-scoped containers (e.g. typedi with `ContainerInstance.of(requestId)`) work.

### 4.3 Resolves the PROJECT.md open question

**DI: optional adapter, not required, not absent.** Ship `useContainer(IocAdapter)`, default to a one-instance-per-class WeakMap, document the pattern, do not provide our own container. This matches routing-controllers' surface area, costs ~50 LOC, and cleanly supports both no-DI users (zero config) and DI-heavy users (one line of `useContainer(typediAdapter)`).

---

## 5. Express v5 adapter design

### 5.1 What Express 5 changes for us

1. **`async` route handlers auto-forward rejected promises** to error-handling middleware. → drop the inner `Promise.then().catch(driver.handleError)` wrapping in `executeAction`. Just `await` and `throw`; let Express route the error to a library-installed error middleware that runs `driver.handleError`.
2. **Built-in body parsers** (`express.json()`, `express.text()`, `express.urlencoded()`, `express.raw()`). → drop the `body-parser` peer dependency entirely; use `app.express.json(bodyExtraOptions)` instead.
3. **Path-to-regexp v6+** (stricter, no optional `?` modifier without `()`, no unnamed wildcards). → audit and document any breaking changes for users porting routes from v0.11.x.
4. **Removed `req.param()`** etc. Already not used by routing-controllers (it goes via `req.params[name]`), but verify.

### 5.2 Router composition

**Recommendation:** one `express.Router()` per controller, mounted at the controller's base route on the user-supplied app/router.

```
app
 └─ Router('/api')                       ← global routePrefix
      ├─ Router('/users')                ← @Controller('/users')
      │    ├─ GET  '/'                   ← @Get()
      │    ├─ GET  '/:id'                ← @Get('/:id')
      │    └─ POST '/'                   ← @Post()
      └─ Router('/posts')                ← @Controller('/posts')
           └─ ...
```

Benefits over the original's string-concat approach:
- Controller-scoped middleware (`@UseBefore` on the class) attaches to the controller's router cleanly.
- 404s from path mismatch fire correctly.
- Nested routers + subapp mounting work as users expect.

### 5.3 Wiring decorator metadata into Express

```ts
// pseudocode for the registration pass
function createExpressApp(opts: Options) {
  const app = opts.app ?? express();
  if (opts.cors) app.use(cors(opts.cors === true ? undefined : opts.cors));

  const built = MetadataBuilder.build(opts.controllers, opts.middlewares, opts.interceptors);

  // global before-middlewares
  for (const mw of built.globalMiddlewares.filter(m => m.type === 'before')) {
    app.use(mountPath(opts.routePrefix), wrapMiddleware(mw));
  }

  // each controller → its own router
  for (const controller of built.controllers) {
    const r = express.Router();

    // controller-level @UseBefore
    for (const u of controller.uses.filter(x => !x.afterAction)) r.use(wrapUse(u));

    // each action → r[method](path, ...action middlewares, handler)
    for (const action of controller.actions) {
      const handlers = buildActionHandlerChain(action);  // body parser, auth, multer, before-uses, main, after-uses
      r[action.type](action.route, ...handlers);
    }

    app.use(joinPath(opts.routePrefix, controller.route), r);
  }

  // global after-middlewares + library error handler last
  for (const mw of built.globalMiddlewares.filter(m => m.type === 'after')) app.use(wrapMiddleware(mw));
  app.use(libraryErrorHandler);  // routes errors via driver.handleError → user @Middleware({ type:'after' }) error handlers → Express default

  return app;
}
```

### 5.4 The "main handler" simplifies dramatically

```ts
// Express 5: just async/throw. No try/catch, no driver.handleError wrapper.
async function mainHandler(req, res, next) {
  const inputs = await resolveInputs(action, req);          // standard-schema validate
  const instance = container.get(action.target, { req, res, next });
  const result = await instance[action.method](inputs);
  await runInterceptors(action, result);                    // mutate result via @UseInterceptor chain
  writeResponse(action, result, res);                       // status, headers, body, redirect, render, stream, buffer
}
```

If anything throws or rejects, Express 5 routes it to `libraryErrorHandler` — which is just an Express error middleware (`(err, req, res, next) => driver.handleError(err, action, {req,res,next})`). User-supplied `@Middleware({ type: 'after' })` error handlers are inserted into the chain ahead of the library default.

---

## 6. Build & distribution architecture

### 6.1 Recommendation: **monorepo, but ship a "batteries-included" main package**

```
packages/
├── core/                   → @yourname/express-controllers      (the main entry point)
│      Decorators, MetadataArgsStorage, MetadataBuilder,
│      RoutingControllers runtime, ExpressAdapter, default IoC,
│      Standard Schema validator (built-in, type-only dep on standard-schema),
│      HTTP errors, types.
│      DEPENDS ON: express (peer), @standard-schema/spec (type-only)
│
├── class-validator/        → @yourname/express-controllers-class-validator
│      Adapter that turns class-validator + class-transformer into
│      a Standard-Schema-shaped validator for migration users.
│      DEPENDS ON: core (peer), class-validator, class-transformer
│
├── typedi/                 → @yourname/express-controllers-typedi
│      Pre-built IocAdapter for typedi.
│      DEPENDS ON: core (peer), typedi
│
└── tsyringe/               → @yourname/express-controllers-tsyringe   (optional, later)
       DEPENDS ON: core (peer), tsyringe
```

### 6.2 Why monorepo over single package

- **Optional peer deps are messy in a single package.** routing-controllers' `package.json` lists class-validator, class-transformer, typedi, multer, body-parser, cors, cookie all as optional peers. Users get install warnings, IDEs get confused, tree-shaking helps but doesn't fully clean. Splitting puts these only in the adapter package the user actually installs.
- **Independent versioning of adapters.** typedi v0 → v1 breaking changes shouldn't force a major bump on core.
- **Standard Schema in core means most users never need an adapter package** — they import `zod` / `valibot` / `arktype` directly into their controllers and pass schemas to `@Get(...)`. The adapter packages are only for the legacy-class-validator and DI-container cases.

### 6.3 Why not a single package

- Users who don't need DI or class-validator pay for nothing extra in the core package (zero runtime deps beyond `express` peer + a type-only `@standard-schema/spec`). Single-package would either bundle everything (bloat) or use heavy dynamic-require gymnastics (current routing-controllers approach — error-prone).

### 6.4 Why not heavier monorepo (separate `@pkg/zod`, `@pkg/valibot`)

Standard Schema makes per-validator adapters unnecessary. Don't ship them. Shipping `@pkg/zod` would be a code smell — it would just re-export Zod and the StandardSchemaV1 interface that Zod already implements.

### 6.5 Public surface

- `@yourname/express-controllers` — barrel re-exports (decorators, types, error classes, `useExpressControllers`, `useContainer`).
- `@yourname/express-controllers/errors` — subpath for the HTTP error classes only (sometimes you want them without pulling in Express types).
- Dual ESM + CJS via `tsup` or `tshy` with `exports` map.

### 6.6 Tooling implications

- pnpm workspaces (or bun) — npm workspaces work but are weaker for protocol-linked dev.
- changesets for versioning each package independently.
- Vitest in workspace mode: per-package test folders.
- Single tsconfig base + per-package extends; emit ESM + CJS per package.

---

## 7. Suggested project structure (within `packages/core`)

```
packages/core/src/
├── decorators/                  # all class & method decorators
│   ├── controller.ts            # @Controller, @JsonController
│   ├── routes.ts                # @Get, @Post, @Put, @Patch, @Delete, @Head, @Options, @All
│   ├── middleware.ts            # @UseBefore, @UseAfter, @Middleware
│   ├── interceptor.ts           # @UseInterceptor, @Interceptor
│   ├── auth.ts                  # @Authorized
│   ├── response.ts              # @HttpCode, @OnUndefined, @OnNull, @Header,
│   │                            # @ContentType, @Location, @Redirect, @Render
│   └── inject.ts                # @Inject (accessor decorator, Stage 3)
│
├── metadata/
│   ├── storage.ts               # MetadataArgsStorage singleton + getMetadataArgsStorage()
│   ├── args/                    # raw arg shapes (one type per decorator kind)
│   ├── builder.ts               # MetadataBuilder: args → resolved tree
│   └── resolved/                # ControllerMetadata, ActionMetadata, ParamMetadata, ...
│
├── runtime/
│   ├── routing-controllers.ts   # orchestrator (executeAction, registerControllers, etc.)
│   ├── input-resolver.ts        # replaces ActionParameterHandler — now schema-driven
│   ├── interceptor-chain.ts     # runInSequence helper
│   └── response-writer.ts       # @HttpCode/@Header/@Redirect/@Render application
│
├── adapter/
│   ├── express.ts               # ExpressAdapter (was ExpressDriver)
│   ├── interface.ts             # Adapter interface (forward-compat for fastify-adapter package)
│   └── error-middleware.ts      # the library's auto-installed Express error middleware
│
├── validation/
│   ├── standard-schema.ts       # the StandardSchemaV1 type-only contract + validate helper
│   └── format-error.ts          # turn issue arrays into BadRequestError payloads
│
├── container/
│   ├── ioc-adapter.ts           # IocAdapter interface
│   ├── default-container.ts     # WeakMap<Class, instance> fallback
│   └── use-container.ts         # useContainer() global setter
│
├── errors/
│   ├── http-error.ts            # HttpError base
│   └── *.ts                     # BadRequestError, NotFoundError, UnauthorizedError, ...
│
├── types/
│   ├── action.ts                # Action = { request, response, next }
│   ├── handler-options.ts
│   └── public.ts                # all public type exports
│
├── use-express-controllers.ts   # public entrypoint (was createExpressServer)
└── index.ts                     # barrel
```

### Structure rationale

- `decorators/` clusters the public API surface — easy to see what shipping additions/changes touch.
- `metadata/` is the "compiler" — args (raw) vs resolved (built). Mirrors routing-controllers but cleaner.
- `runtime/` is what executes per request; isolated from Express so the core can be unit-tested with synthetic Action objects.
- `adapter/` is the only directory allowed to `import express`. Enforces the boundary that lets a future fastify package drop in.
- `validation/` is type-only-by-default — runtime is contributed by the user's chosen schema lib.
- `container/` is small and isolated — easy to delete if we ever reverse the DI decision.

---

## 8. Build order — phase boundaries for the roadmap

These phases are sized for a 3-5 phase coarse roadmap. Each phase is a meaningful, independently-shippable layer.

### Phase 1 — **Metadata & Decorator Skeleton** (foundation; nothing serves HTTP yet)
- `MetadataArgsStorage` + flat-args types
- `MetadataBuilder` + resolved metadata classes
- All Stage 3 class+method decorators (`@Controller`, `@Get` family, `@HttpCode`, `@Header`, `@OnUndefined`, etc.)
- `@Inject` accessor decorator + IoC adapter contract
- Public type exports (`StandardSchemaV1` re-export, `Action`, error classes)
- **Deliverable test:** "decorate a class, call `MetadataBuilder.build([Class])`, assert resolved tree shape." No Express involved yet.
- **Why first:** every other phase consumes this; pure logic, easy to test, sets the API shape early.

### Phase 2 — **Runtime + Express Adapter (happy path)**
- `RoutingControllers` orchestrator
- `input-resolver` driving Standard Schema validation
- `ExpressAdapter`: per-controller `Router`, registration of routes, body parsing via `express.json()`, response-writer for status/headers/json/buffer/stream
- `useExpressControllers()` public entrypoint
- Default IoC container (WeakMap fallback)
- **Deliverable test:** end-to-end "hit `/users/:id`, get JSON, get correct status code". No middleware, no interceptors, no auth yet.
- **Why second:** smallest end-to-end vertical slice. Validates the whole layered design works.

### Phase 3 — **Middleware, Interceptors, Auth, Error Handling**
- `@UseBefore` / `@UseAfter` / `@Middleware({ type, priority, global })`
- `@UseInterceptor` / `@Interceptor` + interceptor chain
- `@Authorized` + `authorizationChecker` + `currentUserChecker` options
- Library-installed Express error middleware + user `@Middleware` error handlers
- `useContainer(IocAdapter)` integration with all of the above
- **Deliverable test:** auth-protected route, custom error formatter, middleware chain, interceptor mutating response.
- **Why third:** these all consume Phase 2's pipeline; orthogonal additions.

### Phase 4 — **File Upload, Cookies, Sessions, Render, Redirect, Edge Cases**
- `@UploadedFile` / `@UploadedFiles` (multer integration as optional dep)
- `@CookieParam` / `@CookieParams`
- `@SessionParam` / `@Session`
- `@Render` / `@Redirect`
- Express v5 path-to-regexp v6 quirks audit
- **Deliverable test:** parity with routing-controllers v0.11 Express tests (the relevant subset).
- **Why fourth:** completes feature parity but each item is small and independent; convenient to bundle.

### Phase 5 — **Adapter packages, docs, migration guide, polish**
- `@yourname/express-controllers-class-validator` (adapter for migration users)
- `@yourname/express-controllers-typedi` (DI bridge)
- README, API reference (typedoc), migration guide from `routing-controllers`
- npm publish setup, CI matrix, changelog discipline
- **Deliverable:** v1.0.0 on npm.

### Build-order dependencies

```
Phase 1 (metadata) ─┬──► Phase 2 (runtime + express) ─┬──► Phase 3 (mw/interceptor/auth) ─► Phase 5 (publish)
                    │                                  │
                    └──────────────────────────────────┴──► Phase 4 (file/cookie/session/render)
                                                                   │
                                                                   └─► Phase 5
```

Phases 3 and 4 are parallelizable after Phase 2.

---

## 9. Anti-patterns to avoid (specific to this domain)

### Anti-pattern 1: Hard-coded validator
**What:** Importing zod/class-validator from core.
**Why wrong:** Forces every user onto one schema lib; bloats install for the others.
**Do instead:** Standard Schema interface only (type-only). Users bring their own.

### Anti-pattern 2: Resurrecting `reflect-metadata`
**What:** Using `Reflect.getMetadata('design:type', ...)` to figure out param types.
**Why wrong:** `emitDecoratorMetadata` is legacy-only; flips us back off Stage 3.
**Do instead:** Drive type info from schemas; for un-schema'd primitives, accept `string` and tell user to coerce in the schema or controller.

### Anti-pattern 3: Coupling the runtime to Express
**What:** `import express` inside `RoutingControllers.ts`.
**Why wrong:** Closes the door on a future Fastify/uWS adapter; makes core tests heavier than they need to be.
**Do instead:** Adapter interface; Express types live only in `packages/core/src/adapter/express.ts`.

### Anti-pattern 4: NestJS-style module system
**What:** `@Module({ imports, providers, exports })`, hierarchical injectors.
**Why wrong:** Out of scope per PROJECT.md; users wanting this should use NestJS.
**Do instead:** Flat `controllers: [A, B, C]` array + optional `useContainer()`. That's it.

### Anti-pattern 5: Building parameter decorators via internal hacks
**What:** Walking AST, patching emitted JS, or compile-time codegen to fake parameter decorators.
**Why wrong:** Stage 3 doesn't have them for a reason; we'll be the only library doing this; tooling will fight us.
**Do instead:** Single object input via method-level `@Get({ params, query, body, ... })`. Embrace the constraint; the ecosystem (hono, ts-rest, oRPC) already has.

### Anti-pattern 6: Wrapping Express handlers in try/catch
**What:** `try { await handler() } catch (e) { driver.handleError(e) }` inside route handlers.
**Why wrong:** Express 5 already forwards rejected promises to error middleware. Manual try/catch hides errors from Express's built-in chain and breaks user-installed Express error mw.
**Do instead:** Library installs ONE Express error middleware at the end; handlers just `throw`.

---

## 10. Integration points

### External services / packages

| Service | Integration | Notes |
|---------|-------------|-------|
| `express` (v5) | Peer dependency | Only direct framework dep |
| `@standard-schema/spec` | Type-only dependency | Zero runtime cost |
| `cors` | Optional, lazy `await import` | Same pattern as original |
| `multer` | Optional, lazy `await import` | Only if `@UploadedFile` used |
| `cookie` | Direct dep (small, stable) | Used by `@CookieParam` |
| User's schema lib (zod/valibot/arktype) | User-installed; library never imports | Standard Schema FTW |
| User's IoC container (typedi/tsyringe/awilix) | Via `useContainer(adapter)` | Adapters in optional packages |

### Internal boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| decorators ↔ metadata | Direct push to `MetadataArgsStorage` | One-way, side-effect at module load |
| metadata ↔ runtime | Resolved tree passed to `RoutingControllers` constructor | One-way, immutable after build |
| runtime ↔ adapter | `Adapter` interface methods + `Action` value | Bidirectional but typed; adapter is the only place that imports Express |
| runtime ↔ validation | Standard Schema interface | Pure functions, no state |
| runtime ↔ container | `IocAdapter.get(class, action?)` | One method, optional |

---

## 11. Scaling considerations

This is a library, not a service, so "scale" means "what stresses the design as user codebases grow":

| User codebase size | Concerns | Architecture answer |
|---|---|---|
| 1-20 controllers, hobby | None. | Single-package install via main barrel; no DI; just zod schemas. |
| 50-200 controllers, prod app | Startup time of `MetadataBuilder.build()`; cold-start in serverless. | Builder is O(controllers × actions); already fast. Profile only if measured. Cache resolved tree in module scope (already does — `getMetadataArgsStorage()` is a singleton). |
| 500+ controllers, monolith | Memory of `MetadataArgsStorage`; risk of test pollution. | `resetMetadataStorage()` exposed for tests. Consider per-app metadata scoping in v2 if asked. |
| Microservice with 5 controllers | Bundle size; cold-start. | Standard Schema means zero validator cost in core. ESM tree-shaking on the barrel removes unused decorators. Target core gzip ≤ 15kB. |

### Scaling priorities

1. **Bundle size of `core`** — first thing serverless users will look at. Keep zero runtime deps in core (other than the optional `cookie`).
2. **Startup of `MetadataBuilder.build()`** — if it ever shows up in flame graphs, snapshot+freeze the resolved tree once and skip rebuilds on hot-reload.

---

## Sources

- Source code read directly:
  - `/Users/niraj/Desktop/Projects/routing-controllers/src/RoutingControllers.ts`
  - `/Users/niraj/Desktop/Projects/routing-controllers/src/ActionParameterHandler.ts`
  - `/Users/niraj/Desktop/Projects/routing-controllers/src/container.ts`
  - `/Users/niraj/Desktop/Projects/routing-controllers/src/metadata-builder/MetadataArgsStorage.ts`
  - `/Users/niraj/Desktop/Projects/routing-controllers/src/metadata-builder/MetadataBuilder.ts`
  - `/Users/niraj/Desktop/Projects/routing-controllers/src/metadata/ActionMetadata.ts`
  - `/Users/niraj/Desktop/Projects/routing-controllers/src/driver/express/ExpressDriver.ts`
  - `/Users/niraj/Desktop/Projects/routing-controllers/src/decorator/{Controller,Get,Body}.ts`
- TC39 / TypeScript:
  - [tc39/proposal-decorators](https://github.com/tc39/proposal-decorators)
  - [tc39/proposal-class-method-parameter-decorators](https://github.com/tc39/proposal-class-method-parameter-decorators) — confirms parameter decorators are a *separate*, non-Stage-3 proposal.
  - [tc39/proposal-decorator-metadata](https://github.com/tc39/proposal-decorator-metadata) — `Symbol.metadata` design.
  - [TypeScript 5.2 release notes — decorator metadata](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html)
- Validation interop:
  - [Standard Schema spec](https://standardschema.dev/schema)
  - [Standard Schema explained](https://blog.openreplay.com/standard-schema-explained-flexible-validation/)
- Ecosystem patterns (single-object input via method decorator):
  - [Hono + zod-openapi](https://hono.dev/examples/hono-openapi)
  - [@ts-api-kit/core on JSR](https://jsr.io/@ts-api-kit/core)

---
*Architecture research for: TypeScript decorator-based REST controller library on Express v5*
*Researched: 2026-05-07*
