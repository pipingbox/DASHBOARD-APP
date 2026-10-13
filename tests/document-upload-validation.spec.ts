import { test, expect } from '@playwright/test';

/**
 * PB-DOCUMENT-UPLOAD-RELIABILITY-001 (rev. 2) — per-bucket file validation.
 *
 * Each bucket has a DIFFERENT Storage configuration, so validations are
 * isolated per upload flow:
 *
 * - worker-documents: Storage allowlist PDF/PNG/JPEG, 10 MiB.
 * - certificates bucket (CV + certifications): allowed_mime_types = NULL.
 * - avatars bucket: no allowlist (JPEG/PNG/WebP/HEIC restored).
 */

function createMockFile(name: string, type: string, size: number = 1024): File {
  const blob = new Blob(['x'.repeat(size)], { type });
  return new File([blob], name, { type, lastModified: Date.now() });
}

test.describe('worker-documents bucket (isSupportedByStorage / isValidWorkerDocumentFile)', () => {
  const load = () => import('../app/frontend/src/lib/fileUploadUtils');

  test('accepts PDF', async () => {
    const { isSupportedByStorage } = await load();
    expect(isSupportedByStorage(createMockFile('document.pdf', 'application/pdf'))).toBe(true);
  });

  test('accepts PNG with matching MIME', async () => {
    const { isSupportedByStorage } = await load();
    expect(isSupportedByStorage(createMockFile('image.png', 'image/png'))).toBe(true);
  });

  test('accepts JPEG with .jpg extension', async () => {
    const { isSupportedByStorage } = await load();
    expect(isSupportedByStorage(createMockFile('photo.jpg', 'image/jpeg'))).toBe(true);
  });

  test('accepts JPEG with .jpeg extension', async () => {
    const { isSupportedByStorage } = await load();
    expect(isSupportedByStorage(createMockFile('photo.jpeg', 'image/jpeg'))).toBe(true);
  });

  test('accepts PDF by extension when MIME is empty (mobile)', async () => {
    const { isSupportedByStorage } = await load();
    expect(isSupportedByStorage(createMockFile('document.pdf', ''))).toBe(true);
  });

  test('accepts PNG by extension when MIME is generic octet-stream (mobile)', async () => {
    const { isSupportedByStorage } = await load();
    expect(isSupportedByStorage(createMockFile('image.png', 'application/octet-stream'))).toBe(true);
  });

  test('rejects DOC even with valid MIME', async () => {
    const { isSupportedByStorage } = await load();
    expect(isSupportedByStorage(createMockFile('document.doc', 'application/msword'))).toBe(false);
  });

  test('rejects DOCX', async () => {
    const { isSupportedByStorage } = await load();
    expect(
      isSupportedByStorage(
        createMockFile('document.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      )
    ).toBe(false);
  });

  test('rejects WebP with image/webp MIME', async () => {
    const { isSupportedByStorage } = await load();
    expect(isSupportedByStorage(createMockFile('image.webp', 'image/webp'))).toBe(false);
  });

  test('rejects HEIC with image/heic MIME', async () => {
    const { isSupportedByStorage } = await load();
    expect(isSupportedByStorage(createMockFile('photo.heic', 'image/heic'))).toBe(false);
  });

  test('rejects DOC by extension when MIME is empty (no fallback to allowed ext)', async () => {
    const { isSupportedByStorage } = await load();
    expect(isSupportedByStorage(createMockFile('document.doc', ''))).toBe(false);
  });

  // PB-DOCUMENT-UPLOAD-RELIABILITY-001 rev. 2 — contradictory MIME/extension
  test('rejects .png whose MIME says image/heic (contradiction, no fallback)', async () => {
    const { isSupportedByStorage } = await load();
    expect(isSupportedByStorage(createMockFile('photo.png', 'image/heic'))).toBe(false);
  });

  test('rejects .heic whose MIME says image/png (contradiction)', async () => {
    const { isSupportedByStorage } = await load();
    expect(isSupportedByStorage(createMockFile('photo.heic', 'image/png'))).toBe(false);
  });

  test('rejects .png whose MIME says application/pdf (contradiction)', async () => {
    const { isSupportedByStorage } = await load();
    expect(isSupportedByStorage(createMockFile('photo.png', 'application/pdf'))).toBe(false);
  });

  test('rejects .pdf whose MIME says image/png (contradiction)', async () => {
    const { isSupportedByStorage } = await load();
    expect(isSupportedByStorage(createMockFile('document.pdf', 'image/png'))).toBe(false);
  });

  test('isValidWorkerDocumentFile matches isSupportedByStorage', async () => {
    const { isValidWorkerDocumentFile } = await load();
    expect(isValidWorkerDocumentFile(createMockFile('d.pdf', 'application/pdf'))).toBe(true);
    expect(isValidWorkerDocumentFile(createMockFile('d.doc', 'application/msword'))).toBe(false);
    expect(isValidWorkerDocumentFile(createMockFile('p.png', 'image/heic'))).toBe(false);
  });

  test('ACCEPT_WORKER_DOCUMENTS only lists PDF/PNG/JPG', async () => {
    const { ACCEPT_WORKER_DOCUMENTS } = await load();
    for (const token of ['.pdf', '.png', '.jpg', '.jpeg', 'application/pdf', 'image/png', 'image/jpeg']) {
      expect(ACCEPT_WORKER_DOCUMENTS).toContain(token);
    }
    for (const forbidden of ['.doc', '.docx', '.webp', '.heic', '.heif', 'image/webp', 'image/heic']) {
      expect(ACCEPT_WORKER_DOCUMENTS).not.toContain(forbidden);
    }
  });
});

test.describe('getUnsupportedTypeMessage (worker documents)', () => {
  const load = () => import('../app/frontend/src/lib/fileUploadUtils');

  test('specific message for DOC/DOCX/WebP/HEIC', async () => {
    const { getUnsupportedTypeMessage } = await load();
    for (const ext of ['doc', 'docx', 'webp', 'heic', 'heif']) {
      const msg = getUnsupportedTypeMessage(createMockFile(`file.${ext}`, 'application/octet-stream'));
      expect(msg).toContain(`.${ext}`);
      expect(msg).toContain('PDF, PNG o JPG');
    }
  });

  test('generic message for other unsupported types', async () => {
    const { getUnsupportedTypeMessage } = await load();
    const msg = getUnsupportedTypeMessage(createMockFile('file.xyz', 'application/xyz'));
    expect(msg).toContain('PDF, PNG, JPG');
  });
});

test.describe('avatars bucket regression (AvatarUpload / OnboardingWizard)', () => {
  const load = () => import('../app/frontend/src/lib/fileUploadUtils');

  test('isValidImageFile accepts JPEG, PNG, WebP, HEIC', async () => {
    const { isValidImageFile } = await load();
    expect(isValidImageFile(createMockFile('a.jpg', 'image/jpeg'))).toBe(true);
    expect(isValidImageFile(createMockFile('a.png', 'image/png'))).toBe(true);
    expect(isValidImageFile(createMockFile('a.webp', 'image/webp'))).toBe(true);
    expect(isValidImageFile(createMockFile('a.heic', 'image/heic'))).toBe(true);
    expect(isValidImageFile(createMockFile('a.heif', 'image/heif'))).toBe(true);
  });

  test('isValidImageFile accepts WebP/HEIC by extension with empty MIME (mobile)', async () => {
    const { isValidImageFile } = await load();
    expect(isValidImageFile(createMockFile('a.webp', ''))).toBe(true);
    expect(isValidImageFile(createMockFile('a.heic', ''))).toBe(true);
  });

  test('isHeicFile detects HEIC by MIME and by extension', async () => {
    const { isHeicFile } = await load();
    expect(isHeicFile(createMockFile('p.heic', 'image/heic'))).toBe(true);
    expect(isHeicFile(createMockFile('p.heic', ''))).toBe(true);
    expect(isHeicFile(createMockFile('p.jpg', 'image/jpeg'))).toBe(false);
  });

  test('getSafeImageExtension preserves webp/heic', async () => {
    const { getSafeImageExtension } = await load();
    expect(getSafeImageExtension('a.webp')).toBe('webp');
    expect(getSafeImageExtension('a.heic')).toBe('heic');
    expect(getSafeImageExtension('a.jpg')).toBe('jpg');
    expect(getSafeImageExtension('weird')).toBe('jpg');
  });

  test('ACCEPT_IMAGES includes WebP and HEIC/HEIF', async () => {
    const { ACCEPT_IMAGES } = await load();
    for (const token of ['.webp', '.heic', '.heif', 'image/webp', 'image/heic']) {
      expect(ACCEPT_IMAGES).toContain(token);
    }
  });
});

test.describe('certificates bucket — CV (PDF, DOC, DOCX restored)', () => {
  const load = () => import('../app/frontend/src/lib/fileUploadUtils');

  test('isValidDocumentFile accepts PDF, DOC, DOCX', async () => {
    const { isValidDocumentFile } = await load();
    expect(isValidDocumentFile(createMockFile('cv.pdf', 'application/pdf'))).toBe(true);
    expect(isValidDocumentFile(createMockFile('cv.doc', 'application/msword'))).toBe(true);
    expect(
      isValidDocumentFile(
        createMockFile('cv.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      )
    ).toBe(true);
  });

  test('isValidDocumentFile rejects images and other types', async () => {
    const { isValidDocumentFile } = await load();
    expect(isValidDocumentFile(createMockFile('img.png', 'image/png'))).toBe(false);
    expect(isValidDocumentFile(createMockFile('img.heic', 'image/heic'))).toBe(false);
    expect(isValidDocumentFile(createMockFile('file.xyz', ''))).toBe(false);
  });

  test('getSafeDocExtension preserves doc/docx/pdf', async () => {
    const { getSafeDocExtension } = await load();
    expect(getSafeDocExtension('cv.pdf')).toBe('pdf');
    expect(getSafeDocExtension('cv.doc')).toBe('doc');
    expect(getSafeDocExtension('cv.docx')).toBe('docx');
    expect(getSafeDocExtension('weird')).toBe('pdf');
  });

  test('ACCEPT_DOCUMENTS includes PDF, DOC, DOCX', async () => {
    const { ACCEPT_DOCUMENTS } = await load();
    for (const token of ['.pdf', '.doc', '.docx', 'application/pdf', 'application/msword']) {
      expect(ACCEPT_DOCUMENTS).toContain(token);
    }
  });
});

test.describe('certificates bucket — certifications (PDF/PNG/JPG/WebP/HEIC restored)', () => {
  const load = () => import('../app/frontend/src/lib/fileUploadUtils');

  test('isValidCertificateFile accepts all original formats', async () => {
    const { isValidCertificateFile } = await load();
    expect(isValidCertificateFile(createMockFile('c.pdf', 'application/pdf'))).toBe(true);
    expect(isValidCertificateFile(createMockFile('c.png', 'image/png'))).toBe(true);
    expect(isValidCertificateFile(createMockFile('c.jpg', 'image/jpeg'))).toBe(true);
    expect(isValidCertificateFile(createMockFile('c.webp', 'image/webp'))).toBe(true);
    expect(isValidCertificateFile(createMockFile('c.heic', 'image/heic'))).toBe(true);
    expect(isValidCertificateFile(createMockFile('c.heif', 'image/heif'))).toBe(true);
  });

  test('isValidCertificateFile accepts by extension with empty MIME (mobile)', async () => {
    const { isValidCertificateFile } = await load();
    expect(isValidCertificateFile(createMockFile('c.webp', ''))).toBe(true);
    expect(isValidCertificateFile(createMockFile('c.heic', ''))).toBe(true);
    expect(isValidCertificateFile(createMockFile('c.pdf', ''))).toBe(true);
  });

  test('isValidCertificateFile rejects DOC/DOCX (as before this PR)', async () => {
    const { isValidCertificateFile } = await load();
    expect(isValidCertificateFile(createMockFile('c.doc', 'application/msword'))).toBe(false);
    expect(isValidCertificateFile(createMockFile('c.docx', ''))).toBe(false);
    expect(isValidCertificateFile(createMockFile('c.xyz', ''))).toBe(false);
  });

  test('ACCEPT_CERTIFICATES includes all original formats', async () => {
    const { ACCEPT_CERTIFICATES } = await load();
    for (const token of ['.pdf', '.png', '.webp', '.heic', '.heif', 'image/webp', 'image/heic']) {
      expect(ACCEPT_CERTIFICATES).toContain(token);
    }
  });
});

test.describe('validateFileSize', () => {
  test('accepts file under limit', async () => {
    const { validateFileSize } = await import('../app/frontend/src/lib/fileUploadUtils');
    expect(validateFileSize(createMockFile('d.pdf', 'application/pdf', 5 * 1024 * 1024), 10)).toBeNull();
  });

  test('rejects file over limit with message', async () => {
    const { validateFileSize } = await import('../app/frontend/src/lib/fileUploadUtils');
    const error = validateFileSize(createMockFile('d.pdf', 'application/pdf', 15 * 1024 * 1024), 10);
    expect(error).not.toBeNull();
    expect(error).toContain('10 MB');
  });
});
