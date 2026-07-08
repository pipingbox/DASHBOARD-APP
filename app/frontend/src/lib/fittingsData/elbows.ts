import type { FittingEntry } from './types';

/**
 * ASME B16.9 — Butt-Welding Elbow Dimensions
 * Center-to-End measurements in mm.
 * Primary advance: 90° LR (A) — the most common advance in prefabrication.
 */

interface ElbowRaw {
  nps: string;
  od: number;
  lr90: number;
  sr90: number;
  lr45: number;
}

const RAW: ElbowRaw[] = [
  { nps: '1/2"',   od: 21.3,  lr90: 38,  sr90: 25,  lr45: 16 },
  { nps: '3/4"',   od: 26.7,  lr90: 38,  sr90: 25,  lr45: 19 },
  { nps: '1"',     od: 33.4,  lr90: 38,  sr90: 25,  lr45: 22 },
  { nps: '1-1/4"', od: 42.2,  lr90: 48,  sr90: 32,  lr45: 25 },
  { nps: '1-1/2"', od: 48.3,  lr90: 57,  sr90: 38,  lr45: 29 },
  { nps: '2"',     od: 60.3,  lr90: 76,  sr90: 51,  lr45: 35 },
  { nps: '2-1/2"', od: 73.0,  lr90: 95,  sr90: 64,  lr45: 44 },
  { nps: '3"',     od: 88.9,  lr90: 114, sr90: 76,  lr45: 51 },
  { nps: '3-1/2"', od: 101.6, lr90: 133, sr90: 89,  lr45: 57 },
  { nps: '4"',     od: 114.3, lr90: 152, sr90: 102, lr45: 64 },
  { nps: '5"',     od: 141.3, lr90: 190, sr90: 127, lr45: 79 },
  { nps: '6"',     od: 168.3, lr90: 229, sr90: 152, lr45: 95 },
  { nps: '8"',     od: 219.1, lr90: 305, sr90: 203, lr45: 127 },
  { nps: '10"',    od: 273.1, lr90: 381, sr90: 254, lr45: 159 },
  { nps: '12"',    od: 323.9, lr90: 457, sr90: 305, lr45: 190 },
  { nps: '14"',    od: 355.6, lr90: 533, sr90: 356, lr45: 222 },
  { nps: '16"',    od: 406.4, lr90: 610, sr90: 406, lr45: 254 },
  { nps: '18"',    od: 457.2, lr90: 686, sr90: 457, lr45: 286 },
  { nps: '20"',    od: 508.0, lr90: 762, sr90: 508, lr45: 318 },
  { nps: '24"',    od: 609.6, lr90: 914, sr90: 610, lr45: 381 },
];

export const ELBOW_ENTRIES: FittingEntry[] = RAW.map((e) => ({
  category: 'elbow-bw',
  standard: 'ASME B16.9',
  nps: e.nps,
  dimensions: [
    { key: 'od', value_mm: e.od },
    { key: 'center_to_end_A_lr90', value_mm: e.lr90, isPrimaryAdvance: true },
    { key: 'center_to_end_A_sr90', value_mm: e.sr90 },
    { key: 'center_to_end_B_lr45', value_mm: e.lr45 },
  ],
}));

export const ELBOW_COLUMNS = [
  { key: 'nps', labelKey: 'NPS', align: 'left' as const },
  { key: 'od', labelKey: 'OD', align: 'right' as const },
  { key: 'center_to_end_A_lr90', labelKey: '90° LR (A)', align: 'right' as const, isPrimary: true },
  { key: 'center_to_end_A_sr90', labelKey: '90° SR (A)', align: 'right' as const },
  { key: 'center_to_end_B_lr45', labelKey: '45° LR (B)', align: 'right' as const },
];
