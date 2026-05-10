import type { Action } from '../types/action.js';

/** D-07 — class-form interceptor contract; chained per D-09. */
export interface InterceptorInterface {
  intercept(action: Action, content: unknown): unknown | Promise<unknown>;
}
