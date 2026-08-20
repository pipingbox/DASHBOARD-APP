import { supabase } from '@/lib/supabase';

const SIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour

/**
 * Returns a signed download URL for a private storage file.
 *
 * Handles two cases:
 *  1. Legacy public URLs (start with http) — returned as-is for backward compat.
 *  2. Storage paths — generates a short-lived signed URL.
 *
 * @param bucket  Supabase storage bucket name
 * @param pathOrUrl  Either a storage path ("userId/file.pdf") or a legacy public URL
 */
export async function getSecureFileUrl(
  bucket: string,
  pathOrUrl: string,
): Promise<string | null> {
  if (!pathOrUrl) return null;

  // Legacy: already a full URL — return as-is
  if (pathOrUrl.startsWith('http')) return pathOrUrl;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(pathOrUrl, SIGNED_URL_EXPIRY_SECONDS);

  if (error || !data?.signedUrl) {
    console.error('[storageHelpers] Failed to create signed URL:', error?.message);
    return null;
  }

  return data.signedUrl;
}

/**
 * Extracts the storage path from either a full public URL or a bare path.
 * Useful for storing only the path in the DB when migrating from public URLs.
 */
export function extractStoragePath(bucket: string, urlOrPath: string): string {
  if (!urlOrPath.startsWith('http')) return urlOrPath;

  // Try to extract path after /object/public/{bucket}/
  const publicMarker = `/object/public/${bucket}/`;
  const idx = urlOrPath.indexOf(publicMarker);
  if (idx !== -1) return urlOrPath.slice(idx + publicMarker.length);

  // Fallback: return as-is (legacy URL that we can't decompose)
  return urlOrPath;
}
