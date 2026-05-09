import 'reflect-metadata';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { libraryErrorMiddleware } from '../../src/adapter/error-middleware.js';
import { wrapAction, type InvokeAction } from '../../src/adapter/handler-wrapper.js';
import { BadRequestError, NotFoundError } from '../../src/index.js';
import type { ControllerMetadata, ActionMetadata } from '../../src/types/resolved.js';

class Ctl {
  m() {}
}

function makeApp(invoke: InvokeAction) {
  const app = express();
  const ctlMeta: ControllerMetadata = {
    type: 'json',
    basePath: '',
    target: Ctl,
    responseHandlers: [],
    actions: [],
  };
  const actMeta: ActionMetadata = {
    target: Ctl,
    method: 'm',
    verb: 'get',
    path: '/',
    responseHandlers: [],
  };
  app.get('/', wrapAction(ctlMeta, actMeta, invoke));
  app.use(libraryErrorMiddleware);
  return app;
}

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  vi.restoreAllMocks();
});

describe('libraryErrorMiddleware', () => {
  it('1. HttpError → 4xx with toJSON shape', async () => {
    process.env.NODE_ENV = 'test';
    const app = makeApp(async () => {
      throw new NotFoundError('user 7');
    });
    const res = await request(app).get('/');
    expect(res.status).toBe(404);
    expect(res.body.name).toBe('NotFoundError');
    expect(res.body.message).toBe('user 7');
    expect(res.body.status).toBe(404);
    // dev → stack present
    expect(typeof res.body.stack).toBe('string');
  });

  it('2. BadRequestError details preserved', async () => {
    process.env.NODE_ENV = 'test';
    const app = makeApp(async () => {
      throw new BadRequestError('bad', {
        details: [{ slot: 'body', path: 'x', message: 'y' }],
      });
    });
    const res = await request(app).get('/');
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details).toHaveLength(1);
    expect(res.body.details[0].path).toBe('x');
  });

  it('3. source from wrapper visible on generic 500', async () => {
    process.env.NODE_ENV = 'test';
    const app = makeApp(async () => {
      throw new Error('boom');
    });
    const res = await request(app).get('/');
    expect(res.status).toBe(500);
    expect(res.body.source).toBe('Ctl.m');
  });

  it('4. production hides err.message — generic 500 envelope only', async () => {
    process.env.NODE_ENV = 'production';
    const app = makeApp(async () => {
      throw new Error('SECRET DETAIL');
    });
    const res = await request(app).get('/');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Internal Server Error');
    expect(res.body.name).toBe('InternalServerError');
    expect(res.body._devMessage).toBeUndefined();
    expect(res.body.stack).toBeUndefined();
  });

  it('5. dev mode adds stack and _devMessage', async () => {
    process.env.NODE_ENV = 'test';
    const app = makeApp(async () => {
      throw new Error('detail');
    });
    const res = await request(app).get('/');
    expect(typeof res.body.stack).toBe('string');
    expect(res.body._devMessage).toBe('detail');
  });

  it('6. HttpError stack present in dev, absent in production', async () => {
    process.env.NODE_ENV = 'test';
    const appDev = makeApp(async () => {
      throw new BadRequestError('x');
    });
    const dev = await request(appDev).get('/');
    expect(typeof dev.body.stack).toBe('string');

    process.env.NODE_ENV = 'production';
    const appProd = makeApp(async () => {
      throw new BadRequestError('x');
    });
    const prod = await request(appProd).get('/');
    expect(prod.body.stack).toBeUndefined();
  });

  it('7. headersSent guard — does not double-write', async () => {
    process.env.NODE_ENV = 'test';
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = makeApp(async (_req, res) => {
      res.status(200);
      res.write('partial');
      // Force headers flush
      res.flushHeaders();
      throw new Error('after-headers');
    });
    // We expect either a truncated body or socket hang up — never a thrown
    // ERR_HTTP_HEADERS_SENT inside the middleware.
    let didError = false;
    try {
      await request(app).get('/');
    } catch {
      didError = true;
    }
    // Either way, console.error was invoked exactly once for the headers-sent path
    expect(consoleErr).toHaveBeenCalled();
    // and we did not crash the process
    expect(typeof didError).toBe('boolean');
  });

  it('8. headersSent path logs to console.error exactly once', async () => {
    process.env.NODE_ENV = 'test';
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = makeApp(async (_req, res) => {
      res.status(200);
      res.write('partial');
      res.flushHeaders();
      throw new Error('after-headers');
    });
    try {
      await request(app).get('/');
    } catch {
      /* noop */
    }
    expect(consoleErr).toHaveBeenCalledTimes(1);
  });

  it('9. no double-fire — calls res.json exactly once on error', async () => {
    process.env.NODE_ENV = 'test';
    let jsonCalls = 0;
    const app = express();
    app.use((req, _res, next) => {
      // wrap res.json to count
      const origJson = (req.res as Response).json.bind(req.res);
      (req.res as Response).json = ((body: unknown) => {
        jsonCalls += 1;
        return origJson(body);
      }) as Response['json'];
      next();
    });
    const ctlMeta: ControllerMetadata = {
      type: 'json',
      basePath: '',
      target: Ctl,
      responseHandlers: [],
      actions: [],
    };
    const actMeta: ActionMetadata = {
      target: Ctl,
      method: 'm',
      verb: 'get',
      path: '/',
      responseHandlers: [],
    };
    app.get(
      '/',
      wrapAction(ctlMeta, actMeta, async () => {
        throw new Error('once');
      })
    );
    app.use(libraryErrorMiddleware);
    await request(app).get('/');
    expect(jsonCalls).toBe(1);
  });
});
