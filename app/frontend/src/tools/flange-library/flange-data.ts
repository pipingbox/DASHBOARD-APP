/**
 * ASME B16.5 Flange Data — Flange Library
 *
 * Data source: ASME B16.5 "Pipe Flanges and Flanged Fittings" (standard reference).
 * Dimensions in mm. Weights in kg (approximate).
 *
 * Scope: Weld Neck (WN), Slip-On (SO), Blind (BL) for 150# and 300#.
 * Sizes: NPS 1/2" through 24" (full range).
 *
 * Cross-link foundation: each flange knows its compatible gasket + stud bolt
 * requirements, ready for Fase 3 cross-linking.
 *
 * IMPORTANT: This data is for reference. Always verify against the current
 * ASME B16.5 edition for critical applications.
 */

export type FlangeType = 'WN' | 'SO' | 'BL';
export type PressureClass = '150#' | '300#' | '600#' | '900#' | '1500#';
export type FacingType = 'RF' | 'RTJ'; // Raised Face, Ring Type Joint

export interface FlangeDimension {
  nps: string;           // e.g., '2"'
  od: number;            // Outside diameter (mm)
  flangeThickness: number; // Minimum flange thickness (mm)
  hubDiameterEnd: number;  // Hub diameter at face (mm)
  hubDiameterBase: number; // Hub diameter at base (mm)
  boreDiameter: number;    // Bore diameter (mm) — for WN/SO
  boltCircleDiameter: number; // Bolt circle diameter (mm)
  numBolts: number;        // Number of bolts
  boltHoleDiameter: number; // Bolt hole diameter (mm)
  boltSize: string;        // e.g., '5/8"'
  studLength: number;      // Approximate stud length (mm)
  hubLength: number;       // Hub length / weld neck length (mm)
  weight: number;          // Approximate weight (kg)
  pipeOD: number;          // Matching pipe OD (mm)
}

export interface FlangeSpec {
  type: FlangeType;
  typeLabel: string;
  pressureClass: PressureClass;
  facing: FacingType;
  nps: string;
  pipeOD: number;
  od: number;
  flangeThickness: number;
  boltCircleDiameter: number;
  numBolts: number;
  boltHoleDiameter: number;
  boltSize: string;
  studLength: number;
  hubDiameterEnd?: number;
  hubDiameterBase?: number;
  hubLength?: number;
  boreDiameter?: number;
  weight: number;
  // Cross-link data (for Fase 3)
  gasketOD: number;
  gasketID: number;
  gasketType: string;
}

const TYPE_LABELS: Record<FlangeType, string> = {
  WN: 'Weld Neck',
  SO: 'Slip-On',
  BL: 'Blind',
};

