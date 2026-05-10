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
  /** Controller classes to register. Phase 2 accepts ClassConstructor[] only; glob loading is Phase 4 (UTIL-04). */
  controllers: ReadonlyArray<ClassConstructor<unknown>>;

  /** Optional path prefix prepended to every controller. D-04 path composition rules apply. */
  routePrefix?: string;

  /** When false, library does not mount its error middleware (D-17). Default true. */
  defaultErrorHandler?: boolean;

  /** Phase 3 — middleware classes/functions. Phase 2 accepts and ignores. */
  middlewares?: ReadonlyArray<ClassConstructor<unknown> | Function>;

  /** Phase 3 — interceptor classes. Phase 2 accepts and ignores. */
  interceptors?: ReadonlyArray<ClassConstructor<unknown>>;

  /** Phase 4 — CORS option. Phase 2 accepts and ignores. */
  cors?: boolean | Record<string, unknown>;

  /** Reserved for future validation overrides (e.g., a non-Standard-Schema escape hatch). Phase 2 accepts and ignores. */
  validation?: unknown;

  /** Phase 3 — global authorization checker. Phase 2 accepts and ignores. */
  authorizationChecker?: AuthorizationChecker;

  /** Phase 3 — global current-user checker. Phase 2 accepts and ignores. */
  currentUserChecker?: CurrentUserChecker;

  /** Phase 4 — log a route table at boot. Phase 2 accepts and ignores. */
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
