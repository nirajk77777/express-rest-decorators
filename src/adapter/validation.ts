import type { StandardSchemaV1 } from '../types/standard-schema.js';

export function isStandardSchema(x: unknown): x is StandardSchemaV1 {
  if (!x || typeof x !== 'object') return false;
  const ss = (x as Record<string, unknown>)['~standard'];
  if (!ss || typeof ss !== 'object') return false;
  return typeof (ss as Record<string, unknown>).validate === 'function';
}

/**
 * Render a Standard Schema Issue.path into D-09 dotted+bracketed string form.
 * Handles both PropertyKey and PathSegment ({ key }) entries (Pitfall E).
 *   ['user', 'email']           -> 'user.email'
 *   ['items', 0, 'name']        -> 'items[0].name'
 *   [{key:'user'}, {key:0}]     -> 'user[0]'
 */
export function renderPath(
  p?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>
): string {
  if (!p || p.length === 0) return '';
  let out = '';
  for (const seg of p) {
    const key: PropertyKey =
      typeof seg === 'object' && seg !== null && 'key' in seg
        ? (seg as { key: PropertyKey }).key
        : (seg as PropertyKey);
    if (typeof key === 'number') {
      out += `[${key}]`;
    } else if (typeof key === 'string') {
      out += out.length === 0 ? key : `.${key}`;
    } else {
      // symbol — render via String(); only legal as object-key fallback
      out += out.length === 0 ? String(key) : `.${String(key)}`;
    }
  }
  return out;
}
