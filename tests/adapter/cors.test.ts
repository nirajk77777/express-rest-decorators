/**
 * Phase 4 Plan 05 — CORS lazy-load + preflight tests (UTIL-03).
 *
 * Tests:
 *  1. cors: true → preflight OPTIONS returns 200 with Access-Control-Allow-Origin: *
 *  2. cors: { origin: 'https://example.com' } → Access-Control-Allow-Origin matches
 *  3. Preflight does NOT reach controller stack (controller spy NOT called for OPTIONS)
 *  4. Missing cors peer → exact error message
 *  5. cors NOT set → no Access-Control-Allow-Origin header
 */
import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  JsonController,
  Get,
  useExpressControllers,
  resetContainer,
} from '../../src/index.js';
import { loadCorsMiddleware, __resetCorsCache } from '../../src/adapter/cors.js';

beforeEach(() => {
  resetContainer();
  __resetCorsCache();
});

// ─── Fixture Controller ───────────────────────────────────────────────────────

const corsHandlerSpy = vi.fn(() => ({ ok: true }));

@JsonController('/cors-test')
class CorsTestController {
  @Get('/hello')
  hello() {
    return corsHandlerSpy();
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CORS — cors: true (wildcard)', () => {
  it('preflight OPTIONS returns Access-Control-Allow-Origin: *', async () => {
    const app = express();
    await useExpressControllers(app, {
      controllers: [CorsTestController],
      cors: true,
    });

    const res = await request(app)
      .options('/cors-test/hello')
      .set('Origin', 'https://any.example.com')
      .set('Access-Control-Request-Method', 'GET');

    expect(res.headers['access-control-allow-origin']).toBe('*');
    // cors with default options returns 204 for preflight
    expect(res.status).toBeLessThan(300);
  });

  it('regular GET returns Access-Control-Allow-Origin: *', async () => {
    const app = express();
    await useExpressControllers(app, {
      controllers: [CorsTestController],
      cors: true,
    });

    const res = await request(app)
      .get('/cors-test/hello')
      .set('Origin', 'https://any.example.com');

    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.status).toBe(200);
  });
});

describe('CORS — cors: { origin: specific }', () => {
  it('response Access-Control-Allow-Origin matches configured origin', async () => {
    const app = express();
    await useExpressControllers(app, {
      controllers: [CorsTestController],
      cors: { origin: 'https://example.com' },
    });

    const res = await request(app)
      .get('/cors-test/hello')
      .set('Origin', 'https://example.com');

    expect(res.headers['access-control-allow-origin']).toBe('https://example.com');
    expect(res.status).toBe(200);
  });
});

describe('CORS — preflight does not reach controller', () => {
  it('OPTIONS preflight does NOT invoke controller method', async () => {
    corsHandlerSpy.mockClear();

    const app = express();
    await useExpressControllers(app, {
      controllers: [CorsTestController],
      cors: true,
    });

    await request(app)
      .options('/cors-test/hello')
      .set('Origin', 'https://test.example.com')
      .set('Access-Control-Request-Method', 'GET');

    // cors package handles preflight and responds before controller stack is reached
    expect(corsHandlerSpy).not.toHaveBeenCalled();
  });
});

describe('CORS — missing peer error (structural verification)', () => {
  it('exact peer error message is present in source (enforces the D-15 contract)', () => {
    const { readFileSync } = require('node:fs');
    const source = readFileSync('src/adapter/cors.ts', 'utf8');
    expect(source).toContain(
      'cors boot option requires cors as a peer dependency. Install it with: pnpm add cors',
    );
  });
});

describe('CORS — not configured', () => {
  it('no Access-Control-Allow-Origin header when cors option is not set', async () => {
    const app = express();
    await useExpressControllers(app, {
      controllers: [CorsTestController],
      // cors: NOT set
    });

    const res = await request(app)
      .get('/cors-test/hello')
      .set('Origin', 'https://any.example.com');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.status).toBe(200);
  });
});
