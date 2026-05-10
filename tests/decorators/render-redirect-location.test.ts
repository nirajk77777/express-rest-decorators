/**
 * TDD RED: Tests for @Render, @Redirect, @Location decorators (Task 1 — Phase 04-04)
 *
 * These tests verify:
 * - WeakMap storage layer (via MethodArgs fields)
 * - Decorator pure-registrar behavior (no Reflect.defineMetadata)
 * - ActionMetadata extension (render/redirect/location fields)
 * - Builder fold in mergeMethodChain (subclass-wins semantics)
 */
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';

// These imports will fail until Task 1 implementation is in place
import { Render, Redirect, Location } from '../../src/decorators/response.js';
import { buildMetadata } from '../../src/metadata/builder.js';
import { JsonController, Get } from '../../src/decorators/index.js';

describe('@Render decorator', () => {
  it('T1-01: registers render meta (via builder)', () => {
    @JsonController('/r-direct')
    class C {
      @Render('view/index')
      @Get('/')
      handler() { return {}; }
    }
    const [ctrl] = buildMetadata([C]);
    const action = ctrl!.actions[0]!;
    expect(action.render).toEqual({ template: 'view/index' });
  });

  it('T1-02: builder emits render on ActionMetadata', () => {
    @JsonController('/r')
    class R {
      @Render('view/show')
      @Get('/')
      show() { return {}; }
    }
    const [ctrl] = buildMetadata([R]);
    const action = ctrl!.actions[0]!;
    expect(action.render).toEqual({ template: 'view/show' });
    expect(action.redirect).toBeUndefined();
    expect(action.location).toBeUndefined();
  });

  it('T1-03: subclass override wins (subclass-wins semantics)', () => {
    @JsonController('/base')
    class Base {
      @Render('view/base')
      @Get('/')
      show() { return {}; }
    }
    @JsonController('/derived')
    class Derived extends Base {
      @Render('view/derived')
      @Get('/')
      override show() { return {}; }
    }
    const [ctrl] = buildMetadata([Derived]);
    const action = ctrl!.actions[0]!;
    expect(action.render).toEqual({ template: 'view/derived' });
  });
});

describe('@Redirect decorator', () => {
  it('T1-04: registers redirect meta with default status (via builder)', () => {
    @JsonController('/rd-default')
    class C {
      @Redirect('/target')
      @Get('/')
      handler() { return {}; }
    }
    const [ctrl] = buildMetadata([C]);
    const action = ctrl!.actions[0]!;
    expect(action.redirect).toEqual({ template: '/target', status: undefined });
  });

  it('T1-05: registers redirect meta with explicit status (via builder)', () => {
    @JsonController('/rd-301')
    class C {
      @Redirect('/target', 301)
      @Get('/')
      handler() { return {}; }
    }
    const [ctrl] = buildMetadata([C]);
    const action = ctrl!.actions[0]!;
    expect(action.redirect).toEqual({ template: '/target', status: 301 });
  });

  it('T1-06: builder emits redirect on ActionMetadata', () => {
    @JsonController('/rd')
    class Rd {
      @Redirect('/home', 302)
      @Get('/')
      go() { return {}; }
    }
    const [ctrl] = buildMetadata([Rd]);
    const action = ctrl!.actions[0]!;
    expect(action.redirect).toEqual({ template: '/home', status: 302 });
    expect(action.render).toBeUndefined();
    expect(action.location).toBeUndefined();
  });
});

describe('@Location decorator', () => {
  it('T1-07: registers location meta (via builder)', () => {
    @JsonController('/loc-direct')
    class C {
      @Location('/items/:id')
      @Get('/')
      handler() { return {}; }
    }
    const [ctrl] = buildMetadata([C]);
    const action = ctrl!.actions[0]!;
    expect(action.location).toEqual({ template: '/items/:id' });
  });

  it('T1-08: builder emits location on ActionMetadata', () => {
    @JsonController('/loc')
    class Loc {
      @Location('/created/:id')
      @Get('/')
      create() { return { id: 1 }; }
    }
    const [ctrl] = buildMetadata([Loc]);
    const action = ctrl!.actions[0]!;
    expect(action.location).toEqual({ template: '/created/:id' });
    expect(action.render).toBeUndefined();
    expect(action.redirect).toBeUndefined();
  });

  it('T1-09: subclass can override location', () => {
    @JsonController('/loc-base')
    class LocBase {
      @Location('/items/:id')
      @Get('/')
      create() { return {}; }
    }
    @JsonController('/loc-derived')
    class LocDerived extends LocBase {
      @Location('/things/:id')
      @Get('/')
      override create() { return {}; }
    }
    const [ctrl] = buildMetadata([LocDerived]);
    const action = ctrl!.actions[0]!;
    expect(action.location).toEqual({ template: '/things/:id' });
  });
});

describe('Decorator invariants', () => {
  it('T1-10: method without shaper decorator has undefined render/redirect/location', () => {
    @JsonController('/plain')
    class Plain {
      @Get('/')
      plain() { return {}; }
    }
    const [ctrl] = buildMetadata([Plain]);
    const action = ctrl!.actions[0]!;
    expect(action.render).toBeUndefined();
    expect(action.redirect).toBeUndefined();
    expect(action.location).toBeUndefined();
  });
});
