import { describe, it, expect } from 'vitest';
import {
  markAsMiddleware,
  getMiddlewareType,
  getRegisteredMiddlewareClasses,
} from '../../src/metadata/storage.js';

describe('markAsMiddleware / getMiddlewareType', () => {
  it('round-trips type before', () => {
    class MwBefore {}
    markAsMiddleware(MwBefore, 'before');
    expect(getMiddlewareType(MwBefore)).toBe('before');
  });

  it('round-trips type after', () => {
    class MwAfter {}
    markAsMiddleware(MwAfter, 'after');
    expect(getMiddlewareType(MwAfter)).toBe('after');
  });

  it('last-write-wins on re-marking with a different type', () => {
    class MwRewrite {}
    markAsMiddleware(MwRewrite, 'before');
    markAsMiddleware(MwRewrite, 'after');
    expect(getMiddlewareType(MwRewrite)).toBe('after');
  });

  it('WeakMap isolation: marking A does not affect B', () => {
    class A {}
    class B {}
    markAsMiddleware(A, 'before');
    expect(getMiddlewareType(B)).toBeUndefined();
  });

  it('returns undefined for a class never marked', () => {
    class Unmarked {}
    expect(getMiddlewareType(Unmarked)).toBeUndefined();
  });
});

describe('getRegisteredMiddlewareClasses', () => {
  it('contains all classes that were passed to markAsMiddleware', () => {
    class C {}
    class D {}
    markAsMiddleware(C, 'before');
    markAsMiddleware(D, 'after');

    const set = getRegisteredMiddlewareClasses();
    expect(set.has(C)).toBe(true);
    expect(set.has(D)).toBe(true);
  });

  it('returns a ReadonlySet (iterable)', () => {
    class E {}
    markAsMiddleware(E, 'after');
    const set = getRegisteredMiddlewareClasses();
    const items = [...set];
    expect(items.length).toBeGreaterThan(0);
    expect(items).toContain(E);
  });
});
