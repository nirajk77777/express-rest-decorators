import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import {
  UseBefore,
  UseAfter,
  UseInterceptor,
  Middleware,
  Interceptor,
  Authorized,
} from '../../src/decorators/middleware.js';
import {
  getControllerArgs,
  getAllMethodArgs,
  getMiddlewareType,
  isMarkedAsInterceptor,
} from '../../src/metadata/storage.js';

// ─── helpers ───────────────────────────────────────────────────────────────

function fn(name: string) {
  return function namedFn() { return name; };
}

// ─── UseBefore ─────────────────────────────────────────────────────────────

describe('@UseBefore', () => {
  it('adds handlers to controller useBefore', () => {
    const a = fn('a'), b = fn('b');
    @UseBefore(a, b)
    class Ctrl {}
    const meta = getControllerArgs(Ctrl);
    expect(meta?.useBefore).toEqual([a, b]);
  });

  it('appends when stacked multiple times on a controller', () => {
    const a = fn('a'), b = fn('b'), c = fn('c');
    @UseBefore(c)
    @UseBefore(a, b)
    class Ctrl {}
    // decorators apply bottom-up, so [a,b] first, then [c] appended
    const meta = getControllerArgs(Ctrl);
    expect(meta?.useBefore).toEqual([a, b, c]);
  });

  it('adds handlers to method useBefore', () => {
    const a = fn('a');
    class Ctrl {
      @UseBefore(a)
      get() {}
    }
    const map = getAllMethodArgs(Ctrl.prototype);
    expect(map.get('get')?.useBefore).toEqual([a]);
  });

  it('appends when stacked on same method', () => {
    const a = fn('a'), b = fn('b'), c = fn('c');
    class Ctrl {
      @UseBefore(c)
      @UseBefore(a, b)
      get() {}
    }
    const map = getAllMethodArgs(Ctrl.prototype);
    expect(map.get('get')?.useBefore).toEqual([a, b, c]);
  });
});

// ─── UseAfter ──────────────────────────────────────────────────────────────

describe('@UseAfter', () => {
  it('adds handlers to controller useAfter', () => {
    const a = fn('a');
    @UseAfter(a)
    class Ctrl {}
    const meta = getControllerArgs(Ctrl);
    expect(meta?.useAfter).toEqual([a]);
  });

  it('adds handlers to method useAfter', () => {
    const a = fn('a'), b = fn('b');
    class Ctrl {
      @UseAfter(a, b)
      get() {}
    }
    const map = getAllMethodArgs(Ctrl.prototype);
    expect(map.get('get')?.useAfter).toEqual([a, b]);
  });
});

// ─── UseInterceptor ────────────────────────────────────────────────────────

describe('@UseInterceptor', () => {
  it('adds interceptors to controller', () => {
    class I1 {}
    class I2 {}
    @UseInterceptor(I1, I2)
    class Ctrl {}
    const meta = getControllerArgs(Ctrl);
    expect(meta?.interceptors).toEqual([I1, I2]);
  });

  it('appends when stacked on method', () => {
    class I1 {}
    class I2 {}
    class I3 {}
    class Ctrl {
      @UseInterceptor(I3)
      @UseInterceptor(I1, I2)
      get() {}
    }
    const map = getAllMethodArgs(Ctrl.prototype);
    expect(map.get('get')?.interceptors).toEqual([I1, I2, I3]);
  });
});

// ─── Middleware ─────────────────────────────────────────────────────────────

describe('@Middleware', () => {
  it('marks class as before middleware', () => {
    @Middleware({ type: 'before' })
    class GlobalMw {}
    expect(getMiddlewareType(GlobalMw)).toBe('before');
  });

  it('marks class as after middleware', () => {
    @Middleware({ type: 'after' })
    class GlobalMw {}
    expect(getMiddlewareType(GlobalMw)).toBe('after');
  });

  it('throws TypeError for invalid type', () => {
    expect(() => {
      Middleware({ type: 'invalid' as 'before' });
    }).toThrow(TypeError);
  });
});

// ─── Interceptor ───────────────────────────────────────────────────────────

describe('@Interceptor', () => {
  it('marks class as interceptor', () => {
    @Interceptor()
    class GlobalI {}
    expect(isMarkedAsInterceptor(GlobalI)).toBe(true);
  });

  it('returns false for non-interceptor class', () => {
    class NotInterceptor {}
    expect(isMarkedAsInterceptor(NotInterceptor)).toBe(false);
  });
});

// ─── Authorized ────────────────────────────────────────────────────────────

describe('@Authorized', () => {
  it('@Authorized() with no args → null', () => {
    @Authorized()
    class Ctrl {}
    expect(getControllerArgs(Ctrl)?.authorized).toBeNull();
  });

  it('@Authorized("admin") → [admin]', () => {
    @Authorized('admin')
    class Ctrl {}
    expect(getControllerArgs(Ctrl)?.authorized).toEqual(['admin']);
  });

  it('@Authorized(["a","b"]) → [a,b]', () => {
    @Authorized(['a', 'b'])
    class Ctrl {}
    expect(getControllerArgs(Ctrl)?.authorized).toEqual(['a', 'b']);
  });

  it('last-write-wins on stacked decorators on a method', () => {
    class Ctrl {
      @Authorized('admin')
      @Authorized('user')
      get() {}
    }
    const map = getAllMethodArgs(Ctrl.prototype);
    expect(map.get('get')?.authorized).toEqual(['admin']);
  });

  it('writes to method WeakMap, NOT controller WeakMap', () => {
    class Ctrl {
      @Authorized('mod')
      get() {}
    }
    const ctrlMeta = getControllerArgs(Ctrl);
    const methodMap = getAllMethodArgs(Ctrl.prototype);
    // Controller should not have authorized set (unless @Authorized is also on class)
    expect(ctrlMeta?.authorized).toBeUndefined();
    expect(methodMap.get('get')?.authorized).toEqual(['mod']);
  });
});
