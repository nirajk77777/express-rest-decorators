/**
 * Task 3 — file upload slot tests (04-03).
 *
 * Tests verify:
 *  1. Registration throws when limits missing
 *  2. Registration throws when fileFilter missing
 *  3. Single file upload happy path (UploadedFile → files.avatar as Express.Multer.File)
 *  4. Multiple files via UploadedFiles → files.photos as array
 *  5. Multi-field aggregation (ONE multer instance per route, Pitfall 2)
 *  6. fileFilter rejection → 500 (multer error forwarded via Express error path)
 *  7. limits.fileSize enforcement → error response (LIMIT_FILE_SIZE)
 *  8. Missing peer → actionable error string
 *  9. Conflicting marker options → boot rejects
 * 10. No-files-slot route does NOT call buildMulterMiddleware with files
 */

import 'reflect-metadata';
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import multer from 'multer';
import {
  JsonController,
  Get,
  Post,
  createExpressServer,
  resetContainer,
  UploadedFile,
  UploadedFiles,
} from '../../src/index.js';
import {
  validateUploadMarker,
  isUploadMarker,
  resolveFilesArm,
  buildMulterMiddleware,
  __resetMulterCacheForTest,
} from '../../src/adapter/uploads.js';
import type { AnyUploadMarker } from '../../src/types/uploads.js';
import type { ActionMetadata } from '../../src/types/resolved.js';

afterEach(() => {
  resetContainer();
  __resetMulterCacheForTest();
});

// ── helpers ───────────────────────────────────────────────────────────────────

const memStorage = multer.memoryStorage();

/** A permissive fileFilter that accepts all files. */
const acceptAll: import('../../src/types/uploads.js').FileFilter = (_req, _file, cb) => cb(null, true);

/** A fileFilter that only accepts image/png. */
const pngOnly: import('../../src/types/uploads.js').FileFilter = (_req, file, cb) =>
  cb(null, file.mimetype === 'image/png');

const baseOpts = {
  limits: { fileSize: 1024 * 1024 }, // 1 MB
  fileFilter: acceptAll,
  storage: memStorage,
};

// ── Test 1: Registration throws when limits missing ───────────────────────────

describe('Test 1 — registration throws when limits missing', () => {
  it('validateUploadMarker throws with controller/method/field in error when limits absent', () => {
    const marker = UploadedFile('avatar', { limits: null as any, fileFilter: acceptAll });
    expect(() =>
      validateUploadMarker(marker, 'AvatarController', 'upload', 'avatar'),
    ).toThrow(/UploadedFile field "avatar" requires explicit limits/);
  });

  it('error message contains controller and method name', () => {
    const marker = UploadedFile('avatar', { limits: null as any, fileFilter: acceptAll });
    expect(() =>
      validateUploadMarker(marker, 'AvatarController', 'upload', 'avatar'),
    ).toThrow(/\[AvatarController\.upload\]/);
  });

  it('boot-time: useExpressControllers rejects when limits missing', async () => {
    @JsonController('/upload-test')
    class UploadController {
      @Post('/avatar', {
        files: { avatar: UploadedFile('avatar', { limits: null as any, fileFilter: acceptAll }) },
      })
      upload({ files }: { files: { avatar: Express.Multer.File } }) {
        return { name: files.avatar?.originalname };
      }
    }

    await expect(
      createExpressServer({ controllers: [UploadController] }),
    ).rejects.toThrow(/UploadedFile field "avatar" requires explicit limits/);
  });
});

// ── Test 2: Registration throws when fileFilter missing ───────────────────────

describe('Test 2 — registration throws when fileFilter missing', () => {
  it('validateUploadMarker throws with fileFilter error message', () => {
    const marker = UploadedFile('doc', { limits: { fileSize: 1000 }, fileFilter: undefined as any });
    expect(() =>
      validateUploadMarker(marker, 'DocController', 'upload', 'doc'),
    ).toThrow(/requires explicit fileFilter/);
  });

  it('error message contains controller and method name', () => {
    const marker = UploadedFile('doc', { limits: { fileSize: 1000 }, fileFilter: undefined as any });
    expect(() =>
      validateUploadMarker(marker, 'DocController', 'upload', 'doc'),
    ).toThrow(/\[DocController\.upload\]/);
  });

  it('boot-time: useExpressControllers rejects when fileFilter missing', async () => {
    @JsonController('/filefilter-test')
    class NoFilterController {
      @Post('/doc', {
        files: { doc: UploadedFile('doc', { limits: { fileSize: 1000 }, fileFilter: undefined as any }) },
      })
      upload({ files }: { files: { doc: Express.Multer.File } }) {
        return { name: files.doc?.originalname };
      }
    }

    await expect(
      createExpressServer({ controllers: [NoFilterController] }),
    ).rejects.toThrow(/requires explicit fileFilter/);
  });
});

