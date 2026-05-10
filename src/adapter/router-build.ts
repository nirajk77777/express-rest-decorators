/**
 * Router-build module for Phase 2 + Phase 3.
 *
 * Phase 2: path composition (D-04), v4 footgun detection (D-05),
 * and per-controller express.Router() construction (ROUTE-05).
 *
 * Phase 3: async buildControllerRouter with per-route handler array composition
 * per D-01 steps 3-12: [...ctrlBefore, ...methodBefore, authGate?, invokeHandler, ...methodAfter, ...ctrlAfter]
 */
import { Router, type Router as RouterT, type RequestHandler } from 'express';
import type { ControllerMetadata, ActionMetadata } from '../types/resolved.js';
import type { InterceptorInterface } from '../interfaces/interceptor.js';
import type { AuthorizationChecker, CurrentUserChecker } from './boot-options.js';
import { toRequestHandlers } from './middleware.js';
import { makeAuthGate } from './auth.js';
import { resolveInterceptorClasses } from './interceptor.js';

/**
 * Compose the final route string from routePrefix + controller basePath + action path.
 * Per D-04:
 *   - strip a trailing '/' from each part
 *   - collapse consecutive '/' to one
 *   - allow empty parts (controller mounts at the prefix root)
 *   - output always starts with '/'
 *   - parts beginning with '{' (path-to-regexp v8 optional-segment wrappers like
 *     `{/:id}` or `{.:ext}`) supply their own delimiter — no '/' separator is
 *     inserted before them.
 */
export function composePath(routePrefix: string, basePath: string, actionPath: string): string {
  const parts = [routePrefix, basePath, actionPath]
    .map(p => p ?? '')
    .map(p => p.replace(/\/+$/g, '')) // strip trailing slashes
    .filter(p => p.length > 0);

  if (parts.length === 0) return '/';

  let out = '';
  for (const part of parts) {
    if (part.startsWith('{')) {
      out += part;
    } else if (part.startsWith('/')) {
      out += part;
    } else {
      out += '/' + part;
    }
  }

  if (!out.startsWith('/')) out = '/' + out;

  // Collapse any consecutive slashes that resulted from the join.
  return out.replace(/\/{2,}/g, '/');
}

/**
 * Detect path-to-regexp v4 patterns that v8 rejects. Throws an actionable error
 * naming the controller, method, offending substring, and a v8 fix suggestion.
 * Must run BEFORE router.METHOD(path, ...) so users see our message, not p2re's
 * terse "Missing parameter name at position N" (per RESEARCH Pitfall C).
 *
 * Detected patterns (D-05):
 *   1. :name(regex) inline regex — e.g. ':id(\\d+)' → move to schema validation
 *   2. :name? optional-param suffix — e.g. ':id?'   → use '{/:id}' optional-segment
 *   3. Unnamed (regex) groups — e.g. '(.*)'         → name the parameter
 *   4. Bare * wildcard (not followed by an identifier char) — e.g. '/files/*' → '*splat'
 *
 * Order matters: check (1) before (3) so ':id(\\d+)' reports as case (1),
 * not case (3); check (2) before (4) for similar reasons.
 */
export function detectV4Pattern(
  composedPath: string,
  controllerName: string,
  methodName: string,
): void {
  const ctx = `[${controllerName}.${methodName}]`;

  // Check 1: :name(regex) inline regex
  const namedRegex = composedPath.match(/:[A-Za-z_$][A-Za-z0-9_$]*\([^)]*\)/);
  if (namedRegex) {
    throw new Error(
      `${ctx} Path "${composedPath}" uses v4 pattern "${namedRegex[0]}"; ` +
        `in path-to-regexp v8 use "move regex to schema validation in the input declaration" instead.`,
    );
  }

  // Check 2: :name? optional-param suffix
  const optionalParam = composedPath.match(/:([A-Za-z_$][A-Za-z0-9_$]*)\?/);
  if (optionalParam) {
    const name = optionalParam[1];
    throw new Error(
      `${ctx} Path "${composedPath}" uses v4 pattern "${optionalParam[0]}"; ` +
        `in path-to-regexp v8 use "{/:${name}} optional segment form" instead.`,
    );
  }

  // Check 3: unnamed (regex) groups — anything (...) not preceded by ':name'
  // We've already eliminated :name(...) above, so any remaining '(' is unnamed.
  const unnamedGroup = composedPath.match(/\([^)]*\)/);
  if (unnamedGroup) {
    throw new Error(
      `${ctx} Path "${composedPath}" uses v4 pattern "${unnamedGroup[0]}"; ` +
        `in path-to-regexp v8 use "name the parameter (e.g. :path)" instead.`,
    );
  }

  // Check 4: bare * wildcard. v8 requires *splat (named) or {*splat} (optional).
  // A '*' is "bare" if not immediately followed by an identifier character.
  const bareWildcard = composedPath.match(/\*(?![A-Za-z_$])/);
  if (bareWildcard) {
    throw new Error(
      `${ctx} Path "${composedPath}" uses v4 pattern "*"; ` +
        `in path-to-regexp v8 use "*splat or {*splat}" instead.`,
    );
  }
}

