/* ───────────────────────────────────────────────────────────────────────────
   CODO→TUBO explanatory schematic — pure generator, U5.3.

   Purpose: make the INPUTS and the datum convention of this family
   understandable. Explanatory screen diagram, NOT a fabrication drawing and NOT
   the later physical output.

   It draws the quantities the user typed (R, D, d.ex, d.in) plus three globals
   that elbowOnPipeGeometry.ts (U5.1) already resolved — datumOffsetMm,
   seatingHeightMm and cotaXMm. It computes no intersection: no ψ, no bend angle
   t, no picaje coordinate, no arc output is derived here.

   Reference frame, as documented by elbowOnPipeGeometry.ts:
     · Receiver = cylinder of radius ρ = D/2, axis along Zg, Yg = 0 on the axis.
     · Elbow = torus of centreline radius R, centre O at (e, yΩ, 0), bend plane
       vertical and parallel to the receiver axis, laterally displaced by e.
     · Bend angle t runs from the end whose axis is vertical (t = 0, at Zg = R)
       to the end whose axis is horizontal (t = 90°, the plane Zg = 0). That
       plane IS the physical end face of the finite elbow.
     · yΩ is fixed by tangency of the intrados against the receiver surface.

   Left panel  = bend-plane elevation (R, D, yΩ, the 90° end face, the t = 0 leg
                 axis plane from which Picaje Y is measured).
   Right panel = receiver cross-section showing the datum ladder of THIS family
                 — BOP at e = +(D − d.ex)/2 and TOP at e = −(D − d.ex)/2, the
                 opposite sense of the tubo→codo panel — plus Cota X′.

   SCREEN PREVIEW ONLY — responsive, explanatory, not to scale for fabrication.
   ─────────────────────────────────────────────────────────────────────────── */

import { ELBOW_SVG, exactMm, px, responsiveSvg, svgText } from './branchOnElbowSvgUtils.ts';

export interface ElbowOnPipeSchematicInput {
  /** R — elbow centreline bend radius. */
  elbowCentrelineRadiusMm: number;
  /** d.ex — elbow outside diameter. */
  elbowOuterDiameterMm: number;
  /** d.in — elbow bore diameter. */
  elbowInnerDiameterMm: number;
  /** D — receiver outside diameter. */
  receiverOuterDiameterMm: number;
  /** Signed lateral offset e resolved by U5.1 (result.datumOffsetMm). */
  datumOffsetMm: number;
  /** yΩ resolved by U5.1 (result.seatingHeightMm). */
  seatingHeightMm: number;
  /** Cota X′ resolved by U5.1 (result.cotaXMm). */
  cotaXMm: number;
  /** Technical datum identifier: EJE | BOP | TOP | FE. */
  datumName: string;
}

export interface ElbowOnPipeSchematicLabels {
  title: string;
  elevation: string;
  section: string;
  elbow: string;
  receiver: string;
  endFace: string;
  legPlane: string;
  seating: string;
  cotaX: string;
  cotaY: string;
  datumOffset: string;
  screenPreviewNote: string;
  notToScale: string;
}

export interface ElbowOnPipeSchematicOptions {
  viewBoxWidth?: number;
  viewBoxHeight?: number;
  /** External positioning dimension, echoed as text only. Never geometry. */
  yPrimeMm?: number | null;
}

export interface ElbowOnPipeSchematicResult {
  svg: string;
  /** Uniform px per mm of the elevation panel. */
  elevationScale: number;
  /** Uniform px per mm of the section panel. */
  sectionScale: number;
}

