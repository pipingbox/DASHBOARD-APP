/* ───────────────────────────────────────────────────────────────────────────
   Branch (tube→tube) intersection geometry — canonical pure engine.

   H-001 / PB-BETA-HARDENING-001. Replaces the degenerate inline
   computeIntersection() of BranchLayoutTool.tsx, which reduced to
   h = r·cosθ/tanβ because its two header-dependent terms cancelled
   exactly (term2 ≡ term3), making the header radius vanish from the result.

   Model (cylinder–cylinder intersection, header axis = x):
     q(θ) = sqrt(R² − r²·sin²θ)
     s(θ) = [ q(θ) − r·cosθ·cosβ ] / sinβ
   s(θ) is the axial distance along the branch from the axis intersection
   point to the cut point. Header picaje (hole marking on the run):
     X(θ) = −R·asin( (rHole/R)·sinθ )         developed arc on the header
     Y(θ) = (R − qHole(θ))·cosβ/sinβ + rHole·cosθ/sinβ

   Reference-surface convention — SET-ON / branch resting on the header OD
   (PO final hardening GO, correction D1). The model keeps every reference
   EXPLICIT and separate; no single "intersectionReferenceRadius" is shared
   between the cut and the hole:
     branchCutReferenceRadius  (default branchOuterDiameter / 2)
       — the branch OD is cut to sit ON the header OD (set-on).
     headerHoleReferenceRadius (default branchInnerDiameter / 2)
       — the header opening is marked from the branch ID.
     developmentRadius         (default branchOuterDiameter / 2)
       — the paper template wraps the branch OD: π × branch OD.
   All three are parameters; the engine bakes nothing in.

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
  /** Header (run) outside radius R — mm. The branch rests on the header OD (set-on). */
  headerOuterRadius: number;
  /** Branch outside diameter d.ex — mm. */
  branchOuterDiameter: number;
  /** Branch inside diameter d.in — mm. */
  branchInnerDiameter: number;
  /**
   * Radius used to compute the BRANCH CUT profile (set-on saddle) — mm.
   * Default: branchOuterDiameter / 2 (branch OD against header OD).
   */
  branchCutReferenceRadius?: number;
  /**
   * Radius used to compute the HEADER HOLE opening (picaje) — mm.
   * Default: branchInnerDiameter / 2.
   */
  headerHoleReferenceRadius?: number;
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
    branchOuterRadius: number;
    branchInnerRadius: number;
    branchCutReferenceRadius: number;
    headerHoleReferenceRadius: number;
    developmentRadius: number;
    betaDeg: number;
    divisions: number;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function computeBranchIntersection(input: BranchIntersectionInput): BranchIntersectionResult {
  const errors: BranchGeometryError[] = [];
  const rCut = input.branchCutReferenceRadius ?? input.branchOuterDiameter / 2;
  const rHole = input.headerHoleReferenceRadius ?? input.branchInnerDiameter / 2;
  const rDev = input.developmentRadius ?? input.branchOuterDiameter / 2;
  const betaMin = input.betaMinDeg ?? BETA_MIN_DEG;

  const dims: [string, number][] = [
    ['headerOuterRadius', input.headerOuterRadius],
    ['branchOuterDiameter', input.branchOuterDiameter],
    ['branchInnerDiameter', input.branchInnerDiameter],
    ['branchCutReferenceRadius', rCut],
    ['headerHoleReferenceRadius', rHole],
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
    return emptyResult(errors, rCut, rHole, rDev, input);
  }

  if (input.headerOuterRadius <= 0 || input.branchOuterDiameter <= 0 || input.branchInnerDiameter <= 0 || rCut <= 0 || rHole <= 0 || rDev <= 0) {
    errors.push({ code: 'NON_POSITIVE_DIMENSION', detail: 'all radii/diameters must be > 0' });
  }
  if (input.branchInnerDiameter >= input.branchOuterDiameter) {
    errors.push({ code: 'INNER_EXCEEDS_OUTER', detail: 'branch ID must be smaller than branch OD' });
  }
  // Geometric fabricability: BOTH the cut circle (set-on) and the hole circle
  // must fit on the header. Equality is allowed (equal nominal sizes at 90°
  // are physically defined).
  for (const [name, r] of [['branchCutReferenceRadius', rCut], ['headerHoleReferenceRadius', rHole]] as const) {
    if (r > input.headerOuterRadius) {
      errors.push({
        code: 'REFERENCE_RADIUS_EXCEEDS_HEADER',
        detail: `${name} ${r} mm exceeds header radius ${input.headerOuterRadius} mm`,
      });
    }
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
    return emptyResult(errors, rCut, rHole, rDev, input);
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
    // Validity established above: rCut, rHole <= R, so the sqrt/asin arguments
    // are mathematically in range; clamp only residual floating-point overshoot.
    // Branch cut (set-on): branch OD profile against the header OD.
    const qCut = Math.sqrt(Math.max(0, R * R - rCut * rCut * sinT * sinT));
    const s = (qCut - rCut * cosT * cosBeta) / sinBeta;
    // Header hole (picaje): opening marked from the branch ID.
    const qHole = Math.sqrt(Math.max(0, R * R - rHole * rHole * sinT * sinT));
    const asinArg = clamp((rHole / R) * sinT, -1, 1);
    const picajeX = -R * Math.asin(asinArg);
    const picajeY = ((R - qHole) * cosBeta) / sinBeta + (rHole * cosT) / sinBeta;
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
      return emptyResult(errors, rCut, rHole, rDev, input);
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
      branchOuterRadius: input.branchOuterDiameter / 2,
      branchInnerRadius: input.branchInnerDiameter / 2,
      branchCutReferenceRadius: rCut,
      headerHoleReferenceRadius: rHole,
      developmentRadius: rDev,
      betaDeg: input.betaDeg,
      divisions: N,
    },
  };
}

function emptyResult(
  errors: BranchGeometryError[],
  rCut: number,
  rHole: number,
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
      branchOuterRadius: input.branchOuterDiameter / 2,
      branchInnerRadius: input.branchInnerDiameter / 2,
      branchCutReferenceRadius: rCut,
      headerHoleReferenceRadius: rHole,
      developmentRadius: rDev,
      betaDeg: input.betaDeg,
      divisions: input.divisions,
    },
  };
}
