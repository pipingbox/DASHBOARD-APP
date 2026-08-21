/**
 * Mobile-friendly file upload utilities.
 * Handles HEIC/HEIF conversion, mobile file type detection, and validation.
 */

// HEIC/HEIF MIME types that mobile devices (especially iPhone) produce
const HEIC_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'];

// Common image MIME types
const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', ...HEIC_TYPES];

// Document MIME types
const DOC_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

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
 * Check if a file is a valid image for upload (including HEIC from mobile).
 */
export function isValidImageFile(file: File): boolean {
  // Check MIME type
  if (IMAGE_TYPES.includes(file.type.toLowerCase())) return true;
  // Some mobile browsers don't set MIME type correctly — check extension
  const ext = getFileExtension(file.name);
  return ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext);
}

/**
 * Check if a file is a valid document (PDF, DOC, DOCX).
 */
export function isValidDocumentFile(file: File): boolean {
  if (DOC_TYPES.includes(file.type.toLowerCase())) return true;
  const ext = getFileExtension(file.name);
  return ['pdf', 'doc', 'docx'].includes(ext);
}

/**
 * Check if a file is a valid image or document for the documents section.
 */
export function isValidDocOrImageFile(file: File): boolean {
  return isValidDocumentFile(file) || isValidImageFile(file) || file.type.startsWith('image/');
}

/**
 * Get normalized file extension (lowercase, no dot).
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length < 2) return '';
  return (parts.pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Get a safe extension for storage upload path.
 * For HEIC files, we keep the original extension since Supabase stores them as-is.
 */
export function getSafeImageExtension(filename: string): string {
  const ext = getFileExtension(filename);
  if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext)) return ext;
  return 'jpg';
}

/**
 * Get a safe extension for document upload.
 */
export function getSafeDocExtension(filename: string): string {
  const ext = getFileExtension(filename);
  if (['pdf', 'doc', 'docx'].includes(ext)) return ext;
  return 'pdf';
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

/**
 * Accept string for image file inputs (mobile-friendly).
 * Includes HEIC/HEIF for iPhone compatibility.
 */
export const ACCEPT_IMAGES = '.jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif';

/**
 * Accept string for document file inputs (CV, etc.).
 */
export const ACCEPT_DOCUMENTS = '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Accept string for documents + images (general documents section).
 */
export const ACCEPT_DOCS_AND_IMAGES = `${ACCEPT_DOCUMENTS},${ACCEPT_IMAGES}`;