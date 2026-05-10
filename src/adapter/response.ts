import { Readable } from 'node:stream';
import type { NextFunction, Response } from 'express';
import type { ResponseHandlerArgs } from '../metadata/types.js';
import type {
  ActionMetadata,
  ControllerMetadata,
} from '../types/resolved.js';

/**
 * Apply response-shaper metadata (`@HttpCode`/`@Header`/`@ContentType`)
 * to the response. Handlers run controller-first, then action — Express
 * `res.status` / `res.set` / `res.type` are last-write-wins, so action-level
 * decorators override controller-level ones for the same header/status.
 *
 * `null-result-code` and `undefined-result-code` are NOT applied here —
 * `writeResponse` handles them in the null/undefined branch.
 */
export function applyResponseHandlers(
  res: Response,
  controllerHandlers: ReadonlyArray<ResponseHandlerArgs>,
  actionHandlers: ReadonlyArray<ResponseHandlerArgs>,
): void {
  for (const h of [...controllerHandlers, ...actionHandlers]) {
    switch (h.type) {
      case 'success-code':
        res.status(Number(h.value));
        break;
      case 'header':
        // The decorator stores `name` in `value` and the header value in `secondaryValue`.
        res.set(String(h.value), String(h.secondaryValue ?? ''));
        break;
      case 'content-type':
        res.type(String(h.value));
        break;
      case 'null-result-code':
      case 'undefined-result-code':
        // Handled in writeResponse — intentional no-op here.
        break;
      // WR-07: exhaustiveness check — if a future ResponseHandlerType
      // is added without updating this switch, this assignment fails
      // typecheck. Cast through `unknown` because the case lists above
      // narrow to `never` at runtime, which is the desired property,
      // but TS may still see the union if the type is widened.
      default: {
        const _exhaust: never = h.type as never;
        void _exhaust;
        break;
      }
    }
  }
}

interface PipeLike {
  pipe: (dest: NodeJS.WritableStream) => unknown;
  on: (ev: string, cb: (e: unknown) => void) => unknown;
}

function isStreamLike(v: unknown): v is PipeLike {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as { pipe?: unknown }).pipe === 'function'
  );
}

function isAsyncIterable(v: unknown): v is AsyncIterable<unknown> {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] ===
      'function'
  );
}

function findCode(
  handlers: ReadonlyArray<ResponseHandlerArgs>,
  type: ResponseHandlerArgs['type'],
): number | undefined {
  const found = handlers.find((h) => h.type === type);
  return found ? Number(found.value) : undefined;
}

/**
 * Forward a stream/iterable error to the library's error middleware via `next`.
 * Attaches `err.source = ${ControllerClass.name}.${methodName}` only if it is
 * not already set, mirroring the action wrapper's behavior so that custom
 * upstream attributions survive.
 *
 * If headers were already sent we cannot send a second body — destroy the
 * response so Node closes the socket; the lib error middleware skips writing
 * (headersSent guard).
 */
function forwardStreamError(
  res: Response,
  next: NextFunction,
  source: string,
  err: unknown,
): void {
  const e = (err instanceof Error ? err : new Error(String(err))) as Error & {
    source?: string;
  };
  if (e.source === undefined) {
    e.source = source;
  }
  if (res.headersSent) {
    res.destroy(e);
  } else {
    next(e);
  }
}

/**
 * Write a handler's return value to the response.
 *
 *  1. Apply response shapers (HttpCode/Header/ContentType).
 *  2. `null` / `undefined` → 204 (or `@OnNull` / `@OnUndefined` override) with empty body.
 *  3. Stream-first detection (`.pipe`) — order matters: streams are iterable, so this
 *     check MUST run before the async-iterable branch.
 *  4. Async iterable → `Readable.from(value).pipe(res)`.
 *  5. Plain values:
 *       - `@JsonController` → `res.json(value)` (objects, arrays, primitives)
 *       - `@Controller` → string/Buffer via `res.send`, otherwise `res.json`.
 *
 *  Stream errors forward via `next(err)` with `err.source` attribution; if
 *  headers were already flushed the response is destroyed.
 */
export function writeResponse(
  res: Response,
  next: NextFunction,
  value: unknown,
  controllerMeta: ControllerMetadata,
  actionMeta: ActionMetadata,
): void {
  // 1. Apply HttpCode/Header/ContentType
  applyResponseHandlers(
    res,
    controllerMeta.responseHandlers,
    actionMeta.responseHandlers,
  );

  // 2. null branch
  if (value === null) {
    const code =
      findCode(actionMeta.responseHandlers, 'null-result-code') ??
      findCode(controllerMeta.responseHandlers, 'null-result-code') ??
      204;
    res.status(code);
    res.end();
    next();
    return;
  }

  // 3. undefined branch
  if (value === undefined) {
    const code =
      findCode(actionMeta.responseHandlers, 'undefined-result-code') ??
      findCode(controllerMeta.responseHandlers, 'undefined-result-code') ??
      204;
    res.status(code);
    res.end();
    next();
    return;
  }

  const target = (controllerMeta.target ?? { name: 'AnonymousController' }) as {
    name: string;
  };
  const methodName =
    typeof actionMeta.method === 'symbol'
      ? actionMeta.method.toString()
      : String(actionMeta.method);
  const source = `${target.name}.${methodName}`;

  // 4. Stream first (order matters; streams are also iterable)
  if (isStreamLike(value)) {
    // Register finish handler BEFORE pipe() so next() fires after streaming completes.
    // On error, forwardStreamError calls next(err) — skipping @UseAfter.
    res.on('finish', () => next());
    value.on('error', (err: unknown) =>
      forwardStreamError(res, next, source, err),
    );
    value.pipe(res);
    return;
  }

  // 5. Async iterable second
  if (isAsyncIterable(value)) {
    const stream = Readable.from(value);
    // Register finish handler on res (consistent with stream branch).
    res.on('finish', () => next());
    stream.on('error', (err: unknown) =>
      forwardStreamError(res, next, source, err),
    );
    stream.pipe(res);
    return;
  }

  // 6. Plain value
  if (controllerMeta.type === 'json') {
    res.json(value);
    next();
    return;
  }
  // @Controller content-negotiate
  if (typeof value === 'string') {
    res.send(value);
    next();
    return;
  }
  if (Buffer.isBuffer(value)) {
    res.send(value);
    next();
    return;
  }
  res.json(value);
  next();
}
