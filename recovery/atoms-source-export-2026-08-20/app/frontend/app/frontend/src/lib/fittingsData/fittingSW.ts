import type { FittingEntry } from './types';

/**
 * ASME B16.11 — Socket Weld Fittings (3000# / 6000#)
 * Primary data: center-to-end or overall length for prefab.
 */

interface SWFittingRaw {
  type: 'Elbow 90°' | 'Elbow 45°' | 'Tee' | 'Coupling' | 'Half Coupling' | 'Union';
  nps: string;
  class_rating: number;
  centerToEnd?: number; // mm — for elbows/tees
  length?: number;      // mm — for couplings/unions
}

const RAW: SWFittingRaw[] = [
  // ─── 3000# Elbows 90° ───
  { type: 'Elbow 90°', nps: '1/4"',   class_rating: 3000, centerToEnd: 16 },
  { type: 'Elbow 90°', nps: '3/8"',   class_rating: 3000, centerToEnd: 19 },
  { type: 'Elbow 90°', nps: '1/2"',   class_rating: 3000, centerToEnd: 22 },
  { type: 'Elbow 90°', nps: '3/4"',   class_rating: 3000, centerToEnd: 25 },
  { type: 'Elbow 90°', nps: '1"',     class_rating: 3000, centerToEnd: 32 },
  { type: 'Elbow 90°', nps: '1-1/4"', class_rating: 3000, centerToEnd: 35 },
  { type: 'Elbow 90°', nps: '1-1/2"', class_rating: 3000, centerToEnd: 38 },
  { type: 'Elbow 90°', nps: '2"',     class_rating: 3000, centerToEnd: 48 },

  // ─── 3000# Elbows 45° ───
  { type: 'Elbow 45°', nps: '1/4"',   class_rating: 3000, centerToEnd: 13 },
  { type: 'Elbow 45°', nps: '3/8"',   class_rating: 3000, centerToEnd: 14 },
  { type: 'Elbow 45°', nps: '1/2"',   class_rating: 3000, centerToEnd: 16 },
  { type: 'Elbow 45°', nps: '3/4"',   class_rating: 3000, centerToEnd: 19 },
  { type: 'Elbow 45°', nps: '1"',     class_rating: 3000, centerToEnd: 22 },
  { type: 'Elbow 45°', nps: '1-1/4"', class_rating: 3000, centerToEnd: 25 },
  { type: 'Elbow 45°', nps: '1-1/2"', class_rating: 3000, centerToEnd: 27 },
  { type: 'Elbow 45°', nps: '2"',     class_rating: 3000, centerToEnd: 35 },

  // ─── 3000# Tees ───
  { type: 'Tee', nps: '1/4"',   class_rating: 3000, centerToEnd: 16 },
  { type: 'Tee', nps: '3/8"',   class_rating: 3000, centerToEnd: 19 },
  { type: 'Tee', nps: '1/2"',   class_rating: 3000, centerToEnd: 22 },
  { type: 'Tee', nps: '3/4"',   class_rating: 3000, centerToEnd: 25 },
  { type: 'Tee', nps: '1"',     class_rating: 3000, centerToEnd: 32 },
  { type: 'Tee', nps: '1-1/4"', class_rating: 3000, centerToEnd: 35 },
  { type: 'Tee', nps: '1-1/2"', class_rating: 3000, centerToEnd: 38 },
  { type: 'Tee', nps: '2"',     class_rating: 3000, centerToEnd: 48 },

  // ─── 3000# Couplings ───
  { type: 'Coupling', nps: '1/4"',   class_rating: 3000, length: 25 },
  { type: 'Coupling', nps: '3/8"',   class_rating: 3000, length: 29 },
  { type: 'Coupling', nps: '1/2"',   class_rating: 3000, length: 32 },
  { type: 'Coupling', nps: '3/4"',   class_rating: 3000, length: 38 },
  { type: 'Coupling', nps: '1"',     class_rating: 3000, length: 44 },
  { type: 'Coupling', nps: '1-1/4"', class_rating: 3000, length: 51 },
  { type: 'Coupling', nps: '1-1/2"', class_rating: 3000, length: 54 },
  { type: 'Coupling', nps: '2"',     class_rating: 3000, length: 64 },

  // ─── 3000# Half Couplings ───
  { type: 'Half Coupling', nps: '1/2"',   class_rating: 3000, length: 22 },
  { type: 'Half Coupling', nps: '3/4"',   class_rating: 3000, length: 25 },
  { type: 'Half Coupling', nps: '1"',     class_rating: 3000, length: 29 },
  { type: 'Half Coupling', nps: '1-1/2"', class_rating: 3000, length: 35 },
  { type: 'Half Coupling', nps: '2"',     class_rating: 3000, length: 41 },
];

export const SW_FITTING_ENTRIES: FittingEntry[] = RAW.map((f) => ({
  category: 'fitting-sw',
  standard: 'ASME B16.11',
  nps: f.nps,
  type: f.type,
  class_rating: f.class_rating,
  dimensions: [
    ...(f.centerToEnd ? [{ key: 'center_to_end', value_mm: f.centerToEnd, isPrimaryAdvance: true }] : []),
    ...(f.length ? [{ key: 'overall_length', value_mm: f.length, isPrimaryAdvance: true }] : []),
  ],
}));

export const SW_FITTING_TYPES = ['Elbow 90°', 'Elbow 45°', 'Tee', 'Coupling', 'Half Coupling', 'Union'] as const;
