// Decorators (Controller, JsonController, Get, Post, Put, Patch, Delete, Head, All, Method,
//             HttpCode, OnNull, OnUndefined, Header, ContentType)
export * from './decorators/index.js';

// Errors (HttpError + 7 subclasses)
export * from './errors/index.js';

// Container (IocAdapter type, DefaultContainer, useContainer, getContainer, resetContainer)
export * from './container/index.js';

// Metadata builder + static alias
export { buildMetadata, MetadataBuilder } from './metadata/builder.js';

// Runtime guard (consumers may call this directly to detect misconfiguration early)
export { checkLegacyDecoratorMode } from './guard/runtime-guard.js';

// Public value types
export type { Action, ClassConstructor } from './types/action.js';

// Public type-only re-export of Standard Schema spec (zero runtime cost)
export type { StandardSchemaV1 } from './types/standard-schema.js';

// Public resolved metadata tree types (type-only — for adapter-package consumers)
export type {
  ControllerMetadata,
  ActionMetadata,
  ResponseHandlerMetadata,
} from './types/resolved.js';

// Raw storage-layer arg types — type-only, for adapter packages that introspect metadata shapes.
// The underlying WeakMaps remain module-private; only their value shapes are public.
export type {
  ControllerArgs,
  MethodArgs,
  InputDeclaration,
  ResponseHandlerArgs,
  ResponseHandlerType,
} from './metadata/types.js';

// Phase 2 — Express adapter (boot APIs)
export { useExpressControllers, createExpressServer } from './adapter/boot.js';

// Phase 2 — public boot options type
export type {
  BootOptions,
  AuthorizationChecker,
  CurrentUserChecker,
} from './adapter/boot-options.js';

// Phase 3 — middleware/interceptor/auth interfaces (type-only)
export type {
  ExpressMiddlewareInterface,
  ExpressErrorMiddlewareInterface,
  InterceptorInterface,
} from './interfaces/index.js';

// Phase 4 — request context (AsyncLocalStorage)
export { getRequestContext } from './adapter/request-context.js';
export type { RequestContext } from './adapter/request-context.js';
