/**
 * GENERATED FILE — do not edit manually.
 * Source: /workspace/DASHBOARD-APP/PIPINGBOX-BRAIN/brain/08-CATALOG/ASME/BOLTING/PB-DIM-ASME-B16-5-STUD-BOLT.yaml
 * Generated at: 2026-09-09T08:58:54.429Z
 *
 * Stud bolt data target standard: ASME B16.5-2025.
 * Verification status of source rows: draft (confidence 0.55).
 */

export type FacingType = 'RF' | 'RTJ';

export interface StudBoltingRow {
  readonly nps: string;
  readonly dn: number;
  readonly qty: number;
  readonly diaIn: number;
  readonly lengthRfMm: number;
  readonly lengthRtjMm: number | null;
  readonly threadDesignation: string;
  readonly threadSeries: string;
  readonly tpi: number;
  readonly pitchMm: number;
  readonly tensileAreaIn2: number;
  readonly nutAfIn: number;
  readonly nutAfMm: number;
  readonly nutHeightIn: number;
  readonly nutHeightMm: number;
  readonly verificationStatus: string;
}

export interface PressureClassData {
  readonly standard: string;
  readonly edition: string;
  readonly source: string;
  readonly lengthDefinition: string;
  readonly rows: Readonly<Record<string, StudBoltingRow>>;
}

export const ASME_B16_5_NPS_ORDER: readonly string[] = ["1/2\"", "3/4\"", "1\"", "1-1/4\"", "1-1/2\"", "2\"", "2-1/2\"", "3\"", "3-1/2\"", "4\"", "5\"", "6\"", "8\"", "10\"", "12\"", "14\"", "16\"", "18\"", "20\"", "22\"", "24\""];

export const ASME_B16_5_PRESSURE_CLASSES: readonly number[] = [150, 300, 400, 600, 900, 1500, 2500];

