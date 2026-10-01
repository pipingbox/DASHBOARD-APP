/**
 * PB-BRANCH-INJERTO-EXPANSION-001 — U5.1 reference fixture.
 *
 * CODO → TUBO reference values hand-transcribed from the genuine Tubero 2.0
 * captures ingested in U5-PREFLIGHT-R3 (REF-01 … REF-08). Every number below is
 * a DISPLAYED source value; none of them is produced by the PIPINGBOX kernel.
 *
 * Provenance per dataset:
 *   screen A  "Codo-tubo al <datum>"  → Picaje X, Picaje Y, Cota X', Cota Y'
 *   screen B  "MOSTRAR PICAJE"        → Longitud arco, Radio arco, Div
 * Station index in the arrays is zero based: entry i is Tubero row "Punto i+1".
 *
 * Source display quantization is 0.1 mm.
 *
 * RAW TUBERO ROWS vs PHYSICALLY NORMALIZED PIPINGBOX STATIONS
 *   Tubero pairs its Picaje X column with the mirrored station of its
 *   Picaje Y / Longitud arco columns whenever the datum offset is not zero
 *   (proved in U5-PREFLIGHT-R3 §I). A PIPINGBOX station is one physical point,
 *   so the raw rows below must be re-indexed before comparison:
 *     picajeX[i]                      ↔ station i
 *     picajeY/arcLength/arcRadius[(N - i) % N] ↔ station i
 *   The transform lives here, in the fixture, never in product geometry.
 */

export type ReferenceDatum = 'EJE' | 'BOP' | 'TOP' | 'FE';

export interface ReferenceDataset {
  id: string;
  title: string;
  datum: ReferenceDatum;
  elbowInnerDiameterMm: number;
  elbowOuterDiameterMm: number;
  elbowCentrelineRadiusMm: number;
  receiverOuterDiameterMm: number;
  divisions: number;
  /** Cota Fe as entered in Tubero, null when the datum is not FE. */
  feMm: number | null;
  /** Displayed "Cota X' a eje del colector", null when the screen omits it. */
  cotaXMm: number | null;
  /** Displayed "Distancia entre puntos (Div)". */
  divMm: number;
  /** Displayed "Cota Y' desde punto Ω", an echo of the input, not kernel geometry. */
  yPrimeMm: number | null;
  picajeX: number[];
  picajeY: number[];
  arcLength: number[];
  arcRadius: number[];
}

/** Known source anomalies: Tubero cells that are not reproducible geometry. */
export interface ReferenceAnomaly {
  id: string;
  field: 'arcLength';
  /** Tubero row number "Punto k", 1 based. */
  punto: number;
  shown: number;
  reason: string;
}

