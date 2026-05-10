# Migration Guide — `routing-controllers@0.11` → `express-rest-decorators@1`

This guide walks you through the differences between [`routing-controllers`](https://github.com/typestack/routing-controllers) v0.11 and `express-rest-decorators` v1. Six chapters cover the rationale, the single biggest break, the breaking changes table, per-feature recipes, what's gone, and what's new.

If you're new to the library and not migrating from anything, the [README](./README.md) is the better starting point.

---

## Chapter 1: Why This Exists

`routing-controllers` was great. It supported both Express and Koa, packed in class-validator + class-transformer for end-to-end DTOs, and has thousands of production deployments. So why a successor?

**Express v5 changed the game.** Express 5 (GA October 2024) propagates async errors natively — `async` handlers that reject now flow into error middleware automatically. The whole reason routing-controllers needed custom action wrappers and per-handler error trapping is *gone*. Building on Express 5 directly removes a load-bearing layer of indirection — and removing the Koa code path with it lets the library focus on a single HTTP model. This package is **Express 5 only**.

**Modern TypeScript decorators with `reflect-metadata`.** Same legacy decorator runtime as routing-controllers (`experimentalDecorators: true` + `emitDecoratorMetadata: true`); same `import 'reflect-metadata'` requirement. The mental model carries over. We did *not* switch to TC39 Stage 3 decorators — the ecosystem (especially TypeScript's `emitDecoratorMetadata` / `design:paramtypes` runtime) is still legacy-rooted, and breaking that for a v1 release would force every consumer through a tsconfig migration on day one.

**Validator-agnostic via [Standard Schema](https://standardschema.dev/).** Routing-controllers was tightly coupled to class-validator + class-transformer. v1 instead consumes any library that implements `StandardSchemaV1` — Zod, Valibot, ArkType today, anything else that adopts the spec tomorrow. There is no built-in validator dependency; you bring the schema lib that fits your team.

---

## Chapter 2: The Big Break — Parameter Decorators → Method-Level Input

This is the single largest behavioral and ergonomic change. Read this chapter first.

**Before** (`routing-controllers` v0.11):

```typescript
import { JsonController, Get, Post, Param, Body } from 'routing-controllers';

@JsonController('/users')
class UserController {
  @Get('/:id')
  async getUser(@Param('id') id: string, @Body() body: CreateUserDto) {
    return this.users.findById(id);
  }
}
```

**After** (`express-rest-decorators` v1):

```typescript
import { JsonController, Get, Post } from 'express-rest-decorators';
import { z } from 'zod';

const CreateUserSchema = z.object({ name: z.string(), email: z.string().email() });

@JsonController('/users')
class UserController {
  @Get('/:id', { params: z.object({ id: z.coerce.number() }) })
  async getUser({ params }: { params: { id: number } }) {
    return this.users.findById(params.id);
  }

  @Post('/', { body: CreateUserSchema })
  async create({ body }: { body: z.infer<typeof CreateUserSchema> }) {
    return this.users.create(body);
  }
}
```

**Rationale.** The input declaration object lives at the method-decorator call site, alongside the path. The handler receives **one** typed object — `{ params, query, body, headers, cookies, session, files }` (only the slots you declare). Type inference flows from schema → handler arg in a single hop, with no per-arg decorator boilerplate. The Standard Schema interface means the same shape works whether you pass a Zod schema, a Valibot schema, or an ArkType type — no adapter import, no per-decorator typing dance.

If you're rewriting a routing-controllers codebase, this is the structural change that drives the rewrite. The remaining chapters are mostly mechanical decorator renames.

---

## Chapter 3: Breaking Changes Table

| Feature | `routing-controllers@0.11` | `express-rest-decorators@1` |
|---|---|---|
| Parameter decorators | `@Param`, `@Body`, `@QueryParam`, `@HeaderParam`, `@CookieParam`, `@SessionParam`, `@UploadedFile` as **arg** decorators | Method-level input declaration: `{ params, query, body, headers, cookies, session, files }` slot object on the route decorator |
| Koa support | Yes (Express + Koa) | **Removed** — Express v5 only |
| Express version | v4 | v5.1+ peer (native async error propagation) |
| Default validator | `class-validator` + `class-transformer` | Standard Schema (Zod / Valibot / ArkType — your choice, none bundled) |
| DI hook | Global `useContainer(Container)` (TypeDI auto-imported in some setups) | Per-bootstrap `useContainer({ get: token => container.resolve(token) })` |
| File uploads | `@UploadedFile()` arg decorator with implicit defaults | Method-level `{ files: { avatar: UploadedFile({ limits, fileFilter }) } }` slot model — `limits` and `fileFilter` are **mandatory** |
| Cookie / session access | `@CookieParam` / `@SessionParam` arg decorators | Method-level `{ cookies, session }` slots, optionally schema-validated |
| Path syntax | `path-to-regexp` v0.x (named + unnamed regex groups) | `path-to-regexp` v8 (no unnamed regex groups; v0/v4 patterns rejected at registration) |
| Glob controller loading | `controllers: ['src/**/*.ts']` via `require` | Same syntax via dynamic `import()` (uses `tinyglobby` as an optional peer) |
| `reflect-metadata` | Required (for class-validator's `design:type` reads) | Required by core (TS-emitted `design:paramtypes` reads) |
| Action object | `(action) => ...` with `request`, `response`, `next`, `context` | `(action) => ...` with `request`, `response` (Koa-flavored fields removed) |

---

## Chapter 4: Per-Feature Migration Recipes

### Controllers + Routing

`@Controller(basePath?)`, `@JsonController(basePath?)`, and the HTTP method decorators (`@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`, `@Head`, `@All`, `@Method`) keep their routing-controllers signatures. `routePrefix` on the boot options still works the same way. The major signature change is the **second argument** to method decorators — the input declaration object covered in Chapter 2.

```typescript
@JsonController('/api/users')
class UserController {
  @Get('/')
  list() { return [/* ... */]; }
}

useExpressControllers(app, { controllers: [UserController], routePrefix: '/v1' });
// Routes are mounted under /v1/api/users
```

### Input Declaration

The slot object covers `params`, `query`, `body`, `headers`, `cookies`, `session`, and `files`. Each slot is optional; declare only what you read. See Chapter 2 for the lead example.

```typescript
@Post('/items', {
  query: z.object({ debug: z.coerce.boolean().optional() }),
  body: ItemSchema,
  headers: z.object({ 'x-tenant-id': z.string().uuid() }),
})
create({ query, body, headers }) { /* all three are typed */ }
```

### Middleware, Interceptors, Authorization

- `@UseBefore(...)` and `@UseAfter(...)` accept Express middleware functions or class-shaped middleware (a class with a `use(req, res, next)` method, or implementing `ExpressMiddlewareInterface`).
- `@Middleware({ type: 'before' | 'after' })` marks a class as a global middleware (registered via `middlewares` boot option).
- `@Interceptor()` marks a class implementing `InterceptorInterface` (`intercept(action, content)`); `@UseInterceptor(...)` applies one to a specific controller/method.
- `@Authorized(roles?)` checks `authorizationChecker(action, roles)`; method-level `@Authorized` overrides class-level (method-wins).
- `currentUserChecker` resolves the user object referenced by `@CurrentUser()` (the one parameter decorator that survives — it's a thin wrapper on `currentUserChecker`).

The shapes of `ExpressMiddlewareInterface`, `ExpressErrorMiddlewareInterface`, and `InterceptorInterface` are largely RC-compatible — the imports change to `express-rest-decorators`, the methods are unchanged.

### File Uploads

Uploads move into the `files` slot of the input declaration. Multer is an **optional** peer dependency.

```typescript
import { UploadedFile, UploadedFiles } from 'express-rest-decorators';

@Post('/avatar', {
  files: {
    avatar: UploadedFile({
      limits: { fileSize: 2 * 1024 * 1024 },             // mandatory
      fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')), // mandatory
    }),
  },
})
upload({ files }) {
  return { name: files.avatar.originalname, size: files.avatar.size };
}
```

`limits` and `fileFilter` are **required** by design — the original library's silent defaults were a regular source of unbounded-upload incidents. Use `UploadedFiles({...})` for the array variant.

### Cookies / Sessions

```typescript
@Get('/me', {
  cookies: z.object({ session_id: z.string() }),
  session: z.object({ userId: z.string().uuid() }).optional(),
})
me({ cookies, session }) { /* ... */ }
```

`cookie` (for `@Cookies()` style parsing) and `express-session` are optional peers — install only when you read those slots.

### Dependency Injection

```typescript
// TypeDI
import { Container } from 'typedi';
useContainer({ get: (token) => Container.get(token) });

// tsyringe
import { container } from 'tsyringe';
useContainer({ get: (token) => container.resolve(token) });

// Awilix (when wrapping a cradle)
useContainer({ get: (token) => awilixContainer.resolve(token) });
```

The library performs no automatic constructor-type injection by default. Auto-injection by `design:paramtypes` is technically possible (legacy decorators emit it) but is opt-in via your container; the core stays pluggable.

### New on Top

- **`getRequestContext()`** — call it from anywhere in the call chain (services, repositories, helpers) to retrieve `{ req, res, requestId }`. Backed by `AsyncLocalStorage`; works across `await` boundaries with no per-function plumbing.
- **`printRoutes: true`** — boot option that logs a `METHOD / PATH / CONTROLLER.METHOD` table after mount. Useful in development to confirm what got registered.

---

## Chapter 5: What's Gone

- **Koa support.** The library is Express-only. If you're on Koa, stay on routing-controllers v0.11 or migrate to Express first.
- **Parameter decorators as the primary input mechanism.** `@Param`, `@Body`, `@QueryParam`, `@HeaderParam`, `@CookieParam`, `@SessionParam`, `@UploadedFile` are not exported. Use the method-level input declaration object.
- **`class-validator` / `class-transformer` as the default validator.** v1 ships zero validation libraries — Standard Schema is the surface; you bring Zod/Valibot/ArkType. A `class-validator` adapter is deferred to a post-v1.x release and is **not** in v1.
- **`body-parser` as a runtime dep.** Express 5 ships `express.json()` / `express.urlencoded()` natively. Call `app.use(express.json())` in your bootstrap.
- **`@scope/express-controllers-typedi` style sub-packages.** The single-package repo policy means container integrations are documented recipes (Chapter 4), not separate npm packages.

---

## Chapter 6: What's New on Top

- **`getRequestContext()`** — AsyncLocalStorage-backed context returning `{ req, res, requestId }` from anywhere in the call chain. Works across `await` boundaries; no per-function plumbing required (NEW-01 / NEW-02).
- **`printRoutes` boot option** — fixed-format route table dump at boot time, walking library metadata only (no Express internals introspection). Dev-only by recommendation (API-04).
- **Native Express v5 async error propagation** — one library-installed error middleware, no per-handler `try/catch`, no action-wrapper layer. Throw an `HttpError` subclass and it serializes to the matching status; throw anything else and it falls back to `500`.

---

**On codemods:** Codemods are out of scope for v1. The migration is a structural rewrite at the input-declaration boundary; the rest is mostly mechanical decorator renames. Expect the rewrite to be hand-driven, controller-by-controller, with the type checker catching the bulk of the slot/handler-arg shape changes.
