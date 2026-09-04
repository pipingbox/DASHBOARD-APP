import { supabase } from '@/lib/supabase';

const SIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour

/**
 * PB-STORAGE-SECURITY-001 — Secure file URL resolver.
 *
 * Never returns a raw legacy public URL. If `pathOrUrl` is a full URL, extracts
 * the canonical bucket/path and requests a short-lived signed URL.
 *
 * If the caller does not have explicit access (RLS policy), createSignedUrl
 * returns an error and this function returns null.
 *
 * @param bucket  Supabase storage bucket name (canonical, e.g. 'worker-documents')
 * @param pathOrUrl  Either a canonical storage path or a legacy public/signed URL
 */
export async function getSecureFileUrl(
  bucket: string,
  pathOrUrl: string,
): Promise<string | null> {
  if (!pathOrUrl) return null;

  const path = extractStoragePath(pathOrUrl);
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);

  if (error || !data?.signedUrl) {
    console.error('[storageHelpers] Failed to create signed URL:', error?.message);
    return null;
  }

  return data.signedUrl;
}

/**
 * Extracts the canonical storage bucket and path from a legacy public/signed URL
 * or from a bare path.
 *
 * Supported legacy formats:
 *   https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
 *   https://<project>.supabase.co/storage/v1/object/sign/<bucket>/<path>?token=...
 *
 * If the input is already a bare path, returns it with the caller-provided bucket.
 *
 * Returns null if the URL cannot be decomposed (fail-closed).
 */
export function extractStoragePathAndBucket(
  urlOrPath: string,
): { bucket: string | null; path: string | null } {
  if (!urlOrPath) return { bucket: null, path: null };

  if (!urlOrPath.startsWith('http')) {
    return { bucket: null, path: urlOrPath };
  }

  const publicMatch = urlOrPath.match(/\/object\/public\/([^/]+)\/(.+?)(?:\?|$)/);
  if (publicMatch) {
    return { bucket: publicMatch[1], path: publicMatch[2] };
  }

  const signedMatch = urlOrPath.match(/\/object\/sign\/([^/]+)\/(.+?)(?:\?|$)/);
  if (signedMatch) {
    return { bucket: signedMatch[1], path: signedMatch[2] };
  }

  return { bucket: null, path: null };
}

/**
 * Convenience wrapper that returns only the path, ignoring the extracted bucket.
 * Returns null if the URL cannot be decomposed (fail-closed).
 */
export function extractStoragePath(urlOrPath: string): string | null {
  const { path } = extractStoragePathAndBucket(urlOrPath);
  return path;
}
