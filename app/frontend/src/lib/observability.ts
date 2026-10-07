/**
 * Canonical observability layer — PB-OBSERVABILITY-001 (PIPINGBOX DAILY INTELLIGENCE).
 *
 * Product analytics / errors go to PostHog (project 271316). GA4 keeps ONLY the
 * WFA-007 workforce taxonomy (see analytics.ts). No event is duplicated
 * indiscriminately between both systems (PB-DAILY-INTELLIGENCE-001 §3).
 *
 * Rules (PO, 2026-09-10):
 * - CLOSED event schemas: every event name and every property key is declared
 *   here. Anything outside the allowlist is dropped before leaving the app.
 * - NO PII: never email, phone, name, CV, certificates, filenames, form input
 *   or the referral code itself. String values are additionally scanned and
 *   redacted (defense in depth).
 * - Anonymous ID survives until auth; after login it is linked to the
 *   technical auth.user.id via identify(). Technical IDs only.
 * - Fail-open: an observability failure must NEVER break the app. Every call
 *   is guarded and initialization errors are swallowed after a warn.
 * - Anti-duplication: re-renders must not re-emit; callers pass a dedupeKey.
 * - Session replay stays DISABLED until masking, route blocking, sampling and
 *   consent are approved (PO action 7) — do not flip that flag here.
 */

// NOTE: relative import (not '@/') so Playwright specs can import this module
// without Vite alias resolution — same pattern as workforceReadiness.ts.
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Closed taxonomy
// ---------------------------------------------------------------------------

export const OBS_EVENT_NAMES = [
  'page_viewed',
  'signup_started',
  'auth_created',
  'signup_confirmation_required',
  'confirmation_resend_requested',
  'confirmation_resend_succeeded',
  'confirmation_resend_failed',
  'email_confirmation_completed',
  'signin_blocked_unconfirmed',
  'onboarding_started',
  'onboarding_step_reached',
  'onboarding_completed',
  'referral_link_opened',
  'referral_captured',
  'app_error',
  // PB-LIBRARY-COMPLETE-001 — Library V1 usage (Stream B).
  'library_viewed',
  'library_search_performed',
  'library_filter_selected',
  'library_item_opened',
  'library_resource_action',
  'library_empty_result',
  'library_access_error',
  // PB-JOBS-PILOT-003 — Jobs funnel (§14–§15). Only stages with a real
  // product state are instrumented: view → start → submit. Later stages
  // (candidate_reviewed/forwarded/selected) have no workflow yet and are
  // documented as a PRODUCT GAP, not invented here.
  'job_viewed',
  'apply_started',
  'apply_submitted',
  // PB-CERT-UPLOAD-UX-001 — certificate upload funnel (started → completed |
  // failed). Closed property enums (bucket/size_bucket/mime/error_category)
  // are validated in buildEventProps; no file names, paths, UIDs or signed
  // URLs ever enter the payload.
  'cert_upload_started',
  'cert_upload_completed',
  'cert_upload_failed',
  // PB-DOCUMENT-INTAKE-001 — unified document intake funnel (Vía A: TUS
  // resumable; Vía B: inbound email, events reserved for that delivery).
  // Closed property enums (document_type/channel/transport/mime_category/
  // size_bucket/progress_checkpoint/error_category/extraction_status) are
  // validated in buildEventProps; no file names, paths, UIDs, URLs or email
  // content ever enter the payload.
  'document_upload_started',
  'document_upload_progress_checkpoint',
  'document_upload_paused',
  'document_upload_resumed',
  'document_upload_retrying',
  'document_upload_completed',
  'document_upload_failed',
  'document_upload_cancelled',
  'document_email_reference_created',
  'document_email_received',
  'document_email_rejected',
  'document_extraction_completed',
  'document_user_confirmed',
  'document_promoted',
  // PB-AUTH-CALLBACK-STALE-APP-001 — deterministic auth callback + stale app
  // version + path normalization. Closed enums (provider/error_category/
  // recovery_action) validated in buildEventProps; no URL, query string,
  // OAuth code, token, email, UUID or contaminated original path ever enters
  // the payload.
  'auth_callback_started',
  'auth_callback_completed',
  'auth_callback_failed',
  'auth_callback_timeout',
  'stale_app_version_detected',
  'app_update_requested',
  'invalid_path_normalized',
] as const;

export type ObsEventName = (typeof OBS_EVENT_NAMES)[number];

/**
 * PB-JOBS-ATTRIBUTION-001 — campaign attribution props shared by funnel
 * events (signup → email confirmation → job viewed → apply → onboarding).
 * Values are generic campaign/group identifiers (snake_case, sanitized by
 * buildEventProps) supplied by lib/jobs/attribution.ts. NEVER PII.
 */
const TRAFFIC_ATTRIBUTION_KEYS = [
  'traffic_source',
  'traffic_medium',
  'traffic_campaign',
  'traffic_content',
  'first_touch_source',
  'first_touch_content',
] as const;

