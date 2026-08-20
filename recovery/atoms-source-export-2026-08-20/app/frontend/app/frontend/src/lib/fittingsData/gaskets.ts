import type { FittingEntry } from './types';

/**
 * ASME B16.20 — Spiral Wound Gasket Dimensions
 * ASME B16.21 — Non-metallic Flat Gaskets (referenced)
 * Primary data: ID, OD for the gasket ring.
 */

interface GasketRaw {
  nps: string;
  class_rating: number;
  type: 'SWG' | 'RJ' | 'FF';
  gasketID: number;  // mm
  gasketOD: number;  // mm
  thickness: number; // mm
}

const RAW: GasketRaw[] = [
  // ─── Spiral Wound Gaskets (SWG) Class 150 RF ───
  { nps: '1/2"',   class_rating: 150, type: 'SWG', gasketID: 22.4, gasketOD: 47.8, thickness: 4.5 },
  { nps: '3/4"',   class_rating: 150, type: 'SWG', gasketID: 27.7, gasketOD: 57.2, thickness: 4.5 },
  { nps: '1"',     class_rating: 150, type: 'SWG', gasketID: 34.1, gasketOD: 66.5, thickness: 4.5 },
  { nps: '1-1/4"', class_rating: 150, type: 'SWG', gasketID: 43.2, gasketOD: 73.2, thickness: 4.5 },
  { nps: '1-1/2"', class_rating: 150, type: 'SWG', gasketID: 49.3, gasketOD: 82.6, thickness: 4.5 },
  { nps: '2"',     class_rating: 150, type: 'SWG', gasketID: 62.0, gasketOD: 104.6,thickness: 4.5 },
  { nps: '2-1/2"', class_rating: 150, type: 'SWG', gasketID: 74.7, gasketOD: 124.0,thickness: 4.5 },
  { nps: '3"',     class_rating: 150, type: 'SWG', gasketID: 90.7, gasketOD: 133.4,thickness: 4.5 },
  { nps: '4"',     class_rating: 150, type: 'SWG', gasketID: 116.1,gasketOD: 171.4,thickness: 4.5 },
  { nps: '6"',     class_rating: 150, type: 'SWG', gasketID: 170.7,gasketOD: 222.3,thickness: 4.5 },
  { nps: '8"',     class_rating: 150, type: 'SWG', gasketID: 221.5,gasketOD: 276.2,thickness: 4.5 },
  { nps: '10"',    class_rating: 150, type: 'SWG', gasketID: 276.2,gasketOD: 339.7,thickness: 4.5 },
  { nps: '12"',    class_rating: 150, type: 'SWG', gasketID: 327.0,gasketOD: 406.4,thickness: 4.5 },
  { nps: '14"',    class_rating: 150, type: 'SWG', gasketID: 358.8,gasketOD: 450.8,thickness: 4.5 },
  { nps: '16"',    class_rating: 150, type: 'SWG', gasketID: 409.6,gasketOD: 511.2,thickness: 4.5 },
  { nps: '18"',    class_rating: 150, type: 'SWG', gasketID: 460.4,gasketOD: 549.3,thickness: 4.5 },
  { nps: '20"',    class_rating: 150, type: 'SWG', gasketID: 511.2,gasketOD: 609.6,thickness: 4.5 },
  { nps: '24"',    class_rating: 150, type: 'SWG', gasketID: 612.6,gasketOD: 723.9,thickness: 4.5 },

  // ─── SWG Class 300 RF ───
  { nps: '1/2"',   class_rating: 300, type: 'SWG', gasketID: 22.4, gasketOD: 54.1, thickness: 4.5 },
  { nps: '1"',     class_rating: 300, type: 'SWG', gasketID: 34.1, gasketOD: 73.2, thickness: 4.5 },
  { nps: '2"',     class_rating: 300, type: 'SWG', gasketID: 62.0, gasketOD: 111.3,thickness: 4.5 },
  { nps: '3"',     class_rating: 300, type: 'SWG', gasketID: 90.7, gasketOD: 149.4,thickness: 4.5 },
  { nps: '4"',     class_rating: 300, type: 'SWG', gasketID: 116.1,gasketOD: 181.1,thickness: 4.5 },
  { nps: '6"',     class_rating: 300, type: 'SWG', gasketID: 170.7,gasketOD: 247.7,thickness: 4.5 },
  { nps: '8"',     class_rating: 300, type: 'SWG', gasketID: 221.5,gasketOD: 307.9,thickness: 4.5 },
  { nps: '10"',    class_rating: 300, type: 'SWG', gasketID: 276.2,gasketOD: 365.3,thickness: 4.5 },
  { nps: '12"',    class_rating: 300, type: 'SWG', gasketID: 327.0,gasketOD: 425.5,thickness: 4.5 },
  { nps: '16"',    class_rating: 300, type: 'SWG', gasketID: 409.6,gasketOD: 539.8,thickness: 4.5 },
  { nps: '20"',    class_rating: 300, type: 'SWG', gasketID: 511.2,gasketOD: 666.8,thickness: 4.5 },
  { nps: '24"',    class_rating: 300, type: 'SWG', gasketID: 612.6,gasketOD: 781.1,thickness: 4.5 },
];

export const GASKET_ENTRIES: FittingEntry[] = RAW.map((g) => ({
  category: 'gasket',
  standard: g.type === 'SWG' ? 'ASME B16.20' : 'ASME B16.21',
  nps: g.nps,
  type: g.type,
  class_rating: g.class_rating,
  dimensions: [
    { key: 'gasket_id', value_mm: g.gasketID },
    { key: 'gasket_od', value_mm: g.gasketOD, isPrimaryAdvance: true },
    { key: 'thickness', value_mm: g.thickness },
  ],
}));

export const GASKET_TYPES = ['SWG'] as const;
export const GASKET_CLASSES = [150, 300] as const;

export const GASKET_COLUMNS = [
  { key: 'nps', labelKey: 'NPS', align: 'left' as const },
  { key: 'gasket_id', labelKey: 'ID', align: 'right' as const },
  { key: 'gasket_od', labelKey: 'OD', align: 'right' as const, isPrimary: true },
  { key: 'thickness', labelKey: 'T', align: 'right' as const },
];
