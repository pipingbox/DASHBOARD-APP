import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  hasStoredFile,
  hasStoredCv,
  hasStoredRecordFile,
} from '../app/frontend/src/lib/filePresence';
import {
  calculateProfileCompletion,
  COMPLETION_WEIGHTS,
} from '../app/frontend/src/lib/profileCompletion';

/**
 * PB-STORAGE-SECURITY-001 — reader cutover.
 *
 * `*_file_url` used to be the only signal that a file existed. Once the writers
 * stop emitting public URLs, a perfectly valid upload would look absent: the CV
 * would vanish from CandidateProfile and every new profile would silently lose
 * 15 completion points. These tests pin the transitional semantics:
 *
 *   present = canonical storage metadata OR legacy URL
 *
 * They are pure: no browser, no network, no deployed environment.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf-8');

const CANDIDATE_PROFILE = 'app/frontend/src/pages/company/CandidateProfile.tsx';
const RECALCULATE = 'supabase/functions/recalculate-profiles/index.ts';

test.describe('file presence semantics', () => {
  test('canonical metadata alone means the file is present', () => {
    expect(
      hasStoredFile({
        storageBucket: 'worker-documents',
        storagePath: 'user-1/cv.pdf',
        legacyUrl: null,
      }),
    ).toBe(true);
  });

  test('legacy URL alone still means present during the migration', () => {
    expect(
      hasStoredFile({
        storageBucket: null,
        storagePath: null,
        legacyUrl: 'https://x.supabase.co/storage/v1/object/public/b/user-1/cv.pdf',
      }),
    ).toBe(true);
  });

  test('a half-written canonical location is not presence', () => {
    // A bucket without a path cannot be signed, so it must not read as a file.
    expect(hasStoredFile({ storageBucket: 'worker-documents', storagePath: null })).toBe(false);
    expect(hasStoredFile({ storageBucket: null, storagePath: 'user-1/cv.pdf' })).toBe(false);
  });

  test('no metadata at all means absent', () => {
    expect(hasStoredFile({})).toBe(false);
    expect(hasStoredFile({ storageBucket: '', storagePath: '', legacyUrl: '' })).toBe(false);
  });
});

test.describe('CV presence (CandidateProfile gates)', () => {
  test('canonical CV with cv_file_url = null is still visible', () => {
    expect(
      hasStoredCv({
        cv_storage_bucket: 'worker-documents',
        cv_storage_path: 'user-1/cv.pdf',
        cv_file_url: null,
      }),
    ).toBe(true);
  });

  test('legacy-only CV keeps working during the transition', () => {
    expect(
      hasStoredCv({
        cv_storage_bucket: null,
        cv_storage_path: null,
        cv_file_url: 'https://x.supabase.co/storage/v1/object/public/certs/user-1/cv.pdf',
      }),
    ).toBe(true);
  });

  test('a profile with no CV at all reads as absent', () => {
    expect(hasStoredCv({ cv_storage_bucket: null, cv_storage_path: null, cv_file_url: null })).toBe(false);
    expect(hasStoredCv(null)).toBe(false);
  });
});

test.describe('document and certification presence', () => {
  test('document with storage_* and file_url = null is present', () => {
    expect(
      hasStoredRecordFile({
        storage_bucket: 'worker-documents',
        storage_path: 'user-1/passport.pdf',
        file_url: null,
      }),
    ).toBe(true);
  });

  test('certification with storage_* and both legacy columns null is present', () => {
    expect(
      hasStoredRecordFile({
        storage_bucket: 'worker-documents',
        storage_path: 'user-1/vca.pdf',
        file_url: null,
        certificate_file_url: null,
      }),
    ).toBe(true);
  });

  test('certification carrying only the older certificate_file_url still resolves', () => {
    // Two legacy columns exist for certifications; neither may be dropped yet.
    expect(
      hasStoredRecordFile({
        certificate_file_url: 'https://x.supabase.co/storage/v1/object/public/certs/user-1/vca.pdf',
      }),
    ).toBe(true);
  });

  test('a record with no file reads as absent', () => {
    expect(hasStoredRecordFile({ storage_bucket: null, storage_path: null, file_url: null })).toBe(false);
    expect(hasStoredRecordFile(null)).toBe(false);
  });
});

test.describe('profile completion scoring keeps the CV points', () => {
  const baseInput = {
    full_name: 'QA Worker',
    title: 'Pipefitter',
    company: 'PipingBox',
    location: 'Antwerp',
    years_experience: 5,
    skills: ['welding'],
    bio: 'A bio long enough to count for the completion weight.',
    experience_count: 1,
    certification_count: 1,
    document_count: 1,
  };

  const cvItem = (input: Parameters<typeof calculateProfileCompletion>[0]) =>
    calculateProfileCompletion(input).items.find((i) => i.key === 'cv');

  test('canonical CV with cv_file_url = null still scores the CV weight', () => {
    const item = cvItem({
      ...baseInput,
      cv_file_url: null,
      cv_url: null,
      cv_storage_bucket: 'worker-documents',
      cv_storage_path: 'user-1/cv.pdf',
    });
    expect(item?.completed).toBe(true);
    expect(item?.weight).toBe(COMPLETION_WEIGHTS.cv);
    expect(COMPLETION_WEIGHTS.cv).toBe(15);
  });

  test('a canonical CV scores exactly the same as a legacy one', () => {
    const canonical = calculateProfileCompletion({
      ...baseInput,
      cv_file_url: null,
      cv_url: null,
      cv_storage_bucket: 'worker-documents',
      cv_storage_path: 'user-1/cv.pdf',
    }).percentage;

    const legacy = calculateProfileCompletion({
      ...baseInput,
      cv_file_url: 'https://x.supabase.co/storage/v1/object/public/certs/user-1/cv.pdf',
      cv_url: null,
    }).percentage;

    expect(canonical).toBe(legacy);
  });

  test('no CV at all loses exactly the CV weight', () => {
    const withCv = calculateProfileCompletion({
      ...baseInput,
      cv_file_url: null,
      cv_url: null,
      cv_storage_bucket: 'worker-documents',
      cv_storage_path: 'user-1/cv.pdf',
    }).percentage;

    const withoutCv = calculateProfileCompletion({
      ...baseInput,
      cv_file_url: null,
      cv_url: null,
      cv_storage_bucket: null,
      cv_storage_path: null,
    }).percentage;

    expect(withCv - withoutCv).toBe(COMPLETION_WEIGHTS.cv);
  });

  test('an external cv_url link still counts', () => {
    const item = cvItem({
      ...baseInput,
      cv_file_url: null,
      cv_url: 'https://example.com/my-cv',
      cv_storage_bucket: null,
      cv_storage_path: null,
    });
    expect(item?.completed).toBe(true);
  });
});

test.describe('backend scoring contract (recalculate-profiles)', () => {
  // The Edge Function runs on Deno and cannot be imported here, so the contract
  // is asserted on its source. Without these two lines the +15 would silently
  // disappear for every canonical upload.
  const source = read(RECALCULATE);

  test('the CV score is not gated on the legacy URL alone', () => {
    expect(source).toContain('if (hasCv(profile)) score += 15;');
    expect(source).not.toContain('if (profile.cv_file_url || profile.cv_url) score += 15;');
  });

  test('hasCv accepts the canonical location', () => {
    expect(source).toContain('profile.cv_storage_bucket && profile.cv_storage_path');
  });

  test('the profiles query actually selects the canonical columns', () => {
    // Presence would collapse back to the legacy URL if these were not fetched.
    expect(source).toMatch(/select=[^`]*cv_storage_bucket,cv_storage_path/);
  });
});

test.describe('CandidateProfile no longer gates on legacy URLs', () => {
  const source = read(CANDIDATE_PROFILE);

  test('the CV visibility gate uses canonical presence', () => {
    expect(source).toContain('const candidateHasCv = hasStoredCv(profile);');
    expect(source).toContain('const showCV = candidateHasCv && (isAdminViewer || profile.cv_visible);');
    expect(source).not.toContain('const showCV = profile.cv_file_url &&');
  });

  test('no preview or download handler aborts on a null legacy URL', () => {
    for (const abort of [
      'if (!profile?.cv_file_url) return;',
      'if (!cert.file_url) return;',
      'if (!doc.file_url) return;',
    ]) {
      expect(source).not.toContain(abort);
    }
    expect(source).toContain('if (!hasStoredCv(profile)) return;');
    expect(source).toContain('if (!hasStoredRecordFile(cert)) return;');
    expect(source).toContain('if (!hasStoredRecordFile(doc)) return;');
  });

  test('the document and certification rows render on canonical presence', () => {
    expect(source).toContain('{hasStoredRecordFile(doc) && (');
    expect(source).toContain('{certHasFile && (');
    expect(source).not.toContain('{doc.file_url && (');
  });
});

test.describe('no reader opens a raw public URL', () => {
  const READERS = [
    CANDIDATE_PROFILE,
    'app/frontend/src/components/profile/CVUploadSection.tsx',
    'app/frontend/src/components/profile/DocumentsSection.tsx',
    'app/frontend/src/components/profile/CertificationsSection.tsx',
    'app/frontend/src/components/certifications/CertificationList.tsx',
  ];

  test('legacy URLs are never used directly as an href or window.open target', () => {
    // The bytes must always come from a short-lived signed URL, whether that is
    // issued to the owner (getSecureFileUrl) or brokered (getBrokerSignedUrl).
    const offenders: string[] = [];
    for (const rel of READERS) {
      const source = read(rel);
      const bad = [
        /href=\{[^}]*(cv_file_url|certificate_file_url|\.file_url)[^}]*\}/g,
        /window\.open\(\s*[^)]*(cv_file_url|certificate_file_url|\.file_url)/g,
      ];
      for (const re of bad) {
        for (const m of source.match(re) ?? []) offenders.push(`${rel}: ${m}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('signed-URL resolution prefers the canonical path over the legacy URL', () => {
    expect(read('app/frontend/src/components/profile/DocumentsSection.tsx')).toContain(
      'const sourceRef = doc.storage_path || doc.file_url;',
    );
    expect(read('app/frontend/src/components/profile/CertificationsSection.tsx')).toContain(
      'const sourceRef = cert.storage_path || cert.file_url || cert.certificate_file_url;',
    );
  });
});
