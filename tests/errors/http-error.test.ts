import { describe, it, expect } from 'vitest';
import { HttpError, type ValidationIssue } from '../../src/errors/http-error.js';
import { BadRequestError } from '../../src/errors/subclasses.js';

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

describe('ValidationIssue widened shape (Phase 2 prep, D-08)', () => {
  it('accepts new slot + string path shape', () => {
    const issue: ValidationIssue = { slot: 'body', path: 'user.email', message: 'Invalid' };
    expect(issue.slot).toBe('body');
    expect(issue.path).toBe('user.email');
    expect(issue.message).toBe('Invalid');
  });

  it('accepts legacy array path shape with no slot (backward compat)', () => {
    const issue2: ValidationIssue = { path: ['user', 'email'], message: 'Invalid' };
    expect(Array.isArray(issue2.path)).toBe(true);
    expect(issue2.slot).toBeUndefined();
  });

  it('BadRequestError preserves widened ValidationIssue[] in toJSON details', () => {
    const issue: ValidationIssue = { slot: 'body', path: 'user.email', message: 'Invalid' };
    const issue2: ValidationIssue = { path: ['user', 'email'], message: 'Invalid' };
    const details: ReadonlyArray<ValidationIssue> = [issue, issue2];
    const err = new BadRequestError('Validation failed', { details, source: 'X.y' });
    const json = err.toJSON();
    expect(json.details).toEqual(details);
    expect(json.source).toBe('X.y');
  });
});
