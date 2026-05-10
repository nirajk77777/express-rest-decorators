import type { StandardSchemaV1 } from '../types/standard-schema.js';

/**
 * A middleware-hook entry — either a function-form RequestHandler or a
 * class constructor whose instances implement ExpressMiddlewareInterface
 * (a `use` method). The runtime distinguishes the two via
 * `isClassForm()` (see src/adapter/middleware.ts).
 *
 * WR-04: this alias is intentionally a structural union rather than the
 * bare `Function` foot-gun. Storage-layer maps still receive raw
 * `Function` references because legacy decorators pass class constructors
 * as `Function` in their metadata APIs — those sites are documented at
 * each occurrence.
 */
export type HookEntry =
  | ((...args: unknown[]) => unknown)
  | (new (...args: never[]) => { use: (...a: unknown[]) => unknown });

export type ResponseHandlerType =
  | 'success-code'
  | 'null-result-code'
  | 'undefined-result-code'
  | 'header'
  | 'content-type';

export interface ResponseHandlerArgs {
  type: ResponseHandlerType;
  value: string | number;
  secondaryValue?: string;
}

export interface InputDeclaration {
  params?: unknown;
  query?: unknown;
  body?: unknown;
  headers?: unknown;
  currentUser?: true | StandardSchemaV1;
  /** Phase 4 D-01: per-key cookie declaration. true = pass-through; schema = validate. */
  cookies?: Record<string, true | StandardSchemaV1>;
  /** Phase 4 D-02: session pass-through (true) or validated. req.session is wired by the consumer. */
  session?: true | StandardSchemaV1;
  /** Phase 4 D-03: slot-based file upload declarations. Factory functions UploadedFile/UploadedFiles return markers. */
  files?: Record<string, import('../types/uploads.js').AnyUploadMarker>;
}

export interface ControllerArgs {
  basePath: string;
  type: 'json' | 'default';
  responseHandlers: ResponseHandlerArgs[];
  useBefore?: HookEntry[];
  useAfter?: HookEntry[];
  interceptors?: Function[];
  authorized?: string[] | null;
}

export interface MethodArgs {
  verb: string;
  path: string;
  input?: InputDeclaration;
  returnType?: Function;
  paramTypes?: Function[];
  responseHandlers: ResponseHandlerArgs[];
  useBefore?: HookEntry[];
  useAfter?: HookEntry[];
  interceptors?: Function[];
  authorized?: string[] | null;
  /** Phase 4 D-06: @Render shaper metadata */
  render?: { template: string };
  /** Phase 4 D-05: @Redirect shaper metadata */
  redirect?: { template: string; status?: number };
  /** Phase 4 D-07: @Location shaper metadata */
  location?: { template: string };
}
