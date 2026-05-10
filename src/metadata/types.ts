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
}
