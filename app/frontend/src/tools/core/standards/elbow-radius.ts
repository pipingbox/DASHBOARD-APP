/**
 * Elbow center-line radius (CLR) reference table.
 *
 * Values are the ASME B16.9 center-to-end dimensions of butt-welding elbows,
 * cross-referenced against the Weldbend catalog:
 *   - 90° Long Radius elbow, dimension A (Weldbend catalog, p.26):
 *     NPS 1/2–1: A = 1.50 in; NPS ≥ 1-1/4: A = 1.5 × NPS (in inches).
 *     For a 90° elbow the center-to-end equals the center-line radius.
 *   - 90° Short Radius elbow, dimension A (Weldbend catalog, p.26):
 *     A = 1.0 × NPS (in inches). Short-radius elbows are not tabulated
 *     below NPS 1.
 *
 * Exact millimetre values are stored as inches × 25.4 (exact by SI
 * definition); published rounded-metric equivalents are noted per row.
 *
 * Provenance: **CROSS_REFERENCE** — not verified against a licensed
 * primary ASME B16.9 text. NPS sizes without a tabulated B16.9 elbow
 * (below NPS 1/2) return explicit N/A (undefined), never a silent
 * fallback or extrapolated value.
 *
 * Ticket: PB-TOOLS-FUNCTIONAL-PARITY-001 / W1.B.1
 */

export interface ElbowRadius {
  nps: string;
  /** Long-radius center-line radius (mm). */
  lrMm: number;
  /** Short-radius center-line radius (mm), or undefined when not tabulated. */
  srMm: number | undefined;
}

/** in → mm, exact by definition of the inch. */
const IN = 25.4;

export const ELBOW_RADIUS_TABLE: readonly ElbowRadius[] = [
  // 90° LR, A = 1.50 in for NPS 1/2–1 (B16.9 / Weldbend p.26). SR not tabulated < NPS 1.
  { nps: '1/2', lrMm: 1.5 * IN, srMm: undefined }, // A = 1.50 in (≈38 mm)
  { nps: '3/4', lrMm: 1.5 * IN, srMm: undefined }, // A = 1.50 in (≈38 mm)
  { nps: '1', lrMm: 1.5 * IN, srMm: 1.0 * IN }, // LR A = 1.50 in; SR A = 1.00 in (≈25 mm)
  // NPS ≥ 1-1/4: LR A = 1.5 × NPS; SR A = 1.0 × NPS (Weldbend p.26).
  { nps: '1-1/4', lrMm: 1.875 * IN, srMm: 1.25 * IN }, // 1.88 in (≈48 mm) / 1.25 in (≈32 mm)
  { nps: '1-1/2', lrMm: 2.25 * IN, srMm: 1.5 * IN }, // 2.25 in (≈57 mm) / 1.50 in (≈38 mm)
  { nps: '2', lrMm: 3.0 * IN, srMm: 2.0 * IN }, // 3.00 in (≈76 mm) / 2.00 in (≈51 mm)
  { nps: '2-1/2', lrMm: 3.75 * IN, srMm: 2.5 * IN }, // 3.75 in (≈95 mm) / 2.50 in (≈64 mm)
  { nps: '3', lrMm: 4.5 * IN, srMm: 3.0 * IN }, // 4.50 in (≈114 mm) / 3.00 in (≈76 mm)
  { nps: '3-1/2', lrMm: 5.25 * IN, srMm: 3.5 * IN }, // 5.25 in (≈133 mm) / 3.50 in (≈89 mm)
  { nps: '4', lrMm: 6.0 * IN, srMm: 4.0 * IN }, // 6.00 in (≈152 mm) / 4.00 in (≈102 mm)
  { nps: '5', lrMm: 7.5 * IN, srMm: 5.0 * IN }, // 7.50 in (≈190 mm) / 5.00 in (≈127 mm)
  { nps: '6', lrMm: 9.0 * IN, srMm: 6.0 * IN }, // 9.00 in (228.6 mm, ≈229) / 6.00 in (152.4 mm, ≈152)
  { nps: '8', lrMm: 12.0 * IN, srMm: 8.0 * IN }, // 12.00 in (304.8, ≈305) / 8.00 in (203.2, ≈203)
  { nps: '10', lrMm: 15.0 * IN, srMm: 10.0 * IN }, // 15.00 in (381.0) / 10.00 in (254.0)
  { nps: '12', lrMm: 18.0 * IN, srMm: 12.0 * IN }, // 18.00 in (457.2, ≈457) / 12.00 in (304.8, ≈305)
  { nps: '14', lrMm: 21.0 * IN, srMm: 14.0 * IN }, // 21.00 in (533.4, ≈533) / 14.00 in (355.6, ≈356)
  { nps: '16', lrMm: 24.0 * IN, srMm: 16.0 * IN }, // 24.00 in (609.6, ≈610) / 16.00 in (406.4, ≈406)
  { nps: '18', lrMm: 27.0 * IN, srMm: 18.0 * IN }, // 27.00 in (685.8, ≈686) / 18.00 in (457.2, ≈457)
  { nps: '20', lrMm: 30.0 * IN, srMm: 20.0 * IN }, // 30.00 in (762.0) / 20.00 in (508.0)
  { nps: '24', lrMm: 36.0 * IN, srMm: 24.0 * IN }, // 36.00 in (914.4, ≈914) / 24.00 in (609.6, ≈610)
];

export const ELBOW_RADIUS_PROVENANCE = {
  sourceStatus: 'CROSS_REFERENCE' as const,
  sourceNote:
    'ASME B16.9 90° elbow center-to-end dimension A, cross-referenced against the Weldbend catalog p.26 (LR: A = 1.50 in for NPS 1/2–1, else 1.5 × NPS; SR: A = 1.0 × NPS). Not verified against a licensed primary text.',
};

/**
 * Resolve the CLR for an NPS and radius type.
 * Returns undefined (explicit N/A) when the combination is not tabulated:
 * NPS below 1/2, or short-radius below NPS 1. Never falls back silently.
 */
export function getElbowRadius(nps: string, type: 'LR' | 'SR'): number | undefined {
  const row = ELBOW_RADIUS_TABLE.find((r) => r.nps === nps);
  if (!row) return undefined;
  return type === 'LR' ? row.lrMm : row.srMm;
}
