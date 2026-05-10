import type { Action } from '../types/action.js';
import type { InterceptorInterface } from '../interfaces/interceptor.js';
import { getContainer } from '../container/use-container.js';
import { isMarkedAsInterceptor } from '../metadata/storage.js';

export type InterceptorInstance = InterceptorInterface;

export async function resolveInterceptorClasses(
  classes: ReadonlyArray<Function>,
): Promise<InterceptorInstance[]> {
  const out: InterceptorInstance[] = [];
  for (const cls of classes) {
    // BL-02 (REVIEW.md, phase 03): @Interceptor() is the documented
    // opt-in contract. Without this check, any class with an `intercept`
    // method (including controllers that happen to expose one) would
    // silently be wired as an interceptor.
    if (!isMarkedAsInterceptor(cls)) {
      throw new Error(
        `[${cls.name || 'AnonymousClass'}] is not decorated with @Interceptor() ` +
          `but was passed to BootOptions.interceptors or @UseInterceptor.`,
      );
    }
    const instance = await Promise.resolve(getContainer().get(cls as never));
    const interceptFn = (instance as { intercept?: unknown }).intercept;
    if (typeof interceptFn !== 'function') {
      throw new Error(
        `[${cls.name || 'AnonymousInterceptor'}] @Interceptor classes must implement an intercept(action, content) method.`,
      );
    }
    out.push(instance as InterceptorInstance);
  }
  return out;
}

export async function runInterceptors(
  instances: ReadonlyArray<InterceptorInstance>,
  action: Action,
  content: unknown,
): Promise<unknown> {
  let value: unknown = content;
  for (const i of instances) {
    value = await i.intercept(action, value);
  }
  return value;
}
