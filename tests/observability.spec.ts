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
  buildEventProps,
  sanitizeValue,
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
