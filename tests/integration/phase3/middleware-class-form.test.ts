/**
 * Class-form middleware via @UseBefore + container DI.
 *
 * SC#1 (partial) — class-form ExpressMiddlewareInterface works via @UseBefore.
 * D-05 — class-form mw/interceptor instances obtained via getContainer().get(Cls).
 */
import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import {
  JsonController,
  Get,
  UseBefore,
  createExpressServer,
  resetContainer,
  useContainer,
} from '../../../src/index.js';
import type { ExpressMiddlewareInterface } from '../../../src/index.js';
import type { Request, Response, NextFunction } from 'express';

beforeEach(() => resetContainer());
afterEach(() => resetContainer());

// ── Case 1: plain class-form via @UseBefore ──────────────────────────────────

class LogMw implements ExpressMiddlewareInterface {
  use(req: Request, _res: Response, next: NextFunction): void {
    (req as unknown as Record<string, unknown>).logged = true;
    next();
  }
}

@JsonController('/classform')
class ClassFormController {
  @Get('/check')
  @UseBefore(LogMw)
  check({ req }: { req: Request }) {
    return { logged: (req as unknown as Record<string, unknown>).logged };
  }
}

describe('class-form middleware via @UseBefore', () => {
  it('LogMw sets req.logged = true; handler sees it', async () => {
    const app = await createExpressServer({ controllers: [ClassFormController] });
    const res = await request(app).get('/classform/check');
    expect(res.status).toBe(200);
    expect(res.body.logged).toBe(true);
  });
});

// ── Case 2: class-form via @UseBefore with custom container ─────────────────

const constructorCallArgs: unknown[] = [];

class InjectedDep {
  readonly value = 'injected-value';
}

class DIMw implements ExpressMiddlewareInterface {
  constructor(readonly dep: InjectedDep) {
    constructorCallArgs.push(dep);
  }
  use(req: Request, _res: Response, next: NextFunction): void {
    (req as unknown as Record<string, unknown>).depValue = this.dep.value;
    next();
  }
}

@JsonController('/dicheck')
class DICheckController {
  @Get('/dep')
  @UseBefore(DIMw)
  check({ req }: { req: Request }) {
    return { depValue: (req as unknown as Record<string, unknown>).depValue };
  }
}

describe('class-form middleware with custom container DI', () => {
  it('container injects constructor dep; handler receives the injected value', async () => {
    constructorCallArgs.length = 0;
    const injectedDep = new InjectedDep();

    useContainer({
      get: (cls: unknown) => {
        if (cls === DIMw) return new DIMw(injectedDep);
        return new (cls as new () => unknown)();
      },
    });

    const app = await createExpressServer({ controllers: [DICheckController] });
    const res = await request(app).get('/dicheck/dep');
    expect(res.status).toBe(200);
    expect(res.body.depValue).toBe('injected-value');
    // Verify the constructor was called with the injected dep
    expect(constructorCallArgs.length).toBeGreaterThan(0);
    expect(constructorCallArgs[0]).toBe(injectedDep);
  });
});
