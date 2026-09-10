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
      loaded: () => {
        /* no-op: flush below */
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
