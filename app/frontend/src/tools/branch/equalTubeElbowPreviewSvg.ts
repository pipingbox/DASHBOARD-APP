/* ───────────────────────────────────────────────────────────────────────────
   TUBO ⇄ CODO IGUALES — SCREEN PREVIEWS (PB-BRANCH-EQUAL-TUBE-ELBOW-001 U6.2)

   Three responsive screen graphics for the equal tube-elbow family:

     TUBE CUT DEVELOPMENT   the tube is a cylinder, so its cut contour HAS an
                            exact flat development. X = station
                            circumferentialPositionMm (OD wrap), Y = Cota tubo
                            (tubeCutPositionMm, from the far square end). This
                            chart is the screen twin of the physical 1:1 tube
                            template; it is NOT itself 1:1.

     ELBOW MARKING CHART    the elbow is a torus: no isometric flat development
                            exists, so this is a coordinate chart, never a flat
                            template. X = circumferentialPositionMm, primary Y =
                            elbowArcLengthMm, secondary trace = bend angle t,
                            dashed reference = the 90° end face
                            (arcRadius · π/2). Same reading as the U5.3 codo→tubo
                            marking preview.

     SCHEMATIC              bend-plane elevation of the joint, NOT TO SCALE:
                            quarter elbow, centreline radius R, the tube with its
                            cut-back at the deepest generatrix, extrados/intrados
                            labels.

   NO GEOMETRY HERE. Every millimetre and angle is copied verbatim from
   equalTubeElbowGeometry.ts (U6.1); this module only maps mm → screen px with
   documented affine transforms and exposes the transforms so tests can prove
   each plotted point is the image of a kernel value.
   ─────────────────────────────────────────────────────────────────────────── */

import type { EqualTubeElbowResult } from './equalTubeElbowGeometry.ts';
import { affine, ELBOW_SVG, exactMm, labelStride, padDomain, px, responsiveSvg, svgText, type AffineScale } from './branchOnElbowSvgUtils.ts';

/* ── Tube cut development ── */

export interface EqualTubeElbowTubeLabels {
  title: string;
  note: string;
  arcAxis: string;
  cotaAxis: string;
  closureLabel: string;
  screenPreviewNote: string;
}

export interface EqualTubeElbowTubeOptions {
  viewBoxWidth?: number;
  viewBoxHeight?: number;
}

export interface EqualTubeElbowTubeResult {
  svg: string;
  scaleArc: AffineScale;
  scaleCota: AffineScale;
  minCotaMm: number;
  maxCotaMm: number;
}

