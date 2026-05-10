import type { Action } from '../types/action.js';
import type { InterceptorInterface } from '../interfaces/interceptor.js';
import { getContainer } from '../container/use-container.js';

export type InterceptorInstance = InterceptorInterface;

export async function resolveInterceptorClasses(
  classes: ReadonlyArray<Function>,
): Promise<InterceptorInstance[]> {
  const out: InterceptorInstance[] = [];
  for (const cls of classes) {
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