/** Allowed property keys per event. Anything else is dropped. */
const EVENT_PROP_KEYS: Record<ObsEventName, readonly string[]> = {
  page_viewed: ['route', 'origin', 'locale', 'device_type'],
  signup_started: ['origin', 'account_type', ...TRAFFIC_ATTRIBUTION_KEYS],
  auth_created: ['origin', 'account_type', ...TRAFFIC_ATTRIBUTION_KEYS],
  signup_confirmation_required: [
    'route',
    'correlation_id',
    'provider',
    'status',
    'reason_code',
    'attempt_bucket',
  ],
  confirmation_resend_requested: [
    'route',
    'correlation_id',
    'provider',
    'status',
    'reason_code',
    'attempt_bucket',
  ],
  confirmation_resend_succeeded: [
    'route',
    'correlation_id',
    'provider',
    'status',
    'reason_code',
    'attempt_bucket',
  ],
  confirmation_resend_failed: [
    'route',
    'correlation_id',
    'provider',
    'status',
    'reason_code',
    'attempt_bucket',
  ],
  email_confirmation_completed: [
    'route',
    'correlation_id',
    'provider',
    'status',
    'reason_code',
    'attempt_bucket',
    ...TRAFFIC_ATTRIBUTION_KEYS,
  ],
  signin_blocked_unconfirmed: [
    'route',
    'correlation_id',
    'provider',
    'status',
    'reason_code',
    'attempt_bucket',
  ],
  onboarding_started: ['account_type'],
  // PB-LIBRARY-COMPLETE-001 — Library V1 usage (Stream B). All values are
  // catalog IDs / closed enums / counts — never user free text.
  library_viewed: ['results_count'],
  library_search_performed: ['query_length', 'results_count'],
  library_filter_selected: ['filter_type', 'filter_value', 'results_count'],
  library_item_opened: ['component_id', 'component_family'],
  library_resource_action: ['component_id', 'resource_type'],
  library_empty_result: ['query_length', 'filter_count'],
  library_access_error: ['component_id', 'resource_type', 'reason_code'],
  // PB-JOBS-PILOT-003 — Jobs funnel. job_id is a technical UUID (validated
  // against JOB_ID_RE, kept raw like component_id); country/trade are closed
  // job metadata, never candidate data. NO candidate identity anywhere.
  // PB-JOBS-ATTRIBUTION-001 — traffic_* / first_touch_* campaign attribution.
  job_viewed: ['job_id', 'source_language', 'rendered_locale', 'country', 'trade', ...TRAFFIC_ATTRIBUTION_KEYS],
  apply_started: ['job_id', 'source_language', 'rendered_locale', 'country', 'trade', ...TRAFFIC_ATTRIBUTION_KEYS],
  apply_submitted: ['job_id', 'source_language', 'rendered_locale', 'country', 'trade', ...TRAFFIC_ATTRIBUTION_KEYS],
  onboarding_step_reached: ['step', 'account_type'],
  onboarding_completed: ['account_type', ...TRAFFIC_ATTRIBUTION_KEYS],
  referral_link_opened: ['origin', 'route'],
  referral_captured: ['origin'],
  app_error: [
    'error_name',
    'error_message',
    'component_top',
    'route',
    'incident_code',
    'origin',
    'app_version',
    'browser',
    'os',
    'device_type',
    'timezone',
    'account_type',
    'onboarding_status',
  ],
  // PB-CERT-UPLOAD-UX-001 — certificate upload diagnostics. Logical bucket
  // only (never the Storage URL or signed link), size as a coarse bucket
  // (never exact bytes of a possibly unique file), MIME restricted to the
  // accepted document/image set, error_category closed for future incident
  // triage (timeout vs network vs storage_4xx/5xx vs unknown).
  cert_upload_started: [
    'route',
    'correlation_id',
    'bucket',
    'size_bucket',
    'mime',
  ],
  cert_upload_completed: [
    'route',
    'correlation_id',
    'bucket',
    'size_bucket',
    'mime',
    'duration_ms',
    'attempt_number',
  ],
  cert_upload_failed: [
    'route',
    'correlation_id',
    'bucket',
    'size_bucket',
    'mime',
    'duration_ms',
    'attempt_number',
    'error_category',
  ],
  // PB-DOCUMENT-INTAKE-001 — unified document intake funnel. Props are the
  // PO-approved allowlist ONLY: never file name, email, UID, storage path,
  // signed URL, certificate number, content, OCR text or token. All values
  // go through the closed-enum validation below.
  document_upload_started: [
    'route',
    'correlation_id',
    'document_type',
    'channel',
    'transport',
    'mime_category',
    'size_bucket',
  ],
  document_upload_progress_checkpoint: [
    'route',
    'correlation_id',
    'document_type',
    'channel',
    'transport',
    'mime_category',
    'size_bucket',
    'progress_checkpoint',
    'resumed',
  ],
  document_upload_paused: [
    'route',
    'correlation_id',
    'document_type',
    'channel',
    'transport',
    'mime_category',
    'size_bucket',
    'attempt_number',
    'duration_ms',
    'resumed',
  ],
  document_upload_resumed: [
    'route',
    'correlation_id',
    'document_type',
    'channel',
    'transport',
    'mime_category',
    'size_bucket',
    'attempt_number',
    'duration_ms',
    'resumed',
  ],
  document_upload_retrying: [
    'route',
    'correlation_id',
    'document_type',
    'channel',
    'transport',
    'mime_category',
    'size_bucket',
    'attempt_number',
    'resumed',
  ],
  document_upload_completed: [
    'route',
    'correlation_id',
    'document_type',
    'channel',
    'transport',
    'mime_category',
    'size_bucket',
    'duration_ms',
    'attempt_number',
    'resumed',
  ],
  document_upload_failed: [
    'route',
    'correlation_id',
    'document_type',
    'channel',
    'transport',
    'mime_category',
    'size_bucket',
    'duration_ms',
    'attempt_number',
    'error_category',
    'resumed',
  ],
  document_upload_cancelled: [
    'route',
    'correlation_id',
    'document_type',
    'channel',
    'transport',
    'mime_category',
    'size_bucket',
    'duration_ms',
    'attempt_number',
    'resumed',
  ],
  // Vía B (inbound email) — taxonomy declared now, emitted only by the
  // email pipeline once that delivery is approved and deployed.
  document_email_reference_created: [
    'route',
    'correlation_id',
    'document_type',
    'channel',
    'transport',
  ],
  document_email_received: [
    'route',
    'correlation_id',
    'document_type',
    'channel',
    'transport',
    'mime_category',
    'size_bucket',
  ],
  document_email_rejected: [
    'route',
    'correlation_id',
    'document_type',
    'channel',
    'transport',
    'mime_category',
    'size_bucket',
    'error_category',
  ],
  document_extraction_completed: [
    'route',
    'correlation_id',
    'document_type',
    'channel',
    'transport',
    'extraction_status',
  ],
  document_user_confirmed: [
    'route',
    'correlation_id',
    'document_type',
    'channel',
    'transport',
  ],
  document_promoted: [
    'route',
    'correlation_id',
    'document_type',
    'channel',
    'transport',
    'mime_category',
    'size_bucket',
  ],
  // PB-AUTH-CALLBACK-STALE-APP-001 — deterministic callback + version checks.
  // environment/app_version are attached automatically by trackEvent.
  // target_version is a build SHA validated against a closed shape (below),
  // never a URL or free text. route_normalized is the CLEAN path only — the
  // contaminated original is never emitted.
  auth_callback_started: ['route', 'correlation_id', 'provider'],
  auth_callback_completed: ['route', 'correlation_id', 'provider', 'duration_ms'],
  auth_callback_failed: [
    'route',
    'correlation_id',
    'provider',
    'duration_ms',
    'error_category',
    'recovery_action',
  ],
  auth_callback_timeout: [
    'route',
    'correlation_id',
    'provider',
    'duration_ms',
    'error_category',
    'recovery_action',
  ],
  stale_app_version_detected: ['route', 'target_version'],
  app_update_requested: ['route', 'recovery_action'],
  invalid_path_normalized: ['route_normalized'],
};

