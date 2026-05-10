import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
  type ErrorRequestHandler,
} from 'express';
import { buildMetadata } from '../metadata/builder.js';
import { getContainer } from '../container/use-container.js';
import { createAlsMiddleware } from './request-context.js';
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
import { applyRedirect, applyRender, applyLocation, interpolateTemplate } from './render.js';
import { wrapAction } from './handler-wrapper.js';
import { libraryErrorMiddleware, makeLibraryErrorMiddleware, isErrorMiddlewareInstance } from './error-middleware.js';
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
      // WR-05: ControllerMetadata.target is typed `Function` (the legacy
      // decorator surface). Cast through ClassConstructor<unknown> rather
      // than `as never`.
      const instance = await getContainer().get(
        controllerMeta.target as unknown as import('../types/action.js').ClassConstructor<unknown>,
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

      const controllerClass = (controllerMeta.target ?? { name: 'AnonymousController' }) as { name: string };
      const methodName =
        typeof action.method === 'symbol'
          ? action.method.toString()
          : String(action.method);
      const source = `${controllerClass.name}.${methodName}`;

      // Phase 4 D-05/D-06/D-07: response shaper dispatch.
      // Null/undefined short-circuit (D-13/D-08 step 2) runs INSIDE writeResponse — shapers
      // must be checked AFTER final is resolved (post-interceptor) but BEFORE writeResponse
      // so that shapers override @JsonController serialization (D-08).
      // Per D-09 + Pitfall 8: if final is null/undefined, skip shapers — pass to writeResponse
      // which applies @OnNull/@OnUndefined and returns 204.
      if (final !== null && final !== undefined) {
        if (action.redirect) {
          // D-10: @HttpCode wins, then explicit redirect status, then default 302
          const status = action.responseHandlers.find(h => h.type === 'success-code')
            ? Number(action.responseHandlers.find(h => h.type === 'success-code')!.value)
            : action.redirect.status ?? 302;
          applyRedirect(res, action.redirect.template, status, final, source);
          next();
          return;
        }
        if (action.render) {
          applyRender(res, action.render.template, final, source);
          next();
          return;
        }
        if (action.location) {
          const url = typeof final === 'string'
            ? final
            : typeof final === 'object' && final !== null
              ? interpolateTemplate(action.location.template, final as Record<string, unknown>, source)
              : action.location.template;
          res.location(url);
          // D-07: fall through to writeResponse — body still flows through standard writer
          writeResponse(res, next, final, controllerMeta, action);
          return;
        }
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
  // Phase 4 D-11/D-18: ALS wrapper MUST be the outermost app.use() owned by the library.
  // Mounted BEFORE glob expansion result is used, BEFORE CORS, BEFORE lib globals, BEFORE routers.
  app.use(createAlsMiddleware());

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
  // WR-08: validate that every entry is class-form (constructor with an
  // `intercept` method on its prototype). The public type is
  // ReadonlyArray<ClassConstructor<unknown>>, but force-casting through
  // `unknown` would let a bare function slip through and explode inside
  // resolveInterceptorClasses with a confusing error. Fail fast here.
  const interceptorList = (options.interceptors ?? []) as unknown as Function[];
  for (let idx = 0; idx < interceptorList.length; idx++) {
    const i = interceptorList[idx]!;
    if (typeof i !== 'function' || !('prototype' in i) || (i as { prototype?: unknown }).prototype == null) {
      throw new TypeError(
        `BootOptions.interceptors[${idx}] must be a class constructor.`,
      );
    }
  }
  const resolvedGlobalInterceptors = await resolveInterceptorClasses(interceptorList);

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
    // User error middleware classes (4-arg use) — already resolved above.
    //
    // WR-02: the IMPLICIT-RETURN arrow body below is load-bearing. Express
    // v5 forwards rejections from a returned Promise automatically, but
    // ONLY if the wrapper actually RETURNS the Promise. If a future
    // refactor changes the body to a block (e.g. `(...)=>{ instance.use(...) }`)
    // the rejection silently disappears into UnhandledPromiseRejection.
    // Keep this an arrow with implicit return — do NOT wrap in braces.
    for (const { instance } of userErrorMwInstances) {
      app.use(((err: unknown, req: Request, res: Response, next: NextFunction) =>
        (instance.use as (e: unknown, q: Request, s: Response, n: NextFunction) => unknown)(err, req, res, next)
      ) as ErrorRequestHandler);
    }
    // Library fallback error middleware (always last). WR-03: when the
    // user provides `onLogError`, we mount a factory-built variant so
    // the headers-sent path uses their logger; otherwise the named
    // export (which uses console.error) is mounted.
    if (options.onLogError) {
      app.use(makeLibraryErrorMiddleware({ onLogError: options.onLogError }));
    } else {
      app.use(libraryErrorMiddleware);
    }
  }

  return app;
}

/**
 * Create a fresh Express v5 app, install body-parsers (express.json() and
 * express.urlencoded({extended:true}) per D-02), then mount controllers.
 * Convenience entry point.
 *
 * Phase 3 breaking change: now returns Promise<Express>.
 *
 * Boot order (D-18):
 *   1. app.use(alsMiddleware)              ← installed by useExpressControllers as first call
 *   2. app.use(express.json())             ← body parsers after ALS (not before)
 *   3. app.use(express.urlencoded(...))
 *   4. ... controller routers and error middleware via useExpressControllers
 *
 * Note: body parsers are passed via BootOptions.middlewares as function-form globals
 * so they mount INSIDE useExpressControllers AFTER the ALS wrapper, honoring D-11/D-18.
 */
export async function createExpressServer(options: BootOptions): Promise<Express> {
  const app = express();
  // D-11/D-18: ALS wrapper is the OUTERMOST — body parsers must come AFTER it.
  // We achieve this by passing body parsers as the first global before-middlewares so they
  // are mounted by useExpressControllers AFTER the ALS wrapper.
  const bodyParsers = [
    express.json() as import('express').RequestHandler,
    express.urlencoded({ extended: true }) as import('express').RequestHandler,
  ];
  const mergedMiddlewares = [...bodyParsers, ...(options.middlewares ?? [])];
  return useExpressControllers(app, { ...options, middlewares: mergedMiddlewares });
}
