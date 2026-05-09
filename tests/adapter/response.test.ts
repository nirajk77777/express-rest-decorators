import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Readable } from 'node:stream';
import {
  applyResponseHandlers,
  writeResponse,
} from '../../src/adapter/response.js';
import type { Response, NextFunction } from 'express';
import type {
  ControllerMetadata,
  ActionMetadata,
} from '../../src/types/resolved.js';
import type { ResponseHandlerArgs } from '../../src/metadata/types.js';

function makeRes(): {
  res: Response;
  calls: Array<unknown[]>;
} {
  const calls: Array<unknown[]> = [];
  const res = {
    status(n: number) {
      calls.push(['status', n]);
      return this;
    },
    set(k: string, v: string) {
      calls.push(['set', k, v]);
      return this;
    },
    type(t: string) {
      calls.push(['type', t]);
      return this;
    },
  } as unknown as Response;
  return { res, calls };
}

describe('applyResponseHandlers', () => {
  it('applies success-code via res.status', () => {
    const { res, calls } = makeRes();
    applyResponseHandlers(res, [], [{ type: 'success-code', value: 201 }]);
    expect(calls).toContainEqual(['status', 201]);
  });

  it('applies content-type via res.type', () => {
    const { res, calls } = makeRes();
    applyResponseHandlers(
      res,
      [],
      [{ type: 'content-type', value: 'text/plain' }],
    );
    expect(calls).toContainEqual(['type', 'text/plain']);
  });

  it('applies header via res.set using value(name) + secondaryValue(value)', () => {
    const { res, calls } = makeRes();
    applyResponseHandlers(
      res,
      [],
      [{ type: 'header', value: 'X-Custom', secondaryValue: 'hello' }],
    );
    expect(calls).toContainEqual(['set', 'X-Custom', 'hello']);
  });

  it('applies controller handlers first then action handlers (action wins via call order)', () => {
    const { res, calls } = makeRes();
    applyResponseHandlers(
      res,
      [{ type: 'success-code', value: 200 }],
      [{ type: 'success-code', value: 201 }],
    );
    expect(calls).toEqual([
      ['status', 200],
      ['status', 201],
    ]);
  });

  it('does NOT apply null-result-code (handled in writeResponse)', () => {
    const { res, calls } = makeRes();
    applyResponseHandlers(
      res,
      [],
      [{ type: 'null-result-code', value: 404 }],
    );
    expect(calls).toEqual([]);
  });

  it('does NOT apply undefined-result-code (handled in writeResponse)', () => {
    const { res, calls } = makeRes();
    applyResponseHandlers(
      res,
      [],
      [{ type: 'undefined-result-code', value: 204 }],
    );
    expect(calls).toEqual([]);
  });

  it('ignores unknown types silently', () => {
    const { res, calls } = makeRes();
    applyResponseHandlers(
      res,
      [],
      [{ type: 'made-up' as unknown as ResponseHandlerArgs['type'], value: 1 }],
    );
    expect(calls).toEqual([]);
  });
});

// --- writeResponse integration tests ---

class TestController {}
class StreamCtl {
  boom() {
    /* placeholder */
  }
}

function ctlMeta(
  type: 'json' | 'default',
  target: Function = TestController,
  responseHandlers: ResponseHandlerArgs[] = [],
): ControllerMetadata {
  return {
    target,
    basePath: '',
    type,
    responseHandlers,
    actions: [],
  };
}

function actMeta(
  method: string | symbol = 'h',
  responseHandlers: ResponseHandlerArgs[] = [],
  target: Function = TestController,
): ActionMetadata {
  return {
    target,
    method,
    verb: 'get',
    path: '/',
    responseHandlers,
  };
}

function makeApp(
  value: unknown,
  ctl: ControllerMetadata,
  act: ActionMetadata,
  errorSink?: (err: unknown) => void,
) {
  const app = express();
  app.get('/', (_req, res, next) => {
    writeResponse(res, next, value, ctl, act);
  });
  app.use(
    (
      err: Error & { source?: string },
      _req: express.Request,
      res: express.Response,
      _next: NextFunction,
    ) => {
      if (errorSink) errorSink(err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message, source: err.source });
      } else {
        res.end();
      }
    },
  );
  return app;
}

