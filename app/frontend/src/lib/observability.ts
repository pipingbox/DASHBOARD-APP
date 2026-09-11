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
  'onboarding_started',
  'onboarding_step_reached',
  'onboarding_completed',
  'referral_link_opened',
  'referral_captured',
  'app_error',
] as const;

export type ObsEventName = (typeof OBS_EVENT_NAMES)[number];

/** Allowed property keys per event. Anything else is dropped. */
const EVENT_PROP_KEYS: Record<ObsEventName, readonly string[]> = {
  page_viewed: ['route', 'origin', 'locale', 'device_type'],
  signup_started: ['origin', 'account_type'],
  auth_created: ['origin', 'account_type'],
  onboarding_started: ['account_type'],
  onboarding_step_reached: ['step', 'account_type'],
  onboarding_completed: ['account_type'],
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
};

export const OBS_ORIGINS = ['direct', 'referral', 'organic', 'campaign'] as const;
export type ObsOrigin = (typeof OBS_ORIGINS)[number];

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

// ---------------------------------------------------------------------------
// PII guard
// ---------------------------------------------------------------------------

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/g;
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
  '$browser_version',
  '$lib_version',
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
 * app, fail-closed for the payload).
 */
export function sanitizePostHogEvent<T extends PostHogEventLike>(event: T): T | null {
  try {
    const name = event.event;
    const known =
      typeof name === 'string' &&
      (OBS_EVENT_NAMES.includes(name as ObsEventName) ||
        (OBS_INTERNAL_SDK_EVENTS as readonly string[]).includes(name));
    if (!known) return null;
    for (const bag of ['properties', '$set', '$set_once'] as const) {
      const props = event[bag];
      if (!props || typeof props !== 'object') continue;
      for (const key of Object.keys(props)) {
        const out = sanitizePostHogProperty(key, props[key]);
        if (out === undefined) delete props[key];
        else props[key] = out;
      }
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
      out[key] = sanitizeValue(raw);
    } else if (typeof raw === 'number' || typeof raw === 'boolean') {
      out[key] = raw;
    }
    // objects/arrays/functions are never allowed
  }
  // Closed enums: drop values outside the approved sets.
  if ('origin' in out && !OBS_ORIGINS.includes(out.origin as ObsOrigin)) delete out.origin;
  if ('account_type' in out && !ACCOUNT_TYPES.includes(out.account_type as never)) {
    delete out.account_type;
  }
  if ('device_type' in out && !DEVICE_TYPES.includes(out.device_type as never)) {
    delete out.device_type;
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

/** Link the anonymous session to the technical auth user id. */
export function identifyUser(
  userId: string,
  traits: { account_type?: string; onboarding_status?: string } = {},
): void {
  try {
    if (!initialized || !client?.identify) return;
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
 */
export function captureBoundaryError(
  error: Error,
  componentStack: string | null | undefined,
  context: { route?: string; account_type?: string; onboarding_status?: string } = {},
): string {
  const incidentCode = generateIncidentCode();
  try {
    const fallbackRoute =
      typeof window !== 'undefined' ? normalizeRoute(window.location.pathname) : 'unknown';
    trackEvent('app_error', {
      error_name: error?.name ?? 'Error',
      error_message: error?.message ?? 'unknown',
      component_top: firstComponentFrame(componentStack),
      route: context.route ?? fallbackRoute,
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
  } catch (err) {
    logger.warn('[obs] captureBoundaryError failed (swallowed)', err);
  }
  return incidentCode;
}

/** Test hook: reset all module state. */
export function __resetObservabilityForTests(): void {
  client = null;
  initialized = false;
  queue = [];
  emittedDedupeKeys.clear();
  cachedOrigin = null;
  sessionCorrelationId = null;
}
