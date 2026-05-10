import { describe, it, expect, vi, afterEach } from 'vitest';
import { isClassForm, resolveMiddlewareClass, toRequestHandlers } from '../../src/adapter/middleware.js';
import { resetContainer, useContainer } from '../../src/container/use-container.js';

// ---------------------------------------------------------------------------
// isClassForm
// ---------------------------------------------------------------------------
describe('isClassForm', () => {
  it('returns false for arrow functions', () => {
    const arrow = () => {};
    expect(isClassForm(arrow)).toBe(false);
  });

  it('returns true for named function declarations', () => {
    function fn() {}
    expect(isClassForm(fn)).toBe(true);
  });

  it('returns true for class constructors', () => {
    class C {}
    expect(isClassForm(C)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isClassForm(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isClassForm(undefined)).toBe(false);
  });

  it('returns false for strings', () => {
    expect(isClassForm('string')).toBe(false);
  });

  it('returns false for bound functions (Function.prototype.bind strips prototype)', () => {
    function fn() {}
    const bound = fn.bind(null);
    expect(isClassForm(bound)).toBe(false);
  });

  it('returns false for numbers', () => {
    expect(isClassForm(42)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveMiddlewareClass
// ---------------------------------------------------------------------------
describe('resolveMiddlewareClass', () => {
  afterEach(() => {
    resetContainer();
  });

  it('resolves a class-form middleware with a use() method', async () => {
    class M {
      use(req: unknown, res: unknown, next: unknown) {
        void req; void res; void next;
      }
    }
    const { instance, useFn } = await resolveMiddlewareClass(M);
    expect(instance).toBeInstanceOf(M);
    expect(typeof useFn).toBe('function');
  });

  it('throws when resolved instance lacks a use() method', async () => {
    class B {}
    await expect(resolveMiddlewareClass(B)).rejects.toThrow(/B/);
    await expect(resolveMiddlewareClass(B)).rejects.toThrow(/use\(\)/);
  });

  it('uses the container to resolve instances', async () => {
    class M {
      use(req: unknown, res: unknown, next: unknown) {
        void req; void res; void next;
      }
    }
    const customInstance = new M();
    useContainer({ get: <T>(_cls: new (...args: any[]) => T) => customInstance as unknown as T });
    const { instance } = await resolveMiddlewareClass(M);
    expect(instance).toBe(customInstance);
  });
});

// ---------------------------------------------------------------------------
// toRequestHandlers
// ---------------------------------------------------------------------------
describe('toRequestHandlers', () => {
  afterEach(() => {
    resetContainer();
  });

  it('passes through function-form entries unchanged', async () => {
    // vi.fn() spy has a .prototype — use an actual arrow function (no .prototype) to
    // ensure it is treated as function-form (not class-form).
    const called: unknown[] = [];
    const arrowFn = (req: unknown, res: unknown, next: unknown) => { called.push(req, res, next); };
    const handlers = await toRequestHandlers([arrowFn]);
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(arrowFn);
  });

  it('converts class-form middleware to RequestHandler that calls instance.use', async () => {
    const useSpy = vi.fn();
    class ClassMw {
      use(req: unknown, res: unknown, next: unknown) {
        useSpy(req, res, next);
      }
    }
    const handlers = await toRequestHandlers([ClassMw]);
    expect(handlers).toHaveLength(1);

    const mockReq = {} as any;
    const mockRes = {} as any;
    const mockNext = vi.fn();
    handlers[0]!(mockReq, mockRes, mockNext);
    expect(useSpy).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
    expect(useSpy).toHaveBeenCalledTimes(1);
  });

  it('handles mixed array of function-form and class-form', async () => {
    // Use a real arrow function (no .prototype) as the function-form entry.
    const useSpy = vi.fn();
    const arrowFn = (_req: unknown, _res: unknown, _next: unknown) => {};
    class ClassMw {
      use(req: unknown, res: unknown, next: unknown) {
        useSpy(req, res, next);
      }
    }
    const handlers = await toRequestHandlers([arrowFn, ClassMw]);
    expect(handlers).toHaveLength(2);

    // Arrow function is identity-passed
    expect(handlers[0]).toBe(arrowFn);

    // Class handler wraps instance.use
    const mockReq = {} as any;
    const mockRes = {} as any;
    const mockNext = vi.fn();
    handlers[1]!(mockReq, mockRes, mockNext);
    expect(useSpy).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
  });

  it('resolves class instances once at compose time (not per request)', async () => {
    const useSpy = vi.fn();
    let constructorCount = 0;
    class ClassMw {
      constructor() { constructorCount++; }
      use(req: unknown, res: unknown, next: unknown) {
        useSpy(req, res, next);
      }
    }
    const handlers = await toRequestHandlers([ClassMw]);
    // Instance resolved once
    expect(constructorCount).toBe(1);
    // Calling the handler multiple times does NOT create new instances
    const mockReq = {} as any;
    const mockRes = {} as any;
    const mockNext = vi.fn();
    handlers[0]!(mockReq, mockRes, mockNext);
    handlers[0]!(mockReq, mockRes, mockNext);
    expect(constructorCount).toBe(1);
    expect(useSpy).toHaveBeenCalledTimes(2);
  });

  it('returns empty array for empty input', async () => {
    const handlers = await toRequestHandlers([]);
    expect(handlers).toHaveLength(0);
  });
});
