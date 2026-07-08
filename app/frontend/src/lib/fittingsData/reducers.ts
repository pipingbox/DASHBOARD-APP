import type { FittingEntry } from './types';

/**
 * ASME B16.9 — Butt-Welding Reducer Dimensions
 * Overall length H in mm.
 * Primary advance: H — determines the pipe cut length adjustment.
 */

interface ReducerRaw {
  largeNPS: string;
  smallNPS: string;
  length: number;
}

const RAW: ReducerRaw[] = [
  { largeNPS: '3/4"', smallNPS: '1/2"', length: 51 },
  { largeNPS: '1"', smallNPS: '1/2"', length: 51 },
  { largeNPS: '1"', smallNPS: '3/4"', length: 51 },
  { largeNPS: '1-1/4"', smallNPS: '1/2"', length: 51 },
  { largeNPS: '1-1/4"', smallNPS: '3/4"', length: 51 },
  { largeNPS: '1-1/4"', smallNPS: '1"', length: 51 },
  { largeNPS: '1-1/2"', smallNPS: '1/2"', length: 64 },
  { largeNPS: '1-1/2"', smallNPS: '3/4"', length: 64 },
  { largeNPS: '1-1/2"', smallNPS: '1"', length: 64 },
  { largeNPS: '1-1/2"', smallNPS: '1-1/4"', length: 64 },
  { largeNPS: '2"', smallNPS: '1/2"', length: 76 },
  { largeNPS: '2"', smallNPS: '3/4"', length: 76 },
  { largeNPS: '2"', smallNPS: '1"', length: 76 },
  { largeNPS: '2"', smallNPS: '1-1/4"', length: 76 },
  { largeNPS: '2"', smallNPS: '1-1/2"', length: 76 },
  { largeNPS: '3"', smallNPS: '1-1/2"', length: 89 },
  { largeNPS: '3"', smallNPS: '2"', length: 89 },
  { largeNPS: '3"', smallNPS: '2-1/2"', length: 89 },
  { largeNPS: '4"', smallNPS: '2"', length: 102 },
  { largeNPS: '4"', smallNPS: '2-1/2"', length: 102 },
  { largeNPS: '4"', smallNPS: '3"', length: 102 },
  { largeNPS: '6"', smallNPS: '3"', length: 140 },
  { largeNPS: '6"', smallNPS: '4"', length: 140 },
  { largeNPS: '6"', smallNPS: '5"', length: 140 },
  { largeNPS: '8"', smallNPS: '4"', length: 152 },
  { largeNPS: '8"', smallNPS: '5"', length: 152 },
  { largeNPS: '8"', smallNPS: '6"', length: 152 },
  { largeNPS: '10"', smallNPS: '6"', length: 178 },
  { largeNPS: '10"', smallNPS: '8"', length: 178 },
  { largeNPS: '12"', smallNPS: '8"', length: 203 },
  { largeNPS: '12"', smallNPS: '10"', length: 203 },
  { largeNPS: '14"', smallNPS: '10"', length: 330 },
  { largeNPS: '14"', smallNPS: '12"', length: 330 },
  { largeNPS: '16"', smallNPS: '12"', length: 356 },
  { largeNPS: '16"', smallNPS: '14"', length: 356 },
  { largeNPS: '18"', smallNPS: '14"', length: 381 },
  { largeNPS: '18"', smallNPS: '16"', length: 381 },
  { largeNPS: '20"', smallNPS: '16"', length: 508 },
  { largeNPS: '20"', smallNPS: '18"', length: 508 },
  { largeNPS: '24"', smallNPS: '18"', length: 508 },
  { largeNPS: '24"', smallNPS: '20"', length: 508 },
];

export const REDUCER_ENTRIES: FittingEntry[] = RAW.map((r) => ({
  category: 'reducer-bw',
  standard: 'ASME B16.9',
  nps: `${r.largeNPS} x ${r.smallNPS}`,
  dimensions: [
    { key: 'overall_length_H', value_mm: r.length, isPrimaryAdvance: true },
  ],
}));

export const REDUCER_COLUMNS = [
  { key: 'large_nps', labelKey: 'tools.accessories.largeNPS', align: 'left' as const },
  { key: 'small_nps', labelKey: 'tools.accessories.smallNPS', align: 'left' as const },
  { key: 'overall_length_H', labelKey: 'tools.accessories.lengthH', align: 'right' as const, isPrimary: true },
];

export const REDUCER_RAW = RAW;