export function buildEqualTubeElbowTubePreview(
  result: EqualTubeElbowResult,
  labels: EqualTubeElbowTubeLabels,
  options: EqualTubeElbowTubeOptions = {},
): EqualTubeElbowTubeResult | null {
  if (!result.valid || result.stations.length < 2) return null;
  const W = options.viewBoxWidth ?? 680;
  const H = options.viewBoxHeight ?? 440;
  const left = 58;
  const right = 20;
  const top = 46;
  const plotW = W - left - right;
  const plotH = H - top - 78;

  const stations = result.stations;
  const divisions = result.divisions;
  const cotas = stations.map(station => station.tubeCutPositionMm);
  const minCotaMm = Math.min(...cotas);
  const maxCotaMm = Math.max(...cotas);
  const [yMin, yMax] = padDomain(minCotaMm, maxCotaMm, 0.1);

  const scaleArc = affine(0, result.circumferenceMm, left, plotW, 1);
  const scaleCota = affine(yMin, yMax, top + plotH, plotH, -1);
  const stride = labelStride(stations.length);

  const parts: string[] = [];
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${ELBOW_SVG.background}"/>`);
  parts.push(`<rect x="${px(left)}" y="${px(top)}" width="${px(plotW)}" height="${px(plotH)}" fill="${ELBOW_SVG.panel}" stroke="${ELBOW_SVG.grid}" stroke-width="1"/>`);
  parts.push(svgText(left, top - 24, labels.title, { size: 11, fill: ELBOW_SVG.text, weight: 'bold' }));
  parts.push(svgText(W - right, top - 24, labels.screenPreviewNote, { size: 9, fill: ELBOW_SVG.faint, anchor: 'end' }));
  parts.push(svgText(left, top - 10, labels.note, { size: 8.5, fill: ELBOW_SVG.faint }));

  /* Station guide lines: one per kernel station, never thinned. */
  for (const station of stations) {
    const x = scaleArc.map(station.circumferentialPositionMm);
    parts.push(`<line x1="${px(x)}" y1="${px(top)}" x2="${px(x)}" y2="${px(top + plotH)}" stroke="${ELBOW_SVG.gridSoft}" stroke-width="0.6" data-station-line="${station.index}"/>`);
  }

  /* Kept-material band: from the curve down to the cota minimum (screen aid). */
  const bandPoints = stations
    .map(station => `${px(scaleArc.map(station.circumferentialPositionMm))},${px(scaleCota.map(station.tubeCutPositionMm))}`)
    .join(' ');
  parts.push(`<polygon points="${px(left)},${px(top + plotH)} ${bandPoints} ${px(left + plotW)},${px(top + plotH)}" fill="${ELBOW_SVG.curve}" fill-opacity="0.08" stroke="none" data-kept-band="true"/>`);
  parts.push(`<polyline points="${bandPoints}" fill="none" stroke="${ELBOW_SVG.curve}" stroke-width="2" stroke-linejoin="round" data-cut-curve="kernel-stations"/>`);

  /* Station markers with exact kernel values in data attributes. */
  for (const station of stations) {
    const x = scaleArc.map(station.circumferentialPositionMm);
    const y = scaleCota.map(station.tubeCutPositionMm);
    const isClosure = station.isClosure;
    parts.push(`<circle cx="${px(x)}" cy="${px(y)}" r="${isClosure ? 3.4 : 2.6}" fill="${isClosure ? ELBOW_SVG.closure : ELBOW_SVG.marker}" data-station="${station.index}" data-station-kind="${isClosure ? 'closure' : 'physical'}" data-arc-mm="${exactMm(station.circumferentialPositionMm)}" data-cota-mm="${exactMm(station.tubeCutPositionMm)}"/>`);
    if (station.index % stride === 0 && !isClosure && x < left + plotW - 8 - labels.closureLabel.length * 4.8) {
      parts.push(svgText(x, top + plotH + 14, `P${station.index + 1}`, { size: 8, fill: ELBOW_SVG.muted, anchor: 'middle' }));
    }
  }
  parts.push(svgText(left + plotW, top + plotH + 14, labels.closureLabel, { size: 8, fill: ELBOW_SVG.closure, anchor: 'end' }));

  parts.push(svgText(left + plotW / 2, H - 42, labels.arcAxis, { size: 9, anchor: 'middle' }));
  parts.push(svgText(left - 8, top + plotH / 2, labels.cotaAxis, { size: 9, anchor: 'middle', rotate: -90 }));
  parts.push(svgText(left, H - 26, `${minCotaMm.toFixed(2)} … ${maxCotaMm.toFixed(2)} mm`, { size: 10, fill: ELBOW_SVG.text }));

  const svg = responsiveSvg(W, H, parts.join(''), {
    'data-preview': 'equal-tube-elbow-tube',
    'data-station-count': String(stations.length),
    'data-circumference-mm': exactMm(result.circumferenceMm),
    'data-flat-development': 'true',
  });
  return { svg, scaleArc, scaleCota, minCotaMm, maxCotaMm };
}

/* ── Elbow marking chart ── */

export interface EqualTubeElbowMarkingLabels {
  title: string;
  note: string;
  arcAxis: string;
  lengthAxis: string;
  angleAxis: string;
  limitLabel: string;
  closureLabel: string;
  clampedLegend: string;
  screenPreviewNote: string;
}

export interface EqualTubeElbowMarkingOptions {
  viewBoxWidth?: number;
  viewBoxHeight?: number;
}

