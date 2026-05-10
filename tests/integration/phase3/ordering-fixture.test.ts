/**
 * SC#1 — Deterministic execution order for @UseBefore / @UseAfter at
 * controller and method level; function-form and class-form middleware.
 *
 * SC#2 — Global @Middleware({ type:'before'/'after' }) classes registered via
 * BootOptions.middlewares execute in the documented outermost order.
 *
 * MW-04 fixture: proves canonical pipeline order (D-01 + D-02):
 *   global-before → ctrl-before-fn1 → ctrl-before-fn2 → method-before
 *   → handler → method-after → ctrl-after → global-after
 */
import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import {
  JsonController,
  Get,
  UseBefore,
  UseAfter,
  Middleware,
  createExpressServer,
  resetContainer,
} from '../../../src/index.js';
import type { ExpressMiddlewareInterface } from '../../../src/index.js';
import type { Request, Response, NextFunction } from 'express';

// Shared trace array — reset in beforeEach
let trace: string[] = [];

// ── Global middleware (registered in BootOptions.middlewares) ────────────────

@Middleware({ type: 'before' })
class GlobalBeforeMw implements ExpressMiddlewareInterface {
  use(_req: Request, _res: Response, next: NextFunction): void {
    trace.push('global-before');
    next();
  }
}

@Middleware({ type: 'after' })
class GlobalAfterMw implements ExpressMiddlewareInterface {
  use(_req: Request, _res: Response, next: NextFunction): void {
    trace.push('global-after');
    next();
  }
}

// ── Function-form hooks ──────────────────────────────────────────────────────

const ctrlBeforeFn1 = (_req: Request, _res: Response, next: NextFunction) => {
  trace.push('ctrl-before-fn1');
  next();
};

const ctrlBeforeFn2 = (_req: Request, _res: Response, next: NextFunction) => {
  trace.push('ctrl-before-fn2');
  next();
};

const methBeforeFn = (_req: Request, _res: Response, next: NextFunction) => {
  trace.push('method-before');
  next();
};

const methAfterFn = (_req: Request, _res: Response, next: NextFunction) => {
  trace.push('method-after');
  next();
};

const ctrlAfterFn = (_req: Request, _res: Response, next: NextFunction) => {
  trace.push('ctrl-after');
  next();
};

// ── Controller under test ────────────────────────────────────────────────────

@JsonController('/test')
@UseBefore(ctrlBeforeFn1, ctrlBeforeFn2)
@UseAfter(ctrlAfterFn)
class OrderTestController {
  @Get('/order')
  @UseBefore(methBeforeFn)
  @UseAfter(methAfterFn)
  get() {
    trace.push('handler');
    return { ok: 1 };
  }
}

beforeEach(() => {
  trace = [];
  resetContainer();
});
afterEach(() => resetContainer());

// ── Variant 2: controller @UseAfter runs after method @UseAfter ──────────────
// This is the same test as the canonical trace above — `method-after` precedes
// `ctrl-after` in the expected array, which proves level-reversal (D-02).

// ── Variant 3: within-decorator left-to-right for UseAfter ──────────────────
const afterA = (_req: Request, _res: Response, next: NextFunction) => {
  trace.push('after-a');
  next();
};
const afterB = (_req: Request, _res: Response, next: NextFunction) => {
  trace.push('after-b');
  next();
};
const afterC = (_req: Request, _res: Response, next: NextFunction) => {
  trace.push('after-c');
  next();
};

@JsonController('/variant3')
class Variant3Controller {
  @Get('/order')
  @UseAfter(afterA, afterB, afterC)
  get() {
    trace.push('handler');
    return { ok: 1 };
  }
}

describe('SC#1 + SC#2 — deterministic middleware execution order (MW-04 fixture)', () => {
  it('canonical pipeline: global-before → ctrl-before-fn1 → ctrl-before-fn2 → method-before → handler → method-after → ctrl-after → global-after', async () => {
    const app = await createExpressServer({
      controllers: [OrderTestController],
      middlewares: [GlobalBeforeMw, GlobalAfterMw],
    });

    const res = await request(app).get('/test/order');
    expect(res.status).toBe(200);
    expect(trace).toStrictEqual([
      'global-before',
      'ctrl-before-fn1',
      'ctrl-before-fn2',
      'method-before',
      'handler',
      'method-after',
      'ctrl-after',
      'global-after',
    ]);
  });

  it('level-reversal: method @UseAfter precedes controller @UseAfter (D-02)', async () => {
    const app = await createExpressServer({
      controllers: [OrderTestController],
      middlewares: [GlobalBeforeMw, GlobalAfterMw],
    });

    await request(app).get('/test/order');
    const methodAfterIdx = trace.indexOf('method-after');
    const ctrlAfterIdx = trace.indexOf('ctrl-after');
    expect(methodAfterIdx).toBeGreaterThan(-1);
    expect(ctrlAfterIdx).toBeGreaterThan(-1);
    expect(methodAfterIdx).toBeLessThan(ctrlAfterIdx);
  });

  it('Variant 3: @UseAfter(a, b, c) fires a → b → c (left-to-right within decorator args)', async () => {
    const app = await createExpressServer({
      controllers: [Variant3Controller],
    });

    await request(app).get('/variant3/order');
    const afterTrace = trace.filter(t => t.startsWith('after-'));
    expect(afterTrace).toStrictEqual(['after-a', 'after-b', 'after-c']);
  });

  it('global-before runs before ctrl-level @UseBefore (SC#2 — outermost)', async () => {
    const app = await createExpressServer({
      controllers: [OrderTestController],
      middlewares: [GlobalBeforeMw, GlobalAfterMw],
    });

    await request(app).get('/test/order');
    expect(trace.indexOf('global-before')).toBeLessThan(
      trace.indexOf('ctrl-before-fn1'),
    );
  });

  it('global-after runs after ctrl-level @UseAfter (SC#2 — outermost)', async () => {
    const app = await createExpressServer({
      controllers: [OrderTestController],
      middlewares: [GlobalBeforeMw, GlobalAfterMw],
    });

    await request(app).get('/test/order');
    expect(trace.indexOf('ctrl-after')).toBeLessThan(
      trace.indexOf('global-after'),
    );
  });
});
