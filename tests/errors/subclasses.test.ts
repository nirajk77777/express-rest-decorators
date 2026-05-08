import { describe, it, expect } from 'vitest';
import {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  MethodNotAllowedError,
  ConflictError,
  InternalServerError,
} from '../../src/errors/subclasses.js';
import { HttpError } from '../../src/errors/http-error.js';

describe('BadRequestError', () => {
  it('S1: defaults message to "Bad Request", status 400, name "BadRequestError"', () => {
    const err = new BadRequestError();
    expect(err.message).toBe('Bad Request');
    expect(err.status).toBe(400);
    expect(err.name).toBe('BadRequestError');
  });

  it('S2: exposes details and source from options', () => {
    const err = new BadRequestError('bad', {
      details: [{ path: ['body', 'email'], message: 'invalid' }],
      source: 'UserController.register',
    });
    expect(err.details).toEqual([{ path: ['body', 'email'], message: 'invalid' }]);
    expect(err.source).toBe('UserController.register');
  });

  it('S3: toJSON includes details and source when set', () => {
    const err = new BadRequestError('bad', {
      details: [{ path: ['body', 'email'], message: 'invalid' }],
      source: 'UserController.register',
    });
    const json = err.toJSON();
    expect(json).toEqual({
      name: 'BadRequestError',
      message: 'bad',
      status: 400,
      details: [{ path: ['body', 'email'], message: 'invalid' }],
      source: 'UserController.register',
    });
  });

  it('S4: toJSON omits details/source keys when not set', () => {
    const err = new BadRequestError('bad');
    const json = err.toJSON();
    expect(json).toEqual({ name: 'BadRequestError', message: 'bad', status: 400 });
    expect(json).not.toHaveProperty('details');
    expect(json).not.toHaveProperty('source');
  });

  it('S5: instanceof BadRequestError, HttpError, and Error all true', () => {
    const err = new BadRequestError();
    expect(err instanceof BadRequestError).toBe(true);
    expect(err instanceof HttpError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });
});

describe('Other HttpError subclasses', () => {
  it('S6: UnauthorizedError → status 401, name "UnauthorizedError", default "Unauthorized"', () => {
    const err = new UnauthorizedError();
    expect(err.status).toBe(401);
    expect(err.name).toBe('UnauthorizedError');
    expect(err.message).toBe('Unauthorized');
  });

  it('S7: ForbiddenError → status 403, default "Forbidden"', () => {
    const err = new ForbiddenError();
    expect(err.status).toBe(403);
    expect(err.message).toBe('Forbidden');
  });

  it('S8: NotFoundError → status 404, default "Not Found"', () => {
    const err = new NotFoundError();
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not Found');
  });

  it('S9: MethodNotAllowedError → status 405, default "Method Not Allowed"', () => {
    const err = new MethodNotAllowedError();
    expect(err.status).toBe(405);
    expect(err.message).toBe('Method Not Allowed');
  });

  it('S10: ConflictError → status 409, default "Conflict"', () => {
    const err = new ConflictError();
    expect(err.status).toBe(409);
    expect(err.message).toBe('Conflict');
  });

  it('S11: InternalServerError → status 500, default "Internal Server Error"', () => {
    const err = new InternalServerError();
    expect(err.status).toBe(500);
    expect(err.message).toBe('Internal Server Error');
  });

  it('S12: All subclasses pass cause through', () => {
    expect(new NotFoundError('x', { cause: 'inner' }).cause).toBe('inner');
    expect(new UnauthorizedError('x', { cause: 'inner' }).cause).toBe('inner');
    expect(new ForbiddenError('x', { cause: 'inner' }).cause).toBe('inner');
    expect(new MethodNotAllowedError('x', { cause: 'inner' }).cause).toBe('inner');
    expect(new ConflictError('x', { cause: 'inner' }).cause).toBe('inner');
    expect(new InternalServerError('x', { cause: 'inner' }).cause).toBe('inner');
  });

  it('S13: All subclass name properties equal their class name', () => {
    expect(new UnauthorizedError().name).toBe('UnauthorizedError');
    expect(new ForbiddenError().name).toBe('ForbiddenError');
    expect(new NotFoundError().name).toBe('NotFoundError');
    expect(new MethodNotAllowedError().name).toBe('MethodNotAllowedError');
    expect(new ConflictError().name).toBe('ConflictError');
    expect(new InternalServerError().name).toBe('InternalServerError');
  });
});
