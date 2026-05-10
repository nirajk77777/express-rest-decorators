import type { Request } from 'express';
import type { StandardSchemaV1 } from '../types/standard-schema.js';
import type { InputDeclaration } from '../metadata/types.js';
import { BadRequestError } from '../errors/subclasses.js';
import type { ValidationIssue, ValidationSlot } from '../errors/http-error.js';
import { resolveCookiesArm } from './cookies.js';
import { resolveSessionArm } from './session.js';
import { resolveFilesArm } from './uploads.js';
import type { AnyUploadMarker } from '../types/uploads.js';

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
  currentUser?: unknown;
  /** Phase 4 D-01: resolved per-key cookie values (or undefined if slot not declared). */
  cookies?: Record<string, unknown>;
  /** Phase 4 D-02: resolved session value (or undefined if slot not declared). */
  session?: unknown;
  /** Phase 4 D-03: resolved file entries per field key (or undefined if slot not declared). */
  files?: Record<string, unknown>;
}

type ReqSlot = 'params' | 'query' | 'body' | 'headers';
const SLOTS: ReadonlyArray<ReqSlot> = ['params', 'query', 'body', 'headers'];

interface SlotResult {
  slot: ReqSlot;
  value?: unknown;
  issues?: ValidationIssue[];
}

async function validateSlot(
  slot: ReqSlot,
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

interface CurrentUserSlotResult {
  value?: unknown;
  issues?: ValidationIssue[];
}

/**
 * Resolve and optionally validate the currentUser slot (D-14).
 * Runs as a 5th arm of Promise.all alongside the four SLOTS.
 * If declaration is undefined or resolver is undefined, returns { value: undefined }.
 */
async function validateCurrentUser(
  declaration: true | import('../types/standard-schema.js').StandardSchemaV1 | undefined,
  resolver: (() => Promise<unknown>) | undefined,
): Promise<CurrentUserSlotResult> {
  if (declaration === undefined || resolver === undefined) return { value: undefined };
  const raw = await resolver();
  if (declaration === true) return { value: raw };
  if (!isStandardSchema(declaration)) return { value: raw };
  const out = declaration['~standard'].validate(raw);
  const result = await Promise.resolve(out);
  if (result.issues) {
    return {
      issues: result.issues.map((iss) => ({
        slot: 'currentUser' as ValidationSlot,
        path: renderPath(iss.path),
        message: iss.message,
      })),
    };
  }
  return { value: result.value };
}

/**
 * Run all four input slots through Standard Schema validators concurrently (D-06).
 * Aggregates every issue from every failing slot into a single BadRequestError (D-07).
 * Validated values replace raw req values in the returned object; req is NOT mutated (D-10, Pitfall F).
 *
 * The wrapper in Plan 02-05 attaches err.source after this throws.
 *
 * D-14: Optional 5th currentUser arm resolved via provided closure (caller supplies closure
 * with checker + action already bound so this function stays Express/auth-agnostic).
 */
export async function resolveInputs(
  req: Pick<Request, 'params' | 'query' | 'body' | 'headers'> & { session?: unknown },
  input?: InputDeclaration,
  currentUserResolver?: () => Promise<unknown>,
): Promise<ResolvedArgs> {
  const decl = input ?? {};
  const [results, currentUserResult, cookiesResult, sessionResult, filesResult] = await Promise.all([
    Promise.all(
      SLOTS.map((s) =>
        validateSlot(s, (decl as Record<ReqSlot, unknown>)[s], req[s])
      )
    ),
    validateCurrentUser(decl.currentUser, currentUserResolver),
    // Phase 4 D-04: cookies arm (arm 6)
    resolveCookiesArm(req as Request, decl.cookies),
    // Phase 4 D-04: session arm (arm 7)
    resolveSessionArm(req as Request, decl.session),
    // Phase 4 D-04: files arm (arm 8) — no issues; multer rejects at mw layer
    Promise.resolve(resolveFilesArm(req as Request, decl.files as Record<string, AnyUploadMarker> | undefined)),
  ]);

  const allIssues: ValidationIssue[] = [];
  for (const r of results) if (r.issues) allIssues.push(...r.issues);
  if (currentUserResult.issues) allIssues.push(...currentUserResult.issues);
  if (cookiesResult.issues) allIssues.push(...cookiesResult.issues);
  if (sessionResult.issues) allIssues.push(...sessionResult.issues);

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
  args.currentUser = currentUserResult.value;
  args.cookies = cookiesResult.value;
  args.session = sessionResult.value;
  args.files = filesResult.value;
  return args;
}
