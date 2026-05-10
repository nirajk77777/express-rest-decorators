import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { Action } from '../types/action.js';
import type { AuthorizationChecker, CurrentUserChecker } from './boot-options.js';
import { UnauthorizedError, ForbiddenError } from '../errors/subclasses.js';

export const CURRENT_USER_KEY = Symbol('express-controllers/currentUser');

export async function resolveCurrentUser(
  req: Request,
  checker: CurrentUserChecker,
  action: Action,
): Promise<unknown> {
  const reqAny = req as unknown as Record<symbol, unknown>;
  if (CURRENT_USER_KEY in reqAny) return reqAny[CURRENT_USER_KEY];
  const user = await Promise.resolve(checker(action));
  reqAny[CURRENT_USER_KEY] = user;
  return user;
}

export function makeAuthGate(
  authorized: string[] | null | undefined,
  authChecker: AuthorizationChecker | undefined,
  currentUserChecker: CurrentUserChecker | undefined,
): RequestHandler | null {
  if (authorized === undefined) return null;
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const action: Action = { request: req, response: res, next };
    try {
      if (!authChecker) {
        next(new UnauthorizedError());
        return;
      }
      if (currentUserChecker) {
        const user = await resolveCurrentUser(req, currentUserChecker, action);
        // 401 for null/undefined/other falsy values, EXCEPT exactly `false`
        // `false` is reserved for the authChecker's vocabulary — treat as "explicit false,
        // not no-user-found", so flow continues to authChecker.
        if (!user && user !== false) {
          next(new UnauthorizedError());
          return;
        }
      }
      const ok = await Promise.resolve(authChecker(action, authorized ?? undefined));
      if (ok === false) {
        next(new ForbiddenError());
        return;
      }
      next();
    } catch (err) {
      // Escape hatch: user-thrown HttpError or any error flows unchanged
      next(err as Error);
    }
  };
}
