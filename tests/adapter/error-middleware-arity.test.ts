/**
 * Tests for isErrorMiddlewareInstance() helper — D-15 arity detection.
 * Express mounts error middleware as 4-arg functions (err, req, res, next).
 * We detect this via use.length === 4 on the resolved instance.
 */
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { isErrorMiddlewareInstance } from '../../src/adapter/error-middleware.js';

describe('isErrorMiddlewareInstance (D-15 arity detection)', () => {
  it('returns false for a 3-arg use method (non-error middleware)', () => {
    class M {
      use(_req: unknown, _res: unknown, _next: unknown) {}
    }
    expect(isErrorMiddlewareInstance(new M())).toBe(false);
  });

  it('returns true for a 4-arg use method (error middleware)', () => {
    class E {
      use(_err: unknown, _req: unknown, _res: unknown, _next: unknown) {}
    }
    expect(isErrorMiddlewareInstance(new E())).toBe(true);
  });

  it('returns true for a 4-arg arrow class field', () => {
    class A {
      use = (_err: unknown, _req: unknown, _res: unknown, _next: unknown) => {};
    }
    expect(isErrorMiddlewareInstance(new A())).toBe(true);
  });

  it('returns false for rest-args arrow (length === 0) — Pitfall 2 footgun', () => {
    class B {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      use = (..._args: unknown[]) => {};
    }
    expect(isErrorMiddlewareInstance(new B())).toBe(false);
  });

  it('returns false for null', () => {
    expect(isErrorMiddlewareInstance(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isErrorMiddlewareInstance(undefined)).toBe(false);
  });

  it('returns false for empty object {}', () => {
    expect(isErrorMiddlewareInstance({})).toBe(false);
  });

  it('returns false when use is a string, not a function', () => {
    expect(isErrorMiddlewareInstance({ use: 'string' })).toBe(false);
  });

  it('returns false for a primitive number', () => {
    expect(isErrorMiddlewareInstance(42)).toBe(false);
  });
});
