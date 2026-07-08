import type { FittingEntry } from './types';

/**
 * ASME B16.5 Table E-1 — Stud Bolts for Flanged Joints
 * Dimensions: stud diameter, length, quantity per flange.
 * Primary data: quantity + length (determines BOM and cut list).
 */

interface StudBoltRaw {
  nps: string;
  class_rating: number;
  studDia: number;     // mm (nominal bolt diameter)
  studLength: number;  // mm (overall stud length)
  quantity: number;
  torqueNm?: number;   // recommended torque in N·m
}

const RAW: StudBoltRaw[] = [
  // ─── Class 150 ───
  { nps: '1/2"',   class_rating: 150, studDia: 12.7, studLength: 82,  quantity: 4 },
  { nps: '3/4"',   class_rating: 150, studDia: 12.7, studLength: 89,  quantity: 4 },
  { nps: '1"',     class_rating: 150, studDia: 12.7, studLength: 89,  quantity: 4 },
  { nps: '1-1/4"', class_rating: 150, studDia: 12.7, studLength: 95,  quantity: 4 },
  { nps: '1-1/2"', class_rating: 150, studDia: 12.7, studLength: 102, quantity: 4 },
  { nps: '2"',     class_rating: 150, studDia: 15.9, studLength: 108, quantity: 4 },
  { nps: '2-1/2"', class_rating: 150, studDia: 15.9, studLength: 114, quantity: 4 },
  { nps: '3"',     class_rating: 150, studDia: 15.9, studLength: 114, quantity: 4 },
  { nps: '4"',     class_rating: 150, studDia: 15.9, studLength: 121, quantity: 8 },
  { nps: '6"',     class_rating: 150, studDia: 19.1, studLength: 133, quantity: 8 },
  { nps: '8"',     class_rating: 150, studDia: 19.1, studLength: 146, quantity: 8 },
  { nps: '10"',    class_rating: 150, studDia: 22.2, studLength: 159, quantity: 12 },
  { nps: '12"',    class_rating: 150, studDia: 22.2, studLength: 171, quantity: 12 },
  { nps: '14"',    class_rating: 150, studDia: 25.4, studLength: 184, quantity: 12 },
  { nps: '16"',    class_rating: 150, studDia: 25.4, studLength: 197, quantity: 16 },
  { nps: '18"',    class_rating: 150, studDia: 28.6, studLength: 210, quantity: 16 },
  { nps: '20"',    class_rating: 150, studDia: 28.6, studLength: 222, quantity: 20 },
  { nps: '24"',    class_rating: 150, studDia: 31.8, studLength: 248, quantity: 20 },

  // ─── Class 300 ───
  { nps: '1/2"',   class_rating: 300, studDia: 12.7, studLength: 95,  quantity: 4 },
  { nps: '3/4"',   class_rating: 300, studDia: 15.9, studLength: 108, quantity: 4 },
  { nps: '1"',     class_rating: 300, studDia: 15.9, studLength: 108, quantity: 4 },
  { nps: '1-1/2"', class_rating: 300, studDia: 19.1, studLength: 127, quantity: 4 },
  { nps: '2"',     class_rating: 300, studDia: 15.9, studLength: 121, quantity: 8 },
  { nps: '3"',     class_rating: 300, studDia: 19.1, studLength: 140, quantity: 8 },
  { nps: '4"',     class_rating: 300, studDia: 19.1, studLength: 152, quantity: 8 },
  { nps: '6"',     class_rating: 300, studDia: 19.1, studLength: 165, quantity: 12 },
  { nps: '8"',     class_rating: 300, studDia: 22.2, studLength: 184, quantity: 12 },
  { nps: '10"',    class_rating: 300, studDia: 25.4, studLength: 210, quantity: 16 },
  { nps: '12"',    class_rating: 300, studDia: 28.6, studLength: 235, quantity: 16 },
  { nps: '14"',    class_rating: 300, studDia: 28.6, studLength: 248, quantity: 20 },
  { nps: '16"',    class_rating: 300, studDia: 31.8, studLength: 267, quantity: 20 },
  { nps: '20"',    class_rating: 300, studDia: 31.8, studLength: 305, quantity: 24 },
  { nps: '24"',    class_rating: 300, studDia: 38.1, studLength: 356, quantity: 24 },
];

export const STUD_BOLT_ENTRIES: FittingEntry[] = RAW.map((s) => ({
  category: 'stud-bolt',
  standard: 'ASME B16.5',
  nps: s.nps,
  class_rating: s.class_rating,
  dimensions: [
    { key: 'stud_diameter', value_mm: s.studDia },
    { key: 'stud_length', value_mm: s.studLength, isPrimaryAdvance: true },
    { key: 'quantity', value_mm: s.quantity },
    ...(s.torqueNm ? [{ key: 'torque_nm', value_mm: s.torqueNm }] : []),
  ],
}));

export const STUD_BOLT_CLASSES = [150, 300] as const;

export const STUD_BOLT_COLUMNS = [
  { key: 'nps', labelKey: 'NPS', align: 'left' as const },
  { key: 'stud_diameter', labelKey: 'Stud \u00D8', align: 'right' as const },
  { key: 'stud_length', labelKey: 'tools.accessories.studLength', align: 'right' as const, isPrimary: true },
  { key: 'quantity', labelKey: 'Qty', align: 'right' as const, noUnit: true },
];
