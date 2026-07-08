import type { FittingEntry } from './types';

/**
 * ASME B16.48 — Spectacle Blinds (Line Blinds)
 * Paddle Blinds and Spectacle Blinds.
 * Primary data: thickness and OD for the blank/spacer.
 */

interface SpectacleBlindRaw {
  nps: string;
  class_rating: number;
  od: number;       // mm — outer diameter of the blank
  thickness: number; // mm
}

const RAW: SpectacleBlindRaw[] = [
  // ─── Class 150 ───
  { nps: '2"',   class_rating: 150, od: 124.0, thickness: 6.4 },
  { nps: '3"',   class_rating: 150, od: 155.6, thickness: 6.4 },
  { nps: '4"',   class_rating: 150, od: 193.7, thickness: 6.4 },
  { nps: '6"',   class_rating: 150, od: 244.5, thickness: 7.9 },
  { nps: '8"',   class_rating: 150, od: 298.4, thickness: 9.5 },
  { nps: '10"',  class_rating: 150, od: 362.0, thickness: 11.1 },
  { nps: '12"',  class_rating: 150, od: 431.8, thickness: 12.7 },
  { nps: '14"',  class_rating: 150, od: 476.2, thickness: 14.3 },
  { nps: '16"',  class_rating: 150, od: 539.8, thickness: 15.9 },
  { nps: '18"',  class_rating: 150, od: 577.8, thickness: 17.5 },
  { nps: '20"',  class_rating: 150, od: 635.0, thickness: 19.1 },
  { nps: '24"',  class_rating: 150, od: 749.3, thickness: 22.2 },

  // ─── Class 300 ───
  { nps: '2"',   class_rating: 300, od: 124.0, thickness: 11.1 },
  { nps: '3"',   class_rating: 300, od: 168.3, thickness: 12.7 },
  { nps: '4"',   class_rating: 300, od: 200.0, thickness: 14.3 },
  { nps: '6"',   class_rating: 300, od: 269.9, thickness: 17.5 },
  { nps: '8"',   class_rating: 300, od: 330.2, thickness: 22.2 },
  { nps: '10"',  class_rating: 300, od: 387.4, thickness: 25.4 },
  { nps: '12"',  class_rating: 300, od: 450.8, thickness: 28.6 },
  { nps: '16"',  class_rating: 300, od: 571.5, thickness: 34.9 },
  { nps: '20"',  class_rating: 300, od: 698.5, thickness: 42.9 },
  { nps: '24"',  class_rating: 300, od: 812.8, thickness: 50.8 },
];

export const SPECTACLE_BLIND_ENTRIES: FittingEntry[] = RAW.map((s) => ({
  category: 'spectacle-blind',
  standard: 'ASME B16.48',
  nps: s.nps,
  class_rating: s.class_rating,
  dimensions: [
    { key: 'od', value_mm: s.od, isPrimaryAdvance: true },
    { key: 'thickness', value_mm: s.thickness },
  ],
}));

export const SPECTACLE_BLIND_CLASSES = [150, 300] as const;

export const SPECTACLE_BLIND_COLUMNS = [
  { key: 'nps', labelKey: 'NPS', align: 'left' as const },
  { key: 'od', labelKey: 'OD', align: 'right' as const, isPrimary: true },
  { key: 'thickness', labelKey: 'T', align: 'right' as const },
];

/**
 * Y-Strainer basic dimensions (MSS SP-59 reference, typical values)
 * Primary data: face-to-face for piping layout.
 */

interface YStrainerRaw {
  nps: string;
  class_rating: number;
  faceToFace: number; // mm
  height: number;     // mm — overall height including screen housing
}

const Y_RAW: YStrainerRaw[] = [
  { nps: '1/2"',   class_rating: 150, faceToFace: 108, height: 95 },
  { nps: '3/4"',   class_rating: 150, faceToFace: 117, height: 102 },
  { nps: '1"',     class_rating: 150, faceToFace: 127, height: 114 },
  { nps: '1-1/2"', class_rating: 150, faceToFace: 165, height: 152 },
  { nps: '2"',     class_rating: 150, faceToFace: 203, height: 178 },
  { nps: '3"',     class_rating: 150, faceToFace: 241, height: 229 },
  { nps: '4"',     class_rating: 150, faceToFace: 292, height: 279 },
  { nps: '6"',     class_rating: 150, faceToFace: 356, height: 356 },
  { nps: '8"',     class_rating: 150, faceToFace: 495, height: 432 },
  { nps: '10"',    class_rating: 150, faceToFace: 622, height: 521 },
  { nps: '12"',    class_rating: 150, faceToFace: 699, height: 610 },
];

export const Y_STRAINER_ENTRIES: FittingEntry[] = Y_RAW.map((y) => ({
  category: 'y-strainer',
  standard: 'MSS SP-59',
  nps: y.nps,
  class_rating: y.class_rating,
  dimensions: [
    { key: 'face_to_face', value_mm: y.faceToFace, isPrimaryAdvance: true },
    { key: 'height', value_mm: y.height },
  ],
}));

export const Y_STRAINER_COLUMNS = [
  { key: 'nps', labelKey: 'NPS', align: 'left' as const },
  { key: 'face_to_face', labelKey: 'Face-to-Face', align: 'right' as const, isPrimary: true },
  { key: 'height', labelKey: 'H', align: 'right' as const },
];
