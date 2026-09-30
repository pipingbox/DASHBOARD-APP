/* ───────────────────────────────────────────────────────────────────────────
   TUBO→CODO explanatory schematic — pure generator.

   Purpose: make the INPUTS understandable. It is an explanatory screen diagram,
   NOT a fabrication-scale drawing and NOT the later 1:1 physical template.

   It draws only quantities the user typed, plus the signed datum offset e that
   U1 already resolved (result.datumOffsetMm). It does NOT compute — and never
   draws as a numeric value — any intersection quantity (ψ, rMer, t, φ,
   Cota X′/Y′, picaje, injerto). The branch band is simply clipped against the
   drawn elbow outline, which is a rendering operation, not a geometry one.

   Reference frame, as documented by branchOnElbowGeometry.ts (U1):
     · O = centre of curvature of the elbow; bend plane = z = 0.
     · Elbow centreline = arc of radius R around O; generating radius ρ = D/2.
     · Branch axis is parallel to +x at height y = a and out-of-plane z = e.
     · L is the branch length measured from the x = R reference plane.
     · e is the out-of-plane (lateral) displacement selected by the datum:
       EJE 0, BOP −(D − d.ex)/2, TOP +(D − d.ex)/2, FE = Fe.

   Left panel  = bend-plane elevation (R, D, a, L).
   Right panel = elbow cross-section showing why TOP/BOP are ±(D − d.ex)/2 and
                 where the current datum sits (z = e).

   SCREEN PREVIEW ONLY — responsive, not a 1:1 fabrication template.
   ─────────────────────────────────────────────────────────────────────────── */

import { ELBOW_SVG, exactMm, px, responsiveSvg, svgText } from './branchOnElbowSvgUtils.ts';

export interface BranchOnElbowSchematicInput {
  elbowCentrelineRadiusMm: number;
  elbowOuterDiameterMm: number;
  branchOuterDiameterMm: number;
  axisHeightMm: number;
  referenceLengthMm: number;
  /** Signed lateral offset resolved by U1 (result.datumOffsetMm). */
  datumOffsetMm: number;
  /** Technical datum identifier: EJE | BOP | TOP | FE. */
  datumName: string;
}

export interface BranchOnElbowSchematicLabels {
  title: string;
  elevation: string;
  section: string;
  branch: string;
  elbow: string;
  referencePlane: string;
  datumOffset: string;
  screenPreviewNote: string;
  notToScale: string;
}

export interface BranchOnElbowSchematicOptions {
  viewBoxWidth?: number;
  viewBoxHeight?: number;
}

export interface BranchOnElbowSchematicResult {
  svg: string;
  /** Uniform px per mm of the elevation panel. */
  elevationScale: number;
  /** Uniform px per mm of the section panel. */
  sectionScale: number;
}

