import type { StandardSchemaV1 } from '../types/standard-schema.js';

export type HookEntry = Function;

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
