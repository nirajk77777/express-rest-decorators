export interface HttpErrorOptions {
  cause?: unknown;
}

export interface ValidationIssue {
  path: ReadonlyArray<PropertyKey>;
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
