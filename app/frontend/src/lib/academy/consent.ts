/**
 * PB-MARKET-CONSENT-001 — immediate-supply consent (withdrawal right).
 *
 * The buyer of a recorded digital course must tick a NEVER pre-ticked
 * checkbox before checkout: an express request for immediate supply plus an
 * express acknowledgement that the legal right of withdrawal is lost once the
 * supply begins, where the applicable regime so provides.
 *
 * The client sends only the VERSION KEY + the acceptance flag to
 * create-checkout. The canonical wording is resolved and hashed SERVER-SIDE
 * (supabase/functions/_shared/consent-texts.ts); the text below is the
 * display copy of that same registry entry and must stay in sync with it.
 * The wording is provisional pending counsel review — a revision is a new
 * version key, never an in-place edit.
 *
 * NO consumption-percentage refund policy exists or may be added: course
 * progress is product/analytics data, never a withdrawal-right rule
 * (PO 2026-09-23, T5).
 */

/** Registry version key of the wording currently displayed. */
export const SUPPLY_CONSENT_VERSION = 'v2026-09-23';

/**
 * Display copy of the server registry entry `v2026-09-23`
 * (IMMEDIATE_SUPPLY_DIGITAL_CONTENT). Keep byte-identical in meaning with
 * supabase/functions/_shared/consent-texts.ts — the server stores its own
 * canonical text and hash, so a drift here changes the label, not the
 * evidence; still, the two must not diverge.
 */
export const SUPPLY_CONSENT_TEXT =
  'I expressly request that the supply of the digital content begins ' +
  'immediately, and I acknowledge that, once the supply has begun, I lose ' +
  'my legal right of withdrawal to the extent provided by the applicable ' +
  'law.';
