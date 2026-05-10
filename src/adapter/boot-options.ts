import type { ClassConstructor, Action } from '../types/action.js';

/**
 * Authorization checker signature — Phase 3 (AUTH-02). Phase 2 accepts but no-ops.
 */
export type AuthorizationChecker = (action: Action, roles?: string[]) => boolean | Promise<boolean>;

/**
 * Current-user checker signature — Phase 3 (AUTH-03). Phase 2 accepts but no-ops.
 */
export type CurrentUserChecker = (action: Action) => unknown | Promise<unknown>;

/**
 * Local mirror of the cors package's CorsOptions shape (cors v2.8.x).
 * Defined locally to avoid @types/cors leaking into the public API surface
 * as a mandatory devDependency for consumers. All fields are optional.
 *
 * @see https://github.com/expressjs/cors#configuration-options
 */
export interface CorsOptionsLike {
  /** Configures the Access-Control-Allow-Origin header. */
  origin?: string | boolean | RegExp | Array<string | RegExp> | ((origin: string | undefined, callback: (err: Error | null, allow?: boolean | string) => void) => void);
  /** Configures the Access-Control-Allow-Methods header. */
  methods?: string | string[];
  /** Configures the Access-Control-Allow-Headers header. */
  allowedHeaders?: string | string[];
  /** Configures the Access-Control-Expose-Headers header. */
  exposedHeaders?: string | string[];
  /** Configures the Access-Control-Allow-Credentials header. */
  credentials?: boolean;
  /** Configures the Access-Control-Max-Age header. */
  maxAge?: number;
  /** Pass the CORS preflight response to the next handler. Default false. */
  preflightContinue?: boolean;
  /** Provides a status code to use for successful OPTIONS requests. Default 204. */
  optionsSuccessStatus?: number;
}

/**
 * Library boot options. Every API-03 key is typed today so call sites are
 * forward-compatible across Phases 2-4. Phase 2 implements:
 *   - controllers, routePrefix, defaultErrorHandler
 * Phase 2 silently no-ops (typed, ignored at runtime):
 *   - middlewares, interceptors, cors, validation,
 *     authorizationChecker, currentUserChecker, printRoutes
 *
 * @see D-03 in 02-CONTEXT.md
 */
export interface BootOptions {
  /**
   * Controller classes to register. Accepts both class constructors and string
   * glob patterns (e.g., 'src/controllers/**\/*.ts'). String patterns are expanded
   * at boot via tinyglobby (optional peer dependency) relative to process.cwd().
   * All exported classes from matched modules are treated as controllers;
   * non-class exports are silently skipped. Phase 4 UTIL-04.
   */
  controllers: ReadonlyArray<ClassConstructor<unknown> | string>;

  /** Optional path prefix prepended to every controller. D-04 path composition rules apply. */
  routePrefix?: string;

  /** When false, library does not mount its error middleware (D-17). Default true. */
  defaultErrorHandler?: boolean;

  /** Phase 3 — middleware classes/functions. Phase 2 accepts and ignores. */
  middlewares?: ReadonlyArray<ClassConstructor<unknown> | Function>;

  /** Phase 3 — interceptor classes. Phase 2 accepts and ignores. */
  interceptors?: ReadonlyArray<ClassConstructor<unknown>>;

  /**
   * Phase 4 — CORS option (UTIL-03). When true, mounts cors() with default options
   * (Access-Control-Allow-Origin: *). When a CorsOptionsLike object is provided,
   * mounts cors(options). Requires the cors package as an optional peer dependency.
   * Mounts AFTER ALS middleware, BEFORE lib globals per D-18.
   */
  cors?: boolean | CorsOptionsLike;

  /** Reserved for future validation overrides (e.g., a non-Standard-Schema escape hatch). Phase 2 accepts and ignores. */
  validation?: unknown;

  /** Phase 3 — global authorization checker. Phase 2 accepts and ignores. */
  authorizationChecker?: AuthorizationChecker;

  /** Phase 3 — global current-user checker. Phase 2 accepts and ignores. */
  currentUserChecker?: CurrentUserChecker;

  /**
   * Phase 4 — log a route table at boot (API-04). When true, prints a fixed-format
   * METHOD / PATH / CONTROLLER.METHOD column table to console.log after all routers
   * are mounted. Walks library metadata only — does NOT introspect Express internals.
   * Recommended for development only; keep disabled in production.
   */
  printRoutes?: boolean;

  /**
   * WR-03: optional logger for the rare "error arrived after res.headersSent"
   * path inside libraryErrorMiddleware. The library normally calls
   * `console.error` for this case; setting `onLogError` redirects it (e.g.
   * to a structured-log daemon, or `() => {}` to silence). The supplied
   * function MUST NOT throw.
   */
  onLogError?: (err: unknown) => void;
}