export const OBS_ORIGINS = ['direct', 'referral', 'organic', 'campaign'] as const;
export type ObsOrigin = (typeof OBS_ORIGINS)[number];

// PB-CERT-UPLOAD-UX-001 — closed enums for certificate-upload diagnostics.
// The app caps certificate files at 10 MB, so the coarse size buckets cover
// the whole accepted range; 'other' keeps the MIME set closed when a browser
// reports a generic type.
export const CERT_UPLOAD_BUCKETS = ['certificates'] as const;
export const CERT_SIZE_BUCKETS = ['<=100kb', '100kb-1mb', '1mb-5mb', '5mb-10mb'] as const;
export const CERT_UPLOAD_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
  'other',
] as const;
export const CERT_ERROR_CATEGORIES = ['timeout', 'network', 'storage_4xx', 'storage_5xx', 'unknown'] as const;

// PB-DOCUMENT-INTAKE-001 — closed enums for the unified document intake
// funnel (Vía A TUS + Vía B inbound email). Superset of the legacy
// CERT_ERROR_CATEGORIES so historical events stay valid.
export const DOC_TYPES = ['certificate', 'cv'] as const;
export const DOC_CHANNELS = ['direct', 'email', 'admin'] as const;
export const DOC_TRANSPORTS = ['tus', 'inbound_email'] as const;
export const DOC_MIME_CATEGORIES = ['pdf', 'image', 'document', 'unknown'] as const;
export const DOC_SIZE_BUCKETS = ['<=100kb', '100kb-1mb', '1mb-5mb', '5mb-10mb'] as const;
export const DOC_PROGRESS_CHECKPOINTS = [25, 50, 75] as const;
export const DOC_ERROR_CATEGORIES = [
  'file_read',
  'no_bytes_started',
  'network',
  'timeout',
  'auth',
  'storage_4xx',
  'storage_5xx',
  'database',
  'cancelled',
  'unknown',
] as const;
export const DOC_EXTRACTION_STATUSES = ['pending', 'completed', 'low_confidence', 'failed', 'skipped'] as const;

// PB-AUTH-CALLBACK-STALE-APP-001 — closed enums for the callback/version/
// path-normalization taxonomy. error_category here is DIFFERENT from the
// document upload one, so the global doc-enum check is scoped to document
// events (see buildEventProps) and these apply only to auth_callback_*.
export const AUTH_CALLBACK_ERROR_CATEGORIES = [
  'session_missing',
  'exchange_failed',
  'callback_timeout',
  'navigation_failed',
  'stale_version',
  'unknown',
] as const;
export const APP_UPDATE_RECOVERY_ACTIONS = [
  'recheck',
  'recheck_or_relogin',
  'go_home',
  'relogin',
  'update_app',
  'manual_reload',
  'none',
] as const;
/** Events whose error_category uses the DOCUMENT taxonomy (scoped check). */
const DOC_ERROR_CATEGORY_EVENTS: ReadonlySet<ObsEventName> = new Set([
  'cert_upload_failed',
  'document_upload_failed',
  'document_email_rejected',
]);
/** Events whose error_category uses the AUTH CALLBACK taxonomy. */
const AUTH_CALLBACK_ERROR_CATEGORY_EVENTS: ReadonlySet<ObsEventName> = new Set([
  'auth_callback_failed',
  'auth_callback_timeout',
]);
/** Build stamps: 40-hex git SHA, short SHA, semver or 'dev'. Closed shape. */
const VERSION_STAMP_RE = /^(?:[0-9a-f]{7,40}|v?\d+(?:\.\d+){0,2}(?:[-.][A-Za-z0-9.]+)?|dev|[A-Za-z0-9][A-Za-z0-9._-]{0,63})$/;

/** Map a resolved MIME type to the coarse document category (no exact type). */
export function mimeToCategory(mime: string): (typeof DOC_MIME_CATEGORIES)[number] {
  const m = (mime || '').toLowerCase();
  if (m === 'application/pdf') return 'pdf';
  if (m.startsWith('image/')) return 'image';
  if (
    m === 'application/msword' ||
    m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    m === 'application/rtf' ||
    m === 'text/plain' ||
    m === 'text/csv'
  ) {
    return 'document';
  }
  return 'unknown';
}

/** Coarse size bucket for telemetry (never exact bytes of a unique file). */
export function sizeToBucket(bytes: number): (typeof DOC_SIZE_BUCKETS)[number] | 'unknown' {
  if (!Number.isFinite(bytes) || bytes < 0) return 'unknown';
  if (bytes <= 100 * 1024) return '<=100kb';
  if (bytes <= 1024 * 1024) return '100kb-1mb';
  if (bytes <= 5 * 1024 * 1024) return '1mb-5mb';
  return '5mb-10mb';
}

/** PB-LIBRARY-COMPLETE-001 — closed enums for Library analytics props. */
export const LIBRARY_FILTER_TYPES = ['family', 'connection_type', 'standard', 'pressure_class'] as const;
export type LibraryFilterType = (typeof LIBRARY_FILTER_TYPES)[number];
export const LIBRARY_RESOURCE_TYPES = ['preview_2d', 'preview_3d', 'download_2d', 'download_3d'] as const;
export type LibraryResourceType = (typeof LIBRARY_RESOURCE_TYPES)[number];
/** `PB-COMP-*` internal catalog id — never a filename or user text. */
export const LIBRARY_COMPONENT_ID_RE = /^PB-COMP-[A-Z0-9-]+$/;

/** PB-JOBS-PILOT-003 — technical job UUID for funnel events. Raw passthrough
 *  like component_id: it is OUR taxonomy (a DB primary key), never PII. */
export const JOB_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * SDK-internal event names allowed through `before_send` even though they sit
 * outside the 9-event functional taxonomy above. Any other event name the SDK
 * tries to send is dropped at the hook (closed ingestion).
 * - `$web_vitals`: web performance vitals (capture_performance: true). It is
 *   a permitted internal telemetry event, NOT part of the functional taxonomy.
 * - `$identify`: emitted by identify() to merge the anonymous id into the
 *   technical auth user id.
 */
export const OBS_INTERNAL_SDK_EVENTS = ['$web_vitals', '$identify'] as const;

