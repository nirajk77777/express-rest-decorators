import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { HttpCode, OnNull, OnUndefined, Header, ContentType } from '../../src/decorators/response.js';
import { getAllMethodArgs } from '../../src/metadata/storage.js';

describe('@HttpCode', () => {
  it('Test 8: pushes success-code to responseHandlers', () => {
    class C {
      @HttpCode(201)
      create(): void {}
    }

    const meta = getAllMethodArgs(C.prototype).get('create');
    expect(meta).toBeDefined();
    expect(meta!.responseHandlers).toHaveLength(1);
    expect(meta!.responseHandlers[0]).toEqual({ type: 'success-code', value: 201 });
  });
});

describe('@OnNull', () => {
  it('Test 9: pushes null-result-code to responseHandlers', () => {
    class C {
      @OnNull(204)
      get(): void {}
    }

    const meta = getAllMethodArgs(C.prototype).get('get');
    expect(meta!.responseHandlers[0]).toEqual({ type: 'null-result-code', value: 204 });
  });
});

describe('@OnUndefined', () => {
  it('Test 10: pushes undefined-result-code to responseHandlers', () => {
    class C {
      @OnUndefined(204)
      get(): void {}
    }

    const meta = getAllMethodArgs(C.prototype).get('get');
    expect(meta!.responseHandlers[0]).toEqual({ type: 'undefined-result-code', value: 204 });
  });
});

describe('@Header', () => {
  it('Test 11: pushes header with name and value', () => {
    class C {
      @Header('X-Foo', 'bar')
      get(): void {}
    }

    const meta = getAllMethodArgs(C.prototype).get('get');
    expect(meta!.responseHandlers[0]).toEqual({ type: 'header', value: 'X-Foo', secondaryValue: 'bar' });
  });
});

describe('@ContentType', () => {
  it('Test 12: pushes content-type to responseHandlers', () => {
    class C {
      @ContentType('application/json')
      get(): void {}
    }

    const meta = getAllMethodArgs(C.prototype).get('get');
    expect(meta!.responseHandlers[0]).toEqual({ type: 'content-type', value: 'application/json' });
  });
});

describe('Decorator accumulation (Pitfall 3)', () => {
  it('Test 13: stacking @HttpCode and @OnNull produces two entries', () => {
    class C {
      @HttpCode(200)
      @OnNull(404)
      get(): void {}
    }

    const meta = getAllMethodArgs(C.prototype).get('get');
    expect(meta!.responseHandlers).toHaveLength(2);
    const types = meta!.responseHandlers.map(h => h.type);
    expect(types).toContain('success-code');
    expect(types).toContain('null-result-code');
  });
});
