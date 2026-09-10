/**
 * Workforce readiness GA4 transitions — real D11 state transitions only.
 *
 * PB-WORKFORCE-ACTIVATION / WFA-007 (D18).
 *
 * PO rule (D18 condition 5): events of transition must represent a REAL
 * transition of the D11 state. Re-renders with unchanged data MUST NOT emit
 * duplicate events.
 *
 * How this is guaranteed:
 * 1. `readinessSnapshot()` reduces the full input to a small value object of
 *    booleans/enums (serializable, comparable by value).
 * 2. `diffReadinessEvents(prev, next)` is a pure function that only emits
 *    events for fields/states that actually changed between two snapshots.
 * 3. `useWorkforceReadinessTracking()` keeps the previous snapshot in a ref
 *    and compares snapshots BY VALUE; identical snapshots (re-render, parent
 *    re-render, navigation) produce zero events.
 */

import { useEffect, useRef } from 'react';
import {
  availabilityState,
  isComplete,
  isMatchable,
  isPublic,
  isWorkforceReady,
  type WorkforceReadinessInput,
} from './workforceReadiness';
import {
  trackWorkforceEvent,
  type WorkforceEventName,
  type WorkforceFieldValue,
  type WorkforceStatusValue,
} from './analytics';

/** Value-comparable snapshot of every D11 dimension the events depend on. */
export interface ReadinessSnapshot {
  isWorker: boolean;
  fields: {
    full_name: boolean;
    title: boolean;
    location: boolean;
    years_experience: boolean;
    bio: boolean;
    skills: boolean;
  };
  hasExperience: boolean;
  availability: 'UNKNOWN' | 'AVAILABLE' | 'NOT_AVAILABLE';
  isPublic: boolean;
  isComplete: boolean;
  isWorkforceReady: boolean;
  isMatchable: boolean;
  hasCertification: boolean;
}

export function readinessSnapshot(i: WorkforceReadinessInput): ReadinessSnapshot {
  return {
    isWorker: i.role === 'worker',
    fields: {
      full_name: !!i.full_name?.trim(),
      title: !!i.title?.trim(),
      location: !!i.location?.trim(),
      years_experience: i.years_experience != null,
      bio: !!i.bio && i.bio.trim().length > 10,
      skills: Array.isArray(i.skills) && i.skills.length > 0,
    },
    hasExperience: i.experience_count >= 1,
    availability: availabilityState(i),
    isPublic: isPublic(i),
    isComplete: isComplete(i),
    isWorkforceReady: isWorkforceReady(i),
    isMatchable: isMatchable(i),
    hasCertification: i.certification_count >= 1,
  };
}

export interface ReadinessEvent {
  name: WorkforceEventName;
  params?: { field?: WorkforceFieldValue; status?: WorkforceStatusValue };
}

/**
 * Pure diff: events for every REAL transition between two snapshots.
 * Same snapshot in / same snapshot out → [].
 */
export function diffReadinessEvents(
  prev: ReadinessSnapshot,
  next: ReadinessSnapshot,
): ReadinessEvent[] {
  const events: ReadinessEvent[] = [];
  if (!next.isWorker) return events;

  // Field-level completions (only false → true emits).
  for (const field of Object.keys(next.fields) as (keyof ReadinessSnapshot['fields'])[]) {
    if (!prev.fields[field] && next.fields[field]) {
      events.push({ name: 'profile_field_completed', params: { field } });
    }
  }

  // Structured experience (first row added).
  if (!prev.hasExperience && next.hasExperience) {
    events.push({ name: 'experience_added' });
  }

  // Availability explicitly set (UNKNOWN → AVAILABLE/NOT_AVAILABLE).
  if (
    prev.availability === 'UNKNOWN' &&
    (next.availability === 'AVAILABLE' || next.availability === 'NOT_AVAILABLE')
  ) {
    // Status param only when the stored value maps to the closed enum; the
    // caller resolves the raw string via resolveStatusParam.
    events.push({ name: 'availability_set' });
  }

  // Visibility opted in.
  if (!prev.isPublic && next.isPublic) {
    events.push({ name: 'visibility_public_set' });
  }

  // First certification uploaded.
  if (!prev.hasCertification && next.hasCertification) {
    events.push({ name: 'certification_uploaded' });
  }

  // Maturity transitions (monotone: only false → true emits).
  if (!prev.isComplete && next.isComplete) {
    events.push({ name: 'profile_complete_reached' });
  }
  if (!prev.isWorkforceReady && next.isWorkforceReady) {
    events.push({ name: 'workforce_ready_reached' });
  }
  if (!prev.isMatchable && next.isMatchable) {
    events.push({ name: 'matchable_reached' });
  }

  return events;
}

/**
 * Attach the raw availability string to an `availability_set` event when it
 * maps to the closed GA4 enum; unknown raw values emit without a param rather
 * than leaking free-form strings.
 */
export function withAvailabilityStatus(
  event: ReadinessEvent,
  rawStatus: string | null,
): ReadinessEvent {
  if (event.name !== 'availability_set') return event;
  const allowed: readonly string[] = [
    'available_immediately',
    'available_soon',
    'available_from_date',
    'not_currently_available',
  ];
  if (rawStatus && allowed.includes(rawStatus)) {
    return { ...event, params: { status: rawStatus as WorkforceStatusValue } };
  }
  return event;
}

function snapshotsEqual(a: ReadinessSnapshot, b: ReadinessSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * React hook: emit GA4 events only on REAL D11 state transitions.
 * The previous snapshot lives in a ref and is compared by value, so
 * re-renders with unchanged data never duplicate events.
 *
 * `enabled`: async data (profile, experience/certification counts) loads in
 * several steps. While enabled=false the hook records nothing; the first
 * enabled snapshot becomes the baseline WITHOUT emitting. This prevents
 * spurious transitions caused by data loading (e.g. counts 0 → 2 while the
 * page loads would otherwise fire a false `experience_added`).
 */
export function useWorkforceReadinessTracking(
  input: WorkforceReadinessInput,
  enabled = true,
): void {
  const prevRef = useRef<ReadinessSnapshot | null>(null);

  useEffect(() => {
    if (!enabled) {
      prevRef.current = null;
      return;
    }
    const next = readinessSnapshot(input);
    const prev = prevRef.current;

    if (prev && !snapshotsEqual(prev, next)) {
      const events = diffReadinessEvents(prev, next).map((e) =>
        withAvailabilityStatus(e, input.availability_status),
      );
      for (const e of events) trackWorkforceEvent(e.name, e.params);
    }

    prevRef.current = next;
    // input is a fresh object each render by design; the value comparison
    // above is what prevents duplicate emissions. Deps include `enabled` so
    // the baseline is recorded when async data finishes loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    input.role,
    input.full_name,
    input.title,
    input.location,
    input.years_experience,
    input.bio,
    input.skills,
    input.availability_status,
    input.profile_visibility,
    input.cv_visible,
    input.experience_count,
    input.certification_count,
    input.verified_certification_count,
  ]);
}
