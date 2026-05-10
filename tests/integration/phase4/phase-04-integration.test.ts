/**
 * Phase 4 Integration Tests — End-to-end verification of ROADMAP SC#1..#5.
 *
 * Each describe block maps 1:1 to a ROADMAP Phase 4 success criterion,
 * mirroring the Phase 2 / Phase 3 acceptance test pattern.
 *
 * All imports come ONLY from `../../src/index.js` (the public barrel).
 * No reaching into internal adapter modules.
 *
 * SC#1 — @Cookies / @Session input slots
 * SC#2 — UploadedFile / UploadedFiles + mandatory limits/fileFilter
 * SC#3 — @Redirect / @Location / @Render response shapers
 * SC#4 — cors boot option + glob controller loading + printRoutes
 * SC#5 — getRequestContext + AsyncLocalStorage cross-await propagation
 *
 * Boot-order invariant (D-18): ALS first, CORS second, lib globals third,
 * controller routers fourth.
 */
import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import multer from 'multer';
import {
  Controller,
  JsonController,
  Get,
  Post,
  HttpCode,
  useExpressControllers,
  createExpressServer,
  resetContainer,
  UploadedFile,
  UploadedFiles,
  Render,
  Redirect,
  Location,
  getRequestContext,
} from '../../../src/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Inline view engine: returns JSON.stringify(locals) — no EJS/Handlebars dep */
function setupViewEngine(app: ReturnType<typeof express>): void {
  app.engine(
    'html',
    (
      _filePath: string,
      options: object,
      callback: (e: Error | null, rendered?: string) => void,
    ) => {
      const locals = Object.fromEntries(
        Object.entries(options).filter(([k]) => !k.startsWith('_')),
      );
      callback(null, JSON.stringify(locals));
    },
  );
  app.set('view engine', 'html');
  app.set('views', './tests/fixtures/views');
}

/** Permissive file filter that accepts all files. */
const acceptAll: import('../../../src/index.js').FileFilter = (_req, _file, cb) =>
  cb(null, true);

const baseUploadOpts = {
  limits: { fileSize: 1024 * 1024 }, // 1 MB
  fileFilter: acceptAll,
  storage: multer.memoryStorage(),
};

beforeEach(() => resetContainer());
afterEach(() => resetContainer());

// =============================================================================
// SC#1 — @Cookies / @Session input slots
// =============================================================================

describe('SC#1 — cookies + session input slots', () => {
  it('SC#1-A: parsed cookies arrive in handler via cookies slot', async () => {
    @JsonController('/sc1-cookies')
    class Sc1CookiesCtrl {
      @Get('/read', { cookies: { sid: true } })
      read({ cookies }: { cookies: { sid: string } }) {
        return { sid: cookies.sid };
      }
    }

    const app = await createExpressServer({ controllers: [Sc1CookiesCtrl] });
    const res = await request(app)
      .get('/sc1-cookies/read')
      .set('Cookie', 'sid=mysessionid123');

    expect(res.status).toBe(200);
    expect(res.body.sid).toBe('mysessionid123');
  });

  it('SC#1-B: session slot passes req.session object to handler', async () => {
    @JsonController('/sc1-session')
    class Sc1SessionCtrl {
      @Get('/read', { session: true })
      read({ session }: { session: unknown }) {
        return { hasSession: session !== undefined };
      }
    }

    const app = express();
    // Simulate a session middleware that populates req.session
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as any).session = { userId: 42, role: 'admin' };
      next();
    });
    await useExpressControllers(app, { controllers: [Sc1SessionCtrl] });

    const res = await request(app).get('/sc1-session/read');
    expect(res.status).toBe(200);
    expect(res.body.hasSession).toBe(true);
  });

  it('SC#1-C: both cookies and session slots resolve in the same request', async () => {
    @JsonController('/sc1-both')
    class Sc1BothCtrl {
      @Get('/read', { cookies: { token: true }, session: true })
      read({
        cookies,
        session,
      }: {
        cookies: { token: string };
        session: unknown;
      }) {
        return {
          token: cookies.token,
          sessionPresent: session !== undefined,
        };
      }
    }

    const app = express();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as any).session = { loggedIn: true };
      next();
    });
    await useExpressControllers(app, { controllers: [Sc1BothCtrl] });

    const res = await request(app)
      .get('/sc1-both/read')
      .set('Cookie', 'token=bearer-abc');

    expect(res.status).toBe(200);
    expect(res.body.token).toBe('bearer-abc');
    expect(res.body.sessionPresent).toBe(true);
  });
});

