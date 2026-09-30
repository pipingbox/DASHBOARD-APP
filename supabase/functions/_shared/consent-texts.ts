// PB-MARKET-CONSENT-001 — canonical consent-text registry (SERVER-SIDE).
//
// The client never sends the consent TEXT. It sends a version key; this
// registry resolves the exact wording, and the server stores the resolved
// text plus its SHA-256 in app_consent_evidence (sql/012-consent-evidence.sql).
// A version key that is not registered here fails closed — it cannot mint
// evidence for a wording nobody approved.
//
// WORDING IS PROVISIONAL (PO 2026-09-23, T5): the final legal wording may be
// revised by counsel WITHOUT touching the evidence model. A revision is a NEW
// entry with a NEW version key; historical rows keep the wording that was
// actually shown. Never edit an existing entry's text in place.

export interface ConsentText {
  version: string;
  consentType: "IMMEDIATE_SUPPLY_DIGITAL_CONTENT" | "TERMS_ACCEPTANCE";
  text: string;
}

export const CONSENT_TEXTS: readonly ConsentText[] = [
  {
    version: "v2026-09-23",
    consentType: "IMMEDIATE_SUPPLY_DIGITAL_CONTENT",
    // Provisional wording pending counsel review (PO, section 2 of the T5 GO).
    text:
      "I expressly request that the supply of the digital content begins " +
      "immediately, and I acknowledge that, once the supply has begun, I lose " +
      "my legal right of withdrawal to the extent provided by the applicable " +
      "law.",
  },
];

export function resolveConsentText(version: string): ConsentText | null {
  return CONSENT_TEXTS.find((c) => c.version === version) ?? null;
}

/** SHA-256 hex of the canonical text, computed at write time. */
export async function hashConsentText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
