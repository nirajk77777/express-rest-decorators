/**
 * Integration tests for @Render, @Redirect, @Location response shapers.
 * Task 3 — Phase 04-04. Tests RES-04, RES-05, RES-06.
 *
 * Tests D-05 (@Redirect), D-06 (@Render), D-07 (@Location),
 * D-08 (@JsonController override), D-09 (interceptor-before-shaper),
 * D-10 (@HttpCode override), and Pitfall 8 (null short-circuit before shaper).
 */
import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import {
  JsonController,
  Controller,
  Get,
  HttpCode,
  Interceptor,
  UseInterceptor,
  createExpressServer,
  resetContainer,
  Render,
  Redirect,
  Location,
} from '../../src/index.js';
import type { InterceptorInterface } from '../../src/index.js';
import type { Action } from '../../src/types/action.js';

beforeEach(() => resetContainer());

// ─── Inline view engine (no EJS/Handlebars dependency) ──────────────────────
// Returns JSON.stringify of the options (locals) as the rendered body.
function setupViewEngine(app: ReturnType<typeof express>): void {
  app.engine('html', (filePath: string, options: object, callback: (e: Error | null, rendered?: string) => void) => {
    // Return JSON of the locals (excluding Express-injected private fields)
    const locals = Object.fromEntries(
      Object.entries(options).filter(([k]) => !k.startsWith('_'))
    );
    callback(null, JSON.stringify(locals));
  });
  app.set('view engine', 'html');
  app.set('views', './tests/fixtures/views');
}

// ─── Test 1: @Redirect default 302 with template interpolation ───────────────

describe('Test 1: @Redirect default 302 + template interpolation', () => {
  it('issues 302 redirect with interpolated template from return object', async () => {
    @JsonController('/t1')
    class T1 {
      @Redirect('/users/:id')
      @Get('/go')
      go() { return { id: 42 }; }
    }

    const app = await createExpressServer({ controllers: [T1], defaultErrorHandler: false });
    const res = await request(app).get('/t1/go').redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/users/42');
  });
});

// ─── Test 2: @Redirect string override ───────────────────────────────────────

describe('Test 2: @Redirect string return overrides template', () => {
  it('uses the returned string verbatim as redirect URL', async () => {
    @JsonController('/t2')
    class T2 {
      @Redirect('/default')
      @Get('/go')
      go() { return 'https://elsewhere.com'; }
    }

    const app = await createExpressServer({ controllers: [T2], defaultErrorHandler: false });
    const res = await request(app).get('/t2/go').redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://elsewhere.com');
  });
});

// ─── Test 3: @Redirect bare template on undefined return ─────────────────────

describe('Test 3: @Redirect bare template on undefined return', () => {
  it('uses bare template when handler returns undefined', async () => {
    @JsonController('/t3')
    class T3 {
      @Redirect('/users/:id')
      @Get('/go')
      go(): undefined { return undefined; }
    }

    const app = await createExpressServer({ controllers: [T3], defaultErrorHandler: false });
    const res = await request(app).get('/t3/go').redirects(0);
    expect(res.status).toBe(302);
    // undefined → bare template (not interpolated — no data to interpolate)
    expect(res.headers.location).toBe('/users/:id');
  });
});

// ─── Test 4: @Redirect with @HttpCode(301) ───────────────────────────────────

describe('Test 4: @Redirect with @HttpCode(301) — permanent redirect', () => {
  it('@HttpCode overrides the redirect status', async () => {
    @JsonController('/t4')
    class T4 {
      @HttpCode(301)
      @Redirect('/permanent')
      @Get('/go')
      go() { return undefined; }
    }

    const app = await createExpressServer({ controllers: [T4], defaultErrorHandler: false });
    const res = await request(app).get('/t4/go').redirects(0);
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/permanent');
  });
});

// ─── Test 5: @Redirect with explicit status ───────────────────────────────────

describe('Test 5: @Redirect with explicit status 308', () => {
  it('uses the explicit status code from decorator', async () => {
    @JsonController('/t5')
    class T5 {
      @Redirect('/new-location', 308)
      @Get('/go')
      go() { return undefined; }
    }

    const app = await createExpressServer({ controllers: [T5], defaultErrorHandler: false });
    const res = await request(app).get('/t5/go').redirects(0);
    expect(res.status).toBe(308);
    expect(res.headers.location).toBe('/new-location');
  });
});

// ─── Test 6: @Render with object locals ──────────────────────────────────────

describe('Test 6: @Render with object locals', () => {
  it('calls res.render with template and locals', async () => {
    @Controller('/t6')
    class T6 {
      @Render('test')
      @Get('/show')
      show() { return { name: 'Ada' }; }
    }

    const app = express();
    setupViewEngine(app);
    await (await import('../../src/index.js')).useExpressControllers(app, {
      controllers: [T6],
      defaultErrorHandler: false,
    });

    const res = await request(app).get('/t6/show');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.text);
    expect(body.name).toBe('Ada');
  });
});

// ─── Test 7: @Render undefined locals ────────────────────────────────────────

describe('Test 7: @Render undefined locals', () => {
  it('renders with empty/no locals when handler returns undefined', async () => {
    @Controller('/t7')
    class T7 {
      @Render('test')
      @Get('/show')
      show(): undefined { return undefined; }
    }

    const app = express();
    setupViewEngine(app);
    await (await import('../../src/index.js')).useExpressControllers(app, {
      controllers: [T7],
      defaultErrorHandler: false,
    });

    const res = await request(app).get('/t7/show');
    expect(res.status).toBe(200);
    // The inline engine returns JSON of locals — with no locals passed it should be '{}'
    const body = JSON.parse(res.text);
    expect(typeof body).toBe('object');
  });
});

