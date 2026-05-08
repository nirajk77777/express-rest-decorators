import { describe, it, expect } from 'vitest';
import { DefaultContainer } from '../../src/container/default-container.js';

class MyClass {}
class OtherClass {}

describe('DefaultContainer', () => {
  it('D1: get(MyClass) returns an instance of MyClass', () => {
    const c = new DefaultContainer();
    const instance = c.get(MyClass);
    expect(instance).toBeInstanceOf(MyClass);
  });

  it('D2: calling get(MyClass) twice returns the SAME reference', () => {
    const c = new DefaultContainer();
    const first = c.get(MyClass);
    const second = c.get(MyClass);
    expect(first).toBe(second);
  });

  it('D3: get(MyClass) and get(OtherClass) return distinct instances', () => {
    const c = new DefaultContainer();
    const myInstance = c.get(MyClass);
    const otherInstance = c.get(OtherClass);
    expect(myInstance).not.toBe(otherInstance);
  });

  it('D4: a class with a zero-arg constructor instantiates without throwing', () => {
    const c = new DefaultContainer();
    expect(() => c.get(MyClass)).not.toThrow();
  });
});
