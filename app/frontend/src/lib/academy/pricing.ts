import { supabase, TABLES } from '@/lib/supabase';
import { courseProductKeys } from '@/lib/academy/entitlement';

/**
 * PB-MARKET-PRICING-001 — canonical net-price resolution.
 *
 * SINGLE SOURCE OF TRUTH: `app_stripe_prices.amount_cents` (tax_behavior =
 * 'exclusive', DEC-67). The amount is NET; the tax engine (DEC-69) adds the
 * indirect tax on top. `app_academy_courses.price_eur` is a DISPLAY CACHE
 * ONLY — every consumer must resolve with catalog priority through this
 * module, never read the course column directly for a monetized course.
 *
 * Until the tax engine is live (PB-MARKET-TAX-ENGINE-001), any surface that
 * shows a price must label it as excluding VAT (English-fallback precedent,
 * same as PremiumGate). No hardcoded price literals in components.
 */

export interface CatalogPrice {
  productKey: string;
  amountCents: number | null;
  currency: string;
  taxBehavior: 'inclusive' | 'exclusive';
}

const catalogCache = new Map<string, CatalogPrice>();
let catalogLoad: Promise<void> | null = null;

/** Load the whole price catalog once per session (small table, one query). */
async function loadCatalog(): Promise<void> {
  if (catalogLoad) return catalogLoad;
  catalogLoad = (async () => {
    try {
      const { data } = await supabase
        .from(TABLES.stripePrices)
        .select('product_key, amount_cents, currency, tax_behavior');
      for (const row of data ?? []) {
        catalogCache.set(row.product_key, {
          productKey: row.product_key,
          amountCents: row.amount_cents,
          currency: row.currency ?? 'EUR',
          taxBehavior: row.tax_behavior ?? 'exclusive',
        });
      }
    } catch {
      // Fail-safe display: catalog unavailable -> callers show no price
      // rather than an invented one. Nothing here can block a purchase flow
      // because no purchase flow is active yet.
    }
  })();
  return catalogLoad;
}

/** Await the catalog (one query), then read synchronously. */
export async function getCatalogPrice(productKey: string): Promise<CatalogPrice | null> {
  await loadCatalog();
  return catalogCache.get(productKey) ?? null;
}

/**
 * Net price in cents for a catalog product, or null when absent/unpriced
 * (e.g. enterprise negotiations). NEVER falls back to a hardcoded number.
 */
export async function getNetPriceCents(productKey: string): Promise<number | null> {
  const price = await getCatalogPrice(productKey);
  return price?.amountCents ?? null;
}

/**
 * Net price for a course: catalog first (mapped via the same product-key map
 * the entitlement gate uses), then the course's display-cache column, then
 * null. This is the ONLY way components should resolve a course price.
 */
export async function getCourseNetPriceEur(
  slug: string,
  fallbackPriceEur: number | null | undefined,
): Promise<number | null> {
  const keys = courseProductKeys(slug);
  if (keys.length > 0) {
    for (const key of keys) {
      const cents = await getNetPriceCents(key);
      if (cents != null) return cents / 100;
    }
  }
  return fallbackPriceEur ?? null;
}

/** '€59.90' — net amount, EUR. Excludes tax by definition (DEC-67). */
export function formatNetPriceEur(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

/**
 * The VAT note every price surface must carry until the tax engine computes
 * jurisdiction-specific totals (PB-MARKET-TAX-ENGINE-001).
 */
export const EXCL_VAT_NOTE = 'excl. VAT';
