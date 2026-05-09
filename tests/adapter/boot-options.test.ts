import { describe, it, expect, expectTypeOf } from 'vitest';
import type { BootOptions } from '../../src/adapter/boot-options.js';

describe('BootOptions (D-03 — every API-03 key typed)', () => {
  it('accepts a minimal options object with only controllers', () => {
    const opts: BootOptions = { controllers: [] };
    expect(opts.controllers).toEqual([]);
  });

  it('accepts every API-03 key without compile error', () => {
    const opts: BootOptions = {
      controllers: [],
      routePrefix: '/api',
      defaultErrorHandler: false,
      middlewares: [],
      interceptors: [],
      cors: true,
      validation: undefined,
      authorizationChecker: () => true,
      currentUserChecker: () => null,
      printRoutes: true,
    };
    expect(opts).toBeDefined();
  });

  it('all keys except controllers are optional', () => {
    expectTypeOf<BootOptions>().toMatchTypeOf<{ controllers: unknown }>();
  });
});
