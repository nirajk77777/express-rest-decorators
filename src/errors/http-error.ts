export interface HttpErrorOptions {
  cause?: unknown;
}

export type ValidationSlot = 'params' | 'query' | 'body' | 'headers';

export interface ValidationIssue {
  /**
   * Which input slot the issue originated from.
   * Optional for backward compatibility; Phase 2 always populates it.
   */
  slot?: ValidationSlot;
  /**
   * Path to the offending field. Phase 2 emits a rendered string (e.g. "items[0].name");
   * pre-Phase-2 callers may pass a ReadonlyArray<PropertyKey>. Both shapes are accepted.
   */
  path: string | ReadonlyArray<PropertyKey>;
  message: string;
}

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message?: string, options?: HttpErrorOptions) {
    super(message, options); // ES2022: { cause } passed through to Error
    this.name = this.constructor.name;
    this.status = status;
    // Pitfall 1: maintain prototype chain across CJS/ESM boundaries
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
    };
  }
}
