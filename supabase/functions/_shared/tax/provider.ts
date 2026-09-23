// PB-MARKET-TAX-ENGINE-001 — TaxProvider interface (DEC-69, PO LOCKED).
//
// Architecture:
//   PIPINGBOX  ->  TaxProvider (this interface)  ->  Stripe Tax (adapter)
//
// Checkout/order core NEVER contains Stripe-Tax-specific logic. It speaks to
// this interface; the Stripe implementation lives in ./stripe-tax.ts and is
// the ONLY file that may mention Stripe Tax APIs. A second provider is a new
// adapter implementing this interface, not a rewrite of checkout.
//
// What the provider decides: VAT/GST/Sales Tax, jurisdiction, taxability per
// product tax code, threshold monitoring where supported.
// What PIPINGBOX decides: LegalEntity, buyer/product classification, orders,
// invoices, tax RESULTS persistence, evidence, ledger, audit trail.
//
// NON_EU ≠ TAX_FREE: a provider that returns no tax for a jurisdiction is a
// fact about its configuration, never a conclusion that no obligation exists.

export type ProductTaxCategory =
  | "RECORDED_DIGITAL_COURSE"
  | "SAAS_TOOLS"
  | "PREMIUM_SUBSCRIPTION"
  | "RECRUITMENT_SERVICE"
  | "B2B_ENTERPRISE_SERVICE"
  | "EXAM_PREPARATION"
  | "EXAM_INTERMEDIATION";

export interface TaxLineItem {
  productKey: string;
  taxCategory: ProductTaxCategory | null;
  /** Net amount in cents (tax_behavior = 'exclusive', DEC-67). */
  netAmountCents: number;
  currency: string;
}

export interface TaxCustomerContext {
  country: string | null;
  region?: string | null;
  /** Three-state: null = not determined. Never default to consumer. */
  isBusiness: boolean | null;
  taxId?: string | null;
  taxIdStatus?: string | null;
}

export interface TaxDetermination {
  provider: string;
  providerReference: string | null;
  jurisdiction: string | null;
  taxType: string | null;
  /** Percentage points as reported by the provider. */
  taxRate: number | null;
  taxableAmountCents: number | null;
  taxAmountCents: number | null;
  currency: string | null;
  /** False = "the provider computed no tax", which is NOT "no obligation". */
  taxCharged: boolean;
  raw: Record<string, unknown> | null;
}

export interface TaxProvider {
  readonly name: string;

  /** Whether the provider is configured and active for this deployment. */
  isEnabled(): boolean;

  /**
   * Session-level tax configuration for checkout (e.g. automatic_tax flag),
   * expressed provider-neutrally. The checkout core applies the result
   * without knowing what it means to the provider.
   */
  checkoutTaxConfig(): Record<string, unknown>;

  /**
   * Determine tax for a set of net line items and a customer context.
   * Returns null when the provider cannot determine (disabled, unmapped
   * product, missing address) — NULL honestly means "not determined".
   */
  determine(
    items: TaxLineItem[],
    customer: TaxCustomerContext,
  ): Promise<TaxDetermination | null>;
}