/**
 * Phase 3 updated HandlerFactory type.
 * The third param is the fully-resolved interceptor chain for this route
 * ([...globalInterceptors, ...controllerInterceptors, ...methodInterceptors]).
 */
export type HandlerFactory = (
  controller: ControllerMetadata,
  action: ActionMetadata,
  resolvedInterceptors: ReadonlyArray<InterceptorInterface>,
) => RequestHandler;

export interface BuiltRouter {
  router: RouterT;
  mountPath: string;
}

/**
 * Phase 3 router options. Replaces the positional (routePrefix, handlerFactory)
 * signature with a structured options object for additive extension.
 */
export interface BuildRouterOptions {
  routePrefix: string;
  handlerFactory: HandlerFactory;
  /** Already-resolved interceptor instances (resolved ONCE at boot, not per-controller). */
  globalInterceptors: ReadonlyArray<InterceptorInterface>;
  authChecker?: AuthorizationChecker;
  currentUserChecker?: CurrentUserChecker;
}

/**
 * Build one express.Router() per controller (ROUTE-05). Validates every
 * composed route path with detectV4Pattern() BEFORE registering with the
 * router (ensures users see our v8-suggestion error, not p2re's terse one).
 *
 * Phase 3: now async. Builds per-route handler arrays per D-01 steps 3-12:
 *   [...ctrlBefore, ...methodBefore, authGate?, invokeHandler, ...methodAfter, ...ctrlAfter]
 *
 * Returns the router plus the mount path (routePrefix + basePath) so the caller
 * can do app.use(mountPath, router).
 *
 * @param controllerMeta Resolved metadata for one controller (from buildMetadata).
 * @param options BuildRouterOptions — Phase 3 structured options.
 */
export async function buildControllerRouter(
  controllerMeta: ControllerMetadata,
  options: BuildRouterOptions,
): Promise<BuiltRouter> {
  const { routePrefix, handlerFactory, globalInterceptors, authChecker, currentUserChecker } = options;
  const router: RouterT = Router();
  const controllerName = controllerMeta.target.name;

  // Resolve controller-level middleware/interceptors once per controller
  const ctrlBeforeHandlers = await toRequestHandlers(controllerMeta.useBefore);
  const ctrlAfterHandlers = await toRequestHandlers(controllerMeta.useAfter);
  const resolvedCtrlInterceptors = await resolveInterceptorClasses(controllerMeta.interceptors);

  for (const action of controllerMeta.actions) {
    const composed = composePath(routePrefix, controllerMeta.basePath, action.path);
    detectV4Pattern(composed, controllerName, String(action.method));

    const routerLocalPath = composePath('', '', action.path);
    const verb = action.verb.toLowerCase();

    const fn = (router as unknown as Record<string, unknown>)[verb];
    if (typeof fn !== 'function') {
      throw new Error(
        `[${controllerName}.${String(action.method)}] Unsupported HTTP verb "${action.verb}" — ` +
          `express.Router has no method "${verb}".`,
      );
    }

    // Per-action middleware/interceptors
    const methodBeforeHandlers = await toRequestHandlers(action.useBefore);
    const methodAfterHandlers = await toRequestHandlers(action.useAfter);
    const resolvedMethodInterceptors = await resolveInterceptorClasses(action.interceptors);

    // D-06 method-wins: if action.authorized is explicitly set (including null),
    // use it; otherwise fall back to controller-level authorized.
    const effectiveAuthorized = action.authorized !== undefined
      ? action.authorized
      : controllerMeta.authorized;

    const authGate = makeAuthGate(effectiveAuthorized, authChecker, currentUserChecker);

    // All interceptors for this route: global → ctrl → method
    const allInterceptors: InterceptorInterface[] = [
      ...globalInterceptors,
      ...resolvedCtrlInterceptors,
      ...resolvedMethodInterceptors,
    ];

    const invokeHandler = handlerFactory(controllerMeta, action, allInterceptors);

    // D-01 steps 3-12 handler array:
    // [...ctrlBefore, ...methodBefore, authGate?, invokeHandler, ...methodAfter, ...ctrlAfter]
    const handlers: RequestHandler[] = [
      ...ctrlBeforeHandlers,
      ...methodBeforeHandlers,
      ...(authGate ? [authGate] : []),
      invokeHandler,
      ...methodAfterHandlers,
      ...ctrlAfterHandlers,
    ];

    (fn as (path: string, ...handlers: RequestHandler[]) => void)
      .call(router, routerLocalPath, ...handlers);
  }

  const mountPath = composePath(routePrefix, controllerMeta.basePath, '');
  return { router, mountPath };
}
