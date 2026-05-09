// Internal barrel for src/adapter — populated as Wave 2 modules land.
// Public re-exports from this folder go through src/index.ts.
//
// Wave 2 plans append exports under their own marker only — DO NOT touch other markers' sections.

// 02-01 boot-options exports
export type { BootOptions, AuthorizationChecker, CurrentUserChecker } from './boot-options.js';

// 02-02 router-build exports
export {
  composePath,
  detectV4Pattern,
  buildControllerRouter,
  type HandlerFactory,
  type BuiltRouter,
} from './router-build.js';

// 02-03 validation exports
export {
  isStandardSchema,
  renderPath,
  resolveInputs,
  type ResolvedArgs,
} from './validation.js';

// 02-04 response exports

// 02-05 error-middleware + handler-wrapper exports