export function buildBranchOnElbowSchematic(
  input: BranchOnElbowSchematicInput,
  labels: BranchOnElbowSchematicLabels,
  options: BranchOnElbowSchematicOptions = {},
): BranchOnElbowSchematicResult | null {
  const { elbowCentrelineRadiusMm: R, elbowOuterDiameterMm: D, branchOuterDiameterMm: od } = input;
  const { axisHeightMm: a, referenceLengthMm: L, datumOffsetMm: e } = input;
  const rho = D / 2;
  if (!(R > 0) || !(rho > 0) || !(od > 0) || !Number.isFinite(a) || !Number.isFinite(L) || !Number.isFinite(e)) return null;

  const W = options.viewBoxWidth ?? 920;
  const H = options.viewBoxHeight ?? 430;
  const splitX = 560;
  const parts: string[] = [];

  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${ELBOW_SVG.background}"/>`);
  parts.push(svgText(16, 20, labels.title, { size: 11, fill: ELBOW_SVG.text, weight: 'bold' }));
  parts.push(svgText(W - 16, 20, labels.screenPreviewNote, { size: 9, fill: ELBOW_SVG.faint, anchor: 'end' }));
  parts.push(svgText(W - 16, H - 8, labels.notToScale, { size: 9, fill: ELBOW_SVG.faint, anchor: 'end' }));

  /* ═══ Left panel — bend-plane elevation ═══ */
  const padLeft = 54;
  const padTop = 48;
  const availW = splitX - padLeft - 46;
  const availH = H - padTop - 58;
  const xMaxMm = Math.max(R + rho, R + L) + 40;
  const yMaxMm = Math.max(R + rho, a + od / 2) + 40;
  const elevationScale = Math.min(availW / xMaxMm, availH / yMaxMm);
  /* O sits at the bottom-left of the elevation; +x right, +y up. */
  const ox = padLeft;
  const oy = padTop + availH;
  const ex = (mm: number) => ox + mm * elevationScale;
  const ey = (mm: number) => oy - mm * elevationScale;

  parts.push(svgText(padLeft, padTop - 14, labels.elevation, { size: 10, fill: ELBOW_SVG.muted }));

  /* Branch band starting at the x = R reference plane that defines L, drawn
     FIRST so the opaque elbow body painted on top hides the portion inside the
     elbow — the visible junction is the drawn elbow surface. Pure drawing
     order: no geometry is computed here. */
  parts.push(`<rect x="${px(ex(R))}" y="${px(ey(a + od / 2))}" width="${px(L * elevationScale)}"`
    + ` height="${px(od * elevationScale)}" fill="${ELBOW_SVG.curve}" fill-opacity="0.16"`
    + ` stroke="${ELBOW_SVG.curve}" stroke-width="1.4" data-branch-band="true"/>`);
  parts.push(`<line x1="${px(ex(R))}" y1="${px(ey(a))}" x2="${px(ex(R + L) + 14)}" y2="${px(ey(a))}" stroke="${ELBOW_SVG.datum}" stroke-width="0.9" stroke-dasharray="10,3,2,3"/>`);

  /* Elbow band between the inner and outer generating arcs (quarter bend). */
  const outer = R + rho;
  const inner = R - rho;
  parts.push(`<path d="M ${px(ex(outer))} ${px(ey(0))}`
    + ` A ${px(outer * elevationScale)} ${px(outer * elevationScale)} 0 0 0 ${px(ex(0))} ${px(ey(outer))}`
    + ` L ${px(ex(0))} ${px(ey(inner))}`
    + ` A ${px(inner * elevationScale)} ${px(inner * elevationScale)} 0 0 1 ${px(ex(inner))} ${px(ey(0))} Z"`
    + ` fill="${ELBOW_SVG.panel}" stroke="${ELBOW_SVG.text}" stroke-width="1.3" data-elbow-band="true"/>`);
  /* Elbow centreline, radius R. */
  parts.push(`<path d="M ${px(ex(R))} ${px(ey(0))} A ${px(R * elevationScale)} ${px(R * elevationScale)} 0 0 0 ${px(ex(0))} ${px(ey(R))}"`
    + ` fill="none" stroke="${ELBOW_SVG.datum}" stroke-width="0.9" stroke-dasharray="10,3,2,3"/>`);
  parts.push(svgText(ex(0) + 6, ey(outer) - 8, labels.elbow, { size: 9, fill: ELBOW_SVG.muted }));
  parts.push(svgText(ex(R + L) + 16, ey(a) - 6, labels.branch, { size: 9, fill: ELBOW_SVG.curve }));

  /* O marker and the x = R reference plane used by L. */
  parts.push(`<circle cx="${px(ex(0))}" cy="${px(ey(0))}" r="2.6" fill="${ELBOW_SVG.datum}"/>`);
  parts.push(svgText(ex(0) - 6, ey(0) + 14, 'O', { size: 10, fill: ELBOW_SVG.datum, anchor: 'end' }));
  parts.push(`<line x1="${px(ex(R))}" y1="${px(ey(0))}" x2="${px(ex(R))}" y2="${px(ey(a + od / 2) - 22)}" stroke="${ELBOW_SVG.faint}" stroke-width="0.8" stroke-dasharray="4,4"/>`);
  parts.push(svgText(ex(R), ey(0) + 14, labels.referencePlane, { size: 8, fill: ELBOW_SVG.faint, anchor: 'middle' }));

  /* Dimension L: from the x = R plane to the branch end. */
  const dimLy = ey(a + od / 2) - 14;
  parts.push(dimensionH(ex(R), ex(R + L), dimLy, `L ${L.toFixed(1)}`));
  /* Dimension a: from the bend plane axis up to the branch axis. */
  const dimAx = ex(R + L) + 4;
  parts.push(dimensionV(dimAx, ey(0), ey(a), `a ${a.toFixed(1)}`));
  /* Dimensions R and D along the 45° meridian. */
  const diag = Math.SQRT1_2;
  parts.push(`<line x1="${px(ex(0))}" y1="${px(ey(0))}" x2="${px(ex(R * diag))}" y2="${px(ey(R * diag))}" stroke="${ELBOW_SVG.faint}" stroke-width="0.8" stroke-dasharray="4,3"/>`);
  parts.push(svgText(ex(R * diag * 0.52) + 4, ey(R * diag * 0.52) - 5, `R ${R.toFixed(1)}`, { size: 9, fill: ELBOW_SVG.text }));
  parts.push(`<line x1="${px(ex(inner * diag))}" y1="${px(ey(inner * diag))}" x2="${px(ex(outer * diag))}" y2="${px(ey(outer * diag))}" stroke="${ELBOW_SVG.text}" stroke-width="1.1"/>`);
  parts.push(svgText(ex(outer * diag) + 5, ey(outer * diag) - 4, `D ${D.toFixed(1)}`, { size: 9, fill: ELBOW_SVG.text }));

  /* ═══ Right panel — elbow cross-section with the datum ladder ═══ */
  const sectionCx = splitX + (W - splitX) / 2;
  const sectionCy = padTop + availH / 2 - 10;
  const sectionScale = Math.min((W - splitX - 66) / (D + 18), (availH - 40) / (D + 18));
  const sy = (mm: number) => sectionCy - mm * sectionScale;
  const rhoPx = rho * sectionScale;

  parts.push(svgText(splitX + 12, padTop - 14, labels.section, { size: 10, fill: ELBOW_SVG.muted }));
  parts.push(`<circle cx="${px(sectionCx)}" cy="${px(sectionCy)}" r="${px(rhoPx)}" fill="${ELBOW_SVG.gridSoft}" stroke="${ELBOW_SVG.text}" stroke-width="1.3"/>`);

  const sectionClipId = 'pb-elbow-section';
  parts.push(`<defs><clipPath id="${sectionClipId}"><circle cx="${px(sectionCx)}" cy="${px(sectionCy)}" r="${px(rhoPx)}"/></clipPath></defs>`);
  parts.push(`<g clip-path="url(#${sectionClipId})">`
    + `<rect x="${px(sectionCx - rhoPx)}" y="${px(sy(e + od / 2))}" width="${px(rhoPx * 2)}" height="${px(od * sectionScale)}"`
    + ` fill="${ELBOW_SVG.curve}" fill-opacity="0.18" stroke="${ELBOW_SVG.curve}" stroke-width="1.3" data-datum-band="true"/></g>`);

  const tangency = rho - od / 2;
  for (const [offset, name, colour] of [
    [tangency, 'TOP', ELBOW_SVG.faint],
    [0, 'EJE', ELBOW_SVG.faint],
    [-tangency, 'BOP', ELBOW_SVG.faint],
  ] as const) {
    parts.push(`<line x1="${px(sectionCx - rhoPx - 8)}" y1="${px(sy(offset))}" x2="${px(sectionCx + rhoPx + 8)}" y2="${px(sy(offset))}" stroke="${colour}" stroke-width="0.8" stroke-dasharray="5,4"/>`);
    parts.push(svgText(sectionCx + rhoPx + 12, sy(offset) + 3, `${name} ${offset > 0 ? '+' : ''}${offset.toFixed(2)}`, { size: 8, fill: colour }));
  }
  /* Current datum position z = e, straight from U1. */
  parts.push(`<line x1="${px(sectionCx - rhoPx - 14)}" y1="${px(sy(e))}" x2="${px(sectionCx + rhoPx + 8)}" y2="${px(sy(e))}" stroke="${ELBOW_SVG.marker}" stroke-width="1.6" data-datum-line="true"/>`);
  parts.push(`<circle cx="${px(sectionCx)}" cy="${px(sy(e))}" r="2.8" fill="${ELBOW_SVG.marker}"/>`);
  parts.push(svgText(sectionCx, padTop + 4, `${input.datumName} · e ${e >= 0 ? '+' : ''}${e.toFixed(2)} mm`, { size: 10, fill: ELBOW_SVG.marker, anchor: 'middle' }));
  parts.push(svgText(splitX + 12, H - 24, `${labels.datumOffset} ${e >= 0 ? '+' : ''}${e.toFixed(2)} mm`, { size: 9, fill: ELBOW_SVG.text }));

  const svg = responsiveSvg(W, H, parts.join(''), {
    'data-preview': 'branch-on-elbow-schematic',
    'data-datum': input.datumName,
    'data-datum-offset-mm': exactMm(e),
    'data-r-mm': exactMm(R),
    'data-d-mm': exactMm(D),
    'data-a-mm': exactMm(a),
    'data-l-mm': exactMm(L),
  });
  return { svg, elevationScale, sectionScale };
}

