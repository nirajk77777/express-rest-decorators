import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { composePath, detectV4Pattern } from '../../src/adapter/router-build.js';

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
