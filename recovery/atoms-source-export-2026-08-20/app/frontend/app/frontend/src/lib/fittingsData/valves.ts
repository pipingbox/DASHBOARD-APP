import type { FittingEntry } from './types';

/**
 * ASME B16.10 — Valve Face-to-Face Dimensions
 * All values in mm.
 * Primary advance: face-to-face — the dimension that determines pipe spacing.
 */

interface ValveRaw {
  nps: string;
  gate150: number;
  gate300: number;
  gate600: number;
  globe150: number;
  globe300: number;
  check150: number;
  check300: number;
}

const RAW: ValveRaw[] = [
  { nps: '2"',   gate150: 178, gate300: 216, gate600: 292, globe150: 216, globe300: 292, check150: 203, check300: 267 },
  { nps: '3"',   gate150: 203, gate300: 283, gate600: 356, globe150: 241, globe300: 318, check150: 241, check300: 305 },
  { nps: '4"',   gate150: 229, gate300: 305, gate600: 432, globe150: 292, globe300: 356, check150: 292, check300: 356 },
  { nps: '6"',   gate150: 267, gate300: 403, gate600: 559, globe150: 356, globe300: 445, check150: 330, check300: 406 },
  { nps: '8"',   gate150: 292, gate300: 419, gate600: 660, globe150: 495, globe300: 559, check150: 356, check300: 502 },
  { nps: '10"',  gate150: 330, gate300: 457, gate600: 787, globe150: 622, globe300: 673, check150: 406, check300: 559 },
  { nps: '12"',  gate150: 356, gate300: 502, gate600: 838, globe150: 699, globe300: 762, check150: 457, check300: 610 },
  { nps: '14"',  gate150: 381, gate300: 572, gate600: 889, globe150: 787, globe300: 826, check150: 489, check300: 641 },
  { nps: '16"',  gate150: 406, gate300: 610, gate600: 991, globe150: 864, globe300: 914, check150: 521, check300: 673 },
  { nps: '18"',  gate150: 432, gate300: 660, gate600: 1092, globe150: 978, globe300: 978, check150: 559, check300: 737 },
  { nps: '20"',  gate150: 457, gate300: 711, gate600: 1194, globe150: 1054, globe300: 1054, check150: 597, check300: 787 },
  { nps: '24"',  gate150: 508, gate300: 813, gate600: 1397, globe150: 1219, globe300: 1219, check150: 635, check300: 914 },
];

function valveEntries(raw: ValveRaw, type: string, cl: number, ftf: number): FittingEntry {
  return {
    category: 'valve',
    standard: 'ASME B16.10',
    nps: raw.nps,
    type,
    class_rating: cl,
    dimensions: [
      { key: 'face_to_face', value_mm: ftf, isPrimaryAdvance: true },
    ],
  };
}

export const VALVE_ENTRIES: FittingEntry[] = RAW.flatMap((v) => [
  valveEntries(v, 'Gate', 150, v.gate150),
  valveEntries(v, 'Gate', 300, v.gate300),
  valveEntries(v, 'Gate', 600, v.gate600),
  valveEntries(v, 'Globe', 150, v.globe150),
  valveEntries(v, 'Globe', 300, v.globe300),
  valveEntries(v, 'Check', 150, v.check150),
  valveEntries(v, 'Check', 300, v.check300),
]);

export const VALVE_TYPES = ['Gate', 'Globe', 'Check'] as const;
export const VALVE_CLASSES = [150, 300, 600] as const;

export const VALVE_RAW = RAW;
