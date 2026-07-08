import type { FittingEntry } from './types';

/**
 * ASME B16.9 — Stub End Dimensions (Lap Joint)
 * Type A (long pattern) and Type B (short pattern).
 * Primary advance: barrel_length — the dimension added to the prefab assembly.
 */

interface StubEndRaw {
  nps: string;
  od: number;
  barrelLength: number; // mm — length of the barrel (stub)
  lapOD: number;        // mm — outer diameter of the lap
  lapThickness: number; // mm
}

const RAW: StubEndRaw[] = [
  { nps: '1/2"',   od: 21.3,  barrelLength: 19,  lapOD: 49.3,  lapThickness: 6.4 },
  { nps: '3/4"',   od: 26.7,  barrelLength: 22,  lapOD: 58.7,  lapThickness: 6.4 },
  { nps: '1"',     od: 33.4,  barrelLength: 25,  lapOD: 68.3,  lapThickness: 6.4 },
  { nps: '1-1/4"', od: 42.2,  barrelLength: 25,  lapOD: 79.2,  lapThickness: 7.9 },
  { nps: '1-1/2"', od: 48.3,  barrelLength: 25,  lapOD: 88.9,  lapThickness: 7.9 },
  { nps: '2"',     od: 60.3,  barrelLength: 30,  lapOD: 104.6, lapThickness: 7.9 },
  { nps: '2-1/2"', od: 73.0,  barrelLength: 32,  lapOD: 124.0, lapThickness: 9.5 },
  { nps: '3"',     od: 88.9,  barrelLength: 35,  lapOD: 133.4, lapThickness: 9.5 },
  { nps: '4"',     od: 114.3, barrelLength: 38,  lapOD: 171.4, lapThickness: 11.1 },
  { nps: '6"',     od: 168.3, barrelLength: 44,  lapOD: 222.3, lapThickness: 12.7 },
  { nps: '8"',     od: 219.1, barrelLength: 51,  lapOD: 276.2, lapThickness: 14.3 },
  { nps: '10"',    od: 273.1, barrelLength: 57,  lapOD: 339.7, lapThickness: 15.9 },
  { nps: '12"',    od: 323.9, barrelLength: 64,  lapOD: 406.4, lapThickness: 17.5 },
  { nps: '14"',    od: 355.6, barrelLength: 70,  lapOD: 450.8, lapThickness: 19.1 },
  { nps: '16"',    od: 406.4, barrelLength: 76,  lapOD: 511.2, lapThickness: 20.6 },
  { nps: '18"',    od: 457.2, barrelLength: 83,  lapOD: 549.3, lapThickness: 22.2 },
  { nps: '20"',    od: 508.0, barrelLength: 89,  lapOD: 609.6, lapThickness: 23.8 },
  { nps: '24"',    od: 609.6, barrelLength: 102, lapOD: 723.9, lapThickness: 27.0 },
];

export const STUB_END_ENTRIES: FittingEntry[] = RAW.map((s) => ({
  category: 'stub-end',
  standard: 'ASME B16.9',
  nps: s.nps,
  dimensions: [
    { key: 'od', value_mm: s.od },
    { key: 'barrel_length', value_mm: s.barrelLength, isPrimaryAdvance: true },
    { key: 'lap_od', value_mm: s.lapOD },
    { key: 'lap_thickness', value_mm: s.lapThickness },
  ],
}));

export const STUB_END_COLUMNS = [
  { key: 'nps', labelKey: 'NPS', align: 'left' as const },
  { key: 'od', labelKey: 'OD', align: 'right' as const },
  { key: 'barrel_length', labelKey: 'Barrel L', align: 'right' as const, isPrimary: true },
  { key: 'lap_od', labelKey: 'Lap OD', align: 'right' as const },
  { key: 'lap_thickness', labelKey: 'Lap T', align: 'right' as const },
];
