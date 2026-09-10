import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Architectural test — MatchReadyBanner must NOT contain its own readiness
 * predicates (PB-WORKFORCE-ACTIVATION / WFA-004, D18).
 *
 * The banner consumes exclusively @/lib/workforceReadiness.ts. This test
 * fails if alternative predicates reappear in the component, guarding the
 * three rules fixed by the PO:
 *   1. years_experience ≠ structured experience;
 *   2. NULL / not_specified = UNKNOWN, not false;
 *   3. workforce cohort = role='worker', not every registered user.
 */

const bannerPath = fileURLToPath(
  new URL('../app/frontend/src/components/profile/MatchReadyBanner.tsx', import.meta.url),
);
const source = readFileSync(bannerPath, 'utf8');

test.describe('MatchReadyBanner architecture', () => {
  test('imports the canonical readiness library', () => {
    expect(source).toMatch(/from '@\/lib\/workforceReadiness'/);
  });

  test('contains no local cohort predicate (rule 3)', () => {
    // role comparisons belong to workforceReadiness.ts only.
    expect(source).not.toMatch(/role\s*===\s*['"]/);
    expect(source).not.toMatch(/role\s*!==\s*['"]/);
  });

  test('contains no local availability predicate (rule 2)', () => {
    // Availability semantics (UNKNOWN vs NOT_AVAILABLE) live in the library.
    expect(source).not.toMatch(/availability_status\s*[!=]==?\s*['"]/);
  });

  test('contains no local structured-experience substitution (rule 1)', () => {
    // years_experience must never be evaluated as a presence check here.
    expect(source).not.toMatch(/years_experience\s*[!=]=\s*null/);
  });

  test('contains no local COMPLETE field predicates', () => {
    expect(source).not.toMatch(/skills\.length\s*>/);
    expect(source).not.toMatch(/length\s*>\s*10/);
    expect(source).not.toMatch(/const\s+has[A-Z]/);
  });

  test('computes match readiness only through the canonical predicate', () => {
    expect(source).toMatch(/isMatchable\(/);
    expect(source).not.toMatch(/isMatchReady\s*=[^=]/);
  });

  test('gap rendering uses canonical readinessGaps', () => {
    expect(source).toMatch(/readinessGaps\(/);
  });
});
