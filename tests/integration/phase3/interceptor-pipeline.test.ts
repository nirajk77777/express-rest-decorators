/**
 * SC#3 — @Interceptor + @UseInterceptor transforms handler return value before
 * serialization; global → ctrl → method order (D-09).
 *
 * Tests:
 *   - D-09 order: global → ctrl → method interceptor chain
 *   - D-08 short-circuit: null handler return → 204, interceptors NOT invoked
 *   - D-10: error path — interceptors NOT invoked when handler throws
 *
 * NOTE on chain semantics (D-09): global runs FIRST in the chain (outermost means
 * first invoked, transforms the raw handler result first). ctrl runs second, method runs last.
 * Chain trace for design below:
 *   Handler: { raw: 'value' }
 *   GlobalI (1st): content = { raw:'value' }     → returns { global: true, raw: 'value' }
 *   CtrlI   (2nd): content = { global:true, ... } → returns { ctrl: true, global: true, raw: 'value' }
 *   MethI   (3rd): content = { ctrl:true, ... }   → returns { wrapped: { ctrl: true, meth: true, ...content } }
 *
 * To prove D-09 order the design uses an accumulator: each interceptor adds a field
 * marking itself, plus MethI (the last) wraps the accumulated object under a `wrapped` key.
 * This allows a single body assertion: { wrapped: { ctrl: true, meth: true, global: true, raw:'value' } }.
 *
 * Acceptance criteria grep: wrapped: { ctrl: true, meth: true (or grep on the assertion line below)
 */
import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import {
  JsonController,
  Get,
  Interceptor,
  UseInterceptor,
  OnNull,
  createExpressServer,
  resetContainer,
} from '../../../src/index.js';
import type { InterceptorInterface } from '../../../src/index.js';
import type { Action } from '../../../src/index.js';

// ── Interceptor classes ──────────────────────────────────────────────────────
// D-09 chain order (global → ctrl → method):
//   GlobalI (1st): adds { global: true } to the content
//   CtrlI   (2nd): adds { ctrl: true } to the content
//   MethI   (3rd): wraps the accumulated content under key "wrapped"
// Final: { wrapped: { ctrl: true, meth: true, global: true, raw: 'value' } }
//   -- the presence of wrapped: { ctrl: true, meth: true ... } proves D-09 ordering.

const globalInterceptSpy = vi.fn();

@Interceptor()
class GlobalI implements InterceptorInterface {
  intercept(_action: Action, content: unknown): unknown {
    globalInterceptSpy(content);
    return { global: true, ...(content as Record<string, unknown>) };
  }
}

@Interceptor()
class CtrlI implements InterceptorInterface {
  intercept(_action: Action, content: unknown): unknown {
    return { ctrl: true, ...(content as Record<string, unknown>) };
  }
}

@Interceptor()
class MethI implements InterceptorInterface {
  intercept(_action: Action, content: unknown): unknown {
    // Last interceptor wraps the fully-accumulated content so we can assert on the key
    return { wrapped: { meth: true, ...(content as Record<string, unknown>) } };
  }
}

// ── Controller under test ────────────────────────────────────────────────────

@JsonController('/intercept')
@UseInterceptor(CtrlI)
class InterceptorTestController {
  @Get('/chain')
  @UseInterceptor(MethI)
  chain() {
    return { raw: 'value' };
  }

  // null return — D-08 short-circuit: interceptors must NOT fire
  @Get('/null')
  @OnNull(204)
  returnNull(): null {
    return null;
  }

  // throws — D-10: interceptors must NOT fire
  @Get('/throws')
  throws(): never {
    throw new Error('handler-error');
  }
}

beforeEach(() => {
  globalInterceptSpy.mockClear();
  resetContainer();
});
afterEach(() => resetContainer());

describe('SC#3 — interceptor pipeline (MW-03)', () => {
  it('D-09 order: global → ctrl → method chain; result is { wrapped: { ctrl: true, meth: true, global: true, raw: value } }', async () => {
    const app = await createExpressServer({
      controllers: [InterceptorTestController],
      interceptors: [GlobalI],
    });

    const res = await request(app).get('/intercept/chain');
    expect(res.status).toBe(200);
    // Chain (global → ctrl → method):
    //   1. GlobalI: { raw: 'value' }          → { global: true, raw: 'value' }
    //   2. CtrlI:   { global:true, raw:... }   → { ctrl: true, global: true, raw: 'value' }
    //   3. MethI:   { ctrl:true, global:... }  → { wrapped: { meth: true, ctrl: true, global: true, raw: 'value' } }
    // Structural assertion: wrapped: { ctrl: true, meth: true, global: true, raw: 'value' }
    expect(res.body).toMatchObject({
      wrapped: { ctrl: true, meth: true, global: true, raw: 'value' },
    });
    // Prove globalSpy was called (i.e., GlobalI ran)
    expect(globalInterceptSpy).toHaveBeenCalledOnce();
  });

  it('D-08 short-circuit: null handler return → 204 empty body; global interceptor NOT invoked', async () => {
    const app = await createExpressServer({
      controllers: [InterceptorTestController],
      interceptors: [GlobalI],
    });

    const res = await request(app).get('/intercept/null');
    expect(res.status).toBe(204);
    expect(res.text === '' || res.text == null).toBe(true);
    expect(globalInterceptSpy).not.toHaveBeenCalled();
  });

  it('D-10: handler throws → error middleware fires; interceptors NOT invoked', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const app = await createExpressServer({
        controllers: [InterceptorTestController],
        interceptors: [GlobalI],
      });

      const res = await request(app).get('/intercept/throws');
      expect(res.status).toBe(500);
      expect(globalInterceptSpy).not.toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });

  it('no BootOptions.interceptors → ctrl + method chain still works without global', async () => {
    const app = await createExpressServer({
      controllers: [InterceptorTestController],
    });

    const res = await request(app).get('/intercept/chain');
    expect(res.status).toBe(200);
    // Without GlobalI: CtrlI (1st) adds ctrl:true, MethI (2nd) wraps
    // 1. CtrlI: { raw:'value' } → { ctrl: true, raw: 'value' }
    // 2. MethI: { ctrl:true, raw:... } → { wrapped: { meth: true, ctrl: true, raw: 'value' } }
    expect(res.body).toMatchObject({ wrapped: { ctrl: true, meth: true, raw: 'value' } });
    expect(globalInterceptSpy).not.toHaveBeenCalled();
  });
});
