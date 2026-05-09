/**
 * Router-build module for Phase 2.
 *
 * Pure functions: path composition (D-04), v4 footgun detection (D-05),
 * and per-controller express.Router() construction (ROUTE-05).
 */
import { Router, type Router as RouterT, type RequestHandler } from 'express';
import type { ControllerMetadata, ActionMetadata } from '../types/resolved.js';

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

export type HandlerFactory = (
  controller: ControllerMetadata,
  action: ActionMetadata,
) => RequestHandler;

export interface BuiltRouter {
  router: RouterT;
  mountPath: string;
}

/**
 * Build one express.Router() per controller (ROUTE-05). Validates every
 * composed route path with detectV4Pattern() BEFORE registering with the
 * router (ensures users see our v8-suggestion error, not p2re's terse one).
 *
 * Returns the router plus the mount path (routePrefix + basePath) so the caller
 * can do app.use(mountPath, router).
 *
 * @param controllerMeta Resolved metadata for one controller (from buildMetadata).
 * @param routePrefix Global route prefix from BootOptions; '' if none.
 * @param handlerFactory Caller-provided factory that produces the Express RequestHandler
 *                       for one action. Plan 02-06 wires this to validation+invoke+response.
 */
export function buildControllerRouter(
  controllerMeta: ControllerMetadata,
  routePrefix: string,
  handlerFactory: HandlerFactory,
): BuiltRouter {
  const router: RouterT = Router();
  const controllerName = controllerMeta.target.name;

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

    const handler = handlerFactory(controllerMeta, action);
    (fn as (path: string, h: RequestHandler) => void).call(router, routerLocalPath, handler);
  }

  const mountPath = composePath(routePrefix, controllerMeta.basePath, '');
  return { router, mountPath };
}
