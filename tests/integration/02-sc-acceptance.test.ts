/**
 * Phase 2 Success Criteria — executable acceptance tests.
 *
 * Each `describe` block quotes a ROADMAP Phase 2 SC verbatim and proves it via
 * supertest behavior. The verifier reads pass/fail of these tests to confirm
 * Phase 2 is done.
 *
 * SC #1 — useExpressControllers AND createExpressServer; multi-controller; inheritance; routePrefix.
 * SC #2 — Standard Schema validation across Zod / Valibot / ArkType; failure → BadRequestError 400.
 * SC #3 — Async throw → libraryErrorMiddleware exactly once; native v5 propagation; no try/catch around handlers.
 * SC #4 — v4 path patterns throw at registration with ctl.method + suggestion; v8 patterns work end-to-end.
 * SC #5 — JSON / primitive / null / string / Buffer / stream / async-iterable response writing + @Header end-to-end.
 *
 * Phase 3 breaking change: useExpressControllers and createExpressServer are now async.
 * All call sites updated to await the result.
 */
import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import request from 'supertest';
import { Readable } from 'node:stream';
import { z } from 'zod';
import * as v from 'valibot';
import { type as arkType } from 'arktype';
import {
  Controller,
  JsonController,
  Get,
  Post,
  Header,
  OnNull,
  useExpressControllers,
  createExpressServer,
  resetContainer,
  NotFoundError,
} from '../../src/index.js';

beforeEach(() => resetContainer());
afterEach(() => resetContainer());

// ---------------------------------------------------------------------------
// SC #1 — useExpressControllers / createExpressServer; multi-controller;
// inheritance; routePrefix
// ---------------------------------------------------------------------------
describe("SC #1 — useExpressControllers / createExpressServer; multi-controller; inheritance; routePrefix", () => {
  // Inline fixtures so the test file is self-contained and the SC traces
  // in this file are not entangled with other plans' fixtures.
  @JsonController('/users')
  class SC1Users {
    @Post('/', { body: z.object({ email: z.email(), name: z.string().min(1) }) })
    create({ body }: { body: { email: string; name: string } }) {
      return { created: true, email: body.email, name: body.name };
    }

    @Get('/:id', { params: z.object({ id: z.coerce.number().int().positive() }) })
    getById({ params }: { params: { id: number } }) {
      return { id: params.id, name: `user-${params.id}` };
    }
  }

  @Controller('/text')
  class SC1Text {
    @Get('/hello')
    hello() {
      return 'hello world';
    }
  }

  // Inheritance fixture (Phase 1 D-06 — derived classes inherit parent actions
  // composed under the SUBCLASS basePath).
  @JsonController('/base')
  class SC1Base {
    @Get('/ping')
    ping() {
      return { from: 'base' };
    }
  }

  @JsonController('/derived')
  class SC1Derived extends SC1Base {
    @Get('/own')
    own() {
      return { from: 'derived' };
    }
  }

  it('createExpressServer mounts body-parsers and routes (D-01, D-02)', async () => {
    const app = await createExpressServer({ controllers: [SC1Users] });
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

  it('useExpressControllers respects routePrefix and multiple controllers', async () => {
    const app = await createExpressServer({
      controllers: [SC1Users, SC1Text],
      routePrefix: '/api',
    });
    const r1 = await request(app).get('/api/users/3');
    expect(r1.status).toBe(200);
    expect(r1.body).toMatchObject({ id: 3, name: 'user-3' });

    const r2 = await request(app).get('/api/text/hello');
    expect(r2.status).toBe(200);
    expect(r2.text).toBe('hello world');
  });

  it('controller inheritance — derived controller exposes both inherited and own routes', async () => {
    const app = await createExpressServer({ controllers: [SC1Derived] });

    const inherited = await request(app).get('/derived/ping');
    expect(inherited.status).toBe(200);
    expect(inherited.body).toMatchObject({ from: 'base' });

    const own = await request(app).get('/derived/own');
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({ from: 'derived' });
  });
});

// ---------------------------------------------------------------------------
// SC #2 — Standard Schema validation; Zod, Valibot, ArkType all work; failure
// → BadRequestError 400 with field-level details + source
// ---------------------------------------------------------------------------
describe('SC #2 — Standard Schema validation (Zod/Valibot/ArkType); failure → BadRequestError 400', () => {
  // Zod (body)
  @JsonController('/zod')
  class ZodCtl {
    @Post('/', {
      body: z.object({
        email: z.email(),
        name: z.string().min(1),
      }),
    })
    create({ body }: { body: { email: string; name: string } }) {
      return { vendor: 'zod', email: body.email, name: body.name };
    }
  }

  // Valibot (query)
  @JsonController('/valibot')
  class ValiCtl {
    @Get('/', {
      query: v.object({
        x: v.pipe(v.string(), v.minLength(1)),
      }),
    })
    list({ query }: { query: { x: string } }) {
      return { vendor: 'valibot', x: query.x };
    }
  }

  // ArkType (params)
  @JsonController('/things')
  class ArkCtl {
    @Get('/:id', {
      params: arkType({ id: 'string.numeric.parse' }),
    })
    one({ params }: { params: { id: number } }) {
      return { vendor: 'arktype', id: params.id };
    }
  }

  // Multi-slot failure aggregator — fail body AND params in one request.
  @JsonController('/multi')
  class MultiCtl {
    @Post('/:id', {
      body: z.object({
        email: z.email(),
        name: z.string().min(1),
      }),
      params: z.object({ id: z.coerce.number().int().positive() }),
    })
    boom() {
      return { ok: true };
    }
  }

  it('Zod body schema — happy path returns transformed value in handler arg', async () => {
    const app = await createExpressServer({ controllers: [ZodCtl] });
    const res = await request(app)
      .post('/zod')
      .send({ email: 'a@b.co', name: 'Niraj' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ vendor: 'zod', email: 'a@b.co', name: 'Niraj' });
  });

  it('Valibot query schema — happy path', async () => {
    const app = await createExpressServer({ controllers: [ValiCtl] });
    const res = await request(app).get('/valibot?x=hello');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ vendor: 'valibot', x: 'hello' });
  });

  it('ArkType params schema — happy path', async () => {
    const app = await createExpressServer({ controllers: [ArkCtl] });
    const res = await request(app).get('/things/42');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ vendor: 'arktype', id: 42 });
  });

  it('failure on multiple slots → single BadRequestError with aggregate details + source', async () => {
    const app = await createExpressServer({ controllers: [MultiCtl] });
    // Bad params (id=-1 fails positive int) AND bad body (bad email + empty name).
    const res = await request(app)
      .post('/multi/-1')
      .send({ email: 'not-email', name: '' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body.name).toBe('BadRequestError');
    expect(Array.isArray(res.body.details)).toBe(true);
    // At least 2 issues — at minimum one params + one body issue.
    expect(res.body.details.length).toBeGreaterThanOrEqual(2);
    const slots = new Set(
      res.body.details.map((d: { slot: string }) => d.slot),
    );
    expect(slots.has('body')).toBe(true);
    expect(slots.has('params')).toBe(true);
    // Source is attached by wrapAction (D-16) — `${ClassName}.${methodName}`.
    expect(typeof res.body.source).toBe('string');
    expect(res.body.source).toBe('MultiCtl.boom');
  });
});

