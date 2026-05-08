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
}

export interface ControllerArgs {
  basePath: string;
  type: 'json' | 'default';
  responseHandlers: ResponseHandlerArgs[];
}

export interface MethodArgs {
  verb: string;
  path: string;
  input?: InputDeclaration;
  returnType?: Function;
  responseHandlers: ResponseHandlerArgs[];
}
