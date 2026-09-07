import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CV_CERTIFICATION_METADATA_COLUMNS,
  mapCertificationRowsForCv,
  resolveCvCertificationIssuer,
  resolveCvCertificationName,
} from '../app/frontend/src/lib/generateCV';

/**
 * PB-LEGACY-CERT-QUERIES-001 — legacy credential/experience queries.
 *
 * Three deployed defects are pinned here:
 *
 *  1. `/worker/:id` projected `languages`, which is not a column of the profiles
 *     table. Every request failed with PostgREST 42703 and the page rendered
 *     "Profile not found or not public." for every visitor, including the owner.
 *  2. Work experience was read through `TABLES.workExperience`, an undefined key,
 *     i.e. `supabase.from(undefined)`.
 *  3. Certification metadata was read through `worker_user_id` + a join to the
 *     (empty) `certifications` catalog. On the public profile the whole fetch is
 *     now removed — `is_visible` defaults to true historically so it cannot stand
 *     for explicit public consent (PB-PUBLIC-CREDENTIAL-VISIBILITY-001 owns those
 *     semantics). In the owner's own CV the query is fixed instead.
 *
 * These tests are pure: no browser, no network, no deployed environment.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf-8');

/**
 * Same source with comments removed. Negative assertions run against this so that
 * documentation is allowed to name the very identifiers the code must not use.
 */
const readCode = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

const PUBLIC_PROFILE = 'app/frontend/src/pages/PublicWorkerProfile.tsx';
const AUTO_CV = 'app/frontend/src/hooks/useAutoCV.ts';

/** Columns verified to exist on app_14da0f1941_profiles in production. */
const PROFILE_COLUMNS = new Set([
  'full_name',
  'title',
  'location',
  'bio',
  'years_experience',
  'skills',
  'avatar_url',
  'availability_status',
  'profile_completion',
  'profile_visibility',
  'cv_visible',
]);

test.describe('public worker profile — schema-valid queries', () => {
  test('every projected profile column exists in the real schema', () => {
    const source = read(PUBLIC_PROFILE);
    const projection = source.match(/\.select\('([^']*full_name[^']*)'\)/);
    expect(projection, 'profile projection not found').not.toBeNull();

    const columns = projection![1].split(',').map((c) => c.trim());
    expect(columns.length).toBeGreaterThan(5);

    const unknown = columns.filter((c) => !PROFILE_COLUMNS.has(c));
    expect(unknown, `columns absent from app_14da0f1941_profiles: ${unknown.join(', ')}`).toEqual([]);
  });

  test('languages is never projected from profiles', () => {
    // The column does not exist; requesting it makes PostgREST reject the whole row.
    expect(readCode(PUBLIC_PROFILE)).not.toContain('languages');
  });

  test('work experience uses the canonical TABLES key', () => {
    expect(read(PUBLIC_PROFILE)).toContain('TABLES.workerExperiences');
    // TABLES.workExperience does not exist -> from(undefined).
    expect(readCode(PUBLIC_PROFILE)).not.toMatch(/TABLES\.workExperience\b/);
  });

  test('canonical TABLES keys used here really exist', () => {
    const tables = read('app/frontend/src/lib/supabase.ts');
    for (const key of ['workerExperiences', 'workerCertifications', 'profiles']) {
      expect(tables).toMatch(new RegExp(`^\\s+${key}:`, 'm'));
    }
    expect(tables).not.toMatch(/^\s+workExperience:/m);
  });
});

