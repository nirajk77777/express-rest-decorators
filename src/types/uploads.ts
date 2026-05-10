/**
 * Upload marker types for the slot-based file upload API.
 *
 * This module contains ONLY types and the UPLOAD_KIND symbol.
 * No adapter imports — avoids circular dependency with src/adapter/uploads.ts.
 *
 * Consumers use the factory functions from src/adapter/uploads.ts:
 *   UploadedFile(field, options) → UploadedFileMarker
 *   UploadedFiles(field, options) → UploadedFilesMarker
 */

/** Discriminant symbol for upload markers. Not exported from the public barrel. */
export const UPLOAD_KIND: unique symbol = Symbol('UploadedFile');

export interface UploadLimits {
  /** Max file size in bytes. */
  fileSize?: number;
  /** Max number of files (for array markers). */
  files?: number;
  [key: string]: unknown;
}

export type FileFilter = (
  req: import('express').Request,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) => void;

export interface UploadOptions {
  /** REQUIRED: size/count limits to prevent unbounded uploads (T-04-10). */
  limits: UploadLimits;
  /** REQUIRED: file-type allowlist callback to prevent arbitrary uploads (T-04-11). */
  fileFilter: FileFilter;
  /** Optional multer storage engine (memoryStorage by default when omitted). */
  storage?: unknown;
}

export interface UploadedFileMarker {
  readonly [UPLOAD_KIND]: 'single';
  readonly field: string;
  readonly options: UploadOptions;
}

export interface UploadedFilesMarker {
  readonly [UPLOAD_KIND]: 'array';
  readonly field: string;
  readonly options: UploadOptions;
}

export type AnyUploadMarker = UploadedFileMarker | UploadedFilesMarker;
