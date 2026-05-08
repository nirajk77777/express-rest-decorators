export interface Action {
  request: unknown;
  response: unknown;
  next?: unknown;
}
export type ClassConstructor<T> = new (...args: any[]) => T;
