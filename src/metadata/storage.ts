import type { ControllerArgs, MethodArgs } from './types.js';

const controllerMap = new WeakMap<Function, ControllerArgs>();
const methodMap = new WeakMap<object, Map<string | symbol, MethodArgs>>();

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
