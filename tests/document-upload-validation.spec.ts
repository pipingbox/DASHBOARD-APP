import { test, expect } from '@playwright/test';

/**
 * PB-DOCUMENT-UPLOAD-RELIABILITY-001 — file format validation unit tests.
 *
 * Validates that the fileUploadUtils module correctly restricts uploads to
 * the formats actually supported by the Supabase Storage bucket
 * "worker-documents": PDF, PNG, JPEG/JPG only.
 *
 * DOC, DOCX, WebP, HEIC/HEIF must be rejected BEFORE any transfer begins.
 */

// Mock File object for testing
function createMockFile(name: string, type: string, size: number = 1024): File {
  const blob = new Blob(['x'.repeat(size)], { type });
  return new File([blob], name, { type, lastModified: Date.now() });
}

test.describe('PB-DOCUMENT-UPLOAD-RELIABILITY-001 file format validation', () => {
  test.describe('isSupportedByStorage', () => {
    test('accepts PDF files', async () => {
      const { isSupportedByStorage } = await import('../app/frontend/src/lib/fileUploadUtils');
      const file = createMockFile('document.pdf', 'application/pdf');
      expect(isSupportedByStorage(file)).toBe(true);
    });

    test('accepts PNG files', async () => {
      const { isSupportedByStorage } = await import('../app/frontend/src/lib/fileUploadUtils');
      const file = createMockFile('image.png', 'image/png');
      expect(isSupportedByStorage(file)).toBe(true);
    });

    test('accepts JPEG files', async () => {
      const { isSupportedByStorage } = await import('../app/frontend/src/lib/fileUploadUtils');
      const file = createMockFile('photo.jpg', 'image/jpeg');
      expect(isSupportedByStorage(file)).toBe(true);
    });

    test('accepts JPG extension files', async () => {
      const { isSupportedByStorage } = await import('../app/frontend/src/lib/fileUploadUtils');
      const file = createMockFile('photo.jpg', 'image/jpg');
      expect(isSupportedByStorage(file)).toBe(true);
    });

    test('rejects DOC files', async () => {
      const { isSupportedByStorage } = await import('../app/frontend/src/lib/fileUploadUtils');
      const file = createMockFile('document.doc', 'application/msword');
      expect(isSupportedByStorage(file)).toBe(false);
    });

    test('rejects DOCX files', async () => {
      const { isSupportedByStorage } = await import('../app/frontend/src/lib/fileUploadUtils');
      const file = createMockFile('document.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(isSupportedByStorage(file)).toBe(false);
    });

    test('rejects WebP files', async () => {
      const { isSupportedByStorage } = await import('../app/frontend/src/lib/fileUploadUtils');
      const file = createMockFile('image.webp', 'image/webp');
      expect(isSupportedByStorage(file)).toBe(false);
    });

    test('rejects HEIC files', async () => {
      const { isSupportedByStorage } = await import('../app/frontend/src/lib/fileUploadUtils');
      const file = createMockFile('photo.heic', 'image/heic');
      expect(isSupportedByStorage(file)).toBe(false);
    });

    test('rejects HEIF files', async () => {
      const { isSupportedByStorage } = await import('../app/frontend/src/lib/fileUploadUtils');
      const file = createMockFile('photo.heif', 'image/heif');
      expect(isSupportedByStorage(file)).toBe(false);
    });

    test('accepts PDF by extension when MIME is empty', async () => {
      const { isSupportedByStorage } = await import('../app/frontend/src/lib/fileUploadUtils');
      const file = createMockFile('document.pdf', '');
      expect(isSupportedByStorage(file)).toBe(true);
    });

    test('accepts PNG by extension when MIME is empty', async () => {
      const { isSupportedByStorage } = await import('../app/frontend/src/lib/fileUploadUtils');
      const file = createMockFile('image.png', '');
      expect(isSupportedByStorage(file)).toBe(true);
    });

    test('rejects DOC by extension when MIME is empty', async () => {
      const { isSupportedByStorage } = await import('../app/frontend/src/lib/fileUploadUtils');
      const file = createMockFile('document.doc', '');
      expect(isSupportedByStorage(file)).toBe(false);
    });
  });

  test.describe('getUnsupportedTypeMessage', () => {
    test('returns specific message for DOC', async () => {
      const { getUnsupportedTypeMessage } = await import('../app/frontend/src/lib/fileUploadUtils');
      const file = createMockFile('document.doc', 'application/msword');
      const msg = getUnsupportedTypeMessage(file);
      expect(msg).toContain('.doc');
      expect(msg).toContain('PDF, PNG o JPG');
    });

    test('returns specific message for DOCX', async () => {
      const { getUnsupportedTypeMessage } = await import('../app/frontend/src/lib/fileUploadUtils');
      const file = createMockFile('document.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      const msg = getUnsupportedTypeMessage(file);
      expect(msg).toContain('.docx');
      expect(msg).toContain('PDF, PNG o JPG');
    });

    test('returns specific message for WebP', async () => {
      const { getUnsupportedTypeMessage } = await import('../app/frontend/src/lib/fileUploadUtils');
      const file = createMockFile('image.webp', 'image/webp');
      const msg = getUnsupportedTypeMessage(file);
      expect(msg).toContain('.webp');
      expect(msg).toContain('PDF, PNG o JPG');
    });

    test('returns specific message for HEIC', async () => {
      const { getUnsupportedTypeMessage } = await import('../app/frontend/src/lib/fileUploadUtils');
      const file = createMockFile('photo.heic', 'image/heic');
      const msg = getUnsupportedTypeMessage(file);
      expect(msg).toContain('.heic');
      expect(msg).toContain('PDF, PNG o JPG');
    });

    test('returns generic message for other unsupported types', async () => {
      const { getUnsupportedTypeMessage } = await import('../app/frontend/src/lib/fileUploadUtils');
      const file = createMockFile('file.xyz', 'application/xyz');
      const msg = getUnsupportedTypeMessage(file);
      expect(msg).toContain('PDF, PNG, JPG');
    });
  });

  test.describe('isValidDocumentFile', () => {
    test('accepts PDF', async () => {
      const { isValidDocumentFile } = await import('../app/frontend/src/lib/fileUploadUtils');
      const file = createMockFile('doc.pdf', 'application/pdf');
      expect(isValidDocumentFile(file)).toBe(true);
    });

    test('rejects DOC', async () => {
      const { isValidDocumentFile } = await import('../app/frontend/src/lib/fileUploadUtils');
      const file = createMockFile('doc.doc', 'application/msword');
      expect(isValidDocumentFile(file)).toBe(false);
    });

    test('rejects DOCX', async () => {
      const { isValidDocumentFile } = await import('../app/frontend/src/lib/fileUploadUtils');
      const file = createMockFile('doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(isValidDocumentFile(file)).toBe(false);
    });
  });

  test.describe('isValidImageFile', () => {
    test('accepts PNG', async () => {
      const { isValidImageFile } = await import('../app/frontend/src/lib/fileUploadUtils');
      const file = createMockFile('img.png', 'image/png');
      expect(isValidImageFile(file)).toBe(true);
    });

    test('accepts JPEG', async () => {
      const { isValidImageFile } = await import('../app/frontend/src/lib/fileUploadUtils');
      const file = createMockFile('img.jpg', 'image/jpeg');
      expect(isValidImageFile(file)).toBe(true);
    });

    test('rejects WebP', async () => {
      const { isValidImageFile } = await import('../app/frontend/src/lib/fileUploadUtils');
      const file = createMockFile('img.webp', 'image/webp');
      expect(isValidImageFile(file)).toBe(false);
    });

    test('rejects HEIC', async () => {
      const { isValidImageFile } = await import('../app/frontend/src/lib/fileUploadUtils');
      const file = createMockFile('img.heic', 'image/heic');
      expect(isValidImageFile(file)).toBe(false);
    });
  });

  test.describe('ACCEPT constants', () => {
    test('ACCEPT_DOCUMENTS only includes PDF', async () => {
      const { ACCEPT_DOCUMENTS } = await import('../app/frontend/src/lib/fileUploadUtils');
      expect(ACCEPT_DOCUMENTS).toContain('.pdf');
      expect(ACCEPT_DOCUMENTS).toContain('application/pdf');
      expect(ACCEPT_DOCUMENTS).not.toContain('.doc');
      expect(ACCEPT_DOCUMENTS).not.toContain('.docx');
    });

    test('ACCEPT_IMAGES only includes PNG and JPEG', async () => {
      const { ACCEPT_IMAGES } = await import('../app/frontend/src/lib/fileUploadUtils');
      expect(ACCEPT_IMAGES).toContain('.png');
      expect(ACCEPT_IMAGES).toContain('.jpg');
      expect(ACCEPT_IMAGES).toContain('.jpeg');
      expect(ACCEPT_IMAGES).not.toContain('.webp');
      expect(ACCEPT_IMAGES).not.toContain('.heic');
      expect(ACCEPT_IMAGES).not.toContain('.heif');
    });

    test('ACCEPT_DOCS_AND_IMAGES combines both correctly', async () => {
      const { ACCEPT_DOCS_AND_IMAGES, ACCEPT_DOCUMENTS, ACCEPT_IMAGES } = await import('../app/frontend/src/lib/fileUploadUtils');
      expect(ACCEPT_DOCS_AND_IMAGES).toBe(`${ACCEPT_DOCUMENTS},${ACCEPT_IMAGES}`);
    });
  });

  test.describe('validateFileSize', () => {
    test('accepts file under limit', async () => {
      const { validateFileSize } = await import('../app/frontend/src/lib/fileUploadUtils');
      const file = createMockFile('doc.pdf', 'application/pdf', 5 * 1024 * 1024); // 5 MB
      expect(validateFileSize(file, 10)).toBeNull();
    });

    test('rejects file over limit', async () => {
      const { validateFileSize } = await import('../app/frontend/src/lib/fileUploadUtils');
      const file = createMockFile('doc.pdf', 'application/pdf', 15 * 1024 * 1024); // 15 MB
      const error = validateFileSize(file, 10);
      expect(error).not.toBeNull();
      expect(error).toContain('10 MB');
    });
  });
});
