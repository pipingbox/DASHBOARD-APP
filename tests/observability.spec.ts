import { test, expect } from '@playwright/test';

/**
 * Canonical observability layer — unit tests.
 *
 * PB-OBSERVABILITY-001 (PIPINGBOX DAILY INTELLIGENCE).
 *
 * Behaviors pinned here (acceptance criteria of the ticket):
 *   1. Closed schemas: property keys outside the allowlist never leave the app.
 *   2. No PII: emails / phones / long tokens are redacted from string values.
 *   3. Fail-open: tracking without init, and a throwing client, never break
 *      the caller.
 *   4. Anti-duplication: the same (event, dedupeKey) is emitted exactly once.
 *   5. Incident codes have the PB-ERR-XXXXXX shape and travel in app_error.
 *   6. Routes are normalized (no UUIDs / numeric ids leak).
 *   7. A queued event flushes once a client initializes.
 *
 * No network, no Supabase, no PostHog SDK: the client is injected.
 */

import {
  OBS_EVENT_NAMES,
  OBS_INTERNAL_SDK_EVENTS,
  buildEventProps,
  sanitizeValue,
  sanitizeUrlPropertyValue,
  sanitizePostHogEvent,
  normalizeRoute,
  trackEvent,
  initObservability,
  identifyUser,
  resetObservabilityUser,
  captureBoundaryError,
  generateIncidentCode,
  __resetObservabilityForTests,
  type ObsClient,
} from '../app/frontend/src/lib/observability';

function makeClient(throwOnCapture = false) {
  const captured: Array<{ event: string; properties?: Record<string, unknown> }> = [];
  const identified: Array<{ id: string; traits?: Record<string, unknown> }> = [];
  const registered: Array<Record<string, unknown>> = [];
  let resets = 0;
  const client: ObsClient = {
    capture(event, properties) {
      if (throwOnCapture) throw new Error('ingest down');
      captured.push({ event, properties });
    },
    identify(id, traits) {
      identified.push({ id, traits });
    },
    register(props) {
      registered.push(props);
    },
    reset() {
      resets += 1;
    },
  };
  return { client, captured, identified, registered, resets: () => resets };
}

test.beforeEach(() => {
  __resetObservabilityForTests();
});

// ---------------------------------------------------------------------------
// 1. Closed schemas
// ---------------------------------------------------------------------------

test.describe('closed event schemas', () => {
  test('every event name has a declared prop allowlist', () => {
    for (const name of OBS_EVENT_NAMES) {
      const props = buildEventProps(name, { route: '/x' });
      expect(props).toBeDefined();
    }
  });

  test('unknown property keys are dropped', () => {
    const props = buildEventProps('page_viewed', {
      route: '/dashboard',
      origin: 'direct',
      email: 'user@example.com', // not allowlisted — must be dropped
      hacker: 'payload',
    });
    expect(props.route).toBe('/dashboard');
    expect(props).not.toHaveProperty('email');
    expect(props).not.toHaveProperty('hacker');
  });

  test('object/array values are never allowed through', () => {
    const props = buildEventProps('app_error', {
      error_name: 'TypeError',
      route: { malicious: true },
      browser: ['array'],
    });
    expect(props.error_name).toBe('TypeError');
    expect(props).not.toHaveProperty('route');
    expect(props).not.toHaveProperty('browser');
  });

  test('closed enums reject out-of-set values', () => {
    const props = buildEventProps('signup_started', {
      origin: 'outer-space',
      account_type: 'admin',
    });
    expect(props).not.toHaveProperty('origin');
    expect(props).not.toHaveProperty('account_type');
  });
});

// ---------------------------------------------------------------------------
// 2. PII guard
// ---------------------------------------------------------------------------

test.describe('PII sanitization', () => {
  test('redacts emails, phones and long tokens', () => {
    const out = sanitizeValue(
      'Contact john.doe@company.com or +32 470 12 34 56 token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abc',
    );
    expect(out).not.toContain('john.doe@company.com');
    expect(out).not.toContain('470 12 34 56');
    expect(out).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abc');
    expect(out).toContain('[redacted-email]');
  });

  test('truncates long values', () => {
    const out = sanitizeValue('a'.repeat(500));
    expect(out.length).toBeLessThanOrEqual(200);
  });

  test('app_error message is sanitized before capture', async () => {
    const { client, captured } = makeClient();
    await initObservability({ injectedClient: client });
    captureBoundaryError(new Error('failed for user jane@example.com'), '\n at Dashboard');
    expect(captured).toHaveLength(1);
    const msg = captured[0].properties?.error_message as string;
    expect(msg).not.toContain('jane@example.com');
    expect(msg).toContain('[redacted-email]');
  });
});

// ---------------------------------------------------------------------------
// 3. Fail-open
// ---------------------------------------------------------------------------

