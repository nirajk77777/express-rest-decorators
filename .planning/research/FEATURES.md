# Feature Research

**Domain:** TypeScript decorator-based REST controller library (Express v5)
**Researched:** 2026-05-07
**Confidence:** HIGH — reference codebase (`routing-controllers` v0.11.x) read directly; competitor surfaces (NestJS, tsoa, fastify-decorators, ts-rest, Hono) are well-known, stable, and have authoritative documentation.

## Scope of Survey

- **routing-controllers v0.11.x** — read README + `src/` directory tree directly. Full feature inventory below comes from there.
- **NestJS** — feature-rich opinionated framework on top of Express/Fastify. Used as the "what's possible if you go big" benchmark.
- **tsoa** — OpenAPI-first decorator library that compiles to plain Express handlers + generated OpenAPI spec.
- **fastify-decorators** — minimal decorator surface for Fastify, deliberately small.
- **ts-rest** — schema-first contract library (Zod), generates typed clients; functional, not decorator-based.
- **Hono** — functional, fluent router with end-to-end type inference; not decorator-based.

The first three set "the bar" the user actually has to meet. The last two define the philosophical alternatives this library is *not* — knowing what they do well clarifies what *not* to build.

## Feature Landscape

### Table Stakes (Users Expect These)

These are the routing-controllers feature set that any user migrating off it will check for. Missing any one is a direct regression.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `@Controller(prefix)` / `@JsonController(prefix)` | Class-level routing, prefix concatenation, JSON-content-type shortcut | LOW | Two flavors; JsonController also forces JSON parse on body. Implement as one decorator + option. |
| HTTP method decorators (`@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`, `@Head`, `@All`, `@Method`) | Direct Express verb mapping | LOW | `string \| RegExp` paths. Express v5 changes regex routing — must validate behavior. |
| `routePrefix` global option | Mount whole app under `/api` | LOW | Trivial — concat at registration. |
| Param decorators: `@Param`, `@Params`, `@QueryParam`, `@QueryParams`, `@HeaderParam`, `@HeaderParams`, `@CookieParam`, `@CookieParams`, `@Body`, `@BodyParam`, `@Req`, `@Res` | Core ergonomics — entire value prop of decorator-based libs | MEDIUM | Needs metadata pipeline; coercion (number/boolean/array); `required` flag throws 400. |
| `@Session` / `@SessionParam` | Express session integration | LOW | Pass-through to `req.session`; document session middleware as user responsibility. |
| `@UploadedFile` / `@UploadedFiles` (multer) | File uploads — universally needed | MEDIUM | Wraps multer; per-route options; multer is a peer dep. |
| `@HttpCode`, `@OnNull`, `@OnUndefined` | Status code control around return value semantics | LOW | Plus `defaults.nullResultCode` / `undefinedResultCode` global. |
| `@Header`, `@ContentType`, `@Location`, `@Redirect`, `@Render` | Response shaping | LOW | `@Redirect` supports template substitution (small parser). `@Render` requires view engine — keep but document. |
| HTTP error classes (`HttpError`, `BadRequestError`, `NotFoundError`, etc. + `toJSON()` hook) | Throw-to-respond pattern | LOW | Express v5 native async error propagation makes this *simpler* than v4. |
| Default error handler | JSON error formatting with stack-trace toggle | LOW | Toggle via `defaultErrorHandler: false`. |
| `@UseBefore` / `@UseAfter` (per-action and per-controller) | Middleware composition | MEDIUM | Must accept both function middleware and class middleware (`MiddlewareInterface`). |
| `@Middleware({ type: 'before' \| 'after' })` global | Global middleware registration | LOW | |
| Express error middleware (`ExpressErrorMiddlewareInterface`) | 4-arg error handler integration | LOW | |
| `@Authorized(roles?)` + `authorizationChecker` hook | Pluggable auth at route/class level | LOW | Just a hook function — no built-in identity. |
| `@CurrentUser` + `currentUserChecker` hook | Inject authenticated user | LOW | Pairs with above. |
| `createParamDecorator` extension API | User-defined param decorators | LOW | Public API surface; small. |
| Controller inheritance | Abstract base controllers (CRUD templates) | LOW | Falls out for free if metadata is read along prototype chain. |
| Validation hook (request body / params) | Pluggable validators (per project goal) | MEDIUM | **DIVERGENCE FROM REFERENCE:** swap class-validator hard-dep for an adapter. |
| Transformation hook (req → class instance) | Pluggable transformers | MEDIUM | **DIVERGENCE:** swap class-transformer hard-dep for adapter; default = pass-through. |
| CORS option (`cors: true \| corsOptions`) | One-line CORS toggle | LOW | Wraps `cors` package. |
| Glob loading (`controllers: ['./controllers/**/*.js']`) | Convenience for big apps | LOW | Use `tinyglobby` or similar; ESM-aware. |
| `useExpressServer(app, opts)` + `createExpressServer(opts)` | Bring-your-own-app vs. all-in-one | LOW | |
| DI hook (`useContainer` / `IocAdapter`) | Inject services into controllers | LOW | **Pluggable hook only** — per project decision. Keep `IocAdapter` interface. |
| Interceptors (`@UseInterceptor`, `@Interceptor`, `InterceptorInterface`) | Mutate response payload before send | LOW | Useful but easy to replicate with `@UseAfter`; keep for parity. |
| `@ResponseClassTransformOptions` | Per-route serialization control | LOW | Only meaningful with class-transformer adapter. |
| Selective transform disable (`transformRequest`/`transformResponse` per controller/route) | Escape hatch | LOW | |

