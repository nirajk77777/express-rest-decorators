import { describe, it, expect, afterEach } from 'vitest';
import { useContainer, getContainer, resetContainer } from '../../src/container/use-container.js';

class MyClass {}

afterEach(() => {
  resetContainer();
});

describe('useContainer / getContainer / resetContainer', () => {
  it('U1: without calling useContainer, getContainer() resolves MyClass to an instance', () => {
    const instance = getContainer().get(MyClass);
    expect(instance).toBeInstanceOf(MyClass);
  });

  it('U2: after useContainer(myAdapter), getContainer() returns myAdapter', () => {
    const myAdapter = { get: <T>(cls: new () => T) => new cls() };
    useContainer(myAdapter);
    expect(getContainer()).toBe(myAdapter);
  });

  it('U3: after useContainer then resetContainer, getContainer() resolves MyClass to an instance', () => {
    const myAdapter = { get: <T>(cls: new () => T) => new cls() };
    useContainer(myAdapter);
    resetContainer();
    const instance = getContainer().get(MyClass);
    expect(instance).toBeInstanceOf(MyClass);
  });

  it('U4: a custom adapter that returns a Promise resolves correctly', async () => {
    useContainer({ get: async <T>(cls: new () => T) => new cls() });
    const result = await getContainer().get(MyClass);
    expect(result).toBeInstanceOf(MyClass);
  });

  it('U5: an adapter that uses the action argument records the action', () => {
    useContainer({
      get: (cls: unknown, action?: unknown) => ({ cls, action }) as any,
    });
    const action = { request: 1, response: 2 };
    const result = getContainer().get(MyClass, action as any);
    expect((result as any).action).toBe(action);
  });
});
