/**
 * WFA-002 — PROFILE COMPLETION JOURNEY (P0-B).
 *
 * PRESENTATION MAPPING ONLY. This module contains NO readiness predicates:
 * the canonical gap list comes exclusively from
 * `@/lib/workforceReadiness.ts` (`readinessGaps`). Here each canonical gap
 * key is mapped to what the journey UI needs to display:
 *
 *   - current state (what the user has now);
 *   - required state (what the canonical predicate expects);
 *   - the direct action target (which surface/field fixes it);
 *   - what it unlocks (already carried by the canonical ReadinessGap).
 *
 * Priority order = the canonical order returned by `readinessGaps`
 * (COMPLETE core fields → experience → availability → visibility), which is
 * the practical activation order: no cosmetic item is ever listed, because
 * only canonical readiness requirements appear as gaps.
 *
 * Fields that are optional for readiness (photo, company, CV, documents,
 * certifications) never appear here — they are not canonical gaps.
 */

import type { ReadinessGap } from './workforceReadiness';

/** Surface/element the journey action deep-links to (anchor ids in Profile). */
export type JourneyTarget =
  | { kind: 'field'; elementId: string }
  | { kind: 'section'; elementId: string }
  | { kind: 'quick_capture' };

export interface JourneyItem {
  key: ReadinessGap['key'];
  unlocks: ReadinessGap['unlocks'];
  /** i18n key suffixes under `profile.journey.*`. */
  target: JourneyTarget;
}

/**
 * Deterministic mapping from canonical gap key to remediation target.
 * The anchor ids must exist in `Profile.tsx` / the corresponding section.
 */
const JOURNEY_TARGETS: Record<Exclude<ReadinessGap['key'], 'cohort'>, JourneyTarget> = {
  full_name: { kind: 'field', elementId: 'profile-field-full_name' },
  title: { kind: 'field', elementId: 'profile-field-title' },
  location: { kind: 'field', elementId: 'profile-field-location' },
  years_experience: { kind: 'field', elementId: 'profile-field-years_experience' },
  bio: { kind: 'field', elementId: 'profile-field-bio' },
  skills: { kind: 'field', elementId: 'profile-field-skills' },
  experience: { kind: 'quick_capture' },
  availability: { kind: 'section', elementId: 'profile-section-availability' },
  visibility: { kind: 'section', elementId: 'profile-section-visibility' },
};

/**
 * Map the canonical gap list to journey items, preserving the canonical
 * order. The `cohort` gap (user is not a canonical worker) has no in-journey
 * remediation and is filtered out — the journey only serves canonical workers.
 */
export function toJourneyItems(gaps: ReadonlyArray<ReadinessGap>): JourneyItem[] {
  return gaps
    .filter((g) => g.key !== 'cohort')
    .map((g) => ({
      key: g.key,
      unlocks: g.unlocks,
      target: JOURNEY_TARGETS[g.key as Exclude<ReadinessGap['key'], 'cohort'>],
    }));
}

/**
 * Stable signature of the current gap set, used to emit
 * `completion_journey_viewed` once per gap-set change (re-renders with the
 * same gaps never re-emit — same dedupe rule as the D18 transition events).
 */
export function journeySignature(items: ReadonlyArray<JourneyItem>): string {
  return items.map((i) => `${i.key}:${i.unlocks}`).join('|');
}
