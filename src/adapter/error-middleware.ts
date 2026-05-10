import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { HttpError } from '../errors/http-error.js';

/**
 * Optional logger used when an error arrives after `res.headersSent`.
 * If omitted, the library falls back to `console.error`. WR-03 — gives
 * consumers in quiet logging environments (lambda, structured-log
 * daemons) an opt-out / redirect.
 */
export type ErrorAfterHeadersLogger = (err: unknown) => void;

/**
 * Detect whether a class-form @Middleware instance should be mounted as
 * Express ERROR middleware. Express's own algorithm — fn.length === 4. The
 * Pitfall 2 footgun (use = (...args) => {}) is the user's responsibility;
 * we may surface a runtime warning in a future iteration.
 */
export function isErrorMiddlewareInstance(instance: unknown): boolean {
  if (instance === null || typeof instance !== 'object') return false;
  const useFn = (instance as { use?: unknown }).use;
  if (typeof useFn !== 'function') return false;
  return useFn.length === 4;
}

/**
 * The single library-installed Express error middleware. Mounted automatically
 * by useExpressControllers AFTER all controller routers when defaultErrorHandler !== false.
 *
 * User @Middleware({ type: 'after' }) error handlers are mounted AHEAD of this one.
 * This middleware is therefore the *fallback* / *last-line* handler.
 *
 * Checks res.headersSent first; if true, destroys the socket and does NOT
 * attempt a second body write (avoids ERR_HTTP_HEADERS_SENT, RESEARCH Pitfall B).
 * HttpError → toJSON; non-HttpError → generic 500 envelope; dev disclosure
 * adds stack + _devMessage when NODE_ENV !== 'production'.
 */
/**
 * WR-03: factory variant. Produces a libraryErrorMiddleware bound to a
 * caller-supplied logger for the headers-sent path. `useExpressControllers`
 * uses this when `BootOptions.onLogError` is set; otherwise the
 * `libraryErrorMiddleware` named export below (which uses `console.error`)
 * is mounted directly.
 */
export function makeLibraryErrorMiddleware(
  opts: { onLogError?: ErrorAfterHeadersLogger } = {},
): ErrorRequestHandler {
  const log: ErrorAfterHeadersLogger =
    opts.onLogError ??
    ((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[express-controllers] error after headers sent:', err);
    });
  return function libraryErrorMiddlewareInstance(
    err: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction,
  ): void {
    // Pitfall B: headers-sent guard
    if (res.headersSent) {
      log(err);
      res.destroy(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    writeErrorBody(err, res);
  };
}

export function libraryErrorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Pitfall B: headers-sent guard
  if (res.headersSent) {
    // eslint-disable-next-line no-console
    console.error('[express-controllers] error after headers sent:', err);
    res.destroy(err instanceof Error ? err : new Error(String(err)));
    return;
  }
  writeErrorBody(err, res);
}

/** Shared response-writing path between the named export and the factory. */
function writeErrorBody(err: unknown, res: Response): void {

  const isProd = process.env.NODE_ENV === 'production';

  // HttpError branch
  if (err instanceof HttpError) {
    const body = err.toJSON();
    if (!isProd && err.stack) {
      (body as Record<string, unknown>).stack = err.stack;
    }
    res.status(err.status).json(body);
    return;
  }

  // Non-HttpError branch (no message leak in production)
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