export interface EqualTubeElbowMarkingResult {
  svg: string;
  scaleArc: AffineScale;
  scaleLength: AffineScale;
  scaleAngle: AffineScale;
  minArcLengthMm: number;
  maxArcLengthMm: number;
  clampedCount: number;
}

/** Full quarter bend of a kernel arc radius: the 90° end-face limit. */
function endFaceLimit(arcRadiusMm: number): number {
  return (arcRadiusMm * Math.PI) / 2;
}

export function buildEqualTubeElbowMarkingPreview(
  result: EqualTubeElbowResult,
  labels: EqualTubeElbowMarkingLabels,
  options: EqualTubeElbowMarkingOptions = {},
): EqualTubeElbowMarkingResult | null {
  if (!result.valid || result.stations.length < 2) return null;
  const W = options.viewBoxWidth ?? 680;
  const H = options.viewBoxHeight ?? 440;
  const left = 58;
  const right = 46;
  const top = 46;
  const plotW = W - left - right;
  const plotH = H - top - 78;

  const stations = result.stations;
  const divisions = result.divisions;
  const lengths = stations.map(station => station.elbowArcLengthMm);
  const limits = stations.map(station => endFaceLimit(station.elbowArcRadiusMm));
  const minArcLengthMm = Math.min(...lengths);
  const maxArcLengthMm = Math.max(...lengths);
  /* Vertical domain follows the CUT, not the limit (same reading rule as the
     U5.3 marking preview): only the lowest point of the 90° reference is
     admitted, exactly where the cut reaches the end face. */
  const [yMin, yMax] = padDomain(minArcLengthMm, Math.max(maxArcLengthMm, Math.min(...limits)), 0.1);

  const scaleArc = affine(0, result.circumferenceMm, left, plotW, 1);
  const scaleLength = affine(yMin, yMax, top + plotH, plotH, -1);
  const scaleAngle = affine(0, 90, top + plotH, plotH, -1);
  const stride = labelStride(stations.length);
  const clipId = 'equal-tube-elbow-marking-plot';

  const parts: string[] = [];
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${ELBOW_SVG.background}"/>`);
  parts.push(`<defs><clipPath id="${clipId}"><rect x="${px(left)}" y="${px(top)}" width="${px(plotW)}" height="${px(plotH)}"/></clipPath></defs>`);
  parts.push(`<rect x="${px(left)}" y="${px(top)}" width="${px(plotW)}" height="${px(plotH)}" fill="${ELBOW_SVG.panel}" stroke="${ELBOW_SVG.grid}" stroke-width="1"/>`);
  parts.push(svgText(left, top - 24, labels.title, { size: 11, fill: ELBOW_SVG.text, weight: 'bold' }));
  parts.push(svgText(W - right, top - 24, labels.screenPreviewNote, { size: 9, fill: ELBOW_SVG.faint, anchor: 'end' }));
  parts.push(svgText(left, top - 10, labels.note, { size: 8.5, fill: ELBOW_SVG.faint }));

  for (const station of stations) {
    const x = scaleArc.map(station.circumferentialPositionMm);
    parts.push(`<line x1="${px(x)}" y1="${px(top)}" x2="${px(x)}" y2="${px(top + plotH)}" stroke="${ELBOW_SVG.gridSoft}" stroke-width="0.6" data-station-line="${station.index}"/>`);
  }

  for (const degrees of [0, 45, 90]) {
    const y = scaleAngle.map(degrees);
    parts.push(`<line x1="${px(left + plotW)}" y1="${px(y)}" x2="${px(left + plotW + 5)}" y2="${px(y)}" stroke="${ELBOW_SVG.axis}" stroke-width="0.8"/>`);
    parts.push(svgText(left + plotW + 8, y + 3, `${degrees}°`, { size: 8, fill: ELBOW_SVG.faint }));
  }

  /* 90° end-face reference: the full quarter bend of each station radius. */
  const limitPolyline = stations
    .map(station => `${px(scaleArc.map(station.circumferentialPositionMm))},${px(scaleLength.map(endFaceLimit(station.elbowArcRadiusMm)))}`)
    .join(' ');
  parts.push(`<polyline points="${limitPolyline}" fill="none" stroke="${ELBOW_SVG.closure}" stroke-width="1.1" stroke-dasharray="7,4" clip-path="url(#${clipId})" data-limit-curve="elbow-end-face"/>`);

  /* Secondary trace: bend angle t per station. */
  const anglePolyline = stations
    .map(station => `${px(scaleArc.map(station.circumferentialPositionMm))},${px(scaleAngle.map((station.elbowBendAngleRad * 180) / Math.PI))}`)
    .join(' ');
  parts.push(`<polyline points="${anglePolyline}" fill="none" stroke="${ELBOW_SVG.datum}" stroke-width="1.1" stroke-opacity="0.75" clip-path="url(#${clipId})" data-angle-curve="bend-angle"/>`);

  /* Primary trace: arc length along the meridian. */
  const cutPolyline = stations
    .map(station => `${px(scaleArc.map(station.circumferentialPositionMm))},${px(scaleLength.map(station.elbowArcLengthMm))}`)
    .join(' ');
  parts.push(`<polyline points="${cutPolyline}" fill="none" stroke="${ELBOW_SVG.curve}" stroke-width="2" stroke-linejoin="round" data-cut-curve="kernel-stations"/>`);

  let clampedCount = 0;
  for (const station of stations) {
    const x = scaleArc.map(station.circumferentialPositionMm);
    const y = scaleLength.map(station.elbowArcLengthMm);
    const isClosure = station.isClosure;
    if (station.clampedAtElbowEnd && !isClosure) clampedCount += 1;
    const shared = `data-station="${station.index}" data-station-kind="${isClosure ? 'closure' : 'physical'}"`
      + ` data-arc-mm="${exactMm(station.circumferentialPositionMm)}" data-arc-length-mm="${exactMm(station.elbowArcLengthMm)}"`
      + ` data-arc-radius-mm="${exactMm(station.elbowArcRadiusMm)}" data-bend-angle-deg="${exactMm((station.elbowBendAngleRad * 180) / Math.PI)}"`
      + ` data-clamped="${station.clampedAtElbowEnd}"`;
    if (station.clampedAtElbowEnd) {
      parts.push(`<polygon points="${px(x)},${px(y - 4.4)} ${px(x + 4.4)},${px(y)} ${px(x)},${px(y + 4.4)} ${px(x - 4.4)},${px(y)}" fill="${ELBOW_SVG.closure}" stroke="${ELBOW_SVG.background}" stroke-width="0.6" ${shared}/>`);
    } else {
      parts.push(`<circle cx="${px(x)}" cy="${px(y)}" r="${isClosure ? 3.4 : 2.6}" fill="${isClosure ? ELBOW_SVG.closure : ELBOW_SVG.marker}" ${shared}/>`);
    }
    if (station.index % stride === 0 && !isClosure && x < left + plotW - 8 - labels.closureLabel.length * 4.8) {
      parts.push(svgText(x, top + plotH + 14, `P${station.index + 1}`, { size: 8, fill: ELBOW_SVG.muted, anchor: 'middle' }));
    }
  }
  parts.push(svgText(left + plotW, top + plotH + 14, labels.closureLabel, { size: 8, fill: ELBOW_SVG.closure, anchor: 'end' }));

  parts.push(svgText(left + plotW / 2, H - 42, labels.arcAxis, { size: 9, anchor: 'middle' }));
  parts.push(svgText(left - 8, top + plotH / 2, labels.lengthAxis, { size: 9, anchor: 'middle', rotate: -90 }));
  parts.push(svgText(W - right + 26, top + plotH / 2, labels.angleAxis, { size: 9, anchor: 'middle', rotate: -90, fill: ELBOW_SVG.datum }));
  parts.push(svgText(left, H - 26, `${minArcLengthMm.toFixed(2)} … ${maxArcLengthMm.toFixed(2)} mm`, { size: 10, fill: ELBOW_SVG.text }));
  parts.push(svgText(left, H - 12, `${labels.limitLabel} · ${labels.clampedLegend} ${clampedCount}/${divisions}`, { size: 9, fill: ELBOW_SVG.closure }));

  const svg = responsiveSvg(W, H, parts.join(''), {
    'data-preview': 'equal-tube-elbow-marking',
    'data-station-count': String(stations.length),
    'data-clamped-count': String(clampedCount),
    'data-circumference-mm': exactMm(result.circumferenceMm),
    'data-station-spacing-mm': exactMm(result.stationSpacingMm),
    'data-flat-development': 'false',
  });
  return { svg, scaleArc, scaleLength, scaleAngle, minArcLengthMm, maxArcLengthMm, clampedCount };
}

