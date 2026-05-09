import type { Request } from 'express';
import type { StandardSchemaV1 } from '../types/standard-schema.js';
import type { InputDeclaration } from '../metadata/types.js';
import { BadRequestError } from '../errors/subclasses.js';
import type { ValidationIssue, ValidationSlot } from '../errors/http-error.js';

export function isStandardSchema(x: unknown): x is StandardSchemaV1 {
  // ArkType's schema is a callable (typeof === 'function') — Standard Schema spec
  // allows ~standard to live on any object-like value, including functions.
  if (x === null || x === undefined) return false;
  const t = typeof x;
  if (t !== 'object' && t !== 'function') return false;
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

export interface ResolvedArgs {
  params: unknown;
  query: unknown;
  body: unknown;
  headers: unknown;
}

const SLOTS: ReadonlyArray<ValidationSlot> = ['params', 'query', 'body', 'headers'];

interface SlotResult {
  slot: ValidationSlot;
  value?: unknown;
  issues?: ValidationIssue[];
}

async function validateSlot(
  slot: ValidationSlot,
  schema: unknown,
  raw: unknown
): Promise<SlotResult> {
  if (!isStandardSchema(schema)) {
    return { slot, value: raw };
  }
  // Pitfall D: validate may return Result<T> OR Promise<Result<T>>.
  const out = schema['~standard'].validate(raw);
  const result = await Promise.resolve(out);
  if (result.issues) {
    const issues: ValidationIssue[] = result.issues.map((iss) => ({
      slot,
      path: renderPath(iss.path),
      message: iss.message,
    }));
    return { slot, issues };
  }
  return { slot, value: result.value };
}

/**
 * Run all four input slots through Standard Schema validators concurrently (D-06).
 * Aggregates every issue from every failing slot into a single BadRequestError (D-07).
 * Validated values replace raw req values in the returned object; req is NOT mutated (D-10, Pitfall F).
 *
 * The wrapper in Plan 02-05 attaches err.source after this throws.
 */
export async function resolveInputs(
  req: Pick<Request, 'params' | 'query' | 'body' | 'headers'>,
  input?: InputDeclaration
): Promise<ResolvedArgs> {
  const decl = input ?? {};
  const results = await Promise.all(
    SLOTS.map((s) =>
      validateSlot(s, (decl as Record<ValidationSlot, unknown>)[s], req[s])
    )
  );

  const allIssues: ValidationIssue[] = [];
  for (const r of results) if (r.issues) allIssues.push(...r.issues);

  if (allIssues.length > 0) {
    throw new BadRequestError('Validation failed', { details: allIssues });
  }

  const args: ResolvedArgs = {
    params: undefined,
    query: undefined,
    body: undefined,
    headers: undefined,
  };
  for (const r of results) {
    args[r.slot] = r.value;
  }
  return args;
}