export const REFERENCE_DATASETS: ReferenceDataset[] = [
  {
    id: 'REF-01',
    title: 'BASE EJE',
    datum: 'EJE',
    elbowInnerDiameterMm: 77.92, elbowOuterDiameterMm: 88.9,
    elbowCentrelineRadiusMm: 114.3, receiverOuterDiameterMm: 168.3,
    divisions: 24, feMm: null, cotaXMm: null, divMm: 11.6, yPrimeMm: null,
    picajeX: [
      0.0, -10.1, -19.7, -28.1, -34.7, -39.0, -40.5, -39.0, -34.7, -28.1, -19.7, -10.1, -0.0, 10.1, 19.7,
      28.1, 34.7, 39.0, 40.5, 39.0, 34.7, 28.1, 19.7, 10.1,
    ],
    picajeY: [
      -19.2, -17.3, -11.8, -2.9, 8.9, 22.8, 37.8, 52.9, 67.4, 80.7, 92.8, 103.8, 114.3, 103.8, 92.8, 80.7,
      67.4, 52.9, 37.8, 22.8, 8.9, -2.9, -11.8, -17.3,
    ],
    arcLength: [
      81.6, 82.3, 84.3, 87.3, 90.6, 93.6, 95.7, 96.7, 97.0, 97.2, 98.6, 102.3, 109.7, 102.3, 98.6, 97.2,
      97.0, 96.7, 95.7, 93.6, 90.6, 87.3, 84.3, 82.3,
    ],
    arcRadius: [
      158.8, 157.2, 152.8, 145.7, 136.5, 125.8, 114.3, 102.8, 92.1, 82.9, 75.8, 71.4, 69.8, 71.4, 75.8, 82.9,
      92.1, 102.8, 114.3, 125.8, 136.5, 145.7, 152.8, 157.2,
    ],
  },
  {
    id: 'REF-02',
    title: 'BASE BOP',
    datum: 'BOP',
    elbowInnerDiameterMm: 77.92, elbowOuterDiameterMm: 88.9,
    elbowCentrelineRadiusMm: 114.3, receiverOuterDiameterMm: 168.3,
    divisions: 24, feMm: null, cotaXMm: 41.3, divMm: 11.6, yPrimeMm: null,
    picajeX: [
      0.0, -11.9, -24.3, -36.6, -47.9, -56.7, -60.3, -56.7, -47.9, -36.6, -24.3, -11.9, -0.0, 11.1, 20.9,
      29.1, 35.4, 39.3, 40.6, 39.3, 35.4, 29.1, 20.9, 11.1,
    ],
    picajeY: [
      -19.2, -20.1, -17.3, -11.1, -2.3, 8.5, 20.6, 33.2, 45.8, 58.3, 70.9, 84.8, 114.3, 114.3, 114.3, 114.3,
      114.3, 114.3, 114.3, 70.3, 36.0, 12.7, -3.5, -13.8,
    ],
    arcLength: [
      81.6, 76.2, 72.7, 70.8, 70.0, 69.7, 69.6, 69.8, 70.3, 72.0, 75.9, 83.9, 109.7, 112.1, 119.1, 130.2,
      144.6, 161.5, 179.5, 152.2, 129.1, 112.5, 99.5, 89.3,
    ],
    arcRadius: [
      158.8, 157.2, 152.8, 145.7, 136.5, 125.8, 114.3, 102.8, 92.1, 82.9, 75.8, 71.4, 69.8, 71.4, 75.8, 82.9,
      92.1, 102.8, 114.3, 125.8, 136.5, 145.7, 152.8, 157.2,
    ],
  },
  {
    id: 'REF-03',
    title: 'BASE TOP',
    datum: 'TOP',
    elbowInnerDiameterMm: 77.92, elbowOuterDiameterMm: 88.9,
    elbowCentrelineRadiusMm: 114.3, receiverOuterDiameterMm: 168.3,
    divisions: 24, feMm: null, cotaXMm: -41.3, divMm: 11.6, yPrimeMm: null,
    picajeX: [
      0.0, -11.1, -20.9, -29.1, -35.4, -39.3, -40.6, -39.3, -35.4, -29.1, -20.9, -11.1, -0.0, 11.9, 24.3,
      36.6, 47.9, 56.7, 60.3, 56.7, 47.9, 36.6, 24.3, 11.9,
    ],
    picajeY: [
      -19.2, -13.8, -3.5, 12.7, 36.0, 70.3, 114.3, 114.3, 114.3, 114.3, 114.3, 114.3, 114.3, 84.8, 70.9,
      58.3, 45.8, 33.2, 20.6, 8.5, -2.3, -11.1, -17.3, -20.1,
    ],
    arcLength: [
      81.6, 89.3, 99.5, 112.5, 129.1, 152.2, 179.5, 161.5, 144.6, 130.2, 119.1, 112.1, 109.7, 83.9, 75.9,
      72.0, 70.3, 69.8, 69.6, 69.7, 70.0, 70.8, 72.7, 76.2,
    ],
    arcRadius: [
      158.8, 157.2, 152.8, 145.7, 136.5, 125.8, 114.3, 102.8, 92.1, 82.9, 75.8, 71.4, 69.8, 71.4, 75.8, 82.9,
      92.1, 102.8, 114.3, 125.8, 136.5, 145.7, 152.8, 157.2,
    ],
  },
  {
    id: 'REF-04',
    title: 'BASE FE +20',
    datum: 'FE',
    elbowInnerDiameterMm: 77.92, elbowOuterDiameterMm: 88.9,
    elbowCentrelineRadiusMm: 114.3, receiverOuterDiameterMm: 168.3,
    divisions: 24, feMm: 20.0, cotaXMm: -20.2, divMm: 11.6, yPrimeMm: null,
    picajeX: [
      0.0, -10.3, -19.7, -27.8, -34.0, -38.0, -39.3, -38.0, -34.0, -27.8, -19.7, -10.3, -0.0, 10.6, 20.9,
      30.3, 38.1, 43.3, 45.1, 43.3, 38.1, 30.3, 20.9, 10.6,
    ],
    picajeY: [
      -19.2, -15.8, -8.4, 2.8, 17.5, 34.9, 53.9, 73.2, 92.7, 114.3, 114.3, 114.3, 114.3, 92.5, 80.1, 67.9,
      55.1, 41.7, 28.1, 14.9, 2.9, -7.2, -14.5, -18.7,
    ],
    arcLength: [
      81.6, 85.4, 90.6, 97.1, 104.0, 110.5, 115.9, 119.8, 123.8, 130.2, 119.1, 112.1, 109.7, 91.6, 85.8,
      83.3, 82.5, 82.3, 81.9, 81.2, 80.1, 79.1, 78.7, 79.4,
    ],
    arcRadius: [
      158.8, 157.2, 152.8, 145.7, 136.5, 125.8, 114.3, 102.8, 92.1, 82.9, 75.8, 71.4, 69.8, 71.4, 75.8, 82.9,
      92.1, 102.8, 114.3, 125.8, 136.5, 145.7, 152.8, 157.2,
    ],
  },
  {
    id: 'REF-05',
    title: 'R VARIATION EJE R=228.60',
    datum: 'EJE',
    elbowInnerDiameterMm: 77.92, elbowOuterDiameterMm: 88.9,
    elbowCentrelineRadiusMm: 228.6, receiverOuterDiameterMm: 168.3,
    divisions: 24, feMm: null, cotaXMm: null, divMm: 11.6, yPrimeMm: null,
    picajeX: [
      0.0, -10.1, -19.7, -28.1, -34.7, -39.0, -40.5, -39.0, -34.7, -28.1, -19.7, -10.1, -0.0, 10.1, 19.7,
      28.1, 34.7, 39.0, 40.5, 39.0, 34.7, 28.1, 19.7, 10.1,
    ],
    picajeY: [
      39.9, 42.4, 49.8, 61.7, 77.4, 96.1, 116.5, 137.3, 157.6, 176.9, 194.9, 212.0, 228.6, 212.0, 194.9,
      176.9, 157.6, 137.3, 116.5, 96.1, 77.4, 61.7, 49.8, 42.4,
    ],
    arcLength: [
      216.1, 216.2, 219.2, 223.9, 229.6, 235.8, 241.9, 247.4, 252.7, 258.4, 265.6, 275.5, 289.2, 275.5,
      265.6, 258.4, 252.7, 247.4, 241.9, 235.8, 229.6, 223.9, 219.2, 216.2,
    ],
    arcRadius: [
      273.1, 271.5, 267.1, 260.0, 250.8, 240.1, 228.6, 217.1, 206.4, 197.2, 190.1, 185.7, 184.1, 185.7,
      190.1, 197.2, 206.4, 217.1, 228.6, 240.1, 250.8, 260.0, 267.1, 271.5,
    ],
  },
  {
    id: 'REF-06',
    title: 'D VARIATION EJE D=228.60',
    datum: 'EJE',
    elbowInnerDiameterMm: 77.92, elbowOuterDiameterMm: 88.9,
    elbowCentrelineRadiusMm: 114.3, receiverOuterDiameterMm: 228.6,
    divisions: 24, feMm: null, cotaXMm: null, divMm: 11.6, yPrimeMm: null,
    picajeX: [
      0.0, -10.1, -19.6, -27.8, -34.3, -38.3, -39.8, -38.3, -34.3, -27.8, -19.6, -10.1, -0.0, 10.1, 19.6,
      27.8, 34.3, 38.3, 39.8, 38.3, 34.3, 27.8, 19.6, 10.1,
    ],
    picajeY: [
      -19.2, -17.4, -12.1, -3.7, 7.4, 20.5, 34.9, 49.6, 64.1, 77.8, 90.7, 102.7, 114.3, 102.7, 90.7, 77.8,
      64.1, 49.6, 34.9, 20.5, 7.4, -3.7, -12.1, -17.4,
    ],
    arcLength: [
      81.6, 82.1, 83.6, 85.7, 88.1, 90.2, 91.7, 92.6, 93.2, 94.2, 96.5, 101.3, 109.7, 101.3, 96.5, 94.2,
      93.2, 92.6, 91.7, 90.2, 88.1, 85.7, 83.6, 82.1,
    ],
    arcRadius: [
      158.8, 157.2, 152.8, 145.7, 136.5, 125.8, 114.3, 102.8, 92.1, 82.9, 75.8, 71.4, 69.8, 71.4, 75.8, 82.9,
      92.1, 102.8, 114.3, 125.8, 136.5, 145.7, 152.8, 157.2,
    ],
  },
  {
    id: 'REF-07',
    title: 'D=219.10 BOP',
    datum: 'BOP',
    elbowInnerDiameterMm: 77.98, elbowOuterDiameterMm: 88.9,
    elbowCentrelineRadiusMm: 114.3, receiverOuterDiameterMm: 219.1,
    divisions: 24, feMm: null, cotaXMm: 69.7, divMm: 11.6, yPrimeMm: null,
    picajeX: [
      0.0, -13.2, -26.9, -40.7, -53.6, -63.6, -67.6, -63.6, -53.6, -40.7, -26.9, -13.2, 0.0, 12.1, 22.7,
      31.4, 37.9, 42.0, 43.3, 42.0, 37.9, 31.4, 22.7, 12.1,
    ],
    picajeY: [
      -19.2, -21.3, -19.3, -14.0, -6.1, 3.9, 15.2, 27.3, 39.7, 52.2, 65.2, 80.3, 114.3, 114.3, 114.3, 114.3,
      114.3, 114.3, 114.3, 114.3, 48.0, 18.9, -0.3, -12.5,
    ],
    arcLength: [
      81.5, 73.7, 68.1, 64.2, 61.7, 60.3, 59.7, 59.9, 61.2, 64.0, 69.3, 79.3, 109.7, 112.1, 119.1, 130.2,
      144.6, 161.5, 179.5, 197.6, 143.7, 121.4, 104.8, 91.8,
    ],
    arcRadius: [
      158.8, 157.2, 152.8, 145.7, 136.5, 125.8, 114.3, 102.8, 92.1, 82.9, 75.8, 71.4, 69.8, 71.4, 75.8, 82.9,
      92.1, 102.8, 114.3, 125.8, 136.5, 145.7, 152.8, 157.2,
    ],
  },
  {
    id: 'REF-08',
    title: "D=219.10 BOP con Y'=100",
    datum: 'BOP',
    elbowInnerDiameterMm: 77.98, elbowOuterDiameterMm: 88.9,
    elbowCentrelineRadiusMm: 114.3, receiverOuterDiameterMm: 219.1,
    divisions: 24, feMm: null, cotaXMm: 69.7, divMm: 11.6, yPrimeMm: 100.0,
    picajeX: [
      0.0, -13.2, -26.9, -40.7, -53.6, -63.6, -67.6, -63.6, -53.6, -40.7, -26.9, -13.2, 0.0, 12.1, 22.7,
      31.4, 37.9, 42.0, 43.3, 42.0, 37.9, 31.4, 22.7, 12.1,
    ],
    picajeY: [
      -19.2, -21.3, -19.3, -14.0, -6.1, 3.9, 15.2, 27.3, 39.7, 52.2, 65.2, 80.3, 114.3, 114.3, 114.3, 114.3,
      114.3, 114.3, 114.3, 114.3, 48.0, 18.9, -0.3, -12.5,
    ],
    arcLength: [
      81.5, 73.7, 68.1, 64.2, 61.7, 60.3, 59.7, 59.9, 61.2, 64.0, 69.3, 79.3, 109.7, 112.1, 119.1, 130.2,
      144.6, 161.5, 179.5, 197.6, 143.7, 121.4, 104.8, 91.8,
    ],
    arcRadius: [
      158.8, 157.2, 152.8, 145.7, 136.5, 125.8, 114.3, 102.8, 92.1, 82.9, 75.8, 71.4, 69.8, 71.4, 75.8, 82.9,
      92.1, 102.8, 114.3, 125.8, 136.5, 145.7, 152.8, 157.2,
    ],
  }];