/* ── Schematic elevation ── */

export interface EqualTubeElbowSchematicLabels {
  title: string;
  notToScale: string;
  screenPreviewNote: string;
  tube: string;
  elbow: string;
  extrados: string;
  intrados: string;
  radiusLabel: string;
  cutbackLabel: string;
  lengthLabel: string;
  bendPlane: string;
}

export interface EqualTubeElbowSchematicOptions {
  viewBoxWidth?: number;
  viewBoxHeight?: number;
}

export interface EqualTubeElbowSchematicInput {
  elbowCentrelineRadiusMm: number;
  outerDiameterMm: number;
  innerDiameterMm: number;
  lengthMm: number;
  maxCutbackMm: number;
}

export interface EqualTubeElbowSchematicResult {
  svg: string;
}

export function buildEqualTubeElbowSchematic(
  input: EqualTubeElbowSchematicInput,
  labels: EqualTubeElbowSchematicLabels,
  options: EqualTubeElbowSchematicOptions = {},
): EqualTubeElbowSchematicResult | null {
  const W = options.viewBoxWidth ?? 680;
  const H = options.viewBoxHeight ?? 400;
  const parts: string[] = [];
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${ELBOW_SVG.background}"/>`);
  parts.push(svgText(20, 28, labels.title, { size: 11, fill: ELBOW_SVG.text, weight: 'bold' }));
  parts.push(svgText(20, 42, labels.notToScale, { size: 9, fill: ELBOW_SVG.faint }));
  parts.push(svgText(W - 20, 28, labels.screenPreviewNote, { size: 9, fill: ELBOW_SVG.faint, anchor: 'end' }));

  /* Layout: quarter elbow on the right, tube entering horizontally from the
     left along the bend plane. Purely illustrative proportions. */
  const ex = 430;                 // elbow centre
  const ey = 250;                 // elbow centre
  const Ro = 120;                 // extrados radius (screen px)
  const Ri = 80;                  // intrados radius (screen px)
  const tubeY = ey - (Ro + Ri) / 2; // tube centreline = mid radius of the elbow end
  const tubeLeft = 60;
  const tubeRight = ex - (Ro + Ri) / 2;

  const arcPts = (cx: number, cy: number, r: number, a0: number, a1: number, n = 32): string => {
    const pts: string[] = [];
    for (let i = 0; i <= n; i++) {
      const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
      pts.push(`${px(cx + r * Math.cos(a))},${px(cy + r * Math.sin(a))}`);
    }
    return pts.join(' ');
  };

  /* Tube body: two outlines + centreline. */
  const half = (Ro - Ri) / 2;
  parts.push(`<line x1="${tubeLeft}" y1="${tubeY}" x2="${tubeRight}" y2="${tubeY}" stroke="${ELBOW_SVG.grid}" stroke-width="0.8" stroke-dasharray="8,4"/>`);
  parts.push(`<line x1="${tubeLeft}" y1="${tubeY - half}" x2="${tubeRight - 6}" y2="${tubeY - half}" stroke="${ELBOW_SVG.axis}" stroke-width="1.4"/>`);
  parts.push(`<line x1="${tubeLeft}" y1="${tubeY + half}" x2="${tubeRight - 26}" y2="${tubeY + half}" stroke="${ELBOW_SVG.axis}" stroke-width="1.4"/>`);
  /* The cut-back profile at the tube end (illustrative saddle dip on OD). */
  parts.push(`<path d="M ${tubeRight - 6} ${tubeY - half} Q ${tubeRight + 8} ${tubeY} ${tubeRight - 26} ${tubeY + half}" fill="none" stroke="${ELBOW_SVG.curve}" stroke-width="2"/>`);
  parts.push(svgText(tubeLeft + 6, tubeY - half - 10, labels.tube, { size: 10, fill: ELBOW_SVG.text }));
  parts.push(svgText(tubeLeft + 6, tubeY + half + 18, `${labels.lengthLabel} = ${input.lengthMm.toFixed(1)} mm`, { size: 9, fill: ELBOW_SVG.muted }));
  parts.push(svgText(tubeLeft + 6, tubeY + half + 32, `${labels.cutbackLabel} = ${input.maxCutbackMm.toFixed(1)} mm`, { size: 9, fill: ELBOW_SVG.curve }));

  /* Quarter elbow: extrados, intrados, centreline radius R. */
  parts.push(`<polyline fill="none" stroke="${ELBOW_SVG.axis}" stroke-width="1.4" points="${arcPts(ex, ey, Ro, 180, 270)}"/>`);
  parts.push(`<polyline fill="none" stroke="${ELBOW_SVG.axis}" stroke-width="1.4" points="${arcPts(ex, ey, Ri, 180, 270)}"/>`);
  parts.push(`<polyline fill="none" stroke="${ELBOW_SVG.grid}" stroke-width="0.8" stroke-dasharray="8,4" points="${arcPts(ex, ey, (Ro + Ri) / 2, 180, 270)}"/>`);
  /* Bend-plane lines. */
  parts.push(`<line x1="${ex - Ro - 14}" y1="${ey}" x2="${ex + 16}" y2="${ey}" stroke="${ELBOW_SVG.grid}" stroke-width="0.6" stroke-dasharray="4,4"/>`);
  parts.push(`<line x1="${ex}" y1="${ey - Ro - 14}" x2="${ex}" y2="${ey + 16}" stroke="${ELBOW_SVG.grid}" stroke-width="0.6" stroke-dasharray="4,4"/>`);
  parts.push(`<circle cx="${ex}" cy="${ey}" r="2.4" fill="${ELBOW_SVG.datum}"/>`);
  parts.push(svgText(ex + 8, ey - 6, `R = ${input.elbowCentrelineRadiusMm.toFixed(1)} mm`, { size: 9, fill: ELBOW_SVG.datum }));
  parts.push(svgText(ex - Ro - 10, ey - Ro - 8, labels.extrados, { size: 9, fill: ELBOW_SVG.muted, anchor: 'end' }));
  parts.push(svgText(ex - Ri - 6, ey - Ri + 16, labels.intrados, { size: 9, fill: ELBOW_SVG.muted, anchor: 'end' }));
  parts.push(svgText(ex + 10, ey - Ri - 10, labels.elbow, { size: 10, fill: ELBOW_SVG.text }));
  parts.push(svgText(ex - Ro - 14, ey + 14, labels.bendPlane, { size: 8.5, fill: ELBOW_SVG.faint }));

  /* Member sizes annotation (both members equal: d.ex / d.in). */
  parts.push(svgText(20, H - 18, `d.ex = ${input.outerDiameterMm.toFixed(2)} mm · d.in = ${input.innerDiameterMm.toFixed(2)} mm`, { size: 9.5, fill: ELBOW_SVG.text }));

  const svg = responsiveSvg(W, H, parts.join(''), {
    'data-preview': 'equal-tube-elbow-schematic',
    'data-not-to-scale': 'true',
    'data-radius-mm': exactMm(input.elbowCentrelineRadiusMm),
    'data-length-mm': exactMm(input.lengthMm),
    'data-max-cutback-mm': exactMm(input.maxCutbackMm),
  });
  return { svg };
}