const ACCOUNT_TYPES = ['worker', 'company'] as const;
const DEVICE_TYPES = ['mobile', 'tablet', 'desktop'] as const;
const AUTH_PROVIDERS = ['email', 'google'] as const;
const AUTH_STATUSES = [
  'requested',
  'succeeded',
  'failed',
  'blocked',
  'created',
  'neutral',
  'completed',
] as const;
const AUTH_REASON_CODES = [
  'email_not_confirmed',
  'rate_limited',
  'invalid_callback',
  'unknown',
  // PB-LIBRARY-COMPLETE-001 — Library asset access failures.
  'asset_load_failed',
] as const;
const AUTH_ATTEMPT_BUCKETS = ['first', 'retry'] as const;

// ---------------------------------------------------------------------------
// PII guard
// ---------------------------------------------------------------------------

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Phone-shaped sequences: must start with a '+' or a digit run that is NOT
// part of a longer alphanumeric token (UUID hex segments like "456-426614…"
// would otherwise false-positive). Real numbers (+34 612 34 56 78,
// 612-345-678) still match.
const PHONE_RE = /(?<![\w])(\+\d[\d\s().-]{7,}\d|\d{3,}[\s().-][\d\s().-]{5,}\d)(?![\w])/g;
const LONG_TOKEN_RE = /[A-Za-z0-9_-]{32,}/g;
const MAX_VALUE_LEN = 200;

/** Redact email/phone/long-token patterns and truncate. Never throws. */
export function sanitizeValue(value: string): string {
  try {
    return value
      .replace(EMAIL_RE, '[redacted-email]')
      .replace(PHONE_RE, '[redacted-phone]')
      .replace(LONG_TOKEN_RE, '[redacted-token]')
      .slice(0, MAX_VALUE_LEN);
  } catch {
    return '[redacted]';
  }
}

/** Strip UUIDs and hex ids from paths so routes never leak technical ids. */
export function normalizeRoute(pathname: string): string {
  try {
    return pathname
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
      .replace(/\/\d+(?=\/|$)/g, '/:id')
      .slice(0, MAX_VALUE_LEN) || '/';
  } catch {
    return '/';
  }
}

// ---------------------------------------------------------------------------
// PostHog before_send — global automatic-property sanitizer
// ---------------------------------------------------------------------------
//
// PostHog attaches automatic web properties ($current_url, $referrer, ...)
// AFTER our per-event allowlist, so query strings (e.g. ?ref=CODE) and
// fragments can otherwise reach ingestion. The global `before_send` hook is
// the last line of defense: EVERY event — custom or automatic, including
// $web_vitals — passes through it before leaving the browser.
//
// NOTE (PO review 2026-09-10): sanitization is allowlist-driven on URL/PII
// property names. We never delete properties just because the *name* contains
// "token" — the Project API token is part of the ingestion protocol, not an
// event property, and generic name-based deletion risks 401s.

/** Automatic PostHog URL properties that must keep origin + pathname only. */
const URL_PROP_KEYS = new Set([
  '$current_url',
  '$initial_current_url',
  '$session_entry_url',
  '$referrer',
  '$initial_referrer',
]);

/** Key names that semantically carry a URL, href, referrer, link or path. */
const URL_PROP_NAME_RE = /url|href|referrer|referring|(^|[^a-z])link|page|path/i;
/** Key names that are query/fragment content by definition: dropped. */
const QUERY_PROP_NAME_RE = /(^|[$_])(search|query|hash|fragment)(_|$)|queryString/i;

/**
 * Keys whose values pass through UNMODIFIED. Two families:
 *
 * 1. Ingestion protocol (PostHog routing credentials): posthog-js puts the
 *    public project key in EVERY event's `properties.token` and derives the
 *    batch's top-level `api_key` from it. Redacting it (e.g. as a "long
 *    token") leaves events unroutable: the endpoint returns 200 and stores
 *    NOTHING — the exact failure of gate 2 (SHA 573ad7a, 2026-09-11).
 * 2. Technical identifiers that must stay linkable: UUIDs match the
 *    long-token regex, and semver-like strings trip the phone regex.
 *    `app_version` is a 40-hex git SHA — it matches the long-token regex by
 *    shape, but it is OUR value and must survive for per-build filtering.
 */
const PASSTHROUGH_VALUE_KEYS = new Set([
  // ingestion protocol — never redact, never delete (PO: no generic token rules)
  'token',
  'api_key',
  // technical ids / linking
  'distinct_id',
  '$distinct_id',
  '$anon_distinct_id',
  '$device_id',
  '$session_id',
  '$window_id',
  '$user_id',
  '$insert_id',
  'pb_anonymous_id',
  'correlation_id',
  'incident_code',
  // technical versions / build stamps
  'app_version',
  'target_version',
  '$browser_version',
  '$lib_version',
  // PB-LIBRARY-COMPLETE-001 — closed Library props. Values are validated
  // against closed enums / the PB-COMP-* id pattern by buildEventProps before
  // this stage, and catalog ids match the long-token regex by shape (they are
  // OUR taxonomy, not credentials) — passthrough keeps them intact.
  'component_id',
  'component_family',
  'filter_type',
  'filter_value',
  'resource_type',
  'reason_code',
  // PB-JOBS-PILOT-003 — job UUID (validated against JOB_ID_RE upstream).
  'job_id',
]);

