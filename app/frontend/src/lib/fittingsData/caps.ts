import type { FittingEntry } from './types';

/**
 * ASME B16.9 — Butt-Welding Cap Dimensions
 * Overall length E in mm.
 * Primary advance: E — how much the cap adds to the prefab assembly.
 */

interface CapRaw {
  nps: string;
  od: number;
  lengthE: number;
}

const RAW: CapRaw[] = [
  { nps: '1/2"',   od: 21.3,  lengthE: 25 },
  { nps: '3/4"',   od: 26.7,  lengthE: 25 },
  { nps: '1"',     od: 33.4,  lengthE: 25 },
  { nps: '1-1/4"', od: 42.2,  lengthE: 38 },
  { nps: '1-1/2"', od: 48.3,  lengthE: 38 },
  { nps: '2"',     od: 60.3,  lengthE: 38 },
  { nps: '2-1/2"', od: 73.0,  lengthE: 44 },
  { nps: '3"',     od: 88.9,  lengthE: 51 },
  { nps: '3-1/2"', od: 101.6, lengthE: 57 },
  { nps: '4"',     od: 114.3, lengthE: 64 },
  { nps: '5"',     od: 141.3, lengthE: 73 },
  { nps: '6"',     od: 168.3, lengthE: 83 },
  { nps: '8"',     od: 219.1, lengthE: 102 },
  { nps: '10"',    od: 273.1, lengthE: 127 },
  { nps: '12"',    od: 323.9, lengthE: 152 },
  { nps: '14"',    od: 355.6, lengthE: 165 },
  { nps: '16"',    od: 406.4, lengthE: 178 },
  { nps: '18"',    od: 457.2, lengthE: 191 },
  { nps: '20"',    od: 508.0, lengthE: 203 },
  { nps: '24"',    od: 609.6, lengthE: 229 },
];

export const CAP_ENTRIES: FittingEntry[] = RAW.map((c) => ({
  category: 'cap-bw',
  standard: 'ASME B16.9',
  nps: c.nps,
  dimensions: [
    { key: 'od', value_mm: c.od },
    { key: 'overall_length_E', value_mm: c.lengthE, isPrimaryAdvance: true },
  ],
}));

export const CAP_COLUMNS = [
  { key: 'nps', labelKey: 'NPS', align: 'left' as const },
  { key: 'od', labelKey: 'OD', align: 'right' as const },
  { key: 'overall_length_E', labelKey: 'tools.accessories.lengthE', align: 'right' as const, isPrimary: true },
];
