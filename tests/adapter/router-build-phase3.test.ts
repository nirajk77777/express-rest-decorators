/**
 * Phase 3 router-build tests.
 * Verifies that buildControllerRouter composes per-route handler arrays
 * in D-01 order: [...ctrlBefore, ...methodBefore, authGate?, invokeHandler, ...methodAfter, ...ctrlAfter]
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { buildControllerRouter, type BuildRouterOptions } from '../../src/adapter/router-build.js';
import { buildMetadata } from '../../src/metadata/builder.js';
import {
  JsonController,
  Get,
  UseBefore,
  UseAfter,
  Authorized,
} from '../../src/index.js';
import type { ControllerMetadata, ActionMetadata } from '../../src/types/resolved.js';
import type { InterceptorInterface } from '../../src/interfaces/interceptor.js';
import type { RequestHandler } from 'express';
import { resetContainer } from '../../src/index.js';

beforeEach(() => resetContainer());

function getMeta(ctor: Function): ControllerMetadata {
  const all = buildMetadata([ctor]);
  return all[0]!;
}

const noopHandler: RequestHandler = (_req, _res, next) => { if (next) next(); };

function makeOptions(overrides: Partial<BuildRouterOptions> = {}): BuildRouterOptions {
  return {
    routePrefix: '',
    handlerFactory: (_ctl, _act, _interceptors) => noopHandler,
    globalInterceptors: [],
    ...overrides,
  };
}

describe('buildControllerRouter Phase 3 — new async signature', () => {
  it('returns a Promise<BuiltRouter>', async () => {
    @JsonController('/p3')
    class P3Ctl {
      @Get('/x')
      x() { return {}; }
    }
    const meta = getMeta(P3Ctl);
    const result = buildControllerRouter(meta, makeOptions());
    expect(result).toBeInstanceOf(Promise);
    const built = await result;
    expect(built).toHaveProperty('router');
    expect(built).toHaveProperty('mountPath');
  });

  it('registers actions on the router (backward-compat shape)', async () => {
    @JsonController('/p3b')
    class P3bCtl {
      @Get('/items')
      items() { return []; }
    }
    const meta = getMeta(P3bCtl);
    const { router } = await buildControllerRouter(meta, makeOptions());
    const paths = router.stack
      .map((l: unknown) => (l as { route?: { path?: string } }).route?.path)
      .filter((p: unknown) => typeof p === 'string');
    expect(paths).toContain('/items');
  });

  it('method-level @UseBefore: handler fires BEFORE invoke handler', async () => {
    const order: string[] = [];

    const beforeFn: RequestHandler = (_req, _res, next) => {
      order.push('before');
      if (next) next();
    };

    @JsonController('/ord')
    class OrdCtl {
      @Get('/go')
      @UseBefore(beforeFn)
      go() { return {}; }
    }
    const meta = getMeta(OrdCtl);
    const opts = makeOptions({
      handlerFactory: (_ctl, _act, _interceptors) => (_req, res) => {
        order.push('invoke');
        res.json({});
      },
    });
    const { router, mountPath } = await buildControllerRouter(meta, opts);
    const app = express();
    app.use(mountPath, router);
    await request(app).get('/ord/go');
    expect(order).toEqual(['before', 'invoke']);
  });

  it('method-level @UseAfter: handler fires AFTER invoke handler (after next() in writeResponse)', async () => {
    const order: string[] = [];

    const afterFn: RequestHandler = (_req, _res, next) => {
      order.push('after');
      if (next) next();
    };

    @JsonController('/after-ord')
    class AfterOrdCtl {
      @Get('/go')
      @UseAfter(afterFn)
      go() { return {}; }
    }
    const meta = getMeta(AfterOrdCtl);
    const opts = makeOptions({
      handlerFactory: (_ctl, _act, _interceptors) => (_req, res, next) => {
        order.push('invoke');
        res.json({});
        // Simulate writeResponse calling next()
        if (next) next();
      },
    });
    const { router, mountPath } = await buildControllerRouter(meta, opts);
    const app = express();
    app.use(mountPath, router);
    await request(app).get('/after-ord/go');
    expect(order).toEqual(['invoke', 'after']);
  });

  it('controller-level @UseBefore fires before method-level @UseBefore', async () => {
    const order: string[] = [];

    const ctrlBefore: RequestHandler = (_req, _res, next) => { order.push('ctrlBefore'); if (next) next(); };
    const methodBefore: RequestHandler = (_req, _res, next) => { order.push('methodBefore'); if (next) next(); };

    @JsonController('/corder')
    @UseBefore(ctrlBefore)
    class COrderCtl {
      @Get('/go')
      @UseBefore(methodBefore)
      go() { return {}; }
    }
    const meta = getMeta(COrderCtl);
    const opts = makeOptions({
      handlerFactory: (_ctl, _act, _interceptors) => (_req, res) => {
        order.push('invoke');
        res.json({});
      },
    });
    const { router, mountPath } = await buildControllerRouter(meta, opts);
    const app = express();
    app.use(mountPath, router);
    await request(app).get('/corder/go');
    expect(order).toEqual(['ctrlBefore', 'methodBefore', 'invoke']);
  });

  it('method-level @Authorized fires before invoke handler when authChecker provided', async () => {
    const order: string[] = [];

    @JsonController('/auth-ord')
    class AuthOrdCtl {
      @Get('/secure')
      @Authorized()
      secure() { return {}; }
    }
    const meta = getMeta(AuthOrdCtl);
    const opts = makeOptions({
      authChecker: (_action, _roles) => {
        order.push('authGate');
        return true;
      },
      handlerFactory: (_ctl, _act, _interceptors) => (_req, res) => {
        order.push('invoke');
        res.json({});
      },
    });
    const { router, mountPath } = await buildControllerRouter(meta, opts);
    const app = express();
    app.use(mountPath, router);
    await request(app).get('/auth-ord/secure');
    expect(order[0]).toBe('authGate');
    expect(order[1]).toBe('invoke');
  });

  it('method @Authorized wins over controller @Authorized (D-06 method-wins rule)', async () => {
    const capturedRoles: (string[] | null | undefined)[] = [];

    @JsonController('/role-ord')
    @Authorized(['ctrl-role'])
    class RoleOrdCtl {
      @Get('/go')
      @Authorized(['method-role'])
      go() { return {}; }
    }
    const meta = getMeta(RoleOrdCtl);
    const opts = makeOptions({
      authChecker: (_action, roles) => {
        capturedRoles.push(roles);
        return true;
      },
      handlerFactory: (_ctl, _act, _interceptors) => (_req, res) => {
        res.json({});
      },
    });
    const { router, mountPath } = await buildControllerRouter(meta, opts);
    const app = express();
    app.use(mountPath, router);
    await request(app).get('/role-ord/go');
    expect(capturedRoles[0]).toEqual(['method-role']);
  });

  it('handlerFactory receives resolvedInterceptors as third argument', async () => {
    const receivedInterceptors: InterceptorInterface[][] = [];

    const mockInterceptor: InterceptorInterface = {
      intercept: (_action, content) => content,
    };

    @JsonController('/icp')
    class IcpCtl {
      @Get('/go')
      go() { return {}; }
    }
    const meta = getMeta(IcpCtl);
    const opts = makeOptions({
      globalInterceptors: [mockInterceptor],
      handlerFactory: (_ctl, _act, interceptors) => {
        receivedInterceptors.push([...interceptors]);
        return (_req: unknown, res: { json: (v: unknown) => void }) => res.json({});
      },
    });
    await buildControllerRouter(meta, opts);
    expect(receivedInterceptors[0]).toContain(mockInterceptor);
  });

  it('existing Phase 2 behavior preserved: single action, no decorators → 1 route registered', async () => {
    @JsonController('/simple3')
    class Simple3Ctl {
      @Get('/hello')
      hello() { return {}; }
    }
    const meta = getMeta(Simple3Ctl);
    const { router } = await buildControllerRouter(meta, makeOptions());
    const paths = router.stack
      .map((l: unknown) => (l as { route?: { path?: string } }).route?.path)
      .filter((p: unknown) => typeof p === 'string');
    expect(paths).toHaveLength(1);
    expect(paths[0]).toBe('/hello');
  });
});