function dimensionH(x1: number, x2: number, y: number, label: string): string {
  return `<line x1="${px(x1)}" y1="${px(y)}" x2="${px(x2)}" y2="${px(y)}" stroke="${ELBOW_SVG.text}" stroke-width="0.9"/>`
    + `<line x1="${px(x1)}" y1="${px(y - 4)}" x2="${px(x1)}" y2="${px(y + 4)}" stroke="${ELBOW_SVG.text}" stroke-width="0.9"/>`
    + `<line x1="${px(x2)}" y1="${px(y - 4)}" x2="${px(x2)}" y2="${px(y + 4)}" stroke="${ELBOW_SVG.text}" stroke-width="0.9"/>`
    + svgText((x1 + x2) / 2, y - 5, label, { size: 9, fill: ELBOW_SVG.text, anchor: 'middle' });
}

function dimensionV(x: number, y1: number, y2: number, label: string): string {
  return `<line x1="${px(x)}" y1="${px(y1)}" x2="${px(x)}" y2="${px(y2)}" stroke="${ELBOW_SVG.text}" stroke-width="0.9"/>`
    + `<line x1="${px(x - 4)}" y1="${px(y1)}" x2="${px(x + 4)}" y2="${px(y1)}" stroke="${ELBOW_SVG.text}" stroke-width="0.9"/>`
    + `<line x1="${px(x - 4)}" y1="${px(y2)}" x2="${px(x + 4)}" y2="${px(y2)}" stroke="${ELBOW_SVG.text}" stroke-width="0.9"/>`
    + svgText(x + 6, (y1 + y2) / 2, label, { size: 9, fill: ELBOW_SVG.text });
}
