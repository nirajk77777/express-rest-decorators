import { describe, it, expect } from 'vitest';
import { HttpError } from '../../src/errors/http-error.js';

describe('HttpError base class', () => {
  it('H1: constructs with status and message', () => {
    const err = new HttpError(418, "I'm a teapot");
    expect(err.status).toBe(418);
    expect(err.message).toBe("I'm a teapot");
    expect(err.name).toBe('HttpError');
  });

  it('H2: no message defaults to empty string', () => {
    const err = new HttpError(500);
    expect(err.message).toBe('');
  });

  it('H3: cause is preserved (ES2022)', () => {
    const inner = new Error('inner');
    const err = new HttpError(500, 'oops', { cause: inner });
    expect(err.cause).toBe(inner);
  });

  it('H4: toJSON returns { name, message, status } without stack or cause', () => {
    const err = new HttpError(500, 'oops', { cause: new Error('inner') });
    const json = err.toJSON();
    expect(json).toEqual({ name: 'HttpError', message: 'oops', status: 500 });
    expect(json).not.toHaveProperty('stack');
    expect(json).not.toHaveProperty('cause');
  });

  it('H5: JSON.stringify uses toJSON shape', () => {
    const err = new HttpError(500, 'oops');
    const parsed = JSON.parse(JSON.stringify(err));
    expect(parsed).toEqual({ name: 'HttpError', message: 'oops', status: 500 });
  });

  it('H6: instanceof HttpError and Error', () => {
    const err = new HttpError(500, 'oops');
    expect(err instanceof HttpError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });
});
