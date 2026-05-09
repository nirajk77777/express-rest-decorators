import type { ResponseHandlerArgs, InputDeclaration } from '../metadata/types.js';

export interface ControllerMetadata {
  target: Function;
  basePath: string;
  type: 'json' | 'default';
  responseHandlers: ResponseHandlerArgs[];
  actions: ActionMetadata[];
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
}

export type ResponseHandlerMetadata = ResponseHandlerArgs;
