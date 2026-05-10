import { describe, it, expect, afterEach } from 'vitest';
import { runInterceptors, resolveInterceptorClasses } from '../../src/adapter/interceptor.js';
import type { InterceptorInterface } from '../../src/interfaces/interceptor.js';
import type { Action } from '../../src/types/action.js';
import { resetContainer, useContainer } from '../../src/container/use-container.js';

const stubAction: Action = { request: {}, response: {} };

// ---------------------------------------------------------------------------
// runInterceptors
// ---------------------------------------------------------------------------
describe('runInterceptors', () => {
  it('returns content unchanged for empty array', async () => {
    const result = await runInterceptors([], stubAction, 42);
    expect(result).toBe(42);
  });

  it('applies a single interceptor that doubles a number', async () => {
    const doubler: InterceptorInterface = {
      intercept(_action, content) {
        return (content as number) * 2;
      },
    };
    const result = await runInterceptors([doubler], stubAction, 5);
    expect(result).toBe(10);
  });

  it('chains three interceptors left-to-right: [+1, *2, -3] applied to 5 = 9', async () => {
    const addOne: InterceptorInterface = {
      intercept(_action, content) { return (content as number) + 1; },
    };
    const timesTwo: InterceptorInterface = {
      intercept(_action, content) { return (content as number) * 2; },
    };
    const minusThree: InterceptorInterface = {
      intercept(_action, content) { return (content as number) - 3; },
    };
    const result = await runInterceptors([addOne, timesTwo, minusThree], stubAction, 5);
    // (5+1)*2 - 3 = 9
    expect(result).toBe(9);
  });

  it('awaits async interceptors and continues chain', async () => {
    const asyncDouble: InterceptorInterface = {
      intercept(_action, content): Promise<unknown> {
        return Promise.resolve((content as number) * 2);
      },
    };
    const addTen: InterceptorInterface = {
      intercept(_action, content) { return (content as number) + 10; },
    };
    const result = await runInterceptors([asyncDouble, addTen], stubAction, 5);
    // (5*2) + 10 = 20
    expect(result).toBe(20);
  });

  it('propagates rejection from a throwing interceptor', async () => {
    const thrower: InterceptorInterface = {
      intercept(_action, _content) {
        throw new Error('interceptor error');
      },
    };
    await expect(runInterceptors([thrower], stubAction, 'value')).rejects.toThrow('interceptor error');
  });

  it('passes action to each interceptor', async () => {
    const capturedActions: Action[] = [];
    const capturer: InterceptorInterface = {
      intercept(action, content) {
        capturedActions.push(action);
        return content;
      },
    };
    await runInterceptors([capturer, capturer], stubAction, 'v');
    expect(capturedActions).toHaveLength(2);
    expect(capturedActions[0]).toBe(stubAction);
    expect(capturedActions[1]).toBe(stubAction);
  });
});

// ---------------------------------------------------------------------------
// resolveInterceptorClasses
// ---------------------------------------------------------------------------
describe('resolveInterceptorClasses', () => {
  afterEach(() => {
    resetContainer();
  });

  it('resolves a single class with intercept method', async () => {
    class I {
      intercept(_action: Action, content: unknown): unknown { return content; }
    }
    const instances = await resolveInterceptorClasses([I]);
    expect(instances).toHaveLength(1);
    expect(instances[0]).toBeInstanceOf(I);
  });

  it('preserves order of resolved interceptors', async () => {
    const order: number[] = [];
    class I1 { intercept(_a: Action, c: unknown): unknown { order.push(1); return c; } }
    class I2 { intercept(_a: Action, c: unknown): unknown { order.push(2); return c; } }
    const instances = await resolveInterceptorClasses([I1, I2]);
    // Run them to verify order
    for (const i of instances) {
      i.intercept(stubAction, null);
    }
    expect(order).toEqual([1, 2]);
  });

  it('throws when resolved instance lacks intercept method', async () => {
    class B {}
    await expect(resolveInterceptorClasses([B])).rejects.toThrow(/B/);
    await expect(resolveInterceptorClasses([B])).rejects.toThrow(/intercept/);
  });

  it('uses the container to resolve instances', async () => {
    class I {
      intercept(_a: Action, c: unknown): unknown { return c; }
    }
    const customInstance = new I();
    useContainer({ get: <T>(_cls: new (...args: any[]) => T) => customInstance as unknown as T });
    const instances = await resolveInterceptorClasses([I]);
    expect(instances[0]).toBe(customInstance);
  });

  it('returns empty array for empty input', async () => {
    const instances = await resolveInterceptorClasses([]);
    expect(instances).toHaveLength(0);
  });
});
