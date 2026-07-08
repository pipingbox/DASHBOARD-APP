import type { FittingEntry } from './types';

/**
 * ASME B16.5 — Flange Dimensions (WN, SO, Blind)
 * All values in mm. Primary advance for WN: hub_length (weld end to flange face).
 * Class 150 & 300 — most common in prefabrication.
 */

interface FlangeRaw {
  nps: string;
  type: 'WN' | 'SO' | 'Blind';
  class_rating: number;
  flangeOD: number;
  thickness: number;
  raisedFace: number;
  boltCircle: number;
  boltHolesQty: number;
  boltHoleDia: number;
  hubLength?: number;
  bore?: number;
}

const RAW: FlangeRaw[] = [
  // ─── Class 150 WN ───
  { nps: '1/2"',   type: 'WN', class_rating: 150, flangeOD: 89,   thickness: 11.2, raisedFace: 1.6, boltCircle: 60.3, boltHolesQty: 4, boltHoleDia: 15.8, hubLength: 22, bore: 21.3 },
  { nps: '3/4"',   type: 'WN', class_rating: 150, flangeOD: 98.4, thickness: 12.7, raisedFace: 1.6, boltCircle: 69.8, boltHolesQty: 4, boltHoleDia: 15.8, hubLength: 25, bore: 26.7 },
  { nps: '1"',     type: 'WN', class_rating: 150, flangeOD: 108,  thickness: 14.3, raisedFace: 1.6, boltCircle: 79.4, boltHolesQty: 4, boltHoleDia: 15.8, hubLength: 27, bore: 33.4 },
  { nps: '1-1/4"', type: 'WN', class_rating: 150, flangeOD: 117.5,thickness: 15.9, raisedFace: 1.6, boltCircle: 88.9, boltHolesQty: 4, boltHoleDia: 15.8, hubLength: 29, bore: 42.2 },
  { nps: '1-1/2"', type: 'WN', class_rating: 150, flangeOD: 127,  thickness: 17.5, raisedFace: 1.6, boltCircle: 98.4, boltHolesQty: 4, boltHoleDia: 15.8, hubLength: 30, bore: 48.3 },
  { nps: '2"',     type: 'WN', class_rating: 150, flangeOD: 152.4,thickness: 19.1, raisedFace: 1.6, boltCircle: 120.6,boltHolesQty: 4, boltHoleDia: 19,   hubLength: 33, bore: 60.3 },
  { nps: '2-1/2"', type: 'WN', class_rating: 150, flangeOD: 177.8,thickness: 22.2, raisedFace: 1.6, boltCircle: 139.7,boltHolesQty: 4, boltHoleDia: 19,   hubLength: 38, bore: 73 },
  { nps: '3"',     type: 'WN', class_rating: 150, flangeOD: 190.5,thickness: 23.8, raisedFace: 1.6, boltCircle: 152.4,boltHolesQty: 4, boltHoleDia: 19,   hubLength: 41, bore: 88.9 },
  { nps: '4"',     type: 'WN', class_rating: 150, flangeOD: 228.6,thickness: 23.8, raisedFace: 1.6, boltCircle: 190.5,boltHolesQty: 8, boltHoleDia: 19,   hubLength: 44, bore: 114.3 },
  { nps: '6"',     type: 'WN', class_rating: 150, flangeOD: 279.4,thickness: 25.4, raisedFace: 1.6, boltCircle: 241.3,boltHolesQty: 8, boltHoleDia: 22.2, hubLength: 51, bore: 168.3 },
  { nps: '8"',     type: 'WN', class_rating: 150, flangeOD: 342.9,thickness: 28.6, raisedFace: 1.6, boltCircle: 298.4,boltHolesQty: 8, boltHoleDia: 22.2, hubLength: 57, bore: 219.1 },
  { nps: '10"',    type: 'WN', class_rating: 150, flangeOD: 406.4,thickness: 30.2, raisedFace: 1.6, boltCircle: 362,  boltHolesQty: 12,boltHoleDia: 25.4, hubLength: 64, bore: 273.1 },
  { nps: '12"',    type: 'WN', class_rating: 150, flangeOD: 482.6,thickness: 31.8, raisedFace: 1.6, boltCircle: 431.8,boltHolesQty: 12,boltHoleDia: 25.4, hubLength: 70, bore: 323.9 },
  { nps: '14"',    type: 'WN', class_rating: 150, flangeOD: 533.4,thickness: 34.9, raisedFace: 1.6, boltCircle: 476.2,boltHolesQty: 12,boltHoleDia: 28.6, hubLength: 76, bore: 355.6 },
  { nps: '16"',    type: 'WN', class_rating: 150, flangeOD: 596.9,thickness: 36.5, raisedFace: 1.6, boltCircle: 539.8,boltHolesQty: 16,boltHoleDia: 28.6, hubLength: 83, bore: 406.4 },
  { nps: '18"',    type: 'WN', class_rating: 150, flangeOD: 635,  thickness: 39.7, raisedFace: 1.6, boltCircle: 577.8,boltHolesQty: 16,boltHoleDia: 31.8, hubLength: 89, bore: 457.2 },
  { nps: '20"',    type: 'WN', class_rating: 150, flangeOD: 698.5,thickness: 42.9, raisedFace: 1.6, boltCircle: 635,  boltHolesQty: 20,boltHoleDia: 31.8, hubLength: 95, bore: 508 },
  { nps: '24"',    type: 'WN', class_rating: 150, flangeOD: 812.8,thickness: 47.6, raisedFace: 1.6, boltCircle: 749.3,boltHolesQty: 20,boltHoleDia: 34.9, hubLength: 102, bore: 609.6 },

  // ─── Class 300 WN ───
  { nps: '1/2"',   type: 'WN', class_rating: 300, flangeOD: 95.2, thickness: 14.3, raisedFace: 1.6, boltCircle: 66.7, boltHolesQty: 4, boltHoleDia: 15.8, hubLength: 25, bore: 21.3 },
  { nps: '3/4"',   type: 'WN', class_rating: 300, flangeOD: 117.5,thickness: 15.9, raisedFace: 1.6, boltCircle: 82.5, boltHolesQty: 4, boltHoleDia: 19,   hubLength: 27, bore: 26.7 },
  { nps: '1"',     type: 'WN', class_rating: 300, flangeOD: 123.8,thickness: 17.5, raisedFace: 1.6, boltCircle: 88.9, boltHolesQty: 4, boltHoleDia: 19,   hubLength: 29, bore: 33.4 },
  { nps: '1-1/2"', type: 'WN', class_rating: 300, flangeOD: 155.6,thickness: 20.6, raisedFace: 1.6, boltCircle: 114.3,boltHolesQty: 4, boltHoleDia: 22.2, hubLength: 33, bore: 48.3 },
  { nps: '2"',     type: 'WN', class_rating: 300, flangeOD: 165.1,thickness: 22.2, raisedFace: 1.6, boltCircle: 127,  boltHolesQty: 8, boltHoleDia: 19,   hubLength: 38, bore: 60.3 },
  { nps: '3"',     type: 'WN', class_rating: 300, flangeOD: 210,  thickness: 28.6, raisedFace: 1.6, boltCircle: 168.3,boltHolesQty: 8, boltHoleDia: 22.2, hubLength: 46, bore: 88.9 },
  { nps: '4"',     type: 'WN', class_rating: 300, flangeOD: 254,  thickness: 31.8, raisedFace: 1.6, boltCircle: 200,  boltHolesQty: 8, boltHoleDia: 22.2, hubLength: 52, bore: 114.3 },
  { nps: '6"',     type: 'WN', class_rating: 300, flangeOD: 317.5,thickness: 36.5, raisedFace: 1.6, boltCircle: 269.9,boltHolesQty: 12,boltHoleDia: 22.2, hubLength: 57, bore: 168.3 },
  { nps: '8"',     type: 'WN', class_rating: 300, flangeOD: 381,  thickness: 41.3, raisedFace: 1.6, boltCircle: 330.2,boltHolesQty: 12,boltHoleDia: 25.4, hubLength: 64, bore: 219.1 },
  { nps: '10"',    type: 'WN', class_rating: 300, flangeOD: 444.5,thickness: 47.6, raisedFace: 1.6, boltCircle: 387.4,boltHolesQty: 16,boltHoleDia: 28.6, hubLength: 70, bore: 273.1 },
  { nps: '12"',    type: 'WN', class_rating: 300, flangeOD: 520.7,thickness: 50.8, raisedFace: 1.6, boltCircle: 450.8,boltHolesQty: 16,boltHoleDia: 31.8, hubLength: 76, bore: 323.9 },
  { nps: '14"',    type: 'WN', class_rating: 300, flangeOD: 584.2,thickness: 53.9, raisedFace: 1.6, boltCircle: 514.4,boltHolesQty: 20,boltHoleDia: 31.8, hubLength: 83, bore: 355.6 },
  { nps: '16"',    type: 'WN', class_rating: 300, flangeOD: 647.7,thickness: 57.2, raisedFace: 1.6, boltCircle: 571.5,boltHolesQty: 20,boltHoleDia: 34.9, hubLength: 89, bore: 406.4 },
  { nps: '20"',    type: 'WN', class_rating: 300, flangeOD: 774.7,thickness: 66.7, raisedFace: 1.6, boltCircle: 698.5,boltHolesQty: 24,boltHoleDia: 34.9, hubLength: 102, bore: 508 },
  { nps: '24"',    type: 'WN', class_rating: 300, flangeOD: 914.4,thickness: 76.2, raisedFace: 1.6, boltCircle: 812.8,boltHolesQty: 24,boltHoleDia: 41.3, hubLength: 117, bore: 609.6 },

  // ─── Class 150 SO ───
  { nps: '1/2"',   type: 'SO', class_rating: 150, flangeOD: 89,   thickness: 11.2, raisedFace: 1.6, boltCircle: 60.3, boltHolesQty: 4, boltHoleDia: 15.8 },
  { nps: '3/4"',   type: 'SO', class_rating: 150, flangeOD: 98.4, thickness: 12.7, raisedFace: 1.6, boltCircle: 69.8, boltHolesQty: 4, boltHoleDia: 15.8 },
  { nps: '1"',     type: 'SO', class_rating: 150, flangeOD: 108,  thickness: 14.3, raisedFace: 1.6, boltCircle: 79.4, boltHolesQty: 4, boltHoleDia: 15.8 },
  { nps: '2"',     type: 'SO', class_rating: 150, flangeOD: 152.4,thickness: 19.1, raisedFace: 1.6, boltCircle: 120.6,boltHolesQty: 4, boltHoleDia: 19 },
  { nps: '3"',     type: 'SO', class_rating: 150, flangeOD: 190.5,thickness: 23.8, raisedFace: 1.6, boltCircle: 152.4,boltHolesQty: 4, boltHoleDia: 19 },
  { nps: '4"',     type: 'SO', class_rating: 150, flangeOD: 228.6,thickness: 23.8, raisedFace: 1.6, boltCircle: 190.5,boltHolesQty: 8, boltHoleDia: 19 },
  { nps: '6"',     type: 'SO', class_rating: 150, flangeOD: 279.4,thickness: 25.4, raisedFace: 1.6, boltCircle: 241.3,boltHolesQty: 8, boltHoleDia: 22.2 },
  { nps: '8"',     type: 'SO', class_rating: 150, flangeOD: 342.9,thickness: 28.6, raisedFace: 1.6, boltCircle: 298.4,boltHolesQty: 8, boltHoleDia: 22.2 },
  { nps: '10"',    type: 'SO', class_rating: 150, flangeOD: 406.4,thickness: 30.2, raisedFace: 1.6, boltCircle: 362,  boltHolesQty: 12,boltHoleDia: 25.4 },
  { nps: '12"',    type: 'SO', class_rating: 150, flangeOD: 482.6,thickness: 31.8, raisedFace: 1.6, boltCircle: 431.8,boltHolesQty: 12,boltHoleDia: 25.4 },

  // ─── Class 150 Blind ───
  { nps: '1/2"',   type: 'Blind', class_rating: 150, flangeOD: 89,   thickness: 11.2, raisedFace: 1.6, boltCircle: 60.3, boltHolesQty: 4, boltHoleDia: 15.8 },
  { nps: '1"',     type: 'Blind', class_rating: 150, flangeOD: 108,  thickness: 14.3, raisedFace: 1.6, boltCircle: 79.4, boltHolesQty: 4, boltHoleDia: 15.8 },
  { nps: '2"',     type: 'Blind', class_rating: 150, flangeOD: 152.4,thickness: 19.1, raisedFace: 1.6, boltCircle: 120.6,boltHolesQty: 4, boltHoleDia: 19 },
  { nps: '3"',     type: 'Blind', class_rating: 150, flangeOD: 190.5,thickness: 23.8, raisedFace: 1.6, boltCircle: 152.4,boltHolesQty: 4, boltHoleDia: 19 },
  { nps: '4"',     type: 'Blind', class_rating: 150, flangeOD: 228.6,thickness: 23.8, raisedFace: 1.6, boltCircle: 190.5,boltHolesQty: 8, boltHoleDia: 19 },
  { nps: '6"',     type: 'Blind', class_rating: 150, flangeOD: 279.4,thickness: 25.4, raisedFace: 1.6, boltCircle: 241.3,boltHolesQty: 8, boltHoleDia: 22.2 },
  { nps: '8"',     type: 'Blind', class_rating: 150, flangeOD: 342.9,thickness: 28.6, raisedFace: 1.6, boltCircle: 298.4,boltHolesQty: 8, boltHoleDia: 22.2 },
  { nps: '10"',    type: 'Blind', class_rating: 150, flangeOD: 406.4,thickness: 30.2, raisedFace: 1.6, boltCircle: 362,  boltHolesQty: 12,boltHoleDia: 25.4 },
  { nps: '12"',    type: 'Blind', class_rating: 150, flangeOD: 482.6,thickness: 31.8, raisedFace: 1.6, boltCircle: 431.8,boltHolesQty: 12,boltHoleDia: 25.4 },
  { nps: '16"',    type: 'Blind', class_rating: 150, flangeOD: 596.9,thickness: 36.5, raisedFace: 1.6, boltCircle: 539.8,boltHolesQty: 16,boltHoleDia: 28.6 },
  { nps: '20"',    type: 'Blind', class_rating: 150, flangeOD: 698.5,thickness: 42.9, raisedFace: 1.6, boltCircle: 635,  boltHolesQty: 20,boltHoleDia: 31.8 },
  { nps: '24"',    type: 'Blind', class_rating: 150, flangeOD: 812.8,thickness: 47.6, raisedFace: 1.6, boltCircle: 749.3,boltHolesQty: 20,boltHoleDia: 34.9 },
];

