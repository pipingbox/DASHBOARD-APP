/**
 * PB-JOBS-ATTRIBUTION-001: visitor-level campaign attribution.
 *
 * Two persistence levels, both in localStorage (no PII, no cookies):
 *
 * 1. VISITOR-LEVEL first/last touch — survives navigation, signup, email
 *    confirmation, login and logout, because the storage key is not tied to
 *    an authenticated user. This is what closes the funnel gap where a
 *    visitor lands via Facebook → explores → registers → confirms → logs in
 *    → returns to the job → applies.
 *
 *    FIRST TOUCH: written once, never overwritten. A later direct/organic
 *    visit never rewrites history.
 *    LAST TOUCH: updated on every NEW tagged campaign entry (valid UTM set
 *    in the URL). Direct/internal navigation never clears it.
 *
 * 2. JOB-LEVEL last attributed entry — the most recent tagged landing on a
 *    specific job, stored per job id (previously keyed by user+job, which
 *    lost pre-registration landings; the user+job key is kept as a legacy
 *    read fallback).
 *
 * Sanitization: values must match a conservative token pattern (lowercase
 * snake_case campaign/group identifiers by convention). No emails, names,
 * phones or arbitrary free text are ever stored. DB CHECK constraints
 * (sql/018/020) bound the lengths as defense in depth.
 */

const SAFE_VALUE = /^[a-zA-Z0-9_\-:.]{1,128}$/;

const FIRST_TOUCH_KEY = 'pb_attr_first_touch';
const LAST_TOUCH_KEY = 'pb_attr_last_touch';
const JOB_KEY_PREFIX = 'pb_utm_job_';
/** PB-JOBS-ATS-001 legacy key (user+job). Read fallback only. */
const LEGACY_JOB_KEY_PREFIX = 'pb_utm_';

export interface VisitAttribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

function sanitize(value: string | null, max: number): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().slice(0, max);
  if (!SAFE_VALUE.test(trimmed)) return undefined;
  return trimmed;
}

function sanitizeAttribution(raw: Partial<Record<keyof VisitAttribution, unknown>>): VisitAttribution {
  const out: VisitAttribution = {
    utm_source: sanitize(typeof raw.utm_source === 'string' ? raw.utm_source : null, 64),
    utm_medium: sanitize(typeof raw.utm_medium === 'string' ? raw.utm_medium : null, 64),
    utm_campaign: sanitize(typeof raw.utm_campaign === 'string' ? raw.utm_campaign : null, 128),
    utm_content: sanitize(typeof raw.utm_content === 'string' ? raw.utm_content : null, 128),
    utm_term: sanitize(typeof raw.utm_term === 'string' ? raw.utm_term : null, 128),
  };
  return out;
}

function hasAnyValue(a: VisitAttribution): boolean {
  return !!(a.utm_source || a.utm_medium || a.utm_campaign || a.utm_content || a.utm_term);
}

function readJson(key: string): VisitAttribution | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = sanitizeAttribution(JSON.parse(raw) as Record<string, unknown>);
    return hasAnyValue(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function writeJson(key: string, value: VisitAttribution): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode / quota): attribution is best-effort.
  }
}

/**
 * Read UTM params from a query string. Returns undefined when none are
 * present or all fail sanitization.
 */
export function readUtmFromLocation(search: string): VisitAttribution | undefined {
  const params = new URLSearchParams(search);
  const attribution = sanitizeAttribution({
    utm_source: params.get('utm_source'),
    utm_medium: params.get('utm_medium'),
    utm_campaign: params.get('utm_campaign'),
    utm_content: params.get('utm_content'),
    utm_term: params.get('utm_term'),
  });
  return hasAnyValue(attribution) ? attribution : undefined;
}

/**
 * Capture a tagged campaign landing. Called on job page views with the
 * current query string. Auth-independent (visitor-level).
 *
 * - First touch is written only when absent (never overwritten).
 * - Last touch is updated only when a VALID tagged entry arrives; direct or
 *   internal navigation (no UTMs) never clears or rewrites it.
 * - When `jobId` is provided, the job-level last attributed entry is also
 *   refreshed (last-entry-per-job rule).
 *
 * Returns the sanitized attribution when the visit was tagged.
 */
export function captureAttributionVisit(
  search: string,
  jobId?: string,
): VisitAttribution | undefined {
  const attribution = readUtmFromLocation(search);
  if (!attribution) return undefined; // direct/internal: keep stored touches

  if (!readJson(FIRST_TOUCH_KEY)) {
    writeJson(FIRST_TOUCH_KEY, attribution);
  }
  writeJson(LAST_TOUCH_KEY, attribution);
  if (jobId) {
    writeJson(`${JOB_KEY_PREFIX}${jobId}`, attribution);
  }
  return attribution;
}

/** Visitor first touch (never rewritten once set). */
export function getFirstTouch(): VisitAttribution | undefined {
  return readJson(FIRST_TOUCH_KEY);
}

/** Visitor last touch (most recent tagged campaign entry). */
export function getLastTouch(): VisitAttribution | undefined {
  return readJson(LAST_TOUCH_KEY);
}

/**
 * Job-level last attributed entry (most recent tagged landing on this job).
 * Falls back to the legacy user+job key from PB-JOBS-ATS-001, then to the
 * visitor last touch.
 */
export function getJobAttribution(jobId: string, legacyUserId?: string): VisitAttribution | undefined {
  return (
    readJson(`${JOB_KEY_PREFIX}${jobId}`) ??
    (legacyUserId ? readJson(`${LEGACY_JOB_KEY_PREFIX}${legacyUserId}_${jobId}`) : undefined) ??
    getLastTouch()
  );
}

/**
 * Traffic attribution snapshot for analytics events (closed observability
 * schema): last-touch campaign that brought the visitor + first-touch
 * source/content for funnel reconstruction. All values pass the observability
 * sanitizer upstream; only generic campaign identifiers, never PII.
 */
export function getTrafficProps(): {
  traffic_source?: string;
  traffic_medium?: string;
  traffic_campaign?: string;
  traffic_content?: string;
  first_touch_source?: string;
  first_touch_content?: string;
} {
  const last = getLastTouch();
  const first = getFirstTouch();
  return {
    traffic_source: last?.utm_source,
    traffic_medium: last?.utm_medium,
    traffic_campaign: last?.utm_campaign,
    traffic_content: last?.utm_content,
    first_touch_source: first?.utm_source,
    first_touch_content: first?.utm_content,
  };
}