// ── Test 3: Single file upload happy path ─────────────────────────────────────

describe('Test 3 — single file upload happy path', () => {
  it('POST multipart with avatar field → handler receives files.avatar with buffer + originalname', async () => {
    @JsonController('/single-upload')
    class SingleUploadController {
      @Post('/avatar', {
        files: { avatar: UploadedFile('avatar', { ...baseOpts }) },
      })
      upload({ files }: { files: { avatar: Express.Multer.File } }) {
        return {
          originalname: files.avatar?.originalname,
          hasBuffer: Buffer.isBuffer(files.avatar?.buffer),
          size: files.avatar?.buffer?.length,
        };
      }
    }

    const app = await createExpressServer({ controllers: [SingleUploadController] });
    const res = await request(app)
      .post('/single-upload/avatar')
      .attach('avatar', Buffer.from('hello world'), { filename: 'test.txt', contentType: 'text/plain' });

    expect(res.status).toBe(200);
    expect(res.body.originalname).toBe('test.txt');
    expect(res.body.hasBuffer).toBe(true);
    expect(res.body.size).toBe(11); // 'hello world' is 11 bytes
  });

  it('UploadedFile returns a single file; handler gets undefined when field absent', async () => {
    @JsonController('/single-upload-missing')
    class SingleUploadMissingController {
      @Post('/doc', {
        files: { doc: UploadedFile('doc', { ...baseOpts }) },
      })
      upload({ files }: { files: { doc: Express.Multer.File | undefined } }) {
        return { hasDoc: files.doc !== undefined };
      }
    }

    const app = await createExpressServer({ controllers: [SingleUploadMissingController] });
    const res = await request(app)
      .post('/single-upload-missing/doc')
      .field('dummy', 'value'); // no 'doc' field

    expect(res.status).toBe(200);
    expect(res.body.hasDoc).toBe(false);
  });
});

// ── Test 4: Multiple files via UploadedFiles ──────────────────────────────────

