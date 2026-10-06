import { test } from '@playwright/test';

/**
 * PB-DOCUMENT-INTAKE-001 — SUPERSEDED.
 *
 * The XHR transport this spec validated (`uploadWithTimeout` POSTing to
 * /storage/v1/object/…, `cert_upload_*` diagnostics) was replaced by the
 * shared TUS resumable uploader for certificates and CV. Its coverage —
 * happy path with real byte progress, recoverable timeout, single object +
 * single row, persistence after reload, ZERO DIFF restore, app_error=0 and
 * zero PII on the PostHog wire — now lives in `tests/document-upload-e2e.spec.ts`
 * (Android Chrome emulation, real file chooser, transport interruption,
 * resume, no_bytes_started regression).
 *
 * The file is kept (empty of tests) so existing workflow dispatch paths
 * remain valid; the isolated window now runs the superseding spec.
 */

test.describe('PB-CERT-UPLOAD-UX-001 (superseded by PB-DOCUMENT-INTAKE-001)', () => {
  test('superseded — see tests/document-upload-e2e.spec.ts', () => {
    // Intentionally empty: the transport under test no longer exists.
  });
});
