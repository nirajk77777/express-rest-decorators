import { describe, it, expect } from 'vitest';
import {
  getOrInitControllerArgs,
  getControllerArgs,
  getOrInitMethodArgs,
  getAllMethodArgs,
} from '../../src/metadata/storage.js';

// Disposable test classes for WeakMap isolation
class A {}
class B {}
class C {}

describe('getOrInitControllerArgs', () => {
  it('Test 1: returns fresh default entry on first call and same reference on second call', () => {
    const first = getOrInitControllerArgs(A);
    expect(first).toEqual({ basePath: '', type: 'default', responseHandlers: [] });
    const second = getOrInitControllerArgs(A);
    expect(second).toBe(first); // same reference
  });
});

describe('getControllerArgs', () => {
  it('Test 2: returns undefined if getOrInitControllerArgs was never called for that class', () => {
    // B has not been initialized
    const result = getControllerArgs(B);
    expect(result).toBeUndefined();
  });

  it('returns the entry after getOrInitControllerArgs was called', () => {
    getOrInitControllerArgs(C);
    const result = getControllerArgs(C);
    expect(result).toBeDefined();
    expect(result?.basePath).toBe('');
  });
});

describe('getOrInitMethodArgs', () => {
  it('Test 3: returns fresh default entry on first call and same reference on second call with same key', () => {
    const proto = {};
    const first = getOrInitMethodArgs(proto, 'foo');
    expect(first).toEqual({ verb: '', path: '', responseHandlers: [] });
    const second = getOrInitMethodArgs(proto, 'foo');
    expect(second).toBe(first); // same reference
  });

  it('Test 4: symbol key returns a distinct entry from string-key entries', () => {
    const proto = {};
    const sym = Symbol('m');
    const stringEntry = getOrInitMethodArgs(proto, 'foo');
    const symEntry = getOrInitMethodArgs(proto, sym);
    expect(symEntry).not.toBe(stringEntry);
    expect(symEntry).toEqual({ verb: '', path: '', responseHandlers: [] });
  });
});

describe('getAllMethodArgs', () => {
  it('Test 5: returns inner Map containing all entries including symbol keys', () => {
    const proto = {};
    const sym = Symbol('m2');
    getOrInitMethodArgs(proto, 'bar');
    getOrInitMethodArgs(proto, sym);

    const map = getAllMethodArgs(proto);
    expect(map).toBeInstanceOf(Map);
    expect(map.size).toBe(2);

    const keys = [...map.keys()];
    expect(keys).toContain('bar');
    expect(keys).toContain(sym);

    // entries() enumerates symbol keys
    const entries = [...map.entries()];
    const symEntry = entries.find(([k]) => k === sym);
    expect(symEntry).toBeDefined();
  });

  it('Test 6: getAllMethodArgs for unknown proto returns empty Map (not undefined)', () => {
    const unknownProto = {};
    const result = getAllMethodArgs(unknownProto);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });
});

describe('WeakMap isolation', () => {
  it('Test 7: storing on one class prototype does NOT leak to a different class prototype', () => {
    class D {}
    class E {}

    getOrInitMethodArgs(D.prototype, 'method');
    const dMap = getAllMethodArgs(D.prototype);
    const eMap = getAllMethodArgs(E.prototype);

    expect(dMap.size).toBe(1);
    expect(eMap.size).toBe(0);
  });
});
