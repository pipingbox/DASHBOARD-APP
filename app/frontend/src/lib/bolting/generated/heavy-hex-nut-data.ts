/**
 * GENERATED FILE — do not edit manually.
 * Source: /workspace/DASHBOARD-APP/PIPINGBOX-BRAIN/brain/08-CATALOG/ASME/BOLTING/PB-DIM-ASME-B16-5-STUD-BOLT.yaml
 * Generated at: 2026-09-09T08:58:54.429Z
 *
 * Heavy hex nut data derived from ASME B18.2.2-2022.
 */

export interface HeavyHexNutSpec {
  readonly nominalDiaIn: number;
  readonly afIn: number;
  readonly afMm: number;
  readonly heightIn: number;
  readonly heightMm: number;
}

export const HEAVY_HEX_NUT_DATA: Readonly<Record<number, HeavyHexNutSpec>> = {
  0.5: { nominalDiaIn: 0.5, afIn: 0.875, afMm: 22, heightIn: 0.4844, heightMm: 12 },
  0.625: { nominalDiaIn: 0.625, afIn: 1.0625, afMm: 27, heightIn: 0.6094, heightMm: 15 },
  0.75: { nominalDiaIn: 0.75, afIn: 1.25, afMm: 32, heightIn: 0.7344, heightMm: 19 },
  0.875: { nominalDiaIn: 0.875, afIn: 1.4375, afMm: 37, heightIn: 0.8594, heightMm: 22 },
  1: { nominalDiaIn: 1, afIn: 1.625, afMm: 41, heightIn: 0.9844, heightMm: 25 },
  1.125: { nominalDiaIn: 1.125, afIn: 1.4531, afMm: 37, heightIn: 1.1094, heightMm: 28 },
  1.25: { nominalDiaIn: 1.25, afIn: 2, afMm: 51, heightIn: 0.9688, heightMm: 25 },
  1.375: { nominalDiaIn: 1.375, afIn: 2.1875, afMm: 56, heightIn: 1.3438, heightMm: 34 },
  1.5: { nominalDiaIn: 1.5, afIn: 2.375, afMm: 60, heightIn: 1.4688, heightMm: 37 },
  1.625: { nominalDiaIn: 1.625, afIn: 2.5625, afMm: 65, heightIn: 1.5938, heightMm: 40 },
  1.75: { nominalDiaIn: 1.75, afIn: 2.75, afMm: 70, heightIn: 1.7188, heightMm: 44 },
  1.875: { nominalDiaIn: 1.875, afIn: 2.9375, afMm: 75, heightIn: 1.8438, heightMm: 47 },
  2: { nominalDiaIn: 2, afIn: 3.125, afMm: 79, heightIn: 1.9688, heightMm: 50 },
  2.25: { nominalDiaIn: 2.25, afIn: 3.5, afMm: 89, heightIn: 1.4219, heightMm: 36 },
  2.5: { nominalDiaIn: 2.5, afIn: 3.875, afMm: 98, heightIn: 1.6406, heightMm: 42 },
  2.75: { nominalDiaIn: 2.75, afIn: 4.25, afMm: 108, heightIn: 1.8594, heightMm: 47 },
  3: { nominalDiaIn: 3, afIn: 4.625, afMm: 117, heightIn: 2.0781, heightMm: 53 },
  3.5: { nominalDiaIn: 3.5, afIn: 5.375, afMm: 137, heightIn: 3.4375, heightMm: 87 },
};

export function getHeavyHexNutSpec(nominalDiaIn: number): HeavyHexNutSpec | undefined {
  return HEAVY_HEX_NUT_DATA[nominalDiaIn];
}
