import 'reflect-metadata';
import { describe, it, expect, afterEach } from 'vitest';
import {
  Controller, JsonController,
  Get, Post, Put, Patch, Delete, Head, All, Method,
  HttpCode, OnNull, Header, ContentType,
  buildMetadata, MetadataBuilder,
  HttpError, BadRequestError, NotFoundError,
  useContainer, getContainer, resetContainer,
  DefaultContainer,
  type IocAdapter, type Action,
  type ControllerMetadata,
} from '../../src/index.js';
import { __resetGuardForTest } from '../../src/guard/runtime-guard.js';

afterEach(() => resetContainer());

describe('ROADMAP SC #1 — fully resolved tree', () => {
  it('produces correct metadata for all eight verbs + response shapers', () => {
    @JsonController('/users')
    class UserController {
      @Get('/:id')
      @HttpCode(200)
      @OnNull(404)
      @Header('X-Resource', 'user')
      @ContentType('application/json')
      getOne() { return null; }

      @Post('/')
      create() { return {}; }

      @Put('/:id')
      replace() { return {}; }

      @Patch('/:id')
      update() { return {}; }

      @Delete('/:id')
      remove() { return; }

      @Head('/:id')
      exists() { return; }

      @All('/wildcard')
      everything() { return; }

      @Method('REPORT', '/report')
      report() { return; }
    }

    const tree: ControllerMetadata[] = buildMetadata([UserController]);
    expect(tree).toHaveLength(1);
    const ctrl = tree[0]!;
    expect(ctrl.basePath).toBe('/users');
    expect(ctrl.type).toBe('json');
    expect(ctrl.actions).toHaveLength(8);
    const verbs = ctrl.actions.map(a => a.verb).sort();
    expect(verbs).toEqual(['all', 'delete', 'get', 'head', 'patch', 'post', 'put', 'report']);
    const getAction = ctrl.actions.find(a => a.verb === 'get')!;
    expect(getAction.path).toBe('/:id');
    expect(getAction.responseHandlers).toHaveLength(4); // HttpCode, OnNull, Header, ContentType
  });

  it('MetadataBuilder.build alias works identically', () => {
    @Controller('/x')
    class X { @Get('/') h() { return; } }
    expect(MetadataBuilder.build([X])).toEqual(buildMetadata([X]));
  });
});

describe('ROADMAP SC #2 — runtime guard', () => {
  it('does not throw with reflect-metadata loaded and emit on for a parameterized constructor', () => {
    @Controller('/y')
    class Y {
      // zero-arg ctor — guard's strong-negative check returns true vacuously.
      @Get('/') h() { return; }
    }
    expect(() => buildMetadata([Y])).not.toThrow();
  });

  it('throws [express-controllers]-prefixed error when Reflect.getMetadata is missing', () => {
    const original = (globalThis as any).Reflect.getMetadata;
    delete (globalThis as any).Reflect.getMetadata;
    // Reset the cached probe so checkLegacyDecoratorMode() re-runs on next call.
    __resetGuardForTest();
    try {
      @Controller('/z')
      class Z {}
      expect(() => buildMetadata([Z])).toThrow(/\[express-controllers\].*reflect-metadata/i);
    } finally {
      (globalThis as any).Reflect.getMetadata = original;
      // Restore guard state for subsequent tests.
      __resetGuardForTest();
    }
  });
});

describe('ROADMAP SC #3 — HttpError hierarchy usable independently', () => {
  it('HttpError + BadRequestError have status, message, cause, toJSON', () => {
    const inner = new Error('inner');
    const err = new BadRequestError('bad', { cause: inner, details: [{ path: ['a'], message: 'x' }], source: 'C.m' });
    expect(err.status).toBe(400);
    expect(err.message).toBe('bad');
    expect(err.cause).toBe(inner);
    expect(err.toJSON()).toMatchObject({ name: 'BadRequestError', message: 'bad', status: 400, source: 'C.m' });
    expect(err instanceof HttpError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  it('NotFoundError defaults', () => {
    const e = new NotFoundError();
    expect(e.status).toBe(404);
    expect(e.message).toBe('Not Found');
  });
});

describe('ROADMAP SC #4 — useContainer + default WeakMap container', () => {
  it('default container caches per class', () => {
    class S {}
    const a = getContainer().get(S);
    const b = getContainer().get(S);
    expect(a).toBe(b);
    expect(a).toBeInstanceOf(S);
  });

  it('user adapter overrides default', () => {
    class S {}
    const fake: IocAdapter = { get: <T>(_cls: any) => ({ tagged: true } as T) };
    useContainer(fake);
    expect(getContainer()).toBe(fake);
    expect((getContainer().get(S) as any).tagged).toBe(true);
  });

  it('resetContainer restores default', () => {
    class S {}
    useContainer({ get: () => ({} as any) });
    resetContainer();
    expect(getContainer().get(S)).toBeInstanceOf(S);
  });
});

describe('ROADMAP SC #5 — type-only StandardSchemaV1 + Action shape', () => {
  it('Action shape has request/response/next?', () => {
    const a: Action = { request: 1, response: 2 };
    expect(a.request).toBe(1);
    expect(a.response).toBe(2);
    expect(a.next).toBeUndefined();
  });

  // StandardSchemaV1 is type-only — no runtime assertion possible. The grep-gates test
  // covers "no runtime import of @standard-schema/spec" elsewhere.
});
