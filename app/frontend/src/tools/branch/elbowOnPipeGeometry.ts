/**
 * CODO → TUBO — elbow seated on a straight receiver pipe. Pure geometry kernel.
 *
 * COORDINATE FRAME (all lengths in mm)
 *
 *   Receiver pipe (colector): radius rho = D / 2, axis horizontal and taken as
 *   the origin line of the frame.
 *     Xg  horizontal, perpendicular to the receiver axis (lateral direction)
 *     Yg  vertical, positive upwards, zero on the receiver axis
 *     Zg  along the receiver axis
 *   Upper receiver surface, the side the elbow sits on:
 *     Yg = sqrt(rho^2 - Xg^2)
 *
 *   Elbow: torus of centreline radius R, inner section radius r_in = d.in / 2
 *   and outer section radius r_ex = d.ex / 2. Its bend plane is vertical and
 *   parallel to the receiver axis, laterally displaced by the signed datum
 *   offset e; the torus axis is therefore horizontal and parallel to Xg, and
 *   the torus centre O sits at (Xg, Yg, Zg) = (e, seatingHeight, 0).
 *
 *   Station angle psi sweeps the elbow section: psi = 0 is the extrados
 *   (meridional radius R + r), psi = pi is the intrados (R - r). The section's
 *   lateral component is r * sin(psi), so a station lies at
 *     x(psi) = e + r_in * sin(psi)
 *   on the ID contour. This orientation, together with
 *   PicajeX = rho * [asin(e / rho) - asin(x / rho)], is the same station
 *   orientation already used by the tube-on-elbow kernel, so both branch
 *   families share one station convention.
 *
 *   Bend angle t runs from the elbow end whose tube axis is vertical (t = 0) to
 *   the end whose tube axis is horizontal (t = pi / 2). A surface point is
 *     Xg = e + r * sin(psi)
 *     Yg = seatingHeight - m(psi) * sin(t)
 *     Zg = m(psi) * cos(t)            with m(psi) = R + r * cos(psi)
 *   so t = pi / 2 is the physical end face of the elbow (plane Zg = 0) and the
 *   finite elbow exists only for t in [0, pi / 2]. Picaje Y is measured along
 *   the receiver axis from the vertical plane that contains the axis of the
 *   elbow's other (t = 0) leg, hence PicajeY = R - m * cos(t).
 *
 * FABRICATION CONVENTION (SET-ON)
 *
 *   Hole / picaje contour and the seating intersection use the elbow ID radius
 *   r_in. External marking outputs (arc radius, arc length, station pitch) use
 *   the elbow OD radius r_ex, matching the existing PIPINGBOX SET-ON rule:
 *   hole reference = member ID, external development reference = member OD.
 *
 * Every station exposes ONE physical point: Picaje X, Picaje Y, the bend angle
 * t, the arc outputs and the clamp state all share the same station phase.
 */

export type ElbowOnPipeDatum =
  | { type: 'EJE' }
  | { type: 'BOP' }
  | { type: 'TOP' }
  | { type: 'FE'; fe: number };

export interface ElbowOnPipeInput {
  /** Elbow bore diameter d.in. Drives the hole contour and the seating intersection. */
  elbowInnerDiameterMm: number;
  /** Elbow outside diameter d.ex. Drives arc radius, arc length and station pitch. */
  elbowOuterDiameterMm: number;
  /** Elbow centreline bend radius R. */
  elbowCentrelineRadiusMm: number;
  /** Receiver (header) outside diameter D. */
  receiverOuterDiameterMm: number;
  /** Station count N. Stations 0..N are returned, station N closing station 0. */
  divisions: number;
  datum: ElbowOnPipeDatum;
}

export type ElbowOnPipeErrorCode =
  | 'NON_FINITE_INPUT'
  | 'NON_POSITIVE_DIMENSION'
  | 'INNER_EXCEEDS_OUTER'
  | 'ELBOW_EXCEEDS_RECEIVER'
  | 'ELBOW_RADIUS_TOO_SMALL'
  | 'INVALID_DIVISIONS'
  | 'INVALID_DATUM'
  | 'OFFSET_OUT_OF_RANGE'
  | 'ASIN_OUT_OF_RANGE'
  | 'NO_INTERSECTION'
  | 'NON_FINITE_RESULT';

export interface ElbowOnPipeError {
  code: ElbowOnPipeErrorCode;
  detail: string;
}

