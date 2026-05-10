import type { ResponseHandlerArgs, InputDeclaration, HookEntry } from '../metadata/types.js';

export type { HookEntry } from '../metadata/types.js';

export interface ControllerMetadata {
  target: Function;
  basePath: string;
  type: 'json' | 'default';
  responseHandlers: ResponseHandlerArgs[];
  actions: ActionMetadata[];
  useBefore: HookEntry[];
  useAfter: HookEntry[];
  interceptors: Function[];
  authorized?: string[] | null;
}

export interface ActionMetadata {
  target: Function;
  method: string | symbol;
  verb: string;
  path: string;
  input?: InputDeclaration;
  returnType?: Function;
  paramTypes?: Function[];
  responseHandlers: ResponseHandlerArgs[];
  useBefore: HookEntry[];
  useAfter: HookEntry[];
  interceptors: Function[];
  authorized?: string[] | null;
  // Response shaper fields
  render?: { template: string };
  redirect?: { template: string; status?: number };
  location?: { template: string };
}

export type ResponseHandlerMetadata = ResponseHandlerArgs;