/**
 * Documented in U5-PREFLIGHT-R3. These three cells are source defects or pixel
 * ambiguity, not unresolved geometry; the kernel must NOT be bent to match them
 * and no station specific correction may be added.
 */
export const REFERENCE_ANOMALIES: ReferenceAnomaly[] = [
  {
    id: 'REF-05', field: 'arcLength', punto: 1, shown: 216.1,
    reason: 'internally inconsistent Tubero cell: the bend angle implied by its own Picaje Y (39.9) '
      + 'differs from the one implied by its Longitud arco by 0.196 deg, far beyond the 0.026 deg '
      + 'tolerance of the 0.1 mm display bin',
  },
  {
    id: 'REF-04', field: 'arcLength', punto: 9, shown: 123.8,
    reason: 'pixel ambiguous transcription (123.5 or 123.8); 123.5 agrees with the kernel, while '
      + '123.8 is internally inconsistent with the same row Picaje Y by 0.205 deg',
  },
  {
    id: 'REF-05', field: 'arcLength', punto: 13, shown: 289.2,
    reason: 'display bin edge at the pi/2 clamp: 184.1499999 * pi/2 = 289.262, 0.062 mm above the '
      + 'shown bin, no geometric degree of freedom involved',
  },
];

/** Reference ordinates counted exactly as transcribed, including the Cota Y' echo. */
export const REFERENCE_VALUE_COUNT = REFERENCE_DATASETS.reduce((total, dataset) =>
  total + dataset.picajeX.length + dataset.picajeY.length + dataset.arcLength.length
  + dataset.arcRadius.length + 1
  + (dataset.cotaXMm === null ? 0 : 1) + (dataset.yPrimeMm === null ? 0 : 1), 0);

/** Derivation set of U5-PREFLIGHT-R3: the axis case the kernel was derived from. */
export const DERIVATION_IDS = ['REF-01'];
/** Datum extension set: BOP, TOP and FE on the same base geometry. */
export const DATUM_EXTENSION_IDS = ['REF-02', 'REF-03', 'REF-04'];
/** True holdout: R variation, D variations and the Y' controlled pair. */
export const HOLDOUT_IDS = ['REF-05', 'REF-06', 'REF-07', 'REF-08'];
