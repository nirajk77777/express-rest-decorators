import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  useExpressControllers,
  createExpressServer,
  resetContainer,
  JsonController,
  Get,
  OnNull,
} from '../../src/index.js';
import {
  UsersController,
  TextController,
  BaseController,
  DerivedController,
} from './fixtures/controllers.js';

// Local fixture: error-throwing controller (used in tests 8 and 9).
@JsonController('/err')
class ErrorThrowingController {
  @Get('/boom')
  async boom(): Promise<unknown> {
    throw new Error('fail-async');
  }
}

@JsonController('/err2')
class ErrorThrowingControllerNoHandler {
  @Get('/boom')
  async boom(): Promise<unknown> {
    throw new Error('fail-async');
  }
}

// Local fixture for OnNull route (avoids routing conflict with /users/:id in
// the shared UsersController fixture).
@JsonController('/items')
class ItemsController {
  @Get('/missing')
  @OnNull(404)
  missing(): unknown {
    return null;
  }
}

beforeEach(() => resetContainer());

describe('boot — public Phase 2 API', () => {
  // Test 1: createExpressServer auto-mounts body-parsers (D-02, API-02)
  it('createExpressServer auto-mounts body-parsers and accepts JSON POST', async () => {
    const app = await createExpressServer({ controllers: [UsersController] });
    const res = await request(app)
      .post('/users')
      .send({ email: 'a@b.co', name: 'Niraj' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      created: true,
      email: 'a@b.co',
      name: 'Niraj',
    });
  });

  // Test 2a: useExpressControllers honors caller-mounted body-parser (API-01)
  it('useExpressControllers works when caller mounts express.json()', async () => {
    const app = express();
    app.use(express.json());
    await useExpressControllers(app, { controllers: [UsersController] });
    const res = await request(app)
      .post('/users')
      .send({ email: 'a@b.co', name: 'Niraj' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(true);
  });

  // Test 2b: D-02 asymmetry — without caller body-parser, body is undefined → BadRequestError
  it('useExpressControllers does NOT auto-mount body-parser (D-02 asymmetry)', async () => {
    const app = express();
    // Intentionally no app.use(express.json())
    await useExpressControllers(app, { controllers: [UsersController] });
    const res = await request(app)
      .post('/users')
      .send({ email: 'a@b.co', name: 'Niraj' })
      .set('Content-Type', 'application/json');
    // body is undefined in Express v5 without body-parser, so the Zod
    // schema rejects → BadRequestError.
    expect(res.status).toBe(400);
    expect(res.body.name).toBe('BadRequestError');
  });

  // Test 3: API-01 returns a Promise resolving to the same app
  // Phase 3 breaking change: useExpressControllers is now async (returns Promise<Express>)
  it('useExpressControllers (awaited) returns the same app instance', async () => {
    const app = express();
    const ret = await useExpressControllers(app, { controllers: [] });
    expect(ret).toBe(app);
  });

  // Test 4: API-03 — every BootOptions key accepted at runtime, no warnings
  it('accepts every BootOptions key without warnings or throws (API-03)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const app = await createExpressServer({
        controllers: [UsersController],
        routePrefix: '/api',
        defaultErrorHandler: true,
        middlewares: [],
        interceptors: [],
        cors: true,
        validation: undefined,
        authorizationChecker: () => true,
        currentUserChecker: () => null,
        printRoutes: true,
      });
      const res = await request(app).get('/api/users/7');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: 7, name: 'user-7' });
      expect(errSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  // Test 5: routePrefix composition (D-04)
  it('applies routePrefix to all controllers (D-04)', async () => {
    const app = await createExpressServer({
      controllers: [UsersController],
      routePrefix: '/api/v1',
    });
    const res = await request(app).get('/api/v1/users/3');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 3 });
  });

  // Test 6: Multiple controllers (ROUTE-05)
  it('mounts multiple controllers (ROUTE-05)', async () => {
    const app = await createExpressServer({
      controllers: [UsersController, TextController],
    });
    const r1 = await request(app).get('/users/9');
    expect(r1.status).toBe(200);
    expect(r1.body).toMatchObject({ id: 9 });

    const r2 = await request(app).get('/text/hello');
    expect(r2.status).toBe(200);
    expect(r2.text).toBe('hello world');
  });

  // Test 7: Controller inheritance (ROUTE-05) — DerivedController has both
  // its own /derived/own and the inherited /derived/ping (parent's @Get('/ping')
  // composed with the SUBCLASS basePath '/derived' per Phase 1 D-06).
  it('honors controller inheritance — both parent and own routes available', async () => {
    const app = await createExpressServer({ controllers: [DerivedController] });

    const own = await request(app).get('/derived/own');
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({ from: 'derived' });

    const inherited = await request(app).get('/derived/ping');
    expect(inherited.status).toBe(200);
    expect(inherited.body).toMatchObject({ from: 'base' });
  });

  // Test 8: defaultErrorHandler:false skips lib middleware (D-17)
  it('defaultErrorHandler:false skips libraryErrorMiddleware (D-17)', async () => {
    // Silence Express's default error logger while we deliberately throw.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const app = await createExpressServer({
        controllers: [ErrorThrowingControllerNoHandler],
        defaultErrorHandler: false,
      });
      const res = await request(app).get('/err2/boom');
      expect(res.status).toBe(500);
      // Express's finalhandler returns text/html by default — NOT our JSON envelope.
      // The library JSON envelope would have body.name === 'InternalServerError'.
      // With no library handler mounted, the body should NOT match that envelope.
      expect(res.body?.name).not.toBe('InternalServerError');
    } finally {
      errSpy.mockRestore();
    }
  });

  // Test 9: vertical slice — async throw → libraryErrorMiddleware (ERR-03 + SC #3)
  it('async throw → libraryErrorMiddleware with source attribution (ERR-03)', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const app = await createExpressServer({
        controllers: [ErrorThrowingController],
      });
      const res = await request(app).get('/err/boom');
      expect(res.status).toBe(500);
      expect(res.body.name).toBe('InternalServerError');
      expect(res.body.message).toBe('Internal Server Error');
      expect(typeof res.body.source).toBe('string');
      expect(res.body.source.endsWith('.boom')).toBe(true);
      // Dev disclosure (D-18)
      expect(res.body._devMessage).toBe('fail-async');
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  // Test 10: vertical slice — Zod validation failure → 400 with details
  it('Zod validation failure → 400 with aggregated details (INPUT-03)', async () => {
    const app = await createExpressServer({ controllers: [UsersController] });
    const res = await request(app)
      .post('/users')
      .send({ email: 'not-email', name: '' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body.name).toBe('BadRequestError');
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details).toHaveLength(2);
    const slots = res.body.details.map((d: { slot: string }) => d.slot);
    expect(slots).toEqual(['body', 'body']);
    const paths = res.body.details
      .map((d: { path: string }) => d.path)
      .sort();
    expect(paths).toEqual(['email', 'name']);
  });

  // Test 11: null return + @OnNull(404) → 404 empty body (D-13)
  it('null return + @OnNull(404) → 404 with empty body', async () => {
    const app = await createExpressServer({ controllers: [ItemsController] });
    const res = await request(app).get('/items/missing');
    expect(res.status).toBe(404);
    expect(res.text).toBe('');
  });

  // Test 12: public exports surface (compile-time check; runtime asserts presence)
  it('exposes public Phase 2 surfaces from src/index.ts', async () => {
    const mod = await import('../../src/index.js');
    expect(typeof mod.useExpressControllers).toBe('function');
    expect(typeof mod.createExpressServer).toBe('function');
    // Internal helpers must NOT leak.
    expect((mod as Record<string, unknown>).buildControllerRouter).toBeUndefined();
    expect((mod as Record<string, unknown>).resolveInputs).toBeUndefined();
    expect((mod as Record<string, unknown>).writeResponse).toBeUndefined();
    expect((mod as Record<string, unknown>).wrapAction).toBeUndefined();
    expect((mod as Record<string, unknown>).libraryErrorMiddleware).toBeUndefined();
    // Phase 1 exports preserved
    expect(typeof mod.Controller).toBe('function');
    expect(typeof mod.JsonController).toBe('function');
    expect(typeof mod.HttpError).toBe('function');
    expect(typeof mod.useContainer).toBe('function');
    expect(typeof mod.buildMetadata).toBe('function');
  });
});