### Differentiators (Competitive Advantage)

Features the reference does *not* have, but that are realistic v1 wins for a modernized successor. Each is sized below; final v1/v2 calls in the **"New Features on Top" Recommendations** section.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| TC39 Stage 3 decorators (no `experimentalDecorators`, no `reflect-metadata`) | Future-proof; works with TS 5+ defaults; no global metadata pollution | HIGH | The single biggest architectural differentiator. Forces redesign of metadata storage (WeakMap-per-class instead of `Reflect.metadata`). Param decorators don't exist in Stage 3 — must use *method* decorators that introspect parameter types via `@param('name', 'query')` style or use a tiny TS transformer for type info. **Decision needed in architecture phase.** |
| Pluggable validators (zod / valibot / class-validator) | Lets users keep their schema lib of choice; biggest user complaint about routing-controllers | MEDIUM | Adapter interface: `{ validate(schema, data): Result, transform?(...) }`. Ship 2–3 first-party adapters. Schema-shaped libs (zod) and decorator-shaped libs (class-validator) need different param-side ergonomics — define carefully. |
| Native Express v5 async errors | Drop legacy try/catch wrappers; thinner adapter; better stack traces | LOW | Express v5 natively forwards rejected promises to error middleware. Simplifies handler wrapping. |
| AsyncLocalStorage request context | Per-request store accessible anywhere without prop-drilling — request ID, current user, logger | LOW | Tiny built-in: `getRequestContext()` returning typed bag. Huge DX win, low cost. |
| Streaming / SSE response helper | Modern apps need streaming (LLM outputs, progress); no good answer in routing-controllers | MEDIUM | Two pieces: `@SseStream()` decorator (returns async iterable → `text/event-stream` framing) and a passthrough Node stream return convention. Express v5 handles backpressure. |
| Structured logging hook | Pino/winston-friendly; per-request child logger via context | LOW | Just a `logger` option + AsyncLocalStorage child. Don't ship a logger. |
| Lifecycle hooks (`onAppInit`, `onAppShutdown`) | Graceful shutdown, DB close, etc. | LOW | Two methods on controller class, called in registration/teardown. NestJS-style without the rest of NestJS. |
| OpenAPI generation from decorators (best-effort) | Eliminates `routing-controllers-openapi` second-package friction | HIGH | Two tracks: **(a)** runtime collector (introspect schemas registered through validation adapter — works well for zod) or **(b)** TS compiler-API pass like tsoa. (a) is realistic for v1.x, (b) is v2 territory. |
| Route-level rate limit decorator | Common need; community asks for it constantly | LOW | Thin wrapper over `express-rate-limit` accepting per-route options. |
| Dev-time route table dump | `--print-routes` style listing on boot | LOW | Trivial; huge debug ergonomics improvement. |
| Per-route timeout decorator | `@Timeout(5000)` — request times out cleanly with structured error | LOW | |
| First-class async iterables as return values | `return asyncGenerator()` → streamed response | MEDIUM | Pairs with SSE story. |
| Dual ESM + CJS distribution | Modern toolchain compatibility | MEDIUM | Build infra concern; tsup or similar. Reference is CJS-first. |

