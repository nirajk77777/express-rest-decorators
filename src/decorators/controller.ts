import { getOrInitControllerArgs } from '../metadata/storage.js';

export function Controller(basePath = ''): ClassDecorator {
  return function (target: Function): void {
    const meta = getOrInitControllerArgs(target);
    meta.basePath = basePath;
    meta.type = 'default';
  };
}

export function JsonController(basePath = ''): ClassDecorator {
  return function (target: Function): void {
    const meta = getOrInitControllerArgs(target);
    meta.basePath = basePath;
    meta.type = 'json';
  };
}
