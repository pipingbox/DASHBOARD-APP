/**
 * GENERATED FILE — do not edit manually.
 * Source: /workspace/DASHBOARD-APP/PIPINGBOX-BRAIN/brain/08-CATALOG/ASME/BOLTING/PB-DIM-ASME-B16-5-STUD-BOLT.yaml
 * Generated at: 2026-09-09T08:58:54.429Z
 *
 * Thread data derived from ASME B1.1-2024 Table 6.
 * Stud external thread Class 2A; nut internal thread Class 2B.
 */

export type ThreadSeries = 'UNC' | '8UN';

export interface ThreadSpec {
  readonly diaIn: number;
  readonly designation: string;
  readonly series: ThreadSeries;
  readonly tpi: number;
  readonly pitchMm: number;
  readonly tensileAreaIn2: number;
}

export const IMPERIAL_THREAD_DATA: Readonly<Record<number, ThreadSpec>> = {
  0.5: { diaIn: 0.5, designation: "1/2\"-13 UNC-2A", series: "UNC", tpi: 13, pitchMm: 1.954, tensileAreaIn2: 0.142 },
  0.625: { diaIn: 0.625, designation: "5/8\"-11 UNC-2A", series: "UNC", tpi: 11, pitchMm: 2.309, tensileAreaIn2: 0.226 },
  0.75: { diaIn: 0.75, designation: "3/4\"-10 UNC-2A", series: "UNC", tpi: 10, pitchMm: 2.54, tensileAreaIn2: 0.334 },
  0.875: { diaIn: 0.875, designation: "7/8\"-9 UNC-2A", series: "UNC", tpi: 9, pitchMm: 2.822, tensileAreaIn2: 0.462 },
  1: { diaIn: 1, designation: "1\"-8 UNC-2A", series: "UNC", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.606 },
  1.125: { diaIn: 1.125, designation: "1-1/8\"-8 UN-2A", series: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.763 },
  1.25: { diaIn: 1.25, designation: "1-1/4\"-8 UN-2A", series: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.969 },
  1.375: { diaIn: 1.375, designation: "1-3/8\"-8 UN-2A", series: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 1.155 },
  1.5: { diaIn: 1.5, designation: "1-1/2\"-8 UN-2A", series: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 1.405 },
  1.625: { diaIn: 1.625, designation: "1-5/8\"-8 UN-2A", series: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 1.653 },
  1.75: { diaIn: 1.75, designation: "1-3/4\"-8 UN-2A", series: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 1.918 },
  1.875: { diaIn: 1.875, designation: "1-7/8\"-8 UN-2A", series: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 2.199 },
  2: { diaIn: 2, designation: "2\"-8 UN-2A", series: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 2.496 },
  2.25: { diaIn: 2.25, designation: "2-1/4\"-8 UN-2A", series: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 3.16 },
  2.5: { diaIn: 2.5, designation: "2-1/2\"-8 UN-2A", series: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 4 },
  2.75: { diaIn: 2.75, designation: "2-3/4\"-8 UN-2A", series: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 4.93 },
  3: { diaIn: 3, designation: "3\"-8 UN-2A", series: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 5.97 },
  3.5: { diaIn: 3.5, designation: "3-1/2\"-8 UN-2A", series: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 8.33 },
};

export function getThreadSpec(diaIn: number): ThreadSpec | undefined {
  return IMPERIAL_THREAD_DATA[diaIn];
}

export function minProtrusionMm(diaIn: number): number | undefined {
  const thread = getThreadSpec(diaIn);
  if (!thread) return undefined;
  return Number((3 * thread.pitchMm).toFixed(2));
}
