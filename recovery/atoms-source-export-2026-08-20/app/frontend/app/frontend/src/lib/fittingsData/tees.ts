import type { FittingEntry } from './types';

/**
 * ASME B16.9 — Butt-Welding Tee Dimensions
 * Equal tees: Center-to-End C (run) and M (outlet) in mm.
 * Primary advances: both C and M — the pipefitter needs both for cut lengths.
 */

interface TeeRaw {
  nps: string;
  od: number;
  run: number;
  outlet: number;
}

const RAW: TeeRaw[] = [
  { nps: '1/2"',   od: 21.3,  run: 25,  outlet: 25 },
  { nps: '3/4"',   od: 26.7,  run: 29,  outlet: 29 },
  { nps: '1"',     od: 33.4,  run: 33,  outlet: 33 },
  { nps: '1-1/4"', od: 42.2,  run: 38,  outlet: 38 },
  { nps: '1-1/2"', od: 48.3,  run: 43,  outlet: 43 },
  { nps: '2"',     od: 60.3,  run: 51,  outlet: 51 },
  { nps: '2-1/2"', od: 73.0,  run: 57,  outlet: 57 },
  { nps: '3"',     od: 88.9,  run: 64,  outlet: 64 },
  { nps: '3-1/2"', od: 101.6, run: 73,  outlet: 73 },
  { nps: '4"',     od: 114.3, run: 79,  outlet: 79 },
  { nps: '5"',     od: 141.3, run: 95,  outlet: 95 },
  { nps: '6"',     od: 168.3, run: 114, outlet: 114 },
  { nps: '8"',     od: 219.1, run: 152, outlet: 152 },
  { nps: '10"',    od: 273.1, run: 190, outlet: 190 },
  { nps: '12"',    od: 323.9, run: 229, outlet: 229 },
  { nps: '14"',    od: 355.6, run: 254, outlet: 254 },
  { nps: '16"',    od: 406.4, run: 279, outlet: 279 },
  { nps: '18"',    od: 457.2, run: 305, outlet: 305 },
  { nps: '20"',    od: 508.0, run: 330, outlet: 330 },
  { nps: '24"',    od: 609.6, run: 381, outlet: 381 },
];

export const TEE_ENTRIES: FittingEntry[] = RAW.map((t) => ({
  category: 'tee-bw',
  standard: 'ASME B16.9',
  nps: t.nps,
  dimensions: [
    { key: 'od', value_mm: t.od },
    { key: 'center_to_end_C', value_mm: t.run, isPrimaryAdvance: true },
    { key: 'center_to_end_M', value_mm: t.outlet, isPrimaryAdvance: true },
  ],
}));

export const TEE_COLUMNS = [
  { key: 'nps', labelKey: 'NPS', align: 'left' as const },
  { key: 'od', labelKey: 'OD', align: 'right' as const },
  { key: 'center_to_end_C', labelKey: 'Run C', align: 'right' as const, isPrimary: true },
  { key: 'center_to_end_M', labelKey: 'Outlet M', align: 'right' as const, isPrimary: true },
];
