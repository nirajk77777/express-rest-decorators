/**
 * Phase 3 boot tests — D-01 global mounting, interceptors, error middleware partition.
 */
import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  JsonController,
  Get,
  UseBefore,
  UseAfter,
  Middleware,
  Interceptor,
  UseInterceptor,
  Authorized,
  useExpressControllers,
  createExpressServer,
  resetContainer,
} from '../../src/index.js';
import type {
  ExpressMiddlewareInterface,
  ExpressErrorMiddlewareInterface,
  InterceptorInterface,
} from '../../src/index.js';
import type { Request, Response, NextFunction } from 'express';
import type { Action } from '../../src/types/action.js';

beforeEach(() => resetContainer());

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────────────────────────

const globalOrder: string[] = [];

function clearOrder() { globalOrder.length = 0; }

@Middleware({ type: 'before' })
class GlobalBeforeMw implements ExpressMiddlewareInterface {
  use(_req: Request, _res: Response, next: NextFunction) {
    globalOrder.push('globalBefore');
    next();
  }
}

@Middleware({ type: 'after' })
class GlobalAfterMw implements ExpressMiddlewareInterface {
  use(_req: Request, _res: Response, next: NextFunction) {
    globalOrder.push('globalAfter');
    next();
  }
}

@Middleware({ type: 'after' })
class GlobalErrorMw implements ExpressErrorMiddlewareInterface {
  // 4-arg = error middleware
  use(err: unknown, _req: Request, res: Response, _next: NextFunction) {
    globalOrder.push('globalError');
    res.status(500).json({ error: String(err) });
  }
}

@Interceptor()
class AddSuffixInterceptor implements InterceptorInterface {
  intercept(_action: Action, content: unknown): unknown {
    if (typeof content === 'object' && content !== null) {
      return { ...(content as Record<string, unknown>), intercepted: true };
    }
    return content;
  }
}

@JsonController('/p3boot')
class P3BootCtl {
  @Get('/hello')
  hello() {
    return { msg: 'hello' };
  }

  @Get('/throw')
  throws(): unknown {
    throw new Error('test-error');
  }
}

@JsonController('/p3mw')
@UseBefore((_req: Request, _res: Response, next: NextFunction) => { globalOrder.push('ctrlBefore'); next(); })
class P3MwCtl {
  @Get('/item')
  @UseAfter((_req: Request, _res: Response, next: NextFunction) => { globalOrder.push('methodAfter'); next(); })
  item() {
    return { item: 1 };
  }
}

@JsonController('/p3icp')
@UseInterceptor(AddSuffixInterceptor)
class P3IcpCtl {
  @Get('/data')
  data() {
    return { data: 'value' };
  }
}

@JsonController('/p3auth')
class P3AuthCtl {
  @Get('/public')
  public() { return { public: true }; }

  @Get('/secure')
  @Authorized()
  secure() { return { secure: true }; }
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('boot Phase 3 — useExpressControllers returns Promise (async)', () => {
  it('useExpressControllers returns a Promise', async () => {
    const app = express();
    const result = useExpressControllers(app, { controllers: [P3BootCtl] });
    expect(result).toBeInstanceOf(Promise);
    await result;
  });

  it('createExpressServer returns a Promise', async () => {
    const result = createExpressServer({ controllers: [P3BootCtl] });
    expect(result).toBeInstanceOf(Promise);
    await result;
  });
});

describe('boot Phase 3 — basic routes still work after async refactor', () => {
  it('basic GET route returns data', async () => {
    const app = await createExpressServer({ controllers: [P3BootCtl] });
    const r = await request(app).get('/p3boot/hello');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ msg: 'hello' });
  });
});

describe('boot Phase 3 — global @Middleware({type:"before"}) mounted before controllers', () => {
  it('GlobalBeforeMw fires before route handler', async () => {
    clearOrder();
    const app = await createExpressServer({
      controllers: [P3MwCtl],
      middlewares: [GlobalBeforeMw],
    });
    await request(app).get('/p3mw/item');
    expect(globalOrder[0]).toBe('globalBefore');
    expect(globalOrder).toContain('ctrlBefore');
    const gIdx = globalOrder.indexOf('globalBefore');
    const cIdx = globalOrder.indexOf('ctrlBefore');
    expect(gIdx).toBeLessThan(cIdx);
  });
});