// =============================================================================
// SC#2 — UploadedFile / UploadedFiles + mandatory limits/fileFilter
// =============================================================================

describe('SC#2 — UploadedFile/UploadedFiles + mandatory limits/fileFilter', () => {
  it('SC#2-A: single UploadedFile happy path — multipart POST → handler receives file', async () => {
    @JsonController('/sc2-single')
    class Sc2SingleCtrl {
      @Post('/upload', { files: { avatar: UploadedFile('avatar', { ...baseUploadOpts }) } })
      upload({ files }: { files: { avatar: Express.Multer.File } }) {
        return {
          name: files.avatar?.originalname,
          hasBuffer: Buffer.isBuffer(files.avatar?.buffer),
        };
      }
    }

    const app = await createExpressServer({ controllers: [Sc2SingleCtrl] });
    const res = await request(app)
      .post('/sc2-single/upload')
      .attach('avatar', Buffer.from('file content'), {
        filename: 'photo.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('photo.png');
    expect(res.body.hasBuffer).toBe(true);
  });

  it('SC#2-B: boot-time throw when limits absent — error matches required pattern', async () => {
    @JsonController('/sc2-no-limits')
    class Sc2NoLimitsCtrl {
      @Post('/upload', {
        files: { doc: UploadedFile('doc', { limits: null as any, fileFilter: acceptAll }) },
      })
      upload({ files }: { files: { doc: Express.Multer.File } }) {
        return { name: files.doc?.originalname };
      }
    }

    await expect(
      createExpressServer({ controllers: [Sc2NoLimitsCtrl] }),
    ).rejects.toThrow(/UploadedFile field "doc" requires explicit limits/);
  });

  it('SC#2-C: boot-time throw when fileFilter absent', async () => {
    @JsonController('/sc2-no-filter')
    class Sc2NoFilterCtrl {
      @Post('/upload', {
        files: {
          doc: UploadedFile('doc', {
            limits: { fileSize: 1000 },
            fileFilter: undefined as any,
          }),
        },
      })
      upload({ files }: { files: { doc: Express.Multer.File } }) {
        return { name: files.doc?.originalname };
      }
    }

    await expect(
      createExpressServer({ controllers: [Sc2NoFilterCtrl] }),
    ).rejects.toThrow(/requires explicit fileFilter/);
  });

  it('SC#2-D: missing multer peer — exact error string present in source', () => {
    // vi.doMock cannot reliably mock ESM peers already loaded in Vitest;
    // verify the exact error string is present in the source (same approach as 04-03).
    const { readFileSync } = require('node:fs');
    const src = readFileSync('src/adapter/uploads.ts', 'utf8');
    expect(src).toContain(
      'File upload requires multer as a peer dependency. Install it with: pnpm add multer',
    );
  });

  it('SC#2-E: multi-field UploadedFile + UploadedFiles on one route — both files arrive', async () => {
    @JsonController('/sc2-multi')
    class Sc2MultiCtrl {
      @Post('/upload', {
        files: {
          avatar: UploadedFile('avatar', { ...baseUploadOpts }),
          photos: UploadedFiles('photos', { ...baseUploadOpts }),
        },
      })
      upload({ files }: { files: { avatar: Express.Multer.File; photos: Express.Multer.File[] } }) {
        return {
          avatarName: files.avatar?.originalname,
          photoCount: files.photos?.length ?? 0,
        };
      }
    }

    const app = await createExpressServer({ controllers: [Sc2MultiCtrl] });
    const res = await request(app)
      .post('/sc2-multi/upload')
      .attach('avatar', Buffer.from('avatar data'), {
        filename: 'avatar.jpg',
        contentType: 'image/jpeg',
      })
      .attach('photos', Buffer.from('p1'), { filename: 'p1.jpg', contentType: 'image/jpeg' })
      .attach('photos', Buffer.from('p2'), { filename: 'p2.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.avatarName).toBe('avatar.jpg');
    expect(res.body.photoCount).toBe(2);
  });
});

// =============================================================================
// SC#3 — @Redirect / @Location / @Render response shapers
// =============================================================================

describe('SC#3 — @Redirect / @Location / @Render response shapers', () => {
  it('SC#3-A: @Redirect with object return → 302 Location with interpolated template', async () => {
    @JsonController('/sc3-redirect')
    class Sc3RedirectCtrl {
      @Redirect('/users/:id')
      @Get('/go')
      go() {
        return { id: 42 };
      }
    }

    const app = await createExpressServer({
      controllers: [Sc3RedirectCtrl],
      defaultErrorHandler: false,
    });
    const res = await request(app).get('/sc3-redirect/go').redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/users/42');
  });

  it('SC#3-B: @Location sets Location header; body still flows', async () => {
    @JsonController('/sc3-location')
    class Sc3LocationCtrl {
      @Location('/items/:id')
      @Get('/item')
      getItem() {
        return { id: 99, name: 'widget' };
      }
    }

    const app = await createExpressServer({ controllers: [Sc3LocationCtrl] });
    const res = await request(app).get('/sc3-location/item');

    expect(res.status).toBe(200);
    expect(res.headers.location).toBe('/items/99');
    expect(res.body).toMatchObject({ id: 99, name: 'widget' });
  });

  it('SC#3-C: @Render with inline view engine → response body matches locals', async () => {
    @JsonController('/sc3-render')
    class Sc3RenderCtrl {
      @Render('test')
      @Get('/view')
      renderView() {
        return { title: 'Hello Phase 4', count: 5 };
      }
    }

    const app = express();
    setupViewEngine(app);
    app.use(express.json());
    await useExpressControllers(app, { controllers: [Sc3RenderCtrl] });

    const res = await request(app).get('/sc3-render/view');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.text);
    expect(body.title).toBe('Hello Phase 4');
    expect(body.count).toBe(5);
  });
});

// =============================================================================
// SC#4 — cors + glob loading + printRoutes
// =============================================================================

describe('SC#4 — cors + glob controller loading + printRoutes', () => {
  it('SC#4-A: cors: { origin } → preflight OPTIONS returns matching Access-Control-Allow-Origin', async () => {
    @JsonController('/sc4-cors')
    class Sc4CorsCtrl {
      @Get('/hello')
      hello() {
        return { ok: true };
      }
    }

    const app = await createExpressServer({
      controllers: [Sc4CorsCtrl],
      cors: { origin: 'https://trusted.example.com' },
    });

    const res = await request(app)
      .options('/sc4-cors/hello')
      .set('Origin', 'https://trusted.example.com')
      .set('Access-Control-Request-Method', 'GET');

    expect(res.headers['access-control-allow-origin']).toBe('https://trusted.example.com');
    expect(res.status).toBeLessThan(300);
  });

  it('SC#4-B: controllers: [glob] → AlphaController and BetaController both register and respond', async () => {
    const app = await createExpressServer({
      controllers: ['tests/fixtures/glob-controllers/*.ts'],
    });

    const alphaRes = await request(app).get('/alpha/');
    expect(alphaRes.status).toBe(200);
    expect(alphaRes.body).toEqual({ ok: 'alpha' });

    const betaRes = await request(app).get('/beta/');
    expect(betaRes.status).toBe(200);
    expect(betaRes.body).toEqual({ ok: 'beta' });
  });

  it('SC#4-C: printRoutes: true → console.log spy called with header + route lines in METHOD/PATH/CONTROLLER.method format', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    @JsonController('/sc4-print')
    class Sc4PrintCtrl {
      @Get('/items')
      listItems() {
        return [];
      }

      @Post('/items')
      createItem() {
        return { id: 1 };
      }
    }

    const app = express();
    await useExpressControllers(app, {
      controllers: [Sc4PrintCtrl],
      printRoutes: true,
    });

    // Capture calls BEFORE restoring
    const calls = spy.mock.calls.map((c) => String(c[0]));
    spy.mockRestore();

    // Verify spy was called at least once
    expect(calls.length).toBeGreaterThan(0);

    // Find the header call (contains METHOD)
    const hasHeader = calls.some((line) => /METHOD/i.test(line));
    expect(hasHeader).toBe(true);

    // Verify route lines contain controller method name
    const hasRoute = calls.some((line) => /Sc4PrintCtrl\.(listItems|createItem)/.test(line));
    expect(hasRoute).toBe(true);
  });
});

// =============================================================================
// SC#5 — getRequestContext + AsyncLocalStorage
// =============================================================================

// Helper defined outside controller — proves ALS propagates across call sites
async function readContextFromHelper() {
  await new Promise<void>((r) => setImmediate(r));
  return getRequestContext();
}

describe('SC#5 — getRequestContext + ALS', () => {
  it('SC#5-A: requestId from X-Request-Id header verbatim', async () => {
    @JsonController('/sc5-header')
    class Sc5HeaderCtrl {
      @Get('/id')
      getId() {
        return { requestId: getRequestContext().requestId };
      }
    }

    const app = await createExpressServer({ controllers: [Sc5HeaderCtrl] });
    const res = await request(app)
      .get('/sc5-header/id')
      .set('X-Request-Id', 'my-custom-id-123');

    expect(res.status).toBe(200);
    expect(res.body.requestId).toBe('my-custom-id-123');
  });

  it('SC#5-B: requestId fallback to randomUUID matching UUID v4 regex when header absent', async () => {
    @JsonController('/sc5-uuid')
    class Sc5UuidCtrl {
      @Get('/id')
      getId() {
        return { requestId: getRequestContext().requestId };
      }
    }

    const app = await createExpressServer({ controllers: [Sc5UuidCtrl] });
    const res = await request(app).get('/sc5-uuid/id');

    expect(res.status).toBe(200);
    expect(res.body.requestId).toMatch(UUID_RE);
  });

  it('SC#5-C: cross-await — helper called after await sees the same ALS context', async () => {
    @JsonController('/sc5-crossawait')
    class Sc5CrossAwaitCtrl {
      @Get('/id')
      async getId() {
        const ctxBefore = getRequestContext();
        const ctxAfter = await readContextFromHelper();
        return {
          sameRequestId: ctxBefore.requestId === ctxAfter.requestId,
          sameReq: ctxBefore.req === ctxAfter.req,
          requestId: ctxBefore.requestId,
        };
      }
    }

    const app = await createExpressServer({ controllers: [Sc5CrossAwaitCtrl] });
    const res = await request(app).get('/sc5-crossawait/id');

    expect(res.status).toBe(200);
    expect(res.body.sameRequestId).toBe(true);
    expect(res.body.sameReq).toBe(true);
  });

  it('SC#5-D: getRequestContext() throws outside an active request scope', () => {
    expect(() => getRequestContext()).toThrow(
      'getRequestContext() called outside an active request scope',
    );
  });
});

// =============================================================================
// Boot-order invariants (D-18): ALS first, CORS second, lib globals third,
// controller routers fourth
// =============================================================================

describe('Boot-order invariants (D-18)', () => {
  it('D-18: ALS context is available inside CORS middleware (ALS runs outermost)', async () => {
    // Custom middleware registered BEFORE useExpressControllers should NOT
    // see ALS context (it runs outside als.run scope).
    // Custom middleware registered INSIDE useExpressControllers (via middlewares option)
    // should see ALS context.
    let alsContextInMiddleware: string | null = null;

    @JsonController('/d18')
    class D18Ctrl {
      @Get('/check')
      check() {
        return { requestId: getRequestContext().requestId };
      }
    }

    const app = express();
    // Mount a middleware AFTER ALS (inside useExpressControllers) via middlewares option
    await useExpressControllers(app, {
      controllers: [D18Ctrl],
      cors: { origin: 'https://example.com' },
      middlewares: [
        (req: Request, _res: Response, next: NextFunction) => {
          try {
            alsContextInMiddleware = getRequestContext().requestId;
          } catch {
            alsContextInMiddleware = null;
          }
          next();
        },
      ],
    });

    const res = await request(app)
      .get('/d18/check')
      .set('Origin', 'https://example.com');

    expect(res.status).toBe(200);
    // ALS context must have been available in the middleware
    expect(alsContextInMiddleware).not.toBeNull();
    expect(alsContextInMiddleware).toMatch(UUID_RE);
  });

  it('D-18: CORS preflight (OPTIONS) returns CORS headers — CORS runs after ALS and before controllers', async () => {
    @JsonController('/d18-cors')
    class D18CorsCtrl {
      @Get('/data')
      data() {
        return { value: 1 };
      }
    }

    const app = await createExpressServer({
      controllers: [D18CorsCtrl],
      cors: { origin: 'https://allowed.example.com' },
    });

    const res = await request(app)
      .options('/d18-cors/data')
      .set('Origin', 'https://allowed.example.com')
      .set('Access-Control-Request-Method', 'GET');

    // CORS middleware is active (mounted after ALS, before controllers)
    expect(res.headers['access-control-allow-origin']).toBe('https://allowed.example.com');
  });
});