export const FLANGE_ENTRIES: FittingEntry[] = RAW.map((f) => {
  const dims = [
    { key: 'flange_od', value_mm: f.flangeOD },
    { key: 'thickness', value_mm: f.thickness },
    { key: 'raised_face', value_mm: f.raisedFace },
    { key: 'bolt_circle_diameter', value_mm: f.boltCircle },
    { key: 'bolt_holes_qty', value_mm: f.boltHolesQty },
    { key: 'bolt_hole_diameter', value_mm: f.boltHoleDia },
  ];
  if (f.hubLength) {
    dims.push({ key: 'hub_length', value_mm: f.hubLength, isPrimaryAdvance: true });
  }
  if (f.bore) {
    dims.push({ key: 'bore', value_mm: f.bore });
  }
  return {
    category: 'flange' as const,
    standard: 'ASME B16.5',
    nps: f.nps,
    type: f.type,
    class_rating: f.class_rating,
    dimensions: dims,
  };
});

export const FLANGE_TYPES = ['WN', 'SO', 'Blind'] as const;
export const FLANGE_CLASSES = [150, 300] as const;

export const FLANGE_COLUMNS_WN = [
  { key: 'nps', labelKey: 'NPS', align: 'left' as const },
  { key: 'flange_od', labelKey: 'OD', align: 'right' as const },
  { key: 'hub_length', labelKey: 'Hub L', align: 'right' as const, isPrimary: true },
  { key: 'thickness', labelKey: 'T', align: 'right' as const },
  { key: 'raised_face', labelKey: 'RF', align: 'right' as const },
  { key: 'bolt_circle_diameter', labelKey: 'BCD', align: 'right' as const },
  { key: 'bolt_holes_qty', labelKey: 'Holes', align: 'right' as const, noUnit: true },
  { key: 'bolt_hole_diameter', labelKey: 'Hole \u00D8', align: 'right' as const },
  { key: 'bore', labelKey: 'Bore', align: 'right' as const },
];

export const FLANGE_COLUMNS_SO = [
  { key: 'nps', labelKey: 'NPS', align: 'left' as const },
  { key: 'flange_od', labelKey: 'OD', align: 'right' as const },
  { key: 'thickness', labelKey: 'T', align: 'right' as const },
  { key: 'raised_face', labelKey: 'RF', align: 'right' as const },
  { key: 'bolt_circle_diameter', labelKey: 'BCD', align: 'right' as const },
  { key: 'bolt_holes_qty', labelKey: 'Holes', align: 'right' as const, noUnit: true },
  { key: 'bolt_hole_diameter', labelKey: 'Hole \u00D8', align: 'right' as const },
];
