import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  isStandardSchema,
  renderPath,
  resolveInputs,
} from '../../src/adapter/validation.js';
import { BadRequestError } from '../../src/errors/subclasses.js';
import {
  zodUserBody,
  zodIdParams,
  valibotUserBody,
  arktypeUserBody,
} from './fixtures/schemas.js';

type ReqShape = {
  params: Record<string, string>;
  query: Record<string, unknown>;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
};

const mkReq = (overrides: Partial<ReqShape> = {}): ReqShape => ({
  params: {},
  query: {},
  body: undefined,
  headers: {},
  ...overrides,
});

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

  it('returns true for a callable (function) carrying ~standard.validate (ArkType shape)', () => {
    const fn = (() => {}) as unknown as Record<string, unknown> & (() => void);
    fn['~standard'] = {
      vendor: 'arktype-like',
      version: 1 as const,
      validate: (x: unknown) => ({ value: x }),
    };
    expect(isStandardSchema(fn)).toBe(true);
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

describe('resolveInputs (D-06/D-07/D-10, INPUT-01/02/03)', () => {
  it('returns raw passthrough when no input declaration', async () => {
    const req = mkReq({
      params: { a: '1' },
      query: { q: 'foo' },
      body: { hello: 'world' },
      headers: { 'x-test': 'v' },
    });
    const args = await resolveInputs(req as never, undefined);
    expect(args).toEqual({
      params: { a: '1' },
      query: { q: 'foo' },
      body: { hello: 'world' },
      headers: { 'x-test': 'v' },
    });
  });

  it('returns raw passthrough when input declaration is empty', async () => {
    const req = mkReq({ body: { foo: 1 } });
    const args = await resolveInputs(req as never, {});
    expect(args.body).toEqual({ foo: 1 });
  });

  it('single-slot Zod success returns validated body', async () => {
    const req = mkReq({ body: { email: 'a@b.co', name: 'Niraj' } });
    const args = await resolveInputs(req as never, { body: zodUserBody });
    expect(args.body).toEqual({ email: 'a@b.co', name: 'Niraj' });
  });

  it('single-slot Zod failure throws BadRequestError with details', async () => {
    const req = mkReq({ body: { email: 'not-an-email', name: 'X' } });
    await expect(resolveInputs(req as never, { body: zodUserBody }))
      .rejects.toBeInstanceOf(BadRequestError);

    try {
      await resolveInputs(req as never, { body: zodUserBody });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
      const e = err as BadRequestError;
      expect(e.status).toBe(400);
      expect(e.details).toBeDefined();
      expect(e.details!.length).toBeGreaterThanOrEqual(1);
      const issue = e.details![0]!;
      expect(issue.slot).toBe('body');
      expect(issue.path).toBe('email');
      expect(typeof issue.message).toBe('string');
    }
  });

  it('multi-slot failure aggregates issues from all failing slots (D-07, no short-circuit)', async () => {
    const req = mkReq({
      params: { id: 'abc' },
      body: { name: '' }, // missing email AND empty name
    });
    try {
      await resolveInputs(req as never, {
        params: zodIdParams,
        body: zodUserBody,
      });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
      const e = err as BadRequestError;
      expect(e.details).toBeDefined();
      const slots = new Set(e.details!.map((d) => d.slot));
      expect(slots.has('params')).toBe(true);
      expect(slots.has('body')).toBe(true);
      // At least one issue from each — proves no short-circuit
      expect(e.details!.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('validator parity success: Zod, Valibot, ArkType all accept same valid input (INPUT-02)', async () => {
    const validBody = { email: 'a@b.co', name: 'Niraj' };
    const reqZod = mkReq({ body: validBody });
    const reqVali = mkReq({ body: validBody });
    const reqArk = mkReq({ body: validBody });
    const z1 = await resolveInputs(reqZod as never, { body: zodUserBody });
    const v1 = await resolveInputs(reqVali as never, { body: valibotUserBody });
    const a1 = await resolveInputs(reqArk as never, { body: arktypeUserBody });
    expect(z1.body).toEqual(validBody);
    expect(v1.body).toEqual(validBody);
    expect(a1.body).toEqual(validBody);
  });

  it('validator parity failure: Zod, Valibot, ArkType all reject invalid input', async () => {
    const invalidBody = { email: 'nope', name: '' };
    const cases: Array<[string, unknown]> = [
      ['zod', zodUserBody],
      ['valibot', valibotUserBody],
      ['arktype', arktypeUserBody],
    ];
    for (const [name, schema] of cases) {
      const req = mkReq({ body: invalidBody });
      let caught: unknown;
      try {
        await resolveInputs(req as never, { body: schema });
      } catch (err) {
        caught = err;
      }
      expect(caught, `${name} should throw`).toBeInstanceOf(BadRequestError);
      expect((caught as BadRequestError).details!.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('async schema is awaited (Pitfall D)', async () => {
    const asyncSchema = {
      '~standard': {
        vendor: 'async-test',
        version: 1 as const,
        validate: (_v: unknown) =>
          Promise.resolve({ issues: [{ message: 'async fail', path: ['x'] }] }),
      },
    };
    const req = mkReq({ body: { x: 1 } });
    try {
      await resolveInputs(req as never, { body: asyncSchema });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
      const e = err as BadRequestError;
      expect(e.details).toBeDefined();
      expect(e.details![0]!.message).toBe('async fail');
      expect(e.details![0]!.path).toBe('x');
      expect(e.details![0]!.slot).toBe('body');
    }
  });

  it('does NOT mutate req when schema transforms value (Pitfall F)', async () => {
    const lowercaseEmailSchema = z.object({
      email: z.string().email().transform((s) => s.toLowerCase()),
    });
    const req = mkReq({ body: { email: 'A@B.CO' } });
    const args = await resolveInputs(req as never, { body: lowercaseEmailSchema });
    expect((req.body as { email: string }).email).toBe('A@B.CO');
    expect((args.body as { email: string }).email).toBe('a@b.co');
  });

  it('imposter schema (no validate fn) → raw passthrough', async () => {
    const imposter = { '~standard': { vendor: 'fake', version: 1 } };
    const req = mkReq({ body: { foo: 'bar' } });
    const args = await resolveInputs(req as never, { body: imposter });
    expect(args.body).toEqual({ foo: 'bar' });
  });

  it('renders nested path correctly', async () => {
    const nested = z.object({ user: z.object({ email: z.string().email() }) });
    const req = mkReq({ body: { user: { email: 'nope' } } });
    try {
      await resolveInputs(req as never, { body: nested });
      expect.fail('should have thrown');
    } catch (err) {
      const e = err as BadRequestError;
      expect(e.details!.some((d) => d.path === 'user.email')).toBe(true);
    }
  });

  it('renders array index path correctly (D-09)', async () => {
    const arrSchema = z.object({
      items: z.array(z.object({ name: z.string().min(1) })),
    });
    const req = mkReq({ body: { items: [{ name: '' }] } });
    try {
      await resolveInputs(req as never, { body: arrSchema });
      expect.fail('should have thrown');
    } catch (err) {
      const e = err as BadRequestError;
      expect(e.details!.some((d) => d.path === 'items[0].name')).toBe(true);
    }
  });

  it('only-some-slots-have-schemas: unvalidated slots pass raw', async () => {
    const req = mkReq({
      params: { id: '5' },
      query: { unrelated: 'raw' },
      body: { email: 'a@b.co', name: 'N' },
      headers: { 'x-foo': 'bar' },
    });
    const args = await resolveInputs(req as never, { body: zodUserBody });
    expect(args.params).toEqual({ id: '5' });
    expect(args.query).toEqual({ unrelated: 'raw' });
    expect(args.headers).toEqual({ 'x-foo': 'bar' });
    expect(args.body).toEqual({ email: 'a@b.co', name: 'N' });
  });
});
