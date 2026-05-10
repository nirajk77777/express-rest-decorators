/**
 * builder-phase3.test.ts
 *
 * Tests for the Phase 3 MetadataBuilder extensions:
 *   - useBefore, useAfter, interceptors, authorized fields on ControllerMetadata / ActionMetadata
 *   - Inheritance merge semantics (concat base-first, last-write-wins for authorized)
 *   - Mid-chain @UseBefore-only on an inherited method preserves base verb/path
 */
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { buildMetadata } from '../../src/metadata/builder.js';
import { Controller } from '../../src/decorators/controller.js';
import { Get } from '../../src/decorators/routes.js';
import {
  UseBefore,
  UseAfter,
  UseInterceptor,
  Authorized,
} from '../../src/decorators/middleware.js';

// ─── Dummy handler functions (stand-ins for real middleware) ────────────────
function fn1() {}
function fn2() {}
function fn3() {}
class IC1 {}
class IC2 {}
class IC3 {}

// ─── BP01: Plain controller with no Phase 3 decorators ─────────────────────
describe('BP01: plain controller with no Phase 3 decorators', () => {
  @Controller('/plain')
  class PlainCtl {
    @Get('/')
    list(): void {}
  }

  it('controller meta defaults to empty arrays and no authorized', () => {
    const [meta] = buildMetadata([PlainCtl]);
    expect(meta!.useBefore).toEqual([]);
    expect(meta!.useAfter).toEqual([]);
    expect(meta!.interceptors).toEqual([]);
    expect(meta!.authorized).toBeUndefined();
  });

  it('action meta defaults to empty arrays and no authorized', () => {
    const [meta] = buildMetadata([PlainCtl]);
    const action = meta!.actions[0]!;
    expect(action.useBefore).toEqual([]);
    expect(action.useAfter).toEqual([]);
    expect(action.interceptors).toEqual([]);
    expect(action.authorized).toBeUndefined();
  });
});

// ─── BP02: Class-level @UseBefore ──────────────────────────────────────────
describe('BP02: class-level @UseBefore', () => {
  @Controller('/ub')
  @UseBefore(fn1, fn2)
  class UbCtl {
    @Get('/')
    list(): void {}
  }

  it('controllerMeta.useBefore contains fn1, fn2 in order', () => {
    const [meta] = buildMetadata([UbCtl]);
    expect(meta!.useBefore).toEqual([fn1, fn2]);
  });

  it('action.useBefore is empty (class-level does not copy to actions)', () => {
    const [meta] = buildMetadata([UbCtl]);
    expect(meta!.actions[0]!.useBefore).toEqual([]);
  });
});

// ─── BP03: Method-level @UseBefore ─────────────────────────────────────────
describe('BP03: method-level @UseBefore AND class-level @UseBefore are separate', () => {
  @Controller('/sep')
  @UseBefore(fn2)
  class SepCtl {
    @Get('/')
    @UseBefore(fn1)
    list(): void {}
  }

  it('action.useBefore has only fn1 (method level)', () => {
    const [meta] = buildMetadata([SepCtl]);
    expect(meta!.actions[0]!.useBefore).toEqual([fn1]);
  });

  it('controllerMeta.useBefore has only fn2 (class level)', () => {
    const [meta] = buildMetadata([SepCtl]);
    expect(meta!.useBefore).toEqual([fn2]);
  });
});

// ─── BP04: Class-level hooks with UseAfter and UseInterceptor ──────────────
describe('BP04: class-level @UseAfter and @UseInterceptor', () => {
  @Controller('/multi')
  @UseAfter(fn1)
  @UseInterceptor(IC1)
  class MultiHookCtl {
    @Get('/')
    h(): void {}
  }

  it('controllerMeta.useAfter contains fn1', () => {
    const [meta] = buildMetadata([MultiHookCtl]);
    expect(meta!.useAfter).toEqual([fn1]);
  });

  it('controllerMeta.interceptors contains IC1', () => {
    const [meta] = buildMetadata([MultiHookCtl]);
    expect(meta!.interceptors).toEqual([IC1]);
  });
});

// ─── BP05: Inheritance — class-level useBefore concat base-first ───────────
describe('BP05: subclass @UseBefore extends base @UseBefore (concat base-first)', () => {
  @UseBefore(fn1, fn2)
  class BaseB5 {
    @Get('/base')
    baseRoute(): void {}
  }

  @Controller('/sub5')
  @UseBefore(fn3)
  class SubB5 extends BaseB5 {}

  it('resolved controllerMeta.useBefore === [fn1, fn2, fn3]', () => {
    const [meta] = buildMetadata([SubB5]);
    expect(meta!.useBefore).toEqual([fn1, fn2, fn3]);
  });
});

