import type { Request, Response, NextFunction } from 'express';
import { HttpError } from '../errors/http-error.js';

/**
 * The single library-installed Express error middleware (D-15). Mounted automatically
 * by useExpressControllers AFTER all controller routers when defaultErrorHandler !== false.
 *
 * Phase 3 will mount user @Middleware({ type: 'after' }) error handlers AHEAD of this one
 * (ERR-04). This middleware is therefore the *fallback* / *last-line* handler.
 *
 * D-14 — checks res.headersSent first; if true, destroys the socket and does NOT
 * attempt a second body write (avoids ERR_HTTP_HEADERS_SENT, RESEARCH Pitfall B).
 * D-18 — HttpError → toJSON; non-HttpError → generic 500 envelope; dev disclosure
 * adds stack + _devMessage when NODE_ENV !== 'production'.
 */
export function libraryErrorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // D-14 / Pitfall B
  if (res.headersSent) {
    // eslint-disable-next-line no-console
    console.error('[express-controllers] error after headers sent:', err);
    res.destroy(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  const isProd = process.env.NODE_ENV === 'production';

  // D-18 — HttpError branch
  if (err instanceof HttpError) {
    const body = err.toJSON();
    if (!isProd && err.stack) {
      (body as Record<string, unknown>).stack = err.stack;
    }
    res.status(err.status).json(body);
    return;
  }

  // D-18 — non-HttpError branch (no message leak in production)
  const source =
    err && typeof err === 'object' && 'source' in err
      ? (err as { source?: unknown }).source
      : undefined;

  const body: Record<string, unknown> = {
    status: 500,
    name: 'InternalServerError',
    message: 'Internal Server Error',
  };
  if (typeof source === 'string') body.source = source;

  if (!isProd) {
    if (err instanceof Error) {
      body.stack = err.stack;
      body._devMessage = err.message;
    }
  }

  res.status(500).json(body);
}
