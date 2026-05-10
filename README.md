# express-rest-decorators

> Decorator-based REST controllers for Express v5 — modernized routing-controllers successor.

[![npm version](https://img.shields.io/npm/v/express-rest-decorators/next.svg)](https://www.npmjs.com/package/express-rest-decorators)
[![CI](https://img.shields.io/github/actions/workflow/status/nirajk/express-rest-decorators/ci.yml?branch=main)](https://github.com/nirajk77777/express-rest-decorators/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Types](https://img.shields.io/npm/types/express-rest-decorators.svg)](https://github.com/nirajk77777/express-rest-decorators)

---

## Why this exists

Express v5 finally landed with **native async error propagation** — promise rejections in route handlers now flow to error middleware automatically, no `try/catch` boilerplate, no `Promise.resolve().catch(next)` shims. This library is built on top of that single change. It targets Express 5 only; there is no v4 fallback.

The mental model is **routing-controllers** (legacy TypeScript decorators + `reflect-metadata`) — class-based controllers, decorator-driven routing, dependency-injection hook. If you've used routing-controllers v0.10/v0.11, this will feel familiar. The big break is **method-level input declaration**: instead of `@Param('id') id: string` argument decorators, schemas live on the method decorator itself, and the handler receives one typed input object.

Validation is **validator-agnostic** via [Standard Schema](https://standardschema.dev/). Zod, Valibot, ArkType — anything that implements `StandardSchemaV1` works as the schema for `params` / `query` / `body` / `headers` / `cookies` / `session`. No adapter package required. See the [Migration Guide](./MIGRATION.md) for a full comparison vs routing-controllers v0.11.

## Install

```bash
pnpm add express-rest-decorators express reflect-metadata zod
# or: npm install / yarn add — same package list
```

`express` and `reflect-metadata` are required at runtime. The validator is your choice — `zod`, `valibot`, or `arktype` all work; pick one.

## Quick start

```typescript
import 'reflect-metadata';
import express from 'express';
import { z } from 'zod';
import { JsonController, Get, Post, useExpressControllers } from 'express-rest-decorators';

const UserSchema = z.object({ name: z.string(), email: z.string().email() });

@JsonController('/users')
class UserController {
  @Get('/:id', { params: z.object({ id: z.coerce.number() }) })
  getOne({ params }: { params: { id: number } }) {
    return { id: params.id, name: 'Ada' };
  }

  @Post('/', { body: UserSchema })
  create({ body }: { body: z.infer<typeof UserSchema> }) {
    return { id: 1, ...body };
  }
}

const app = express();
app.use(express.json());
useExpressControllers(app, { controllers: [UserController] });
app.listen(3000, () => console.log('http://localhost:3000'));
```

Required `tsconfig.json` compiler options:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "target": "ES2022",
    "useDefineForClassFields": false
  }
}
```

`import 'reflect-metadata'` MUST appear **once** at the top of your application's entry file, before any controller class is loaded. The library's bootstrap throws an actionable error if `Reflect.getMetadata` is unavailable.

## Validators

Any Standard-Schema-implementing library works as the input schema. The same `@Post('/', { body: schema })` route accepts whichever you prefer — there is no adapter import.

### Zod

```typescript
import { z } from 'zod';

const Body = z.object({ name: z.string() });

@Post('/', { body: Body })
create({ body }: { body: z.infer<typeof Body> }) {
  return body;
}
```

### Valibot

```typescript
import * as v from 'valibot';

const Body = v.object({ name: v.string() });

@Post('/', { body: Body })
create({ body }: { body: v.InferOutput<typeof Body> }) {
  return body;
}
```

### ArkType

```typescript
import { type } from 'arktype';

const Body = type({ name: 'string' });

@Post('/', { body: Body })
create({ body }: { body: typeof Body.infer }) {
  return body;
}
```

**Why three?** Any library implementing the [Standard Schema](https://standardschema.dev/) v1 spec works without adapter code. Pick the one that fits your bundle-size / DX preferences.

## Dependency Injection

The library does not bundle a DI container. It exposes one hook — `useContainer` — that accepts anything with a `.get(token)` shape:

```typescript
import { Container } from 'typedi';
import { useContainer } from 'express-rest-decorators';

useContainer({ get: (token) => Container.get(token) });
```

The same recipe wires **tsyringe**, **Awilix**, **InversifyJS**, or any container with a `.get(token)` shape. There is **no** `express-rest-decorators-typedi` package — the single-package rule means container integrations are recipes, not packages. Without `useContainer`, controllers are instantiated with their zero-arg constructor and cached in a `WeakMap`.

## Feature tour

- **Method-level input declaration** — one declaration object per route covers `params`, `query`, `body`, `headers`, `cookies`, `session`, and `files`.
- **Middleware & interceptors** — `@UseBefore`, `@UseAfter`, `@Middleware`, `@Interceptor`, `@UseInterceptor` for class- or function-shaped middleware and response interceptors.
- **Authorization** — `@Authorized(roles?)` with global `authorizationChecker` and `currentUserChecker` boot hooks.
- **File uploads** — `UploadedFile(...)` and `UploadedFiles(...)` slot markers in the method's `files` slot. Multer is an optional peer; `limits` and `fileFilter` are mandatory by design.
- **Response shaping** — `@Render`, `@Redirect`, `@Location`, `@Header`, `@ContentType`, `@HttpCode`, `@OnNull`, `@OnUndefined`.
- **Request context** — `getRequestContext()` returns `{ req, res, requestId }` from anywhere in the call chain, powered by `AsyncLocalStorage` (works across `await` boundaries).
- **Route table dump** — `printRoutes: true` boot option logs a fixed-format `METHOD / PATH / CONTROLLER.METHOD` table after mount. Dev-time only.
- **Glob controller loading** — `controllers: ['src/controllers/**/*.ts']` expands via `tinyglobby` (optional peer); explicit class arrays are recommended for production.

## Boot options

| Option | Type | Description |
|---|---|---|
| `controllers` | `Array<Class \| string>` | Controller classes or glob patterns. Required. |
| `routePrefix` | `string` | Prepended to every controller's base path. |
| `middlewares` | `Array<Class \| Function>` | Global middleware applied before all routes. |
| `interceptors` | `Array<Class>` | Global response interceptors. |
| `cors` | `boolean \| CorsOptionsLike` | Mount `cors()` middleware (optional peer). |
| `defaultErrorHandler` | `boolean` (default `true`) | Mount the library's error middleware. |
| `validation` | `unknown` | Reserved for future validator overrides. |
| `authorizationChecker` | `(action, roles?) => boolean \| Promise<boolean>` | Used by `@Authorized`. |
| `currentUserChecker` | `(action) => unknown` | Resolves the current user for the request. |
| `printRoutes` | `boolean` | Log the route table at boot (dev only). |
| `onLogError` | `(err) => void` | Override `console.error` for headers-already-sent errors. |

Full API reference (TypeDoc): <https://nirajk77777.github.io/express-rest-decorators/> — published to GitHub Pages on first release (link 404s until Plan 05-07 ships v1.0.0-rc.1).

## Compatibility

| Package | Range |
|---|---|
| TypeScript | `>=5.8` |
| Node.js | `>=20.0.0` (Node 22 LTS recommended) |
| Express | `^5.1.0` (peer) |
| reflect-metadata | `^0.2.2` |
| Standard Schema | `^1.0.0` (`@standard-schema/spec`) |
| Zod | `^4.0.0` (also `^3.25.0`) |
| Valibot | `^1.0.0` |
| ArkType | `^2.0.0` |

## Errors

Throwing an `HttpError` (or any subclass) from a handler short-circuits to the library's error middleware, which serializes it to a JSON response with the matching status code:

```typescript
import { JsonController, Get, NotFoundError } from 'express-rest-decorators';

@JsonController('/users')
class UserController {
  @Get('/:id')
  getOne({ params }: { params: { id: string } }) {
    const user = lookup(params.id);
    if (!user) throw new NotFoundError(`User ${params.id} not found`);
    return user;
  }
}
```

Exported subclasses cover the common cases: `BadRequestError` (400), `UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404), `MethodNotAllowedError` (405), `ConflictError` (409), `InternalServerError` (500). Validation failures from any Standard Schema implementation are converted to `BadRequestError` automatically.

## Async errors & Express v5

Express v5 propagates promise rejections from `async` handlers to error middleware natively — no per-handler `try/catch`, no `Promise.resolve().catch(next)` wrapper. The library installs **one** error middleware (when `defaultErrorHandler` is `true`, the default) that:

1. Recognizes `HttpError` and serializes the matching status code + message.
2. Converts Standard Schema validation issues to `BadRequestError`.
3. Falls back to `500 Internal Server Error` for unrecognized throwables.
4. Logs via `console.error` (override with `onLogError`) when an error arrives after `res.headersSent`.

Set `defaultErrorHandler: false` to opt out and install your own.

## Migrating from routing-controllers

Coming from `routing-controllers@0.11` (or earlier)? See [MIGRATION.md](./MIGRATION.md). The lead chapter covers the single biggest change — **parameter decorators (`@Param`, `@Body`, `@QueryParam`, ...) replaced by method-level input declaration**. The remaining chapters are mostly mechanical decorator renames + a single Breaking Changes table.

## License

MIT — see [LICENSE](./LICENSE).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the dev loop, scripts, and release flow. Bug reports and feature requests welcome at <https://github.com/nirajk77777/express-rest-decorators/issues>.
