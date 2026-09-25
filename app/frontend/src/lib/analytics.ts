/**
 * GA4 analytics wrapper — PII-safe by construction.
 *
 * PB-WORKFORCE-ACTIVATION / WFA-007 (D18).
 *
 * Rules (PO D18):
 * - Event params are restricted to a CLOSED allowlist (enums declared here).
 *   No names, emails, CVs, certificates, filenames or any other PII may ever
 *   be attached to an event.
 * - gtag may be unavailable (SSR, blocked, not yet loaded): trackEvent is a
 *   no-op in that case.
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/** Closed enum of GA4 event names for workforce activation (D18 taxonomy). */
export const WORKFORCE_EVENT_NAMES = [
  'profile_field_completed',
  'experience_added',
  'availability_set',
  'visibility_public_set',
  'certification_uploaded',
  'profile_complete_reached',
  'workforce_ready_reached',
  'matchable_reached',
] as const;

export type WorkforceEventName = (typeof WORKFORCE_EVENT_NAMES)[number];

/** Closed enum of params. Only these keys may ever reach GA4. */
export const WORKFORCE_PARAM_KEYS = ['field', 'status'] as const;
export type WorkforceParamKey = (typeof WORKFORCE_PARAM_KEYS)[number];

/** Allowed `field` values (core COMPLETE fields — no free-form strings). */
export const WORKFORCE_FIELD_VALUES = [
  'full_name',
  'title',
  'location',
  'years_experience',
  'bio',
  'skills',
] as const;
export type WorkforceFieldValue = (typeof WORKFORCE_FIELD_VALUES)[number];

/** Allowed `status` values (availability states — no free-form strings). */
export const WORKFORCE_STATUS_VALUES = [
  'available_immediately',
  'available_soon',
  'available_from_date',
  'not_currently_available',
] as const;
export type WorkforceStatusValue = (typeof WORKFORCE_STATUS_VALUES)[number];

export type WorkforceEventParams = Partial<
  Record<WorkforceParamKey, WorkforceFieldValue | WorkforceStatusValue>
>;

function isAllowedValue(
  v: unknown,
  allowed: readonly string[],
): boolean {
  return typeof v === 'string' && allowed.includes(v);
}

/**
 * Send a workforce event to GA4. PII-safe: any param key or value outside the
 * closed allowlists is silently dropped (defense in depth — the event builders
 * in workforceReadinessEvents.ts only produce allowlisted values).
 */
export function trackWorkforceEvent(
  name: WorkforceEventName,
  params: WorkforceEventParams = {},
): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;

  const safeParams: Record<string, string> = {};
  if (isAllowedValue(params.field, WORKFORCE_FIELD_VALUES)) {
    safeParams.field = params.field as string;
  }
  if (isAllowedValue(params.status, WORKFORCE_STATUS_VALUES)) {
    safeParams.status = params.status as string;
  }

  window.gtag('event', name, safeParams);
}
