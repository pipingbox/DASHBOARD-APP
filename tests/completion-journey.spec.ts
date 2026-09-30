/**
 * WFA-002 — PROFILE COMPLETION JOURNEY (P0-B) — unit tests for the pure
 * presentation mapping (app/frontend/src/lib/completionJourney.ts).
 *
 * Architectural boundary: this module contains NO readiness predicates. The
 * canonical gap list comes from workforceReadiness.ts; here we only verify
 * that every canonical gap maps to a deterministic remediation target, that
 * the canonical order is preserved, that `cohort` is excluded from the
 * journey and that the signature is stable/dedupable.
 */
import { test, expect } from '@playwright/test';
import { journeySignature, toJourneyItems } from '../app/frontend/src/lib/completionJourney';
import { readinessGaps, type ReadinessGap } from '../app/frontend/src/lib/workforceReadiness';

const ALL_GAPS: ReadinessGap[] = [
  { key: 'full_name', unlocks: 'COMPLETE' },
  { key: 'title', unlocks: 'COMPLETE' },
  { key: 'location', unlocks: 'COMPLETE' },
  { key: 'years_experience', unlocks: 'COMPLETE' },
  { key: 'bio', unlocks: 'COMPLETE' },
  { key: 'skills', unlocks: 'COMPLETE' },
  { key: 'experience', unlocks: 'WORKFORCE_READY' },
  { key: 'availability', unlocks: 'WORKFORCE_READY' },
  { key: 'visibility', unlocks: 'MATCHABLE' },
];

test('every canonical gap key maps to a remediation target', () => {
  const items = toJourneyItems(ALL_GAPS);
  expect(items).toHaveLength(ALL_GAPS.length);
  for (const item of items) {
    expect(item.target).toBeTruthy();
    expect(['field', 'section', 'quick_capture']).toContain(item.target.kind);
    if (item.target.kind !== 'quick_capture') {
      expect(item.target.elementId).toMatch(/^profile-(field|section)-/);
    }
  }
});

test('canonical order is preserved (activation priority: core fields → experience → availability → visibility)', () => {
  const items = toJourneyItems(ALL_GAPS);
  expect(items.map((i) => i.key)).toEqual(ALL_GAPS.map((g) => g.key));
});

test('experience gap targets Quick Capture; field gaps target focusable inputs', () => {
  const items = toJourneyItems(ALL_GAPS);
  const exp = items.find((i) => i.key === 'experience');
  expect(exp?.target.kind).toBe('quick_capture');
  for (const key of ['full_name', 'title', 'location', 'years_experience', 'bio', 'skills'] as const) {
    const item = items.find((i) => i.key === key);
    expect(item?.target.kind).toBe('field');
  }
  expect(items.find((i) => i.key === 'availability')?.target.kind).toBe('section');
  expect(items.find((i) => i.key === 'visibility')?.target.kind).toBe('section');
});

test('cohort gap (non-canonical worker) is excluded from the journey', () => {
  const items = toJourneyItems([{ key: 'cohort', unlocks: 'COMPLETE' }, ...ALL_GAPS]);
  expect(items.find((i) => i.key === 'cohort' as never)).toBeUndefined();
  expect(items).toHaveLength(ALL_GAPS.length);
});

test('unlocks labels are carried from the canonical gap, never recomputed', () => {
  const items = toJourneyItems(ALL_GAPS);
  for (const item of items) {
    expect(item.unlocks).toBe(ALL_GAPS.find((g) => g.key === item.key)?.unlocks);
  }
});

test('signature is stable, order-sensitive and changes with the gap set', () => {
  const a = toJourneyItems(ALL_GAPS.slice(0, 3));
  const b = toJourneyItems(ALL_GAPS.slice(0, 3));
  expect(journeySignature(a)).toBe(journeySignature(b)); // dedupe: same set, no re-emit
  const c = toJourneyItems([...ALL_GAPS.slice(0, 3)].reverse());
  expect(journeySignature(c)).not.toBe(journeySignature(a));
  const d = toJourneyItems(ALL_GAPS.slice(0, 4));
  expect(journeySignature(d)).not.toBe(journeySignature(a));
});

test('integration: gaps produced by the canonical predicate map 1:1 to journey items', () => {
  // Incomplete canonical worker — the predicate yields the real gaps; the
  // journey must map every one of them without dropping or inventing items.
  const gaps = readinessGaps({
    role: 'worker',
    full_name: null,
    title: 'Welder',
    location: null,
    years_experience: null,
    bio: null,
    skills: null,
    availability_status: null,
    profile_visibility: 'private',
    cv_visible: false,
    qualifying_experience_count: 0,
    certification_count: 0,
    verified_certification_count: 0,
  });
  const items = toJourneyItems(gaps);
  expect(items.map((i) => i.key)).toEqual(gaps.map((g) => g.key));
  expect(items.length).toBeGreaterThan(0);
});