// ─── Test 8: @Render with non-object return → 500 ────────────────────────────

describe('Test 8: @Render with non-object return → 500', () => {
  it('throws actionable error when handler returns a non-object', async () => {
    @Controller('/t8')
    class T8 {
      @Render('test')
      @Get('/bad')
      bad(): unknown { return 'oops-string'; }
    }

    const app = express();
    setupViewEngine(app);
    app.use(express.json());
    await (await import('../../src/index.js')).useExpressControllers(app, {
      controllers: [T8],
      defaultErrorHandler: false,
    });
    // Add error handler AFTER useExpressControllers so it catches thrown errors
    app.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      const msg = _err instanceof Error ? _err.message : String(_err);
      res.status(500).json({ error: msg });
    });

    const res = await request(app).get('/t8/bad');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/@Render expects an object or undefined/);
  });
});

// ─── Test 9: @Location — sets Location header, body still written ─────────────

describe('Test 9: @Location sets Location header, body still flows', () => {
  it('sets Location header and returns JSON body with status 200', async () => {
    @JsonController('/t9')
    class T9 {
      @Location('/items/:id')
      @Get('/create')
      create() { return { id: 1, name: 'item' }; }
    }

    const app = await createExpressServer({ controllers: [T9], defaultErrorHandler: false });
    const res = await request(app).get('/t9/create');
    expect(res.status).toBe(200);
    expect(res.headers.location).toBe('/items/1');
    expect(res.body).toEqual({ id: 1, name: 'item' });
  });
});

// ─── Test 10: Missing placeholder error → 500 ─────────────────────────────────

describe('Test 10: Missing :placeholder in @Redirect template → 500', () => {
  it('returns 500 with error message referencing the missing key', async () => {
    @JsonController('/t10')
    class T10 {
      @Redirect('/x/:missing')
      @Get('/go')
      go() { return {}; }
    }

    const app = express();
    app.use(express.json());
    await (await import('../../src/index.js')).useExpressControllers(app, {
      controllers: [T10],
      defaultErrorHandler: false,
    });
    // Add error handler AFTER useExpressControllers
    app.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      const msg = _err instanceof Error ? _err.message : String(_err);
      res.status(500).json({ error: msg });
    });

    const res = await request(app).get('/t10/go');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/references ":missing" but handler return value has no "missing" property/);
  });
});

// ─── Test 11: @Render overrides @JsonController JSON serialization (D-08) ────

describe('Test 11: @Render overrides @JsonController for the decorated method (D-08)', () => {
  it('@JsonController + @Render method returns rendered view, not JSON', async () => {
    @JsonController('/t11')
    class T11 {
      @Render('test')
      @Get('/view')
      view() { return { rendered: true }; }

      @Get('/json')
      json() { return { rendered: false }; }
    }

    const app = express();
    setupViewEngine(app);
    await (await import('../../src/index.js')).useExpressControllers(app, {
      controllers: [T11],
      defaultErrorHandler: false,
    });

    // /t11/view should render with view engine, NOT return JSON
    const viewRes = await request(app).get('/t11/view');
    expect(viewRes.status).toBe(200);
    // The inline engine returns JSON.stringify(locals) as text, not application/json content-type
    // The content-type from res.render is text/html by default
    const body = JSON.parse(viewRes.text);
    expect(body.rendered).toBe(true);

    // /t11/json should return standard JSON (not rendered)
    const jsonRes = await request(app).get('/t11/json');
    expect(jsonRes.status).toBe(200);
    expect(jsonRes.body).toEqual({ rendered: false });
  });
});

// ─── Test 12: Interceptor runs BEFORE shaper (D-09) ──────────────────────────

describe('Test 12: Interceptor runs before shaper (D-09)', () => {
  it('interceptor transforms return value; shaper sees the post-intercept value', async () => {
    @Interceptor()
    class MultiplyIdInterceptor implements InterceptorInterface {
      intercept(_action: Action, content: unknown): unknown {
        if (content && typeof content === 'object' && 'id' in (content as object)) {
          return { ...(content as Record<string, unknown>), id: 999 };
        }
        return content;
      }
    }

    @JsonController('/t12')
    class T12 {
      @UseInterceptor(MultiplyIdInterceptor)
      @Redirect('/n/:id')
      @Get('/go')
      go() { return { id: 1 }; }
    }

    const app = await createExpressServer({
      controllers: [T12],
      defaultErrorHandler: false,
    });

    const res = await request(app).get('/t12/go').redirects(0);
    expect(res.status).toBe(302);
    // Interceptor transformed { id: 1 } → { id: 999 }; shaper sees id=999
    expect(res.headers.location).toBe('/n/999');
  });
});

// ─── Test 13: Null short-circuit precedes shaper (Pitfall 8) ─────────────────

describe('Test 13: null return with @Redirect skips shaper → 204 (Pitfall 8)', () => {
  it('null handler return short-circuits before shaper, @OnNull/@OnUndefined applies', async () => {
    @JsonController('/t13')
    class T13 {
      @Redirect('/target')
      @Get('/go')
      go(): null { return null; }
    }

    const app = await createExpressServer({ controllers: [T13], defaultErrorHandler: false });
    // null return with no @OnNull → default 204 (D-13), NOT a redirect
    const res = await request(app).get('/t13/go').redirects(0);
    expect(res.status).toBe(204);
    expect(res.headers.location).toBeUndefined();
  });
});
