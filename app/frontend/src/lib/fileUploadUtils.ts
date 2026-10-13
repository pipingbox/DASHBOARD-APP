/**
 * Mobile-friendly file upload utilities.
 * Handles file type detection and validation.
 *
 * PB-DOCUMENT-UPLOAD-RELIABILITY-001 (rev. 2): validations are ISOLATED PER
 * BUCKET because each bucket has a different Storage configuration:
 *
 * - Avatars bucket (app_14da0f1941_avatars): no MIME allowlist in Storage.
 *   Accepts JPEG, PNG, WebP, HEIC/HEIF (original behaviour restored).
 * - Certificates bucket (app_14da0f1941_certificates): allowed_mime_types is
 *   NULL in Storage (no allowlist). CV accepts PDF/DOC/DOCX; certifications
 *   accept PDF/PNG/JPG/WebP/HEIC/HEIF (original behaviour restored).
 * - Worker documents bucket (worker-documents): Storage allowlist restricts
 *   to PDF, PNG, JPEG/JPG with a 10 MiB limit. Validation must reject
 *   anything else BEFORE the transfer starts.
 */

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Get normalized file extension (lowercase, no dot).
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length < 2) return '';
  return (parts.pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Validate file size. Returns error message or null if valid.
 */
export function validateFileSize(file: File, maxMB: number): string | null {
  if (file.size > maxMB * 1024 * 1024) {
    return `El archivo no debe superar ${maxMB} MB (actual: ${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
  }
  return null;
}

/**
 * Format file size for display.
 */
export function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Mobile-safe file input trigger.
 * On mobile browsers, programmatic .click() on hidden inputs can fail
 * if not called synchronously within a user gesture handler.
 * This function ensures the click is triggered correctly.
 */
export function triggerFileInput(inputRef: React.RefObject<HTMLInputElement | null>): void {
  const input = inputRef.current;
  if (!input) return;

  // Reset value first to allow re-selecting the same file
  input.value = '';

  // Use setTimeout(0) to ensure we're in the next microtask
  // This helps on some Android browsers where click() in the same frame fails
  // But we keep it synchronous for iOS Safari which requires same-frame gesture
  input.click();
}

// ---------------------------------------------------------------------------
// Avatars bucket (app_14da0f1941_avatars) — no Storage MIME allowlist.
// Original formats restored: JPEG, PNG, WebP, HEIC/HEIF.
// Used by AvatarUpload.tsx and OnboardingWizard.tsx.
// ---------------------------------------------------------------------------

const HEIC_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'];

const AVATAR_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', ...HEIC_TYPES];

/**
 * Accept string for avatar image file inputs (mobile-friendly).
 * Includes HEIC/HEIF for iPhone compatibility (bucket has no MIME allowlist).
 */
export const ACCEPT_IMAGES =
  '.jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif';

/**
 * Detect if the file is a HEIC/HEIF image (common on iPhone).
 * Some mobile browsers report empty MIME type for HEIC files,
 * so we also check the file extension.
 */
export function isHeicFile(file: File): boolean {
  if (HEIC_TYPES.includes(file.type.toLowerCase())) return true;
  const ext = getFileExtension(file.name);
  return ['heic', 'heif'].includes(ext);
}

/**
 * Check if a file is a valid avatar image for upload (including HEIC from
 * mobile). The avatars bucket has no MIME allowlist, so the original
 * JPEG/PNG/WebP/HEIC behaviour is preserved.
 */
export function isValidImageFile(file: File): boolean {
  // Check MIME type
  if (AVATAR_IMAGE_TYPES.includes(file.type.toLowerCase())) return true;
  // Some mobile browsers don't set MIME type correctly — check extension
  const ext = getFileExtension(file.name);
  return ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext);
}

/**
 * Get a safe extension for avatar image upload path.
 * For HEIC files, we keep the original extension since Supabase stores them
 * as-is (bucket has no MIME allowlist).
 */
export function getSafeImageExtension(filename: string): string {
  const ext = getFileExtension(filename);
  if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext)) return ext;
  return 'jpg';
}

// ---------------------------------------------------------------------------
// Certificates bucket (app_14da0f1941_certificates) — allowed_mime_types is
// NULL in Storage (no allowlist). Original formats restored.
// ---------------------------------------------------------------------------

/**
 * Accept string for CV file inputs: PDF, DOC, DOCX.
 */
export const ACCEPT_DOCUMENTS =
  '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const CV_DOC_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/**
 * Check if a file is a valid CV document (PDF, DOC, DOCX).
 * The certificates bucket has no MIME allowlist, so the original
 * PDF/DOC/DOCX behaviour is preserved.
 */
export function isValidDocumentFile(file: File): boolean {
  if (CV_DOC_TYPES.includes(file.type.toLowerCase())) return true;
  const ext = getFileExtension(file.name);
  return ['pdf', 'doc', 'docx'].includes(ext);
}

/**
 * Get a safe extension for CV upload (pdf/doc/docx preserved).
 */
export function getSafeDocExtension(filename: string): string {
  const ext = getFileExtension(filename);
  if (['pdf', 'doc', 'docx'].includes(ext)) return ext;
  return 'pdf';
}

const CERT_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/heic',
  'image/heif',
];

const CERT_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'heic', 'heif'];

/**
 * Accept string for certification file inputs: PDF, PNG, JPG, WebP, HEIC/HEIF.
 */
export const ACCEPT_CERTIFICATES =
  '.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.heic,.heif,application/pdf,image/png,image/jpeg,image/jpg,image/webp,image/heic,image/heif';

/**
 * Check if a file is valid for the certifications section.
 * The certificates bucket has no MIME allowlist, so the original
 * PDF/PNG/JPG/WebP/HEIC/HEIF behaviour is preserved.
 */
export function isValidCertificateFile(file: File): boolean {
  if (file.type && CERT_MIME_TYPES.includes(file.type.toLowerCase())) return true;
  const ext = getFileExtension(file.name);
  return CERT_EXTENSIONS.includes(ext);
}

/**
 * Check if a file is a valid image or document for buckets without an
 * allowlist (legacy helper kept for compatibility with existing callers).
 */
export function isValidDocOrImageFile(file: File): boolean {
  return isValidDocumentFile(file) || isValidImageFile(file);
}

// ---------------------------------------------------------------------------
// Worker documents bucket (worker-documents) — Storage allowlist:
// PDF, PNG, JPEG/JPG only, 10 MiB limit.
// ---------------------------------------------------------------------------

/**
 * Accept string for worker document file inputs: PDF, PNG, JPG/JPEG only.
 */
export const ACCEPT_WORKER_DOCUMENTS =
  '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg,image/jpg';

/**
 * @deprecated Alias kept for compatibility — use ACCEPT_WORKER_DOCUMENTS.
 */
export const ACCEPT_DOCS_AND_IMAGES = ACCEPT_WORKER_DOCUMENTS;

// Allowed MIME types with their compatible extensions. A specific MIME and
// the file extension must agree; if they contradict each other the file is
// rejected (e.g. "photo.png" with image/heic, or "photo.heic" with image/png).
const WORKER_DOC_MIME_TO_EXTENSIONS: Record<string, string[]> = {
  'application/pdf': ['pdf'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/jpg': ['jpg', 'jpeg'],
};

const WORKER_DOC_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg'];

/**
 * Check if a file is a valid image or document for the worker-documents
 * bucket (PDF, PNG, JPEG/JPG only).
 *
 * Validation semantics (PB-DOCUMENT-UPLOAD-RELIABILITY-001 rev. 2):
 * - If the MIME type is present and specific, it must be in the allowlist.
 *   Extension fallback is NOT used in this case, so a ".png" file whose MIME
 *   says image/heic is rejected.
 * - If the MIME is allowed but the extension contradicts it (e.g. .heic with
 *   image/png), the file is rejected as inconsistent.
 * - Extension fallback only applies when the MIME is absent or generic
 *   ("" or application/octet-stream), which happens on some mobile browsers.
 */
export function isValidWorkerDocumentFile(file: File): boolean {
  return isSupportedByStorage(file);
}

/**
 * Check if a file type is supported by the worker-documents bucket.
 * See isValidWorkerDocumentFile for the exact MIME/extension semantics.
 */
export function isSupportedByStorage(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  const ext = getFileExtension(file.name);
  const mimeIsGeneric = !mime || mime === 'application/octet-stream';

  if (!mimeIsGeneric) {
    const compatibleExtensions = WORKER_DOC_MIME_TO_EXTENSIONS[mime];
    if (!compatibleExtensions) {
      // Specific MIME outside the allowlist — never fall back to extension.
      return false;
    }
    // If an extension is present it must be compatible with the MIME.
    if (ext && !compatibleExtensions.includes(ext)) return false;
    return true;
  }

  // Absent/generic MIME (some mobile browsers): extension decides.
  return WORKER_DOC_EXTENSIONS.includes(ext);
}

/**
 * Get a user-friendly error message for unsupported worker document types.
 */
export function getUnsupportedTypeMessage(file: File): string {
  const ext = getFileExtension(file.name);
  const unsupportedFormats = ['doc', 'docx', 'webp', 'heic', 'heif'];

  if (unsupportedFormats.includes(ext)) {
    return `El formato .${ext} no está soportado en esta sección. Por favor, convierte tu archivo a PDF, PNG o JPG.`;
  }
  return 'Tipo de archivo no soportado. Formatos aceptados: PDF, PNG, JPG.';
}
