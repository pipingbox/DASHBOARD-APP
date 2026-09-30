/**
 * PB-JOBS-ATS-001: candidate acquisition attribution.
 *
 * Rule (documented per ticket §8): "last attributed entry for this job before
 * applying". We persist the first-touch UTM set per user+job in localStorage
 * when the candidate lands on a job page with campaign params, and stamp the
 * application with the most recent attributed entry at apply time.
 *
 * Constraints:
 * - Values are sanitized and length-bounded (defense in depth with the DB
 *   CHECK constraints added in sql/018).
 * - No names/emails/phones; free text is rejected unless it matches a safe
 *   token pattern.
 * - No attribution → columns stay NULL ("unknown" is a valid, explicit
 *   absence; we never invent historical attribution).
 */

const STORAGE_PREFIX = 'pb_utm_';

const SAFE_VALUE = /^[a-zA-Z0-9_\-:.]{1,128}$/;

export interface JobAttribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
}

function sanitize(value: string | null, max: number): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().slice(0, max);
  if (!SAFE_VALUE.test(trimmed)) return undefined;
  return trimmed;
}

/**
 * Read UTM params from the current URL. Returns undefined when none are
 * present or all fail sanitization.
 */
export function readUtmFromLocation(search: string): JobAttribution | undefined {
  const params = new URLSearchParams(search);
  const attribution: JobAttribution = {
    utm_source: sanitize(params.get('utm_source'), 64),
    utm_medium: sanitize(params.get('utm_medium'), 64),
    utm_campaign: sanitize(params.get('utm_campaign'), 128),
    utm_content: sanitize(params.get('utm_content'), 128),
  };
  return Object.values(attribution).some(Boolean) ? attribution : undefined;
}

/**
 * Persist the most recent attributed entry for a user+job pair. Called when
 * a job page is viewed with campaign params. Overwrites previous entry for
 * that pair (last-attributed-entry rule).
 */
export function rememberAttribution(userId: string, jobId: string, attribution: JobAttribution): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${userId}_${jobId}`, JSON.stringify(attribution));
  } catch {
    // Storage unavailable (private mode / quota): attribution is best-effort.
  }
}

/**
 * Retrieve the stored attribution for a user+job pair, or undefined when
 * none exists.
 */
export function getAttribution(userId: string, jobId: string): JobAttribution | undefined {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}_${jobId}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as JobAttribution;
    // Re-sanitize on read in case storage was tampered with.
    return {
      utm_source: sanitize(parsed.utm_source ?? null, 64),
      utm_medium: sanitize(parsed.utm_medium ?? null, 64),
      utm_campaign: sanitize(parsed.utm_campaign ?? null, 128),
      utm_content: sanitize(parsed.utm_content ?? null, 128),
    };
  } catch {
    return undefined;
  }
}
