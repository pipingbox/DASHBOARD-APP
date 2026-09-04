import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * CV upload smoke test for PB-STORAGE-SECURITY-001 cutover.
 *
 * Covers: file upload → Supabase Storage → profile DB upsert
 * (cv_file_url, cv_storage_bucket, cv_storage_path) → UI refresh → removal.
 *
 * Requires a disposable QA account (email starts with "qa.e2e") with
 * worker role. Credentials are read from env vars and never committed:
 *
 *   E2E_TEST_EMAIL=...
 *   E2E_TEST_PASSWORD=...
 *   VITE_SUPABASE_URL=...
 *   VITE_SUPABASE_ANON_KEY=...
 *   PREVIEW_URL=https://app.pipingbox.com   # optional, defaults to playwright.config.ts baseURL
 *
 * If credentials are missing, the whole file is skipped so pipelines
 * without a provisioned QA account do not fail hard.
 */

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const hasCreds = Boolean(EMAIL && PASSWORD && SUPABASE_URL && SUPABASE_ANON_KEY);

async function login(page: any) {
  await page.goto('/login');
  await page.locator('#email').fill(EMAIL!);
  await page.locator('#password').fill(PASSWORD!);
  await page.getByRole('button', { name: /sign in|iniciar sesi/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

/** Build a minimal valid PDF blob in memory. */
function makeMinimalPDF(): Buffer {
  const pdf = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n109\n%%EOF`;
  return Buffer.from(pdf, 'utf-8');
}

test.describe('CV upload smoke test', () => {
  test.skip(!hasCreds, 'E2E QA credentials not set -- skipping CV upload smoke test');

  test('uploads a CV, persists storage metadata, refreshes UI, then removes it', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await login(page);
    await page.goto('/profile');
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 10_000 });

    // Wait for the CV section to hydrate.
    const cvSection = page.locator('section').filter({ hasText: /CV|curriculum/i });
    await expect(cvSection).toBeVisible({ timeout: 10_000 });

    // Generate a unique file name so we can detect it after refresh.
    const uniqueId = Date.now();
    const fileName = `cv-smoke-${uniqueId}.pdf`;
    const fileBuffer = makeMinimalPDF();

    // Use a hidden file input if present, otherwise fall back to the label wrapper.
    const fileInput = cvSection.locator('input[type="file"]').first();
    const isHiddenInput = await fileInput.isVisible().catch(() => false);

    if (isHiddenInput) {
      await fileInput.setInputFiles({ name: fileName, mimeType: 'application/pdf', buffer: fileBuffer });
    } else {
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        cvSection.locator('label').first().click(),
      ]);
      await fileChooser.setFiles({ name: fileName, mimeType: 'application/pdf', buffer: fileBuffer });
    }

    // Wait for success feedback.
    await expect(page.getByText(/uploaded|subido|CV/i)).toBeVisible({ timeout: 30_000 });
    await expect(cvSection.getByText(fileName)).toBeVisible({ timeout: 10_000 });

    // Capture the signed view link and verify it is a signed URL, not a raw public URL.
    const viewLink = cvSection.locator('a[href^="https://"]').first();
    await expect(viewLink).toBeVisible({ timeout: 10_000 });
    const href = await viewLink.getAttribute('href');
    expect(href).toMatch(/[?&]token=/);
    expect(href).not.toMatch(/\/object\/public\//);

    // Verify DB persistence by refreshing the page: the file name must survive reload.
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/profile/, { timeout: 10_000 });
    await expect(cvSection.getByText(fileName)).toBeVisible({ timeout: 10_000 });

    // Get the current user so we can verify the Storage object directly.
    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { session },
    } = await supabase.auth.signInWithPassword({
      email: EMAIL!,
      password: PASSWORD!,
    });
    expect(session?.user).toBeTruthy();
    const userId = session!.user.id;

    const { data: profile } = await supabase
      .from('app_14da0f1941_profiles')
      .select('cv_storage_bucket, cv_storage_path')
      .eq('user_id', userId)
      .single();
    expect(profile).toBeTruthy();
    expect(profile!.cv_storage_bucket).toBeTruthy();
    expect(profile!.cv_storage_path).toBeTruthy();

    // Verify the Storage object actually exists.
    const { data: objects, error: listError } = await supabase.storage
      .from(profile!.cv_storage_bucket)
      .list(profile!.cv_storage_path.split('/').slice(0, -1).join('/'), {
        search: profile!.cv_storage_path.split('/').pop(),
      });
    expect(listError).toBeNull();
    expect((objects || []).length).toBeGreaterThanOrEqual(1);

    // Clean up: remove the CV so no test artifact persists.
    const removeButton = cvSection.locator('button').filter({ has: page.locator('svg') }).last();
    await removeButton.click();
    await expect(cvSection.getByText(fileName)).not.toBeVisible({ timeout: 10_000 });

    // Verify the DB reference was cleared.
    const { data: profileAfter } = await supabase
      .from('app_14da0f1941_profiles')
      .select('cv_storage_bucket, cv_storage_path, cv_file_url')
      .eq('user_id', userId)
      .single();
    expect(profileAfter?.cv_file_url).toBeNull();
    expect(profileAfter?.cv_storage_path).toBeNull();

    // Verify the Storage object no longer exists.
    const { data: objectsAfter, error: listErrorAfter } = await supabase.storage
      .from(profile!.cv_storage_bucket)
      .list(profile!.cv_storage_path.split('/').slice(0, -1).join('/'), {
        search: profile!.cv_storage_path.split('/').pop(),
      });
    expect(listErrorAfter).toBeNull();
    expect((objectsAfter || []).length).toBe(0);

    await supabase.auth.signOut();

    expect(errors).toEqual([]);
  });
});
