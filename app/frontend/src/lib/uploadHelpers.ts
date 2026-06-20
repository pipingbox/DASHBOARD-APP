import { supabase } from './supabase';

/**
 * Upload helpers for mobile-friendly file uploads.
 *
 * Solves PB-001: documents failing to upload from mobile devices.
 * - compressImage: reduces photo size before upload (mobile cameras produce 5-15MB files)
 * - uploadWithTimeout: adds a timeout so uploads don't hang indefinitely on slow connections
 */

// ── Image Compression ──────────────────────────────────────────────────────────

/**
 * Compress an image file using canvas.
 * Converts HEIC/HEIF and other formats to JPEG.
 * Skips compression for files under 500KB or non-image files.
 *
 * @param file        Original file from input
 * @param maxWidth    Max width in pixels (default 1200)
 * @param maxHeight   Max height in pixels (default 1200)
 * @param quality     JPEG quality 0-1 (default 0.8)
 * @returns           Compressed Blob (JPEG) or original file if compression not needed
 */
export function compressImage(
  file: File,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.8,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // Skip if not an image or already small enough
    if (!file.type.startsWith('image/') || file.size < 500 * 1024) {
      resolve(file);
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Scale down proportionally if needed
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob && blob.size < file.size) {
            resolve(blob);
          } else {
            // Compressed version is larger — use original
            resolve(file);
          }
        },
        'image/jpeg',
        quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      // If we can't load the image (e.g. HEIC on unsupported browser), return original
      resolve(file);
    };

    img.src = url;
  });
}

// ── Upload with Timeout ─────────────────────────────────────────────────────────

interface UploadResult {
  data: { path: string } | null;
  error: { message: string } | null;
}

/**
 * Upload a file to Supabase Storage with a timeout.
 * On mobile networks the default fetch can hang indefinitely.
 * This wrapper races the upload against a timer.
 *
 * @param bucket     Supabase Storage bucket name
 * @param path       File path inside the bucket
 * @param file       File or Blob to upload
 * @param options    Supabase upload options
 * @param timeoutMs  Timeout in milliseconds (default 30 000)
 */
export async function uploadWithTimeout(
  bucket: string,
  path: string,
  file: File | Blob,
  options: { upsert?: boolean; cacheControl?: string } = {},
  timeoutMs = 30_000,
): Promise<UploadResult> {
  const uploadPromise = supabase.storage
    .from(bucket)
    .upload(path, file, options);

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error('UPLOAD_TIMEOUT')),
      timeoutMs,
    ),
  );

  try {
    const result = await Promise.race([uploadPromise, timeoutPromise]);
    return result as UploadResult;
  } catch (err) {
    if (err instanceof Error && err.message === 'UPLOAD_TIMEOUT') {
      return {
        data: null,
        error: {
          message:
            'Upload timed out. Check your connection and try again with a smaller file.',
        },
      };
    }
    return {
      data: null,
      error: {
        message: err instanceof Error ? err.message : 'Upload failed',
      },
    };
  }
}

// ── MIME helpers ─────────────────────────────────────────────────────────────────

/**
 * Extended list of image MIME types accepted on mobile devices.
 * Includes HEIC/HEIF for iPhones.
 */
export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

/**
 * Check if a file is an accepted image type.
 * Falls back to extension check when file.type is empty (common on some mobile browsers).
 */
export function isAcceptedImage(file: File): boolean {
  if (file.type && ACCEPTED_IMAGE_TYPES.includes(file.type.toLowerCase())) {
    return true;
  }
  // Fallback: check extension (some mobile browsers don't set MIME type)
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext || '');
}

/**
 * Check if a file is an accepted document type (images + PDF).
 */
export function isAcceptedDocument(file: File): boolean {
  if (file.type === 'application/pdf') return true;
  return isAcceptedImage(file);
}