### Anti-Features (Commonly Requested, Often Problematic)

Features the user might be tempted to add — these have appeal but create disproportionate maintenance, lock-in, or scope explosion. **Each has an explicit "instead" recommendation.**

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Built-in DI container | "It just works out of the box" | Becomes a second product to maintain (DI is non-trivial); locks users in; competes with TypeDI/InversifyJS/tsyringe with no upside | Keep `IocAdapter` hook; ship a 30-line "manual" adapter for users who want zero-deps. |
| WebSocket decorators | "We use ws, why not decorate it" | Different protocol, different lifecycle, different testing story; doubles the surface area; Socket.IO/uWS users want different things | Out of scope. Document interop pattern: WS server runs alongside Express; share AsyncLocalStorage if needed. |
| Microservices / message-broker decorators (`@MessagePattern`) | NestJS has it | Massive scope; non-Express runtime; transport zoo (Redis, NATS, Kafka, RMQ); each a maintenance pit | Out of scope. Different library entirely. |
| GraphQL decorators | "Class-based GraphQL" | TypeGraphQL exists and is good; fundamentally different transport semantics | Out of scope. Recommend TypeGraphQL. |
| Custom DI-aware module system (NestJS `@Module`) | "Encapsulation, providers, exports" | Heavy abstraction; only earns its keep at very large scale; doesn't match Express's flat routing model | Plain ES modules + the IocAdapter hook are sufficient. |
| File-based routing (Next.js / Hono RPC style) | Trendy; reduces boilerplate | Fights the decorator paradigm; users picking decorator libs want classes; bolting on dual paradigms doubles docs and bugs | Out of scope. Users who want this should pick Hono or a meta-framework. |
| Typed RPC client codegen (ts-rest pattern) | "End-to-end type safety" | Requires a contract DSL that *is* the source of truth, which fundamentally inverts where the route lives. Decorator-driven routes can't be a contract source without a TS-compiler pass; tsoa demonstrates the cost | v1: out of scope. v2 maybe via OpenAPI emit + openapi-typescript on the consumer side. |
| `@Render` server-side templates | Carryover from reference | Niche today; encourages mixing concerns; needs view-engine config | Keep for parity (low cost), but document as legacy and don't extend. |
| Koa adapter | "More frameworks = more users" | Project goal explicitly excludes; doubles tests, types, edge cases | **Confirmed out of scope by PROJECT.md.** |
| `reflect-metadata` dependency | "Standard for TS metadata" | TC39 Stage 3 decorators don't need it; pulling it in defeats a major selling point and pollutes globals | Use per-class WeakMap metadata storage. |
| Implicit class-validator everywhere | What reference does | Forces a choice on users; class-validator is increasingly out of fashion vs zod | **Pluggable adapter** (project requirement). |
| Hot reload / dev server | "DX!" | Belongs to tsx / nodemon / Node `--watch`; library can't do better than the runtime | Out of scope; recommend `node --watch` in docs. |
| Magic auto-imports / file-system controller discovery beyond globs | Niceness | Becomes "framework", reduces explicitness, breaks bundlers | Keep glob loading; nothing more. |
| Built-in pipes (NestJS) as a separate concept | "Transform pipeline" | Overlaps with validator/transformer adapters; extra mental model | Adapters cover this. |
| Built-in guards (NestJS) as a separate concept | "Auth pipeline" | `@Authorized` + `authorizationChecker` already covers it | Don't introduce parallel concept. |
| Built-in exception filters (NestJS) | "Per-route error mapping" | `HttpError` + error middleware already covers it | Document the pattern; don't add new abstraction. |

## Feature Dependencies

