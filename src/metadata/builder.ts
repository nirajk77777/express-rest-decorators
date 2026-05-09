import { getControllerArgs, getAllMethodArgs } from './storage.js';
import type { ControllerArgs, MethodArgs } from './types.js';
import type { ControllerMetadata, ActionMetadata } from '../types/resolved.js';
import { checkLegacyDecoratorMode } from '../guard/runtime-guard.js';

export function buildMetadata(classes: Function[]): ControllerMetadata[] {
  checkLegacyDecoratorMode();
  return classes.map(buildController);
}

function buildController(ctor: Function): ControllerMetadata {
  const merged = mergeControllerChain(ctor);
  const methods = mergeMethodChain(ctor.prototype);
  const actions: ActionMetadata[] = [];

  for (const [key, args] of methods) {
    // Skip entries without a verb (no route decorator applied)
    if (!args.verb) continue;
    const action: ActionMetadata = {
      target: ctor,
      method: key,
      verb: args.verb,
      path: args.path,
      responseHandlers: args.responseHandlers,
    };
    if (args.input !== undefined) action.input = args.input;
    if (args.returnType !== undefined) action.returnType = args.returnType;
    if (args.paramTypes !== undefined) action.paramTypes = args.paramTypes;
    actions.push(action);
  }

  return {
    target: ctor,
    basePath: merged.basePath,
    type: merged.type,
    responseHandlers: merged.responseHandlers,
    actions,
  };
}

function mergeControllerChain(ctor: Function): ControllerArgs {
  // Walk constructor prototype chain; collect base-first; subclass fields overwrite.
  const chain: ControllerArgs[] = [];
  let current: Function | null = ctor;
  while (current && current !== Function.prototype) {
    const args = getControllerArgs(current);
    if (args) chain.unshift(args); // base first
    const proto = Object.getPrototypeOf(current);
    current = typeof proto === 'function' ? proto : null;
  }
  // Merge: subclass wins on basePath/type; responseHandlers concatenate base-first.
  const init: ControllerArgs = { basePath: '', type: 'default', responseHandlers: [] };
  for (const c of chain) {
    if (c.basePath) init.basePath = c.basePath;
    init.type = c.type; // last write wins (subclass)
    init.responseHandlers = [...init.responseHandlers, ...c.responseHandlers];
  }
  return init;
}

function mergeMethodChain(proto: object): Map<string | symbol, MethodArgs> {
  // Walk prototype chain base-first; subclass entries overwrite on collision.
  const chain: object[] = [];
  let current: object | null = proto;
  while (current && current !== Object.prototype) {
    chain.unshift(current); // base first
    current = Object.getPrototypeOf(current);
  }
  const result = new Map<string | symbol, MethodArgs>();
  for (const p of chain) {
    for (const [key, args] of getAllMethodArgs(p)) {
      result.set(key, args); // last write wins = subclass
    }
  }
  return result;
}

export const MetadataBuilder = { build: buildMetadata };