describe('writeResponse (D-11/D-12/D-13, RES-08)', () => {
  it('1. JSON object via @JsonController serializes via res.json', async () => {
    const app = makeApp({ ok: 1 }, ctlMeta('json'), actMeta());
    const r = await request(app).get('/');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: 1 });
    expect(r.headers['content-type']).toMatch(/application\/json/);
  });

  it('2. JSON null without shaper → 204 empty body', async () => {
    const app = makeApp(null, ctlMeta('json'), actMeta());
    const r = await request(app).get('/');
    expect(r.status).toBe(204);
    expect(r.text).toBe('');
  });

  it('3. JSON undefined without shaper → 204 empty body', async () => {
    const app = makeApp(undefined, ctlMeta('json'), actMeta());
    const r = await request(app).get('/');
    expect(r.status).toBe(204);
    expect(r.text).toBe('');
  });

  it('4. @OnNull(404) honored', async () => {
    const app = makeApp(
      null,
      ctlMeta('json'),
      actMeta('h', [{ type: 'null-result-code', value: 404 }]),
    );
    const r = await request(app).get('/');
    expect(r.status).toBe(404);
    expect(r.text).toBe('');
  });

  it('5. @OnUndefined(202) honored', async () => {
    const app = makeApp(
      undefined,
      ctlMeta('json'),
      actMeta('h', [{ type: 'undefined-result-code', value: 202 }]),
    );
    const r = await request(app).get('/');
    expect(r.status).toBe(202);
  });

  it('6. String via @Controller → res.send (text/html default)', async () => {
    const app = makeApp('hello', ctlMeta('default'), actMeta());
    const r = await request(app).get('/');
    expect(r.status).toBe(200);
    expect(r.text).toBe('hello');
    expect(r.headers['content-type']).toMatch(/^text\//);
  });

  it('7. Buffer via @Controller → res.send', async () => {
    const app = makeApp(Buffer.from('xy'), ctlMeta('default'), actMeta());
    const r = await request(app).get('/').buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(r.status).toBe(200);
    expect((r.body as Buffer).toString()).toBe('xy');
  });

  it('8. Object via @Controller falls back to JSON', async () => {
    const app = makeApp({ a: 1 }, ctlMeta('default'), actMeta());
    const r = await request(app).get('/');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ a: 1 });
    expect(r.headers['content-type']).toMatch(/application\/json/);
  });

  it('9. Async iterable wrapped in Readable.from and piped (RES-08)', async () => {
    async function* gen() {
      yield 'a';
      yield 'b';
    }
    const app = makeApp(gen(), ctlMeta('default'), actMeta());
    const r = await request(app).get('/').buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(r.status).toBe(200);
    expect((r.body as Buffer).toString()).toBe('ab');
  });

  it('10. Stream piped via .pipe (RES-08, D-12 stream-first)', async () => {
    const stream = Readable.from(['x', 'y']);
    const app = makeApp(stream, ctlMeta('default'), actMeta());
    const r = await request(app).get('/').buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(r.status).toBe(200);
    expect((r.body as Buffer).toString()).toBe('xy');
  });

  it('11. Stream errors mid-pipe: connection closes cleanly, no double-write', async () => {
    class ErroringStream extends Readable {
      private sent = false;
      override _read() {
        if (!this.sent) {
          this.push('partial');
          this.sent = true;
        } else {
          this.destroy(new Error('mid-stream'));
        }
      }
    }
    const errors: unknown[] = [];
    const app = makeApp(
      new ErroringStream(),
      ctlMeta('default'),
      actMeta(),
      (e) => errors.push(e),
    );
    let threw = false;
    try {
      await request(app).get('/');
    } catch {
      threw = true;
    }
    // Either the request succeeded with truncated body, or socket-hang-up — both fine.
    // The key assertion: no ERR_HTTP_HEADERS_SENT and error middleware was NOT
    // invoked (because headers had already been sent — D-14 destroy path).
    expect(threw).toBe(true);
    // headers were already sent before the error, so error middleware should not be called
    expect(errors).toEqual([]);
  });

  it('12. Stream errors before any byte: forwards via next(err); error middleware runs', async () => {
    class FailFastStream extends Readable {
      override _read() {
        process.nextTick(() => this.destroy(new Error('immediate')));
      }
    }
    const errors: Array<Error & { source?: string }> = [];
    const app = makeApp(
      new FailFastStream(),
      ctlMeta('default', StreamCtl),
      actMeta('boom', [], StreamCtl),
      (e) => errors.push(e as Error & { source?: string }),
    );
    const r = await request(app).get('/');
    expect(r.status).toBe(500);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe('immediate');
  });

  it('13. HttpCode shaper applied to plain JSON value', async () => {
    const app = makeApp(
      { ok: 1 },
      ctlMeta('json'),
      actMeta('h', [{ type: 'success-code', value: 201 }]),
    );
    const r = await request(app).get('/');
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ ok: 1 });
  });

  it('INFO #7: stream error attaches err.source = `${ControllerClass.name}.${method}`', async () => {
    class FailFastStream extends Readable {
      override _read() {
        process.nextTick(() => this.destroy(new Error('boom')));
      }
    }
    const errors: Array<Error & { source?: string }> = [];
    const app = makeApp(
      new FailFastStream(),
      ctlMeta('default', StreamCtl),
      actMeta('boom', [], StreamCtl),
      (e) => errors.push(e as Error & { source?: string }),
    );
    await request(app).get('/');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.source).toBe('StreamCtl.boom');
  });

  it('INFO #7: existing err.source is NOT overwritten', async () => {
    class FailFastStream extends Readable {
      override _read() {
        process.nextTick(() => {
          const err = new Error('boom') as Error & { source?: string };
          err.source = 'CustomSource.preset';
          this.destroy(err);
        });
      }
    }
    const errors: Array<Error & { source?: string }> = [];
    const app = makeApp(
      new FailFastStream(),
      ctlMeta('default', StreamCtl),
      actMeta('boom', [], StreamCtl),
      (e) => errors.push(e as Error & { source?: string }),
    );
    await request(app).get('/');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.source).toBe('CustomSource.preset');
  });
});
