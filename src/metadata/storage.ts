import type { ControllerArgs, MethodArgs } from './types.js';

const controllerMap = new WeakMap<Function, ControllerArgs>();
const methodMap = new WeakMap<object, Map<string | symbol, MethodArgs>>();

// ── Response shaper WeakMaps (Phase 4 D-05/D-06/D-07) ──────────────────────
// Module-private; getter/setter helpers are the only public surface.

interface RenderMeta { template: string }
interface RedirectMeta { template: string; status?: number }
interface LocationMeta { template: string }

const renderMap = new WeakMap<object, Map<string | symbol, RenderMeta>>();
const redirectMap = new WeakMap<object, Map<string | symbol, RedirectMeta>>();
const locationMap = new WeakMap<object, Map<string | symbol, LocationMeta>>();

export function setRenderMeta(target: object, key: string | symbol, m: RenderMeta): void {
  let inner = renderMap.get(target);
  if (!inner) { inner = new Map(); renderMap.set(target, inner); }
  inner.set(key, m);
}

export function getRenderMeta(target: object, key: string | symbol): RenderMeta | undefined {
  return renderMap.get(target)?.get(key);
}

export function setRedirectMeta(target: object, key: string | symbol, m: RedirectMeta): void {
  let inner = redirectMap.get(target);
  if (!inner) { inner = new Map(); redirectMap.set(target, inner); }
  inner.set(key, m);
}

export function getRedirectMeta(target: object, key: string | symbol): RedirectMeta | undefined {
  return redirectMap.get(target)?.get(key);
}

export function setLocationMeta(target: object, key: string | symbol, m: LocationMeta): void {
  let inner = locationMap.get(target);
  if (!inner) { inner = new Map(); locationMap.set(target, inner); }
  inner.set(key, m);
}

export function getLocationMeta(target: object, key: string | symbol): LocationMeta | undefined {
  return locationMap.get(target)?.get(key);
}

// Module-private middleware registry
const middlewareTypeMap = new WeakMap<Function, 'before' | 'after'>();
const middlewareClassSet = new Set<Function>();

export function markAsMiddleware(cls: Function, type: 'before' | 'after'): void {
  middlewareTypeMap.set(cls, type);
  middlewareClassSet.add(cls);
}

export function getMiddlewareType(cls: Function): 'before' | 'after' | undefined {
  return middlewareTypeMap.get(cls);
}

export function getRegisteredMiddlewareClasses(): ReadonlySet<Function> {
  return middlewareClassSet;
}

// Module-private interceptor registry
const interceptorClassSet = new Set<Function>();

export function markAsInterceptor(cls: Function): void {
  interceptorClassSet.add(cls);
}

export function isMarkedAsInterceptor(cls: Function): boolean {
  return interceptorClassSet.has(cls);
}

export function getOrInitControllerArgs(ctor: Function): ControllerArgs {
  let entry = controllerMap.get(ctor);
  if (!entry) {
    entry = { basePath: '', type: 'default', responseHandlers: [] };
    controllerMap.set(ctor, entry);
  }
  return entry;
}

export function getControllerArgs(ctor: Function): ControllerArgs | undefined {
  return controllerMap.get(ctor);
}

export function getOrInitMethodArgs(proto: object, key: string | symbol): MethodArgs {
  let inner = methodMap.get(proto);
  if (!inner) {
    inner = new Map<string | symbol, MethodArgs>();
    methodMap.set(proto, inner);
  }
  let args = inner.get(key);
  if (!args) {
    args = { verb: '', path: '', responseHandlers: [] };
    inner.set(key, args);
  }
  return args;
}

export function getAllMethodArgs(proto: object): Map<string | symbol, MethodArgs> {
  return methodMap.get(proto) ?? new Map<string | symbol, MethodArgs>();
}
