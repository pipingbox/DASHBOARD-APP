/**
 * Mobile-friendly file upload utilities.
 * Handles file type detection and validation.
 *
 * PB-DOCUMENT-UPLOAD-RELIABILITY-001: Formats restricted to those actually
 * supported by Supabase Storage bucket "worker-documents": PDF, PNG, JPEG/JPG.
 * DOC, DOCX, WebP, HEIC/HEIF are NOT supported by the bucket and must be
 * rejected before transfer with a clear message.
 */

// Image MIME types supported by worker-documents bucket
const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];

// Document MIME types supported by worker-documents bucket
const DOC_TYPES = ['application/pdf'];

// All supported MIME types
const SUPPORTED_TYPES = [...DOC_TYPES, ...IMAGE_TYPES];

// Supported extensions (lowercase, no dot)
const SUPPORTED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg'];

/**
 * Check if a file is a valid image for upload.
 * PB-DOCUMENT-UPLOAD-RELIABILITY-001: Only JPEG and PNG are supported.
 */
export function isValidImageFile(file: File): boolean {
  // Check MIME type
  if (IMAGE_TYPES.includes(file.type.toLowerCase())) return true;
  // Some mobile browsers don't set MIME type correctly — check extension
  const ext = getFileExtension(file.name);
  return ['jpg', 'jpeg', 'png'].includes(ext);
}

/**
 * Check if a file is a valid document (PDF only).
 * PB-DOCUMENT-UPLOAD-RELIABILITY-001: Only PDF is supported by the bucket.
 */
export function isValidDocumentFile(file: File): boolean {
  if (DOC_TYPES.includes(file.type.toLowerCase())) return true;
  const ext = getFileExtension(file.name);
  return ext === 'pdf';
}

/**
 * Check if a file is a valid image or document for the documents section.
 * PB-DOCUMENT-UPLOAD-RELIABILITY-001: Only PDF, PNG, JPEG/JPG are supported.
 */
export function isValidDocOrImageFile(file: File): boolean {
  return isValidDocumentFile(file) || isValidImageFile(file);
}

/**
 * @deprecated HEIC/HEIF is not supported by the worker-documents bucket.
 * This function always returns false. Use isSupportedByStorage() instead.
 */
export function isHeicFile(_file: File): boolean {
  // PB-DOCUMENT-UPLOAD-RELIABILITY-001: HEIC is not supported by Storage.
  // Always return false so no HEIC-specific handling is triggered.
  return false;
}

/**
 * Check if a file type is supported by the worker-documents bucket.
 * Returns true if the file can be uploaded, false otherwise.
 */
export function isSupportedByStorage(file: File): boolean {
  // Check MIME type first
  if (file.type && SUPPORTED_TYPES.includes(file.type.toLowerCase())) {
    return true;
  }
  // Fallback to extension check for mobile browsers with empty MIME
  const ext = getFileExtension(file.name);
  return SUPPORTED_EXTENSIONS.includes(ext);
}

/**
 * Get a user-friendly error message for unsupported file types.
 */
export function getUnsupportedTypeMessage(file: File): string {
  const ext = getFileExtension(file.name);
  const unsupportedFormats = ['doc', 'docx', 'webp', 'heic', 'heif'];

  if (unsupportedFormats.includes(ext)) {
    return `El formato .${ext} no está soportado. Por favor, convierte tu archivo a PDF, PNG o JPG.`;
  }
  return 'Tipo de archivo no soportado. Formatos aceptados: PDF, PNG, JPG.';
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
 * PB-DOCUMENT-UPLOAD-RELIABILITY-001: Only jpg/png for images.
 */
export function getSafeImageExtension(filename: string): string {
  const ext = getFileExtension(filename);
  if (['jpg', 'jpeg', 'png'].includes(ext)) return ext;
  return 'jpg';
}

/**
 * Get a safe extension for document upload.
 * PB-DOCUMENT-UPLOAD-RELIABILITY-001: Only pdf for documents.
 */
export function getSafeDocExtension(filename: string): string {
  const ext = getFileExtension(filename);
  if (ext === 'pdf') return ext;
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
 * PB-DOCUMENT-UPLOAD-RELIABILITY-001: Only JPEG and PNG supported.
 */
export const ACCEPT_IMAGES = '.jpg,.jpeg,.png,image/jpeg,image/jpg,image/png';

/**
 * Accept string for document file inputs (CV, etc.).
 * PB-DOCUMENT-UPLOAD-RELIABILITY-001: Only PDF supported.
 */
export const ACCEPT_DOCUMENTS = '.pdf,application/pdf';

/**
 * Accept string for documents + images (general documents section).
 * PB-DOCUMENT-UPLOAD-RELIABILITY-001: Only PDF, PNG, JPEG/JPG supported.
 */
export const ACCEPT_DOCS_AND_IMAGES = `${ACCEPT_DOCUMENTS},${ACCEPT_IMAGES}`;