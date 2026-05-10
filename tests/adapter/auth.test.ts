import { describe, it, expect, vi, afterEach } from 'vitest';
import { makeAuthGate, resolveCurrentUser, CURRENT_USER_KEY } from '../../src/adapter/auth.js';
import { UnauthorizedError } from '../../src/errors/subclasses.js';
import { ForbiddenError } from '../../src/errors/subclasses.js';
import type { Action } from '../../src/types/action.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
type MockReq = Record<string | symbol, unknown> & {
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
};
const mkReq = (): MockReq => ({
  params: {},
  query: {},
  body: undefined,
  headers: {},
});
const mkRes = () => ({});
const mkNext = () => vi.fn();

// ---------------------------------------------------------------------------
// CURRENT_USER_KEY
// ---------------------------------------------------------------------------
describe('CURRENT_USER_KEY', () => {
  it('is a Symbol', () => {
    expect(typeof CURRENT_USER_KEY).toBe('symbol');
  });
  it('description includes express-controllers/currentUser', () => {
    expect(CURRENT_USER_KEY.description).toContain('express-controllers/currentUser');
  });
});

// ---------------------------------------------------------------------------
// resolveCurrentUser
// ---------------------------------------------------------------------------
describe('resolveCurrentUser', () => {
  it('calls checker and caches result on req', async () => {
    const req = mkReq();
    const checker = vi.fn().mockResolvedValue({ id: 1 });
    const action: Action = { request: req, response: mkRes() };
    const user = await resolveCurrentUser(req as any, checker, action);
    expect(user).toEqual({ id: 1 });
    expect(checker).toHaveBeenCalledTimes(1);
  });

  it('caches the result — checker invoked only once on second call', async () => {
    const req = mkReq();
    const checker = vi.fn().mockResolvedValue({ id: 42 });
    const action: Action = { request: req, response: mkRes() };
    await resolveCurrentUser(req as any, checker, action);
    await resolveCurrentUser(req as any, checker, action);
    expect(checker).toHaveBeenCalledTimes(1);
  });

  it('caches undefined values (in-operator check)', async () => {
    const req = mkReq();
    const checker = vi.fn().mockResolvedValue(undefined);
    const action: Action = { request: req, response: mkRes() };
    await resolveCurrentUser(req as any, checker, action);
    await resolveCurrentUser(req as any, checker, action);
    expect(checker).toHaveBeenCalledTimes(1);
  });

  it('returns cached value on second call', async () => {
    const req = mkReq();
    const checker = vi.fn().mockResolvedValue('user1');
    const action: Action = { request: req, response: mkRes() };
    const first = await resolveCurrentUser(req as any, checker, action);
    const second = await resolveCurrentUser(req as any, checker, action);
    expect(first).toBe('user1');
    expect(second).toBe('user1');
  });
});