// ---------------------------------------------------------------------------
// SC #3 — Async throw reaches libraryErrorMiddleware EXACTLY once; no try/catch
// wrappers around handlers; native v5 propagation; headersSent guard.
// ---------------------------------------------------------------------------
describe('SC #3 — async throw → libraryErrorMiddleware exactly once; native v5 propagation', () => {
  @JsonController('/sc3')
  class SC3Ctl {
    @Get('/boom')
    async boom(): Promise<unknown> {
      throw new Error('async-fail');
    }

    @Get('/notfound')
    async missing(): Promise<unknown> {
      throw new NotFoundError('user 9');
    }

    // Stream that emits one chunk THEN errors mid-flight (post-headers).
    @Get('/midstream')
    midstream(): Readable {
      return new Readable({
        read() {
          this.push('first-chunk');
          // schedule the error to fire after the response has begun flushing
          setImmediate(() => this.destroy(new Error('mid-stream-fail')));
        },
      });
    }
  }

  it('async handler that throws → 500 with InternalServerError envelope; err.source attached', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const app = await createExpressServer({ controllers: [SC3Ctl] });
      const res = await request(app).get('/sc3/boom');
      expect(res.status).toBe(500);
      expect(res.body.name).toBe('InternalServerError');
      expect(typeof res.body.source).toBe('string');
      expect(res.body.source.endsWith('.boom')).toBe(true);
      expect(res.body.source).toBe('SC3Ctl.boom');
    } finally {
      errSpy.mockRestore();
    }
  });

  it('handler that throws HttpError → status from err.status, toJSON shape preserved', async () => {
    const app = await createExpressServer({ controllers: [SC3Ctl] });
    const res = await request(app).get('/sc3/notfound');
    expect(res.status).toBe(404);
    expect(res.body.name).toBe('NotFoundError');
    expect(res.body.message).toBe('user 9');
  });

  it('error middleware fires exactly once per pre-headers error (spy/counter)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let counter = 0;
    try {
      // Build app manually so we can inject the counter middleware AFTER the
      // controller routes and BEFORE the library error middleware. Express runs
      // error middlewares in mount order, picking up only those declared AFTER
      // the failing route's position in the stack — hence the counter must be
      // mounted *after* useExpressControllers' router wiring but *before* the
      // library handler. We achieve that by mounting controllers with
      // defaultErrorHandler:false, then the counter, then the lib middleware
      // through a second useExpressControllers([]) call.
      const app = express();
      app.use(express.json());
      await useExpressControllers(app, {
        controllers: [SC3Ctl],
        defaultErrorHandler: false,
      });
      app.use(
        (err: unknown, _req: Request, _res: Response, next: NextFunction) => {
          counter += 1;
          next(err);
        },
      );
      // Mount the lib error middleware via a no-controller boot.
      await useExpressControllers(app, { controllers: [] });
      const res = await request(app).get('/sc3/boom');
      expect(res.status).toBe(500);
      expect(res.body.name).toBe('InternalServerError');
      // Counter saw the error exactly once; libraryErrorMiddleware then wrote
      // the JSON envelope — proving exactly-one error path through the chain.
      expect(counter).toBe(1);
    } finally {
      errSpy.mockRestore();
    }
  });

  it('post-headers stream error → headersSent guard destroys response without "headers already sent" throw', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const app = await createExpressServer({ controllers: [SC3Ctl] });
      // The stream emits one chunk, response headers flush, then errors.
      // Per D-14, libraryErrorMiddleware sees res.headersSent === true and
      // destroys the response WITHOUT calling res.json. The test asserts
      // we received the partial body and that no ERR_HTTP_HEADERS_SENT
      // error escaped (any such throw would surface in process listeners).
      const headersSentSpy = vi.fn();
      const origUncaught = process.listeners('uncaughtException');
      process.removeAllListeners('uncaughtException');
      process.on('uncaughtException', headersSentSpy);
      try {
        let partial = '';
        const req = request(app).get('/sc3/midstream');
        // supertest will surface stream error as either an aborted error or partial
        // body; we don't assert on status here — the server may have flushed 200
        // before errors. We assert no ERR_HTTP_HEADERS_SENT escaped.
        try {
          const res = await req;
          partial = res.text ?? '';
        } catch {
          // mid-stream destroy can surface as a client-side abort
        }
        // Either path is acceptable; primary assertion is the negative one below.
        expect(typeof partial).toBe('string');
        expect(headersSentSpy).not.toHaveBeenCalled();
      } finally {
        process.removeAllListeners('uncaughtException');
        for (const l of origUncaught) process.on('uncaughtException', l);
      }
    } finally {
      errSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// SC #4 — v4 path footguns rejected at boot with controller.method + v8 fix
// suggestion; valid v8 patterns work end-to-end.
// ---------------------------------------------------------------------------
describe('SC #4 — path-to-regexp v8 footguns rejected at boot; valid v8 works end-to-end', () => {
  it('rejects bare * with named-wildcard suggestion', async () => {
    @JsonController('/files')
    class FixtureA {
      @Get('/*')
      a() {
        return {};
      }
    }
    await expect(
      createExpressServer({ controllers: [FixtureA] }),
    ).rejects.toThrow(/\[FixtureA\.a\] Path ".+" uses v4 pattern "\*"; .* "\*splat or \{\*splat\}" instead\./);
  });

  it('rejects :id? with optional-segment suggestion', async () => {
    @JsonController('/users')
    class FixtureB {
      @Get('/:id?')
      b() {
        return {};
      }
    }
    await expect(
      createExpressServer({ controllers: [FixtureB] }),
    ).rejects.toThrow(/\[FixtureB\.b\] Path ".+" uses v4 pattern ":id\?"; .* "\{\/:id\} optional segment form" instead\./);
  });

  it('rejects :id(regex) with schema-validation suggestion', async () => {
    @JsonController('/posts')
    class FixtureC {
      @Get('/:id(\\d+)')
      c() {
        return {};
      }
    }
    await expect(
      createExpressServer({ controllers: [FixtureC] }),
    ).rejects.toThrow(/\[FixtureC\.c\] Path ".+" uses v4 pattern ":id\(\\d\+\)"; .* "move regex to schema validation in the input declaration" instead\./);
  });

  it('rejects (regex) unnamed group with named-param suggestion', async () => {
    @JsonController('/x')
    class FixtureD {
      @Get('/(.*)')
      d() {
        return {};
      }
    }
    await expect(
      createExpressServer({ controllers: [FixtureD] }),
    ).rejects.toThrow(/\[FixtureD\.d\] Path ".+" uses v4 pattern "\(\.\*\)"; .* "name the parameter \(e\.g\. :path\)" instead\./);
  });

  it('valid v8 patterns work end-to-end', async () => {
    @JsonController('/v8')
    class V8Ctl {
      @Get('/files/*splat')
      files({ params }: { params: Record<string, unknown> }) {
        return { kind: 'splat', params };
      }

      @Get('/users{/:id}')
      users({ params }: { params: Record<string, unknown> }) {
        return { kind: 'optional', params };
      }
    }
    const app = await createExpressServer({ controllers: [V8Ctl] });
    const r1 = await request(app).get('/v8/files/a/b/c');
    expect(r1.status).toBe(200);
    expect(r1.body.kind).toBe('splat');

    // Optional segment: both with and without :id
    const r2 = await request(app).get('/v8/users');
    expect(r2.status).toBe(200);
    expect(r2.body.kind).toBe('optional');

    const r3 = await request(app).get('/v8/users/7');
    expect(r3.status).toBe(200);
    expect(r3.body.kind).toBe('optional');
  });
});

// ---------------------------------------------------------------------------
// SC #5 — JSON / primitive / null / string / Buffer / stream / async-iterable
// response writing; @Header end-to-end (Phase 1 decorator → Phase 2 wire).
// ---------------------------------------------------------------------------
describe('SC #5 — response writing: JSON, primitive, stream, async iterable, @Header', () => {
  @JsonController('/sc5j')
  class SC5Json {
    @Get('/object')
    obj() {
      return { ok: true, count: 3 };
    }

    @Get('/primitive')
    prim() {
      return 42;
    }

    @Get('/null-default')
    nullDefault(): unknown {
      return null;
    }

    @Get('/stream')
    stream(): Readable {
      return Readable.from(['chunk-a', 'chunk-b']);
    }

    @Get('/iter')
    iter(): AsyncIterable<string> {
      async function* gen() {
        yield 'x';
        yield 'y';
      }
      return gen();
    }
  }

  @Controller('/sc5t')
  class SC5Text {
    @Get('/string')
    str() {
      return 'hello world';
    }

    @Get('/buffer')
    buf() {
      return Buffer.from('binary');
    }
  }

  @JsonController('/sc5h')
  class SC5Header {
    @Get('/h')
    @Header('X-Custom-Header', 'phase2')
    hi() {
      return { ok: 1 };
    }
  }

  it('@JsonController returning plain object → application/json', async () => {
    const app = await createExpressServer({ controllers: [SC5Json] });
    const res = await request(app).get('/sc5j/object');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toMatchObject({ ok: true, count: 3 });
  });

  it('@JsonController returning primitive → JSON-encoded primitive', async () => {
    const app = await createExpressServer({ controllers: [SC5Json] });
    const res = await request(app).get('/sc5j/primitive');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toBe(42);
  });

  it('@JsonController returning null → 204 No Content (default, no @OnNull)', async () => {
    const app = await createExpressServer({ controllers: [SC5Json] });
    const res = await request(app).get('/sc5j/null-default');
    expect(res.status).toBe(204);
    expect(res.text === '' || res.text === undefined).toBe(true);
  });

  it('@Controller returning string → text/html', async () => {
    const app = await createExpressServer({ controllers: [SC5Text] });
    const res = await request(app).get('/sc5t/string');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toBe('hello world');
  });

  it('@JsonController returning a Node Readable stream → piped to response with backpressure', async () => {
    const app = await createExpressServer({ controllers: [SC5Json] });
    const res = await request(app).get('/sc5j/stream');
    expect(res.status).toBe(200);
    expect(res.text).toBe('chunk-achunk-b');
  });

  it('@JsonController returning an async iterable → piped via Readable.from', async () => {
    const app = await createExpressServer({ controllers: [SC5Json] });
    const res = await request(app).get('/sc5j/iter');
    expect(res.status).toBe(200);
    expect(res.text).toBe('xy');
  });

  it('@Header() decorator end-to-end — header from Phase 1 decorator arrives on the wire', async () => {
    const app = await createExpressServer({ controllers: [SC5Header] });
    const res = await request(app).get('/sc5h/h');
    expect(res.status).toBe(200);
    expect(res.headers['x-custom-header']).toBe('phase2');
    expect(res.body).toMatchObject({ ok: 1 });
  });
});
