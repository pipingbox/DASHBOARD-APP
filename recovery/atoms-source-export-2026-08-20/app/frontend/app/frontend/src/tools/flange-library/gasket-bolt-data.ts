/**
 * Gasket + Stud Bolt Data — Cross-link for Flange Library (Fase 3)
 *
 * Gaskets per ASME B16.20 (spiral wound) and ASME B16.21 (non-metallic).
 * Stud bolts per ASME B16.5 + torque guidelines per ASME PCC-1.
 *
 * When a user selects a flange, they see:
 *   Flange → Gasket (compatible) → Stud Bolts (qty + size + torque)
 *
 * Torque values are GUIDELINES for carbon steel flanges with spiral wound
 * gaskets, lubricated studs, at ambient temperature.
 * Always verify with the gasket manufacturer and your company procedure.
 */

export type GasketType = 'SW-CGI' | 'RTJ' | 'Flat' | 'Klingersil' | 'PTFE';
export type GasketMaterial = '316SS/Graphite' | '316SS/PTFE' | 'Soft Iron' | 'Klingersil C4400' | 'PTFE Envelope';

export interface GasketSpec {
  nps: string;
  pressureClass: string;
  type: GasketType;
  material: GasketMaterial;
  innerDiameter: number;  // mm
  outerDiameter: number;  // mm
  thickness: number;      // mm
  sealType: string;       // e.g., 'Inner ring + outer ring (CGI)'
}

export interface StudBoltSpec {
  nps: string;
  pressureClass: string;
  studDiameter: string;   // e.g., '5/8"'
  studDiameterMm: number; // mm
  quantity: number;
  studLength: number;     // mm (approximate)
  nutSize: string;        // e.g., '1-1/16"'
  torqueDry: number;      // Nm (dry, unlubricated — not recommended)
  torqueLubricated: number; // Nm (lubricated — standard practice)
  torqueMin: number;      // Nm (target minimum)
  torqueMax: number;      // Nm (target maximum)
}

// Gasket dimensions for RF flanges (spiral wound CGI) per ASME B16.20
// Format: [NPS, class150 OD, class150 ID, class300 OD, class300 ID, class600 OD, class600 ID, class900 OD, class900 ID, class1500 OD, class1500 ID]
const GASKET_RF_DATA: [string, number, number, number, number, number, number, number, number, number, number][] = [
  ['1/2"',   34.9, 22.4, 42.9, 22.4, 42.9, 22.4, 50.8, 22.4, 50.8, 22.4],
  ['3/4"',   42.9, 27.7, 50.8, 27.7, 50.8, 27.7, 63.5, 27.7, 63.5, 27.7],
  ['1"',     50.8, 33.4, 63.5, 33.4, 63.5, 33.4, 69.9, 33.4, 69.9, 33.4],
  ['1-1/4"', 63.5, 42.2, 73.0, 42.2, 73.0, 42.2, 79.4, 42.2, 79.4, 42.2],
  ['1-1/2"', 69.9, 48.3, 79.4, 48.3, 79.4, 48.3, 88.9, 48.3, 88.9, 48.3],
  ['2"',     88.9, 60.3, 98.6, 60.3, 98.6, 60.3, 120.7, 60.3, 120.7, 60.3],
  ['2-1/2"', 108.0, 73.0, 120.7, 73.0, 120.7, 73.0, 139.7, 73.0, 139.7, 73.0],
  ['3"',     120.7, 88.9, 136.5, 88.9, 136.5, 88.9, 152.4, 88.9, 152.4, 88.9],
  ['4"',     157.2, 114.3, 174.6, 114.3, 174.6, 114.3, 200.2, 114.3, 200.2, 114.3],
  ['6"',     215.9, 168.3, 231.8, 168.3, 247.7, 168.3, 269.9, 168.3, 285.8, 168.3],
  ['8"',     269.9, 219.1, 292.1, 219.1, 317.5, 219.1, 342.9, 219.1, 365.1, 219.1],
  ['10"',    323.9, 273.1, 349.3, 273.1, 381.0, 273.1, 415.9, 273.1, 438.2, 273.1],
  ['12"',    381.0, 323.9, 412.8, 323.9, 444.5, 323.9, 489.0, 323.9, 520.7, 323.9],
  ['14"',    412.8, 355.6, 447.7, 355.6, 482.6, 355.6, 527.1, 355.6, 584.2, 355.6],
  ['16"',    469.9, 406.4, 508.0, 406.4, 546.1, 406.4, 603.3, 406.4, 647.7, 406.4],
  ['18"',    533.4, 457.2, 565.2, 457.2, 609.6, 457.2, 654.1, 457.2, 717.6, 457.2],
  ['20"',    584.2, 508.0, 622.3, 508.0, 679.5, 508.0, 723.9, 508.0, 787.4, 508.0],
  ['24"',    692.2, 609.6, 749.3, 609.6, 812.8, 609.6, 876.3, 609.6, 971.6, 609.6],
];