describe('boot Phase 3 — global @Middleware({type:"after"}) non-error mounted after controllers', () => {
  it('GlobalAfterMw fires after route handler', async () => {
    clearOrder();
    const app = await createExpressServer({
      controllers: [P3MwCtl],
      middlewares: [GlobalAfterMw],
    });
    await request(app).get('/p3mw/item');
    expect(globalOrder).toContain('globalAfter');
    const mIdx = globalOrder.indexOf('methodAfter');
    const aIdx = globalOrder.indexOf('globalAfter');
    // globalAfter fires after methodAfter
    expect(mIdx).toBeLessThan(aIdx);
  });
});

describe('boot Phase 3 — global error middleware (4-arg use) mounted before libraryErrorMiddleware', () => {
  it('GlobalErrorMw catches thrown errors ahead of libraryErrorMiddleware', async () => {
    clearOrder();
    const app = await createExpressServer({
      controllers: [P3BootCtl],
      middlewares: [GlobalErrorMw],
    });
    const r = await request(app).get('/p3boot/throw');
    expect(r.status).toBe(500);
    expect(r.body.error).toContain('test-error');
    expect(globalOrder).toContain('globalError');
  });
});

describe('boot Phase 3 — defaultErrorHandler:false skips both user error mw and library default', () => {
  it('neither user error mw nor libraryErrorMiddleware fires', async () => {
    clearOrder();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const app = await createExpressServer({
        controllers: [P3BootCtl],
        middlewares: [GlobalErrorMw],
        defaultErrorHandler: false,
      });
      const r = await request(app).get('/p3boot/throw');
      // Express's finalhandler returns text/html for unhandled errors
      expect(r.body?.name).not.toBe('InternalServerError');
      expect(globalOrder).not.toContain('globalError');
    } finally {
      errSpy.mockRestore();
    }
  });
});

describe('boot Phase 3 — BootOptions.interceptors prepended to every route chain', () => {
  it('global interceptors transform route response', async () => {
    const app = await createExpressServer({
      controllers: [P3IcpCtl],
      interceptors: [AddSuffixInterceptor],
    });
    const r = await request(app).get('/p3icp/data');
    expect(r.status).toBe(200);
    expect(r.body.intercepted).toBe(true);
  });
});

describe('boot Phase 3 — @Authorized with authorizationChecker', () => {
  it('public route accessible without authChecker', async () => {
    const app = await createExpressServer({
      controllers: [P3AuthCtl],
    });
    const r = await request(app).get('/p3auth/public');
    expect(r.status).toBe(200);
  });

  it('authorized route: authChecker returns true → access granted', async () => {
    const app = await createExpressServer({
      controllers: [P3AuthCtl],
      authorizationChecker: () => true,
    });
    const r = await request(app).get('/p3auth/secure');
    expect(r.status).toBe(200);
  });

  it('authorized route: no authChecker → 401 UnauthorizedError', async () => {
    const app = await createExpressServer({
      controllers: [P3AuthCtl],
    });
    const r = await request(app).get('/p3auth/secure');
    expect(r.status).toBe(401);
  });

  it('authorized route: authChecker returns false → 403 ForbiddenError', async () => {
    const app = await createExpressServer({
      controllers: [P3AuthCtl],
      authorizationChecker: () => false,
    });
    const r = await request(app).get('/p3auth/secure');
    expect(r.status).toBe(403);
  });
});

describe('boot Phase 3 — public barrel exports new decorators and interfaces', () => {
  it('UseBefore, UseAfter, Middleware, Interceptor, UseInterceptor, Authorized are exported', async () => {
    const mod = await import('../../src/index.js');
    expect(typeof mod.UseBefore).toBe('function');
    expect(typeof mod.UseAfter).toBe('function');
    expect(typeof mod.Middleware).toBe('function');
    expect(typeof mod.Interceptor).toBe('function');
    expect(typeof mod.UseInterceptor).toBe('function');
    expect(typeof mod.Authorized).toBe('function');
  });
});
