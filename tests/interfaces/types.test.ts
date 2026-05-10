import type { Request, Response, NextFunction } from 'express';
import { describe, it, expect } from 'vitest';
import type {
  ExpressMiddlewareInterface,
  ExpressErrorMiddlewareInterface,
} from '../../src/interfaces/middleware.js';
import type { InterceptorInterface } from '../../src/interfaces/interceptor.js';
import type { Action } from '../../src/types/action.js';

// Test classes that implement the interfaces (compile-time contract verification)

class GoodMw implements ExpressMiddlewareInterface {
  use(_r: Request, _s: Response, _n: NextFunction): void {
    // no-op
  }
}

class AsyncGoodMw implements ExpressMiddlewareInterface {
  async use(_r: Request, _s: Response, _n: NextFunction): Promise<void> {
    // no-op
  }
}

class GoodErrMw implements ExpressErrorMiddlewareInterface {
  use(_e: unknown, _r: Request, _s: Response, _n: NextFunction): void {
    // no-op
  }
}

class GoodIcept implements InterceptorInterface {
  intercept(_a: Action, content: unknown): unknown {
    return content;
  }
}

class AsyncGoodIcept implements InterceptorInterface {
  async intercept(_a: Action, content: unknown): Promise<unknown> {
    return content;
  }
}

describe('ExpressMiddlewareInterface', () => {
  it('class implementing ExpressMiddlewareInterface instantiates correctly', () => {
    const mw = new GoodMw();
    expect(mw).toBeInstanceOf(GoodMw);
    expect(typeof mw.use).toBe('function');
  });

  it('async implementation also satisfies the interface', () => {
    const mw = new AsyncGoodMw();
    expect(mw).toBeInstanceOf(AsyncGoodMw);
    expect(typeof mw.use).toBe('function');
  });
});

describe('ExpressErrorMiddlewareInterface', () => {
  it('class implementing ExpressErrorMiddlewareInterface instantiates correctly', () => {
    const mw = new GoodErrMw();
    expect(mw).toBeInstanceOf(GoodErrMw);
    expect(typeof mw.use).toBe('function');
    expect(mw.use.length).toBe(4); // 4-arg error middleware
  });
});

describe('InterceptorInterface', () => {
  it('class implementing InterceptorInterface instantiates correctly', () => {
    const i = new GoodIcept();
    expect(i).toBeInstanceOf(GoodIcept);
    expect(typeof i.intercept).toBe('function');
  });

  it('async interceptor implementation also satisfies the interface', () => {
    const i = new AsyncGoodIcept();
    expect(i).toBeInstanceOf(AsyncGoodIcept);
    expect(typeof i.intercept).toBe('function');
  });
});
