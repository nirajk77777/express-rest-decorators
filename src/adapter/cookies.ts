import type { Request } from 'express';
import type { StandardSchemaV1 } from '../types/standard-schema.js';
import type { ValidationIssue } from '../errors/http-error.js';
import { renderPath } from './validation.js';

export type CookiesDeclaration = Record<string, true | StandardSchemaV1>;

type ParseFn = (str: string, options?: Record<string, unknown>) => Record<string, string | undefined>;

let cachedParse: ParseFn | null = null;

async function loadCookieParse(): Promise<ParseFn> {
  if (cachedParse) return cachedParse;
  try {
    const mod = await import('cookie') as { default?: { parse: ParseFn }; parse?: ParseFn };
    const parse = mod.default?.parse ?? mod.parse;
    if (typeof parse !== 'function') {
      throw new Error('cookie package loaded but parse is not a function');
    }
    cachedParse = parse as ParseFn;
    return cachedParse;
  } catch {
    throw new Error(
      'cookies slot requires cookie as a peer dependency. Install it with: pnpm add cookie',
    );
  }
}

export interface CookiesArmResult {
  value?: Record<string, unknown>;
  issues?: ValidationIssue[];
}

export async function resolveCookiesArm(
  req: Request,
  declaration: CookiesDeclaration | undefined,
): Promise<CookiesArmResult> {
  if (!declaration) return { value: undefined };
  const parse = await loadCookieParse();
  const header = (req.headers?.cookie ?? '') as string;
  const parsed = parse(header);
  const out: Record<string, unknown> = {};
  const issues: ValidationIssue[] = [];

  for (const [key, schemaOrTrue] of Object.entries(declaration)) {
    const raw = parsed[key];
    if (schemaOrTrue === true) {
      out[key] = raw;
      continue;
    }
    const result = await Promise.resolve(schemaOrTrue['~standard'].validate(raw));
    if (result.issues && result.issues.length > 0) {
      for (const iss of result.issues) {
        issues.push({
          slot: 'cookies',
          path: key + (iss.path && iss.path.length > 0 ? '.' + renderPath(iss.path) : ''),
          message: iss.message ?? String(iss),
        } satisfies ValidationIssue);
      }
    } else if ('value' in result) {
      out[key] = result.value;
    }
  }

  if (issues.length > 0) return { issues };
  return { value: out };
}

/** Test-only — reset module-cached `cookie.parse` so repeated lazy-load can be verified. */
export function __resetCookieCacheForTest(): void {
  cachedParse = null;
}