export interface ElbowOnPipeStation {
  index: number;
  angleRad: number;
  angleDeg: number;
  /** Developed position around the elbow OD, index * stationSpacingMm. */
  arcPositionMm: number;
  /** Lateral coordinate x of the ID contour on the receiver, from the receiver mid-plane. */
  sectionCoordinateMm: number;
  /** Arc distance on the receiver circumference, from the datum generatrix. */
  picajeXMm: number;
  /** Distance along the receiver axis from the t = 0 leg axis plane. */
  picajeYMm: number;
  innerMeridionalRadiusMm: number;
  outerMeridionalRadiusMm: number;
  bendAngleRad: number;
  bendAngleDeg: number;
  /** Radio arco: OD meridional radius at this station. */
  arcRadiusMm: number;
  /** Longitud arco: OD meridional radius times the bend angle. */
  arcLengthMm: number;
  /** True when the cut reaches the physical 90 degree end face of the elbow. */
  clampedAtElbowEnd: boolean;
}

export interface ElbowOnPipeResult {
  valid: boolean;
  errors: ElbowOnPipeError[];
  datum: ElbowOnPipeDatum;
  /** Signed lateral offset e of the elbow bend plane from the receiver mid-plane. */
  datumOffsetMm: number;
  /** Cota X': arc distance on the receiver from its crown to the datum generatrix. */
  cotaXMm: number;
  /** Height of the torus centre O above the receiver axis. */
  seatingHeightMm: number;
  /** Developed elbow OD circumference. */
  circumferenceMm: number;
  /** Div: circumferenceMm / divisions. */
  stationSpacingMm: number;
  angularStepRad: number;
  angularStepDeg: number;
  divisions: number;
  /** Number of returned stations, divisions + 1 including the closing station. */
  stationCount: number;
  stations: ElbowOnPipeStation[];
}

/** asin argument overshoot that is pure floating-point noise at a tangency. */
const ASIN_DOMAIN_TOLERANCE = 32 * Number.EPSILON;
/**
 * The seating condition makes sin(t) exactly 1 at the intrados station, so a
 * value within this relative distance of 1 IS that tangency and must report the
 * finite-elbow boundary rather than an angle marginally below 90 degrees.
 */
const TANGENCY_TOLERANCE = 1e-12;
/** Negative sin(t) within this band is rounding at the t = 0 boundary, not a miss. */
const BEND_ANGLE_TOLERANCE = 1e-12;

function invalid(datum: ElbowOnPipeDatum, error: ElbowOnPipeError): ElbowOnPipeResult {
  return {
    valid: false, errors: [error], datum, datumOffsetMm: 0, cotaXMm: 0, seatingHeightMm: 0,
    circumferenceMm: 0, stationSpacingMm: 0, angularStepRad: 0, angularStepDeg: 0,
    divisions: 0, stationCount: 0, stations: [],
  };
}

