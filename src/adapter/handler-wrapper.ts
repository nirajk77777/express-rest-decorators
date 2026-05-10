import type { RequestHandler, Request, Response, NextFunction } from 'express';
import type { ControllerMetadata, ActionMetadata } from '../types/resolved.js';

export type InvokeAction = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

/**
 * This wrapper exists ONLY to attach err.source before forwarding.
 * Express v5 already auto-forwards async rejections; this wrapper is the single
 * source-attribution point. NO additional try/catch elsewhere in the pipeline
 * (RESEARCH Pitfall A).
 */
export function wrapAction(
  controllerMeta: ControllerMetadata,
  actionMeta: ActionMetadata,
  invokeAction: InvokeAction
): RequestHandler {
  const source = `${controllerMeta.target.name}.${String(actionMeta.method)}`;
  return async (req, res, next) => {
    try {
      await invokeAction(req, res, next);
    } catch (rawErr) {
      const err =
        rawErr === null || rawErr === undefined
          ? new Error('Non-error value thrown from handler')
          : rawErr;
      if (err && typeof err === 'object' && !('source' in err)) {
        (err as { source?: string }).source = source;
      }
      next(err);
    }
  };
}