const CLASS_INDEX: Record<string, number> = {
  '150#': 0,
  '300#': 1,
  '600#': 2,
  '900#': 3,
  '1500#': 4,
};

export function getGasketForFlange(nps: string, pressureClass: string): GasketSpec | null {
  const row = GASKET_RF_DATA.find((r) => r[0] === nps);
  if (!row) return null;
  const idx = CLASS_INDEX[pressureClass];
  if (idx === undefined) return null;

  const odOffset = 1 + idx * 2;
  const idOffset = 2 + idx * 2;

  // For 900# and 1500#, use RTJ gasket instead of spiral wound
  if (pressureClass === '900#' || pressureClass === '1500#') {
    return {
      nps,
      pressureClass,
      type: 'RTJ',
      material: 'Soft Iron',
      innerDiameter: row[idOffset],
      outerDiameter: row[odOffset],
      thickness: 7.0, // RTJ ring joint
      sealType: 'Ring Type Joint (R-series)',
    };
  }

  return {
    nps,
    pressureClass,
    type: 'SW-CGI',
    material: '316SS/Graphite',
    innerDiameter: row[idOffset],
    outerDiameter: row[odOffset],
    thickness: 3.0, // Spiral wound with inner ring
    sealType: 'Spiral Wound CGI (inner + outer ring)',
  };
}

// Stud bolt torque per ASME PCC-1 guidelines (lubricated, ambient temp, carbon steel)
// Format: [boltSize, studDiaMm, torqueMin, torqueTarget, torqueMax]
const TORQUE_TABLE: [string, number, number, number, number][] = [
  ['1/2"',    12.7,  25,  35,  45],
  ['5/8"',    15.9,  45,  60,  75],
  ['3/4"',    19.1,  80,  105, 130],
  ['7/8"',    22.2,  130, 165, 200],
  ['1"',      25.4,  200, 250, 300],
  ['1-1/8"',  28.6,  290, 360, 430],
  ['1-1/4"',  31.8,  410, 510, 610],
  ['1-3/8"',  34.9,  550, 690, 830],
  ['1-1/2"',  38.1,  720, 900, 1080],
  ['1-5/8"',  41.3,  930, 1160, 1390],
  ['1-3/4"',  44.5,  1180, 1470, 1760],
  ['1-7/8"',  47.6,  1470, 1840, 2210],
  ['2"',      50.8,  1810, 2260, 2710],
  ['2-1/4"',  57.2,  2600, 3250, 3900],
  ['2-1/2"',  63.5,  3560, 4450, 5340],
  ['2-3/4"',  69.9,  4730, 5910, 7090],
  ['3-1/8"',  79.4,  6970, 8710, 10450],
];

const NUT_SIZE: Record<string, string> = {
  '1/2"': '7/8"',
  '5/8"': '1-1/16"',
  '3/4"': '1-1/4"',
  '7/8"': '1-7/16"',
  '1"': '1-5/8"',
  '1-1/8"': '1-13/16"',
  '1-1/4"': '2"',
  '1-3/8"': '2-3/16"',
  '1-1/2"': '2-3/8"',
  '1-5/8"': '2-9/16"',
  '1-3/4"': '2-3/4"',
  '1-7/8"': '2-15/16"',
  '2"': '3-1/8"',
  '2-1/4"': '3-1/2"',
  '2-1/2"': '3-7/8"',
  '2-3/4"': '4-1/4"',
  '3-1/8"': '4-7/8"',
};

export function getStudBoltForFlange(
  boltSize: string,
  quantity: number,
  studLength: number,
  nps: string,
  pressureClass: string,
): StudBoltSpec | null {
  const torqueRow = TORQUE_TABLE.find((r) => r[0] === boltSize);
  if (!torqueRow) return null;

  const [, studDiaMm, torqueMin, torqueTarget, torqueMax] = torqueRow;

  return {
    nps,
    pressureClass,
    studDiameter: boltSize,
    studDiameterMm: studDiaMm,
    quantity,
    studLength,
    nutSize: NUT_SIZE[boltSize] ?? '—',
    torqueDry: Math.round(torqueTarget * 1.3), // dry ~30% higher than lubricated
    torqueLubricated: torqueTarget,
    torqueMin,
    torqueMax,
  };
}

export const GASKET_TYPES: { type: GasketType; label: string; description: string }[] = [
  { type: 'SW-CGI', label: 'Spiral Wound (CGI)', description: '316SS winding + graphite filler + inner/outer rings. Most common for process piping.' },
  { type: 'RTJ', label: 'Ring Type Joint', description: 'Metal ring (soft iron/316SS) for high pressure. 600# and above.' },
  { type: 'Flat', label: 'Flat (CAF)', description: 'Compressed asbestos-free fiber. Low pressure only.' },
  { type: 'Klingersil', label: 'Klingersil C4400', description: 'Synthetic fiber + NBR binder. General purpose, medium pressure.' },
  { type: 'PTFE', label: 'PTFE Envelope', description: 'PTFE outer + elastomer core. Chemical service.' },
];
