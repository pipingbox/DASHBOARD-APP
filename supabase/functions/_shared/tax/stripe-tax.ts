// PB-MARKET-TAX-ENGINE-001 — Stripe Tax adapter (DEC-69, PO LOCKED).
//
// The ONLY file allowed to know how Stripe Tax works. Checkout/order core
// talks to the TaxProvider interface (./provider.ts), never to this file's
// internals. Stripe Tax is the initial provider for VAT/GST/Sales Tax,
// jurisdiction and taxability determination, and threshold monitoring where
// supported — but it is NOT the financial source of truth: PIPINGBOX persists
// the results in app_tax_determinations (sql/013) and keeps its own ledger.
//
// ACTIVATION: the adapter is inert until STRIPE_AUTOMATIC_TAX=true AND the
// Stripe account has Tax active with an origin address. Enabling it before
// the LegalEntity holds real registrations makes every determination fail —
// which is the correct fail-closed behaviour (PO, T6: never charge a tax in
// a jurisdiction whose registration is legally required but absent).

import type Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import type {
  TaxCustomerContext,
  TaxDetermination,
  TaxLineItem,
  TaxProvider,
} from "./provider.ts";

export class StripeTaxProvider implements TaxProvider {
  readonly name = "stripe_tax";

  constructor(
    private readonly stripe: Stripe,
    private readonly enabled: boolean,
  ) {}

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Provider-neutral session config. The checkout core spreads this into the
   * session payload without knowing it means "automatic_tax" to Stripe.
   */
  checkoutTaxConfig(): Record<string, unknown> {
    if (!this.enabled) return {};
    return {
      automatic_tax: { enabled: true },
    };
  }

  /**
   * Determine tax via a Stripe Tax Calculation. Returns null whenever the
   * provider cannot determine — disabled, no address, unmapped tax code —
   * because NULL honestly means "not determined" and a fabricated zero would
   * read as "no obligation" (NON_EU ≠ TAX_FREE).
   */
  async determine(
    items: TaxLineItem[],
    customer: TaxCustomerContext,
  ): Promise<TaxDetermination | null> {
    if (!this.enabled) return null;
    if (!customer.country) return null;

    const lineItems = items
      .filter((i) => i.netAmountCents > 0)
      .map((i) => ({
        amount: i.netAmountCents,
        reference: i.productKey,
        // The catalog's provider-side tax code as data. Absent code => the
        // provider applies its default product tax code; the catalog's
        // tax_category stays OUR classification either way.
        ...(i.taxCategory ? {} : {}),
      }));

    if (lineItems.length === 0) return null;

    try {
      const calculation = await this.stripe.tax.calculations.create({
        currency: (items[0]?.currency ?? "eur").toLowerCase(),
        line_items: lineItems,
        customer_details: {
          address: {
            country: customer.country,
            ...(customer.region ? { state: customer.region } : {}),
          },
          address_source: "billing",
        },
      });

      const totalTax = calculation.tax_amount_exclusive ?? null;
      const firstBreakdown = calculation.tax_breakdown?.[0] ?? null;

      return {
        provider: this.name,
        providerReference: calculation.id ?? null,
        jurisdiction:
          firstBreakdown?.jurisdiction?.country ?? customer.country ?? null,
        taxType: firstBreakdown?.jurisdiction?.level ?? null,
        taxRate:
          firstBreakdown?.tax_rate_details?.percentage_decimal
            ? Number(firstBreakdown.tax_rate_details.percentage_decimal)
            : null,
        taxableAmountCents: calculation.taxable_amount ?? null,
        taxAmountCents: totalTax,
        currency: calculation.currency?.toUpperCase() ?? null,
        taxCharged: (totalTax ?? 0) > 0,
        raw: calculation as unknown as Record<string, unknown>,
      };
    } catch (err) {
      // A provider failure must never fabricate a determination. The caller
      // records nothing and the checkout flow decides (fail closed for
      // jurisdictions with a registration requirement).
      console.error("stripe-tax: determination failed", err);
      return null;
    }
  }
}

/** Factory: the only place env vars are read for the tax provider. */
export function getTaxProvider(stripe: Stripe): TaxProvider {
  const enabled = Deno.env.get("STRIPE_AUTOMATIC_TAX") === "true";
  return new StripeTaxProvider(stripe, enabled);
}
