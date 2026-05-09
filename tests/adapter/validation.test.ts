import { describe, it, expect } from 'vitest';
import { isStandardSchema, renderPath } from '../../src/adapter/validation.js';

describe('isStandardSchema', () => {
  it('returns false for null/undefined/primitives', () => {
    expect(isStandardSchema(null)).toBe(false);
    expect(isStandardSchema(undefined)).toBe(false);
    expect(isStandardSchema(0)).toBe(false);
    expect(isStandardSchema('')).toBe(false);
    expect(isStandardSchema(false)).toBe(false);
    expect(isStandardSchema(42)).toBe(false);
  });

  it('returns false for plain objects without ~standard', () => {
    expect(isStandardSchema({})).toBe(false);
    expect(isStandardSchema({ foo: 'bar' })).toBe(false);
  });

  it('returns false for objects with ~standard but no validate (imposter)', () => {
    expect(isStandardSchema({ '~standard': { vendor: 'fake', version: 1 } })).toBe(false);
  });

  it('returns false when validate is non-function', () => {
    expect(
      isStandardSchema({ '~standard': { vendor: 'fake', version: 1, validate: 'oops' } })
    ).toBe(false);
    expect(
      isStandardSchema({ '~standard': { vendor: 'fake', version: 1, validate: 42 } })
    ).toBe(false);
  });

  it('returns false when ~standard is non-object', () => {
    expect(isStandardSchema({ '~standard': 'oops' })).toBe(false);
    expect(isStandardSchema({ '~standard': null })).toBe(false);
  });

  it('returns true for an object with ~standard.validate function', () => {
    const schema = {
      '~standard': {
        vendor: 'test',
        version: 1 as const,
        validate: (x: unknown) => ({ value: x }),
      },
    };
    expect(isStandardSchema(schema)).toBe(true);
  });
});

describe('renderPath (D-09)', () => {
  it('returns empty string for undefined or empty array', () => {
    expect(renderPath(undefined)).toBe('');
    expect(renderPath([])).toBe('');
  });

  it('joins string segments with dots', () => {
    expect(renderPath(['user', 'email'])).toBe('user.email');
  });

  it('wraps numeric indices in brackets', () => {
    expect(renderPath(['items', 0, 'name'])).toBe('items[0].name');
  });

  it('handles PathSegment shape ({key}) — Pitfall E', () => {
    expect(renderPath([{ key: 'user' }, { key: 0 }, { key: 'name' }])).toBe('user[0].name');
  });

  it('handles mixed PropertyKey + PathSegment', () => {
    expect(renderPath(['user', { key: 0 }, 'name'])).toBe('user[0].name');
  });

  it('does not prepend leading dot for first string segment', () => {
    expect(renderPath(['name'])).toBe('name');
  });

  it('renders symbols via String() without crashing', () => {
    const sym = Symbol('s');
    expect(renderPath([sym])).toBe(String(sym));
  });

  it('renders numeric-only path correctly', () => {
    expect(renderPath([0])).toBe('[0]');
    expect(renderPath([0, 1])).toBe('[0][1]');
  });
});
