/**
 * Tests that writeResponse calls next() after each success branch.
 * This enables @UseAfter handlers to fire after the response is written (D-01, RESEARCH Pitfall 7).
 */
import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Readable } from 'node:stream';
import { writeResponse } from '../../src/adapter/response.js';
import type { Response, NextFunction } from 'express';
import type {
  ControllerMetadata,
  ActionMetadata,
} from '../../src/types/resolved.js';

function ctlMeta(type: 'json' | 'default', target?: Function): ControllerMetadata {
  class C {}
  return {
    target: target ?? C,
    basePath: '',
    type,
    responseHandlers: [],
    actions: [],
    useBefore: [],
    useAfter: [],
    interceptors: [],
  };
}

function actMeta(method?: string, target?: Function): ActionMetadata {
  class C {}
  return {
    target: target ?? C,
    method: method ?? 'h',
    verb: 'get',
    path: '/',
    responseHandlers: [],
    useBefore: [],
    useAfter: [],
    interceptors: [],
  };
}

/**
 * Build an Express app that calls writeResponse with the given value and
 * collects whether the next() after writeResponse was called (simulating @UseAfter).
 *
 * The app chain is:
 *   Route handler: writeResponse(res, next, value, ctl, act)
 *   Next middleware (acts as @UseAfter): sets a flag and ends response if still open
 */
function makeApp(value: unknown, ctlType: 'json' | 'default' = 'json') {
  const app = express();
  const nextCalled = { times: 0, args: undefined as unknown[] | undefined };

  app.get('/', (req, res, next) => {
    writeResponse(res, next, value, ctlMeta(ctlType), actMeta());
  }, (req, res) => {
    // This "after" handler runs only if next() was called with no args
    nextCalled.times++;
    if (!res.headersSent) res.end();
  });

  // Error handler for next(err) path
  app.use((err: Error, _req: express.Request, res: express.Response, _next: NextFunction) => {
    nextCalled.times++;
    nextCalled.args = [err];
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });

  return { app, nextCalled };
}

describe('writeResponse: next() called on every success branch (D-01, Plan 04 T1)', () => {
  it('JSON branch (@JsonController): calls next() after res.json()', async () => {
    const { app, nextCalled } = makeApp({ ok: 1 }, 'json');
    const r = await request(app).get('/');
    expect(r.status).toBe(200);
    expect(nextCalled.times).toBe(1);
    expect(nextCalled.args).toBeUndefined(); // called with no error
  });

  it('string branch (@Controller): calls next() after res.send()', async () => {
    const { app, nextCalled } = makeApp('hello', 'default');
    const r = await request(app).get('/');
    expect(r.status).toBe(200);
    expect(nextCalled.times).toBe(1);
    expect(nextCalled.args).toBeUndefined();
  });

  it('Buffer branch (@Controller): calls next() after res.send()', async () => {
    const { app, nextCalled } = makeApp(Buffer.from('xy'), 'default');
    const r = await request(app).get('/');
    expect(r.status).toBe(200);
    expect(nextCalled.times).toBe(1);
    expect(nextCalled.args).toBeUndefined();
  });

  it('null branch: calls next() after res.end()', async () => {
    const { app, nextCalled } = makeApp(null, 'json');
    const r = await request(app).get('/');
    expect(r.status).toBe(204);
    expect(nextCalled.times).toBe(1);
    expect(nextCalled.args).toBeUndefined();
  });

  it('undefined branch: calls next() after res.end()', async () => {
    const { app, nextCalled } = makeApp(undefined, 'json');
    const r = await request(app).get('/');
    expect(r.status).toBe(204);
    expect(nextCalled.times).toBe(1);
    expect(nextCalled.args).toBeUndefined();
  });

  it('default catch-all object branch (@Controller non-json): calls next() after res.json()', async () => {
    const { app, nextCalled } = makeApp({ a: 1 }, 'default');
    const r = await request(app).get('/');
    expect(r.status).toBe(200);
    expect(nextCalled.times).toBe(1);
    expect(nextCalled.args).toBeUndefined();
  });

  it('stream branch: calls next() after res emits finish (via supertest integration)', async () => {
    const { app, nextCalled } = makeApp(Readable.from(['hello']), 'default');
    const r = await request(app).get('/');
    expect(r.status).toBe(200);
    // next() is called via res.on('finish') — integration test confirms it fires
    expect(nextCalled.times).toBe(1);
    expect(nextCalled.args).toBeUndefined();
  });

  it('async-iterable branch: calls next() after res emits finish', async () => {
    async function* gen() { yield 'a'; yield 'b'; }
    const { app, nextCalled } = makeApp(gen(), 'default');
    const r = await request(app).get('/');
    expect(r.status).toBe(200);
    expect(nextCalled.times).toBe(1);
    expect(nextCalled.args).toBeUndefined();
  });

  // Unit test for the finish-handler registration (mocking res to check handler setup)
  it('stream branch: res.on("finish") is registered before pipe() is called', () => {
    const finishHandlers: Array<() => void> = [];
    const next = vi.fn();
    const res = {
      status(_n: number) { return this; },
      end() {},
      on(event: string, cb: (...args: unknown[]) => void) {
        if (event === 'finish') finishHandlers.push(cb as () => void);
        return this;
      },
      headersSent: false,
    } as unknown as Response;

    // A stream whose pipe() we can intercept
    class MockStream extends Readable {
      pipeCalledAfterFinishRegistered = false;
      override _read() {}
      override pipe<T extends NodeJS.WritableStream>(dest: T, _options?: { end?: boolean }): T {
        // At this point, finish handler should already be registered
        this.pipeCalledAfterFinishRegistered = finishHandlers.length > 0;
        return dest;
      }
    }
    const stream = new MockStream();

    writeResponse(res, next as NextFunction, stream, ctlMeta('default'), actMeta());

    expect(stream.pipeCalledAfterFinishRegistered).toBe(true);
    expect(finishHandlers.length).toBeGreaterThanOrEqual(1);

    // Calling the finish handler calls next() with no args
    finishHandlers[0]!();
    expect(next).toHaveBeenCalledWith();
  });

  it('stream error branch: calls next(err) NOT next() — @UseAfter skipped on errors (D-10)', async () => {
    class FailFastStream extends Readable {
      override _read() {
        process.nextTick(() => this.destroy(new Error('stream-error')));
      }
    }
    const { app, nextCalled } = makeApp(new FailFastStream(), 'default');
    await request(app).get('/');
    // next was called with the error (via error handler)
    expect(nextCalled.times).toBe(1);
    expect(nextCalled.args).toBeDefined();
    expect((nextCalled.args![0] as Error).message).toBe('stream-error');
  });
});