export const ASME_B16_5_STUD_BOLTS: Readonly<Record<number, PressureClassData>> = {
  150: {
    standard: "ASME B16.5",
    edition: "2025",
    source: "Brain YAML canonical dataset",
    lengthDefinition: "Stud length L is measured parallel to the axis from first to last full thread, excluding chamfers/points, per ASME B16.5 stud bolt definition.",
    rows: {
    "1/2\"": { nps: "1/2\"", dn: 15, qty: 4, diaIn: 0.5, lengthRfMm: 57, lengthRtjMm: null, threadDesignation: "1/2\"-13 UNC-2A", threadSeries: "UNC", tpi: 13, pitchMm: 1.954, tensileAreaIn2: 0.142, nutAfIn: 0.875, nutAfMm: 22, nutHeightIn: 0.4844, nutHeightMm: 12, verificationStatus: "cross_reference_only" },
    "3/4\"": { nps: "3/4\"", dn: 20, qty: 4, diaIn: 0.5, lengthRfMm: 64, lengthRtjMm: null, threadDesignation: "1/2\"-13 UNC-2A", threadSeries: "UNC", tpi: 13, pitchMm: 1.954, tensileAreaIn2: 0.142, nutAfIn: 0.875, nutAfMm: 22, nutHeightIn: 0.4844, nutHeightMm: 12, verificationStatus: "cross_reference_only" },
    "1\"": { nps: "1\"", dn: 25, qty: 4, diaIn: 0.5, lengthRfMm: 64, lengthRtjMm: 76, threadDesignation: "1/2\"-13 UNC-2A", threadSeries: "UNC", tpi: 13, pitchMm: 1.954, tensileAreaIn2: 0.142, nutAfIn: 0.875, nutAfMm: 22, nutHeightIn: 0.4844, nutHeightMm: 12, verificationStatus: "cross_reference_only" },
    "1-1/4\"": { nps: "1-1/4\"", dn: 32, qty: 4, diaIn: 0.5, lengthRfMm: 70, lengthRtjMm: 83, threadDesignation: "1/2\"-13 UNC-2A", threadSeries: "UNC", tpi: 13, pitchMm: 1.954, tensileAreaIn2: 0.142, nutAfIn: 0.875, nutAfMm: 22, nutHeightIn: 0.4844, nutHeightMm: 12, verificationStatus: "cross_reference_only" },
    "1-1/2\"": { nps: "1-1/2\"", dn: 40, qty: 4, diaIn: 0.5, lengthRfMm: 70, lengthRtjMm: 83, threadDesignation: "1/2\"-13 UNC-2A", threadSeries: "UNC", tpi: 13, pitchMm: 1.954, tensileAreaIn2: 0.142, nutAfIn: 0.875, nutAfMm: 22, nutHeightIn: 0.4844, nutHeightMm: 12, verificationStatus: "cross_reference_only" },
    "2\"": { nps: "2\"", dn: 50, qty: 4, diaIn: 0.625, lengthRfMm: 83, lengthRtjMm: 95, threadDesignation: "5/8\"-11 UNC-2A", threadSeries: "UNC", tpi: 11, pitchMm: 2.309, tensileAreaIn2: 0.226, nutAfIn: 1.0625, nutAfMm: 27, nutHeightIn: 0.6094, nutHeightMm: 15, verificationStatus: "cross_reference_only" },
    "2-1/2\"": { nps: "2-1/2\"", dn: 65, qty: 4, diaIn: 0.625, lengthRfMm: 89, lengthRtjMm: 102, threadDesignation: "5/8\"-11 UNC-2A", threadSeries: "UNC", tpi: 11, pitchMm: 2.309, tensileAreaIn2: 0.226, nutAfIn: 1.0625, nutAfMm: 27, nutHeightIn: 0.6094, nutHeightMm: 15, verificationStatus: "cross_reference_only" },
    "3\"": { nps: "3\"", dn: 80, qty: 4, diaIn: 0.625, lengthRfMm: 89, lengthRtjMm: 102, threadDesignation: "5/8\"-11 UNC-2A", threadSeries: "UNC", tpi: 11, pitchMm: 2.309, tensileAreaIn2: 0.226, nutAfIn: 1.0625, nutAfMm: 27, nutHeightIn: 0.6094, nutHeightMm: 15, verificationStatus: "cross_reference_only" },
    "3-1/2\"": { nps: "3-1/2\"", dn: 90, qty: 8, diaIn: 0.625, lengthRfMm: 89, lengthRtjMm: 102, threadDesignation: "5/8\"-11 UNC-2A", threadSeries: "UNC", tpi: 11, pitchMm: 2.309, tensileAreaIn2: 0.226, nutAfIn: 1.0625, nutAfMm: 27, nutHeightIn: 0.6094, nutHeightMm: 15, verificationStatus: "cross_reference_only" },
    "4\"": { nps: "4\"", dn: 100, qty: 8, diaIn: 0.625, lengthRfMm: 89, lengthRtjMm: 102, threadDesignation: "5/8\"-11 UNC-2A", threadSeries: "UNC", tpi: 11, pitchMm: 2.309, tensileAreaIn2: 0.226, nutAfIn: 1.0625, nutAfMm: 27, nutHeightIn: 0.6094, nutHeightMm: 15, verificationStatus: "cross_reference_only" },
    "5\"": { nps: "5\"", dn: 125, qty: 8, diaIn: 0.75, lengthRfMm: 95, lengthRtjMm: 108, threadDesignation: "3/4\"-10 UNC-2A", threadSeries: "UNC", tpi: 10, pitchMm: 2.54, tensileAreaIn2: 0.334, nutAfIn: 1.25, nutAfMm: 32, nutHeightIn: 0.7344, nutHeightMm: 19, verificationStatus: "cross_reference_only" },
    "6\"": { nps: "6\"", dn: 150, qty: 8, diaIn: 0.75, lengthRfMm: 102, lengthRtjMm: 114, threadDesignation: "3/4\"-10 UNC-2A", threadSeries: "UNC", tpi: 10, pitchMm: 2.54, tensileAreaIn2: 0.334, nutAfIn: 1.25, nutAfMm: 32, nutHeightIn: 0.7344, nutHeightMm: 19, verificationStatus: "cross_reference_only" },
    "8\"": { nps: "8\"", dn: 200, qty: 8, diaIn: 0.75, lengthRfMm: 108, lengthRtjMm: 121, threadDesignation: "3/4\"-10 UNC-2A", threadSeries: "UNC", tpi: 10, pitchMm: 2.54, tensileAreaIn2: 0.334, nutAfIn: 1.25, nutAfMm: 32, nutHeightIn: 0.7344, nutHeightMm: 19, verificationStatus: "cross_reference_only" },
    "10\"": { nps: "10\"", dn: 250, qty: 12, diaIn: 0.875, lengthRfMm: 114, lengthRtjMm: 127, threadDesignation: "7/8\"-9 UNC-2A", threadSeries: "UNC", tpi: 9, pitchMm: 2.822, tensileAreaIn2: 0.462, nutAfIn: 1.4375, nutAfMm: 37, nutHeightIn: 0.8594, nutHeightMm: 22, verificationStatus: "cross_reference_only" },
    "12\"": { nps: "12\"", dn: 300, qty: 12, diaIn: 0.875, lengthRfMm: 121, lengthRtjMm: 133, threadDesignation: "7/8\"-9 UNC-2A", threadSeries: "UNC", tpi: 9, pitchMm: 2.822, tensileAreaIn2: 0.462, nutAfIn: 1.4375, nutAfMm: 37, nutHeightIn: 0.8594, nutHeightMm: 22, verificationStatus: "cross_reference_only" },
    "14\"": { nps: "14\"", dn: 350, qty: 12, diaIn: 1, lengthRfMm: 133, lengthRtjMm: 146, threadDesignation: "1\"-8 UNC-2A", threadSeries: "UNC", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.606, nutAfIn: 1.625, nutAfMm: 41, nutHeightIn: 0.9844, nutHeightMm: 25, verificationStatus: "cross_reference_only" },
    "16\"": { nps: "16\"", dn: 400, qty: 16, diaIn: 1, lengthRfMm: 133, lengthRtjMm: 146, threadDesignation: "1\"-8 UNC-2A", threadSeries: "UNC", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.606, nutAfIn: 1.625, nutAfMm: 41, nutHeightIn: 0.9844, nutHeightMm: 25, verificationStatus: "cross_reference_only" },
    "18\"": { nps: "18\"", dn: 450, qty: 16, diaIn: 1.125, lengthRfMm: 146, lengthRtjMm: 159, threadDesignation: "1-1/8\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.763, nutAfIn: 1.4531, nutAfMm: 37, nutHeightIn: 1.1094, nutHeightMm: 28, verificationStatus: "cross_reference_only" },
    "20\"": { nps: "20\"", dn: 500, qty: 20, diaIn: 1.125, lengthRfMm: 159, lengthRtjMm: 171, threadDesignation: "1-1/8\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.763, nutAfIn: 1.4531, nutAfMm: 37, nutHeightIn: 1.1094, nutHeightMm: 28, verificationStatus: "cross_reference_only" },
    "24\"": { nps: "24\"", dn: 600, qty: 20, diaIn: 1.25, lengthRfMm: 171, lengthRtjMm: 184, threadDesignation: "1-1/4\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.969, nutAfIn: 2, nutAfMm: 51, nutHeightIn: 0.9688, nutHeightMm: 25, verificationStatus: "cross_reference_only" }
    }
  },
  300: {
    standard: "ASME B16.5",
    edition: "2025",
    source: "Brain YAML canonical dataset",
    lengthDefinition: "Stud length L is measured parallel to the axis from first to last full thread, excluding chamfers/points, per ASME B16.5 stud bolt definition.",
    rows: {
    "1/2\"": { nps: "1/2\"", dn: 15, qty: 4, diaIn: 0.5, lengthRfMm: 64, lengthRtjMm: 76, threadDesignation: "1/2\"-13 UNC-2A", threadSeries: "UNC", tpi: 13, pitchMm: 1.954, tensileAreaIn2: 0.142, nutAfIn: 0.875, nutAfMm: 22, nutHeightIn: 0.4844, nutHeightMm: 12, verificationStatus: "cross_reference_only" },
    "3/4\"": { nps: "3/4\"", dn: 20, qty: 4, diaIn: 0.625, lengthRfMm: 76, lengthRtjMm: 89, threadDesignation: "5/8\"-11 UNC-2A", threadSeries: "UNC", tpi: 11, pitchMm: 2.309, tensileAreaIn2: 0.226, nutAfIn: 1.0625, nutAfMm: 27, nutHeightIn: 0.6094, nutHeightMm: 15, verificationStatus: "cross_reference_only" },
    "1\"": { nps: "1\"", dn: 25, qty: 4, diaIn: 0.625, lengthRfMm: 76, lengthRtjMm: 89, threadDesignation: "5/8\"-11 UNC-2A", threadSeries: "UNC", tpi: 11, pitchMm: 2.309, tensileAreaIn2: 0.226, nutAfIn: 1.0625, nutAfMm: 27, nutHeightIn: 0.6094, nutHeightMm: 15, verificationStatus: "cross_reference_only" },
    "1-1/4\"": { nps: "1-1/4\"", dn: 32, qty: 4, diaIn: 0.625, lengthRfMm: 83, lengthRtjMm: 95, threadDesignation: "5/8\"-11 UNC-2A", threadSeries: "UNC", tpi: 11, pitchMm: 2.309, tensileAreaIn2: 0.226, nutAfIn: 1.0625, nutAfMm: 27, nutHeightIn: 0.6094, nutHeightMm: 15, verificationStatus: "cross_reference_only" },
    "1-1/2\"": { nps: "1-1/2\"", dn: 40, qty: 4, diaIn: 0.75, lengthRfMm: 89, lengthRtjMm: 102, threadDesignation: "3/4\"-10 UNC-2A", threadSeries: "UNC", tpi: 10, pitchMm: 2.54, tensileAreaIn2: 0.334, nutAfIn: 1.25, nutAfMm: 32, nutHeightIn: 0.7344, nutHeightMm: 19, verificationStatus: "cross_reference_only" },
    "2\"": { nps: "2\"", dn: 50, qty: 8, diaIn: 0.625, lengthRfMm: 89, lengthRtjMm: 102, threadDesignation: "5/8\"-11 UNC-2A", threadSeries: "UNC", tpi: 11, pitchMm: 2.309, tensileAreaIn2: 0.226, nutAfIn: 1.0625, nutAfMm: 27, nutHeightIn: 0.6094, nutHeightMm: 15, verificationStatus: "cross_reference_only" },
    "2-1/2\"": { nps: "2-1/2\"", dn: 65, qty: 8, diaIn: 0.75, lengthRfMm: 102, lengthRtjMm: 114, threadDesignation: "3/4\"-10 UNC-2A", threadSeries: "UNC", tpi: 10, pitchMm: 2.54, tensileAreaIn2: 0.334, nutAfIn: 1.25, nutAfMm: 32, nutHeightIn: 0.7344, nutHeightMm: 19, verificationStatus: "cross_reference_only" },
    "3\"": { nps: "3\"", dn: 80, qty: 8, diaIn: 0.75, lengthRfMm: 108, lengthRtjMm: 121, threadDesignation: "3/4\"-10 UNC-2A", threadSeries: "UNC", tpi: 10, pitchMm: 2.54, tensileAreaIn2: 0.334, nutAfIn: 1.25, nutAfMm: 32, nutHeightIn: 0.7344, nutHeightMm: 19, verificationStatus: "cross_reference_only" },
    "3-1/2\"": { nps: "3-1/2\"", dn: 90, qty: 8, diaIn: 0.75, lengthRfMm: 108, lengthRtjMm: 127, threadDesignation: "3/4\"-10 UNC-2A", threadSeries: "UNC", tpi: 10, pitchMm: 2.54, tensileAreaIn2: 0.334, nutAfIn: 1.25, nutAfMm: 32, nutHeightIn: 0.7344, nutHeightMm: 19, verificationStatus: "cross_reference_only" },
    "4\"": { nps: "4\"", dn: 100, qty: 8, diaIn: 0.75, lengthRfMm: 114, lengthRtjMm: 127, threadDesignation: "3/4\"-10 UNC-2A", threadSeries: "UNC", tpi: 10, pitchMm: 2.54, tensileAreaIn2: 0.334, nutAfIn: 1.25, nutAfMm: 32, nutHeightIn: 0.7344, nutHeightMm: 19, verificationStatus: "cross_reference_only" },
    "5\"": { nps: "5\"", dn: 125, qty: 8, diaIn: 0.75, lengthRfMm: 121, lengthRtjMm: 133, threadDesignation: "3/4\"-10 UNC-2A", threadSeries: "UNC", tpi: 10, pitchMm: 2.54, tensileAreaIn2: 0.334, nutAfIn: 1.25, nutAfMm: 32, nutHeightIn: 0.7344, nutHeightMm: 19, verificationStatus: "cross_reference_only" },
    "6\"": { nps: "6\"", dn: 150, qty: 12, diaIn: 0.75, lengthRfMm: 121, lengthRtjMm: 140, threadDesignation: "3/4\"-10 UNC-2A", threadSeries: "UNC", tpi: 10, pitchMm: 2.54, tensileAreaIn2: 0.334, nutAfIn: 1.25, nutAfMm: 32, nutHeightIn: 0.7344, nutHeightMm: 19, verificationStatus: "cross_reference_only" },
    "8\"": { nps: "8\"", dn: 200, qty: 12, diaIn: 0.875, lengthRfMm: 140, lengthRtjMm: 152, threadDesignation: "7/8\"-9 UNC-2A", threadSeries: "UNC", tpi: 9, pitchMm: 2.822, tensileAreaIn2: 0.462, nutAfIn: 1.4375, nutAfMm: 37, nutHeightIn: 0.8594, nutHeightMm: 22, verificationStatus: "cross_reference_only" },
    "10\"": { nps: "10\"", dn: 250, qty: 16, diaIn: 1, lengthRfMm: 159, lengthRtjMm: 171, threadDesignation: "1\"-8 UNC-2A", threadSeries: "UNC", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.606, nutAfIn: 1.625, nutAfMm: 41, nutHeightIn: 0.9844, nutHeightMm: 25, verificationStatus: "cross_reference_only" },
    "12\"": { nps: "12\"", dn: 300, qty: 16, diaIn: 1.125, lengthRfMm: 171, lengthRtjMm: 184, threadDesignation: "1-1/8\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.763, nutAfIn: 1.4531, nutAfMm: 37, nutHeightIn: 1.1094, nutHeightMm: 28, verificationStatus: "cross_reference_only" },
    "14\"": { nps: "14\"", dn: 350, qty: 20, diaIn: 1.125, lengthRfMm: 178, lengthRtjMm: 191, threadDesignation: "1-1/8\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.763, nutAfIn: 1.4531, nutAfMm: 37, nutHeightIn: 1.1094, nutHeightMm: 28, verificationStatus: "cross_reference_only" },
    "16\"": { nps: "16\"", dn: 400, qty: 20, diaIn: 1.25, lengthRfMm: 191, lengthRtjMm: 203, threadDesignation: "1-1/4\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.969, nutAfIn: 2, nutAfMm: 51, nutHeightIn: 0.9688, nutHeightMm: 25, verificationStatus: "cross_reference_only" },
    "18\"": { nps: "18\"", dn: 450, qty: 24, diaIn: 1.25, lengthRfMm: 197, lengthRtjMm: 210, threadDesignation: "1-1/4\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.969, nutAfIn: 2, nutAfMm: 51, nutHeightIn: 0.9688, nutHeightMm: 25, verificationStatus: "cross_reference_only" },
    "20\"": { nps: "20\"", dn: 500, qty: 24, diaIn: 1.25, lengthRfMm: 203, lengthRtjMm: 222, threadDesignation: "1-1/4\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.969, nutAfIn: 2, nutAfMm: 51, nutHeightIn: 0.9688, nutHeightMm: 25, verificationStatus: "cross_reference_only" },
    "22\"": { nps: "22\"", dn: 550, qty: 24, diaIn: 1.5, lengthRfMm: 229, lengthRtjMm: 254, threadDesignation: "1-1/2\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 1.405, nutAfIn: 2.375, nutAfMm: 60, nutHeightIn: 1.4688, nutHeightMm: 37, verificationStatus: "cross_reference_only" },
    "24\"": { nps: "24\"", dn: 600, qty: 24, diaIn: 1.5, lengthRfMm: 229, lengthRtjMm: 254, threadDesignation: "1-1/2\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 1.405, nutAfIn: 2.375, nutAfMm: 60, nutHeightIn: 1.4688, nutHeightMm: 37, verificationStatus: "cross_reference_only" }
    }
  },
  400: {
    standard: "ASME B16.5",
    edition: "2025",
    source: "Brain YAML canonical dataset",
    lengthDefinition: "Stud length L is measured parallel to the axis from first to last full thread, excluding chamfers/points, per ASME B16.5 stud bolt definition.",
    rows: {
    "1/2\"": { nps: "1/2\"", dn: 15, qty: 4, diaIn: 0.5, lengthRfMm: 76, lengthRtjMm: 76, threadDesignation: "1/2\"-13 UNC-2A", threadSeries: "UNC", tpi: 13, pitchMm: 1.954, tensileAreaIn2: 0.142, nutAfIn: 0.875, nutAfMm: 22, nutHeightIn: 0.4844, nutHeightMm: 12, verificationStatus: "cross_reference_only" },
    "3/4\"": { nps: "3/4\"", dn: 20, qty: 4, diaIn: 0.625, lengthRfMm: 89, lengthRtjMm: 89, threadDesignation: "5/8\"-11 UNC-2A", threadSeries: "UNC", tpi: 11, pitchMm: 2.309, tensileAreaIn2: 0.226, nutAfIn: 1.0625, nutAfMm: 27, nutHeightIn: 0.6094, nutHeightMm: 15, verificationStatus: "cross_reference_only" },
    "1\"": { nps: "1\"", dn: 25, qty: 4, diaIn: 0.625, lengthRfMm: 89, lengthRtjMm: 89, threadDesignation: "5/8\"-11 UNC-2A", threadSeries: "UNC", tpi: 11, pitchMm: 2.309, tensileAreaIn2: 0.226, nutAfIn: 1.0625, nutAfMm: 27, nutHeightIn: 0.6094, nutHeightMm: 15, verificationStatus: "cross_reference_only" },
    "1-1/4\"": { nps: "1-1/4\"", dn: 32, qty: 4, diaIn: 0.625, lengthRfMm: 95, lengthRtjMm: 95, threadDesignation: "5/8\"-11 UNC-2A", threadSeries: "UNC", tpi: 11, pitchMm: 2.309, tensileAreaIn2: 0.226, nutAfIn: 1.0625, nutAfMm: 27, nutHeightIn: 0.6094, nutHeightMm: 15, verificationStatus: "cross_reference_only" },
    "1-1/2\"": { nps: "1-1/2\"", dn: 40, qty: 4, diaIn: 0.75, lengthRfMm: 108, lengthRtjMm: 108, threadDesignation: "3/4\"-10 UNC-2A", threadSeries: "UNC", tpi: 10, pitchMm: 2.54, tensileAreaIn2: 0.334, nutAfIn: 1.25, nutAfMm: 32, nutHeightIn: 0.7344, nutHeightMm: 19, verificationStatus: "cross_reference_only" },
    "2\"": { nps: "2\"", dn: 50, qty: 8, diaIn: 0.625, lengthRfMm: 108, lengthRtjMm: 108, threadDesignation: "5/8\"-11 UNC-2A", threadSeries: "UNC", tpi: 11, pitchMm: 2.309, tensileAreaIn2: 0.226, nutAfIn: 1.0625, nutAfMm: 27, nutHeightIn: 0.6094, nutHeightMm: 15, verificationStatus: "cross_reference_only" },
    "2-1/2\"": { nps: "2-1/2\"", dn: 65, qty: 8, diaIn: 0.75, lengthRfMm: 121, lengthRtjMm: 121, threadDesignation: "3/4\"-10 UNC-2A", threadSeries: "UNC", tpi: 10, pitchMm: 2.54, tensileAreaIn2: 0.334, nutAfIn: 1.25, nutAfMm: 32, nutHeightIn: 0.7344, nutHeightMm: 19, verificationStatus: "cross_reference_only" },
    "3\"": { nps: "3\"", dn: 80, qty: 8, diaIn: 0.75, lengthRfMm: 127, lengthRtjMm: 127, threadDesignation: "3/4\"-10 UNC-2A", threadSeries: "UNC", tpi: 10, pitchMm: 2.54, tensileAreaIn2: 0.334, nutAfIn: 1.25, nutAfMm: 32, nutHeightIn: 0.7344, nutHeightMm: 19, verificationStatus: "cross_reference_only" },
    "3-1/2\"": { nps: "3-1/2\"", dn: 90, qty: 8, diaIn: 0.875, lengthRfMm: 140, lengthRtjMm: 140, threadDesignation: "7/8\"-9 UNC-2A", threadSeries: "UNC", tpi: 9, pitchMm: 2.822, tensileAreaIn2: 0.462, nutAfIn: 1.4375, nutAfMm: 37, nutHeightIn: 0.8594, nutHeightMm: 22, verificationStatus: "cross_reference_only" },
    "4\"": { nps: "4\"", dn: 100, qty: 8, diaIn: 0.875, lengthRfMm: 140, lengthRtjMm: 140, threadDesignation: "7/8\"-9 UNC-2A", threadSeries: "UNC", tpi: 9, pitchMm: 2.822, tensileAreaIn2: 0.462, nutAfIn: 1.4375, nutAfMm: 37, nutHeightIn: 0.8594, nutHeightMm: 22, verificationStatus: "cross_reference_only" },
    "5\"": { nps: "5\"", dn: 125, qty: 8, diaIn: 0.875, lengthRfMm: 146, lengthRtjMm: 146, threadDesignation: "7/8\"-9 UNC-2A", threadSeries: "UNC", tpi: 9, pitchMm: 2.822, tensileAreaIn2: 0.462, nutAfIn: 1.4375, nutAfMm: 37, nutHeightIn: 0.8594, nutHeightMm: 22, verificationStatus: "cross_reference_only" },
    "6\"": { nps: "6\"", dn: 150, qty: 12, diaIn: 0.875, lengthRfMm: 152, lengthRtjMm: 152, threadDesignation: "7/8\"-9 UNC-2A", threadSeries: "UNC", tpi: 9, pitchMm: 2.822, tensileAreaIn2: 0.462, nutAfIn: 1.4375, nutAfMm: 37, nutHeightIn: 0.8594, nutHeightMm: 22, verificationStatus: "cross_reference_only" },
    "8\"": { nps: "8\"", dn: 200, qty: 12, diaIn: 1, lengthRfMm: 171, lengthRtjMm: 171, threadDesignation: "1\"-8 UNC-2A", threadSeries: "UNC", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.606, nutAfIn: 1.625, nutAfMm: 41, nutHeightIn: 0.9844, nutHeightMm: 25, verificationStatus: "cross_reference_only" },
    "10\"": { nps: "10\"", dn: 250, qty: 16, diaIn: 1.125, lengthRfMm: 191, lengthRtjMm: 191, threadDesignation: "1-1/8\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.763, nutAfIn: 1.4531, nutAfMm: 37, nutHeightIn: 1.1094, nutHeightMm: 28, verificationStatus: "cross_reference_only" },
    "12\"": { nps: "12\"", dn: 300, qty: 16, diaIn: 1.25, lengthRfMm: 203, lengthRtjMm: 203, threadDesignation: "1-1/4\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.969, nutAfIn: 2, nutAfMm: 51, nutHeightIn: 0.9688, nutHeightMm: 25, verificationStatus: "cross_reference_only" },
    "14\"": { nps: "14\"", dn: 350, qty: 20, diaIn: 1.25, lengthRfMm: 210, lengthRtjMm: 210, threadDesignation: "1-1/4\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.969, nutAfIn: 2, nutAfMm: 51, nutHeightIn: 0.9688, nutHeightMm: 25, verificationStatus: "cross_reference_only" },
    "16\"": { nps: "16\"", dn: 400, qty: 20, diaIn: 1.375, lengthRfMm: 222, lengthRtjMm: 222, threadDesignation: "1-3/8\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 1.155, nutAfIn: 2.1875, nutAfMm: 56, nutHeightIn: 1.3438, nutHeightMm: 34, verificationStatus: "cross_reference_only" },
    "18\"": { nps: "18\"", dn: 450, qty: 24, diaIn: 1.375, lengthRfMm: 229, lengthRtjMm: 229, threadDesignation: "1-3/8\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 1.155, nutAfIn: 2.1875, nutAfMm: 56, nutHeightIn: 1.3438, nutHeightMm: 34, verificationStatus: "cross_reference_only" },
    "20\"": { nps: "20\"", dn: 500, qty: 24, diaIn: 1.5, lengthRfMm: 241, lengthRtjMm: 248, threadDesignation: "1-1/2\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 1.405, nutAfIn: 2.375, nutAfMm: 60, nutHeightIn: 1.4688, nutHeightMm: 37, verificationStatus: "cross_reference_only" },
    "22\"": { nps: "22\"", dn: 550, qty: 24, diaIn: 1.625, lengthRfMm: 254, lengthRtjMm: 260, threadDesignation: "1-5/8\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 1.653, nutAfIn: 2.5625, nutAfMm: 65, nutHeightIn: 1.5938, nutHeightMm: 40, verificationStatus: "cross_reference_only" },
    "24\"": { nps: "24\"", dn: 600, qty: 24, diaIn: 1.75, lengthRfMm: 267, lengthRtjMm: 279, threadDesignation: "1-3/4\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 1.918, nutAfIn: 2.75, nutAfMm: 70, nutHeightIn: 1.7188, nutHeightMm: 44, verificationStatus: "cross_reference_only" }
    }
  },
  600: {
    standard: "ASME B16.5",
    edition: "2025",
    source: "Brain YAML canonical dataset",
    lengthDefinition: "Stud length L is measured parallel to the axis from first to last full thread, excluding chamfers/points, per ASME B16.5 stud bolt definition.",
    rows: {
    "1/2\"": { nps: "1/2\"", dn: 15, qty: 4, diaIn: 0.5, lengthRfMm: 76, lengthRtjMm: 76, threadDesignation: "1/2\"-13 UNC-2A", threadSeries: "UNC", tpi: 13, pitchMm: 1.954, tensileAreaIn2: 0.142, nutAfIn: 0.875, nutAfMm: 22, nutHeightIn: 0.4844, nutHeightMm: 12, verificationStatus: "cross_reference_only" },
    "3/4\"": { nps: "3/4\"", dn: 20, qty: 4, diaIn: 0.625, lengthRfMm: 89, lengthRtjMm: 89, threadDesignation: "5/8\"-11 UNC-2A", threadSeries: "UNC", tpi: 11, pitchMm: 2.309, tensileAreaIn2: 0.226, nutAfIn: 1.0625, nutAfMm: 27, nutHeightIn: 0.6094, nutHeightMm: 15, verificationStatus: "cross_reference_only" },
    "1\"": { nps: "1\"", dn: 25, qty: 4, diaIn: 0.625, lengthRfMm: 89, lengthRtjMm: 89, threadDesignation: "5/8\"-11 UNC-2A", threadSeries: "UNC", tpi: 11, pitchMm: 2.309, tensileAreaIn2: 0.226, nutAfIn: 1.0625, nutAfMm: 27, nutHeightIn: 0.6094, nutHeightMm: 15, verificationStatus: "cross_reference_only" },
    "1-1/4\"": { nps: "1-1/4\"", dn: 32, qty: 4, diaIn: 0.625, lengthRfMm: 95, lengthRtjMm: 95, threadDesignation: "5/8\"-11 UNC-2A", threadSeries: "UNC", tpi: 11, pitchMm: 2.309, tensileAreaIn2: 0.226, nutAfIn: 1.0625, nutAfMm: 27, nutHeightIn: 0.6094, nutHeightMm: 15, verificationStatus: "cross_reference_only" },
    "1-1/2\"": { nps: "1-1/2\"", dn: 40, qty: 4, diaIn: 0.75, lengthRfMm: 108, lengthRtjMm: 108, threadDesignation: "3/4\"-10 UNC-2A", threadSeries: "UNC", tpi: 10, pitchMm: 2.54, tensileAreaIn2: 0.334, nutAfIn: 1.25, nutAfMm: 32, nutHeightIn: 0.7344, nutHeightMm: 19, verificationStatus: "cross_reference_only" },
    "2\"": { nps: "2\"", dn: 50, qty: 8, diaIn: 0.625, lengthRfMm: 108, lengthRtjMm: 108, threadDesignation: "5/8\"-11 UNC-2A", threadSeries: "UNC", tpi: 11, pitchMm: 2.309, tensileAreaIn2: 0.226, nutAfIn: 1.0625, nutAfMm: 27, nutHeightIn: 0.6094, nutHeightMm: 15, verificationStatus: "cross_reference_only" },
    "2-1/2\"": { nps: "2-1/2\"", dn: 65, qty: 8, diaIn: 0.75, lengthRfMm: 121, lengthRtjMm: 121, threadDesignation: "3/4\"-10 UNC-2A", threadSeries: "UNC", tpi: 10, pitchMm: 2.54, tensileAreaIn2: 0.334, nutAfIn: 1.25, nutAfMm: 32, nutHeightIn: 0.7344, nutHeightMm: 19, verificationStatus: "cross_reference_only" },
    "3\"": { nps: "3\"", dn: 80, qty: 8, diaIn: 0.75, lengthRfMm: 127, lengthRtjMm: 127, threadDesignation: "3/4\"-10 UNC-2A", threadSeries: "UNC", tpi: 10, pitchMm: 2.54, tensileAreaIn2: 0.334, nutAfIn: 1.25, nutAfMm: 32, nutHeightIn: 0.7344, nutHeightMm: 19, verificationStatus: "cross_reference_only" },
    "3-1/2\"": { nps: "3-1/2\"", dn: 90, qty: 8, diaIn: 0.875, lengthRfMm: 140, lengthRtjMm: 140, threadDesignation: "7/8\"-9 UNC-2A", threadSeries: "UNC", tpi: 9, pitchMm: 2.822, tensileAreaIn2: 0.462, nutAfIn: 1.4375, nutAfMm: 37, nutHeightIn: 0.8594, nutHeightMm: 22, verificationStatus: "cross_reference_only" },
    "4\"": { nps: "4\"", dn: 100, qty: 8, diaIn: 0.875, lengthRfMm: 146, lengthRtjMm: 146, threadDesignation: "7/8\"-9 UNC-2A", threadSeries: "UNC", tpi: 9, pitchMm: 2.822, tensileAreaIn2: 0.462, nutAfIn: 1.4375, nutAfMm: 37, nutHeightIn: 0.8594, nutHeightMm: 22, verificationStatus: "cross_reference_only" },
    "5\"": { nps: "5\"", dn: 125, qty: 8, diaIn: 1, lengthRfMm: 165, lengthRtjMm: 165, threadDesignation: "1\"-8 UNC-2A", threadSeries: "UNC", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.606, nutAfIn: 1.625, nutAfMm: 41, nutHeightIn: 0.9844, nutHeightMm: 25, verificationStatus: "cross_reference_only" },
    "6\"": { nps: "6\"", dn: 150, qty: 12, diaIn: 1, lengthRfMm: 171, lengthRtjMm: 171, threadDesignation: "1\"-8 UNC-2A", threadSeries: "UNC", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.606, nutAfIn: 1.625, nutAfMm: 41, nutHeightIn: 0.9844, nutHeightMm: 25, verificationStatus: "cross_reference_only" },
    "8\"": { nps: "8\"", dn: 200, qty: 12, diaIn: 1.125, lengthRfMm: 191, lengthRtjMm: 197, threadDesignation: "1-1/8\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.763, nutAfIn: 1.4531, nutAfMm: 37, nutHeightIn: 1.1094, nutHeightMm: 28, verificationStatus: "cross_reference_only" },
    "10\"": { nps: "10\"", dn: 250, qty: 16, diaIn: 1.25, lengthRfMm: 216, lengthRtjMm: 216, threadDesignation: "1-1/4\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.969, nutAfIn: 2, nutAfMm: 51, nutHeightIn: 0.9688, nutHeightMm: 25, verificationStatus: "cross_reference_only" },
    "12\"": { nps: "12\"", dn: 300, qty: 20, diaIn: 1.25, lengthRfMm: 222, lengthRtjMm: 222, threadDesignation: "1-1/4\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.969, nutAfIn: 2, nutAfMm: 51, nutHeightIn: 0.9688, nutHeightMm: 25, verificationStatus: "cross_reference_only" },
    "14\"": { nps: "14\"", dn: 350, qty: 20, diaIn: 1.375, lengthRfMm: 235, lengthRtjMm: 235, threadDesignation: "1-3/8\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 1.155, nutAfIn: 2.1875, nutAfMm: 56, nutHeightIn: 1.3438, nutHeightMm: 34, verificationStatus: "cross_reference_only" },
    "16\"": { nps: "16\"", dn: 400, qty: 20, diaIn: 1.5, lengthRfMm: 254, lengthRtjMm: 254, threadDesignation: "1-1/2\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 1.405, nutAfIn: 2.375, nutAfMm: 60, nutHeightIn: 1.4688, nutHeightMm: 37, verificationStatus: "cross_reference_only" },
    "18\"": { nps: "18\"", dn: 450, qty: 20, diaIn: 1.625, lengthRfMm: 273, lengthRtjMm: 273, threadDesignation: "1-5/8\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 1.653, nutAfIn: 2.5625, nutAfMm: 65, nutHeightIn: 1.5938, nutHeightMm: 40, verificationStatus: "cross_reference_only" },
    "20\"": { nps: "20\"", dn: 500, qty: 24, diaIn: 1.625, lengthRfMm: 286, lengthRtjMm: 292, threadDesignation: "1-5/8\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 1.653, nutAfIn: 2.5625, nutAfMm: 65, nutHeightIn: 1.5938, nutHeightMm: 40, verificationStatus: "cross_reference_only" },
    "24\"": { nps: "24\"", dn: 600, qty: 24, diaIn: 1.875, lengthRfMm: 330, lengthRtjMm: 337, threadDesignation: "1-7/8\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 2.199, nutAfIn: 2.9375, nutAfMm: 75, nutHeightIn: 1.8438, nutHeightMm: 47, verificationStatus: "cross_reference_only" }
    }
  },
  900: {
    standard: "ASME B16.5",
    edition: "2025",
    source: "Brain YAML canonical dataset",
    lengthDefinition: "Stud length L is measured parallel to the axis from first to last full thread, excluding chamfers/points, per ASME B16.5 stud bolt definition.",
    rows: {
    "1/2\"": { nps: "1/2\"", dn: 15, qty: 4, diaIn: 0.75, lengthRfMm: 108, lengthRtjMm: 108, threadDesignation: "3/4\"-10 UNC-2A", threadSeries: "UNC", tpi: 10, pitchMm: 2.54, tensileAreaIn2: 0.334, nutAfIn: 1.25, nutAfMm: 32, nutHeightIn: 0.7344, nutHeightMm: 19, verificationStatus: "cross_reference_only" },
    "3/4\"": { nps: "3/4\"", dn: 20, qty: 4, diaIn: 0.75, lengthRfMm: 114, lengthRtjMm: 114, threadDesignation: "3/4\"-10 UNC-2A", threadSeries: "UNC", tpi: 10, pitchMm: 2.54, tensileAreaIn2: 0.334, nutAfIn: 1.25, nutAfMm: 32, nutHeightIn: 0.7344, nutHeightMm: 19, verificationStatus: "cross_reference_only" },
    "1\"": { nps: "1\"", dn: 25, qty: 4, diaIn: 0.875, lengthRfMm: 127, lengthRtjMm: 127, threadDesignation: "7/8\"-9 UNC-2A", threadSeries: "UNC", tpi: 9, pitchMm: 2.822, tensileAreaIn2: 0.462, nutAfIn: 1.4375, nutAfMm: 37, nutHeightIn: 0.8594, nutHeightMm: 22, verificationStatus: "cross_reference_only" },
    "1-1/4\"": { nps: "1-1/4\"", dn: 32, qty: 4, diaIn: 0.875, lengthRfMm: 127, lengthRtjMm: 127, threadDesignation: "7/8\"-9 UNC-2A", threadSeries: "UNC", tpi: 9, pitchMm: 2.822, tensileAreaIn2: 0.462, nutAfIn: 1.4375, nutAfMm: 37, nutHeightIn: 0.8594, nutHeightMm: 22, verificationStatus: "cross_reference_only" },
    "1-1/2\"": { nps: "1-1/2\"", dn: 40, qty: 4, diaIn: 1, lengthRfMm: 140, lengthRtjMm: 140, threadDesignation: "1\"-8 UNC-2A", threadSeries: "UNC", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.606, nutAfIn: 1.625, nutAfMm: 41, nutHeightIn: 0.9844, nutHeightMm: 25, verificationStatus: "cross_reference_only" },
    "2\"": { nps: "2\"", dn: 50, qty: 8, diaIn: 0.875, lengthRfMm: 146, lengthRtjMm: 146, threadDesignation: "7/8\"-9 UNC-2A", threadSeries: "UNC", tpi: 9, pitchMm: 2.822, tensileAreaIn2: 0.462, nutAfIn: 1.4375, nutAfMm: 37, nutHeightIn: 0.8594, nutHeightMm: 22, verificationStatus: "cross_reference_only" },
    "2-1/2\"": { nps: "2-1/2\"", dn: 65, qty: 8, diaIn: 1, lengthRfMm: 159, lengthRtjMm: 159, threadDesignation: "1\"-8 UNC-2A", threadSeries: "UNC", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.606, nutAfIn: 1.625, nutAfMm: 41, nutHeightIn: 0.9844, nutHeightMm: 25, verificationStatus: "cross_reference_only" },
    "3\"": { nps: "3\"", dn: 80, qty: 8, diaIn: 0.875, lengthRfMm: 146, lengthRtjMm: 146, threadDesignation: "7/8\"-9 UNC-2A", threadSeries: "UNC", tpi: 9, pitchMm: 2.822, tensileAreaIn2: 0.462, nutAfIn: 1.4375, nutAfMm: 37, nutHeightIn: 0.8594, nutHeightMm: 22, verificationStatus: "cross_reference_only" },
    "3-1/2\"": { nps: "3-1/2\"", dn: 90, qty: 8, diaIn: 1, lengthRfMm: 159, lengthRtjMm: 159, threadDesignation: "1\"-8 UNC-2A", threadSeries: "UNC", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.606, nutAfIn: 1.625, nutAfMm: 41, nutHeightIn: 0.9844, nutHeightMm: 25, verificationStatus: "cross_reference_only" },
    "4\"": { nps: "4\"", dn: 100, qty: 8, diaIn: 1.125, lengthRfMm: 171, lengthRtjMm: 171, threadDesignation: "1-1/8\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.763, nutAfIn: 1.4531, nutAfMm: 37, nutHeightIn: 1.1094, nutHeightMm: 28, verificationStatus: "cross_reference_only" },
    "5\"": { nps: "5\"", dn: 125, qty: 8, diaIn: 1.25, lengthRfMm: 191, lengthRtjMm: 191, threadDesignation: "1-1/4\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.969, nutAfIn: 2, nutAfMm: 51, nutHeightIn: 0.9688, nutHeightMm: 25, verificationStatus: "cross_reference_only" },
    "6\"": { nps: "6\"", dn: 150, qty: 12, diaIn: 1.125, lengthRfMm: 191, lengthRtjMm: 197, threadDesignation: "1-1/8\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.763, nutAfIn: 1.4531, nutAfMm: 37, nutHeightIn: 1.1094, nutHeightMm: 28, verificationStatus: "cross_reference_only" },
    "8\"": { nps: "8\"", dn: 200, qty: 12, diaIn: 1.375, lengthRfMm: 222, lengthRtjMm: 222, threadDesignation: "1-3/8\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 1.155, nutAfIn: 2.1875, nutAfMm: 56, nutHeightIn: 1.3438, nutHeightMm: 34, verificationStatus: "cross_reference_only" },
    "10\"": { nps: "10\"", dn: 250, qty: 16, diaIn: 1.375, lengthRfMm: 235, lengthRtjMm: 235, threadDesignation: "1-3/8\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 1.155, nutAfIn: 2.1875, nutAfMm: 56, nutHeightIn: 1.3438, nutHeightMm: 34, verificationStatus: "cross_reference_only" },
    "12\"": { nps: "12\"", dn: 300, qty: 20, diaIn: 1.375, lengthRfMm: 254, lengthRtjMm: 254, threadDesignation: "1-3/8\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 1.155, nutAfIn: 2.1875, nutAfMm: 56, nutHeightIn: 1.3438, nutHeightMm: 34, verificationStatus: "cross_reference_only" },
    "14\"": { nps: "14\"", dn: 350, qty: 20, diaIn: 1.5, lengthRfMm: 273, lengthRtjMm: 279, threadDesignation: "1-1/2\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 1.405, nutAfIn: 2.375, nutAfMm: 60, nutHeightIn: 1.4688, nutHeightMm: 37, verificationStatus: "cross_reference_only" },
    "16\"": { nps: "16\"", dn: 400, qty: 20, diaIn: 1.625, lengthRfMm: 286, lengthRtjMm: 292, threadDesignation: "1-5/8\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 1.653, nutAfIn: 2.5625, nutAfMm: 65, nutHeightIn: 1.5938, nutHeightMm: 40, verificationStatus: "cross_reference_only" },
    "18\"": { nps: "18\"", dn: 450, qty: 20, diaIn: 1.875, lengthRfMm: 324, lengthRtjMm: 337, threadDesignation: "1-7/8\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 2.199, nutAfIn: 2.9375, nutAfMm: 75, nutHeightIn: 1.8438, nutHeightMm: 47, verificationStatus: "cross_reference_only" },
    "20\"": { nps: "20\"", dn: 500, qty: 20, diaIn: 2, lengthRfMm: 349, lengthRtjMm: 362, threadDesignation: "2\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 2.496, nutAfIn: 3.125, nutAfMm: 79, nutHeightIn: 1.9688, nutHeightMm: 50, verificationStatus: "cross_reference_only" },
    "24\"": { nps: "24\"", dn: 600, qty: 20, diaIn: 2.5, lengthRfMm: 438, lengthRtjMm: 457, threadDesignation: "2-1/2\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 4, nutAfIn: 3.875, nutAfMm: 98, nutHeightIn: 1.6406, nutHeightMm: 42, verificationStatus: "cross_reference_only" }
    }
  },
  1500: {
    standard: "ASME B16.5",
    edition: "2025",
    source: "Brain YAML canonical dataset",
    lengthDefinition: "Stud length L is measured parallel to the axis from first to last full thread, excluding chamfers/points, per ASME B16.5 stud bolt definition.",
    rows: {
    "1/2\"": { nps: "1/2\"", dn: 15, qty: 4, diaIn: 0.75, lengthRfMm: 108, lengthRtjMm: 108, threadDesignation: "3/4\"-10 UNC-2A", threadSeries: "UNC", tpi: 10, pitchMm: 2.54, tensileAreaIn2: 0.334, nutAfIn: 1.25, nutAfMm: 32, nutHeightIn: 0.7344, nutHeightMm: 19, verificationStatus: "cross_reference_only" },
    "3/4\"": { nps: "3/4\"", dn: 20, qty: 4, diaIn: 0.75, lengthRfMm: 114, lengthRtjMm: 114, threadDesignation: "3/4\"-10 UNC-2A", threadSeries: "UNC", tpi: 10, pitchMm: 2.54, tensileAreaIn2: 0.334, nutAfIn: 1.25, nutAfMm: 32, nutHeightIn: 0.7344, nutHeightMm: 19, verificationStatus: "cross_reference_only" },
    "1\"": { nps: "1\"", dn: 25, qty: 4, diaIn: 0.875, lengthRfMm: 127, lengthRtjMm: 127, threadDesignation: "7/8\"-9 UNC-2A", threadSeries: "UNC", tpi: 9, pitchMm: 2.822, tensileAreaIn2: 0.462, nutAfIn: 1.4375, nutAfMm: 37, nutHeightIn: 0.8594, nutHeightMm: 22, verificationStatus: "cross_reference_only" },
    "1-1/4\"": { nps: "1-1/4\"", dn: 32, qty: 4, diaIn: 0.875, lengthRfMm: 127, lengthRtjMm: 127, threadDesignation: "7/8\"-9 UNC-2A", threadSeries: "UNC", tpi: 9, pitchMm: 2.822, tensileAreaIn2: 0.462, nutAfIn: 1.4375, nutAfMm: 37, nutHeightIn: 0.8594, nutHeightMm: 22, verificationStatus: "cross_reference_only" },
    "1-1/2\"": { nps: "1-1/2\"", dn: 40, qty: 4, diaIn: 1, lengthRfMm: 140, lengthRtjMm: 140, threadDesignation: "1\"-8 UNC-2A", threadSeries: "UNC", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.606, nutAfIn: 1.625, nutAfMm: 41, nutHeightIn: 0.9844, nutHeightMm: 25, verificationStatus: "cross_reference_only" },
    "2\"": { nps: "2\"", dn: 50, qty: 8, diaIn: 0.875, lengthRfMm: 146, lengthRtjMm: 146, threadDesignation: "7/8\"-9 UNC-2A", threadSeries: "UNC", tpi: 9, pitchMm: 2.822, tensileAreaIn2: 0.462, nutAfIn: 1.4375, nutAfMm: 37, nutHeightIn: 0.8594, nutHeightMm: 22, verificationStatus: "cross_reference_only" },
    "2-1/2\"": { nps: "2-1/2\"", dn: 65, qty: 8, diaIn: 1, lengthRfMm: 159, lengthRtjMm: 159, threadDesignation: "1\"-8 UNC-2A", threadSeries: "UNC", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.606, nutAfIn: 1.625, nutAfMm: 41, nutHeightIn: 0.9844, nutHeightMm: 25, verificationStatus: "cross_reference_only" },
    "3\"": { nps: "3\"", dn: 80, qty: 8, diaIn: 1.125, lengthRfMm: 178, lengthRtjMm: 178, threadDesignation: "1-1/8\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.763, nutAfIn: 1.4531, nutAfMm: 37, nutHeightIn: 1.1094, nutHeightMm: 28, verificationStatus: "cross_reference_only" },
    "3-1/2\"": { nps: "3-1/2\"", dn: 90, qty: 8, diaIn: 1.25, lengthRfMm: 197, lengthRtjMm: 197, threadDesignation: "1-1/4\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.969, nutAfIn: 2, nutAfMm: 51, nutHeightIn: 0.9688, nutHeightMm: 25, verificationStatus: "cross_reference_only" },
    "4\"": { nps: "4\"", dn: 100, qty: 8, diaIn: 1.25, lengthRfMm: 197, lengthRtjMm: 197, threadDesignation: "1-1/4\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.969, nutAfIn: 2, nutAfMm: 51, nutHeightIn: 0.9688, nutHeightMm: 25, verificationStatus: "cross_reference_only" },
    "5\"": { nps: "5\"", dn: 125, qty: 8, diaIn: 1.5, lengthRfMm: 248, lengthRtjMm: 248, threadDesignation: "1-1/2\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 1.405, nutAfIn: 2.375, nutAfMm: 60, nutHeightIn: 1.4688, nutHeightMm: 37, verificationStatus: "cross_reference_only" },
    "6\"": { nps: "6\"", dn: 150, qty: 12, diaIn: 1.375, lengthRfMm: 260, lengthRtjMm: 267, threadDesignation: "1-3/8\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 1.155, nutAfIn: 2.1875, nutAfMm: 56, nutHeightIn: 1.3438, nutHeightMm: 34, verificationStatus: "cross_reference_only" },
    "8\"": { nps: "8\"", dn: 200, qty: 12, diaIn: 1.625, lengthRfMm: 292, lengthRtjMm: 298, threadDesignation: "1-5/8\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 1.653, nutAfIn: 2.5625, nutAfMm: 65, nutHeightIn: 1.5938, nutHeightMm: 40, verificationStatus: "cross_reference_only" },
    "10\"": { nps: "10\"", dn: 250, qty: 12, diaIn: 1.875, lengthRfMm: 337, lengthRtjMm: 343, threadDesignation: "1-7/8\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 2.199, nutAfIn: 2.9375, nutAfMm: 75, nutHeightIn: 1.8438, nutHeightMm: 47, verificationStatus: "cross_reference_only" },
    "12\"": { nps: "12\"", dn: 300, qty: 16, diaIn: 2, lengthRfMm: 375, lengthRtjMm: 387, threadDesignation: "2\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 2.496, nutAfIn: 3.125, nutAfMm: 79, nutHeightIn: 1.9688, nutHeightMm: 50, verificationStatus: "cross_reference_only" },
    "14\"": { nps: "14\"", dn: 350, qty: 16, diaIn: 2.25, lengthRfMm: 406, lengthRtjMm: 425, threadDesignation: "2-1/4\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 3.16, nutAfIn: 3.5, nutAfMm: 89, nutHeightIn: 1.4219, nutHeightMm: 36, verificationStatus: "cross_reference_only" },
    "16\"": { nps: "16\"", dn: 400, qty: 16, diaIn: 2.5, lengthRfMm: 445, lengthRtjMm: 470, threadDesignation: "2-1/2\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 4, nutAfIn: 3.875, nutAfMm: 98, nutHeightIn: 1.6406, nutHeightMm: 42, verificationStatus: "cross_reference_only" },
    "18\"": { nps: "18\"", dn: 450, qty: 16, diaIn: 2.75, lengthRfMm: 495, lengthRtjMm: 527, threadDesignation: "2-3/4\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 4.93, nutAfIn: 4.25, nutAfMm: 108, nutHeightIn: 1.8594, nutHeightMm: 47, verificationStatus: "cross_reference_only" },
    "20\"": { nps: "20\"", dn: 500, qty: 16, diaIn: 3, lengthRfMm: 540, lengthRtjMm: 565, threadDesignation: "3\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 5.97, nutAfIn: 4.625, nutAfMm: 117, nutHeightIn: 2.0781, nutHeightMm: 53, verificationStatus: "cross_reference_only" },
    "24\"": { nps: "24\"", dn: 600, qty: 16, diaIn: 3.5, lengthRfMm: 616, lengthRtjMm: 648, threadDesignation: "3-1/2\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 8.33, nutAfIn: 5.375, nutAfMm: 137, nutHeightIn: 3.4375, nutHeightMm: 87, verificationStatus: "cross_reference_only" }
    }
  },
  2500: {
    standard: "ASME B16.5",
    edition: "2025",
    source: "Brain YAML canonical dataset",
    lengthDefinition: "Stud length L is measured parallel to the axis from first to last full thread, excluding chamfers/points, per ASME B16.5 stud bolt definition.",
    rows: {
    "1/2\"": { nps: "1/2\"", dn: 15, qty: 4, diaIn: 0.75, lengthRfMm: 121, lengthRtjMm: 121, threadDesignation: "3/4\"-10 UNC-2A", threadSeries: "UNC", tpi: 10, pitchMm: 2.54, tensileAreaIn2: 0.334, nutAfIn: 1.25, nutAfMm: 32, nutHeightIn: 0.7344, nutHeightMm: 19, verificationStatus: "cross_reference_only" },
    "3/4\"": { nps: "3/4\"", dn: 20, qty: 4, diaIn: 0.75, lengthRfMm: 127, lengthRtjMm: 127, threadDesignation: "3/4\"-10 UNC-2A", threadSeries: "UNC", tpi: 10, pitchMm: 2.54, tensileAreaIn2: 0.334, nutAfIn: 1.25, nutAfMm: 32, nutHeightIn: 0.7344, nutHeightMm: 19, verificationStatus: "cross_reference_only" },
    "1\"": { nps: "1\"", dn: 25, qty: 4, diaIn: 0.875, lengthRfMm: 140, lengthRtjMm: 140, threadDesignation: "7/8\"-9 UNC-2A", threadSeries: "UNC", tpi: 9, pitchMm: 2.822, tensileAreaIn2: 0.462, nutAfIn: 1.4375, nutAfMm: 37, nutHeightIn: 0.8594, nutHeightMm: 22, verificationStatus: "cross_reference_only" },
    "1-1/4\"": { nps: "1-1/4\"", dn: 32, qty: 4, diaIn: 1, lengthRfMm: 152, lengthRtjMm: 152, threadDesignation: "1\"-8 UNC-2A", threadSeries: "UNC", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.606, nutAfIn: 1.625, nutAfMm: 41, nutHeightIn: 0.9844, nutHeightMm: 25, verificationStatus: "cross_reference_only" },
    "1-1/2\"": { nps: "1-1/2\"", dn: 40, qty: 4, diaIn: 1.125, lengthRfMm: 171, lengthRtjMm: 171, threadDesignation: "1-1/8\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.763, nutAfIn: 1.4531, nutAfMm: 37, nutHeightIn: 1.1094, nutHeightMm: 28, verificationStatus: "cross_reference_only" },
    "2\"": { nps: "2\"", dn: 50, qty: 8, diaIn: 1, lengthRfMm: 178, lengthRtjMm: 178, threadDesignation: "1\"-8 UNC-2A", threadSeries: "UNC", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.606, nutAfIn: 1.625, nutAfMm: 41, nutHeightIn: 0.9844, nutHeightMm: 25, verificationStatus: "cross_reference_only" },
    "2-1/2\"": { nps: "2-1/2\"", dn: 65, qty: 8, diaIn: 1.125, lengthRfMm: 197, lengthRtjMm: 203, threadDesignation: "1-1/8\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.763, nutAfIn: 1.4531, nutAfMm: 37, nutHeightIn: 1.1094, nutHeightMm: 28, verificationStatus: "cross_reference_only" },
    "3\"": { nps: "3\"", dn: 80, qty: 8, diaIn: 1.25, lengthRfMm: 222, lengthRtjMm: 229, threadDesignation: "1-1/4\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 0.969, nutAfIn: 2, nutAfMm: 51, nutHeightIn: 0.9688, nutHeightMm: 25, verificationStatus: "cross_reference_only" },
    "4\"": { nps: "4\"", dn: 100, qty: 8, diaIn: 1.5, lengthRfMm: 254, lengthRtjMm: 260, threadDesignation: "1-1/2\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 1.405, nutAfIn: 2.375, nutAfMm: 60, nutHeightIn: 1.4688, nutHeightMm: 37, verificationStatus: "cross_reference_only" },
    "5\"": { nps: "5\"", dn: 125, qty: 8, diaIn: 1.75, lengthRfMm: 298, lengthRtjMm: 311, threadDesignation: "1-3/4\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 1.918, nutAfIn: 2.75, nutAfMm: 70, nutHeightIn: 1.7188, nutHeightMm: 44, verificationStatus: "cross_reference_only" },
    "6\"": { nps: "6\"", dn: 150, qty: 8, diaIn: 2, lengthRfMm: 343, lengthRtjMm: 356, threadDesignation: "2\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 2.496, nutAfIn: 3.125, nutAfMm: 79, nutHeightIn: 1.9688, nutHeightMm: 50, verificationStatus: "cross_reference_only" },
    "8\"": { nps: "8\"", dn: 200, qty: 12, diaIn: 2, lengthRfMm: 381, lengthRtjMm: 394, threadDesignation: "2\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 2.496, nutAfIn: 3.125, nutAfMm: 79, nutHeightIn: 1.9688, nutHeightMm: 50, verificationStatus: "cross_reference_only" },
    "10\"": { nps: "10\"", dn: 250, qty: 12, diaIn: 2.5, lengthRfMm: 489, lengthRtjMm: 508, threadDesignation: "2-1/2\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 4, nutAfIn: 3.875, nutAfMm: 98, nutHeightIn: 1.6406, nutHeightMm: 42, verificationStatus: "cross_reference_only" },
    "12\"": { nps: "12\"", dn: 300, qty: 12, diaIn: 2.75, lengthRfMm: 540, lengthRtjMm: 559, threadDesignation: "2-3/4\"-8 UN-2A", threadSeries: "8UN", tpi: 8, pitchMm: 3.175, tensileAreaIn2: 4.93, nutAfIn: 4.25, nutAfMm: 108, nutHeightIn: 1.8594, nutHeightMm: 47, verificationStatus: "cross_reference_only" }
    }
  }
};

export function getStudBoltRow(pressureClass: number, nps: string): StudBoltingRow | undefined {
  return ASME_B16_5_STUD_BOLTS[pressureClass]?.rows[nps];
}
