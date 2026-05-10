import { getOrInitMethodArgs, setRenderMeta, setRedirectMeta, setLocationMeta } from '../metadata/storage.js';

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

/**
 * @Render(template) — calls res.render(template, locals) with handler's return value as locals.
 * Pure registrar — no Reflect.defineMetadata.
 */
export function Render(template: string): MethodDecorator {
  return function (target: object, propertyKey: string | symbol): void {
    setRenderMeta(target, propertyKey, { template });
  };
}

/**
 * @Redirect(template, status?) — issues a 3xx redirect. Default 302.
 * String return overrides; object return interpolates :name placeholders; undefined uses bare template.
 * Pure registrar — no Reflect.defineMetadata.
 */
export function Redirect(template: string, status?: number): MethodDecorator {
  return function (target: object, propertyKey: string | symbol): void {
    setRedirectMeta(target, propertyKey, { template, status });
  };
}

/**
 * @Location(template) — sets the Location response header. Status defaults to 200.
 * Body still flows through writeResponse.
 * Pure registrar — no Reflect.defineMetadata.
 */
export function Location(template: string): MethodDecorator {
  return function (target: object, propertyKey: string | symbol): void {
    setLocationMeta(target, propertyKey, { template });
  };
}
