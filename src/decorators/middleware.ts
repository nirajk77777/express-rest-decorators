import {
  getOrInitControllerArgs,
  getOrInitMethodArgs,
  markAsMiddleware,
  markAsInterceptor,
} from '../metadata/storage.js';

// ─── UseBefore ─────────────────────────────────────────────────────────────

/**
 * Attaches request-handler(s) to run BEFORE the route handler.
 * Accepts both function-form (RequestHandler) and class-form (implements ExpressMiddlewareInterface).
 * Multiple decorators append left-to-right.
 */
export function UseBefore(...handlers: Function[]): ClassDecorator & MethodDecorator {
  return function (
    target: object,
    key?: string | symbol,
    _desc?: PropertyDescriptor,
  ): void {
    const meta =
      key === undefined
        ? getOrInitControllerArgs(target as Function)
        : getOrInitMethodArgs(target, key);
    meta.useBefore = [...(meta.useBefore ?? []), ...handlers];
  } as ClassDecorator & MethodDecorator;
}

// ─── UseAfter ──────────────────────────────────────────────────────────────

/**
 * Attaches request-handler(s) to run AFTER the route handler.
 * Multiple decorators append left-to-right.
 */
export function UseAfter(...handlers: Function[]): ClassDecorator & MethodDecorator {
  return function (
    target: object,
    key?: string | symbol,
    _desc?: PropertyDescriptor,
  ): void {
    const meta =
      key === undefined
        ? getOrInitControllerArgs(target as Function)
        : getOrInitMethodArgs(target, key);
    meta.useAfter = [...(meta.useAfter ?? []), ...handlers];
  } as ClassDecorator & MethodDecorator;
}

// ─── UseInterceptor ────────────────────────────────────────────────────────

/**
 * Attaches interceptor class(es) to run AFTER the handler returns and BEFORE serialization.
 * Multiple decorators append left-to-right.
 */
export function UseInterceptor(...interceptors: Function[]): ClassDecorator & MethodDecorator {
  return function (
    target: object,
    key?: string | symbol,
    _desc?: PropertyDescriptor,
  ): void {
    const meta =
      key === undefined
        ? getOrInitControllerArgs(target as Function)
        : getOrInitMethodArgs(target, key);
    meta.interceptors = [...(meta.interceptors ?? []), ...interceptors];
  } as ClassDecorator & MethodDecorator;
}

// ─── Middleware ─────────────────────────────────────────────────────────────

/**
 * Marks a class as a global middleware (before or after).
 * The class must implement ExpressMiddlewareInterface (or ExpressErrorMiddlewareInterface for after).
 * Throws TypeError at decoration time if type is invalid.
 */
export function Middleware(opts: { type: 'before' | 'after' }): ClassDecorator {
  if (opts.type !== 'before' && opts.type !== 'after') {
    throw new TypeError(
      `@Middleware: type must be 'before' or 'after', got ${String(opts.type)}`,
    );
  }
  return function (target: Function): void {
    markAsMiddleware(target, opts.type);
  };
}

// ─── Interceptor ───────────────────────────────────────────────────────────

/**
 * Marks a class as a global interceptor.
 * The class must implement InterceptorInterface.
 */
export function Interceptor(): ClassDecorator {
  return function (target: Function): void {
    markAsInterceptor(target);
  };
}

// ─── Authorized ────────────────────────────────────────────────────────────

/**
 * Restricts access to the decorated class or method.
 * @Authorized() — any authenticated user (authorized === null)
 * @Authorized('admin') — must have 'admin' role
 * @Authorized(['a', 'b']) — must have 'a' or 'b' role
 * Last-write-wins on the same target.
 */
export function Authorized(): ClassDecorator & MethodDecorator;
export function Authorized(role: string): ClassDecorator & MethodDecorator;
export function Authorized(roles: string[]): ClassDecorator & MethodDecorator;
export function Authorized(
  roleOrRoles?: string | string[],
): ClassDecorator & MethodDecorator {
  const normalized: string[] | null =
    roleOrRoles === undefined
      ? null
      : Array.isArray(roleOrRoles)
        ? [...roleOrRoles]
        : [roleOrRoles];

  return function (
    target: object,
    key?: string | symbol,
    _desc?: PropertyDescriptor,
  ): void {
    const meta =
      key === undefined
        ? getOrInitControllerArgs(target as Function)
        : getOrInitMethodArgs(target, key);
    meta.authorized = normalized;
  } as ClassDecorator & MethodDecorator;
}
