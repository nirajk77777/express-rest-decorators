import type { ResponseHandlerArgs, InputDeclaration, HookEntry } from '../metadata/types.js';

export type { HookEntry } from '../metadata/types.js';

export interface ControllerMetadata {
  target: Function;
  basePath: string;
  type: 'json' | 'default';
  responseHandlers: ResponseHandlerArgs[];
  actions: ActionMetadata[];
  // Phase 3
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
  // Phase 3
  useBefore: HookEntry[];
  useAfter: HookEntry[];
  interceptors: Function[];
  authorized?: string[] | null;
  // Phase 4 D-05/D-06/D-07: response shaper fields
  render?: { template: string };
  redirect?: { template: string; status?: number };
  location?: { template: string };
}

export type ResponseHandlerMetadata = ResponseHandlerArgs;
