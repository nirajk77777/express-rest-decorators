import type { Action } from '../types/action.js';

/** Class-form interceptor contract; chained globally → controller → method. */
export interface InterceptorInterface {
  intercept(action: Action, content: unknown): unknown | Promise<unknown>;
}
