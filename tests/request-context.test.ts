/**
 * Phase 4 Plan 01 — AsyncLocalStorage request context smoke tests.
 *
 * Covers ROADMAP SC #5:
 *   - requestId from X-Request-Id header (verbatim)
 *   - requestId falls back to randomUUID() when header absent / empty / whitespace
 *   - cross-await propagation of ALS context
 *   - getRequestContext() throws outside an active request scope
 *   - concurrent requests get isolated requestIds
 */
import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  JsonController,
  Get,
  useExpressControllers,
  resetContainer,
  getRequestContext,
} from '../src/index.js';
import type { Request, Response, NextFunction } from 'express';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

beforeEach(() => resetContainer());

// ─── Module-scope helper for cross-await test ────────────────────────────────
// Defined OUTSIDE the controller class to prove ALS propagates across
// function call sites, not just inline awaits. (ROADMAP SC #5)
async function readContextAfterAwait() {
  await new Promise<void>((r) => setImmediate(r));
  return getRequestContext();
}

// ─── Shared controller for header / uuid tests ───────────────────────────────
let lastRequestId: string | null = null;
let crossAwaitSameReq = false;
let crossAwaitSameId = false;

@JsonController('/ctx')
class ContextTestController {
  @Get('/id')
  getRequestId(_args: { req: Request; res: Response; next: NextFunction }) {
    lastRequestId = getRequestContext().requestId;
    return { requestId: lastRequestId };
  }

  @Get('/await-boundary')
  async crossAwait(_args: { req: Request; res: Response; next: NextFunction }) {
    const ctxBefore = getRequestContext();
    const ctxAfter = await readContextAfterAwait();
    crossAwaitSameReq = ctxBefore.req === ctxAfter.req;
    crossAwaitSameId = ctxBefore.requestId === ctxAfter.requestId;
    return { requestId: ctxAfter.requestId, sameReq: crossAwaitSameReq };
  }
}

// ─── Concurrent isolation controller ─────────────────────────────────────────
const recordedIds: string[] = [];

@JsonController('/concurrent')
class ConcurrentController {
  @Get('/id')
  async getId(_args: { req: Request; res: Response; next: NextFunction }) {
    // Small delay so concurrent requests overlap in the event loop
    await new Promise<void>((r) => setTimeout(r, 5));
    const id = getRequestContext().requestId;
    recordedIds.push(id);
    return { requestId: id };
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getRequestContext throws when called outside a request', () => {
  it('throws with exact actionable error message', () => {
    expect(() => getRequestContext()).toThrowError(
      'getRequestContext() called outside an active request scope — ensure useExpressControllers() is mounted on the app before this code runs.',
    );
  });
});

describe('requestId from X-Request-Id header is used verbatim', () => {
  it('uses the X-Request-Id header value unchanged', async () => {
    const app = express();
    app.use(express.json());
    await useExpressControllers(app, { controllers: [ContextTestController] });

    const res = await request(app)
      .get('/ctx/id')
      .set('X-Request-Id', 'trace-abc-123');

    expect(res.status).toBe(200);
    expect(res.body.requestId).toBe('trace-abc-123');
  });
});

describe('requestId falls back to randomUUID when header absent', () => {
  it('generates a UUID v4 when no X-Request-Id header is sent', async () => {
    const app = express();
    app.use(express.json());
    await useExpressControllers(app, { controllers: [ContextTestController] });

    const res = await request(app).get('/ctx/id');

    expect(res.status).toBe(200);
    expect(res.body.requestId).toMatch(UUID_RE);
  });
});

describe('requestId falls back to randomUUID when header is empty/whitespace', () => {
  it('generates a UUID when X-Request-Id is whitespace-only', async () => {
    const app = express();
    app.use(express.json());
    await useExpressControllers(app, { controllers: [ContextTestController] });

    const res = await request(app)
      .get('/ctx/id')
      .set('X-Request-Id', '   ');

    expect(res.status).toBe(200);
    expect(res.body.requestId).toMatch(UUID_RE);
  });
});

describe('ALS context survives an await boundary (cross-await smoke test)', () => {
  it('context is identical before and after an await + setImmediate hop', async () => {
    const app = express();
    app.use(express.json());
    await useExpressControllers(app, {
      controllers: [ContextTestController],
    });

    const res = await request(app)
      .get('/ctx/await-boundary')
      .set('X-Request-Id', 'cross-await-id');

    expect(res.status).toBe(200);
    // Cross-await: requestId must match through setImmediate boundary
    expect(res.body.requestId).toBe('cross-await-id');
    // req reference identity preserved across await boundary
    expect(res.body.sameReq).toBe(true);
    // Module-scope variables set by the controller during the request
    expect(crossAwaitSameReq).toBe(true);
    expect(crossAwaitSameId).toBe(true);
  });
});

describe('concurrent requests get different requestIds', () => {
  it('5 parallel requests each get a unique requestId', async () => {
    recordedIds.length = 0;
    const app = express();
    app.use(express.json());
    await useExpressControllers(app, { controllers: [ConcurrentController] });

    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        request(app)
          .get('/concurrent/id')
          .set('X-Request-Id', `req-${i}`),
      ),
    );

    expect(recordedIds).toHaveLength(5);
    const unique = new Set(recordedIds);
    expect(unique.size).toBe(5);
  });
});