test.describe('fail-open behavior', () => {
  test('trackEvent without init never throws and queues bounded', () => {
    expect(() => trackEvent('page_viewed', { route: '/' })).not.toThrow();
    for (let i = 0; i < 150; i++) {
      expect(() => trackEvent('page_viewed', { route: `/p${i}` })).not.toThrow();
    }
  });

  test('init without key is a no-op that does not throw', async () => {
    await expect(initObservability({ key: '' })).resolves.toBeUndefined();
  });

  test('a throwing client never breaks captureBoundaryError', async () => {
    const { client } = makeClient(true);
    await initObservability({ injectedClient: client });
    let code = '';
    expect(() => {
      code = captureBoundaryError(new Error('boom'), '\n at App');
    }).not.toThrow();
    expect(code).toMatch(/^PB-ERR-/);
  });
});

// ---------------------------------------------------------------------------
// 4. Anti-duplication
// ---------------------------------------------------------------------------

test.describe('dedupe by re-render', () => {
  test('same dedupeKey emits exactly once', async () => {
    const { client, captured } = makeClient();
    await initObservability({ injectedClient: client });
    for (let i = 0; i < 5; i++) {
      trackEvent('onboarding_step_reached', { step: 3 }, { dedupeKey: 'step-3' });
    }
    const stepEvents = captured.filter((c) => c.event === 'onboarding_step_reached');
    expect(stepEvents).toHaveLength(1);
    expect(stepEvents[0].properties?.step).toBe(3);
  });

  test('different dedupeKeys all emit', async () => {
    const { client, captured } = makeClient();
    await initObservability({ injectedClient: client });
    trackEvent('onboarding_step_reached', { step: 1 }, { dedupeKey: 'step-1' });
    trackEvent('onboarding_step_reached', { step: 2 }, { dedupeKey: 'step-2' });
    expect(captured.filter((c) => c.event === 'onboarding_step_reached')).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 5. Incident codes
// ---------------------------------------------------------------------------

test.describe('incident codes', () => {
  test('generateIncidentCode produces PB-ERR-XXXXXX shape', () => {
    const code = generateIncidentCode();
    expect(code).toMatch(/^PB-ERR-[A-Z2-9]{6}$/);
    expect(code).not.toMatch(/[01OI]/); // no ambiguous chars
  });

  test('captureBoundaryError emits exactly one app_error with the incident code', async () => {
    const { client, captured } = makeClient();
    await initObservability({ injectedClient: client });
    const code = captureBoundaryError(new TypeError('x is not a function'), '\n at MatchReadyBanner');
    const errors = captured.filter((c) => c.event === 'app_error');
    expect(errors).toHaveLength(1);
    expect(errors[0].properties?.incident_code).toBe(code);
    expect(errors[0].properties?.error_name).toBe('TypeError');
    expect(errors[0].properties?.component_top).toContain('MatchReadyBanner');
  });
});

// ---------------------------------------------------------------------------
// 6. Route normalization
// ---------------------------------------------------------------------------

test.describe('route normalization', () => {
  test('strips UUIDs from paths', () => {
    expect(normalizeRoute('/worker/123e4567-e89b-12d3-a456-426614174000')).toBe('/worker/:id');
  });

  test('strips numeric ids and keeps static segments', () => {
    expect(normalizeRoute('/academy/module/42/lesson')).toBe('/academy/module/:id/lesson');
    expect(normalizeRoute('/dashboard')).toBe('/dashboard');
  });
});

// ---------------------------------------------------------------------------
// 8. before_send — global automatic-property sanitizer (PO review 2026-09-10)
// ---------------------------------------------------------------------------
//
// PostHog attaches $current_url & friends AFTER the per-event allowlist. The
// global hook must guarantee that query strings (?ref=, ?email=, ?token=),
// fragments (#...) and raw UUIDs in automatic pathnames NEVER reach the final
// payload of ANY event, including $web_vitals.

test.describe('before_send global sanitizer', () => {
  test('reduces $current_url and URL props to origin + normalized pathname', () => {
    const out = sanitizePostHogEvent({
      event: 'page_viewed',
      properties: {
        $current_url: 'https://pipingbox.app/register?ref=GASPAR-SECRET',
        $initial_current_url: 'https://pipingbox.app/?ref=GASPAR-SECRET&utm_source=x',
        $session_entry_url: 'https://pipingbox.app/landing#secret-fragment',
        $referrer: 'https://www.google.com/search?q=secret+query',
        $initial_referrer: '$direct',
        $pathname: '/job/123e4567-e89b-12d3-a456-426614174000',
        route: '/register',
      },
    });
    expect(out).not.toBeNull();
    const json = JSON.stringify(out!.properties);
    expect(json).not.toContain('ref=');
    expect(json).not.toContain('GASPAR-SECRET');
    expect(json).not.toContain('#');
    expect(json).not.toContain('secret');
    expect(json).not.toContain('123e4567');
    expect(out!.properties.$current_url).toBe('https://pipingbox.app/register');
    expect(out!.properties.$initial_current_url).toBe('https://pipingbox.app/');
    expect(out!.properties.$session_entry_url).toBe('https://pipingbox.app/landing');
    expect(out!.properties.$referrer).toBe('https://www.google.com/search');
    expect(out!.properties.$initial_referrer).toBe('$direct');
    expect(out!.properties.$pathname).toBe('/job/:id');
  });

  test('?email=, ?token= and #fragment never reach the final payload', () => {
    const out = sanitizePostHogEvent({
      event: 'referral_captured',
      properties: {
        $current_url: 'https://pipingbox.app/register?email=test@example.com&token=SECRET#frag',
        origin: 'referral',
      },
    });
    expect(out).not.toBeNull();
    const json = JSON.stringify(out!.properties);
    expect(json).not.toContain('test@example.com');
    expect(json).not.toContain('token=');
    expect(json).not.toContain('SECRET');
    expect(json).not.toContain('#frag');
    expect(out!.properties.$current_url).toBe('https://pipingbox.app/register');
  });

  test('UUIDs in automatic pathnames are normalized to :id', () => {
    const out = sanitizeUrlPropertyValue(
      'https://pipingbox.app/worker/123e4567-e89b-12d3-a456-426614174000?ref=X',
    );
    expect(out).toBe('https://pipingbox.app/worker/:id');
  });

  test('query/fragment-content properties are dropped ($search, $hash)', () => {
    const out = sanitizePostHogEvent({
      event: 'page_viewed',
      properties: { $search: '?ref=GASPAR-SECRET', $hash: '#secret', route: '/' },
    });
    expect(out!.properties).not.toHaveProperty('$search');
    expect(out!.properties).not.toHaveProperty('$hash');
    expect(JSON.stringify(out!.properties)).not.toContain('GASPAR-SECRET');
  });

  test('$web_vitals is an allowed internal event and is sanitized too', () => {
    expect(OBS_INTERNAL_SDK_EVENTS).toContain('$web_vitals');
    const out = sanitizePostHogEvent({
      event: '$web_vitals',
      properties: {
        $current_url: 'https://pipingbox.app/?ref=GASPAR-SECRET',
        LCP: 120.5,
      },
    });
    expect(out).not.toBeNull();
    expect(out!.properties.LCP).toBe(120.5);
    expect(out!.properties.$current_url).toBe('https://pipingbox.app/');
  });

  test('every event — $web_vitals included — carries environment and app_version', () => {
    const out = sanitizePostHogEvent({ event: '$web_vitals', properties: {} });
    expect(out!.properties).toHaveProperty('environment');
    expect(out!.properties).toHaveProperty('app_version');
    const custom = sanitizePostHogEvent({ event: 'page_viewed', properties: { route: '/' } });
    expect(custom!.properties).toHaveProperty('environment');
    expect(custom!.properties).toHaveProperty('app_version');
  });

  test('?access_token= and numeric ids in pathname never reach the final payload', () => {
    const out = sanitizePostHogEvent({
      event: 'page_viewed',
      properties: {
        $current_url: 'https://pipingbox.app/job/42/details?access_token=SECRET-ACCESS#private',
      },
    });
    const json = JSON.stringify(out!.properties);
    expect(json).not.toContain('access_token');
    expect(json).not.toContain('SECRET-ACCESS');
    expect(json).not.toContain('#private');
    expect(out!.properties.$current_url).toBe('https://pipingbox.app/job/:id/details');
  });

  test('before_send(null) returns null and never throws', () => {
    expect(() => {
      // The SDK contract: null in -> null out, event dropped, no exception.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(sanitizePostHogEvent(null as any)).toBeNull();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(sanitizePostHogEvent(undefined as any)).toBeNull();
    }).not.toThrow();
  });

  test('an internal sanitization exception drops the event but never breaks the caller', () => {
    const evilProps = {
      get $current_url(): string {
        throw new Error('getter exploded');
      },
    };
    let result: unknown = 'unset';
    expect(() => {
      result = sanitizePostHogEvent({ event: 'page_viewed', properties: evilProps });
    }).not.toThrow();
    // Fail-closed for the payload: an unsanitizable event is NOT sent.
    expect(result).toBeNull();
  });

  test('ingestion protocol values pass through unmodified (gate-2 root cause)', () => {
    // posthog-js routes every event by properties.token (the public project
    // key) and derives the batch api_key from it. Redacting it made the
    // endpoint return 200 while storing NOTHING (gate 2, SHA 573ad7a).
    const publicKey = 'phc_' + 'A1b2'.repeat(12); // 52 chars: matches LONG_TOKEN_RE
    const sha = 'a'.repeat(40); // git SHA: matches LONG_TOKEN_RE by shape
    const insertId = 'jicqawx3jhzi6f3d';
    const out = sanitizePostHogEvent({
      event: 'page_viewed',
      properties: {
        token: publicKey,
        api_key: publicKey,
        app_version: sha,
        $insert_id: insertId,
        route: '/',
      },
    });
    expect(out!.properties.token).toBe(publicKey);
    expect(out!.properties.api_key).toBe(publicKey);
    expect(out!.properties.app_version).toBe(sha);
    expect(out!.properties.$insert_id).toBe(insertId);
    // ...while a credential-shaped value in a NON-protocol key still redacts:
    const other = sanitizePostHogEvent({
      event: 'page_viewed',
      properties: { leaked_secret: 'x'.repeat(48), route: '/' },
    });
    expect(other!.properties.leaked_secret).toBe('[redacted-token]');
  });

  test('unknown event names are dropped (closed ingestion)', () => {
    expect(
      sanitizePostHogEvent({ event: '$autocapture', properties: { $current_url: 'https://x.app/' } }),
    ).toBeNull();
    expect(sanitizePostHogEvent({ event: 'random_event', properties: {} })).toBeNull();
    expect(sanitizePostHogEvent({})).toBeNull();
  });

  test('technical ID properties survive (no false long-token redaction)', () => {
    const correlationId = '123e4567-e89b-12d3-a456-426614174000';
    const out = sanitizePostHogEvent({
      event: 'page_viewed',
      properties: {
        correlation_id: correlationId,
        pb_anonymous_id: correlationId,
        $session_id: correlationId,
        $browser_version: '132.0.6834.110',
      },
    });
    expect(out!.properties.correlation_id).toBe(correlationId);
    expect(out!.properties.pb_anonymous_id).toBe(correlationId);
    expect(out!.properties.$session_id).toBe(correlationId);
    expect(out!.properties.$browser_version).toBe('132.0.6834.110');
  });

  test('no generic deletion of token-named props; values are redacted instead', () => {
    const out = sanitizePostHogEvent({
      event: 'page_viewed',
      properties: {
        token_hint: 'ok-short-value', // name contains "token" but value is safe: kept
        some_credential: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9-secret', // long token value: redacted
      },
    });
    expect(out!.properties.token_hint).toBe('ok-short-value');
    expect(out!.properties.some_credential).not.toContain('eyJhbGci');
  });

  test('embedded URLs inside message-like props are stripped of query strings', () => {
    const out = sanitizePostHogEvent({
      event: 'app_error',
      properties: {
        error_message: 'failed after redirect to https://pipingbox.app/x?ref=GASPAR-SECRET',
      },
    });
    expect(out!.properties.error_message).toContain('https://pipingbox.app/x');
    expect(out!.properties.error_message).not.toContain('ref=');
    expect(out!.properties.error_message).not.toContain('GASPAR-SECRET');
  });

  test('$set and $set_once person properties go through the same sanitizer', () => {
    const out = sanitizePostHogEvent({
      event: '$identify',
      properties: {},
      $set: { $current_url: 'https://pipingbox.app/register?ref=GASPAR-SECRET' },
      $set_once: { $initial_referrer: 'https://x.app/?utm_campaign=secret' },
    });
    expect(out!.$set?.$current_url).toBe('https://pipingbox.app/register');
    expect(out!.$set_once?.$initial_referrer).toBe('https://x.app/');
  });
});

// ---------------------------------------------------------------------------
// 7. Queue + identity
// ---------------------------------------------------------------------------

test.describe('queue and identity', () => {
  test('events tracked before init flush after init, preserving order', async () => {
    trackEvent('page_viewed', { route: '/' });
    trackEvent('signup_started', { origin: 'referral' });
    const { client, captured } = makeClient();
    await initObservability({ injectedClient: client });
    expect(captured.map((c) => c.event)).toEqual(['page_viewed', 'signup_started']);
  });

  test('identify links the technical user id; reset detaches it', async () => {
    const { client, identified, resets } = makeClient();
    await initObservability({ injectedClient: client });
    identifyUser('user-uuid-123', { account_type: 'worker' });
    expect(identified).toHaveLength(1);
    expect(identified[0].id).toBe('user-uuid-123');
    expect(identified[0].traits?.account_type).toBe('worker');
    resetObservabilityUser();
    expect(resets()).toBe(1);
  });

  test('identify drops invalid account_type but still identifies', async () => {
    const { client, identified } = makeClient();
    await initObservability({ injectedClient: client });
    identifyUser('user-uuid-456', { account_type: 'root' });
    expect(identified[0].traits).not.toHaveProperty('account_type');
  });
});
