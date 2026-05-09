import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { composePath } from '../../src/adapter/router-build.js';

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