test.describe('public worker profile — load failure is not an empty state', () => {
  test('a failed profile query renders a controlled error, not "not found"', () => {
    const source = read(PUBLIC_PROFILE);
    expect(source).toContain('if (profileErr) {');
    expect(source).toContain('setLoadFailed(true)');
    expect(source).toContain('public-profile-load-error');
    // The distinct states must not collapse into one.
    expect(source).toContain('public-profile-not-found');
  });

  test('a failed experience query is surfaced instead of rendering zero experience', () => {
    const source = read(PUBLIC_PROFILE);
    expect(source).toContain('if (expErr) {');
    expect(source).toContain('setExperienceFailed(true)');
    expect(source).toContain('public-profile-experience-error');
    // The list is only rendered when the query actually succeeded.
    expect(source).toContain('!experienceFailed && experience.length > 0');
  });

  test('the experience query result is read, not assumed', () => {
    const source = read(PUBLIC_PROFILE);
    expect(source).toMatch(/const \{ data: expData, error: expErr \}/);
  });
});

test.describe('public worker profile — certification metadata stays fail-closed', () => {
  test('no certification query is issued from the public profile', () => {
    const source = readCode(PUBLIC_PROFILE);
    expect(source).not.toContain('TABLES.workerCertifications');
    expect(source).not.toContain('TABLES.certifications');
    expect(source).not.toContain('worker_user_id');
    expect(source).not.toContain('certification_id');
    expect(source).not.toMatch(/certifications\s*\(/);
  });

  test('no certification metadata is rendered on the public profile', () => {
    const source = readCode(PUBLIC_PROFILE);
    expect(source).not.toContain('Certifications');
    expect(source).not.toContain('certification_name');
    expect(source).not.toContain('issuing_organization');
    expect(source).not.toContain('is_visible');
    expect(source).not.toContain('visible_to_companies');
    expect(source).not.toContain('is_verified');
  });

  test('no file, storage or signed URL is referenced on the public profile', () => {
    const source = readCode(PUBLIC_PROFILE);
    for (const forbidden of [
      'file_url',
      'certificate_file_url',
      'storage_bucket',
      'storage_path',
      'getPublicUrl',
      'createSignedUrl',
      'secure-file-access',
    ]) {
      expect(source, `public profile must not reference ${forbidden}`).not.toContain(forbidden);
    }
  });

  test('the removal is documented against its owning ticket', () => {
    expect(read(PUBLIC_PROFILE)).toContain('PB-PUBLIC-CREDENTIAL-VISIBILITY-001');
  });
});

test.describe('auto CV — owner certification query', () => {
  test('queries the unified table by the owner user_id', () => {
    const source = read(AUTO_CV);
    expect(source).toContain('TABLES.workerCertifications');
    expect(source).toMatch(/\.eq\('user_id', user\.id\)/);
    expect(readCode(AUTO_CV)).not.toContain('worker_user_id');
  });

  test('the invented catalog relation is gone', () => {
    const source = readCode(AUTO_CV);
    expect(source).not.toContain('certification_id');
    expect(source).not.toMatch(/certifications\s*\(\s*name/);
    expect(source).not.toContain('issuing_body');
    expect(source).not.toContain('code,');
  });

  test('only real existing columns are selected', () => {
    const source = read(AUTO_CV);
    const projection = source.match(/\.select\('([^']*certification_name[^']*)'\)/);
    expect(projection, 'certification projection not found').not.toBeNull();

    const columns = projection![1].split(',').map((c) => c.trim());
    expect(columns).toEqual([
      'id',
      'certification_name',
      'issuing_organization',
      'credential_id',
      'issue_date',
      'expiry_date',
    ]);
  });

  test('no evidence location is selected for the CV', () => {
    const source = readCode(AUTO_CV);
    for (const forbidden of [
      'file_url',
      'certificate_file_url',
      'storage_bucket',
      'storage_path',
      'createSignedUrl',
      'getPublicUrl',
    ]) {
      expect(source, `the CV query must not select ${forbidden}`).not.toContain(forbidden);
    }
  });

  test('a query failure aborts CV generation instead of meaning "no certifications"', () => {
    const source = read(AUTO_CV);
    expect(source).toMatch(/const \{ data: certData, error: certError \}/);

    const guard = source.indexOf('if (certError)');
    const generate = source.indexOf('await generateCV(');
    expect(guard, 'certError is never inspected').toBeGreaterThan(-1);
    expect(generate).toBeGreaterThan(guard);

    // The guard must return before the PDF is produced.
    const guardBody = source.slice(guard, generate);
    expect(guardBody).toContain('return;');
  });

  test('the schema-masking casts are gone', () => {
    const source = readCode(AUTO_CV);
    expect(source).not.toContain('as Certification[]');
    expect(source).not.toMatch(/as \{ certification_id: string \}/);
  });
});

test.describe('CV certification metadata contract', () => {
  test('real canonical metadata reaches the document', () => {
    const rows = [
      {
        id: 'c1',
        certification_name: 'VCA Basic Safety',
        issuing_organization: 'SSVV',
        credential_id: 'VCA-2024-0001',
        issue_date: '2024-03-01',
        expiry_date: '2034-03-01',
      },
      {
        id: 'c2',
        certification_name: 'IRATA Level 1',
        issuing_organization: 'IRATA International',
        credential_id: null,
        issue_date: '2023-06-15',
        expiry_date: '2026-06-15',
      },
    ];

    const mapped = mapCertificationRowsForCv(rows);

    expect(mapped).toHaveLength(2);
    expect(resolveCvCertificationName(mapped[0])).toBe('VCA Basic Safety');
    expect(resolveCvCertificationIssuer(mapped[0])).toBe('SSVV');
    expect(mapped[0].credential_id).toBe('VCA-2024-0001');
    expect(mapped[0].issue_date).toBe('2024-03-01');
    expect(mapped[0].expiry_date).toBe('2034-03-01');

    expect(resolveCvCertificationName(mapped[1])).toBe('IRATA Level 1');
    expect(resolveCvCertificationIssuer(mapped[1])).toBe('IRATA International');
    expect(mapped[1].credential_id).toBeNull();
  });

  test('evidence locations are dropped even when present in the row', () => {
    const [mapped] = mapCertificationRowsForCv([
      {
        certification_name: 'VCA Basic Safety',
        issuing_organization: 'SSVV',
        file_url: 'https://x.supabase.co/storage/v1/object/public/b/u/cert.pdf',
        certificate_file_url: 'https://x.supabase.co/storage/v1/object/public/b/u/cert.pdf',
        storage_bucket: 'app_14da0f1941_certificates',
        storage_path: 'u/cert.pdf',
        qr_code_url: 'data:image/png;base64,AAAA',
        verification_url: 'https://issuer.example/verify/1',
      },
    ]);

    const serialised = JSON.stringify(mapped);
    for (const forbidden of ['file_url', 'storage_bucket', 'storage_path', 'object/public', 'token=']) {
      expect(serialised, `mapped metadata leaked ${forbidden}`).not.toContain(forbidden);
    }
    expect(Object.keys(mapped).sort()).toEqual([...CV_CERTIFICATION_METADATA_COLUMNS].sort());
  });

  test('legacy name/issuer aliases still resolve for select(*) callers', () => {
    // pages/Profile.tsx reads with select('*'), where only the canonical columns exist.
    expect(resolveCvCertificationName({ name: 'Legacy Cert' })).toBe('Legacy Cert');
    expect(resolveCvCertificationIssuer({ issuer: 'Legacy Body' })).toBe('Legacy Body');
    // Canonical wins when both are present.
    expect(
      resolveCvCertificationName({ certification_name: 'Canonical', name: 'Legacy' }),
    ).toBe('Canonical');
    expect(
      resolveCvCertificationIssuer({ issuing_organization: 'Canonical', issuer: 'Legacy' }),
    ).toBe('Canonical');
  });

  test('a nameless row degrades to an empty string instead of crashing jsPDF', () => {
    // doc.text(undefined) throws; select('*') rows have no `name`/`issuer`.
    const [mapped] = mapCertificationRowsForCv([{ credential_id: 'X' }]);
    expect(resolveCvCertificationName(mapped)).toBe('');
    expect(resolveCvCertificationIssuer(mapped)).toBe('');
  });
});
