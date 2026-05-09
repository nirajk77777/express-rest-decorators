import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import {
  composePath,
  detectV4Pattern,
  buildControllerRouter,
} from '../../src/adapter/router-build.js';
import { buildMetadata } from '../../src/metadata/builder.js';
import {
  UsersController,
  BaseController,
  DerivedController,
} from './fixtures/controllers.js';
import { Get, JsonController } from '../../src/index.js';
import type { ActionMetadata, ControllerMetadata } from '../../src/types/resolved.js';
import type { RequestHandler } from 'express';

describe('composePath (D-04)', () => {
  it('returns /users for empty prefix and basePath with action /users', () => {
    expect(composePath('', '', '/users')).toBe('/users');
  });

  it('joins all three parts with leading slashes', () => {
    expect(composePath('/api', '/users', '/:id')).toBe('/api/users/:id');
  });

  it('strips trailing slashes from each part', () => {
    expect(composePath('/api/', '/users/', '/:id')).toBe('/api/users/:id');
  });

  it('allows empty controller basePath', () => {
    expect(composePath('/api', '', '/health')).toBe('/api/health');
  });

  it('allows empty action path (controller root)', () => {
    expect(composePath('', '/users', '')).toBe('/users');
  });

  it('returns prefix+basePath when action path empty', () => {
    expect(composePath('/api', '/users', '')).toBe('/api/users');
  });

  it('collapses consecutive slashes', () => {
    expect(composePath('//api//', '//users//', '//:id//')).toBe('/api/users/:id');
  });

  it('returns / when everything is empty', () => {
    expect(composePath('', '', '')).toBe('/');
  });

  it('adds leading slash for parts without one', () => {
    expect(composePath('api', 'users', ':id')).toBe('/api/users/:id');
  });

  it('passes through v8-valid named wildcard', () => {
    expect(composePath('', '/files', '/*splat')).toBe('/files/*splat');
  });

  it('passes through v8 optional group syntax', () => {
    expect(composePath('', '/users', '{/:id}')).toBe('/users{/:id}');
  });
});

