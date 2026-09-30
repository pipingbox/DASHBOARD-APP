export type BranchOnElbowDatum =
  | { type: 'EJE' }
  | { type: 'BOP' }
  | { type: 'TOP' }
  | { type: 'FE'; fe: number };

export interface BranchOnElbowInput {
  elbowCentrelineRadiusMm: number;
  elbowOuterDiameterMm: number;
  branchInnerDiameterMm: number;
  branchOuterDiameterMm: number;
  axisHeightMm: number;
  referenceLengthMm: number;
  divisions: number;
  datum: BranchOnElbowDatum;
  branchCutReferenceRadiusMm?: number;
  holeReferenceRadiusMm?: number;
  developmentRadiusMm?: number;
}

export type BranchOnElbowErrorCode =
  | 'NON_FINITE_INPUT'
  | 'NON_POSITIVE_DIMENSION'
  | 'INNER_EXCEEDS_OUTER'
  | 'INVALID_DIVISIONS'
  | 'INVALID_DATUM'
  | 'OFFSET_OUT_OF_RANGE'
  | 'ASIN_OUT_OF_RANGE'
  | 'NO_INTERSECTION'
  | 'NON_FINITE_RESULT';

export interface BranchOnElbowError {
  code: BranchOnElbowErrorCode;
  detail: string;
}

export interface BranchOnElbowStation {
  index: number;
  thetaDeg: number;
  arcPosition: number;
  cutOrdinate: number;
  picajeX: number;
  picajeY: number;
}

export interface BranchOnElbowResult {
  valid: boolean;
  errors: BranchOnElbowError[];
  cotaX: number;
  cotaY: number;
  stationCount: number;
  angularStepDeg: number;
  developedCircumference: number;
  stationSpacing: number;
  datumOffsetMm: number;
  stations: BranchOnElbowStation[];
}

interface SurfacePoint {
  psi: number;
  meridianRadius: number;
  x: number;
  phi: number;
}

type SurfaceSample =
  | { point: SurfacePoint; error?: never }
  | { point?: never; error: BranchOnElbowError };

function invalid(error: BranchOnElbowError): BranchOnElbowResult {
  return {
    valid: false, errors: [error], cotaX: 0, cotaY: 0, stationCount: 0,
    angularStepDeg: 0, developedCircumference: 0, stationSpacing: 0,
    datumOffsetMm: 0, stations: [],
  };
}

function sampleSurface(
  elbowRadius: number, outerRadius: number, axisHeight: number,
  datumOffset: number, generatingRadius: number, theta: number, context: string,
): SurfaceSample {
  const y = axisHeight + generatingRadius * Math.cos(theta);
  const z = datumOffset + generatingRadius * Math.sin(theta);
  const asinArgument = z / outerRadius;
  const asinTolerance = 32 * Number.EPSILON;
  if (Math.abs(asinArgument) > 1 + asinTolerance) {
    return { error: { code: 'ASIN_OUT_OF_RANGE', detail: `${context}: |z/rho| exceeds 1` } };
  }
  // Only floating-point boundary overshoot is normalized; actual out-of-surface stations fail.
  const psi = Math.asin(Math.max(-1, Math.min(1, asinArgument)));
  const meridianRadius = elbowRadius + outerRadius * Math.cos(psi);
  const discriminant = meridianRadius * meridianRadius - y * y;
  const intersectionTolerance = 64 * Number.EPSILON * Math.max(1, meridianRadius * meridianRadius, y * y);
  if (discriminant < -intersectionTolerance) {
    return { error: { code: 'NO_INTERSECTION', detail: `${context}: rMer² - y² is negative` } };
  }
  // At a tangent, tiny negative discriminants from rounding represent zero.
  const x = Math.sqrt(Math.max(0, discriminant));
  const phi = Math.atan2(y, x);
  if (![y, z, psi, meridianRadius, x, phi].every(Number.isFinite)) {
    return { error: { code: 'NON_FINITE_RESULT', detail: `${context}: non-finite surface coordinate` } };
  }
  return { point: { psi, meridianRadius, x, phi } };
}

