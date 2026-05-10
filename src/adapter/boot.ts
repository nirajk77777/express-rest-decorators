import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
  type ErrorRequestHandler,
} from 'express';
import { buildMetadata } from '../metadata/builder.js';
import { getContainer } from '../container/use-container.js';
import type {
  ControllerMetadata,
  ActionMetadata,
} from '../types/resolved.js';
import type { BootOptions } from './boot-options.js';
import {
  buildControllerRouter,
  type HandlerFactory,
} from './router-build.js';
import { resolveInputs } from './validation.js';
import { writeResponse } from './response.js';
import { wrapAction } from './handler-wrapper.js';
import { libraryErrorMiddleware, isErrorMiddlewareInstance } from './error-middleware.js';
import { isClassForm, toRequestHandlers, resolveMiddlewareClass } from './middleware.js';
import { resolveInterceptorClasses, runInterceptors } from './interceptor.js';
import { resolveCurrentUser } from './auth.js';
import { getMiddlewareType } from '../metadata/storage.js';
import type { InterceptorInterface } from '../interfaces/interceptor.js';
import type { Action } from '../types/action.js';

/**
 * Build the per-action Express RequestHandler. Composes:
 *   1. resolveInputs(req, action.input, currentUserResolver)  — D-06/D-07/D-10/D-14
 *   2. getContainer().get(controllerMeta.target)              — Phase 1 IocAdapter hook
 *   3. instance[action.method]({...args, req, res, next})     — INPUT-01 destructured shape
 *   4. D-08 short-circuit: skip interceptors on null/undefined
 *   5. runInterceptors(resolvedInterceptors, action, result)  — Phase 3
 *   6. writeResponse(res, next, final, ...)                   — D-11/D-12/D-13
 * Wrapped by wrapAction() for source-attribution + native v5 forwarding (D-16).
 */
function makeHandlerFactory(options: BootOptions): HandlerFactory {
  return (
    controllerMeta: ControllerMetadata,
    action: ActionMetadata,
    resolvedInterceptors: ReadonlyArray<InterceptorInterface>,
  ) => {
    const invokeAction = async (
      req: Request,
      res: Response,
      next: NextFunction,
    ) => {
      const actionObj: Action = { request: req, response: res, next };

      // D-14: optional currentUser resolver — lazy + cached per request (auth.ts)
      const currentUserResolver = options.currentUserChecker
        ? () => resolveCurrentUser(req, options.currentUserChecker!, actionObj)
        : undefined;

      const args = await resolveInputs(req, action.input, currentUserResolver);
      const instance = await getContainer().get(
        controllerMeta.target as never,
      );
      const handlerArgs = { ...args, req, res, next };
      const target = instance as Record<
        string | symbol,
        ((a: unknown) => unknown) | undefined
      >;
      const fn = target[action.method];
      if (typeof fn !== 'function') {
        throw new Error(
          `[${controllerMeta.target.name}.${String(action.method)}] handler is not a function on controller instance`,
        );
      }
      const result = await fn.call(instance, handlerArgs);

      // D-08 short-circuit: skip interceptors on null/undefined
      let final: unknown = result;
      if (result !== null && result !== undefined && resolvedInterceptors.length > 0) {
        final = await runInterceptors(resolvedInterceptors, actionObj, result);
      }

      writeResponse(res, next, final, controllerMeta, action);
    };
    return wrapAction(controllerMeta, action, invokeAction);
  };
}

/**
 * Mount controllers on an existing Express v5 app. Body parsing is the caller's
 * responsibility — this function does NOT install express.json() (D-02 asymmetry).
 *
 * Mounting order (D-01):
 *   1. Global @Middleware({type:'before'}) and function-form entries → app.use(...)
 *   2. One express.Router() per controller → app.use(mountPath, router)
 *   3. Global @Middleware({type:'after'}) non-error instances → app.use(...)
 *   4. User error middleware (4-arg use) → app.use(errorHandler) [if defaultErrorHandler !== false]
 *   5. libraryErrorMiddleware → app.use(libraryErrorMiddleware) [if defaultErrorHandler !== false]
 *
 * This function is now async (Phase 3 breaking change):
 * - Container.get() may return a Promise
 * - Arity detection for user error middleware requires resolving the class at boot
 * - Global interceptor resolution happens once before the controller loop
 *
 * @returns Promise<Express> — the same `app`, for chaining.
 */
