/* ───────────────────────────────────────────────────────────────────────────
   Branch (tube→tube) intersection geometry — canonical pure engine.

   H-001 / PB-BETA-HARDENING-001. Replaces the degenerate inline
   computeIntersection() of BranchLayoutTool.tsx, which reduced to
   h = r·cosθ/tanβ because its two header-dependent terms cancelled
   exactly (term2 ≡ term3), making the header radius vanish from the result.

   Model (cylinder–cylinder intersection, header axis = z):
     q(θ) = sqrt(R² − r²·sin²θ)
     s(θ) = [ q(θ) − r·cosθ·cosβ ] / sinβ
   s(θ) is the axial distance along the branch from the axis intersection
   point to the cut point. Header picaje (hole marking on the run):
     X(θ) = −R·asin( (r/R)·sinθ )            developed arc on the header
     Y(θ) = (R − q(θ))·cosβ/sinβ + r·cosθ/sinβ

   Reference-surface convention (PO D1, GO CONDITIONED — labelled, not a
   universal fabrication truth):
     intersection/contact reference = branch INNER radius (hole lets the
       branch through, weld closes the bevel);
     developed circumference          = branch OUTER diameter (the paper
       template wraps the outside of the pipe).
   Both are explicit parameters; the engine does not bake the convention in.

   Numerical rules (PO): no tan(90°); cotβ as cosβ/sinβ after validating
   sinβ; asin argument clamped to [-1, 1] ONLY after geometric validity has
   been established (clamping never hides an impossible geometry).
   ─────────────────────────────────────────────────────────────────────────── */

/** Public V1 beta range (PO D4). */
export const BETA_MIN_DEG = 15;
export const BETA_MAX_DEG = 90;

export type BranchGeometryErrorCode =
  | 'NON_FINITE_INPUT'
  | 'NON_POSITIVE_DIMENSION'
  | 'INNER_EXCEEDS_OUTER'
  | 'REFERENCE_RADIUS_EXCEEDS_HEADER'
  | 'BETA_OUT_OF_RANGE'
  | 'INVALID_DIVISIONS'
  | 'REFERENCE_LENGTH_TOO_SHORT';

export interface BranchGeometryError {
  code: BranchGeometryErrorCode;
  detail: string;
}

export interface BranchIntersectionInput {
  /** Header (run) outside radius R — mm. The intersection happens on the header outer surface. */
  headerOuterRadius: number;
  /** Branch outside diameter d.ex — mm. */
  branchOuterDiameter: number;
  /** Branch inside diameter d.in — mm. */
  branchInnerDiameter: number;
  /**
   * Radius of the surface used to compute the intersection/contact profile — mm.
   * Default: branchInnerDiameter / 2 (PO D1 initial convention).
   */
  intersectionReferenceRadius?: number;
  /**
   * Radius whose circumference sets the physical template width and station
   * spacing — mm. Default: branchOuterDiameter / 2 (template wraps the OD).
   */
  developmentRadius?: number;
  /** Angle between branch and header axes — degrees, [betaMinDeg, 90]. */
  betaDeg: number;
  /** Public minimum beta — degrees. Default BETA_MIN_DEG (15). */
  betaMinDeg?: number;
  /** Marking divisions around the branch circumference (N). Integer ≥ 4. */
  divisions: number;
  /**
   * Optional absolute branch length L — mm, measured from the square-cut
   * straight end of the pipe. If present, stations include markFromEnd = L − s(θ).
   * Must satisfy L > max(s(θ)) so every mark is positive.
   */
  referenceLength?: number;
}

export interface BranchStation {
  /** 0..N — station N is the 360° closure and repeats station 0. */
  index: number;
  thetaDeg: number;
  /** Physical circumferential position on the development — mm (i · spacing). */
  arcPosition: number;
  /** Cut ordinate s(θ) — mm along the branch axis from the axis intersection. */
  cutOrdinate: number;
  /** Relative ordinate s(θ) − min(s) — mm. Template mode, no L required. */
  relativeOrdinate: number;
  /** L − s(θ) — mm from the square-cut pipe end. Present only with referenceLength. */
  markFromEnd?: number;
  /** Header picaje X — developed arc coordinate on the header — mm. */
  picajeX: number;
  /** Header picaje Y — axial coordinate along the header — mm. */
  picajeY: number;
}

