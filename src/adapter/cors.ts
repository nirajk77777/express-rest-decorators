/**
 * Lazy cors peer loader.
 *
 * The cors package is an optional peer dependency. This module loads it on
 * first call via dynamic import() to avoid a top-level require that would
 * throw at process startup if cors is not installed.
 *
 * Missing peer throws an actionable error with the exact install instruction.
 * CORS middleware must be mounted AFTER ALS wrapper and BEFORE lib globals.
 */
import type { RequestHandler } from 'express';
import type { CorsOptionsLike } from './boot-options.js';

/** Module-scoped cache — loaded once per process. */
let cachedCorsFn: ((opts?: unknown) => RequestHandler) | undefined;

/**
 * Load the cors middleware factory (lazy, cached after first load).
 * Returns a configured cors RequestHandler ready for app.use().
 *
 * @param corsOptions - cors configuration options, or undefined for defaults (origin: *)
 * @throws Error with install instructions if the cors package is not installed
 */
export async function loadCorsMiddleware(corsOptions?: CorsOptionsLike): Promise<RequestHandler> {
  if (!cachedCorsFn) {
    try {
      // Dynamic import — cors is an optional peer; @types/cors is a devDep.
      // The cast via `unknown` avoids tsc complaining about the module not being
      // resolvable at compile time (consumers install cors themselves).
      const mod = await import('cors') as unknown as {
        default?: (opts?: unknown) => RequestHandler;
        (opts?: unknown): RequestHandler;
      };
      // CJS-in-ESM interop: cors is a CJS module; ESM dynamic import wraps it with .default
      cachedCorsFn = (mod.default ?? (mod as unknown as (opts?: unknown) => RequestHandler));
    } catch {
      throw new Error(
        'cors boot option requires cors as a peer dependency. Install it with: pnpm add cors',
      );
    }
  }
  return cachedCorsFn(corsOptions);
}

/**
 * Reset the cached cors function — for testing only.
 * @internal
 */
export function __resetCorsCache(): void {
  cachedCorsFn = undefined;
}
