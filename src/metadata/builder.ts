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
      useBefore: args.useBefore ?? [],
      useAfter: args.useAfter ?? [],
      interceptors: args.interceptors ?? [],
    };
    if (args.input !== undefined) action.input = args.input;
    if (args.returnType !== undefined) action.returnType = args.returnType;
    if (args.paramTypes !== undefined) action.paramTypes = args.paramTypes;
    if (args.authorized !== undefined) action.authorized = args.authorized;
    actions.push(action);
  }

  const out: ControllerMetadata = {
    target: ctor,
    basePath: merged.basePath,
    type: merged.type,
    responseHandlers: merged.responseHandlers,
    actions,
    useBefore: merged.useBefore ?? [],
    useAfter: merged.useAfter ?? [],
    interceptors: merged.interceptors ?? [],
  };
  if (merged.authorized !== undefined) out.authorized = merged.authorized;
  return out;
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
  // Phase 3: useBefore/useAfter/interceptors concat base-first; authorized last-write-wins.
  const init: ControllerArgs = {
    basePath: '',
    type: 'default',
    responseHandlers: [],
    useBefore: [],
    useAfter: [],
    interceptors: [],
    // authorized: intentionally omitted — undefined means "not decorated"
  };
  for (const c of chain) {
    if (c.basePath) init.basePath = c.basePath;
    init.type = c.type; // last write wins (subclass)
    init.responseHandlers = [...init.responseHandlers, ...c.responseHandlers];
    if (c.useBefore?.length) init.useBefore = [...(init.useBefore ?? []), ...c.useBefore];
    if (c.useAfter?.length) init.useAfter = [...(init.useAfter ?? []), ...c.useAfter];
    if (c.interceptors?.length) init.interceptors = [...(init.interceptors ?? []), ...c.interceptors];
    if (c.authorized !== undefined) init.authorized = c.authorized;
  }
  return init;
}

function mergeMethodChain(proto: object): Map<string | symbol, MethodArgs> {
  // Walk prototype chain base-first; subclass entries do PER-FIELD merge (not whole-record overwrite).
  const chain: object[] = [];
  let current: object | null = proto;
  while (current && current !== Object.prototype) {
    chain.unshift(current); // base first
    current = Object.getPrototypeOf(current);
  }
  const result = new Map<string | symbol, MethodArgs>();
  for (const p of chain) {
    for (const [key, args] of getAllMethodArgs(p)) {
      const existing = result.get(key);
      if (!existing) {
        // First sighting — clone defensively so later concat doesn't mutate storage.
        result.set(key, {
          verb: args.verb,
          path: args.path,
          responseHandlers: [...args.responseHandlers],
          useBefore: args.useBefore ? [...args.useBefore] : undefined,
          useAfter: args.useAfter ? [...args.useAfter] : undefined,
          interceptors: args.interceptors ? [...args.interceptors] : undefined,
          authorized: args.authorized,
          input: args.input,
          returnType: args.returnType,
          paramTypes: args.paramTypes,
        });
        continue;
      }
      // Subclass declared additional metadata for this same method.
      if (args.verb) {
        // BL-03: Subclass re-applied a route decorator — verb/path/input/
        // returnType/paramTypes/responseHandlers REPLACED (not concatenated).
        // Concatenating responseHandlers would emit base-class
        // @HttpCode/@Header/@ContentType in addition to the subclass values,
        // producing duplicate header writes whose visible value depends on
        // header type and last-write-wins ordering. Subclass re-decoration
        // is "I want a fresh route on this method" — the base's
        // route-shape decorators don't apply.
        existing.verb = args.verb;
        existing.path = args.path;
        existing.input = args.input;
        existing.returnType = args.returnType;
        existing.paramTypes = args.paramTypes;
        existing.responseHandlers = [...args.responseHandlers];
      } else if (args.responseHandlers.length) {
        // No new verb — subclass added more response shapers (e.g.,
        // @Header on top of inherited route). These layer onto base.
        existing.responseHandlers = [...existing.responseHandlers, ...args.responseHandlers];
      }
      // Phase 3 hook arrays: ALWAYS concat base-first (no replacement on re-decoration).
      if (args.useBefore?.length) existing.useBefore = [...(existing.useBefore ?? []), ...args.useBefore];
      if (args.useAfter?.length) existing.useAfter = [...(existing.useAfter ?? []), ...args.useAfter];
      if (args.interceptors?.length) existing.interceptors = [...(existing.interceptors ?? []), ...args.interceptors];
      if (args.authorized !== undefined) existing.authorized = args.authorized;
    }
  }
  return result;
}

export const MetadataBuilder = { build: buildMetadata };
