export type EqualTubeElbowErrorCode =
  | 'NON_FINITE_INPUT'
  | 'INVALID_LENGTH'
  | 'INVALID_DIAMETERS'
  | 'ELBOW_RADIUS_TOO_SMALL'
  | 'TUBE_TOO_SHORT'
  | 'DIVISIONS_OUT_OF_RANGE'
  | 'NON_FINITE_RESULT';

export interface EqualTubeElbowInput {
  lengthMm: number;
  innerDiameterMm: number;
  outerDiameterMm: number;
  elbowCenterlineRadiusMm: number;
  divisions: number;
}

export interface EqualTubeElbowError {
  code: EqualTubeElbowErrorCode;
  detail: string;
}

export interface EqualTubeElbowStation {
  index: number;
  angleRad: number;
  circumferentialPositionMm: number;
  tubeCutPositionMm: number;
  elbowBendAngleRad: number;
  elbowArcRadiusMm: number;
  elbowArcLengthMm: number;
  clampedAtElbowEnd: boolean;
  isClosure: boolean;
}

export interface EqualTubeElbowSuccess extends EqualTubeElbowInput {
  valid: true;
  errors: [];
  circumferenceMm: number;
  stationSpacingMm: number;
  angularStepRad: number;
  maxCutbackMm: number;
  stations: EqualTubeElbowStation[];
}

export interface EqualTubeElbowFailure {
  valid: false;
  errors: [EqualTubeElbowError];
  stations: [];
}

export type EqualTubeElbowResult = EqualTubeElbowSuccess | EqualTubeElbowFailure;

function invalid(code: EqualTubeElbowErrorCode, detail: string): EqualTubeElbowFailure {
  return { valid: false, errors: [{ code, detail }], stations: [] };
}

export function computeEqualTubeElbowJoint(input: EqualTubeElbowInput): EqualTubeElbowResult {
  const { lengthMm, innerDiameterMm, outerDiameterMm, elbowCenterlineRadiusMm, divisions } = input;
  if ([lengthMm, innerDiameterMm, outerDiameterMm, elbowCenterlineRadiusMm, divisions]
    .some(value => !Number.isFinite(value))) {
    return invalid('NON_FINITE_INPUT', 'all inputs must be finite');
  }
  if (lengthMm <= 0) return invalid('INVALID_LENGTH', 'lengthMm must be positive');
  if (innerDiameterMm <= 0 || outerDiameterMm <= innerDiameterMm) {
    return invalid('INVALID_DIAMETERS', 'diameters must satisfy 0 < innerDiameterMm < outerDiameterMm');
  }
  const innerRadius = innerDiameterMm / 2;
  const outerRadius = outerDiameterMm / 2;
  if (elbowCenterlineRadiusMm <= outerRadius) {
    return invalid('ELBOW_RADIUS_TOO_SMALL', 'elbowCenterlineRadiusMm must exceed outerDiameterMm / 2');
  }
  if (!Number.isInteger(divisions) || divisions < 4 || divisions > 24) {
    return invalid('DIVISIONS_OUT_OF_RANGE', 'divisions must be an integer in [4, 24]');
  }

  const maxCutbackMm = 2 * Math.sqrt(elbowCenterlineRadiusMm) * Math.sqrt(innerRadius);
  const circumferenceMm = Math.PI * outerDiameterMm;
  const stationSpacingMm = circumferenceMm / divisions;
  const angularStepRad = 2 * Math.PI / divisions;
  if (![maxCutbackMm, circumferenceMm, stationSpacingMm].every(Number.isFinite)) {
    return invalid('NON_FINITE_RESULT', 'global geometry exceeds finite numeric range');
  }
  // Permit only floating-point noise at L = maximum cut-back, not a material shortage.
  const boundaryTolerance = 16 * Number.EPSILON * Math.max(lengthMm, maxCutbackMm);
  if (lengthMm < maxCutbackMm - boundaryTolerance) {
    return invalid('TUBE_TOO_SHORT', 'lengthMm is shorter than the maximum tube cut-back');
  }

  const stations: EqualTubeElbowStation[] = [];
  for (let index = 0; index < divisions; index++) {
    const angleRad = index * angularStepRad;
    // Integer half-plane classification avoids the false positive from sin(pi) > 0.
    const intersectsCurvedElbow = index > 0 && 2 * index < divisions;
    const sine = Math.sin(angleRad);
    const elbowArcRadiusMm = elbowCenterlineRadiusMm + outerRadius * sine;
    let elbowBendAngleRad = Math.PI / 2;
    let tubeCutPositionMm = lengthMm;
    if (intersectsCurvedElbow) {
      const innerMeridionalRadius = elbowCenterlineRadiusMm + innerRadius * sine;
      const asinArgument = (elbowCenterlineRadiusMm - innerRadius * sine) / innerMeridionalRadius;
      // Here 0 < q < 1 by physical domain. Bound only round-off at asin endpoints.
      const asinTolerance = 32 * Number.EPSILON;
      if (asinArgument < -asinTolerance || asinArgument > 1 + asinTolerance) {
        return invalid('NON_FINITE_RESULT', `station ${index}: asin argument outside physical range`);
      }
      elbowBendAngleRad = Math.asin(Math.max(0, Math.min(1, asinArgument)));
      tubeCutPositionMm = lengthMm - 2 * Math.sqrt(elbowCenterlineRadiusMm)
        * Math.sqrt(innerRadius * sine);
      if (tubeCutPositionMm < 0 && tubeCutPositionMm >= -boundaryTolerance) {
        tubeCutPositionMm = 0;
      }
    }
    const station: EqualTubeElbowStation = {
      index,
      angleRad,
      circumferentialPositionMm: index * stationSpacingMm,
      tubeCutPositionMm,
      elbowBendAngleRad,
      elbowArcRadiusMm,
      elbowArcLengthMm: elbowArcRadiusMm * elbowBendAngleRad,
      clampedAtElbowEnd: !intersectsCurvedElbow,
      isClosure: false,
    };
    if (station.tubeCutPositionMm < 0 || ![
      station.angleRad, station.circumferentialPositionMm, station.tubeCutPositionMm,
      station.elbowBendAngleRad, station.elbowArcRadiusMm, station.elbowArcLengthMm,
    ].every(Number.isFinite)) {
      return invalid('NON_FINITE_RESULT', `station ${index}: non-finite or negative geometry`);
    }
    stations.push(station);
  }
  stations.push({ ...stations[0], index: divisions, angleRad: 2 * Math.PI,
    circumferentialPositionMm: circumferenceMm, isClosure: true });
  return {
    valid: true, errors: [], ...input,
    circumferenceMm, stationSpacingMm, angularStepRad, maxCutbackMm, stations,
  };
}
