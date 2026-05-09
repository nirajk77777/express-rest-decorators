import 'reflect-metadata';
import { getOrInitMethodArgs } from '../metadata/storage.js';
import type { InputDeclaration } from '../metadata/types.js';

function makeRouteDecorator(verb: string) {
  return function (path = '', input?: InputDeclaration): MethodDecorator {
    return function (
      target: object,
      propertyKey: string | symbol,
      _descriptor: PropertyDescriptor
    ): void {
      const returnType: Function | undefined = Reflect.getMetadata(
        'design:returntype',
        target,
        propertyKey
      );
      const paramTypes: Function[] | undefined = Reflect.getMetadata(
        'design:paramtypes',
        target,
        propertyKey
      );
      const meta = getOrInitMethodArgs(target, propertyKey);
      meta.verb = verb;
      meta.path = path;
      if (input !== undefined) meta.input = input;
      if (returnType !== undefined) meta.returnType = returnType;
      if (paramTypes !== undefined) meta.paramTypes = paramTypes;
    };
  };
}

export const Get = makeRouteDecorator('get');
export const Post = makeRouteDecorator('post');
export const Put = makeRouteDecorator('put');
export const Patch = makeRouteDecorator('patch');
export const Delete = makeRouteDecorator('delete');
export const Head = makeRouteDecorator('head');
export const All = makeRouteDecorator('all');

export function Method(
  verb: string,
  path = '',
  input?: InputDeclaration
): MethodDecorator {
  return function (
    target: object,
    propertyKey: string | symbol,
    _descriptor: PropertyDescriptor
  ): void {
    const returnType: Function | undefined = Reflect.getMetadata(
      'design:returntype',
      target,
      propertyKey
    );
    const paramTypes: Function[] | undefined = Reflect.getMetadata(
      'design:paramtypes',
      target,
      propertyKey
    );
    const meta = getOrInitMethodArgs(target, propertyKey);
    meta.verb = verb.toLowerCase();
    meta.path = path;
    if (input !== undefined) meta.input = input;
    if (returnType !== undefined) meta.returnType = returnType;
    if (paramTypes !== undefined) meta.paramTypes = paramTypes;
  };
}
