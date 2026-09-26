// Shared monetization kill switch — Stream A containment (PO GO 2026-09-26 §6).
//
// Monetization is PRESERVE / DORMANT: the marketplace/tax/billing code is kept,
// but while the PO has not reactivated monetization NO checkout session may be
// created, regardless of what the app_stripe_prices catalog contains.
//
// Fail CLOSED: the store is enabled only when the environment carries the exact
// string "true". Absent, empty, misspelled or case-mismatched configuration all
// mean DISABLED — a misconfiguration must never open the till.

export function isMonetizationEnabled(value: string | undefined | null): boolean {
  return value === "true";
}

/** Edge Functions read their config from Deno.env; kept injectable for tests. */
export function monetizationDisabledResponse(): { error: string } {
  return { error: "monetization_disabled" };
}
