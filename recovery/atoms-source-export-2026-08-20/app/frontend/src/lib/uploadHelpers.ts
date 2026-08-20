/**
 * Upload Helpers for Mobile-Reliable Supabase Storage Uploads
 *
 * Provides:
 * - compressImage(): Client-side image compression before upload
 * - uploadWithTimeout(): Wrapper with 30s timeout for Supabase Storage uploads
 * - isAcceptedImage(): MIME validation with HEIC/HEIF support
 * - isAcceptedDocument(): Document validation for PDFs
 */

import { supabase, SUPABASE_URL } from '@/lib/supabase';

/**
 * Compress an image file on the client before uploading.
 * Uses canvas to resize and reduce quality.
 * Returns original file if compression fails or file is not an image.
 */
export async function compressImage(
  file: File,
  options: { maxWidth?: number; maxHeight?: number; quality?: number } = {}
): Promise<File> {
  const { maxWidth = 1200, maxHeight = 1200, quality = 0.8 } = options;

  // Only compress raster images (not HEIC — browser can't decode those in canvas)
  const compressibleTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!compressibleTypes.includes(file.type.toLowerCase())) {
    console.log('[compressImage] Skipping compression for type:', file.type || 'unknown');
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;

    // Calculate new dimensions maintaining aspect ratio
    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.warn('[compressImage] Could not get canvas context, returning original');
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality,
    });

    const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });

    console.log('[compressImage] Compressed:', {
      originalSize: file.size,
      compressedSize: compressedFile.size,
      reduction: `${Math.round((1 - compressedFile.size / file.size) * 100)}%`,
      dimensions: `${width}x${height}`,
    });

    // Only use compressed version if it's actually smaller
    if (compressedFile.size < file.size) {
      return compressedFile;
    }
    return file;
  } catch (err) {
    console.warn('[compressImage] Compression failed, using original:', err);
    return file;
  }
}

/**
 * Upload a file to Supabase Storage using XHR with real abort on timeout.
 * Prevents infinite hanging on mobile networks.
 * Uses XHR instead of fetch/SDK so the upload is truly cancelled on timeout.
 * Includes 1 automatic retry on timeout/network error.
 *
 * @param bucket - Storage bucket name
 * @param path - File path within the bucket
 * @param file - File or Blob to upload
 * @param options - Upload options (upsert, cacheControl, timeout)
 * @returns Object with data (path) or error
 */
export async function uploadWithTimeout(
  bucket: string,
  path: string,
  file: File | Blob,
  options: {
    upsert?: boolean;
    cacheControl?: string;
    timeoutMs?: number;
    contentType?: string;
    onProgress?: (percent: number) => void;
  } = {}
): Promise<{ data: { path: string } | null; error: Error | null }> {
  const { upsert = true, cacheControl = '3600', timeoutMs = 120000, contentType, onProgress } = options;

  const resolvedContentType = contentType || (file instanceof File ? resolveFileMime(file) : 'application/octet-stream');

  console.log('[uploadWithTimeout] Starting upload:', {
    bucket,
    path,
    size: file.size,
    type: resolvedContentType,
    timeoutMs,
    upsert,
  });

  // Attempt upload with 1 retry on timeout/network error
  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await _doXhrUpload(bucket, path, file, {
      upsert,
      cacheControl,
      timeoutMs,
      contentType: resolvedContentType,
      onProgress,
      attempt,
    });

    if (result.error) {
      const isRetryable = result.retryable && attempt < 2;
      console.warn(`[uploadWithTimeout] Attempt ${attempt} failed:`, {
        error: result.error.message,
        retryable: result.retryable,
        willRetry: isRetryable,
      });

      if (isRetryable) {
        // Wait 2s before retry
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      return { data: null, error: result.error };
    }

    return { data: { path }, error: null };
  }

  return { data: null, error: new Error('Upload failed after retries.') };
}