```
TC39 Stage 3 decorators
    └──blocks──> all other decorators (foundational metadata model)
                       └──blocks──> param decorators (need new strategy: method-level decorators carrying param index)
                                          └──blocks──> validation/transformation hooks

Validation adapter
    ├──enables──> @Body / @QueryParams / @Param validation
    ├──enables──> OpenAPI generation (zod schemas → JSON Schema)
    └──enables──> structured 400 errors

Express v5 native async errors
    └──simplifies──> handler wrapping
                       └──simplifies──> error middleware
                                          └──simplifies──> HttpError flow

AsyncLocalStorage context
    ├──enables──> structured logging (per-request logger)
    ├──enables──> request ID propagation
    └──enables──> decorator-free access to current user from services

DI hook (IocAdapter)
    └──enables──> constructor-injected services in controllers/middlewares/interceptors

Streaming / SSE
    ├──depends──> Express v5 (better stream handling)
    └──pairs-with──> async iterable return convention

OpenAPI generation
    ├──depends──> validation adapter (need schemas to emit)
    ├──depends──> route metadata registry (already needed for routing)
    └──conflicts──> non-zod adapters (class-validator → JSON Schema is messy; valibot → JSON Schema is improving)
```

### Dependency Notes

- **Stage 3 decorators are the linchpin.** Every other decorator depends on the metadata strategy chosen here. This must be settled in the architecture phase before feature work.
- **Validation adapter shape constrains OpenAPI shape.** If the adapter exposes the underlying schema (zod object), OpenAPI emit is realistic. If it only exposes a `validate(data) → result` function, OpenAPI emit becomes guesswork.
- **AsyncLocalStorage is a foundational primitive.** Cheap to add; many features depend on it. Add early.
- **`@Render` and SSR-templating don't conflict with anything but also don't compose with anything modern.** Keep isolated.
- **DI hook does not depend on anything else.** Can be added at any time; pluggable by design.

## MVP Definition

### Launch With (v1)

Minimum needed for routing-controllers users to switch over. Ruthless cut.

- [ ] **TC39 Stage 3 decorator architecture** — non-negotiable foundation
- [ ] **Express v5 adapter** — single adapter; no abstraction over driver since Koa is out
- [ ] **Routing decorators** — `@Controller`, `@JsonController`, `@Get/@Post/@Put/@Patch/@Delete/@Head/@All/@Method`
- [ ] **Param decorators** — `@Param/@Params`, `@QueryParam/@QueryParams`, `@HeaderParam/@HeaderParams`, `@CookieParam/@CookieParams`, `@Body/@BodyParam`, `@Req/@Res`
- [ ] **Session params** — `@Session/@SessionParam` (pass-through; no built-in session middleware)
- [ ] **File uploads** — `@UploadedFile/@UploadedFiles` via multer peer dep
- [ ] **Response shaping** — `@HttpCode`, `@OnNull`, `@OnUndefined`, `@Header`, `@ContentType`, `@Location`, `@Redirect`
- [ ] **HTTP errors** — `HttpError` + standard subclasses + `toJSON()` hook + default error handler
- [ ] **Middleware** — `@UseBefore`, `@UseAfter`, `@Middleware({ type })`, function and class forms, error middleware
- [ ] **Interceptors** — `@UseInterceptor`, `@Interceptor`, `InterceptorInterface` (cheap parity)
- [ ] **Auth hooks** — `@Authorized`, `@CurrentUser`, `authorizationChecker`, `currentUserChecker`
- [ ] **Custom param decorators** — `createParamDecorator` API
- [ ] **Validation/transformation adapters** — interface + class-validator adapter + zod adapter (the two biggest user populations)
- [ ] **DI adapter** — `IocAdapter` interface; example TypeDI integration in docs
- [ ] **Glob loading** — controllers/middlewares from paths
- [ ] **CORS option** — wraps `cors`
- [ ] **`useExpressServer` / `createExpressServer`** — both entry points
- [ ] **Dual ESM + CJS build**
- [ ] **AsyncLocalStorage request context** — `getRequestContext()` (cheap, foundational, pays off immediately)
- [ ] **Route table dump in dev** — `printRoutes: true` boot option
- [ ] **Migration guide doc** from routing-controllers
- [ ] **Vitest test suite** covering all of the above

### Add After Validation (v1.x)

Land once core is stable and we have user feedback.