export interface BranchIntersectionResult {
  valid: boolean;
  errors: BranchGeometryError[];
  /** N+1 stations (closure included). Empty when !valid. */
  stations: BranchStation[];
  /** Physical developed circumference 2π·developmentRadius — mm. */
  developedCircumference: number;
  /** Physical spacing between stations — mm. */
  stationSpacing: number;
  /** Angular step 360/N — degrees. */
  angularStepDeg: number;
  minCutOrdinate: number;
  maxCutOrdinate: number;
  /** Echo of the resolved radii actually used (mm), for artifact stamping. */
  resolved: {
    headerOuterRadius: number;
    intersectionReferenceRadius: number;
    developmentRadius: number;
    betaDeg: number;
    divisions: number;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function computeBranchIntersection(input: BranchIntersectionInput): BranchIntersectionResult {
  const errors: BranchGeometryError[] = [];
  const rRef = input.intersectionReferenceRadius ?? input.branchInnerDiameter / 2;
  const rDev = input.developmentRadius ?? input.branchOuterDiameter / 2;
  const betaMin = input.betaMinDeg ?? BETA_MIN_DEG;

  const dims: [string, number][] = [
    ['headerOuterRadius', input.headerOuterRadius],
    ['branchOuterDiameter', input.branchOuterDiameter],
    ['branchInnerDiameter', input.branchInnerDiameter],
    ['intersectionReferenceRadius', rRef],
    ['developmentRadius', rDev],
    ['betaDeg', input.betaDeg],
  ];
  for (const [name, v] of dims) {
    if (!Number.isFinite(v)) errors.push({ code: 'NON_FINITE_INPUT', detail: `${name} must be finite` });
  }
  if (input.referenceLength !== undefined && !Number.isFinite(input.referenceLength)) {
    errors.push({ code: 'NON_FINITE_INPUT', detail: 'referenceLength must be finite' });
  }
  if (errors.length > 0) {
    return emptyResult(errors, rRef, rDev, input);
  }

  if (input.headerOuterRadius <= 0 || input.branchOuterDiameter <= 0 || input.branchInnerDiameter <= 0 || rRef <= 0 || rDev <= 0) {
    errors.push({ code: 'NON_POSITIVE_DIMENSION', detail: 'all radii/diameters must be > 0' });
  }
  if (input.branchInnerDiameter >= input.branchOuterDiameter) {
    errors.push({ code: 'INNER_EXCEEDS_OUTER', detail: 'branch ID must be smaller than branch OD' });
  }
  // Geometric fabricability: the contact circle must fit on the header.
  // Equality is allowed (equal nominal sizes at 90° are physically defined).
  if (rRef > input.headerOuterRadius) {
    errors.push({
      code: 'REFERENCE_RADIUS_EXCEEDS_HEADER',
      detail: `intersection reference radius ${rRef} mm exceeds header radius ${input.headerOuterRadius} mm`,
    });
  }
  const betaRad = (input.betaDeg * Math.PI) / 180;
  if (input.betaDeg < betaMin || input.betaDeg > BETA_MAX_DEG) {
    errors.push({ code: 'BETA_OUT_OF_RANGE', detail: `beta must be within [${betaMin}, ${BETA_MAX_DEG}] deg` });
  }
  const N = input.divisions;
  if (!Number.isInteger(N) || N < 4 || N > 720) {
    errors.push({ code: 'INVALID_DIVISIONS', detail: 'divisions must be an integer in [4, 720]' });
  }
  if (errors.length > 0) {
    return emptyResult(errors, rRef, rDev, input);
  }

  const R = input.headerOuterRadius;
  const sinBeta = Math.sin(betaRad); // > 0: beta in (0, 90] validated above
  const cosBeta = Math.cos(betaRad); // = 0 at 90°, used directly — no tan/cot instability

  const developedCircumference = 2 * Math.PI * rDev;
  const stationSpacing = developedCircumference / N;

  const stations: BranchStation[] = [];
  let minCut = Infinity;
  let maxCut = -Infinity;

  for (let i = 0; i <= N; i++) {
    const theta = (i * 2 * Math.PI) / N;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    // Validity established above: rRef <= R, so the sqrt/asin arguments are
    // mathematically in range; clamp only residual floating-point overshoot.
    const q = Math.sqrt(Math.max(0, R * R - rRef * rRef * sinT * sinT));
    const s = (q - rRef * cosT * cosBeta) / sinBeta;
    const asinArg = clamp((rRef / R) * sinT, -1, 1);
    const picajeX = -R * Math.asin(asinArg);
    const picajeY = ((R - q) * cosBeta) / sinBeta + (rRef * cosT) / sinBeta;
    if (s < minCut) minCut = s;
    if (s > maxCut) maxCut = s;
    stations.push({
      index: i,
      thetaDeg: (i * 360) / N,
      arcPosition: i * stationSpacing,
      cutOrdinate: s,
      relativeOrdinate: 0, // filled below once minCut is known
      picajeX,
      picajeY,
    });
  }

  for (const st of stations) {
    st.relativeOrdinate = st.cutOrdinate - minCut;
  }

  if (input.referenceLength !== undefined) {
    if (input.referenceLength <= maxCut) {
      errors.push({
        code: 'REFERENCE_LENGTH_TOO_SHORT',
        detail: `referenceLength ${input.referenceLength} mm must be greater than max cut ordinate ${maxCut.toFixed(2)} mm`,
      });
      return emptyResult(errors, rRef, rDev, input);
    }
    for (const st of stations) {
      st.markFromEnd = input.referenceLength - st.cutOrdinate;
    }
  }

  return {
    valid: true,
    errors: [],
    stations,
    developedCircumference,
    stationSpacing,
    angularStepDeg: 360 / N,
    minCutOrdinate: minCut,
    maxCutOrdinate: maxCut,
    resolved: {
      headerOuterRadius: R,
      intersectionReferenceRadius: rRef,
      developmentRadius: rDev,
      betaDeg: input.betaDeg,
      divisions: N,
    },
  };
}

function emptyResult(
  errors: BranchGeometryError[],
  rRef: number,
  rDev: number,
  input: BranchIntersectionInput,
): BranchIntersectionResult {
  return {
    valid: false,
    errors,
    stations: [],
    developedCircumference: 0,
    stationSpacing: 0,
    angularStepDeg: 0,
    minCutOrdinate: 0,
    maxCutOrdinate: 0,
    resolved: {
      headerOuterRadius: input.headerOuterRadius,
      intersectionReferenceRadius: rRef,
      developmentRadius: rDev,
      betaDeg: input.betaDeg,
      divisions: input.divisions,
    },
  };
}
