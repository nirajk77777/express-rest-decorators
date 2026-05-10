---
'express-rest-decorators': minor
---

Initial release of `express-rest-decorators` — a decorator-based REST controller framework for Express v5 and the modernized successor to `routing-controllers`.

### Added

- `@Controller` and `@JsonController` decorators with full HTTP method decorator suite (`@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`, `@Head`, `@All`, `@Method`).
- Method-level input declaration: `params`, `query`, `body`, `headers`, `cookies`, `session`, `files`, `currentUser` slots accepted on every method decorator.
- Standard Schema validation surface — Zod, Valibot, and ArkType all work natively with no adapter code.
- Express v5 native async error propagation — single library-installed error middleware; no per-handler `try/catch`.
- `@HttpCode`, `@OnNull`, `@OnUndefined`, `@Header`, `@ContentType` response shapers.
- `@UseBefore` / `@UseAfter` / `@Middleware` / `@Interceptor` / `@UseInterceptor` extensibility surface with deterministic ordering.
- `@Authorized` role-aware authorization with `authorizationChecker` and `currentUserChecker` global hooks.
- File upload support via `UploadedFile` / `UploadedFiles` factories with mandatory `limits` and `fileFilter` (multer optional peer).
- Cookie and session input slots (`cookie` / `express-session` optional peers).
- `@Render` / `@Redirect` / `@Location` response shapers.
- `getRequestContext()` returning `{ req, res, requestId }` via `AsyncLocalStorage` — works across `await` boundaries.
- `useContainer(IocAdapter)` hook with a default lazy-`new` `WeakMap` container; integrates with TypeDI / tsyringe / Awilix / any `.get(token)`-shaped container.
- Bootstrap APIs: `useExpressControllers(app, options)` and `createExpressServer(options)`.
- `BootOptions` covering `controllers`, `middlewares`, `interceptors`, `routePrefix`, `cors`, `defaultErrorHandler`, `validation`, `authorizationChecker`, `currentUserChecker`, `printRoutes`.
- CORS support via the `cors` boot option (lazy-loaded `cors` peer).
- Glob controller loading via `tinyglobby` (lazy peer).
- `printRoutes: true` dev-time route table dump.
- Runtime guard that throws an actionable error if `experimentalDecorators` / `emitDecoratorMetadata` is missing or `reflect-metadata` is not imported.
- `HttpError` family of typed exceptions with `toJSON()` and ES2022 `cause` support.
