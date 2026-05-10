/**
 * SC#5 — User @Middleware({ type:'after' }) error classes with 4-arg `use` run
 * ahead of libraryErrorMiddleware and can format/replace the response (ERR-04).
 *
 * Cases:
 *   A: single error mw, writes response → 418; lib fallback NOT fired
 *   B: logger → formatter (chain) → both fire in registration order
 *   C: logger only, calls next(err) → libraryErrorMiddleware writes standard response
 *   D: defaultErrorHandler === false → error mw not mounted at all
 *   E: err.source survives through to user error mw (D-18 / Phase 2 D-16)
 */
import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import {
  JsonController,
  Get,
  Middleware,
  createExpressServer,
  useExpressControllers,
  resetContainer,
} from '../../../src/index.js';
import type { ExpressErrorMiddlewareInterface } from '../../../src/index.js';
import type { Request, Response, NextFunction } from 'express';

beforeEach(() => resetContainer());
afterEach(() => resetContainer());

// ── Shared controller that always throws ────────────────────────────────────

@JsonController('/err')
class ErrController {
  @Get('/boom')
  boom(): never {
    throw new Error('boom');
  }

  @Get('/named')
  named(): never {
    throw new Error('named-error');
  }
}

describe('SC#5 — user error middleware (ERR-04)', () => {
  // Case A: single error mw writes response; lib default NOT fired
  it('Case A: UserErrMw writes 418 response; libraryErrorMiddleware not fired', async () => {
    @Middleware({ type: 'after' })
    class UserErrMw implements ExpressErrorMiddlewareInterface {
      use(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
        res.status(418).json({ caught: true, name: (err as Error).name });
      }
    }

    const app = await createExpressServer({
      controllers: [ErrController],
      middlewares: [UserErrMw],
    });

    const res = await request(app).get('/err/boom');
    expect(res.status).toBe(418);
    expect(res.body).toMatchObject({ caught: true, name: 'Error' });
  });

  // Case B: logger → formatter, both fire; first calls next(err)
  it('Case B: logger + formatter error chain; logger calls next(err); formatter writes response', async () => {
    const logged: unknown[] = [];

    @Middleware({ type: 'after' })
    class LoggerErr implements ExpressErrorMiddlewareInterface {
      use(err: unknown, _req: Request, _res: Response, next: NextFunction): void {
        logged.push(err);
        next(err as Error);
      }
    }

    @Middleware({ type: 'after' })
    class FormatterErr implements ExpressErrorMiddlewareInterface {
      use(_err: unknown, _req: Request, res: Response, _next: NextFunction): void {
        res.status(500).json({ formatted: true });
      }
    }

    const app = await createExpressServer({
      controllers: [ErrController],
      middlewares: [LoggerErr, FormatterErr],
    });

    const res = await request(app).get('/err/boom');
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ formatted: true });
    expect(logged.length).toBe(1);
  });

  // Case C: logger only calls next(err); libraryErrorMiddleware writes standard response
  it('Case C: logger-only error mw forwards via next(err); libraryErrorMiddleware handles it', async () => {
    const logged: unknown[] = [];

    @Middleware({ type: 'after' })
    class LoggerOnlyErr implements ExpressErrorMiddlewareInterface {
      use(err: unknown, _req: Request, _res: Response, next: NextFunction): void {
        logged.push(err);
        next(err as Error);
      }
    }

    const app = await createExpressServer({
      controllers: [ErrController],
      middlewares: [LoggerOnlyErr],
    });

    const res = await request(app).get('/err/boom');
    // libraryErrorMiddleware writes the standard 500 envelope
    expect(res.status).toBe(500);
    expect(res.body.name).toBe('InternalServerError');
    expect(logged.length).toBe(1);
  });

  // Case D: defaultErrorHandler === false → error mw NOT mounted; Express default 500
  it('Case D: defaultErrorHandler:false → user error mw not mounted; Express default behavior', async () => {
    @Middleware({ type: 'after' })
    class ShouldNotRun implements ExpressErrorMiddlewareInterface {
      use(_err: unknown, _req: Request, res: Response, _next: NextFunction): void {
        res.status(418).json({ shouldNotRun: true });
      }
    }

    const app = express();
    app.use(express.json());
    await useExpressControllers(app, {
      controllers: [ErrController],
      middlewares: [ShouldNotRun],
      defaultErrorHandler: false,
    });

    const res = await request(app).get('/err/boom');
    // With no error handler mounted at all, Express 5 handles the error itself
    // The status will not be 418 (our user mw was not mounted)
    expect(res.status).not.toBe(418);
    expect(res.body.shouldNotRun).toBeUndefined();
  });

  // Case E: err.source survives to user error mw (D-18 / Phase 2 D-16)
  it('Case E: err.source is attached by wrapAction and available in user error mw', async () => {
    let capturedSource: unknown;

    @Middleware({ type: 'after' })
    class SourceCaptureMw implements ExpressErrorMiddlewareInterface {
      use(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
        capturedSource = (err as Record<string, unknown>).source;
        res.status(500).json({ source: capturedSource });
      }
    }

    const app = await createExpressServer({
      controllers: [ErrController],
      middlewares: [SourceCaptureMw],
    });

    const res = await request(app).get('/err/boom');
    expect(res.status).toBe(500);
    // Source format: ControllerName.methodName (D-16)
    expect(typeof res.body.source).toBe('string');
    expect(res.body.source).toBe('ErrController.boom');
    expect(capturedSource).toBe('ErrController.boom');
  });
});
