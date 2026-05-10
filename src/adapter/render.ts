/**
 * Response shaper helpers for @Render, @Redirect, and @Location decorators.
 * Phase 4 D-05 / D-06 / D-07.
 *
 * Security note (T-04-16): interpolateTemplate uses a strict regex to match
 * only valid JS identifiers as placeholder names. Templates are developer-authored
 * at decorator time (compile-time constants); only values come from runtime data.
 * Substituted values are stringified via String() — no URL-encoding applied.
 * Callers are responsible for URL-encoding when needed.
 *
 * Security note (T-04-18): one replace() call per template — linear time,
 * no recursion, no DoS risk.
 */
import type { Response } from 'express';

/**
 * Interpolate `:name` placeholders in a template URL from a plain object.
 *
 * - Placeholder regex: `/:([A-Za-z_$][A-Za-z0-9_$]*)/g` — only valid JS identifiers.
 * - Missing key → throws actionable error naming the template and missing key.
 * - Values are coerced to string via String() — no URL-encoding applied.
 */
export function interpolateTemplate(
  template: string,
  data: Record<string, unknown>,
  source: string,
): string {
  return template.replace(/:([A-Za-z_$][A-Za-z0-9_$]*)/g, (_match, key: string) => {
    if (!(key in data)) {
      throw new Error(
        `[${source}] @Redirect/@Location template "${template}" references ":${key}" ` +
          `but handler return value has no "${key}" property.`,
      );
    }
    return String(data[key]);
  });
}

/**
 * Apply @Redirect shaper (Phase 4 D-05):
 * - handler returned string → use verbatim (override template entirely)
 * - handler returned undefined or null → use bare template
 * - handler returned object → interpolate :name placeholders from object
 * - any other value → use bare template (fallback)
 *
 * Calls res.redirect(status, url). Does NOT call next() — caller must do so.
 */
export function applyRedirect(
  res: Response,
  template: string,
  status: number,
  value: unknown,
  source: string,
): void {
  let url: string;
  if (typeof value === 'string') {
    url = value;
  } else if (value === undefined || value === null) {
    url = template;
  } else if (typeof value === 'object' && value !== null) {
    url = interpolateTemplate(template, value as Record<string, unknown>, source);
  } else {
    url = template;
  }
  res.redirect(status, url);
}

/**
 * Apply @Render shaper (Phase 4 D-06):
 * - undefined or null → res.render(template) with no locals
 * - object → res.render(template, locals)
 * - anything else → throws actionable error
 *
 * Does NOT call next() — caller must do so.
 */
export function applyRender(
  res: Response,
  template: string,
  value: unknown,
  source: string,
): void {
  if (value === undefined || value === null) {
    res.render(template);
    return;
  }
  if (typeof value !== 'object') {
    throw new Error(
      `[${source}] @Render expects an object or undefined; got ${typeof value} from handler return.`,
    );
  }
  res.render(template, value as Record<string, unknown>);
}

/**
 * Apply @Location shaper (Phase 4 D-07):
 * - Sets the Location response header only (does NOT redirect).
 * - Same URL resolution as @Redirect: string overrides, object interpolates, undefined uses template.
 * - Does NOT send a response body or status — caller falls through to writeResponse.
 */
export function applyLocation(
  res: Response,
  template: string,
  value: unknown,
  source: string,
): void {
  let url: string;
  if (typeof value === 'string') {
    url = value;
  } else if (value === undefined || value === null) {
    url = template;
  } else if (typeof value === 'object' && value !== null) {
    url = interpolateTemplate(template, value as Record<string, unknown>, source);
  } else {
    url = template;
  }
  res.location(url);
}
