import { supabase } from '@/lib/supabase';

const SIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour

/**
 * PB-STORAGE-SECURITY-001 — Secure file URL resolver for OWNERS.
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
 * Request a brokered signed URL for COMPANY/ADMIN viewers.
 *
 * Uses the `secure-file-access` Edge Function so the service_role key never
 * reaches the frontend. Returns null if the viewer is not authorized or the
 * file is not visible.
 */
export async function getBrokerSignedUrl(options: {
  owner_user_id: string;
  file_type: 'cv' | 'document' | 'certification';
  record_id?: string;
}): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('secure-file-access', {
    body: options,
  });

  if (error || !data?.signedUrl) {
    console.error('[storageHelpers] Broker signed URL failed:', error?.message || data?.error);
    return null;
  }

  return data.signedUrl as string;
}

/**
 * PB-GROWTH-GATE-PROFILE-E2E-001 — open a private file on the FIRST click.
 *
 * Shared popup-safe pattern (first deployed for DocumentsSection in
 * PB-PROFILE-DOCUMENT-OPEN-FIRST-CLICK-001): the blank tab is opened
 * SYNCHRONOUSLY inside the user gesture (so it stays user-initiated for popup
 * blockers), then a FRESH short-lived signed URL is resolved and the
 * already-open tab is navigated to it.
 *
 * Why not `<a href={signedUrl || '#'}>`: the browser makes its navigation
 * decision against the href at click time — before any async resolution — so
 * the first click opens a dead '#'/about:blank tab (the Fernando incident).
 * And why not a cached signed URL: it expires (1h), so a stale state copy
 * breaks the open after the page has been sitting idle.
 *
 * Note on `noopener`: passing it as a window.open() feature makes browsers
 * return null, which would break the deferred navigation. The opener link is
 * severed manually instead (`popup.opener = null`) while the tab is still
 * same-origin about:blank — equivalent isolation, usable handle.
 *
 * Popup-blocker fallback: if window.open returns null (or the user closed the
 * blank tab before resolution), navigate the CURRENT tab once the URL exists
 * — never a dead '#'. On failure the blank tab is closed and `onError` runs.
 */
export async function openSecureFileInNewTab(options: {
  bucket: string;
  sourceRef: string;
  onError?: () => void;
}): Promise<void> {
  const { bucket, sourceRef, onError } = options;
  const fail = () => {
    onError?.();
  };

  if (!sourceRef) {
    fail();
    return;
  }

  const popup = window.open('', '_blank');
  if (popup) {
    try {
      popup.opener = null;
    } catch {
      // Cross-origin guard: about:blank is same-origin, so this cannot
      // normally happen; ignore per-window isolation quirks.
    }
  }

  try {
    // Always resolve a fresh short-lived signed URL: never navigate to a
    // stale cached one that may have expired.
    const url = await getSecureFileUrl(bucket, sourceRef);
    if (url) {
      if (popup && !popup.closed) {
        popup.location.assign(url);
      } else {
        window.location.assign(url);
      }
    } else {
      popup?.close();
      fail();
    }
  } catch {
    popup?.close();
    fail();
  }
}

/**
 * Delete a single Storage object. Returns true on success.
 */
export async function deleteStorageObject(
  bucket: string,
  path: string,
): Promise<boolean> {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) {
    console.error('[storageHelpers] Failed to delete storage object:', { bucket, path, error: error.message });
    return false;
  }
  return true;
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

/* PB-STORAGE-SECURITY-001 — presence helpers live in a dependency-free module. */
export { hasStoredFile, hasStoredCv, hasStoredRecordFile } from '@/lib/filePresence';
