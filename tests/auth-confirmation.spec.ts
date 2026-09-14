import { expect, test } from '@playwright/test';
import {
  classifyAuthError,
  isNewSignupIdentity,
  maskEmail,
  safeAuthNextPath,
} from '../app/frontend/src/lib/authFlow';
import {
  buildEventProps,
  OBS_EVENT_NAMES,
} from '../app/frontend/src/lib/observability';
import { getAuthCallbackUrl } from '../app/frontend/src/lib/constants';

test.describe('auth confirmation flow helpers', () => {
  test('masks email without exposing the local part', () => {
    expect(maskEmail('worker.qa@example.com')).toBe('w***@example.com');
    expect(maskEmail('x@example.com')).toBe('x***@example.com');
    expect(maskEmail('invalid')).toBe('');
  });

  test('distinguishes a new signup and fails safe for ambiguous responses', () => {
    const now = Date.parse('2026-09-14T09:00:00Z');
    expect(
      isNewSignupIdentity(
        {
          identities: [{ provider: 'email' }],
          created_at: '2026-09-14T08:59:55Z',
        },
        now,
      ),
    ).toBe(true);
    expect(
      isNewSignupIdentity(
        {
          identities: [{ provider: 'email' }],
          created_at: '2026-09-14T08:00:00Z',
        },
        now,
      ),
    ).toBe(false);
    expect(isNewSignupIdentity({ identities: [{ provider: 'email' }] }, now)).toBe(false);
    expect(isNewSignupIdentity({ identities: [] }, now)).toBe(false);
    expect(isNewSignupIdentity({})).toBe(false);
    expect(isNewSignupIdentity(null)).toBe(false);
  });

  test('maps Supabase errors to closed UI states', () => {
    expect(classifyAuthError({ code: 'email_not_confirmed' })).toBe('email_not_confirmed');
    expect(classifyAuthError('Email not confirmed')).toBe('email_not_confirmed');
    expect(classifyAuthError({ status: 429, message: 'request failed' })).toBe('rate_limit');
    expect(classifyAuthError({ message: 'Invalid login credentials' })).toBe('generic');
    expect(classifyAuthError(null)).toBeNull();
  });

  test('accepts only local callback destinations', () => {
    expect(safeAuthNextPath('/dashboard')).toBe('/dashboard');
    expect(safeAuthNextPath('/profile?tab=skills')).toBe('/profile?tab=skills');
    expect(safeAuthNextPath('https://example.com')).toBe('/dashboard');
    expect(safeAuthNextPath('//example.com')).toBe('/dashboard');
  });

  test('builds the canonical callback URL with language and flow', () => {
    expect(getAuthCallbackUrl('/dashboard', 'ro-RO', 'confirmation')).toBe(
      'https://pipingbox.com/auth/callback?next=%2Fdashboard&lng=ro&flow=confirmation',
    );
  });
});

test.describe('auth confirmation observability', () => {
  const eventNames = [
    'signup_confirmation_required',
    'confirmation_resend_requested',
    'confirmation_resend_succeeded',
    'confirmation_resend_failed',
    'email_confirmation_completed',
    'signin_blocked_unconfirmed',
  ] as const;

  test('registers the six closed-schema events', () => {
    for (const eventName of eventNames) {
      expect(OBS_EVENT_NAMES).toContain(eventName);
    }
  });

  test('drops PII and rejects values outside the auth enums', () => {
    const props = buildEventProps('confirmation_resend_failed', {
      route: '/check-email',
      correlation_id: 'technical-correlation-id',
      provider: 'email',
      status: 'failed',
      reason_code: 'rate_limited',
      attempt_bucket: 'retry',
      email: 'worker.qa@example.com',
    });
    expect(props).toEqual({
      route: '/check-email',
      correlation_id: 'technical-correlation-id',
      provider: 'email',
      status: 'failed',
      reason_code: 'rate_limited',
      attempt_bucket: 'retry',
    });

    const invalid = buildEventProps('signin_blocked_unconfirmed', {
      provider: 'password',
      status: 'unexpected',
      reason_code: 'raw_error_message',
      attempt_bucket: 'third',
    });
    expect(invalid).toEqual({});
  });
});