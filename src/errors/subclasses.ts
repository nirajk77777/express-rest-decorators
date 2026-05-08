import { HttpError, type HttpErrorOptions, type ValidationIssue } from './http-error.js';

export class BadRequestError extends HttpError {
  readonly details?: ReadonlyArray<ValidationIssue>;
  readonly source?: string;

  constructor(
    message = 'Bad Request',
    options?: HttpErrorOptions & { details?: ReadonlyArray<ValidationIssue>; source?: string }
  ) {
    super(400, message, options);
    if (options?.details !== undefined) this.details = options.details;
    if (options?.source !== undefined) this.source = options.source;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  override toJSON(): Record<string, unknown> {
    const base = super.toJSON();
    return {
      ...base,
      ...(this.details !== undefined ? { details: this.details } : {}),
      ...(this.source !== undefined ? { source: this.source } : {}),
    };
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized', options?: HttpErrorOptions) {
    super(401, message, options);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden', options?: HttpErrorOptions) {
    super(403, message, options);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not Found', options?: HttpErrorOptions) {
    super(404, message, options);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class MethodNotAllowedError extends HttpError {
  constructor(message = 'Method Not Allowed', options?: HttpErrorOptions) {
    super(405, message, options);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ConflictError extends HttpError {
  constructor(message = 'Conflict', options?: HttpErrorOptions) {
    super(409, message, options);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InternalServerError extends HttpError {
  constructor(message = 'Internal Server Error', options?: HttpErrorOptions) {
    super(500, message, options);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
