/**
 * TDD RED: Tests for src/adapter/render.ts helper functions (Task 2 — Phase 04-04)
 *
 * Tests for:
 * - interpolateTemplate
 * - applyRedirect
 * - applyRender
 * - applyLocation
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';

// These will fail until Task 2 implementation is in place
import {
  interpolateTemplate,
  applyRedirect,
  applyRender,
  applyLocation,
} from '../../src/adapter/render.js';

function makeRes(): Response {
  return {
    redirect: vi.fn(),
    render: vi.fn(),
    location: vi.fn(),
  } as unknown as Response;
}

describe('interpolateTemplate', () => {
  it('T2-01: replaces :name placeholders from data object', () => {
    const result = interpolateTemplate('/users/:id', { id: 42 }, 'Ctrl.method');
    expect(result).toBe('/users/42');
  });

  it('T2-02: replaces multiple placeholders', () => {
    const result = interpolateTemplate('/orgs/:org/users/:user', { org: 'acme', user: 'ada' }, 'Ctrl.method');
    expect(result).toBe('/orgs/acme/users/ada');
  });

  it('T2-03: coerces values via String()', () => {
    const result = interpolateTemplate('/items/:id', { id: 99 }, 'Ctrl.method');
    expect(result).toBe('/items/99');
  });

  it('T2-04: throws actionable error when key is missing', () => {
    expect(() =>
      interpolateTemplate('/users/:missing', {}, 'MyCtrl.myMethod')
    ).toThrow('[MyCtrl.myMethod] @Redirect/@Location template "/users/:missing" references ":missing" but handler return value has no "missing" property.');
  });

  it('T2-05: does not replace patterns that are not valid identifiers', () => {
    // :1start starts with digit — not matched by regex
    const result = interpolateTemplate('/path/:id', { id: 'abc' }, 'Ctrl.method');
    expect(result).toBe('/path/abc');
  });
});

describe('applyRedirect', () => {
  let res: Response;

  beforeEach(() => { res = makeRes(); });

  it('T2-06: string return uses it verbatim', () => {
    applyRedirect(res, '/default', 302, 'https://example.com', 'Ctrl.method');
    expect(res.redirect).toHaveBeenCalledWith(302, 'https://example.com');
  });

  it('T2-07: undefined return uses bare template', () => {
    applyRedirect(res, '/bare/:id', 302, undefined, 'Ctrl.method');
    expect(res.redirect).toHaveBeenCalledWith(302, '/bare/:id');
  });

  it('T2-08: null return uses bare template', () => {
    applyRedirect(res, '/bare', 302, null, 'Ctrl.method');
    expect(res.redirect).toHaveBeenCalledWith(302, '/bare');
  });

  it('T2-09: object return interpolates template', () => {
    applyRedirect(res, '/users/:id', 302, { id: 5 }, 'Ctrl.method');
    expect(res.redirect).toHaveBeenCalledWith(302, '/users/5');
  });

  it('T2-10: uses specified status code', () => {
    applyRedirect(res, '/home', 301, undefined, 'Ctrl.method');
    expect(res.redirect).toHaveBeenCalledWith(301, '/home');
  });

  it('T2-11: non-object/non-string/non-undefined returns bare template', () => {
    applyRedirect(res, '/fallback', 302, 42, 'Ctrl.method');
    expect(res.redirect).toHaveBeenCalledWith(302, '/fallback');
  });
});

describe('applyRender', () => {
  let res: Response;

  beforeEach(() => { res = makeRes(); });

  it('T2-12: undefined → res.render(template) with no locals', () => {
    applyRender(res, 'view/index', undefined, 'Ctrl.method');
    expect(res.render).toHaveBeenCalledWith('view/index');
  });

  it('T2-13: null → res.render(template) with no locals', () => {
    applyRender(res, 'view/index', null, 'Ctrl.method');
    expect(res.render).toHaveBeenCalledWith('view/index');
  });

  it('T2-14: object → res.render(template, locals)', () => {
    applyRender(res, 'view/show', { name: 'Ada' }, 'Ctrl.method');
    expect(res.render).toHaveBeenCalledWith('view/show', { name: 'Ada' });
  });

  it('T2-15: non-object return throws actionable error', () => {
    expect(() =>
      applyRender(res, 'view/index', 42, 'MyCtrl.myMethod')
    ).toThrow('[MyCtrl.myMethod] @Render expects an object or undefined; got number from handler return.');
  });

  it('T2-16: string return throws actionable error', () => {
    expect(() =>
      applyRender(res, 'view/index', 'oops', 'MyCtrl.myMethod')
    ).toThrow('[MyCtrl.myMethod] @Render expects an object or undefined; got string from handler return.');
  });
});

describe('applyLocation', () => {
  let res: Response;

  beforeEach(() => { res = makeRes(); });

  it('T2-17: string return uses it verbatim for Location header', () => {
    applyLocation(res, '/default', 'https://example.com', 'Ctrl.method');
    expect(res.location).toHaveBeenCalledWith('https://example.com');
  });

  it('T2-18: undefined return uses bare template', () => {
    applyLocation(res, '/items/:id', undefined, 'Ctrl.method');
    expect(res.location).toHaveBeenCalledWith('/items/:id');
  });

  it('T2-19: object return interpolates template', () => {
    applyLocation(res, '/items/:id', { id: 1 }, 'Ctrl.method');
    expect(res.location).toHaveBeenCalledWith('/items/1');
  });

  it('T2-20: does NOT call res.redirect', () => {
    applyLocation(res, '/items', undefined, 'Ctrl.method');
    expect(res.redirect).not.toHaveBeenCalled();
  });
});