export async function useExpressControllers(
  app: Express,
  options: BootOptions,
): Promise<Express> {
  const controllers = buildMetadata(
    options.controllers as unknown as Function[],
  );
  const routePrefix = options.routePrefix ?? '';

  // ── Step 1: Partition global middleware ──────────────────────────────────
  // class-form entries: split by getMiddlewareType() → before / after
  // function-form entries: default to before (documented in README)
  const globalBeforeEntries: Function[] = [];
  const globalAfterClassEntries: Function[] = [];

  for (const mw of options.middlewares ?? []) {
    if (isClassForm(mw)) {
      const mwType = getMiddlewareType(mw as Function);
      if (mwType === 'after') {
        globalAfterClassEntries.push(mw as Function);
      } else {
        // 'before' or undecorated class-form → default to before
        globalBeforeEntries.push(mw as Function);
      }
    } else {
      // function-form → before by default
      globalBeforeEntries.push(mw as Function);
    }
  }

  // Resolve after-group to determine error vs non-error partition
  const resolvedAfterEntries = await Promise.all(
    globalAfterClassEntries.map(async (cls) => {
      const resolved = await resolveMiddlewareClass(cls);
      return { cls, resolved };
    }),
  );

  const globalAfterNonErrorClasses: Function[] = [];
  const userErrorMwInstances: { instance: { use: Function } }[] = [];

  for (const { cls, resolved } of resolvedAfterEntries) {
    if (isErrorMiddlewareInstance(resolved.instance)) {
      userErrorMwInstances.push(resolved);
    } else {
      globalAfterNonErrorClasses.push(cls);
    }
  }

  // ── Step 2: Mount global before middleware ───────────────────────────────
  const beforeHandlers = await toRequestHandlers(globalBeforeEntries);
  if (beforeHandlers.length > 0) {
    app.use(...(beforeHandlers as [typeof beforeHandlers[0], ...typeof beforeHandlers]));
  }

  // ── Step 3: Resolve global interceptors ONCE before controller loop ───────
  const resolvedGlobalInterceptors = await resolveInterceptorClasses(
    (options.interceptors ?? []) as unknown as Function[],
  );

  // ── Step 4: Mount controller routers ────────────────────────────────────
  const factory = makeHandlerFactory(options);

  for (const controllerMeta of controllers) {
    const { router, mountPath } = await buildControllerRouter(controllerMeta, {
      routePrefix,
      handlerFactory: factory,
      globalInterceptors: resolvedGlobalInterceptors,
      authChecker: options.authorizationChecker,
      currentUserChecker: options.currentUserChecker,
    });
    app.use(mountPath, router);
  }

  // ── Step 5: Mount global after (non-error) middleware ────────────────────
  const afterNonErrorHandlers = await toRequestHandlers(globalAfterNonErrorClasses);
  if (afterNonErrorHandlers.length > 0) {
    app.use(...(afterNonErrorHandlers as [typeof afterNonErrorHandlers[0], ...typeof afterNonErrorHandlers]));
  }

  // ── Step 6: Mount user error middleware + library fallback ───────────────
  if (options.defaultErrorHandler !== false) {
    // User error middleware classes (4-arg use) — already resolved above
    for (const { instance } of userErrorMwInstances) {
      app.use(((err: unknown, req: Request, res: Response, next: NextFunction) =>
        (instance.use as (e: unknown, q: Request, s: Response, n: NextFunction) => unknown)(err, req, res, next)
      ) as ErrorRequestHandler);
    }
    // Library fallback error middleware (always last)
    app.use(libraryErrorMiddleware);
  }

  return app;
}

/**
 * Create a fresh Express v5 app, install body-parsers (express.json() and
 * express.urlencoded({extended:true}) per D-02), then mount controllers.
 * Convenience entry point — equivalent to:
 *
 *   const app = express();
 *   app.use(express.json());
 *   app.use(express.urlencoded({ extended: true }));
 *   await useExpressControllers(app, options);
 *
 * Phase 3 breaking change: now returns Promise<Express>.
 */
export async function createExpressServer(options: BootOptions): Promise<Express> {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  return useExpressControllers(app, options);
}