- [ ] **Valibot validation adapter** — third schema lib, post-v1 to keep v1 surface tight
- [ ] **`@SseStream` / async iterable streaming** — pent-up demand but specification needs care
- [ ] **Lifecycle hooks** (`onAppInit`, `onAppShutdown`) — useful, low-risk
- [ ] **Structured logging hook** — accept user-provided logger; child logger per request via ALS
- [ ] **`@RateLimit` decorator** — wraps `express-rate-limit`
- [ ] **`@Timeout` decorator** — per-route request deadline
- [ ] **`@Render` decorator** — port from reference for parity (cheap; do in v1.x not v1 to keep v1 focus)
- [ ] **OpenAPI emit (zod-only first)** — only the validation-adapter-driven path; ship as separate package `@…/openapi`

### Future Consideration (v2+)

Defer until adoption justifies the maintenance cost.

- [ ] **OpenAPI emit for class-validator / valibot** — JSON Schema fidelity is hard; do once zod path is proven
- [ ] **Compiler-pass OpenAPI** (tsoa-style) — only if runtime emit proves insufficient
- [ ] **WebSocket adjacent helpers** — even then, likely a sister package, not core
- [ ] **Typed client codegen** — possibly via OpenAPI → openapi-typescript pipeline; not first-party

### Explicitly Never

- Koa adapter
- Express v4 support
- Built-in DI container
- File-based routing
- GraphQL / microservices / message-broker decorators
- `experimentalDecorators` mode
- `reflect-metadata` runtime dependency

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Stage 3 decorator architecture | HIGH | HIGH | P1 |
| Routing + param + response decorators (full reference parity) | HIGH | MEDIUM | P1 |
| Pluggable validation adapter (zod + class-validator) | HIGH | MEDIUM | P1 |
| HTTP errors + default error handler | HIGH | LOW | P1 |
| Middleware / interceptors / auth hooks | HIGH | MEDIUM | P1 |
| File uploads (multer) | MEDIUM | MEDIUM | P1 |
| DI adapter (`IocAdapter`) | MEDIUM | LOW | P1 |
| AsyncLocalStorage request context | HIGH | LOW | P1 |
| Glob loading + CORS option | MEDIUM | LOW | P1 |
| Dual ESM/CJS build | HIGH | MEDIUM | P1 |
| Migration guide | HIGH | MEDIUM | P1 |
| Route table dump | MEDIUM | LOW | P1 |
| `@SseStream` / async iterable streaming | HIGH | MEDIUM | P2 |
| Lifecycle hooks | MEDIUM | LOW | P2 |
| Structured logging hook | MEDIUM | LOW | P2 |
| `@RateLimit` decorator | MEDIUM | LOW | P2 |
| `@Timeout` decorator | MEDIUM | LOW | P2 |
| Valibot adapter | MEDIUM | LOW | P2 |
| `@Render` parity | LOW | LOW | P2 |
| OpenAPI emit (zod) | HIGH | HIGH | P2 |
| OpenAPI emit (class-validator/valibot) | MEDIUM | HIGH | P3 |
| Compiler-pass OpenAPI (tsoa-style) | MEDIUM | HIGH | P3 |
| WebSocket helpers | LOW | HIGH | P3 (probably never in core) |

**Priority key:**
- P1 — Must have for v1 launch
- P2 — Add in v1.x after validation
- P3 — Future / never

## "New Features on Top" — Explicit Recommendations

User asked for go/no-go on each candidate:

| Candidate | Recommendation | Rationale |
|-----------|----------------|-----------|
| **Streaming / SSE helpers** | **v1.x (P2)** | High user value, especially in 2026 (LLM apps everywhere). Specification needs care — define `@SseStream` semantics, error handling, client-disconnect handling. Don't rush into v1; ship correctly in v1.x. |
| **AsyncLocalStorage request context** | **v1 (P1)** | Cheap, foundational, unlocks logging and request-ID work for users immediately. Every modern Node lib has this; not having it is a regression. |
| **Rate-limit decorator** | **v1.x (P2)** | Trivial wrapper, but only valuable if `express-rate-limit` integration is well-shaped (per-route store, key generator). Defer to v1.x to validate the right shape with users. |
| **Structured logging hooks** | **v1.x (P2)** | Just an option that accepts user logger + ALS-bound child logger per request. Don't ship a logger. Defer to v1.x because the API shape (esp. error/audit hooks) wants iteration. |
| **Lifecycle hooks (onModuleInit / onShutdown style)** | **v1.x (P2)** | Two methods, called at registration and SIGTERM. Cheap. Defer slightly only because v1 surface should stay tight. |
| **File-based routing** | **Never** | Conflicts with the decorator paradigm. Users picking this lib explicitly want classes. Don't bolt on dual paradigms. |
| **WebSocket decorators** | **Never (in core)** | Different protocol, lifecycle, testing story. Doubles surface area. If pursued ever, sister package. |
| **OpenAPI generation from decorators** | **v1.x (P2), zod-only first** | Big differentiator over routing-controllers (which needs `routing-controllers-openapi` extra package). Realistic only via the validation adapter — emit zod schemas as JSON Schema. Class-validator and valibot follow in v2. Compiler-pass OpenAPI is v2+ if at all. Ship as separate package. |
| **Typed RPC client generation (ts-rest pattern)** | **Never (as first-party)** | Fundamentally inverts where the route lives — ts-rest is contract-first, this lib is decorator-first. The right answer if a user wants this is OpenAPI emit + `openapi-typescript` on the consumer side. |
| **Hot reload / dev mode improvements** | **Never (out of scope)** | `node --watch` and `tsx` already do this better than any library can. Document in README; don't ship code. |

## Competitor Feature Analysis

| Feature | routing-controllers (reference) | NestJS | tsoa | fastify-decorators | Our Approach |
|---------|--------------------------------|--------|------|--------------------|--------------| 
| Decorator paradigm | Legacy decorators | Legacy decorators | Legacy decorators | Legacy decorators | **TC39 Stage 3** (differentiator) |
| Runtime | Express + Koa | Express or Fastify | Express or Hapi | Fastify | **Express v5 only** |
| Validation | class-validator (hard dep) | class-validator default; pluggable via pipes | Generated from TS types | Manual / Fastify schemas | **Pluggable: zod, valibot, class-validator** |
| DI | Pluggable (`useContainer`) | Built-in heavyweight container + modules | None | tsyringe | **Pluggable hook only** |
| OpenAPI | Separate package `routing-controllers-openapi` | `@nestjs/swagger` package | Native (compiler pass) | Separate plugin | **v1.x as separate package, zod-driven emit** |
| Streaming/SSE | None | `Sse()` decorator | None | Manual | **`@SseStream` in v1.x** |
| Lifecycle hooks | None | Rich (`OnModuleInit`, `OnApplicationShutdown`, etc.) | None | Hooks via Fastify | **Two simple hooks in v1.x** |
| WebSockets | None | Yes (`@WebSocketGateway`) | None | None | **Out of scope** |
| Microservices | None | Yes (transport zoo) | None | None | **Out of scope** |
| Module system | Flat | `@Module` graph | Flat | Flat | **Flat (ES modules)** |
| Modules format | CJS | CJS+ESM | CJS+ESM | CJS+ESM | **Dual** |
| `reflect-metadata` | Required | Required | Required (compile-time) | Required | **Not required** (Stage 3) |
| Decorator count | ~40 | ~80+ | ~25 | ~15 | **~40** (parity, no expansion in v1) |

## Sources

- routing-controllers v0.11.x: README and `src/` (decorators, drivers, errors) — read locally at `/Users/niraj/Desktop/Projects/routing-controllers/` (HIGH confidence — primary source)
- NestJS feature surface — well-documented at https://docs.nestjs.com (HIGH confidence — long-stable framework)
- tsoa — https://tsoa-community.github.io/docs/ (HIGH confidence)
- fastify-decorators — https://github.com/L2jLiga/fastify-decorators (MEDIUM confidence — small project)
- ts-rest — https://ts-rest.com (HIGH confidence)
- Hono — https://hono.dev (HIGH confidence)
- TC39 Decorators proposal (Stage 3) — https://github.com/tc39/proposal-decorators (HIGH confidence)
- Express v5 release notes — async error propagation behavior (HIGH confidence — verified before)

---
*Feature research for: TypeScript decorator-based REST controller library targeting Express v5*
*Researched: 2026-05-07*
