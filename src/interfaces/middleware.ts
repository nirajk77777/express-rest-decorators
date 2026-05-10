import type { Request, Response, NextFunction } from 'express';

/** D-04 — class-form middleware contract for @UseBefore / @UseAfter / global @Middleware (non-error). */
export interface ExpressMiddlewareInterface {
  use(req: Request, res: Response, next: NextFunction): void | Promise<void>;
}

/** D-15 — class-form ERROR middleware contract; mounted iff use.length === 4. */
export interface ExpressErrorMiddlewareInterface {
  use(err: unknown, req: Request, res: Response, next: NextFunction): void | Promise<void>;
}
