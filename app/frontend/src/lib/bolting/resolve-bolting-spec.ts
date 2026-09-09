/**
 * Single source of truth for resolved bolting specification.
 *
 * Combines ASME B16.5 stud bolt data, ASME B1.1 thread data, and ASME B18.2.2
 * heavy hex nut data into one immutable object used by the SVG, results table,
 * torque calculation, and additional information sections.
 */

import { getStudBoltRow, type FacingType } from './asme-b16-5-stud-bolts.ts';
import { getHeavyHexNutSpec } from './heavy-hex-nut-data.ts';
import { getThreadSpec, minProtrusionMm } from './thread-data.ts';
import { formatInchFraction } from './format-utils.ts';

export interface ResolvedStud {
  readonly quantity: number;
  /** Nominal diameter in inches (decimal) */
  readonly diameterIn: number;
  /** Nominal diameter display, e.g. '5/8"' */
  readonly diameterDisplay: string;
  /** Stud length in mm for the selected facing */
  readonly lengthMm: number;
  /** Thread designation, e.g. '5/8"-11 UNC-2A' */
  readonly threadDesignation: string;
  readonly threadSeries: string;
  readonly tpi: number;
  readonly pitchMm: number;
  /** Minimum protrusion beyond each nut face = 3 × pitch */
  readonly minProtrusionMm: number;
  /** Tensile stress area in square inches (Ab) */
  readonly tensileAreaIn2: number;
}

export interface ResolvedNut {
  readonly standard: string;
  readonly type: string;
  /** Width across flats in mm */
  readonly afMm: number;
  /** Nut height / thickness in mm */
  readonly heightMm: number;
}

export interface ResolvedBoltingSpec {
  readonly available: boolean;
  readonly nps: string;
  readonly pressureClass: number;
  readonly facing: FacingType;
  /** Why it is not available, when applicable */
  readonly reason?: string;
  readonly stud?: ResolvedStud;
  readonly nut?: ResolvedNut;
  /** Verification status from the source dataset */
  readonly verificationStatus?: string;
  /** Metadata for traceability */
  readonly source: {
    readonly standard: string;
    readonly edition: string;
    readonly source: string;
    readonly lengthDefinition: string;
  };
}

export function resolveBoltingSpec(
  nps: string,
  pressureClass: number,
  facing: FacingType
): ResolvedBoltingSpec {
  const classData = getStudBoltRow(pressureClass, nps);
  const sourceMeta = {
    standard: 'ASME B16.5',
    edition: '2025',
    source: 'Brain YAML canonical dataset (cross-reference verified, pending primary ASME B16.5-2025 validation)',
    lengthDefinition:
      'Stud length L is measured parallel to the axis from first to last full thread, excluding chamfers/points, per ASME B16.5 stud bolt definition.',
  };

  if (!classData) {
    return {
      available: false,
      nps,
      pressureClass,
      facing,
      reason: 'Combination not defined by ASME B16.5 for the selected facing.',
      source: sourceMeta,
    };
  }

  const thread = getThreadSpec(classData.diaIn);
  if (!thread) {
    return {
      available: false,
      nps,
      pressureClass,
      facing,
      reason: `Thread data not available for diameter ${formatInchFraction(classData.diaIn)}.`,
      source: sourceMeta,
    };
  }

  const nut = getHeavyHexNutSpec(classData.diaIn);
  if (!nut) {
    return {
      available: false,
      nps,
      pressureClass,
      facing,
      reason: `Heavy hex nut data not available for diameter ${formatInchFraction(classData.diaIn)}.`,
      source: sourceMeta,
    };
  }

  const lengthMm = facing === 'RTJ' ? classData.lengthRtjMm : classData.lengthRfMm;
  if (lengthMm === null) {
    return {
      available: false,
      nps,
      pressureClass,
      facing,
      reason: `Facing ${facing} not defined for NPS ${nps} Class ${pressureClass}.`,
      source: sourceMeta,
    };
  }

  const protrusion = minProtrusionMm(classData.diaIn);
  if (protrusion === undefined) {
    return {
      available: false,
      nps,
      pressureClass,
      facing,
      reason: 'Could not compute minimum protrusion (3 × pitch).',
      source: sourceMeta,
    };
  }

  return {
    available: true,
    nps,
    pressureClass,
    facing,
    verificationStatus: classData.verificationStatus,
    stud: {
      quantity: classData.qty,
      diameterIn: classData.diaIn,
      diameterDisplay: formatInchFraction(classData.diaIn),
      lengthMm,
      threadDesignation: thread.designation,
      threadSeries: thread.series,
      tpi: thread.tpi,
      pitchMm: thread.pitchMm,
      minProtrusionMm: protrusion,
      tensileAreaIn2: thread.tensileAreaIn2,
    },
    nut: {
      standard: 'ASME B18.2.2-2022',
      type: 'Heavy Hex Nut',
      afMm: nut.afMm,
      heightMm: nut.heightMm,
    },
    source: sourceMeta,
  };
}

export function isValidBoltingCombination(
  nps: string,
  pressureClass: number,
  facing: FacingType
): boolean {
  return resolveBoltingSpec(nps, pressureClass, facing).available;
}
