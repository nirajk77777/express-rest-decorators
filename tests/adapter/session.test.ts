/**
 * Task 1 TDD RED — session adapter + InputDeclaration extension.
 *
 * These tests verify:
 *  - resolveSessionArm pass-through (true) with req.session
 *  - resolveSessionArm with Standard Schema validation (success)
 *  - resolveSessionArm with Standard Schema validation (failure → issues)
 *  - undefined declaration → undefined value
 *  - NO express-session import (structural: grep source file)
 *  - InputDeclaration session slot works through resolveInputs
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { resolveSessionArm } from '../../src/adapter/session.js';
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

const mkReqWithSession = (session: unknown): ReqShape => ({
  params: {},
  query: {},
  body: undefined,
  headers: {},
  session,
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('resolveSessionArm — pass-through (true)', () => {
  it('returns req.session when declaration is true', async () => {
    const session = { uid: 7, role: 'admin' };
    const result = await resolveSessionArm(mkReqWithSession(session) as any, true);
    expect(result.value).toBe(session);
    expect(result.issues).toBeUndefined();
  });

  it('returns undefined value when declaration is undefined', async () => {
    const result = await resolveSessionArm(mkReqWithSession({}) as any, undefined);
    expect(result.value).toBeUndefined();
    expect(result.issues).toBeUndefined();
  });

  it('returns undefined when req.session is not set and declaration is true', async () => {
    const result = await resolveSessionArm({ params: {}, query: {}, body: undefined, headers: {} } as any, true);
    expect(result.value).toBeUndefined();
    expect(result.issues).toBeUndefined();
  });
});

describe('resolveSessionArm — Standard Schema validation', () => {
  it('validates session object when declaration is a schema (success)', async () => {
    const schema = z.object({ uid: z.number() });
    const session = { uid: 7 };
    const result = await resolveSessionArm(mkReqWithSession(session) as any, schema);
    expect(result.value).toEqual({ uid: 7 });
    expect(result.issues).toBeUndefined();
  });

  it('returns issues when Standard Schema validation fails', async () => {
    const schema = z.object({ uid: z.number() });
    const session = { uid: 'oops' };
    const result = await resolveSessionArm(mkReqWithSession(session) as any, schema);
    expect(result.issues).toBeDefined();
    expect(result.issues!.length).toBeGreaterThan(0);
    expect(result.issues![0]!.slot).toBe('session');
    expect(result.value).toBeUndefined();
  });
});

describe('resolveSessionArm — no express-session import', () => {
  it('src/adapter/session.ts does not have top-level import of express-session', () => {
    const source = readFileSync(
      new URL('../../src/adapter/session.ts', import.meta.url),
      'utf8',
    );
    // Check no top-level static import of express-session (comments are allowed to mention it)
    const importLines = source
      .split('\n')
      .filter((line) => /^import\s/.test(line));
    for (const line of importLines) {
      expect(line).not.toMatch(/express-session/);
    }
  });
});

describe('resolveInputs — session slot integration', () => {
  it('resolves session slot when declared as true in InputDeclaration', async () => {
    const session = { uid: 7 };
    const req = mkReqWithSession(session) as any;
    const result = await resolveInputs(req, { session: true });
    expect((result as any).session).toBe(session);
  });

  it('throws BadRequestError when session validation fails', async () => {
    const schema = z.object({ uid: z.number() });
    const req = mkReqWithSession({ uid: 'oops' }) as any;
    await expect(
      resolveInputs(req, { session: schema }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('BadRequestError details include issue with slot=session', async () => {
    const schema = z.object({ uid: z.number() });
    const req = mkReqWithSession({ uid: 'oops' }) as any;
    try {
      await resolveInputs(req, { session: schema });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
      const badReq = err as BadRequestError;
      expect(badReq.details).toBeDefined();
      expect(badReq.details!.some((i) => i.slot === 'session')).toBe(true);
    }
  });
});
