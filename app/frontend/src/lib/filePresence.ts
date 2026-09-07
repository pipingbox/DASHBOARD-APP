/**
 * PB-STORAGE-SECURITY-001 — file presence helpers (reader cutover).
 *
 * Deliberately dependency-free: presence is a pure question about metadata, and
 * keeping it out of storageHelpers lets scoring and tests use it without pulling
 * in the Supabase client.
 */

/**
 * Whether a record actually has a stored file behind it.
 *
 * Until the reader cutover, presence was inferred from the legacy `*_file_url`
 * column, so "no URL" was read as "no file". That is no longer true: the
 * canonical location is `storage_bucket` + `storage_path`, and once writers stop
 * emitting public URLs a perfectly valid file would look absent.
 *
 * Presence therefore means: canonical metadata, OR a legacy URL while historical
 * records are migrated.
 *
 * This answers "does a file exist", NOT "may the viewer see it". Visibility
 * (`cv_visible`, `is_visible`) and authorization stay where they are, and the
 * bytes are still only reachable through a signed URL.
 */
export function hasStoredFile(source: {
  storageBucket?: string | null;
  storagePath?: string | null;
  legacyUrl?: string | null;
}): boolean {
  const hasCanonical = Boolean(source.storageBucket && source.storagePath);
  // Legacy fallback: drop this once storage_* coverage is verified and
  // secure-file-access no longer resolves files from a URL.
  return hasCanonical || Boolean(source.legacyUrl);
}

/** Presence of a candidate CV. */
export function hasStoredCv(profile: {
  cv_storage_bucket?: string | null;
  cv_storage_path?: string | null;
  cv_file_url?: string | null;
} | null | undefined): boolean {
  if (!profile) return false;
  return hasStoredFile({
    storageBucket: profile.cv_storage_bucket,
    storagePath: profile.cv_storage_path,
    legacyUrl: profile.cv_file_url,
  });
}

/**
 * Presence of a document or certification file.
 *
 * Certifications carry two legacy columns; both are accepted while migrating.
 */
export function hasStoredRecordFile(record: {
  storage_bucket?: string | null;
  storage_path?: string | null;
  file_url?: string | null;
  certificate_file_url?: string | null;
} | null | undefined): boolean {
  if (!record) return false;
  return hasStoredFile({
    storageBucket: record.storage_bucket,
    storagePath: record.storage_path,
    legacyUrl: record.file_url || record.certificate_file_url,
  });
}