// ---------------------------------------------------------------------------
// makeAuthGate
// ---------------------------------------------------------------------------
describe('makeAuthGate', () => {
  it('returns null when authorized is undefined (public route)', () => {
    const gate = makeAuthGate(undefined, undefined, undefined);
    expect(gate).toBeNull();
  });

  it('returns RequestHandler when authorized is null', () => {
    const gate = makeAuthGate(null, undefined, undefined);
    expect(typeof gate).toBe('function');
  });

  it('returns RequestHandler when authorized is string array', () => {
    const gate = makeAuthGate(['admin'], vi.fn().mockResolvedValue(true), undefined);
    expect(typeof gate).toBe('function');
  });

  describe('when authorized is set but no authChecker registered', () => {
    it('calls next with UnauthorizedError', async () => {
      const gate = makeAuthGate(null, undefined, undefined)!;
      const req = mkReq();
      const res = mkRes();
      const next = mkNext();
      await gate(req as any, res as any, next);
      expect(next).toHaveBeenCalledOnce();
      expect(next.mock.calls[0]![0]).toBeInstanceOf(UnauthorizedError);
    });
  });

  describe('with currentUserChecker returning falsy (non-false) values', () => {
    it('null → UnauthorizedError; authChecker NOT called', async () => {
      const authChecker = vi.fn().mockResolvedValue(true);
      const userChecker = vi.fn().mockResolvedValue(null);
      const gate = makeAuthGate(null, authChecker, userChecker)!;
      const req = mkReq();
      const next = mkNext();
      await gate(req as any, mkRes() as any, next);
      expect(next.mock.calls[0]![0]).toBeInstanceOf(UnauthorizedError);
      expect(authChecker).not.toHaveBeenCalled();
    });

    it('undefined → UnauthorizedError', async () => {
      const authChecker = vi.fn().mockResolvedValue(true);
      const userChecker = vi.fn().mockResolvedValue(undefined);
      const gate = makeAuthGate(null, authChecker, userChecker)!;
      const req = mkReq();
      const next = mkNext();
      await gate(req as any, mkRes() as any, next);
      expect(next.mock.calls[0]![0]).toBeInstanceOf(UnauthorizedError);
      expect(authChecker).not.toHaveBeenCalled();
    });

    it('0 → UnauthorizedError', async () => {
      const authChecker = vi.fn().mockResolvedValue(true);
      const userChecker = vi.fn().mockResolvedValue(0);
      const gate = makeAuthGate(null, authChecker, userChecker)!;
      const req = mkReq();
      const next = mkNext();
      await gate(req as any, mkRes() as any, next);
      expect(next.mock.calls[0]![0]).toBeInstanceOf(UnauthorizedError);
      expect(authChecker).not.toHaveBeenCalled();
    });

    it("empty string '' → UnauthorizedError", async () => {
      const authChecker = vi.fn().mockResolvedValue(true);
      const userChecker = vi.fn().mockResolvedValue('');
      const gate = makeAuthGate(null, authChecker, userChecker)!;
      const req = mkReq();
      const next = mkNext();
      await gate(req as any, mkRes() as any, next);
      expect(next.mock.calls[0]![0]).toBeInstanceOf(UnauthorizedError);
      expect(authChecker).not.toHaveBeenCalled();
    });

    it('false (strict) → does NOT trigger 401; flow continues to authChecker (D-12)', async () => {
      // `false` is reserved for authChecker's vocabulary — currentUserChecker returning
      // false means "explicit false" not "no user found".
      const authChecker = vi.fn().mockResolvedValue(true);
      const userChecker = vi.fn().mockResolvedValue(false);
      const gate = makeAuthGate(null, authChecker, userChecker)!;
      const req = mkReq();
      const next = mkNext();
      await gate(req as any, mkRes() as any, next);
      // authChecker IS called (flow continued)
      expect(authChecker).toHaveBeenCalled();
      // next called with no error (authChecker returned true)
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('authChecker returning false → ForbiddenError', () => {
    it('403 when authChecker returns false', async () => {
      const authChecker = vi.fn().mockResolvedValue(false);
      const gate = makeAuthGate(['admin'], authChecker, undefined)!;
      const req = mkReq();
      const next = mkNext();
      await gate(req as any, mkRes() as any, next);
      expect(next.mock.calls[0]![0]).toBeInstanceOf(ForbiddenError);
    });

    it('passes roles to authChecker', async () => {
      const authChecker = vi.fn().mockResolvedValue(true);
      const gate = makeAuthGate(['admin', 'editor'], authChecker, undefined)!;
      const req = mkReq();
      const next = mkNext();
      await gate(req as any, mkRes() as any, next);
      expect(authChecker).toHaveBeenCalledWith(
        expect.objectContaining({ request: req }),
        ['admin', 'editor'],
      );
    });
  });

  describe('authChecker returning true → next() with no args', () => {
    it('calls next() with no arguments when authChecker returns true', async () => {
      const authChecker = vi.fn().mockResolvedValue(true);
      const gate = makeAuthGate(null, authChecker, undefined)!;
      const req = mkReq();
      const next = mkNext();
      await gate(req as any, mkRes() as any, next);
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('user-thrown HttpError escape hatch', () => {
    it('custom error thrown by authChecker flows through next unchanged', async () => {
      const customErr = new ForbiddenError('custom forbidden');
      const authChecker = vi.fn().mockRejectedValue(customErr);
      const gate = makeAuthGate(['admin'], authChecker, undefined)!;
      const req = mkReq();
      const next = mkNext();
      await gate(req as any, mkRes() as any, next);
      expect(next.mock.calls[0]![0]).toBe(customErr);
    });

    it('custom error thrown by currentUserChecker flows through next unchanged', async () => {
      const customErr = new UnauthorizedError('custom unauth');
      const userChecker = vi.fn().mockRejectedValue(customErr);
      const authChecker = vi.fn().mockResolvedValue(true);
      const gate = makeAuthGate(null, authChecker, userChecker)!;
      const req = mkReq();
      const next = mkNext();
      await gate(req as any, mkRes() as any, next);
      expect(next.mock.calls[0]![0]).toBe(customErr);
    });
  });
});
