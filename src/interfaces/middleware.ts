import type { Request, Response, NextFunction } from 'express';

/** Class-form middleware contract for @UseBefore / @UseAfter / global @Middleware (non-error). */
export interface ExpressMiddlewareInterface {
  use(req: Request, res: Response, next: NextFunction): void | Promise<void>;
}

/** Class-form ERROR middleware contract; mounted iff use.length === 4. */
export interface ExpressErrorMiddlewareInterface {
  use(err: unknown, req: Request, res: Response, next: NextFunction): void | Promise<void>;
}
