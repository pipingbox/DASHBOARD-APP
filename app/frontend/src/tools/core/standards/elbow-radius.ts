/**
 * Elbow center-line radius (CLR) reference table.
 *
 * Values are the commonly tabulated long-radius (LR = 1.5 × NPS) and
 * short-radius (SR = 1.0 × NPS) center-line radii from ASME B16.9
 * cross-reference tables. They are **CROSS_REFERENCE**, not VERIFIED_PRIMARY.
 *
 * Ticket: PB-TOOLS-FUNCTIONAL-PARITY-001 / W1.B
 */

export interface ElbowRadius {
  nps: string;
  /** Long-radius center-line radius (mm). */
  lrMm: number;
  /** Short-radius center-line radius (mm). */
  srMm: number;
}

export const ELBOW_RADIUS_TABLE: readonly ElbowRadius[] = [
  { nps: '1/8', lrMm: 28.58, srMm: 19.05 },
  { nps: '1/4', lrMm: 38.1, srMm: 25.4 },
  { nps: '3/8', lrMm: 47.63, srMm: 31.75 },
  { nps: '1/2', lrMm: 57.15, srMm: 38.1 },
  { nps: '3/4', lrMm: 76.2, srMm: 50.8 },
  { nps: '1', lrMm: 95.25, srMm: 63.5 },
  { nps: '1-1/4', lrMm: 120.65, srMm: 80.43 },
  { nps: '1-1/2', lrMm: 139.7, srMm: 92.71 },
  { nps: '2', lrMm: 177.8, srMm: 118.53 },
  { nps: '2-1/2', lrMm: 215.9, srMm: 143.93 },
  { nps: '3', lrMm: 266.7, srMm: 177.8 },
  { nps: '3-1/2', lrMm: 304.8, srMm: 203.2 },
  { nps: '4', lrMm: 355.6, srMm: 237.36 },
  { nps: '5', lrMm: 444.5, srMm: 296.33 },
  { nps: '6', lrMm: 533.4, srMm: 355.6 },
  { nps: '8', lrMm: 711.2, srMm: 474.17 },
  { nps: '10', lrMm: 889.0, srMm: 592.67 },
  { nps: '12', lrMm: 1066.8, srMm: 711.2 },
  { nps: '14', lrMm: 1244.6, srMm: 829.31 },
  { nps: '16', lrMm: 1422.4, srMm: 948.03 },
  { nps: '18', lrMm: 1600.2, srMm: 1066.8 },
  { nps: '20', lrMm: 1778.0, srMm: 1185.32 },
  { nps: '24', lrMm: 2133.6, srMm: 1422.4 },
];

export const ELBOW_RADIUS_PROVENANCE = {
  sourceStatus: 'CROSS_REFERENCE' as const,
  sourceNote:
    'Long-radius (1.5×NPS) and short-radius (1.0×NPS) values from ASME B16.9 cross-reference tables. Not verified against a licensed primary text.',
};

export function getElbowRadius(nps: string, type: 'LR' | 'SR'): number | undefined {
  const row = ELBOW_RADIUS_TABLE.find((r) => r.nps === nps);
  if (!row) return undefined;
  return type === 'LR' ? row.lrMm : row.srMm;
}