export function computeBranchOnElbow(input: BranchOnElbowInput): BranchOnElbowResult {
  const {
    elbowCentrelineRadiusMm: elbowRadius,
    elbowOuterDiameterMm: elbowDiameter,
    branchInnerDiameterMm: innerDiameter,
    branchOuterDiameterMm: outerDiameter,
    axisHeightMm: axisHeight,
    referenceLengthMm: referenceLength,
    divisions, datum,
  } = input;
  const outerRadius = elbowDiameter / 2;
  const cutRadius = input.branchCutReferenceRadiusMm ?? outerDiameter / 2;
  const holeRadius = input.holeReferenceRadiusMm ?? innerDiameter / 2;
  const developmentRadius = input.developmentRadiusMm ?? outerDiameter / 2;
  for (const [name, value] of [
    ['elbowCentrelineRadiusMm', elbowRadius], ['elbowOuterDiameterMm', elbowDiameter],
    ['branchInnerDiameterMm', innerDiameter], ['branchOuterDiameterMm', outerDiameter],
    ['axisHeightMm', axisHeight], ['referenceLengthMm', referenceLength],
    ['branchCutReferenceRadiusMm', cutRadius], ['holeReferenceRadiusMm', holeRadius],
    ['developmentRadiusMm', developmentRadius],
  ] as const) {
    if (!Number.isFinite(value)) {
      return invalid({ code: 'NON_FINITE_INPUT', detail: `${name} must be finite` });
    }
  }
  if ([elbowRadius, elbowDiameter, outerRadius, innerDiameter, outerDiameter, cutRadius, holeRadius, developmentRadius].some(value => value <= 0)) {
    return invalid({ code: 'NON_POSITIVE_DIMENSION', detail: 'all radii and diameters must be positive' });
  }
  if (innerDiameter >= outerDiameter) {
    return invalid({ code: 'INNER_EXCEEDS_OUTER', detail: 'branch inner diameter must be less than outer diameter' });
  }
  if (!Number.isInteger(divisions) || divisions < 4 || divisions > 720) {
    return invalid({ code: 'INVALID_DIVISIONS', detail: 'divisions must be an integer in [4, 720]' });
  }
  if (!datum || !['EJE', 'BOP', 'TOP', 'FE'].includes(datum.type)) {
    return invalid({ code: 'INVALID_DATUM', detail: 'datum must be EJE, BOP, TOP or FE' });
  }
  if (datum.type === 'FE' && !Number.isFinite(datum.fe)) {
    return invalid({ code: 'NON_FINITE_INPUT', detail: 'datum.fe must be finite' });
  }
  const datumOffset = datum.type === 'EJE' ? 0
    : datum.type === 'BOP' ? -(elbowDiameter - outerDiameter) / 2
    : datum.type === 'TOP' ? (elbowDiameter - outerDiameter) / 2
    : datum.fe;
  if (!Number.isFinite(datumOffset)) {
    return invalid({ code: 'NON_FINITE_RESULT', detail: 'datum offset is not finite' });
  }
  if (Math.abs(datumOffset) > outerRadius) {
    return invalid({ code: 'OFFSET_OUT_OF_RANGE', detail: '|datum offset| exceeds elbow outer radius' });
  }
  const developedCircumference = 2 * Math.PI * developmentRadius;
  const stationSpacing = developedCircumference / divisions;
  if (![developedCircumference, stationSpacing].every(Number.isFinite)) {
    return invalid({ code: 'NON_FINITE_RESULT', detail: 'development is not finite' });
  }
  const centre = sampleSurface(elbowRadius, outerRadius, axisHeight, datumOffset, 0, 0, 'axis');
  if (centre.error) return invalid(centre.error);
  const { psi: psi0, meridianRadius: meridianRadius0, phi: phi0 } = centre.point;
  const cotaX = outerRadius * psi0;
  const cotaY = meridianRadius0 * (Math.PI / 2 - phi0);
  const stations: BranchOnElbowStation[] = [];
  for (let index = 0; index <= divisions; index++) {
    const theta = index * 2 * Math.PI / divisions;
    const hole = sampleSurface(elbowRadius, outerRadius, axisHeight, datumOffset, holeRadius, theta, `hole station ${index}`);
    if (hole.error) return invalid(hole.error);
    const cut = sampleSurface(elbowRadius, outerRadius, axisHeight, datumOffset, cutRadius, theta, `cut station ${index}`);
    if (cut.error) return invalid(cut.error);
    const station: BranchOnElbowStation = {
      index, thetaDeg: index * 360 / divisions, arcPosition: index * stationSpacing,
      cutOrdinate: referenceLength + elbowRadius - cut.point.x,
      picajeX: -outerRadius * (hole.point.psi - psi0),
      picajeY: hole.point.meridianRadius * (hole.point.phi - phi0),
    };
    if (![station.arcPosition, station.cutOrdinate, station.picajeX, station.picajeY].every(Number.isFinite)) {
      return invalid({ code: 'NON_FINITE_RESULT', detail: `station ${index}: non-finite output` });
    }
    stations.push(station);
  }
  if (![cotaX, cotaY].every(Number.isFinite)) {
    return invalid({ code: 'NON_FINITE_RESULT', detail: 'non-finite axis reference' });
  }
  return {
    valid: true, errors: [], cotaX, cotaY, stationCount: stations.length,
    angularStepDeg: 360 / divisions, developedCircumference, stationSpacing,
    datumOffsetMm: datumOffset, stations,
  };
}
