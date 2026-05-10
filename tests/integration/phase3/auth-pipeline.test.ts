/**
 * SC#4 — @Authorized + authorizationChecker + currentUserChecker:
 *   401 vs 403 distinction; currentUser injected via InputDeclaration slot (D-11..D-14).
 *
 * Cases:
 *   A: no checker → 401
 *   B: checker says false → 403
 *   C: checker says true → 200
 *   D: currentUserChecker returns null → 401; authChecker NOT called
 *   E: currentUserChecker returns false → flow continues; authChecker IS called
 *   F: currentUser injection via InputDeclaration slot → echoed in response
 *   G: authChecker throws ForbiddenError → 403 with custom message (escape hatch D-12)
 *   H: @Authorized + invalid body → 401 returned (auth fires before validation, D-03)
 */
import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { z } from 'zod';
import {
  JsonController,
  Get,
  Post,
  Authorized,
  ForbiddenError,
  createExpressServer,
  resetContainer,
} from '../../../src/index.js';
import type { Action } from '../../../src/index.js';

beforeEach(() => resetContainer());
afterEach(() => resetContainer());

// ── Shared controller fixture ────────────────────────────────────────────────

@JsonController('/auth')
@Authorized()
class AuthController {
  @Get('/open')
  open() {
    return { ok: true };
  }

  @Get('/admin')
  @Authorized('admin')
  adminOnly() {
    return { admin: true };
  }

  @Get('/me', { currentUser: true })
  me({ currentUser }: { currentUser: unknown }) {
    return { user: currentUser };
  }

  @Post('/body-check', {
    body: z.object({ name: z.string().min(1) }),
  })
  bodyCheck({ body }: { body: { name: string } }) {
    return { name: body.name };
  }
}

describe('SC#4 — auth pipeline (AUTH-01, AUTH-02, AUTH-03)', () => {
  // Case A: no authorizationChecker → 401
  it('Case A: @Authorized route with no authorizationChecker → 401', async () => {
    const app = await createExpressServer({
      controllers: [AuthController],
    });

    const res = await request(app).get('/auth/open');
    expect(res.status).toBe(401);
  });

  // Case B: authorizationChecker returns false → 403
  it('Case B: authChecker returns false → 403', async () => {
    const app = await createExpressServer({
      controllers: [AuthController],
      authorizationChecker: async () => false,
    });

    const res = await request(app).get('/auth/open');
    expect(res.status).toBe(403);
  });

  // Case C: authorizationChecker returns true → 200 with payload
  it('Case C: authChecker returns true → 200 with handler payload', async () => {
    const app = await createExpressServer({
      controllers: [AuthController],
      authorizationChecker: async () => true,
    });

    const res = await request(app).get('/auth/open');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });

  // Case D: currentUserChecker returns null → 401; authChecker NOT called
  it('Case D: currentUserChecker returns null → 401; authChecker not called', async () => {
    const authCheckerSpy = vi.fn(async () => true);
    const app = await createExpressServer({
      controllers: [AuthController],
      authorizationChecker: authCheckerSpy,
      currentUserChecker: async () => null,
    });

    const res = await request(app).get('/auth/open');
    expect(res.status).toBe(401);
    expect(authCheckerSpy).not.toHaveBeenCalled();
  });

  // Case E: currentUserChecker returns false (strict-false exception D-12) → flow continues; authChecker IS called
  it('Case E: currentUserChecker returns false (strict-false) → authChecker IS called', async () => {
    const authCheckerSpy = vi.fn(async () => true);
    const app = await createExpressServer({
      controllers: [AuthController],
      authorizationChecker: authCheckerSpy,
      currentUserChecker: async () => false,
    });

    const res = await request(app).get('/auth/open');
    expect(res.status).toBe(200);
    expect(authCheckerSpy).toHaveBeenCalled();
  });

  // Case F: currentUser injection via InputDeclaration — handler echoes it
  it('Case F: currentUser injected via input declaration slot; echoed in response', async () => {
    const mockUser = { id: 42, role: 'user' };
    const app = await createExpressServer({
      controllers: [AuthController],
      authorizationChecker: async () => true,
      currentUserChecker: async () => mockUser,
    });

    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ user: { id: 42, role: 'user' } });
  });

  // Case G: authChecker throws ForbiddenError → 403 with custom message (escape hatch D-12)
  it('Case G: authChecker throws ForbiddenError(custom message) → 403 with correct body', async () => {
    const app = await createExpressServer({
      controllers: [AuthController],
      authorizationChecker: async (_action: Action) => {
        throw new ForbiddenError('custom message');
      },
    });

    const res = await request(app).get('/auth/admin');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      status: 403,
      name: 'ForbiddenError',
      message: 'custom message',
    });
  });

  // Case H: @Authorized + invalid request body → 401 returned (auth before validation, D-03)
  it('Case H: @Authorized + invalid body → 401 (auth fires before validation)', async () => {
    const app = await createExpressServer({
      controllers: [AuthController],
    });

    // No authorizationChecker = 401, even though body is invalid
    const res = await request(app)
      .post('/auth/body-check')
      .send({ name: '' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(401);
  });

  // Role-based @Authorized('admin') check
  it('roles: authChecker receives roles array for specific-role routes; undefined for any-auth routes', async () => {
    const authCheckerSpy = vi.fn(async (_action: Action, roles?: string[]) => {
      // If roles specified, require 'admin'. If roles undefined → any authenticated user passes.
      if (roles === undefined) return true;
      return Array.isArray(roles) && roles.includes('admin');
    });
    const app = await createExpressServer({
      controllers: [AuthController],
      authorizationChecker: authCheckerSpy,
    });

    // /auth/admin requires 'admin' role → checker called with ['admin']
    const adminRes = await request(app).get('/auth/admin');
    expect(adminRes.status).toBe(200);
    expect(authCheckerSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ request: expect.anything() }),
      ['admin'],
    );

    // /auth/open has @Authorized() (null roles) → checker called with undefined per D-11
    authCheckerSpy.mockClear();
    const openRes = await request(app).get('/auth/open');
    expect(openRes.status).toBe(200);
    expect(authCheckerSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ request: expect.anything() }),
      undefined,
    );
  });
});