// ASME B16.5 150# dimensions (mm)
// Format: [NPS, OD, thickness, hubEnd, hubBase, bore, BCD, numBolts, boltHole, boltSize, studLen, hubLen, weight, pipeOD]
const CLASS_150_DATA: [string, number, number, number, number, number, number, number, number, string, number, number, number, number][] = [
  ['1/2"', 89, 11.2, 30.2, 38.1, 21.3, 60.3, 4, 15.9, '1/2"', 80, 15.9, 0.4, 21.3],
  ['3/4"', 98, 12.7, 38.1, 47.7, 26.7, 69.9, 4, 15.9, '1/2"', 80, 15.9, 0.6, 26.7],
  ['1"',   108, 14.3, 49.3, 60.5, 33.4, 79.4, 4, 15.9, '1/2"', 80, 17.5, 0.8, 33.4],
  ['1-1/4"', 117, 15.9, 58.7, 73.2, 42.2, 88.9, 4, 15.9, '1/2"', 80, 17.5, 1.0, 42.2],
  ['1-1/2"', 127, 17.5, 65.0, 79.5, 48.3, 98.6, 4, 15.9, '1/2"', 80, 17.5, 1.3, 48.3],
  ['2"',   152, 19.1, 77.8, 96.1, 60.3, 120.7, 4, 19.1, '5/8"', 90, 19.1, 1.8, 60.3],
  ['2-1/2"', 178, 22.3, 90.4, 114.4, 73.0, 139.7, 4, 19.1, '5/8"', 100, 22.3, 2.7, 73.0],
  ['3"',   191, 23.9, 106.2, 133.6, 88.9, 152.4, 4, 19.1, '5/8"', 100, 23.9, 3.2, 88.9],
  ['4"',   229, 23.9, 135.5, 171.5, 114.3, 190.5, 8, 19.1, '5/8"', 110, 23.9, 4.5, 114.3],
  ['6"',   279, 25.4, 188.9, 241.4, 168.3, 241.3, 8, 22.3, '3/4"', 130, 25.4, 7.0, 168.3],
  ['8"',   343, 28.5, 243.0, 308.0, 219.1, 298.5, 8, 22.3, '3/4"', 140, 28.5, 10.0, 219.1],
  ['10"',  406, 30.2, 301.5, 362.0, 273.1, 362.0, 12, 25.4, '7/8"', 150, 30.2, 14.0, 273.1],
  ['12"',  483, 31.8, 356.0, 421.0, 323.9, 431.8, 12, 25.4, '7/8"', 160, 31.8, 19.0, 323.9],
  ['14"',  533, 35.0, 387.4, 484.0, 355.6, 476.3, 12, 28.6, '1"', 170, 35.0, 24.0, 355.6],
  ['16"',  597, 36.5, 438.0, 539.8, 406.4, 539.8, 16, 28.6, '1"', 180, 36.5, 30.0, 406.4],
  ['18"',  635, 39.7, 488.0, 596.9, 457.2, 577.9, 16, 31.8, '1-1/8"', 190, 39.7, 36.0, 457.2],
  ['20"',  699, 41.3, 541.0, 650.0, 508.0, 635.0, 20, 31.8, '1-1/8"', 200, 41.3, 43.0, 508.0],
  ['24"',  813, 47.7, 649.0, 762.0, 609.6, 749.3, 20, 35.0, '1-1/4"', 220, 47.7, 60.0, 609.6],
];

// ASME B16.5 300# dimensions (mm)
const CLASS_300_DATA: [string, number, number, number, number, number, number, number, number, string, number, number, number, number][] = [
  ['1/2"', 95, 14.3, 38.1, 42.2, 21.3, 66.5, 4, 15.9, '1/2"', 90, 17.5, 0.6, 21.3],
  ['3/4"', 117, 15.9, 47.7, 52.4, 26.7, 82.6, 4, 19.1, '5/8"', 100, 17.5, 0.9, 26.7],
  ['1"',   123, 17.5, 54.1, 58.8, 33.4, 88.9, 4, 19.1, '5/8"', 100, 19.1, 1.2, 33.4],
  ['1-1/4"', 133, 19.1, 63.5, 68.3, 42.2, 98.6, 4, 19.1, '5/8"', 100, 19.1, 1.5, 42.2],
  ['1-1/2"', 140, 20.7, 69.9, 74.7, 48.3, 104.8, 4, 19.1, '5/8"', 110, 20.7, 1.9, 48.3],
  ['2"',   169, 22.3, 84.2, 96.1, 60.3, 127.0, 8, 19.1, '5/8"', 110, 22.3, 2.9, 60.3],
  ['2-1/2"', 190, 23.9, 100.0, 114.4, 73.0, 149.4, 8, 22.3, '3/4"', 120, 25.4, 4.0, 73.0],
  ['3"',   210, 27.0, 117.4, 133.6, 88.9, 168.3, 8, 22.3, '3/4"', 130, 28.6, 5.4, 88.9],
  ['4"',   254, 28.6, 147.4, 171.5, 114.3, 200.0, 8, 22.3, '3/4"', 140, 30.2, 8.2, 114.3],
  ['6"',   318, 31.8, 200.3, 241.4, 168.3, 269.9, 12, 22.3, '3/4"', 150, 33.4, 13.5, 168.3],
  ['8"',   381, 33.4, 257.3, 308.0, 219.1, 330.2, 12, 25.4, '7/8"', 170, 36.5, 19.0, 219.1],
  ['10"',  444, 38.1, 315.9, 362.0, 273.1, 387.4, 16, 28.6, '1"', 180, 41.3, 27.0, 273.1],
  ['12"',  521, 41.3, 373.1, 421.0, 323.9, 450.9, 16, 31.8, '1-1/8"', 190, 44.5, 37.0, 323.9],
  ['14"',  584, 44.5, 411.3, 484.0, 355.6, 514.4, 20, 31.8, '1-1/8"', 200, 47.7, 47.0, 355.6],
  ['16"',  648, 47.7, 462.1, 539.8, 406.4, 571.5, 20, 35.0, '1-1/4"', 210, 50.8, 58.0, 406.4],
  ['18"',  711, 50.8, 513.1, 596.9, 457.2, 628.7, 24, 35.0, '1-1/4"', 220, 54.0, 70.0, 457.2],
  ['20"',  775, 54.0, 564.0, 650.0, 508.0, 685.8, 24, 35.0, '1-1/4"', 230, 57.2, 83.0, 508.0],
  ['24"',  914, 60.5, 671.0, 762.0, 609.6, 812.8, 24, 41.4, '1-5/8"', 250, 63.5, 115.0, 609.6],
];

