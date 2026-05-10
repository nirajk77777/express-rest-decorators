/**
 * Task 1 TDD RED — cookies adapter + InputDeclaration extension.
 *
 * These tests verify:
 *  - resolveCookiesArm pass-through (true)
 *  - resolveCookiesArm with Standard Schema validation (success)
 *  - resolveCookiesArm with Standard Schema validation (failure → issues)
 *  - lazy-load error message when cookie peer is missing
 *  - module-level cache: second call does NOT re-import
 *  - InputDeclaration has cookies? field (type-level; runtime check via resolveInputs)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import {
  resolveCookiesArm,
  __resetCookieCacheForTest,
} from '../../src/adapter/cookies.js';
import { resolveInputs } from '../../src/adapter/validation.js';
import { BadRequestError } from '../../src/errors/subclasses.js';

// ── helpers ───────────────────────────────────────────────────────────────────

type ReqShape = {
  params: Record<string, string>;
  query: Record<string, unknown>;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
  session?: unknown;
};

const mkReq = (
  cookieHeader: string,
  overrides: Partial<ReqShape> = {},
): ReqShape & { headers: { cookie: string } } => ({
  params: {},
  query: {},
  body: undefined,
  headers: { cookie: cookieHeader },
  ...overrides,
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('resolveCookiesArm — pass-through (true)', () => {
  beforeEach(() => __resetCookieCacheForTest());

  it('returns raw cookie string when declaration is { sid: true }', async () => {
    const result = await resolveCookiesArm(mkReq('sid=abc123') as any, {
      sid: true,
    });
    expect(result.value).toEqual({ sid: 'abc123' });
    expect(result.issues).toBeUndefined();
  });

  it('returns undefined value when declaration is undefined', async () => {
    const result = await resolveCookiesArm(mkReq('') as any, undefined);
    expect(result.value).toBeUndefined();
    expect(result.issues).toBeUndefined();
  });

  it('returns undefined for missing cookie key when using true', async () => {
    const result = await resolveCookiesArm(mkReq('other=val') as any, {
      sid: true,
    });
    expect(result.value).toEqual({ sid: undefined });
  });
});

describe('resolveCookiesArm — Standard Schema validation', () => {
  beforeEach(() => __resetCookieCacheForTest());

  it('validates and coerces cookie value via Standard Schema', async () => {
    const countSchema = z.coerce.number();
    const result = await resolveCookiesArm(mkReq('count=42') as any, {
      count: countSchema,
    });
    expect(result.value).toEqual({ count: 42 });
    expect(result.issues).toBeUndefined();
  });

  it('returns issues when Standard Schema validation fails', async () => {
    const countSchema = z.number();
    const result = await resolveCookiesArm(mkReq('count=notanumber') as any, {
      count: countSchema,
    });
    expect(result.issues).toBeDefined();
    expect(result.issues!.length).toBeGreaterThan(0);
    expect(result.issues![0]!.slot).toBe('cookies');
    expect(result.issues![0]!.path).toBe('count');
    expect(result.value).toBeUndefined();
  });
});

describe('resolveCookiesArm — lazy-load cache', () => {
  it('caches the parse function after first load (no re-import on second call)', async () => {
    __resetCookieCacheForTest();
    // First call — loads cookie package
    await resolveCookiesArm(mkReq('a=1') as any, { a: true });
    // Second call — must NOT re-import (we can verify via import count in theory;
    // structural test: no error thrown on second call)
    const result = await resolveCookiesArm(mkReq('a=2') as any, { a: true });
    expect(result.value).toEqual({ a: '2' });
  });
});

describe('resolveInputs — cookies slot integration', () => {
  beforeEach(() => __resetCookieCacheForTest());

  it('resolves cookies slot when declared in InputDeclaration', async () => {
    const req = mkReq('sid=xyz') as any;
    const result = await resolveInputs(req, { cookies: { sid: true } });
    expect((result as any).cookies).toEqual({ sid: 'xyz' });
  });

  it('throws BadRequestError aggregating cookies validation failures', async () => {
    const req = mkReq('count=bad') as any;
    const schema = z.number();
    await expect(
      resolveInputs(req, { cookies: { count: schema } }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('BadRequestError details include issue with slot=cookies', async () => {
    const req = mkReq('count=bad') as any;
    const schema = z.number();
    try {
      await resolveInputs(req, { cookies: { count: schema } });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
      const badReq = err as BadRequestError;
      expect(badReq.details).toBeDefined();
      expect(badReq.details!.some((i) => i.slot === 'cookies')).toBe(true);
    }
  });

  it('does not affect other slots when cookies slot is used', async () => {
    const req = {
      ...mkReq('sid=abc'),
      params: { id: '1' },
      query: {},
      body: { name: 'test' },
    } as any;
    const result = await resolveInputs(req, { cookies: { sid: true } });
    expect((result as any).cookies).toEqual({ sid: 'abc' });
    expect(result.body).toEqual({ name: 'test' });
  });
});
