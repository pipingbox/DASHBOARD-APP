import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * WFA-001 — Quick Experience Capture QA (source-level).
 *
 * PB-WORKFORCE-ACTIVATION (D18 §8/§9). The pure QUALIFYING EXPERIENCE
 * predicate tests live in workforce-readiness.spec.ts; this spec pins the
 * architecture rules the PO fixed for the quick capture flow:
 *
 *   1. single persistence route (shared service, no second insert/update);
 *   2. the service validates the qualifying predicate at the write boundary;
 *   3. inserts are pinned to the authenticated user (no cross-user writes);
 *   4. the quick flow does NOT expose placeholder translations;
 *   5. errors keep the form recoverable (values survive a failed save);
 *   6. the banner CTA comes from the canonical gaps, never local predicates.
 */

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const quick = read('../app/frontend/src/components/profile/ExperienceQuickCapture.tsx');
const section = read('../app/frontend/src/components/profile/WorkExperienceSection.tsx');
const service = read('../app/frontend/src/lib/workerExperienceService.ts');
const banner = read('../app/frontend/src/components/profile/MatchReadyBanner.tsx');

test.describe('WFA-001 — single persistence route', () => {
  test('Quick Capture imports the shared service for saves', () => {
    expect(quick).toMatch(/from '@\/lib\/workerExperienceService'/);
    expect(quick).toMatch(/insertWorkerExperience/);
    expect(quick).toMatch(/updateWorkerExperience/);
  });

  test('Quick Capture has NO local insert/update implementation', () => {
    expect(quick).not.toMatch(/\.from\(TABLES\.workerExperiences\)/);
    expect(quick).not.toMatch(/supabase/);
  });

  test('Full WorkExperienceSection uses the same shared service', () => {
    expect(section).toMatch(/insertWorkerExperience/);
    expect(section).toMatch(/updateWorkerExperience/);
    // The section's own submit no longer writes directly.
    const submitBlock = section.slice(
      section.indexOf('const submit'),
      section.indexOf('const confirmDelete'),
    );
    expect(submitBlock).not.toMatch(/\.insert\(/);
    expect(submitBlock).not.toMatch(/\.update\(/);
  });

  test('service validates the QUALIFYING EXPERIENCE predicate before every write', () => {
    expect(service).toMatch(/validateExperienceInput/);
    // Both write paths validate first.
    const insertBlock = service.slice(service.indexOf('export async function insertWorkerExperience'));
    const updateBlock = service.slice(service.indexOf('export async function updateWorkerExperience'));
    expect(insertBlock).toMatch(/validateExperienceInput\(input\)/);
    expect(updateBlock).toMatch(/validateExperienceInput\(input\)/);
    expect(service).toMatch(/!input\.position\.trim\(\) \|\| !input\.company_name\.trim\(\)/);
  });

  test('insert pins user_id to the authenticated user (no cross-user mutation)', () => {
    // The insert payload combines the validated input with the userId param
    // ONLY — the service signature accepts no row-level user_id override.
    expect(service).toMatch(/insert\(\{ \.\.\.buildPayload\(input\), user_id: userId \}\)/);
    expect(service).not.toMatch(/input\.user_id/);
  });
});

test.describe('WFA-001 — quick flow credibility (no placeholder translations)', () => {
  test('Quick Capture does not expose translation generation or translation fields', () => {
    expect(quick).not.toMatch(/generateTranslation/);
    expect(quick).not.toMatch(/description_en|description_es|description_fr|description_nl|description_de/);
    expect(quick).not.toMatch(/Sparkles/);
  });

  test('the placeholder translation stays quarantined in the full section (not the quick flow)', () => {
    expect(section).toMatch(/generateTranslation/);
    // The full section must keep its placeholder clearly marked.
    expect(section).toMatch(/Placeholder: in production this would call an AI translation API/);
  });
});

test.describe('WFA-001 — quick flow form rules', () => {
  test('position and company are the only required fields', () => {
    // Count the JSX `required` prop (required followed by the next prop),
    // not the word "required" in comments.
    const requiredProps = quick.match(/required\s*\n\s*className=/g) ?? [];
    expect(requiredProps.length).toBe(2);
  });

  test('recommended fields (start/end/current/country) are present but optional', () => {
    expect(quick).toMatch(/startDate/);
    expect(quick).toMatch(/currentlyWorking/);
    expect(quick).toMatch(/country/);
  });

  test('failed save keeps the form recoverable (no reset on the error path)', () => {
    const saveBlock = quick.slice(quick.indexOf('const save ='), quick.indexOf('const addAnother'));
    // The error paths return early WITHOUT calling resetForm or clearing
    // fields — the user's input survives so they can retry.
    const errorPath = saveBlock.slice(
      saveBlock.indexOf('if (!result.ok)'),
      saveBlock.indexOf('setSavedRow'),
    );
    expect(errorPath).not.toMatch(/resetForm/);
    expect(errorPath).not.toMatch(/setPosition\(''\)/);
  });

  test('post-save offers add-details and add-another', () => {
    expect(quick).toMatch(/addAnother/);
    expect(quick).toMatch(/saveDetails|Save details/);
  });
});

test.describe('WFA-001 — banner entry point uses canonical gaps only', () => {
  test('CTA appears for the canonical experience gap, not a local predicate', () => {
    expect(banner).toMatch(/gaps\.some\(\(g\) => g\.key === 'experience'\)/);
    expect(banner).toMatch(/isCanonicalWorker\(/);
    // No local readiness predicates (guarded further by match-ready-arch.spec).
    expect(banner).not.toMatch(/role\s*===\s*['"]/);
    expect(banner).not.toMatch(/const\s+has[A-Z]/);
  });

  test('banner counts experiences through the canonical qualifying predicate', () => {
    expect(banner).toMatch(/countQualifyingExperiences\(/);
    expect(banner).not.toMatch(/count: 'exact', head: true[\s\S]{0,200}workerExperiences/);
  });

  test('banner re-queries counts after a quick capture save', () => {
    expect(banner).toMatch(/onSaved=\{\(\) => setRefreshKey/);
  });
});