const ABSOLUTE_URL_RE = /https?:\/\/[^\s"'<>\\]+/gi;

/** Redact email/phone/embedded-URL patterns in a plain string value. */
function redactEmbeddedPatterns(value: string): string {
  try {
    return value
      .replace(EMAIL_RE, '[redacted-email]')
      .replace(PHONE_RE, '[redacted-phone]')
      .replace(ABSOLUTE_URL_RE, (m) => {
        try {
          const u = new URL(m);
          return `${u.origin}${normalizeRoute(u.pathname)}`;
        } catch {
          return '[redacted-url]';
        }
      })
      .slice(0, MAX_VALUE_LEN);
  } catch {
    return '[redacted]';
  }
}

/**
 * Reduce a URL-ish value to origin + normalized pathname. Query string and
 * fragment are ALWAYS removed. Relative paths are normalized as routes; non
 * URL values (e.g. PostHog's literal "$direct") fall back to pattern redaction.
 */
export function sanitizeUrlPropertyValue(value: string): string {
  try {
    const u = new URL(value);
    return `${u.origin}${normalizeRoute(u.pathname)}`;
  } catch {
    if (value.startsWith('/')) return normalizeRoute(value);
    return redactEmbeddedPatterns(value);
  }
}

function sanitizePostHogProperty(key: string, value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (QUERY_PROP_NAME_RE.test(key)) return undefined; // query/fragment content: drop
  if (URL_PROP_KEYS.has(key) || URL_PROP_NAME_RE.test(key)) {
    return sanitizeUrlPropertyValue(value);
  }
  if (PASSTHROUGH_VALUE_KEYS.has(key)) return value.slice(0, MAX_VALUE_LEN);
  // Other strings: redact credential-like long tokens plus embedded patterns.
  try {
    return redactEmbeddedPatterns(value.replace(LONG_TOKEN_RE, '[redacted-token]'));
  } catch {
    return '[redacted]';
  }
}

// ---------------------------------------------------------------------------
// Recursive sanitization (gate-3 remediation, 2026-09-11)
// ---------------------------------------------------------------------------
//
// PostHog nests full web-vital events inside properties like
// `$web_vitals_FCP_event.$current_url`, which still carried `?ref=…` past the
// top-level pass (gate 3). The recursive walker sanitizes URL-keyed strings
// at ANY depth. Safety contract:
// - only arrays, plain objects (Object.prototype / null prototype) and JSON
//   scalar values are traversed; prototypes are never walked;
// - depth is capped; cycles are detected with a WeakSet (DAG sharing is OK:
//   entries are released after their subtree completes);
// - the input is NEVER mutated — sanitized copies are returned;
// - anything that cannot be guaranteed safe (excessive depth, cycle,
//   non-plain object) throws and the WHOLE EVENT is dropped by the caller —
//   fail-closed for the payload, fail-open for the application.

const MAX_SANITIZE_DEPTH = 8;

function sanitizeNestedValue(
  key: string,
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (typeof value === 'string') return sanitizePostHogProperty(key, value);
  if (value === null || value === undefined || typeof value !== 'object') {
    return value; // JSON scalars are safe as-is
  }
  if (depth >= MAX_SANITIZE_DEPTH) {
    throw new Error('pb-obs: sanitize depth limit exceeded');
  }
  if (seen.has(value)) {
    throw new Error('pb-obs: cyclic structure in event properties');
  }
  if (Array.isArray(value)) {
    seen.add(value);
    try {
      return value.map((item, i) => sanitizeNestedValue(String(i), item, depth + 1, seen));
    } finally {
      seen.delete(value);
    }
  }
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    // Non-plain object (Date, Map, class instance...): its contents cannot be
    // inspected safely as JSON — the event is dropped by the caller.
    throw new Error('pb-obs: non-plain object in event properties');
  }
  seen.add(value);
  try {
    const out: Record<string, unknown> = {};
    for (const childKey of Object.keys(value)) {
      const child = sanitizeNestedValue(
        childKey,
        (value as Record<string, unknown>)[childKey],
        depth + 1,
        seen,
      );
      if (child !== undefined) out[childKey] = child;
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

export interface PostHogEventLike {
  event?: string;
  properties?: Record<string, unknown>;
  $set?: Record<string, unknown>;
  $set_once?: Record<string, unknown>;
}

/**
 * Sanitize a full PostHog event before it leaves the browser (the `before_send`
 * hook body). Returns the sanitized event, or null when the event must be
 * dropped: unknown event name, or an unexpected sanitization failure — privacy
 * wins over telemetry, and the app itself is never affected (fail-open for the
 * app, fail-closed for the payload). Property bags are REPLACED with sanitized
 * copies; the original nested objects are never mutated.
 */
export function sanitizePostHogEvent<T extends PostHogEventLike>(event: T): T | null {
  try {
    const name = event.event;
    const known =
      typeof name === 'string' &&
      (OBS_EVENT_NAMES.includes(name as ObsEventName) ||
        (OBS_INTERNAL_SDK_EVENTS as readonly string[]).includes(name));
    if (!known) return null;
    const seen = new WeakSet<object>();
    for (const bag of ['properties', '$set', '$set_once'] as const) {
      const props = event[bag];
      if (!props || typeof props !== 'object') continue;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(props)) {
        const sanitized = sanitizeNestedValue(key, props[key], 0, seen);
        if (sanitized !== undefined) out[key] = sanitized;
      }
      event[bag] = out as T[typeof bag];
    }
    // environment + app_version are attached HERE, at the hook, so EVERY event
    // carries them — including SDK-internal events like $web_vitals, which the
    // SDK does not necessarily enrich with registered super properties. This
    // keeps preview traffic excludable and every payload traceable to a build.
    if (event.properties && typeof event.properties === 'object') {
      if (event.properties.environment === undefined) {
        event.properties.environment = getEnvironment();
      }
      if (event.properties.app_version === undefined) {
        event.properties.app_version = getAppVersion();
      }
    }
    return event;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Context (session-scoped, technical only)
// ---------------------------------------------------------------------------

const ANON_ID_KEY = 'pb_obs_anon_id';
const REF_CODE_KEYS = ['pipingbox_referral_code']; // same key as referrals.ts

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function uuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `pb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** Stable anonymous ID (device-level, technical). Created lazily. */
export function getAnonymousId(): string {
  const ls = safeLocalStorage();
  if (!ls) return 'anon-unavailable';
  try {
    let id = ls.getItem(ANON_ID_KEY);
    if (!id) {
      id = uuid();
      ls.setItem(ANON_ID_KEY, id);
    }
    return id;
  } catch {
    return 'anon-unavailable';
  }
}

let sessionCorrelationId: string | null = null;

/** Correlation ID for this browser session (tab lifetime). */
export function getCorrelationId(): string {
  if (sessionCorrelationId) return sessionCorrelationId;
  try {
    const existing = window.sessionStorage.getItem('pb_obs_correlation_id');
    if (existing) {
      sessionCorrelationId = existing;
      return existing;
    }
    const id = uuid();
    window.sessionStorage.setItem('pb_obs_correlation_id', id);
    sessionCorrelationId = id;
    return id;
  } catch {
    sessionCorrelationId = sessionCorrelationId ?? uuid();
    return sessionCorrelationId;
  }
}

export function getAppVersion(): string {
  try {
    return (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev';
  } catch {
    return 'dev';
  }
}

export function getEnvironment(): string {
  try {
    return (import.meta.env.VITE_APP_ENV as string | undefined) ?? 'production';
  } catch {
    return 'production';
  }
}

export function detectDeviceType(): (typeof DEVICE_TYPES)[number] {
  try {
    const ua = navigator.userAgent;
    if (/tablet|ipad/i.test(ua)) return 'tablet';
    if (/mobi|android|iphone/i.test(ua)) return 'mobile';
    return 'desktop';
  } catch {
    return 'desktop';
  }
}

export function detectBrowser(): string {
  try {
    const ua = navigator.userAgent;
    if (/edg\//i.test(ua)) return 'edge';
    if (/chrome|crios/i.test(ua)) return 'chrome';
    if (/safari/i.test(ua)) return 'safari';
    if (/firefox|fxios/i.test(ua)) return 'firefox';
    return 'other';
  } catch {
    return 'other';
  }
}

export function detectOs(): string {
  try {
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) return 'android';
    if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
    if (/windows/i.test(ua)) return 'windows';
    if (/mac os/i.test(ua)) return 'macos';
    if (/linux/i.test(ua)) return 'linux';
    return 'other';
  } catch {
    return 'other';
  }
}

export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  } catch {
    return 'unknown';
  }
}

export function detectLocale(): string {
  try {
    return (navigator.language || 'unknown').slice(0, 10);
  } catch {
    return 'unknown';
  }
}

/**
 * Traffic origin for this session. Precedence: campaign (UTM) > referral
 * (stored PB- code) > organic (external referrer) > direct. Computed once.
 */
let cachedOrigin: ObsOrigin | null = null;

export function detectOrigin(): ObsOrigin {
  if (cachedOrigin) return cachedOrigin;
  let origin: ObsOrigin = 'direct';
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('utm_source') || params.get('utm_medium') || params.get('utm_campaign')) {
      origin = 'campaign';
    } else {
      const ls = safeLocalStorage();
      const hasRef =
        !!params.get('ref') ||
        REF_CODE_KEYS.some((k) => {
          try {
            return !!ls?.getItem(k);
          } catch {
            return false;
          }
        });
      if (hasRef) {
        origin = 'referral';
      } else if (
        document.referrer &&
        new URL(document.referrer).host !== window.location.host
      ) {
        origin = 'organic';
      }
    }
  } catch {
    /* keep default */
  }
  cachedOrigin = origin;
  return origin;
}

/** Re-evaluate origin (used after a referral code is captured mid-session). */
export function refreshOrigin(): ObsOrigin {
  cachedOrigin = null;
  return detectOrigin();
}

// ---------------------------------------------------------------------------
// Core client (injectable, fail-open)
// ---------------------------------------------------------------------------

export interface ObsClient {
  capture(event: string, properties?: Record<string, unknown>): void;
  identify?(distinctId: string, properties?: Record<string, unknown>): void;
  register?(properties: Record<string, unknown>): void;
  reset?(): void;
  /** Current SDK distinct_id (anonymous pre-auth, canonical UUID post-auth). */
  get_distinct_id?(): string;
}

interface QueuedEvent {
  name: ObsEventName;
  props: Record<string, unknown>;
}

let client: ObsClient | null = null;
let initialized = false;
let queue: QueuedEvent[] = [];
const emittedDedupeKeys = new Set<string>();
const MAX_QUEUE = 100;

/** Build the allowlisted, sanitized property bag for an event. Pure. */
export function buildEventProps(
  name: ObsEventName,
  props: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = EVENT_PROP_KEYS[name];
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    const raw = props[key];
    if (raw === undefined || raw === null) continue;
    if (typeof raw === 'string') {
      // PB-LIBRARY-COMPLETE-001 — closed catalog ids (PB-COMP-*) are validated
      // against the id pattern and kept RAW. sanitizeValue would redact ids
      // ≥32 chars as "long tokens" before validation could accept them; they
      // are our taxonomy by construction, never credentials or PII.
      if (key === 'component_id' || key === 'component_family') {
        if (LIBRARY_COMPONENT_ID_RE.test(raw)) out[key] = raw;
        continue;
      }
      // PB-JOBS-PILOT-003 — job UUIDs are kept raw (technical id, our
      // taxonomy); sanitizeValue would redact them as "long tokens".
      if (key === 'job_id') {
        if (JOB_ID_RE.test(raw)) out[key] = raw;
        continue;
      }
      // PB-AUTH-CALLBACK-STALE-APP-001 — build stamps (git SHA) are kept raw:
      // they are our build identity (same treatment as app_version), and
      // sanitizeValue would redact 40-hex SHAs as "long tokens".
      if (key === 'target_version') {
        if (VERSION_STAMP_RE.test(raw)) out[key] = raw;
        continue;
      }
      out[key] = sanitizeValue(raw);
    } else if (typeof raw === 'number' || typeof raw === 'boolean') {
      out[key] = raw;
    }
    // objects/arrays/functions are never allowed
  }
  // Closed enums: drop values outside the approved sets.
  if ('origin' in out && !OBS_ORIGINS.includes(out.origin as ObsOrigin)) delete out.origin;
  // PB-CERT-UPLOAD-UX-001 — cert upload closed enums.
  if ('bucket' in out && !CERT_UPLOAD_BUCKETS.includes(out.bucket as never)) delete out.bucket;
  if ('size_bucket' in out && !DOC_SIZE_BUCKETS.includes(out.size_bucket as never)) delete out.size_bucket;
  if ('mime' in out && !CERT_UPLOAD_MIMES.includes(out.mime as never)) delete out.mime;
  if ('error_category' in out) {
    // Scoped enums: document events and auth callback events use DIFFERENT
    // closed taxonomies for the same prop name (PB-AUTH-CALLBACK-STALE-APP-001).
    if (DOC_ERROR_CATEGORY_EVENTS.has(name) && !DOC_ERROR_CATEGORIES.includes(out.error_category as never)) {
      delete out.error_category;
    }
    if (
      AUTH_CALLBACK_ERROR_CATEGORY_EVENTS.has(name) &&
      !AUTH_CALLBACK_ERROR_CATEGORIES.includes(out.error_category as never)
    ) {
      delete out.error_category;
    }
  }
  // PB-AUTH-CALLBACK-STALE-APP-001 — build stamps and recovery enums.
  if ('target_version' in out) {
    // Keep raw (validated closed shape): a SHA is our build identity, not a
    // credential; sanitizeValue would otherwise redact it as a long token.
    if (typeof out.target_version !== 'string' || !VERSION_STAMP_RE.test(out.target_version)) {
      delete out.target_version;
    }
  }
  if ('recovery_action' in out && !APP_UPDATE_RECOVERY_ACTIONS.includes(out.recovery_action as never)) {
    delete out.recovery_action;
  }
  // PB-DOCUMENT-INTAKE-001 — unified document intake closed enums.
  if ('document_type' in out && !DOC_TYPES.includes(out.document_type as never)) delete out.document_type;
  if ('channel' in out && !DOC_CHANNELS.includes(out.channel as never)) delete out.channel;
  if ('transport' in out && !DOC_TRANSPORTS.includes(out.transport as never)) delete out.transport;
  if ('mime_category' in out && !DOC_MIME_CATEGORIES.includes(out.mime_category as never)) delete out.mime_category;
  if (
    'progress_checkpoint' in out &&
    !DOC_PROGRESS_CHECKPOINTS.includes(out.progress_checkpoint as never)
  ) {
    delete out.progress_checkpoint;
  }
  if ('extraction_status' in out && !DOC_EXTRACTION_STATUSES.includes(out.extraction_status as never)) {
    delete out.extraction_status;
  }
  if ('resumed' in out && typeof out.resumed !== 'boolean') delete out.resumed;
  if ('attempt_number' in out && (typeof out.attempt_number !== 'number' || out.attempt_number < 1 || out.attempt_number > 8)) {
    delete out.attempt_number;
  }
  if ('duration_ms' in out && (typeof out.duration_ms !== 'number' || out.duration_ms < 0 || out.duration_ms > 600000)) {
    delete out.duration_ms;
  }
  if ('filter_type' in out && !LIBRARY_FILTER_TYPES.includes(out.filter_type as LibraryFilterType)) {
    delete out.filter_type;
  }
  if ('resource_type' in out && !LIBRARY_RESOURCE_TYPES.includes(out.resource_type as LibraryResourceType)) {
    delete out.resource_type;
  }
  if ('component_id' in out && !LIBRARY_COMPONENT_ID_RE.test(String(out.component_id))) {
    delete out.component_id;
  }
  if ('component_family' in out && !LIBRARY_COMPONENT_ID_RE.test(String(out.component_family))) {
    delete out.component_family;
  }
  if ('job_id' in out && !JOB_ID_RE.test(String(out.job_id))) {
    delete out.job_id;
  }
  if ('query_length' in out && typeof out.query_length === 'number' && (out.query_length < 0 || out.query_length > 500)) {
    delete out.query_length;
  }
  if ('account_type' in out && !ACCOUNT_TYPES.includes(out.account_type as never)) {
    delete out.account_type;
  }
  if ('device_type' in out && !DEVICE_TYPES.includes(out.device_type as never)) {
    delete out.device_type;
  }
  if ('provider' in out && !AUTH_PROVIDERS.includes(out.provider as never)) {
    delete out.provider;
  }
  if ('status' in out && !AUTH_STATUSES.includes(out.status as never)) {
    delete out.status;
  }
  if ('reason_code' in out && !AUTH_REASON_CODES.includes(out.reason_code as never)) {
    delete out.reason_code;
  }
  if (
    'attempt_bucket' in out &&
    !AUTH_ATTEMPT_BUCKETS.includes(out.attempt_bucket as never)
  ) {
    delete out.attempt_bucket;
  }
  return out;
}

/**
 * Track a closed-schema event. Never throws, never breaks the caller.
 * `dedupeKey`: when provided, the same (event, dedupeKey) pair is emitted at
 * most once per page lifecycle (re-render protection).
 */
export function trackEvent(
  name: ObsEventName,
  props: Record<string, unknown> = {},
  options: { dedupeKey?: string } = {},
): void {
  try {
    if (!OBS_EVENT_NAMES.includes(name)) return;
    if (options.dedupeKey) {
      const composite = `${name}:${options.dedupeKey}`;
      if (emittedDedupeKeys.has(composite)) return;
      emittedDedupeKeys.add(composite);
    }
    const safeProps = buildEventProps(name, props);
    // Attach environment and app_version to every event so preview traffic
    // can be excluded from production reports and errors can be traced to a
    // build SHA.
    safeProps.environment = getEnvironment();
    safeProps.app_version = getAppVersion();
    if (!initialized || !client) {
      if (queue.length < MAX_QUEUE) queue.push({ name, props: safeProps });
      return;
    }
    client.capture(name, safeProps);
  } catch (err) {
    logger.warn('[obs] trackEvent failed (swallowed)', err);
  }
}

function flushQueue(): void {
  if (!client) return;
  const pending = queue;
  queue = [];
  for (const evt of pending) {
    try {
      client.capture(evt.name, evt.props);
    } catch (err) {
      logger.warn('[obs] flush failed for event (swallowed)', err);
    }
  }
}

function registerSuperProperties(): void {
  if (!client?.register) return;
  try {
    client.register({
      pb_anonymous_id: getAnonymousId(),
      correlation_id: getCorrelationId(),
      app_version: getAppVersion(),
      environment: getEnvironment(),
      origin: detectOrigin(),
    });
  } catch (err) {
    logger.warn('[obs] register failed (swallowed)', err);
  }
}

export interface InitOptions {
  key?: string;
  host?: string;
  /** Test hook: inject a fake client instead of the real PostHog SDK. */
  injectedClient?: ObsClient;
}

/**
 * Initialize the observability layer. Safe to call with no key (no-op with
 * in-memory queue) and safe to call multiple times (idempotent).
 */
export async function initObservability(options: InitOptions = {}): Promise<void> {
  try {
    if (initialized) return;
    if (options.injectedClient) {
      client = options.injectedClient;
      initialized = true;
      registerSuperProperties();
      flushQueue();
      return;
    }
    const key = options.key ?? (import.meta.env.VITE_POSTHOG_KEY as string | undefined);
    if (!key) return; // observability disabled: events stay in the bounded queue
    const host =
      options.host ??
      (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ??
      'https://eu.i.posthog.com';

    const { default: posthog } = await import('posthog-js');
    posthog.init(key, {
      api_host: host,
      autocapture: false, // closed taxonomy only
      capture_pageview: false, // we emit page_viewed ourselves
      capture_pageleave: false,
      disable_session_recording: true, // PO action 7: replay off until masking+consent
      capture_performance: true,
      ip: false, // defense in depth on top of project-level anonymize_ips
      persistence: 'localStorage',
      // PostHog 1.429+ with defaultIdentifiedOnly=true discards anonymous
      // events unless person_profiles is explicit. We need anonymous
      // pre-auth tracking for the referral funnel.
      person_profiles: 'always',
      // Preview/testing: PostHog drops bot-like user agents (HeadlessChrome,
      // etc.) by default. Opt out of that filter so preview verification
      // events are actually sent to ingestion. Production keeps the default.
      ...(getEnvironment() === 'preview' ? { opt_out_useragent_filter: true } : {}),
      // Global last-line-of-defense sanitizer: PostHog attaches automatic
      // web properties ($current_url, ...) after our per-event allowlist, so
      // query strings/fragments must be stripped here for EVERY event,
      // including $web_vitals. See sanitizePostHogEvent.
      // Preview-only diagnostic stages (no payloads, no codes, no keys):
      // lets the gate verification distinguish received / sanitized /
      // returned / dropped per event in the browser console. Uses
      // console.warn because main.tsx silences console.log/info in
      // production builds (TD-13); warn stays live and is preview-gated here.
      before_send:
        getEnvironment() === 'preview'
          ? (event) => {
              const name = event && typeof event === 'object' ? event.event : '(malformed)';
              console.warn(`[pb-obs-diag] before_send received: ${name}`);
              const out = sanitizePostHogEvent(event);
              console.warn(`[pb-obs-diag] before_send ${out ? 'returned' : 'DROPPED'}: ${name}`);
              return out;
            }
          : (event) => sanitizePostHogEvent(event),
      loaded: () => {
        if (getEnvironment() === 'preview') {
          console.warn('[pb-obs-diag] posthog init loaded (preview)');
        }
      },
    });
    client = posthog as unknown as ObsClient;
    initialized = true;
    registerSuperProperties();
    flushQueue();
  } catch (err) {
    logger.warn('[obs] init failed (observability disabled)', err);
  }
}

/** Current SDK distinct_id (anonymous pre-auth, canonical UUID post-auth). */
export function getDistinctId(): string | null {
  try {
    return client?.get_distinct_id?.() ?? null;
  } catch {
    return null;
  }
}

/**
 * Preview-only diagnostic handle: lets the identity E2E read the SDK's current
 * distinct_id from the deployed bundle (where module imports are not
 * reachable). Never exposed outside preview; never carries PII.
 */
if (typeof window !== 'undefined' && getEnvironment() === 'preview') {
  (window as unknown as Record<string, unknown>).__pbObsGetDistinctId = getDistinctId;
}

/** Link the anonymous session to the technical auth user id. */
export function identifyUser(
  userId: string,
  traits: { account_type?: string; onboarding_status?: string } = {},
): void {
  try {
    if (!initialized || !client?.identify) return;
    // Canonical contract: the identifier is the Supabase auth.user.id (UUID).
    // Refuse PII-shaped identifiers (email/phone) so a caller bug can never
    // turn an email into a PostHog distinct_id.
    if (EMAIL_RE.test(userId) || PHONE_RE.test(userId)) {
      logger.warn('[obs] identify refused: PII-shaped identifier');
      return;
    }
    const safeTraits: Record<string, unknown> = {};
    if (traits.account_type && ACCOUNT_TYPES.includes(traits.account_type as never)) {
      safeTraits.account_type = traits.account_type;
    }
    if (traits.onboarding_status) {
      safeTraits.onboarding_status = sanitizeValue(traits.onboarding_status);
    }
    client.identify(userId, safeTraits);
  } catch (err) {
    logger.warn('[obs] identify failed (swallowed)', err);
  }
}

/** Detach the auth user (sign out). Anonymous ID stays stable. */
export function resetObservabilityUser(): void {
  try {
    client?.reset?.();
    registerSuperProperties();
  } catch (err) {
    logger.warn('[obs] reset failed (swallowed)', err);
  }
}

// ---------------------------------------------------------------------------
// Errors — ErrorBoundary structured capture
// ---------------------------------------------------------------------------

const INCIDENT_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no ambiguous chars

/** Short copiable incident code, e.g. PB-ERR-7K3Q9Z. */
export function generateIncidentCode(): string {
  let suffix = '';
  try {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    for (const b of bytes) suffix += INCIDENT_ALPHABET[b % INCIDENT_ALPHABET.length];
  } catch {
    suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  }
  return `PB-ERR-${suffix}`;
}

function firstComponentFrame(componentStack: string | null | undefined): string {
  if (!componentStack) return 'unknown';
  const first = componentStack
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return first ? sanitizeValue(first).slice(0, 120) : 'unknown';
}

/**
 * Capture an ErrorBoundary error exactly once, with an incident code that
 * lets support locate the session server-side. Returns the incident code.
 * Never throws.
 *
 * PB-UI-DOM-REMOVECHILD-RESIDUAL-001: React can invoke componentDidCatch
 * TWICE for the same commit-phase DOM error (initial pass + recovery pass),
 * which double-reported one incident as two PB-ERR codes ~2 ms apart
 * (production evidence: PB-ERR-WQ9NR9/JWCAD4, PB-ERR-2F5VN8/UUR7NJ).
 * The same (name, message, route) signature inside a short window collapses
 * to the FIRST incident code and a single app_error. Distinct errors
 * (different signature, or later than the window) are still captured in
 * full — nothing real is hidden.
 */
const BOUNDARY_CAPTURE_DEDUPE_WINDOW_MS = 5_000;
const recentBoundaryCaptures = new Map<string, { code: string; ts: number }>();

export function captureBoundaryError(
  error: Error,
  componentStack: string | null | undefined,
  context: { route?: string; account_type?: string; onboarding_status?: string } = {},
): string {
  try {
    const fallbackRoute =
      typeof window !== 'undefined' ? normalizeRoute(window.location.pathname) : 'unknown';
    const route = context.route ?? fallbackRoute;
    const signature = `${error?.name ?? 'Error'}|${error?.message ?? 'unknown'}|${route}`;
    const now = Date.now();
    const previous = recentBoundaryCaptures.get(signature);
    if (previous && now - previous.ts < BOUNDARY_CAPTURE_DEDUPE_WINDOW_MS) {
      return previous.code; // same underlying incident — do not emit again
    }
    const incidentCode = generateIncidentCode();
    trackEvent('app_error', {
      error_name: error?.name ?? 'Error',
      error_message: error?.message ?? 'unknown',
      component_top: firstComponentFrame(componentStack),
      route,
      incident_code: incidentCode,
      origin: detectOrigin(),
      app_version: getAppVersion(),
      browser: detectBrowser(),
      os: detectOs(),
      device_type: detectDeviceType(),
      timezone: detectTimezone(),
      account_type: context.account_type,
      onboarding_status: context.onboarding_status,
    });
    recentBoundaryCaptures.set(signature, { code: incidentCode, ts: now });
    return incidentCode;
  } catch (err) {
    logger.warn('[obs] captureBoundaryError failed (swallowed)', err);
    return generateIncidentCode();
  }
}

/** Test hook: reset all module state. */
export function __resetObservabilityForTests(): void {
  client = null;
  initialized = false;
  queue = [];
  emittedDedupeKeys.clear();
  recentBoundaryCaptures.clear();
  cachedOrigin = null;
  sessionCorrelationId = null;
}
