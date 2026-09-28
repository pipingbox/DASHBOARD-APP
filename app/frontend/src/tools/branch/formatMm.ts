/* ───────────────────────────────────────────────────────────────────────────
   Shared numeric formatting for millimetre labels in physical PDF artifacts
   (PB-BRANCH-PDF-NUMERIC-FORMAT-001).

   Derived dimensions (e.g. ID = OD − 2·WT) carry binary floating-point noise
   (114.3 − 12.04 = 102.25999999999999). This helper renders general pipe
   dimensions with at most `maxDecimals` decimals and no trailing zeros, so
   labels read 102.26 / 77.92 / 168.3 / 508 exactly as intended.

   Canonical values keep their established fixed precision elsewhere
   (circumference and Δs: 3 decimals; picaje X/Y: current precision) —
   this helper is for human-readable dimension labels only, never for
   geometry or coordinates.
   ─────────────────────────────────────────────────────────────────────────── */

export function formatMm(value: number, maxDecimals = 2): string {
  return Number(value.toFixed(maxDecimals)).toString();
}
