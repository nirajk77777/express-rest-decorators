import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { wrapAction, type InvokeAction } from '../../src/adapter/handler-wrapper.js';
import { BadRequestError } from '../../src/errors/subclasses.js';
import type { Request, Response, NextFunction } from 'express';
import type { ControllerMetadata, ActionMetadata } from '../../src/types/resolved.js';

class UsersController {
  update() {}
}

class Ctl {
  m() {}
}

function makeMeta(
  ctlClass: Function,
  methodName: string | symbol
): { ctl: ControllerMetadata; act: ActionMetadata } {
  const ctl: ControllerMetadata = {
    type: 'json',
    basePath: '',
    target: ctlClass,
    responseHandlers: [],
    actions: [],
    useBefore: [],
    useAfter: [],
    interceptors: [],
  };
  const act: ActionMetadata = {
    target: ctlClass,
    method: methodName,
    verb: 'get',
    path: '/',
    responseHandlers: [],
    useBefore: [],
    useAfter: [],
    interceptors: [],
  };
  return { ctl, act };
}

const req = {} as Request;
const res = {} as Response;

describe('wrapAction', () => {
  it('async throw → next(err) once with source attached', async () => {
    const { ctl, act } = makeMeta(Ctl, 'm');
    const invoke: InvokeAction = async () => {
      throw new Error('boom');
    };
    const next = vi.fn();
    const handler = wrapAction(ctl, act, invoke);
    await handler(req, res, next as unknown as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0]![0] as Error & { source?: string };
    expect(err).toBeInstanceOf(Error);
    expect(err.source).toBe('Ctl.m');
  });

  it('sync throw inside async fn is caught', async () => {
    const { ctl, act } = makeMeta(Ctl, 'm');
    const invoke: InvokeAction = async () => {
      throw new TypeError('sync');
    };
    const next = vi.fn();
    await wrapAction(ctl, act, invoke)(req, res, next as unknown as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]![0]).toBeInstanceOf(TypeError);
  });

  it('successful handler does not call next', async () => {
    const { ctl, act } = makeMeta(Ctl, 'm');
    const invoke: InvokeAction = async () => {};
    const next = vi.fn();
    await wrapAction(ctl, act, invoke)(req, res, next as unknown as NextFunction);
    expect(next).not.toHaveBeenCalled();
  });

  it('explicit err.source preserved (not overwritten)', async () => {
    const { ctl, act } = makeMeta(Ctl, 'm');
    const invoke: InvokeAction = async () => {
      throw new BadRequestError('bad', { source: 'CustomSrc' });
    };
    const next = vi.fn();
    await wrapAction(ctl, act, invoke)(req, res, next as unknown as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
    expect((next.mock.calls[0]![0] as { source?: string }).source).toBe('CustomSrc');
  });

  it('non-error rejection coerced to Error and source set', async () => {
    const { ctl, act } = makeMeta(Ctl, 'm');
    const invoke: InvokeAction = () => Promise.reject(null);
    const next = vi.fn();
    await wrapAction(ctl, act, invoke)(req, res, next as unknown as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0]![0] as Error & { source?: string };
    expect(err).toBeInstanceOf(Error);
    expect(err.source).toBe('Ctl.m');
  });

  it('source format is exactly Class.method', async () => {
    const { ctl, act } = makeMeta(UsersController, 'update');
    const invoke: InvokeAction = async () => {
      throw new Error('x');
    };
    const next = vi.fn();
    await wrapAction(ctl, act, invoke)(req, res, next as unknown as NextFunction);
    expect((next.mock.calls[0]![0] as { source?: string }).source).toBe('UsersController.update');
  });

  it('symbol method does not crash and yields non-empty source', async () => {
    const sym = Symbol('s');
    const { ctl, act } = makeMeta(Ctl, sym);
    const invoke: InvokeAction = async () => {
      throw new Error('x');
    };
    const next = vi.fn();
    await wrapAction(ctl, act, invoke)(req, res, next as unknown as NextFunction);
    const src = (next.mock.calls[0]![0] as { source?: string }).source as string;
    expect(typeof src).toBe('string');
    expect(src.length).toBeGreaterThan(0);
    expect(src).toContain('Symbol(s)');
  });

  it('throws once → next called exactly once (Pitfall A regression)', async () => {
    const { ctl, act } = makeMeta(Ctl, 'm');
    const invoke: InvokeAction = async () => {
      throw new Error('boom');
    };
    const next = vi.fn();
    await wrapAction(ctl, act, invoke)(req, res, next as unknown as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
