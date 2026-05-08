import type { ClassConstructor } from '../types/action.js';
import type { IocAdapter } from './ioc-adapter.js';

export class DefaultContainer implements IocAdapter {
  private readonly cache = new WeakMap<ClassConstructor<unknown>, unknown>();

  get<T>(cls: ClassConstructor<T>): T {
    let cached = this.cache.get(cls) as T | undefined;
    if (cached === undefined) {
      cached = new cls();
      this.cache.set(cls, cached);
    }
    return cached;
  }
}
