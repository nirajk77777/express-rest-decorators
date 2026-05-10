import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

export interface RequestContext {
  req: Request;
  res: Response;
  requestId: string;
}

// Module-scoped singleton — one per process, not per app. Multi-app scenarios
// are safe because als.run() scopes stores per request, not per ALS instance.
const als = new AsyncLocalStorage<RequestContext>();

/**
 * Express middleware that initializes the ALS context for each request.
 * Must be the outermost app.use() call (D-11).
 * - requestId from X-Request-Id header (verbatim, trimmed) if present and non-empty
 * - Falls back to crypto.randomUUID() (D-12)
 */
export function createAlsMiddleware(): RequestHandler {
  return function alsMiddleware(req: Request, res: Response, next: NextFunction): void {
    const headerVal = req.headers['x-request-id'];
    const fromHeader = typeof headerVal === 'string' ? headerVal.trim() : '';
    const requestId = fromHeader.length > 0 ? fromHeader : randomUUID();
    als.run({ req, res, requestId }, () => next());
  };
}

/**
 * Returns the current request context (req, res, requestId).
 * Throws an actionable error when called outside an active request scope (D-14).
 */
export function getRequestContext(): RequestContext {
  const store = als.getStore();
  if (!store) {
    throw new Error(
      'getRequestContext() called outside an active request scope — ensure useExpressControllers() is mounted on the app before this code runs.',
    );
  }
  return store;
}