describe('detectV4Pattern (D-05)', () => {
  const CTL = 'FixtureCtl';
  const M = 'actionM';

  describe('must throw with actionable message', () => {
    it('flags bare * wildcard preceded by a slash', () => {
      expect(() => detectV4Pattern('/files/*', CTL, M)).toThrowError(
        /^\[FixtureCtl\.actionM\] Path "\/files\/\*" uses v4 pattern "\*"; in path-to-regexp v8 use "\*splat or \{\*splat\}" instead\.$/,
      );
    });

    it('flags bare * wildcard alone', () => {
      expect(() => detectV4Pattern('*', CTL, M)).toThrowError(
        /uses v4 pattern "\*".*\*splat or \{\*splat\}/,
      );
    });

    it('flags :name? optional-param suffix', () => {
      expect(() => detectV4Pattern('/users/:id?', CTL, M)).toThrowError(
        /\[FixtureCtl\.actionM\].*uses v4 pattern ":id\?".*\{\/:id\} optional segment form/,
      );
    });

    it('flags :name(regex) inline regex', () => {
      expect(() => detectV4Pattern('/posts/:id(\\d+)', CTL, M)).toThrowError(
        /\[FixtureCtl\.actionM\].*uses v4 pattern ":id\(\\d\+\)".*move regex to schema validation/,
      );
    });

    it('flags unnamed (regex) groups', () => {
      expect(() => detectV4Pattern('/(.*)', CTL, M)).toThrowError(
        /\[FixtureCtl\.actionM\].*uses v4 pattern "\(\.\*\)".*name the parameter/,
      );
    });

    it('reports only the first offender when multiple exist', () => {
      let msg = '';
      try {
        detectV4Pattern('/posts/:id(\\d+)/posts/:postId(\\d+)', CTL, M);
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(msg).toContain('uses v4 pattern ":id(\\d+)"');
      // The "uses v4 pattern" report names :id(\d+) (the first offender),
      // not :postId(\d+).
      expect(msg).not.toMatch(/uses v4 pattern ":postId/);
    });
  });

  describe('must NOT throw for valid v8 paths', () => {
    const valid = [
      '/users/:id',
      '/users/:id/posts/:postId',
      '/files/*splat',
      '/files{/*splat}',
      '/users{/:id}',
      '/files/:file{.:ext}',
      '/health',
      '/',
    ];
    for (const p of valid) {
      it(`accepts ${p}`, () => {
        expect(() => detectV4Pattern(p, CTL, M)).not.toThrow();
      });
    }
  });
});

describe('buildControllerRouter (ROUTE-05)', () => {
  const noopFactory = () => (_req: unknown, _res: unknown, _next?: unknown) => {};

  function getMeta(ctor: Function): ControllerMetadata {
    const all = buildMetadata([ctor]);
    return all[0]!;
  }

  it('registers one route per action on the express.Router', () => {
    const meta = getMeta(UsersController);
    const { router } = buildControllerRouter(meta, '', noopFactory as any);
    // 4 actions: GET /:id, POST /, GET /null, GET /undef
    const routePaths = router.stack
      .map((l: any) => l.route?.path)
      .filter((p: any) => typeof p === 'string');
    expect(routePaths).toHaveLength(4);
    expect(routePaths).toContain('/:id');
    expect(routePaths).toContain('/');
    expect(routePaths).toContain('/null');
    expect(routePaths).toContain('/undef');
  });

  it('registers correct verbs on each route', () => {
    const meta = getMeta(UsersController);
    const { router } = buildControllerRouter(meta, '', noopFactory as any);
    const layers = router.stack.filter((l: any) => l.route);
    const byPath: Record<string, string[]> = {};
    for (const l of layers) {
      const p = l.route!.path as string;
      const methods = Object.keys((l.route as any).methods ?? {});
      byPath[p] = (byPath[p] ?? []).concat(methods);
    }
    expect(byPath['/:id']).toContain('get');
    expect(byPath['/']).toContain('post');
  });

  it('returns the correct mountPath when routePrefix is supplied', () => {
    const meta = getMeta(UsersController);
    const { mountPath } = buildControllerRouter(meta, '/api', noopFactory as any);
    expect(mountPath).toBe('/api/users');
  });

  it('returns the correct mountPath with no routePrefix', () => {
    const meta = getMeta(UsersController);
    const { mountPath } = buildControllerRouter(meta, '', noopFactory as any);
    expect(mountPath).toBe('/users');
  });

  it('throws when any action path triggers a v4 pattern detection', () => {
    @JsonController('/bad')
    class BadController {
      @Get('/:id?')
      lookup() {
        return null;
      }
    }
    const meta = getMeta(BadController);
    expect(() => buildControllerRouter(meta, '', noopFactory as any)).toThrowError(
      /\[BadController\.lookup\].*uses v4 pattern ":id\?"/,
    );
  });

  it('throws a clear error for unsupported HTTP verbs', () => {
    const meta = getMeta(UsersController);
    // Hand-craft a metadata clone with one bad-verb action
    const badAction: ActionMetadata = {
      target: meta.target,
      method: 'weird',
      verb: 'connect', // not on express.Router
      path: '/x',
      responseHandlers: [],
    };
    const cloned: ControllerMetadata = { ...meta, actions: [badAction] };
    expect(() => buildControllerRouter(cloned, '', noopFactory as any)).toThrowError(
      /Unsupported HTTP verb "connect".*express\.Router has no method "connect"/,
    );
  });

  it('honors inheritance — DerivedController exposes inherited and own routes (ROUTE-05)', () => {
    const meta = getMeta(DerivedController);
    const { router, mountPath } = buildControllerRouter(meta, '', noopFactory as any);
    const paths = router.stack
      .map((l: any) => l.route?.path)
      .filter((p: any) => typeof p === 'string');
    expect(paths).toContain('/ping'); // inherited from BaseController
    expect(paths).toContain('/own'); // own
    // Subclass-wins basePath: /derived
    expect(mountPath).toBe('/derived');
    // Sanity: BaseController stays /base when built directly
    const baseMeta = getMeta(BaseController);
    const built = buildControllerRouter(baseMeta, '', noopFactory as any);
    expect(built.mountPath).toBe('/base');
  });

  it('does not invoke the handler factory until route is hit (factory called once per action)', () => {
    const meta = getMeta(UsersController);
    let calls = 0;
    const factory = () => {
      calls++;
      return ((_req: unknown, _res: unknown) => {}) as RequestHandler;
    };
    buildControllerRouter(meta, '', factory);
    expect(calls).toBe(meta.actions.length);
  });
});