async function _doXhrUpload(
  bucket: string,
  path: string,
  file: File | Blob,
  options: {
    upsert: boolean;
    cacheControl: string;
    timeoutMs: number;
    contentType: string;
    onProgress?: (percent: number) => void;
    attempt: number;
  }
): Promise<{ error: Error | null; retryable: boolean }> {
  const { upsert, cacheControl, timeoutMs, contentType, onProgress, attempt } = options;
  const startTime = Date.now();

  // Get current session token
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  if (!accessToken) {
    return { error: new Error('Session expired. Please sign in again.'), retryable: false };
  }

  // Normalize file to Blob for mobile compatibility
  let uploadBody: Blob;
  try {
    const arrayBuffer = await file.arrayBuffer();
    uploadBody = new Blob([arrayBuffer], { type: contentType });
  } catch {
    uploadBody = file;
  }

  // Build Supabase Storage REST URL
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;

  console.log(`[uploadWithTimeout] XHR attempt ${attempt}:`, {
    url: uploadUrl,
    size: uploadBody.size,
    contentType,
    timeoutMs,
  });

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let resolved = false;

    const safeResolve = (result: { error: Error | null; retryable: boolean }) => {
      if (resolved) return;
      resolved = true;
      const elapsed = Date.now() - startTime;
      console.log(`[uploadWithTimeout] XHR resolved (attempt ${attempt}) after ${elapsed}ms:`, {
        success: !result.error,
        error: result.error?.message || null,
      });
      resolve(result);
    };

    // Track upload progress
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress?.(percent);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        safeResolve({ error: null, retryable: false });
      } else {
        let errorMsg = `Upload failed (HTTP ${xhr.status})`;
        try {
          const resp = JSON.parse(xhr.responseText);
          errorMsg = resp.message || resp.error || errorMsg;
        } catch {
          // use default error message
        }
        // 4xx errors are not retryable (auth, permissions, etc.)
        const retryable = xhr.status >= 500 || xhr.status === 0;
        safeResolve({ error: new Error(errorMsg), retryable });
      }
    });

    xhr.addEventListener('error', () => {
      safeResolve({
        error: new Error('Network error during upload. Please check your connection.'),
        retryable: true,
      });
    });

    xhr.addEventListener('abort', () => {
      safeResolve({
        error: new Error('Upload was cancelled.'),
        retryable: false,
      });
    });

    xhr.addEventListener('timeout', () => {
      safeResolve({
        error: new Error(`Upload timed out after ${timeoutMs / 1000}s. Your connection may be too slow — try on WiFi or a stronger signal.`),
        retryable: true,
      });
    });

    // Fallback hang guard: if nothing fires within timeout + 10s
    const hangGuard = setTimeout(() => {
      try { xhr.abort(); } catch { /* ignore */ }
      safeResolve({
        error: new Error('Upload did not respond. Please try again.'),
        retryable: true,
      });
    }, timeoutMs + 10000);

    xhr.addEventListener('loadend', () => {
      clearTimeout(hangGuard);
      // Ensure resolution if not already
      safeResolve({ error: new Error('Upload ended unexpectedly.'), retryable: true });
    });

    xhr.open('POST', uploadUrl);
    xhr.timeout = timeoutMs;
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('Cache-Control', cacheControl);
    if (upsert) {
      xhr.setRequestHeader('x-upsert', 'true');
    }

    xhr.send(uploadBody);
  });
}

/**
 * Check if a file is an accepted image type (including HEIC/HEIF from mobile).
 * Validates both MIME type and file extension as fallback.
 */
export function isAcceptedImage(file: File): boolean {
  const acceptedMimes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence',
  ];
  const acceptedExts = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];

  const mimeOk = file.type && acceptedMimes.includes(file.type.toLowerCase());
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const extOk = acceptedExts.includes(ext);

  return mimeOk || extOk;
}

/**
 * Check if a file is an accepted document type (PDF).
 * Validates both MIME type and file extension as fallback.
 */
export function isAcceptedDocument(file: File): boolean {
  const acceptedMimes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];
  const acceptedExts = ['pdf', 'doc', 'docx'];

  const mimeOk = file.type && acceptedMimes.includes(file.type.toLowerCase());
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const extOk = acceptedExts.includes(ext);

  return mimeOk || extOk;
}

/**
 * Get the resolved MIME type for a file.
 * Falls back to extension-based detection when browser reports empty/generic MIME.
 */
export function resolveFileMime(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') {
    return file.type;
  }
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return mimeMap[ext] || 'application/octet-stream';
}