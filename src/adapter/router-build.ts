/**
 * Router-build module for Phase 2.
 *
 * Pure functions: path composition (D-04), v4 footgun detection (D-05),
 * and per-controller express.Router() construction (ROUTE-05).
 */

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
