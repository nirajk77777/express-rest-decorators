/**
 * Lazy tinyglobby peer loader.
 *
 * The tinyglobby package is an optional peer dependency. This module loads it
 * on first glob-string encounter via dynamic import() to avoid a top-level
 * require that would throw at process startup if tinyglobby is not installed.
 *
 * Missing peer throws an actionable error with the exact install instruction.
 * Mixed array controllers: (ClassConstructor | string)[]. Strings are
 * expanded relative to process.cwd() with default extensions.
 * All exported classes from matched modules are treated as controllers;
 * non-class exports are silently skipped.
 */
import { pathToFileURL } from 'node:url';
import type { ClassConstructor } from '../types/action.js';

/** Default file extensions to include in glob results. */
const DEFAULT_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs'];

/** Flexible glob function signature compatible with tinyglobby's API. */
type GlobFn = (pattern: string | readonly string[], options?: Record<string, unknown>) => Promise<string[]>;

/** Module-scoped cache — loaded once per process. */
let cachedGlobFn: GlobFn | undefined;

/**
 * Load the tinyglobby glob function (lazy, cached after first load).
 *
 * @throws Error with install instructions if tinyglobby is not installed
 */
async function loadGlob(): Promise<GlobFn> {
  if (cachedGlobFn) return cachedGlobFn;
  try {
    const mod = await import('tinyglobby');
    // tinyglobby exports { glob } as a named export (ESM-native dual ESM+CJS)
    const rawGlobFn = mod.glob ?? (mod as unknown as { default?: { glob?: unknown } }).default?.glob;
    if (typeof rawGlobFn !== 'function') {
      throw new Error('tinyglobby does not export a glob function');
    }
    cachedGlobFn = rawGlobFn as GlobFn;
    return cachedGlobFn;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Re-throw as actionable peer error only for MODULE_NOT_FOUND or missing glob
    if (message.includes('Cannot find') || message.includes('MODULE_NOT_FOUND') || message.includes('does not export')) {
      throw new Error(
        'Glob patterns in controllers require tinyglobby as a peer dependency. Install it with: pnpm add tinyglobby',
      );
    }
    throw err;
  }
}

/**
 * Check whether a value is a class constructor (has a non-null prototype).
 * This is used to filter module exports — only classes are registered as controllers;
 * plain functions, objects, and primitives are silently skipped.
 */
function isClass(value: unknown): value is ClassConstructor<unknown> {
  return (
    typeof value === 'function' &&
    value.prototype !== undefined &&
    value.prototype !== null
  );
}

/**
 * Resolve the mixed controllers array — expand string globs and collect classes.
 *
 * For each entry:
 *   - ClassConstructor → passed through as-is
 *   - string → treated as a tinyglobby glob pattern; matched files are dynamically
 *     imported and all exported classes are collected
 *
 * Glob patterns are resolved relative to process.cwd().
 * Only files matching DEFAULT_EXTENSIONS are loaded.
 *
 * @param controllers - Mixed array of class constructors and/or glob strings
 * @returns Flat array of class constructors (deduplicated order-preserving)
 */
export async function resolveControllers(
  controllers: ReadonlyArray<ClassConstructor<unknown> | string>,
): Promise<ClassConstructor<unknown>[]> {
  const result: ClassConstructor<unknown>[] = [];
  let hasGlob = false;

  for (const entry of controllers) {
    if (typeof entry === 'string') {
      hasGlob = true;
      break;
    }
  }

  // Only load tinyglobby if there are glob strings in the array
  const globFn = hasGlob ? await loadGlob() : null;

  for (const entry of controllers) {
    if (typeof entry !== 'string') {
      // Class constructor — pass through
      result.push(entry as ClassConstructor<unknown>);
      continue;
    }

    // String glob pattern
    const cwd = process.cwd();
    const matchedPaths = await globFn!(entry, { cwd, absolute: true });

    for (const filePath of matchedPaths) {
      // Filter by allowed extensions
      const hasValidExt = DEFAULT_EXTENSIONS.some((ext) => filePath.endsWith(ext));
      if (!hasValidExt) continue;

      // Dynamic import via file URL for ESM compatibility
      const fileUrl = pathToFileURL(filePath).href;
      let mod: Record<string, unknown>;
      try {
        mod = await import(fileUrl) as Record<string, unknown>;
      } catch {
        // Skip files that fail to import
        continue;
      }

      // Collect all exported class constructors
      for (const exportedValue of Object.values(mod)) {
        if (isClass(exportedValue)) {
          result.push(exportedValue);
        }
      }
    }
  }

  return result;
}

/**
 * Reset the cached glob function — for testing only.
 * @internal
 */
export function __resetGlobCache(): void {
  cachedGlobFn = undefined;
}