export function buildElbowOnPipeSchematic(
  input: ElbowOnPipeSchematicInput,
  labels: ElbowOnPipeSchematicLabels,
  options: ElbowOnPipeSchematicOptions = {},
): ElbowOnPipeSchematicResult | null {
  const { elbowCentrelineRadiusMm: R, elbowOuterDiameterMm: dEx, elbowInnerDiameterMm: dIn } = input;
  const { receiverOuterDiameterMm: D, datumOffsetMm: e, seatingHeightMm: seating, cotaXMm: cotaX } = input;
  const rho = D / 2;
  const rEx = dEx / 2;
  const rIn = dIn / 2;
  if (![R, dEx, dIn, D, e, seating, cotaX].every(Number.isFinite)) return null;
  if (!(R > rEx) || !(rEx > rIn) || !(rIn > 0) || !(rho >= rEx)) return null;

  const W = options.viewBoxWidth ?? 940;
  const H = options.viewBoxHeight ?? 440;
  const splitX = 574;
  const parts: string[] = [];

  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${ELBOW_SVG.background}"/>`);
  parts.push(svgText(16, 20, labels.title, { size: 11, fill: ELBOW_SVG.text, weight: 'bold' }));
  parts.push(svgText(W - 16, 20, labels.screenPreviewNote, { size: 9, fill: ELBOW_SVG.faint, anchor: 'end' }));
  parts.push(svgText(W - 16, H - 8, labels.notToScale, { size: 9, fill: ELBOW_SVG.faint, anchor: 'end' }));

  /* ═══ Left panel — bend-plane elevation, axes (Zg → right, Yg → up) ═══ */
  const padLeft = 58;
  const padTop = 50;
  const availW = splitX - padLeft - 58;
  const availH = H - padTop - 62;
  const outer = R + rEx;
  const inner = R - rEx;
  const zMin = -0.3 * outer;
  const zMax = 1.12 * outer;
  const yMin = Math.min(-rho, seating - outer) - 0.06 * outer;
  const yMax = Math.max(rho, seating) + 0.06 * outer;
  const elevationScale = Math.min(availW / (zMax - zMin), availH / (yMax - yMin));
  const ez = (mm: number) => padLeft + (mm - zMin) * elevationScale;
  const ey = (mm: number) => padTop + (yMax - mm) * elevationScale;

  parts.push(svgText(padLeft, padTop - 14, labels.elevation, { size: 10, fill: ELBOW_SVG.muted }));

  /* Receiver seen from the side: a band of diameter D about its own axis. */
  parts.push(`<rect x="${px(ez(zMin))}" y="${px(ey(rho))}" width="${px((zMax - zMin) * elevationScale)}"`
    + ` height="${px(D * elevationScale)}" fill="${ELBOW_SVG.gridSoft}" stroke="${ELBOW_SVG.text}"`
    + ` stroke-width="1.2" data-receiver-band="true"/>`);
  parts.push(`<line x1="${px(ez(zMin))}" y1="${px(ey(0))}" x2="${px(ez(zMax))}" y2="${px(ey(0))}" stroke="${ELBOW_SVG.datum}" stroke-width="0.9" stroke-dasharray="10,3,2,3"/>`);
  parts.push(svgText(ez(zMin) + 6, ey(-rho) - 6, labels.receiver, { size: 9, fill: ELBOW_SVG.muted }));

  /* Elbow quarter bend: annulus between the inner and outer meridians, drawn in
     the quadrant Zg ≥ 0, Yg ≤ yΩ that the finite elbow occupies. The fill is
     translucent on purpose: this is the elbow BEFORE the saddle cut, so the band
     that overlaps the receiver is the material the picaje contour removes, and
     hiding the receiver there would make the two bodies look merely adjacent. */
  const ox = ez(0);
  const oy = ey(seating);
  const outerPx = outer * elevationScale;
  const innerPx = inner * elevationScale;
  parts.push(`<path d="M ${px(ox + outerPx)} ${px(oy)}`
    + ` A ${px(outerPx)} ${px(outerPx)} 0 0 1 ${px(ox)} ${px(oy + outerPx)}`
    + ` L ${px(ox)} ${px(oy + innerPx)}`
    + ` A ${px(innerPx)} ${px(innerPx)} 0 0 0 ${px(ox + innerPx)} ${px(oy)} Z"`
    + ` fill="${ELBOW_SVG.curve}" fill-opacity="0.16" stroke="${ELBOW_SVG.curve}" stroke-width="1.4" data-elbow-band="true"/>`);
  /* Elbow centreline, radius R. */
  parts.push(`<path d="M ${px(ox + R * elevationScale)} ${px(oy)} A ${px(R * elevationScale)} ${px(R * elevationScale)} 0 0 1 ${px(ox)} ${px(oy + R * elevationScale)}"`
    + ` fill="none" stroke="${ELBOW_SVG.datum}" stroke-width="0.9" stroke-dasharray="10,3,2,3"/>`);
  parts.push(svgText(ez(R * 0.72) , ey(seating - R * 0.3), labels.elbow, { size: 9, fill: ELBOW_SVG.curve }));

  /* The 90° end face IS the plane Zg = 0: the physical limit of the elbow. */
  parts.push(`<line x1="${px(ox)}" y1="${px(ey(seating - inner))}" x2="${px(ox)}" y2="${px(ey(seating - outer))}"`
    + ` stroke="${ELBOW_SVG.closure}" stroke-width="2.4" data-end-face="true"/>`);
  parts.push(`<line x1="${px(ox)}" y1="${px(ey(yMin))}" x2="${px(ox)}" y2="${px(ey(yMax))}" stroke="${ELBOW_SVG.closure}" stroke-width="0.7" stroke-dasharray="4,4"/>`);
  parts.push(svgText(ox - 5, padTop + 10, `${labels.endFace} · 90°`, { size: 9, fill: ELBOW_SVG.closure, anchor: 'end' }));

  /* The t = 0 leg axis plane at Zg = R: the origin of Picaje Y. */
  parts.push(`<line x1="${px(ez(R))}" y1="${px(ey(yMin))}" x2="${px(ez(R))}" y2="${px(ey(yMax))}" stroke="${ELBOW_SVG.faint}" stroke-width="0.8" stroke-dasharray="5,4" data-leg-plane="true"/>`);
  parts.push(svgText(ez(R) + 5, padTop + 10, labels.legPlane, { size: 8, fill: ELBOW_SVG.faint }));

  /* O marker and the yΩ dimension from the receiver axis up to O. */
  parts.push(`<circle cx="${px(ox)}" cy="${px(oy)}" r="2.8" fill="${ELBOW_SVG.datum}"/>`);
  parts.push(svgText(ox + 7, oy - 6, 'Ω', { size: 10, fill: ELBOW_SVG.datum }));
  parts.push(dimensionV(ez(zMax) - 16, ey(0), oy, `${labels.seating} ${seating.toFixed(1)}`));
  /* D on the receiver and R along the 45° meridian of the bend. */
  parts.push(dimensionV(ez(zMin) + 14, ey(rho), ey(-rho), `D ${D.toFixed(1)}`));
  const diag = Math.SQRT1_2;
  parts.push(`<line x1="${px(ox)}" y1="${px(oy)}" x2="${px(ez(R * diag))}" y2="${px(ey(seating - R * diag))}" stroke="${ELBOW_SVG.faint}" stroke-width="0.8" stroke-dasharray="4,3"/>`);
  parts.push(svgText(ez(R * diag * 0.5) + 4, ey(seating - R * diag * 0.5), `R ${R.toFixed(1)}`, { size: 9, fill: ELBOW_SVG.text }));
  parts.push(svgText(ox + 6, ey(seating - R) + 14, `d.ex ${dEx.toFixed(1)} · d.in ${dIn.toFixed(1)}`, { size: 8.5, fill: ELBOW_SVG.muted }));

  /* ═══ Right panel — receiver cross-section and the datum ladder ═══ */
  const halfClearance = (D - dEx) / 2;
  const elbowCentreY = seating - R;
  const sectionTop = Math.max(rho, elbowCentreY + rEx);
  const sectionHalfW = Math.max(rho, Math.abs(e) + rEx) + halfClearance * 0.35 + 6;
  const sectionAvailW = W - splitX - 86;
  const sectionScale = Math.min(sectionAvailW / (2 * sectionHalfW), (availH - 34) / (sectionTop + rho + 12));
  const scx = splitX + 30 + sectionAvailW / 2;
  const scy = padTop + 18 + (sectionTop + 6) * sectionScale;
  const sx = (mm: number) => scx + mm * sectionScale;
  const sy = (mm: number) => scy - mm * sectionScale;
  const rhoPx = rho * sectionScale;

  parts.push(svgText(splitX + 16, padTop - 14, labels.section, { size: 10, fill: ELBOW_SVG.muted }));
  parts.push(`<circle cx="${px(scx)}" cy="${px(scy)}" r="${px(rhoPx)}" fill="${ELBOW_SVG.gridSoft}" stroke="${ELBOW_SVG.text}" stroke-width="1.3"/>`);
  parts.push(`<circle cx="${px(scx)}" cy="${px(scy)}" r="1.8" fill="${ELBOW_SVG.datum}"/>`);

  /* Elbow section at the end-face plane: OD and bore at the lateral offset e. */
  parts.push(`<circle cx="${px(sx(e))}" cy="${px(sy(elbowCentreY))}" r="${px(rEx * sectionScale)}"`
    + ` fill="${ELBOW_SVG.curve}" fill-opacity="0.14" stroke="${ELBOW_SVG.curve}" stroke-width="1.4" data-elbow-od="true"/>`);
  parts.push(`<circle cx="${px(sx(e))}" cy="${px(sy(elbowCentreY))}" r="${px(rIn * sectionScale)}"`
    + ` fill="none" stroke="${ELBOW_SVG.curve}" stroke-width="0.9" stroke-dasharray="5,3" data-elbow-id="true"/>`);

  /* Datum ladder of THIS family: BOP toward +X, TOP toward −X. */
  for (const [offset, name] of [
    [halfClearance, 'BOP'],
    [0, 'EJE'],
    [-halfClearance, 'TOP'],
  ] as const) {
    parts.push(`<line x1="${px(sx(offset))}" y1="${px(sy(sectionTop + 8))}" x2="${px(sx(offset))}" y2="${px(sy(-rho - 6))}" stroke="${ELBOW_SVG.faint}" stroke-width="0.8" stroke-dasharray="5,4"/>`);
    parts.push(svgText(sx(offset), sy(-rho - 9), `${name} ${offset > 0 ? '+' : ''}${offset.toFixed(2)}`,
      { size: 8, fill: ELBOW_SVG.faint, anchor: 'middle' }));
  }
  /* Current datum generatrix at Xg = e, straight from the kernel. */
  parts.push(`<line x1="${px(sx(e))}" y1="${px(sy(sectionTop + 10))}" x2="${px(sx(e))}" y2="${px(sy(-rho - 6))}" stroke="${ELBOW_SVG.marker}" stroke-width="1.6" data-datum-line="true"/>`);
  parts.push(svgText(scx, padTop + 4, `${input.datumName} · e ${e >= 0 ? '+' : ''}${e.toFixed(2)} mm`, { size: 10, fill: ELBOW_SVG.marker, anchor: 'middle' }));

  /* Cota X′: arc on the receiver surface from the crown to the datum generatrix. */
  const crownX = sx(0);
  const crownY = sy(rho);
  const datumSurfaceY = Math.sqrt(Math.max(0, rho * rho - e * e));
  parts.push(`<circle cx="${px(crownX)}" cy="${px(crownY)}" r="2.2" fill="${ELBOW_SVG.datum}"/>`);
  if (Math.abs(e) > 1e-9) {
    parts.push(`<path d="M ${px(crownX)} ${px(crownY)} A ${px(rhoPx)} ${px(rhoPx)} 0 0 ${e > 0 ? 1 : 0} ${px(sx(e))} ${px(sy(datumSurfaceY))}"`
      + ` fill="none" stroke="${ELBOW_SVG.marker}" stroke-width="2.4" data-cota-x-arc="true"/>`);
  }
  parts.push(svgText(splitX + 16, H - 38, `${labels.cotaX} ${cotaX.toFixed(2)} mm`, { size: 9, fill: ELBOW_SVG.marker }));
  parts.push(svgText(splitX + 16, H - 24, `${labels.datumOffset} ${e >= 0 ? '+' : ''}${e.toFixed(2)} mm · ${labels.seating} ${seating.toFixed(2)} mm`, { size: 9, fill: ELBOW_SVG.text }));

  const yPrime = options.yPrimeMm;
  const hasYPrime = yPrime !== null && yPrime !== undefined && Number.isFinite(yPrime);
  if (hasYPrime) {
    parts.push(svgText(splitX + 16, H - 10, `${labels.cotaY} ${(yPrime as number).toFixed(2)} mm`, { size: 9, fill: ELBOW_SVG.muted }));
  }

  const svg = responsiveSvg(W, H, parts.join(''), {
    'data-preview': 'elbow-on-pipe-schematic',
    'data-datum': input.datumName,
    'data-datum-offset-mm': exactMm(e),
    'data-seating-height-mm': exactMm(seating),
    'data-cota-x-mm': exactMm(cotaX),
    'data-r-mm': exactMm(R),
    'data-d-mm': exactMm(D),
    'data-elbow-od-mm': exactMm(dEx),
    'data-elbow-id-mm': exactMm(dIn),
    ...(hasYPrime ? { 'data-external-cota-y-mm': exactMm(yPrime as number) } : {}),
  });
  return { svg, elevationScale, sectionScale };
}

function dimensionV(x: number, y1: number, y2: number, label: string): string {
  return `<line x1="${px(x)}" y1="${px(y1)}" x2="${px(x)}" y2="${px(y2)}" stroke="${ELBOW_SVG.text}" stroke-width="0.9"/>`
    + `<line x1="${px(x - 4)}" y1="${px(y1)}" x2="${px(x + 4)}" y2="${px(y1)}" stroke="${ELBOW_SVG.text}" stroke-width="0.9"/>`
    + `<line x1="${px(x - 4)}" y1="${px(y2)}" x2="${px(x + 4)}" y2="${px(y2)}" stroke="${ELBOW_SVG.text}" stroke-width="0.9"/>`
    + svgText(x + 6, (y1 + y2) / 2, label, { size: 9, fill: ELBOW_SVG.text });
}