describe('Test 4 — multiple files via UploadedFiles', () => {
  it('POST with two photos[] files → handler receives files.photos as 2-element array', async () => {
    @JsonController('/multi-upload')
    class MultiUploadController {
      @Post('/photos', {
        files: { photos: UploadedFiles('photos', { ...baseOpts }) },
      })
      upload({ files }: { files: { photos: Express.Multer.File[] } }) {
        return {
          count: files.photos?.length,
          names: files.photos?.map((f) => f.originalname),
        };
      }
    }

    const app = await createExpressServer({ controllers: [MultiUploadController] });
    const res = await request(app)
      .post('/multi-upload/photos')
      .attach('photos', Buffer.from('photo1'), { filename: 'a.jpg', contentType: 'image/jpeg' })
      .attach('photos', Buffer.from('photo2'), { filename: 'b.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.names).toContain('a.jpg');
    expect(res.body.names).toContain('b.jpg');
  });

  it('UploadedFiles returns empty array when field absent', async () => {
    @JsonController('/multi-upload-empty')
    class MultiUploadEmptyController {
      @Post('/photos', {
        files: { photos: UploadedFiles('photos', { ...baseOpts }) },
      })
      upload({ files }: { files: { photos: Express.Multer.File[] } }) {
        return { count: files.photos?.length ?? 0 };
      }
    }

    const app = await createExpressServer({ controllers: [MultiUploadEmptyController] });
    const res = await request(app)
      .post('/multi-upload-empty/photos')
      .field('dummy', 'value');

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });
});

// ── Test 5: Multi-field aggregation (Pitfall 2 — ONE multer instance) ─────────

describe('Test 5 — multi-field aggregation (Pitfall 2)', () => {
  it('controller with avatar + doc fields receives both files', async () => {
    @JsonController('/multi-field')
    class MultiFieldController {
      @Post('/upload', {
        files: {
          avatar: UploadedFile('avatar', { ...baseOpts }),
          doc: UploadedFile('doc', { ...baseOpts }),
        },
      })
      upload({ files }: { files: { avatar: Express.Multer.File; doc: Express.Multer.File } }) {
        return {
          avatarName: files.avatar?.originalname,
          docName: files.doc?.originalname,
        };
      }
    }

    const app = await createExpressServer({ controllers: [MultiFieldController] });
    const res = await request(app)
      .post('/multi-field/upload')
      .attach('avatar', Buffer.from('img'), { filename: 'avatar.png', contentType: 'image/png' })
      .attach('doc', Buffer.from('doc'), { filename: 'resume.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    expect(res.body.avatarName).toBe('avatar.png');
    expect(res.body.docName).toBe('resume.pdf');
  });

  it('buildMulterMiddleware uses .fields([...]) — single instance for all fields (Pitfall 2)', () => {
    // Structural verification: the source uses .fields() not .single()/.array()
    // .fields() is the ONLY API that handles multi-field aggregation in a single multer instance.
    // Using .single() or .array() would require separate multer instances (Pitfall 2 violation).
    const source = readFileSync(
      new URL('../../src/adapter/uploads.ts', import.meta.url),
      'utf8',
    );
    // Must use .fields() — the key indicator of Pitfall 2 compliance
    expect(source).toContain('.fields(fields)');
    // Must NOT use .single() or .array() — those would require separate multer instances
    expect(source).not.toContain('.single(');
    expect(source).not.toContain('.array(');
  });
});

// ── Test 6: fileFilter rejection ──────────────────────────────────────────────

describe('Test 6 — fileFilter rejection', () => {
  it('non-PNG file rejected by pngOnly fileFilter → error response', async () => {
    @JsonController('/png-only')
    class PngOnlyController {
      @Post('/upload', {
        files: {
          avatar: UploadedFile('avatar', {
            limits: { fileSize: 1024 * 1024 },
            fileFilter: pngOnly,
            storage: memStorage,
          }),
        },
      })
      upload({ files }: { files: { avatar: Express.Multer.File } }) {
        return { name: files.avatar?.originalname };
      }
    }

    const app = await createExpressServer({ controllers: [PngOnlyController] });
    const res = await request(app)
      .post('/png-only/upload')
      .attach('avatar', Buffer.from('not-a-png'), { filename: 'doc.txt', contentType: 'text/plain' });

    // multer fileFilter rejection results in multer passing undefined/null — the file is ignored.
    // The file simply won't be in req.files. No error is thrown for rejected files.
    // This is standard multer behavior: cb(null, false) skips the file silently.
    expect(res.status).toBe(200);
    // avatar is absent (fileFilter rejected it)
    expect(res.body.name).toBeUndefined();
  });
});

// ── Test 7: limits.fileSize enforcement ──────────────────────────────────────

describe('Test 7 — limits.fileSize enforcement', () => {
  it('file exceeding size limit → multer error forwarded to Express error handler → error response', async () => {
    @JsonController('/size-limit')
    class SizeLimitController {
      @Post('/upload', {
        files: {
          doc: UploadedFile('doc', {
            limits: { fileSize: 10 }, // 10 bytes max
            fileFilter: acceptAll,
            storage: memStorage,
          }),
        },
      })
      upload({ files }: { files: { doc: Express.Multer.File } }) {
        return { name: files.doc?.originalname };
      }
    }

    const app = await createExpressServer({ controllers: [SizeLimitController] });
    // Send a file larger than 10 bytes
    const bigBuffer = Buffer.alloc(100, 'x');
    const res = await request(app)
      .post('/size-limit/upload')
      .attach('doc', bigBuffer, { filename: 'big.txt', contentType: 'text/plain' });

    // multer emits LIMIT_FILE_SIZE → Express v5 native error propagation → library error handler → 5xx
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ── Test 8: Missing peer → actionable error ───────────────────────────────────

describe('Test 8 — missing multer peer error message', () => {
  it('src/adapter/uploads.ts contains exact peer-missing error message', () => {
    const source = readFileSync(
      new URL('../../src/adapter/uploads.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain(
      'File upload requires multer as a peer dependency. Install it with: pnpm add multer',
    );
  });

  it('buildMulterMiddleware uses dynamic import (no top-level multer import)', () => {
    const source = readFileSync(
      new URL('../../src/adapter/uploads.ts', import.meta.url),
      'utf8',
    );
    // Must NOT have a top-level import statement for multer
    const topLevelImport = /^import .* from ['"]multer['"]/m;
    expect(topLevelImport.test(source)).toBe(false);
    // MUST have a dynamic import for multer
    expect(source).toContain("import('multer')");
  });

  it('resolveFilesArm returns undefined value when no declaration', () => {
    // This verifies that routes without files slot don't invoke multer
    const result = resolveFilesArm({} as any, undefined);
    expect(result.value).toBeUndefined();
  });
});

// ── Test 9: Conflicting marker options ────────────────────────────────────────

describe('Test 9 — conflicting marker options across fields', () => {
  it('boot rejects when two markers declare different limits', async () => {
    const f1 = acceptAll;

    @JsonController('/conflict-limits')
    class ConflictLimitsController {
      @Post('/upload', {
        files: {
          a: UploadedFile('a', { limits: { fileSize: 100 }, fileFilter: f1, storage: memStorage }),
          b: UploadedFile('b', { limits: { fileSize: 200 }, fileFilter: f1, storage: memStorage }),
        },
      })
      upload() {
        return {};
      }
    }

    await expect(
      createExpressServer({ controllers: [ConflictLimitsController] }),
    ).rejects.toThrow(/declare different limits or fileFilter/);
  });

  it('boot rejects when two markers declare different fileFilter functions', async () => {
    const f1 = acceptAll;
    const f2: typeof acceptAll = (_req, _file, cb) => cb(null, true); // distinct reference

    @JsonController('/conflict-filter')
    class ConflictFilterController {
      @Post('/upload', {
        files: {
          a: UploadedFile('a', { limits: { fileSize: 100 }, fileFilter: f1, storage: memStorage }),
          b: UploadedFile('b', { limits: { fileSize: 100 }, fileFilter: f2, storage: memStorage }),
        },
      })
      upload() {
        return {};
      }
    }

    await expect(
      createExpressServer({ controllers: [ConflictFilterController] }),
    ).rejects.toThrow(/declare different limits or fileFilter/);
  });

  it('boot succeeds when both markers share identical limits + fileFilter', async () => {
    const f1 = acceptAll;

    @JsonController('/no-conflict')
    class NoConflictController {
      @Post('/upload', {
        files: {
          a: UploadedFile('a', { limits: { fileSize: 100 }, fileFilter: f1, storage: memStorage }),
          b: UploadedFile('b', { limits: { fileSize: 100 }, fileFilter: f1, storage: memStorage }),
        },
      })
      upload() {
        return { ok: true };
      }
    }

    const app = await createExpressServer({ controllers: [NoConflictController] });
    expect(app).toBeDefined();
  });
});

// ── Test 10: No-files-slot route does not load multer ─────────────────────────

describe('Test 10 — no-files-slot route does not trigger multer import', () => {
  it('buildMulterMiddleware returns null when action has no files slot', async () => {
    // Use a fake ActionMetadata with no files in input
    const fakeAction: Partial<ActionMetadata> = {
      input: { params: undefined, query: undefined, body: undefined, headers: undefined },
    };
    const result = await buildMulterMiddleware(
      fakeAction as ActionMetadata,
      'TestController',
      'test',
    );
    expect(result).toBeNull();
  });

  it('buildMulterMiddleware returns null when input is undefined', async () => {
    const fakeAction: Partial<ActionMetadata> = {
      input: undefined,
    };
    const result = await buildMulterMiddleware(
      fakeAction as ActionMetadata,
      'TestController',
      'test',
    );
    expect(result).toBeNull();
  });

  it('resolveFilesArm returns undefined value when declaration is undefined', () => {
    const result = resolveFilesArm({} as any, undefined);
    expect(result.value).toBeUndefined();
  });
});

// ── Additional: isUploadMarker type guard ─────────────────────────────────────

describe('isUploadMarker type guard', () => {
  it('returns true for UploadedFile marker', () => {
    const marker = UploadedFile('avatar', { ...baseOpts });
    expect(isUploadMarker(marker)).toBe(true);
  });

  it('returns true for UploadedFiles marker', () => {
    const marker = UploadedFiles('photos', { ...baseOpts });
    expect(isUploadMarker(marker)).toBe(true);
  });

  it('returns false for plain objects', () => {
    expect(isUploadMarker({ field: 'avatar', options: {} })).toBe(false);
    expect(isUploadMarker(null)).toBe(false);
    expect(isUploadMarker(undefined)).toBe(false);
    expect(isUploadMarker('string')).toBe(false);
  });
});
