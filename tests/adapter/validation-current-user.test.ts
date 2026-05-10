import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { resolveInputs } from '../../src/adapter/validation.js';
import { BadRequestError } from '../../src/errors/subclasses.js';

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

// ---------------------------------------------------------------------------
// currentUser slot in resolveInputs
// ---------------------------------------------------------------------------
describe('resolveInputs — currentUser slot', () => {
  it('currentUser is undefined when no input declaration', async () => {
    const result = await resolveInputs(mkReq() as any, undefined, undefined);
    expect(result.currentUser).toBeUndefined();
  });

  it('currentUser is undefined when input has no currentUser field', async () => {
    const result = await resolveInputs(mkReq() as any, { body: undefined }, undefined);
    expect(result.currentUser).toBeUndefined();
  });

  it('resolves currentUser from resolver when input.currentUser === true', async () => {
    const user = { id: 1, name: 'Alice' };
    const resolver = async () => user;
    const result = await resolveInputs(mkReq() as any, { currentUser: true }, resolver);
    expect(result.currentUser).toBe(user);
  });

  it('currentUser is undefined when declared but no resolver provided', async () => {
    const result = await resolveInputs(mkReq() as any, { currentUser: true }, undefined);
    expect(result.currentUser).toBeUndefined();
  });

  it('validates currentUser through a Standard Schema', async () => {
    const schema = z.object({ id: z.number() });
    const user = { id: 42 };
    const resolver = async () => user;
    const result = await resolveInputs(mkReq() as any, { currentUser: schema }, resolver);
    expect(result.currentUser).toEqual({ id: 42 });
  });

  it('throws BadRequestError when Standard Schema validation fails for currentUser', async () => {
    const schema = z.object({ id: z.number() });
    const resolver = async () => ({ id: 'not-a-number' });
    await expect(
      resolveInputs(mkReq() as any, { currentUser: schema }, resolver),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('BadRequestError includes issue with slot = currentUser', async () => {
    const schema = z.object({ id: z.number() });
    const resolver = async () => ({ id: 'bad' });
    try {
      await resolveInputs(mkReq() as any, { currentUser: schema }, resolver);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
      const badReq = err as BadRequestError;
      expect(badReq.details).toBeDefined();
      expect(badReq.details!.length).toBeGreaterThan(0);
      expect(badReq.details![0]!.slot).toBe('currentUser');
    }
  });

  it('does not break existing four-slot resolution when currentUser is present', async () => {
    const schema = z.object({ id: z.number() });
    const user = { id: 7 };
    const result = await resolveInputs(
      mkReq({ body: { name: 'test' } }) as any,
      { currentUser: schema },
      async () => user,
    );
    expect(result.currentUser).toEqual({ id: 7 });
    expect(result.body).toEqual({ name: 'test' });
    // params slot is passed through as raw value (empty object from mkReq)
    expect(result.params).toEqual({});
  });
});
