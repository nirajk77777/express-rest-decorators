import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
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
import { libraryErrorMiddleware } from './error-middleware.js';

/**
 * Build the per-action Express RequestHandler. Composes:
 *   1. resolveInputs(req, action.input)              — D-06/D-07/D-10
 *   2. getContainer().get(controllerMeta.target)     — Phase 1 IocAdapter hook
 *   3. instance[action.method]({...args, req, res, next})  — INPUT-01 destructured shape
 *   4. writeResponse(res, next, result, ...)         — D-11/D-12/D-13
 * Wrapped by wrapAction() for source-attribution + native v5 forwarding (D-16).
 */
function makeHandlerFactory(): HandlerFactory {
  return (controllerMeta: ControllerMetadata, action: ActionMetadata) => {
    const invokeAction = async (
      req: Request,
      res: Response,
      next: NextFunction,
    ) => {
      const args = await resolveInputs(req, action.input);
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
      writeResponse(res, next, result, controllerMeta, action);
    };
    return wrapAction(controllerMeta, action, invokeAction);
  };
}

/**
 * Mount controllers on an existing Express v5 app. Body parsing is the caller's
 * responsibility — this function does NOT install express.json() (D-02 asymmetry).
 *
 * Mounting order (D-15):
 *   1. one express.Router() per controller, app.use(mountPath, router)
 *   2. libraryErrorMiddleware (skipped if options.defaultErrorHandler === false)
 *
 * Phase 3 may insert user middleware (@Middleware({type:'after'})) AHEAD of
 * libraryErrorMiddleware in a future change; mounting position chosen for that.
 *
 * @returns the same `app`, for chaining.
 */
export function useExpressControllers(
  app: Express,
  options: BootOptions,
): Express {
  const controllers = buildMetadata(
    options.controllers as unknown as Function[],
  );
  const routePrefix = options.routePrefix ?? '';
  const factory = makeHandlerFactory();

  for (const controllerMeta of controllers) {
    const { router, mountPath } = buildControllerRouter(
      controllerMeta,
      routePrefix,
      factory,
    );
    app.use(mountPath, router);
  }

  if (options.defaultErrorHandler !== false) {
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
 *   useExpressControllers(app, options);
 */
export function createExpressServer(options: BootOptions): Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  return useExpressControllers(app, options);
}
