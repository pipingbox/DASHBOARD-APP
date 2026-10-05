// Literal one-decimal Tubero 2.0 values supplied by the PO on 2026-10-05:
// screen "UNIÓN TUBO-CODO iguales", Div, COTAS TUBO P1..PN,
// CODO Longitud arco P1..PN and Radio arco P1..PN. No formula generates source values.
export interface EqualTubeElbowReference {
  id: 'REF-01' | 'REF-02' | 'REF-03';
  role: 'DERIVATION' | 'HOLDOUT_R' | 'HOLDOUT_L_N';
  screenTitle: 'UNIÓN TUBO-CODO iguales';
  lengthMm: number;
  innerDiameterMm: number;
  outerDiameterMm: number;
  elbowCenterlineRadiusMm: number;
  divisions: number;
  divMm: number;
  tubeCutPositionsMm: number[];
  elbowArcLengthsMm: number[];
  elbowArcRadiiMm: number[];
}

export const EQUAL_TUBE_ELBOW_REFERENCES: EqualTubeElbowReference[] = [
  {
    id: 'REF-01', role: 'DERIVATION', screenTitle: 'UNIÓN TUBO-CODO iguales',
    lengthMm: 300.00, innerDiameterMm: 77.92, outerDiameterMm: 88.90,
    elbowCenterlineRadiusMm: 114.30, divisions: 24, divMm: 11.6,
    tubeCutPositionsMm: [
      300.0, 232.1, 205.6, 187.8, 175.8, 168.8, 166.5, 168.8, 175.8, 187.8, 205.6, 232.1,
      300.0, 300.0, 300.0, 300.0, 300.0, 300.0, 300.0, 300.0, 300.0, 300.0, 300.0, 300.0,
    ],
    elbowArcLengthsMm: [
      179.5, 125.0, 107.5, 95.9, 87.9, 83.2, 81.6, 83.2, 87.9, 95.9, 107.5, 125.0,
      179.5, 161.5, 144.6, 130.2, 119.1, 112.1, 109.7, 112.1, 119.1, 130.2, 144.6, 161.5,
    ],
    elbowArcRadiiMm: [
      114.3, 125.8, 136.5, 145.7, 152.8, 157.2, 158.8, 157.2, 152.8, 145.7, 136.5, 125.8,
      114.3, 102.8, 92.1, 82.9, 75.8, 71.4, 69.8, 71.4, 75.8, 82.9, 92.1, 102.8,
    ],
  },
  {
    id: 'REF-02', role: 'HOLDOUT_R', screenTitle: 'UNIÓN TUBO-CODO iguales',
    lengthMm: 300.00, innerDiameterMm: 77.92, outerDiameterMm: 88.90,
    elbowCenterlineRadiusMm: 228.60, divisions: 24, divMm: 11.6,
    tubeCutPositionsMm: [
      300.0, 204.0, 166.5, 141.3, 124.4, 114.5, 111.3, 114.5, 124.4, 141.3, 166.5, 204.0,
      300.0, 300.0, 300.0, 300.0, 300.0, 300.0, 300.0, 300.0, 300.0, 300.0, 300.0, 300.0,
    ],
    elbowArcLengthsMm: [
      359.1, 277.7, 251.5, 234.7, 223.6, 217.2, 215.1, 217.2, 223.6, 234.7, 251.5, 277.7,
      359.1, 341.0, 324.2, 309.7, 298.6, 291.6, 289.3, 291.6, 298.6, 309.7, 324.2, 341.0,
    ],
    elbowArcRadiiMm: [
      228.6, 240.1, 250.8, 260.0, 267.1, 271.5, 273.1, 271.5, 267.1, 260.0, 250.8, 240.1,
      228.6, 217.1, 206.4, 197.2, 190.1, 185.7, 184.1, 185.7, 190.1, 197.2, 206.4, 217.1,
    ],
  },
  {
    id: 'REF-03', role: 'HOLDOUT_L_N', screenTitle: 'UNIÓN TUBO-CODO iguales',
    lengthMm: 500.00, innerDiameterMm: 77.92, outerDiameterMm: 88.90,
    elbowCenterlineRadiusMm: 114.30, divisions: 12, divMm: 23.3,
    tubeCutPositionsMm: [
      500.0, 405.6, 375.8, 366.5, 375.8, 405.6, 500.0, 500.0, 500.0, 500.0, 500.0, 500.0,
    ],
    elbowArcLengthsMm: [
      179.5, 107.5, 87.9, 81.6, 87.9, 107.5, 179.5, 144.6, 119.1, 109.7, 119.1, 144.6,
    ],
    elbowArcRadiiMm: [
      114.3, 136.5, 152.8, 158.8, 152.8, 136.5, 114.3, 92.1, 75.8, 69.8, 75.8, 92.1,
    ],
  },
];

export const EQUAL_TUBE_ELBOW_DERIVATION_IDS = ['REF-01'];
export const EQUAL_TUBE_ELBOW_HOLDOUT_IDS = ['REF-02', 'REF-03'];
export const EQUAL_TUBE_ELBOW_REFERENCE_VALUE_COUNT = 183;