// ─── BP06: Inheritance — class-level useAfter concat base-first ────────────
describe('BP06: subclass @UseAfter extends base @UseAfter (concat base-first)', () => {
  @UseAfter(fn1)
  class BaseB6 {
    @Get('/base')
    baseRoute(): void {}
  }

  @Controller('/sub6')
  @UseAfter(fn2)
  class SubB6 extends BaseB6 {}

  it('resolved controllerMeta.useAfter === [fn1, fn2]', () => {
    const [meta] = buildMetadata([SubB6]);
    expect(meta!.useAfter).toEqual([fn1, fn2]);
  });
});

// ─── BP07: Inheritance — class-level interceptors concat base-first ─────────
describe('BP07: subclass @UseInterceptor extends base @UseInterceptor', () => {
  @UseInterceptor(IC1, IC2)
  class BaseB7 {
    @Get('/base')
    baseRoute(): void {}
  }

  @Controller('/sub7')
  @UseInterceptor(IC3)
  class SubB7 extends BaseB7 {}

  it('resolved controllerMeta.interceptors === [IC1, IC2, IC3]', () => {
    const [meta] = buildMetadata([SubB7]);
    expect(meta!.interceptors).toEqual([IC1, IC2, IC3]);
  });
});

// ─── BP08: Inheritance — @Authorized last-write-wins (subclass overrides) ──
describe('BP08: @Authorized last-write-wins — subclass overrides base', () => {
  @Authorized('user')
  class BaseB8 {
    @Get('/base')
    baseRoute(): void {}
  }

  @Controller('/sub8')
  @Authorized('admin')
  class SubB8 extends BaseB8 {}

  it('resolved authorized === [\'admin\']', () => {
    const [meta] = buildMetadata([SubB8]);
    expect(meta!.authorized).toEqual(['admin']);
  });
});

// ─── BP09: Inheritance — @Authorized() (null) overrides base string[] ──────
describe('BP09: @Authorized() (null) in subclass overrides base @Authorized(\'user\')', () => {
  @Authorized('user')
  class BaseB9 {
    @Get('/base')
    baseRoute(): void {}
  }

  @Controller('/sub9')
  @Authorized()
  class SubB9 extends BaseB9 {}

  it('resolved authorized === null', () => {
    const [meta] = buildMetadata([SubB9]);
    expect(meta!.authorized).toBeNull();
  });
});

// ─── BP10: Method-level — subclass adds @UseBefore to inherited method ──────
describe('BP10: subclass adds @UseBefore-only to inherited method (no route re-decoration)', () => {
  class BaseB10 {
    @Get('/inherited')
    sharedRoute(): void {}
  }

  @Controller('/sub10')
  class SubB10 extends BaseB10 {
    @UseBefore(fn3)
    sharedRoute(): void {}
  }

  it('action exists with base verb/path and appended useBefore', () => {
    const [meta] = buildMetadata([SubB10]);
    const action = meta!.actions.find(a => a.method === 'sharedRoute');
    expect(action).toBeDefined();
    expect(action!.verb).toBe('get');
    expect(action!.path).toBe('/inherited');
    expect(action!.useBefore).toEqual([fn3]);
  });
});

// ─── BP11: Method-level @Authorized last-write-wins in inheritance ──────────
describe('BP11: method @Authorized last-write-wins in inheritance', () => {
  class BaseB11 {
    @Authorized('user')
    @Get('/r')
    route(): void {}
  }

  @Controller('/sub11')
  class SubB11 extends BaseB11 {
    @Authorized('admin')
    route(): void {}
  }

  it('action.authorized === [\'admin\']', () => {
    const [meta] = buildMetadata([SubB11]);
    const action = meta!.actions.find(a => a.method === 'route');
    expect(action!.authorized).toEqual(['admin']);
  });
});

// ─── BP12: @Authorized on method (single level, no inheritance) ────────────
describe('BP12: @Authorized on method (single level)', () => {
  @Controller('/auth12')
  class AuthCtl {
    @Authorized(['admin', 'superuser'])
    @Get('/secured')
    secured(): void {}

    @Get('/public')
    pub(): void {}
  }

  it('secured action.authorized === [\'admin\', \'superuser\']', () => {
    const [meta] = buildMetadata([AuthCtl]);
    const secured = meta!.actions.find(a => a.method === 'secured');
    expect(secured!.authorized).toEqual(['admin', 'superuser']);
  });

  it('public action.authorized is undefined', () => {
    const [meta] = buildMetadata([AuthCtl]);
    const pub = meta!.actions.find(a => a.method === 'pub');
    expect(pub!.authorized).toBeUndefined();
  });
});
