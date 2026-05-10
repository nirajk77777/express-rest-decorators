/**
 * File upload slot adapter (D-03, D-04).
 *
 * Provides:
 *   - UploadedFile / UploadedFiles factory functions
 *   - validateUploadMarker: registration-time guard (limits + fileFilter required)
 *   - loadMulter: lazy multer peer loader (cached)
 *   - buildMulterMiddleware: compose ONE multer .fields() instance per route
 *   - resolveFilesArm: extract req.files entries for the validation Promise.all arm
 *   - isUploadMarker: type-guard for markers
 *
 * Security surface:
 *   T-04-10: limits REQUIRED — boot throws if absent.
 *   T-04-11: fileFilter REQUIRED — boot throws if absent.
 *   T-04-12: Library never writes to disk; storage is the consumer's choice.
 *   T-04-14: Error messages contain only metadata, never file bytes.
 *
 * multer is a lazy peer — imported only when at least one route declares files.
 * No top-level `import multer` is allowed here.
 */

import type { RequestHandler, Request } from 'express';
import type { ActionMetadata } from '../types/resolved.js';
import {
  UPLOAD_KIND,
  type UploadedFileMarker,
  type UploadedFilesMarker,
  type AnyUploadMarker,
  type UploadOptions,
  type UploadLimits,
  type FileFilter,
} from '../types/uploads.js';

export { UPLOAD_KIND };
export type {
  UploadedFileMarker,
  UploadedFilesMarker,
  AnyUploadMarker,
  UploadOptions,
  UploadLimits,
  FileFilter,
};

// ── Factory functions ─────────────────────────────────────────────────────────

/**
 * Declare a single-file upload slot.
 * Returns a marker object; does NOT mount middleware itself.
 * Place in InputDeclaration.files: { avatar: UploadedFile('avatar', opts) }.
 */
export function UploadedFile(field: string, options: UploadOptions): UploadedFileMarker {
  return { [UPLOAD_KIND]: 'single', field, options };
}

/**
 * Declare a multi-file upload slot.
 * Returns a marker object; does NOT mount middleware itself.
 * Place in InputDeclaration.files: { photos: UploadedFiles('photos', opts) }.
 */
export function UploadedFiles(field: string, options: UploadOptions): UploadedFilesMarker {
  return { [UPLOAD_KIND]: 'array', field, options };
}

/** Type guard — true for both UploadedFileMarker and UploadedFilesMarker. */
export function isUploadMarker(x: unknown): x is AnyUploadMarker {
  return !!x && typeof x === 'object' && UPLOAD_KIND in (x as object);
}

// ── Lazy multer loader ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MulterFactory = (...args: any[]) => any;

let cachedMulter: MulterFactory | null = null;

/** Load the multer peer lazily. Throws an actionable message when not installed. */
async function loadMulter(): Promise<MulterFactory> {
  if (cachedMulter) return cachedMulter;
  try {
    // Dynamic import — no top-level multer import (RESEARCH Pattern 1)
    const mod = (await import('multer')) as { default?: MulterFactory } | MulterFactory;
    // CJS-via-ESM interop: multer ships CJS; dynamic import in ESM yields { default: fn }
    const factory =
      typeof (mod as { default?: MulterFactory }).default === 'function'
        ? (mod as { default: MulterFactory }).default
        : (mod as MulterFactory);
    if (typeof factory !== 'function') {
      throw new Error('multer module loaded but default export is not a function');
    }
    cachedMulter = factory;
    return cachedMulter;
  } catch (err) {
    // Re-throw with actionable install message (catches MODULE_NOT_FOUND and the guard above)
    if (
      err instanceof Error &&
      err.message.startsWith('File upload requires multer')
    ) {
      throw err;
    }
    throw new Error(
      'File upload requires multer as a peer dependency. Install it with: pnpm add multer',
    );
  }
}

// ── Registration-time validation ──────────────────────────────────────────────

/**
 * Throws a named error when a marker is missing required limits or fileFilter.
 * The fieldKey is the InputDeclaration map key (e.g. 'avatar'), not the multer field name.
 */
