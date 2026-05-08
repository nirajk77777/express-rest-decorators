import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { Get, Post, Put, Patch, Delete, Head, All, Method } from '../../src/decorators/routes.js';
import { getOrInitMethodArgs, getAllMethodArgs } from '../../src/metadata/storage.js';

describe('@Get', () => {
  it('Test 4: sets verb=get, path, and captures returnType', () => {
    class UserController {
      @Get('/:id')
      getOne(): string { return 'ok'; }
    }

    const methodMap = getAllMethodArgs(UserController.prototype);
    const meta = methodMap.get('getOne');
    expect(meta).toBeDefined();
    expect(meta!.verb).toBe('get');
    expect(meta!.path).toBe('/:id');
    // returnType captured from reflect-metadata (String constructor)
    expect(meta!.returnType).toBe(String);
  });

  it('Test 5: stores input declaration opaquely', () => {
    const someSchema = { fake: 'schema' };

    class ParamsController {
      @Get('/', { params: someSchema })
      list(): void {}
    }

    const methodMap = getAllMethodArgs(ParamsController.prototype);
    const meta = methodMap.get('list');
    expect(meta).toBeDefined();
    expect(meta!.input).toBeDefined();
    expect(meta!.input!.params).toBe(someSchema);
  });
});

describe('HTTP method decorators', () => {
  it('Test 6a: @Post sets verb=post', () => {
    class C { @Post('/') create(): void {} }
    expect(getAllMethodArgs(C.prototype).get('create')!.verb).toBe('post');
  });

  it('Test 6b: @Put sets verb=put', () => {
    class C { @Put('/') update(): void {} }
    expect(getAllMethodArgs(C.prototype).get('update')!.verb).toBe('put');
  });

  it('Test 6c: @Patch sets verb=patch', () => {
    class C { @Patch('/') patch(): void {} }
    expect(getAllMethodArgs(C.prototype).get('patch')!.verb).toBe('patch');
  });

  it('Test 6d: @Delete sets verb=delete', () => {
    class C { @Delete('/') remove(): void {} }
    expect(getAllMethodArgs(C.prototype).get('remove')!.verb).toBe('delete');
  });

  it('Test 6e: @Head sets verb=head', () => {
    class C { @Head('/') head(): void {} }
    expect(getAllMethodArgs(C.prototype).get('head')!.verb).toBe('head');
  });

  it('Test 6f: @All sets verb=all', () => {
    class C { @All('/') all(): void {} }
    expect(getAllMethodArgs(C.prototype).get('all')!.verb).toBe('all');
  });
});

describe('@Method', () => {
  it('Test 7: lowercases verb and stores path', () => {
    class C {
      @Method('CUSTOM', '/x')
      custom(): void {}
    }

    const meta = getAllMethodArgs(C.prototype).get('custom');
    expect(meta!.verb).toBe('custom');
    expect(meta!.path).toBe('/x');
  });
});

describe('Symbol-keyed methods', () => {
  it('Test 14: symbol-keyed method is stored under symbol key', () => {
    const sym = Symbol('m');

    class C {
      @Get('/x')
      [sym](): void {}
    }

    const methodMap = getAllMethodArgs(C.prototype);
    const meta = methodMap.get(sym);
    expect(meta).toBeDefined();
    expect(meta!.verb).toBe('get');
    expect(meta!.path).toBe('/x');
  });
});
