import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isMonetizationEnabled } from '../supabase/functions/_shared/monetization';

/**
 * Monetization kill switch — Stream A containment (PO GO 2026-09-26 §6).
 *
 * While monetization is PRESERVE / DORMANT, the server must REFUSE to create
 * checkout sessions unless the environment explicitly enables them. This is a
 * pure isolated test: it never calls Stripe, never creates a session, never
 * touches the deployed function — it verifies (a) the predicate's fail-closed
 * behavior matrix and (b) that create-checkout wires the guard BEFORE any
 * auth/DB/Stripe work.
 */

const read = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

const checkoutSource = read('../supabase/functions/create-checkout/index.ts');

test.describe('monetization kill switch — predicate (fail-closed matrix)', () => {
  test('absent configuration blocks by default', () => {
    expect(isMonetizationEnabled(undefined)).toBe(false);
    expect(isMonetizationEnabled(null)).toBe(false);
  });

  test('invalid or ambiguous configuration blocks by default', () => {
    for (const value of ['', 'false', '0', 'no', 'disabled', 'TRUE', 'True', '1', 'yes', 'enabled', ' true', 'true ']) {
      expect(isMonetizationEnabled(value), `value ${JSON.stringify(value)} must NOT enable monetization`).toBe(false);
    }
  });

  test('only the exact string "true" enables monetization', () => {
    expect(isMonetizationEnabled('true')).toBe(true);
  });
});

test.describe('monetization kill switch — create-checkout wiring', () => {
  test('the guard is present and returns 403 monetization_disabled', () => {
    expect(checkoutSource).toContain('isMonetizationEnabled(Deno.env.get("MONETIZATION_ENABLED"))');
    expect(checkoutSource).toContain('{ error: "monetization_disabled" }, 403');
  });

  test('the guard runs BEFORE auth, price lookup and any Stripe session creation', () => {
    const guardIndex = checkoutSource.indexOf('isMonetizationEnabled(Deno.env.get("MONETIZATION_ENABLED"))');
    expect(guardIndex).toBeGreaterThan(-1);

    const authIndex = checkoutSource.indexOf('supabase.auth.getUser(token)');
    const priceIndex = checkoutSource.indexOf('.from("app_stripe_prices")');
    const sessionIndex = checkoutSource.indexOf('stripe.checkout.sessions.create');
    const orderIndex = checkoutSource.indexOf('.from("app_orders")');

    for (const [label, index] of [
      ['JWT auth', authIndex],
      ['price lookup', priceIndex],
      ['Stripe session creation', sessionIndex],
      ['pending order insert', orderIndex],
    ] as const) {
      expect(index, `${label} must exist in create-checkout`).toBeGreaterThan(-1);
      expect(guardIndex, `kill switch must run before ${label}`).toBeLessThan(index);
    }
  });

  test('the environment contract is documented in the function header', () => {
    expect(checkoutSource).toContain('MONETIZATION_ENABLED');
    expect(checkoutSource).toMatch(/must be exactly "true"/);
  });
});