export function computeElbowOnPipe(input: ElbowOnPipeInput): ElbowOnPipeResult {
  const {
    elbowInnerDiameterMm: innerDiameter,
    elbowOuterDiameterMm: outerDiameter,
    elbowCentrelineRadiusMm: elbowRadius,
    receiverOuterDiameterMm: receiverDiameter,
    divisions, datum,
  } = input;
  if (!datum || !['EJE', 'BOP', 'TOP', 'FE'].includes(datum.type)) {
    return invalid(datum, { code: 'INVALID_DATUM', detail: 'datum must be EJE, BOP, TOP or FE' });
  }
  for (const [name, value] of [
    ['elbowInnerDiameterMm', innerDiameter], ['elbowOuterDiameterMm', outerDiameter],
    ['elbowCentrelineRadiusMm', elbowRadius], ['receiverOuterDiameterMm', receiverDiameter],
  ] as const) {
    if (!Number.isFinite(value)) {
      return invalid(datum, { code: 'NON_FINITE_INPUT', detail: `${name} must be finite` });
    }
  }
  if (datum.type === 'FE' && !Number.isFinite(datum.fe)) {
    return invalid(datum, { code: 'NON_FINITE_INPUT', detail: 'datum.fe must be finite' });
  }
  if ([innerDiameter, outerDiameter, elbowRadius, receiverDiameter].some(value => value <= 0)) {
    return invalid(datum, { code: 'NON_POSITIVE_DIMENSION', detail: 'all diameters and radii must be positive' });
  }
  if (innerDiameter >= outerDiameter) {
    return invalid(datum, { code: 'INNER_EXCEEDS_OUTER', detail: 'elbow inner diameter must be less than outer diameter' });
  }
  if (outerDiameter > receiverDiameter) {
    return invalid(datum, { code: 'ELBOW_EXCEEDS_RECEIVER', detail: 'SET-ON family requires receiver diameter >= elbow outer diameter' });
  }
  const rho = receiverDiameter / 2;
  const innerRadius = innerDiameter / 2;
  const outerRadius = outerDiameter / 2;
  if (elbowRadius <= outerRadius) {
    return invalid(datum, { code: 'ELBOW_RADIUS_TOO_SMALL', detail: 'elbow centreline radius must exceed the elbow outer section radius' });
  }
  if (!Number.isInteger(divisions) || divisions < 4 || divisions > 720) {
    return invalid(datum, { code: 'INVALID_DIVISIONS', detail: 'divisions must be an integer in [4, 720]' });
  }
  // Tubero's codo→tubo datum signs: BOP displaces the bend plane towards +X,
  // TOP towards -X, and a positive Cota Fe is measured in the -X direction.
  const halfClearance = (receiverDiameter - outerDiameter) / 2;
  const offset = datum.type === 'EJE' ? 0
    : datum.type === 'BOP' ? halfClearance
    : datum.type === 'TOP' ? -halfClearance
    : -datum.fe;
  if (!Number.isFinite(offset)) {
    return invalid(datum, { code: 'NON_FINITE_RESULT', detail: 'datum offset is not finite' });
  }
  // The elbow must stay inside the receiver footprint: |e| <= (D - d.ex) / 2.
  if (Math.abs(offset) > halfClearance) {
    return invalid(datum, { code: 'OFFSET_OUT_OF_RANGE', detail: '|datum offset| exceeds (D - d.ex) / 2' });
  }
  const cotaXMm = rho * Math.asin(offset / rho);
  // Seating: the intrados of the 90 degree end face is tangent to the receiver,
  // i.e. seatingHeight - (R - r_in) = sqrt(rho^2 - e^2) on the datum generatrix.
  const seatingHeightMm = Math.sqrt(rho * rho - offset * offset) + elbowRadius - innerRadius;
  const circumferenceMm = Math.PI * outerDiameter;
  const stationSpacingMm = circumferenceMm / divisions;
  const angularStepRad = 2 * Math.PI / divisions;
  if (![cotaXMm, seatingHeightMm, circumferenceMm, stationSpacingMm].every(Number.isFinite)) {
    return invalid(datum, { code: 'NON_FINITE_RESULT', detail: 'global geometry is not finite' });
  }
  const datumAsin = Math.asin(offset / rho);
  const stations: ElbowOnPipeStation[] = [];
  for (let index = 0; index <= divisions; index++) {
    const psi = index * angularStepRad;
    const x = offset + innerRadius * Math.sin(psi);
    const innerMeridionalRadiusMm = elbowRadius + innerRadius * Math.cos(psi);
    const outerMeridionalRadiusMm = elbowRadius + outerRadius * Math.cos(psi);
    const asinArgument = x / rho;
    if (Math.abs(asinArgument) > 1 + ASIN_DOMAIN_TOLERANCE) {
      return invalid(datum, { code: 'ASIN_OUT_OF_RANGE', detail: `station ${index}: |x / rho| exceeds 1` });
    }
    const clampedAsin = Math.max(-1, Math.min(1, asinArgument));
    // Receiver surface height under this station, measured from the receiver
    // axis. The asin guard above already bounds |x| by rho, so only tangency
    // rounding can make the discriminant marginally negative.
    const receiverSurfaceY = Math.sqrt(Math.max(0, rho * rho - x * x));
    const sine = (seatingHeightMm - receiverSurfaceY) / innerMeridionalRadiusMm;
    if (sine < -BEND_ANGLE_TOLERANCE) {
      return invalid(datum, {
        code: 'NO_INTERSECTION',
        detail: `station ${index}: elbow meridian starts below the receiver surface`,
      });
    }
    // Finite elbow: beyond sin(t) = 1 the unconstrained intersection lies past
    // the physical 90 degree end face, so the cut is that end face itself.
    const clampedAtElbowEnd = sine >= 1 - TANGENCY_TOLERANCE;
    const bendAngleRad = clampedAtElbowEnd ? Math.PI / 2 : Math.asin(Math.max(0, sine));
    const station: ElbowOnPipeStation = {
      index,
      angleRad: psi,
      angleDeg: index * 360 / divisions,
      arcPositionMm: index * stationSpacingMm,
      sectionCoordinateMm: x,
      picajeXMm: rho * (datumAsin - Math.asin(clampedAsin)),
      picajeYMm: elbowRadius - innerMeridionalRadiusMm * Math.cos(bendAngleRad),
      innerMeridionalRadiusMm,
      outerMeridionalRadiusMm,
      bendAngleRad,
      bendAngleDeg: bendAngleRad * 180 / Math.PI,
      arcRadiusMm: outerMeridionalRadiusMm,
      arcLengthMm: outerMeridionalRadiusMm * bendAngleRad,
      clampedAtElbowEnd,
    };
    if (![station.picajeXMm, station.picajeYMm, station.bendAngleRad, station.arcRadiusMm, station.arcLengthMm]
      .every(Number.isFinite)) {
      return invalid(datum, { code: 'NON_FINITE_RESULT', detail: `station ${index}: non-finite output` });
    }
    stations.push(station);
  }
  return {
    valid: true, errors: [], datum, datumOffsetMm: offset, cotaXMm, seatingHeightMm,
    circumferenceMm, stationSpacingMm, angularStepRad, angularStepDeg: 360 / divisions,
    divisions, stationCount: stations.length, stations,
  };
}
