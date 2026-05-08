import type { Action, ClassConstructor } from '../types/action.js';

export interface IocAdapter {
  get<T>(cls: ClassConstructor<T>, action?: Action): T | Promise<T>;
}
