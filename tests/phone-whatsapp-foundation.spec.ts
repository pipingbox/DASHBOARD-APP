import { test, expect } from '@playwright/test';

/**
 * PB-WHATSAPP-FOUNDATION-001 — unit tests.
 *
 * Cobertura:
 *   1. Los 7 eventos del funnel phone/WhatsApp estan en la taxonomia cerrada
 *      OBS_EVENT_NAMES y respetan su schema de propiedades.
 *   2. error_category de phone_verification_failed usa el enum cerrado
 *      (valores fuera del enum se descartan).
 *   3. NUNCA viaja PII: ni phone_e164 ni el codigo OTP salen en las
 *      propiedades aunque el caller los pase por error.
 *   4. normalizeToE164 devuelve la forma canonica CON '+' (paridad backend).
 */

import {
  OBS_EVENT_NAMES,
  buildEventProps,
  PHONE_VERIFICATION_ERROR_CATEGORIES,
} from '../app/frontend/src/lib/observability';
import { normalizeToE164 } from '../app/frontend/src/lib/phone';

const PHONE_EVENTS = [
  'phone_added',
  'phone_verification_started',
  'phone_verification_completed',
  'phone_verification_failed',
  'whatsapp_jobs_opt_in',
  'whatsapp_marketing_opt_in',
  'whatsapp_opt_out',
] as const;

test.describe('PB-WHATSAPP-FOUNDATION-001 analytics taxonomy', () => {
  test('the seven phone/WhatsApp events are registered in the closed taxonomy', () => {
    for (const name of PHONE_EVENTS) {
      expect(OBS_EVENT_NAMES).toContain(name);
    }
  });

  test('phone_verification_failed keeps only closed error_category values', () => {
    for (const category of PHONE_VERIFICATION_ERROR_CATEGORIES) {
      const props = buildEventProps('phone_verification_failed', { error_category: category });
      expect(props.error_category).toBe(category);
    }
    const invalid = buildEventProps('phone_verification_failed', { error_category: '+34612345678' });
    expect(invalid.error_category).toBeUndefined();
  });

  test('opt-in events carry a boolean value only', () => {
    expect(buildEventProps('whatsapp_jobs_opt_in', { value: true }).value).toBe(true);
    expect(buildEventProps('whatsapp_marketing_opt_in', { value: false }).value).toBe(false);
  });

  test('PII never leaves the app: phone numbers and OTP codes are dropped', () => {
    for (const name of PHONE_EVENTS) {
      const props = buildEventProps(name, {
        phone_e164: '+34612345678',
        phone: '+34612345678',
        code: '123456',
        otp: '123456',
        value: 'not-a-boolean',
      });
      expect(props.phone_e164).toBeUndefined();
      expect(props.phone).toBeUndefined();
      expect(props.code).toBeUndefined();
      expect(props.otp).toBeUndefined();
      expect(props.value).toBeUndefined();
    }
  });
});

test.describe('PB-WHATSAPP-FOUNDATION-001 frontend phone normalization', () => {
  test('returns canonical E.164 WITH leading plus (backend parity)', () => {
    expect(normalizeToE164('ES', '612 345 678').e164).toBe('+34612345678');
    expect(normalizeToE164('ES', '+34 612345678').e164).toBe('+34612345678');
    expect(normalizeToE164('GB', '07700 900123').e164).toBe('+447700900123');
  });

  test('rejects unsupported countries and invalid lengths', () => {
    expect(normalizeToE164('US', '2025550123').valid).toBe(false);
    expect(normalizeToE164('ES', '61234').valid).toBe(false);
  });
});
