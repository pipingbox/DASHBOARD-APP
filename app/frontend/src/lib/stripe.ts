import { supabase, TABLES } from '@/lib/supabase';

/**
 * Stripe checkout helpers (PB-STRIPE-001 Fase 5).
 *
 * Prices are never hardcoded here. Everything comes from app_stripe_prices,
 * which is the mirror of the Stripe catalog. A price shown in the UI and a
 * price charged at checkout must be the same number, and the only way to
 * guarantee that is to read both from one place.
 */

export interface CatalogPrice {
  product_key: string;
  amount_cents: number | null;
  currency: string;
  billing_type: 'recurring' | 'one_time';
  interval: 'month' | 'year' | null;
}

/** Format cents as a euro string: 12900 -> "129.00" */
export function formatPrice(amountCents: number | null): string {
  if (amountCents == null) return '—';
  return (amountCents / 100).toFixed(2);
}

/**
 * Load the sellable catalog, optionally filtered by product_key prefix.
 * Only active prices are returned, so a product archived in Stripe disappears
 * from the UI on its own.
 */
export async function fetchCatalogPrices(prefix?: string): Promise<CatalogPrice[]> {
  let query = supabase
    .from(TABLES.stripePrices)
    .select('product_key, amount_cents, currency, billing_type, interval')
    .eq('is_active', true)
    .order('amount_cents', { ascending: true });

  if (prefix) {
    query = query.like('product_key', `${prefix}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error('fetchCatalogPrices failed', error);
    return [];
  }
  return (data ?? []) as CatalogPrice[];
}

export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'not_authenticated' | 'not_available' | 'failed' };

/**
 * Start a Stripe Checkout session and hand back the URL to redirect to.
 *
 * Only product_key travels to the server. The amount is resolved server-side
 * in the create-checkout Edge Function — a client that could send its own
 * price could buy a EUR 399 pack for a cent.
 */
export async function startCheckout(
  productKeys: string | string[],
  metadata?: Record<string, string>,
): Promise<CheckoutResult> {
  const keys = Array.isArray(productKeys) ? productKeys : [productKeys];

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    return { ok: false, reason: 'not_authenticated' };
  }

  const { data, error } = await supabase.functions.invoke('create-checkout', {
    body: { product_keys: keys, metadata },
  });

  if (error) {
    console.error('startCheckout failed', error);
    return { ok: false, reason: 'failed' };
  }
  if (!data?.url) {
    // create-checkout returns 409 product_not_available when the product has no
    // Stripe price yet — i.e. Fase 1 has not mapped it, or it was archived.
    return { ok: false, reason: 'not_available' };
  }

  return { ok: true, url: data.url as string };
}

/** Convenience: start checkout and navigate. Returns an error reason on failure. */
export async function redirectToCheckout(
  productKeys: string | string[],
  metadata?: Record<string, string>,
): Promise<Exclude<CheckoutResult, { ok: true }>['reason'] | null> {
  const result = await startCheckout(productKeys, metadata);
  if (result.ok) {
    window.location.href = result.url;
    return null;
  }
  return result.reason;
}