function buildSpecs(
  data: typeof CLASS_150_DATA,
  pressureClass: PressureClass,
  types: FlangeType[],
): FlangeSpec[] {
  const specs: FlangeSpec[] = [];
  for (const row of data) {
    const [nps, od, thickness, hubEnd, hubBase, bore, bcd, numBolts, boltHole, boltSize, studLen, hubLen, weight, pipeOD] = row;
    for (const type of types) {
      // Gasket dimensions (approximate for RF)
      const gasketOD = bcd - 2 * boltHole + 2 * 6; // roughly BCD minus bolt holes + margin
      const gasketID = type === 'BL' ? hubEnd : pipeOD + 6;

      specs.push({
        type,
        typeLabel: TYPE_LABELS[type],
        pressureClass,
        facing: 'RF',
        nps,
        pipeOD,
        od,
        flangeThickness: thickness,
        boltCircleDiameter: bcd,
        numBolts,
        boltHoleDiameter: boltHole,
        boltSize,
        studLength: studLen,
        hubDiameterEnd: type === 'BL' ? undefined : hubEnd,
        hubDiameterBase: type === 'BL' ? undefined : hubBase,
        hubLength: type === 'BL' ? undefined : hubLen,
        boreDiameter: type === 'BL' ? undefined : bore,
        weight: type === 'BL' ? weight * 0.85 : type === 'SO' ? weight * 0.75 : weight,
        gasketOD: Math.round(gasketOD),
        gasketID: Math.round(gasketID),
        gasketType: 'Spiral Wound (CGI)',
      });
    }
  }
  return specs;
}

// Build all specs: 150# and 300#, types WN + SO + BL
export const FLANGE_SPECS: FlangeSpec[] = [
  ...buildSpecs(CLASS_150_DATA, '150#', ['WN', 'SO', 'BL']),
  ...buildSpecs(CLASS_300_DATA, '300#', ['WN', 'SO', 'BL']),
];

export const FLANGE_TYPES: { type: FlangeType; label: string }[] = [
  { type: 'WN', label: 'Weld Neck' },
  { type: 'SO', label: 'Slip-On' },
  { type: 'BL', label: 'Blind' },
];

export const PRESSURE_CLASSES: PressureClass[] = ['150#', '300#'];

export const NPS_SIZES = [
  '1/2"', '3/4"', '1"', '1-1/4"', '1-1/2"', '2"', '2-1/2"', '3"',
  '4"', '6"', '8"', '10"', '12"', '14"', '16"', '18"', '20"', '24"',
];
