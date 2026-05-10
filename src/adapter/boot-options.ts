import type { ClassConstructor, Action } from '../types/action.js';

/**
 * Authorization checker signature.
 */
export type AuthorizationChecker = (action: Action, roles?: string[]) => boolean | Promise<boolean>;

/**
 * Current-user checker signature.
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
 * Library boot options.
 */
export interface BootOptions {
  /**
   * Controller classes to register. Accepts both class constructors and string
   * glob patterns (e.g., 'src/controllers/**\/*.ts'). String patterns are expanded
   * at boot via tinyglobby (optional peer dependency) relative to process.cwd().
   * All exported classes from matched modules are treated as controllers;
   * non-class exports are silently skipped.
   */
  controllers: ReadonlyArray<ClassConstructor<unknown> | string>;

  /** Optional path prefix prepended to every controller. Path composition rules apply. */
  routePrefix?: string;

  /** When false, library does not mount its error middleware. Default true. */
  defaultErrorHandler?: boolean;

  /** Middleware classes/functions. */
  middlewares?: ReadonlyArray<ClassConstructor<unknown> | Function>;

  /** Interceptor classes. */
  interceptors?: ReadonlyArray<ClassConstructor<unknown>>;

  /**
   * CORS option. When true, mounts cors() with default options
   * (Access-Control-Allow-Origin: *). When a CorsOptionsLike object is provided,
   * mounts cors(options). Requires the cors package as an optional peer dependency.
   * Mounts AFTER ALS middleware, BEFORE lib globals.
   */
  cors?: boolean | CorsOptionsLike;

  /** Reserved for future validation overrides (e.g., a non-Standard-Schema escape hatch). */
  validation?: unknown;

  /** Global authorization checker. */
  authorizationChecker?: AuthorizationChecker;

  /** Global current-user checker. */
  currentUserChecker?: CurrentUserChecker;

  /**
   * Log a route table at boot. When true, prints a fixed-format
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
