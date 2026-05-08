import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { Controller, JsonController } from '../../src/decorators/controller.js';
import { getControllerArgs } from '../../src/metadata/storage.js';

describe('@Controller', () => {
  it('Test 1: sets basePath and type=default', () => {
    @Controller('/users')
    class UsersController {}

    const meta = getControllerArgs(UsersController);
    expect(meta).toBeDefined();
    expect(meta!.basePath).toBe('/users');
    expect(meta!.type).toBe('default');
  });

  it('Test 3: no arg sets basePath="" and type=default', () => {
    @Controller()
    class EmptyController {}

    const meta = getControllerArgs(EmptyController);
    expect(meta).toBeDefined();
    expect(meta!.basePath).toBe('');
    expect(meta!.type).toBe('default');
  });
});

describe('@JsonController', () => {
  it('Test 2: sets basePath and type=json', () => {
    @JsonController('/api')
    class ApiController {}

    const meta = getControllerArgs(ApiController);
    expect(meta).toBeDefined();
    expect(meta!.basePath).toBe('/api');
    expect(meta!.type).toBe('json');
  });
});