export function validateUploadMarker(
  marker: AnyUploadMarker,
  controllerName: string,
  methodName: string,
  fieldKey: string,
): void {
  if (!marker.options.limits) {
    throw new Error(
      `[${controllerName}.${methodName}] UploadedFile field "${fieldKey}" requires explicit limits. ` +
        `Set limits: { fileSize: N } to prevent unbounded uploads.`,
    );
  }
  if (typeof marker.options.fileFilter !== 'function') {
    throw new Error(
      `[${controllerName}.${methodName}] UploadedFile field "${fieldKey}" requires explicit fileFilter. ` +
        `Set fileFilter to validate accepted file types.`,
    );
  }
}

/**
 * Build a single multer .fields() RequestHandler for all upload markers on an action.
 *
 * Pitfall 2 (RESEARCH): Multiple file fields MUST share ONE multer instance via .fields([...]).
 * All markers on a single route must declare identical limits and fileFilter — throws with
 * an actionable conflict error if they differ.
 *
 * Returns null when the action declares no files slot.
 */
export async function buildMulterMiddleware(
  action: ActionMetadata,
  controllerName: string,
  methodName: string,
): Promise<RequestHandler | null> {
  const files = (action.input as { files?: Record<string, AnyUploadMarker> } | undefined)?.files;
  if (!files || Object.keys(files).length === 0) return null;

  const fields: Array<{ name: string; maxCount: number }> = [];
  let sharedLimits: UploadLimits | undefined;
  let sharedFileFilter: FileFilter | undefined;

  for (const [fieldKey, marker] of Object.entries(files)) {
    if (!isUploadMarker(marker)) continue;

    // Registration-time mandatory options check (T-04-10, T-04-11)
    validateUploadMarker(marker, controllerName, methodName, fieldKey);

    // Conflict check — all markers on the same route must share identical options
    if (sharedLimits !== undefined) {
      const limitsMatch =
        JSON.stringify(sharedLimits) === JSON.stringify(marker.options.limits);
      const filterMatch = sharedFileFilter === marker.options.fileFilter;
      if (!limitsMatch || !filterMatch) {
        throw new Error(
          `[${controllerName}.${methodName}] Multiple UploadedFile/UploadedFiles markers on this route ` +
            `declare different limits or fileFilter. All markers on a single route must share identical options.`,
        );
      }
    } else {
      sharedLimits = marker.options.limits;
      sharedFileFilter = marker.options.fileFilter;
    }

    // Pitfall 2: always use .fields(), even for single markers (consistent req.files shape)
    const maxCount = marker[UPLOAD_KIND] === 'single'
      ? 1
      : ((marker.options.limits.files ?? 10) as number);
    fields.push({ name: marker.field, maxCount });
  }

  if (fields.length === 0) return null;

  // Lazy-load multer peer — throws actionable error if not installed (D-15)
  const multer = await loadMulter();
  const firstKey = Object.keys(files)[0] as string | undefined;
  const storage = firstKey !== undefined ? files[firstKey]?.options?.storage : undefined;
  const uploadOpts: Record<string, unknown> = {
    limits: sharedLimits,
    fileFilter: sharedFileFilter,
  };
  if (storage !== undefined) {
    uploadOpts.storage = storage;
  }
  const instance = multer(uploadOpts);
  return instance.fields(fields) as RequestHandler;
}

// ── Request-time files arm ────────────────────────────────────────────────────

export interface FilesArmResult {
  value?: Record<string, unknown>;
}

/**
 * Resolve the files slot after multer middleware has populated req.files.
 *
 * multer's .fields() always produces req.files as Record<string, Express.Multer.File[]>.
 * Single markers return req.files[field][0] (or undefined).
 * Array markers return req.files[field] ?? [].
 *
 * This arm never produces validation issues — multer handles size/type rejection
 * at the middleware layer (via next(err) → Express error path). We only forward values.
 */
export function resolveFilesArm(
  req: Request,
  declaration: Record<string, AnyUploadMarker> | undefined,
): FilesArmResult {
  if (!declaration) return { value: undefined };

  const reqFiles = (req as Request & { files?: Record<string, Express.Multer.File[]> }).files;
  const out: Record<string, unknown> = {};

  for (const [key, marker] of Object.entries(declaration)) {
    if (!isUploadMarker(marker)) continue;
    if (marker[UPLOAD_KIND] === 'single') {
      out[key] = reqFiles?.[marker.field]?.[0];
    } else {
      out[key] = reqFiles?.[marker.field] ?? [];
    }
  }

  return { value: out };
}

/** Test-only reset for the cached multer factory. */
export function __resetMulterCacheForTest(): void {
  cachedMulter = null;
}
