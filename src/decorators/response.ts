import { getOrInitMethodArgs } from '../metadata/storage.js';

export function HttpCode(code: number): MethodDecorator {
  return function (target: object, propertyKey: string | symbol): void {
    getOrInitMethodArgs(target, propertyKey).responseHandlers.push({
      type: 'success-code',
      value: code,
    });
  };
}

export function OnNull(code: number): MethodDecorator {
  return function (target: object, propertyKey: string | symbol): void {
    getOrInitMethodArgs(target, propertyKey).responseHandlers.push({
      type: 'null-result-code',
      value: code,
    });
  };
}

export function OnUndefined(code: number): MethodDecorator {
  return function (target: object, propertyKey: string | symbol): void {
    getOrInitMethodArgs(target, propertyKey).responseHandlers.push({
      type: 'undefined-result-code',
      value: code,
    });
  };
}

export function Header(name: string, value: string): MethodDecorator {
  return function (target: object, propertyKey: string | symbol): void {
    getOrInitMethodArgs(target, propertyKey).responseHandlers.push({
      type: 'header',
      value: name,
      secondaryValue: value,
    });
  };
}

export function ContentType(value: string): MethodDecorator {
  return function (target: object, propertyKey: string | symbol): void {
    getOrInitMethodArgs(target, propertyKey).responseHandlers.push({
      type: 'content-type',
      value,
    });
  };
}
