import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { getContainer } from '../container/use-container.js';
import type { ClassConstructor } from '../types/action.js';

/**
 * D-06: distinguishes function-form from class-form middleware.
 *
 * Heuristic: a class-form middleware MUST have a `use` method on its
 * prototype. Plain `function`-declared Express middleware
 * (`function mw(req,res,next){}`) ALSO has a non-null `.prototype` in JS
 * (every non-arrow, non-bound function does), so a bare `prototype !==
 * undefined` check would misclassify them as class-form. We narrow the
 * probe to "prototype exists AND has a callable `use` member", which
 * matches the `ExpressMiddlewareInterface` / `ExpressErrorMiddlewareInterface`
 * contract that class-form middleware must implement.
 */
export function isClassForm(arg: unknown): boolean {
  if (typeof arg !== 'function') return false;
  const proto = (arg as { prototype?: unknown }).prototype;
  if (proto === undefined || proto === null) return false;
  return typeof (proto as { use?: unknown }).use === 'function';
}

export interface ResolvedMiddleware {
  instance: { use: Function };
  useFn: Function;
}

export async function resolveMiddlewareClass(cls: Function): Promise<ResolvedMiddleware> {
  // WR-05: cast through ClassConstructor<unknown> rather than `as never`.
  // The runtime accepts both class constructors and (incorrectly) bare
  // functions; isClassForm ensures the function actually has a use()
  // method on its prototype, so newing it inside DefaultContainer is safe.
  const instance = await Promise.resolve(
    getContainer().get(cls as unknown as ClassConstructor<unknown>),
  );
  const useFn = (instance as { use?: unknown }).use;
  if (typeof useFn !== 'function') {
    throw new Error(
      `[${cls.name || 'AnonymousMiddleware'}] Class-form middleware must implement a use() method. ` +
        `Check that ${cls.name || 'this class'} implements ExpressMiddlewareInterface.`,
    );
  }
  return { instance: instance as { use: Function }, useFn: useFn as Function };
}

/**
 * Convert a hook-entry array (mix of function-form and class-form) into a flat array
 * of RequestHandlers ready to spread into router.METHOD(path, ...handlers).
 * Class instances are resolved once at compose time and closed over per D-05.
 */
export async function toRequestHandlers(hooks: ReadonlyArray<Function>): Promise<RequestHandler[]> {
  const out: RequestHandler[] = [];
  for (const hook of hooks) {
    if (isClassForm(hook)) {
      const { instance } = await resolveMiddlewareClass(hook);
      const handler: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
        // Native v5 forwarding — return the (possibly Promise) result so any
        // returned Promise auto-forwards rejections via Express v5.
        return (instance.use as (r: Request, s: Response, n: NextFunction) => unknown)(req, res, next);
      };
      out.push(handler);
    } else {
      out.push(hook as RequestHandler);
    }
  }
  return out;
}
