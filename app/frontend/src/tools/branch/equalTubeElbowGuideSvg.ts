/* ───────────────────────────────────────────────────────────────────────────
   TUBO ⇄ CODO IGUALES — ELBOW MARKING GUIDE — physical workshop PDF
   (PB-BRANCH-EQUAL-TUBE-ELBOW-001 U6.2).

   NOT A 1:1 FLAT CUT TEMPLATE.
   The elbow is a torus: a doubly curved surface with no exact planar
   development. Any sheet that pretended to wrap the elbow cut flat would be
   wrong by construction, so this guide never draws one. It gives the worker a
   physical marking METHOD built from quantities the U6.1 kernel already returns
   as true lengths and angles on the elbow itself:

     OD DIVISION STRIP 1:1   one-dimensional circumference π·d.ex of the
                             cross-section, with P1…PN at Div = π·d.ex/N and
                             the closure mark ≡ P1. Wrapped square around the
                             elbow at the t = 0 end it transfers the stations.
                             A circumference IS developable, hence honest 1:1.
     Longitud arco           station.elbowArcLengthMm — distance measured along
                             the station's own bend-direction generating arc,
                             from the t = 0 end plane to the cut point.
     Radio arco              station.elbowArcRadiusMm — the radius of that arc.
     t                       station.elbowBendAngleRad — bend angle swept.
     clampedAtElbowEnd       the cut reaches the 90° end face: mark the face.

   Same contract as the U5.4 codo→tubo guide; the tube member of this family
   gets its own exact 1:1 template (equalTubeElbowTemplateSvg.ts) because a
   cylinder does develop.
   ─────────────────────────────────────────────────────────────────────────── */

import type { EqualTubeElbowResult } from './equalTubeElbowGeometry.ts';
import { getPdfPageFormat, pdfFormatUsableWidthMm } from './pdfPageFormat.ts';
import type { PdfPageFormatId } from './pdfPageFormat.ts';

export interface EqualTubeGuideMeta {
  /** Must read: ELBOW MARKING GUIDE. */
  titleLabel: string;
  familyLabel: string;
  memberLabel: string;
  tubeLabel: string;
  /** PIPINGBOX · tube cut contour = tube ID · elbow marking = elbow OD. */
  conventionLabel: string;
  /** Must read: NOT A 1:1 FLAT CUT TEMPLATE … */
  guideNote: string;
  /** Must read: OD DIVISION STRIP 1:1 … */
  stripTitle: string;
  closureLabel: string;
  colStation: string;
  colTheta: string;
  colArcPos: string;
  colArcRadius: string;
  colArcLength: string;
  colBend: string;
  colLimit: string;
  /** Short cell text for a clamped station, e.g. "90 END". */
  limitCell: string;
  schematicTitle: string;
  /** Must read: SCHEMATIC — NOT TO SCALE. */
  notToScale: string;
  sectionLabel: string;
  elevationLabel: string;
  endPlaneLabel: string;
  endFaceLabel: string;
  arcDirectionLabel: string;
  steps: string[];
  pageLabel: string;
  overlapLabel: string;
  calibrationNote: string;
  printAtActualSize: string;
  generatedLabel: string;
}

export interface EqualTubeGuideOptions {
  format?: PdfPageFormatId;
  overlapMm?: number;
  meta: EqualTubeGuideMeta;
}

export interface EqualTubeGuideTile {
  pageIndex: number;
  pageCount: number;
  kind: 'strip' | 'table';
  stripCol: number;
  widthMm: number;
  heightMm: number;
  svg: string;
}

export interface EqualTubeGuideResult {
  tiles: EqualTubeGuideTile[];
  stripPagesX: number;
  tablePages: number;
  /** π·d.ex — the 1:1 strip length. */
  stripLengthMm: number;
  stationSpacingMm: number;
  stripPositionsMm: number[];
  overlapMm: number;
}

export const EQUAL_TUBE_GUIDE_PAD_MM = 2;
export const EQUAL_TUBE_GUIDE_OVERLAP_MM = 15;
export const EQUAL_TUBE_GUIDE_CALIBRATION_MM = 100;
const TITLE_ROWS = [8, 12.5, 17, 21.5, 26, 30.5, 34, 37.5, 41];
const STRIP_TOP = 52;
const STRIP_H = 26;
const STRIP_BOTTOM = STRIP_TOP + STRIP_H;
const MARK_Y = 48.5;
const BODY_TOP = STRIP_BOTTOM + 14;
const BOTTOM_BAND = 22;
const ROW_H = 4.2;
const TABLE_HEADER_H = 6;
const SCHEM_W = 96;
const COLS: [keyof EqualTubeGuideMeta, number][] = [
  ['colStation', 8], ['colTheta', 10], ['colArcPos', 13], ['colArcRadius', 14], ['colArcLength', 14], ['colBend', 10], ['colLimit', 11],
];
const BLOCK_W = COLS.reduce((sum, [, w]) => sum + w, 0) + 4;

const fmt = (v: number) => Number(v.toFixed(3)).toString();
const textW = (s: string, fs: number) => s.length * 0.6 * fs;

function wrap(s: string, fs: number, maxW: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (textW(next, fs) > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function arcPts(cx: number, cy: number, r: number, a0: number, a1: number, n = 24): string {
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push(`${fmt(cx + r * Math.cos(a))},${fmt(cy + r * Math.sin(a))}`);
  }
  return pts.join(' ');
}

export function buildEqualTubeGuide(
  result: EqualTubeElbowResult,
  options: EqualTubeGuideOptions,
): EqualTubeGuideResult | null {
  if (!result.valid || result.stations.length < 2) return null;

  const page = getPdfPageFormat(options.format);
  const PAGE_W = page.widthMm;
  const PAGE_H = page.heightMm;
  const M = page.safeMarginMm;
  const usableW = pdfFormatUsableWidthMm(page);
  const overlap = options.overlapMm ?? EQUAL_TUBE_GUIDE_OVERLAP_MM;
  const PAD = EQUAL_TUBE_GUIDE_PAD_MM;
  const { meta } = options;
  const RIGHT_X = PAGE_W - 6.5;
  const CALIB_Y = PAGE_H - BOTTOM_BAND + 10;
  const TABLE_BOTTOM = PAGE_H - BOTTOM_BAND - 4;

  const N = result.divisions;
  const stripLen = result.circumferenceMm;
  const stripPositions = result.stations.map(st => st.circumferentialPositionMm);
  const contentW = stripLen + 2 * PAD;
  const stepX = usableW - overlap;
  const stripPagesX = contentW <= usableW ? 1 : Math.ceil((contentW - usableW) / stepX) + 1;

  const rows = result.stations.length;
  const rowsPerBlock = Math.max(1, Math.floor((TABLE_BOTTOM - BODY_TOP - TABLE_HEADER_H) / ROW_H));
  const firstTableX0 = M + PAD + SCHEM_W + 6;
  const blocksFirst = Math.max(1, Math.floor((RIGHT_X - firstTableX0) / BLOCK_W));
  const blocksCont = Math.max(1, Math.floor((RIGHT_X - (M + PAD)) / BLOCK_W));
  const rowsFirst = blocksFirst * rowsPerBlock;
  const tablePages = rows <= rowsFirst ? 0 : Math.ceil((rows - rowsFirst) / (blocksCont * rowsPerBlock));
  const pageCount = stripPagesX + tablePages;

  const tiles: EqualTubeGuideTile[] = [];
  let pageIdx = 0;

  const titleBlock = (parts: string[], extraRight: string | null) => {
    const lx = M + PAD;
    parts.push(text(lx, TITLE_ROWS[0], 3.6, meta.titleLabel, 'start', '#000000', true));
    parts.push(text(lx, TITLE_ROWS[1], 2.8, `${meta.familyLabel} · ${meta.memberLabel}`, 'start', '#000000'));
    parts.push(text(lx, TITLE_ROWS[2], 2.8, meta.tubeLabel, 'start', '#222222'));
    parts.push(text(lx, TITLE_ROWS[3], 2.7,
      `R = ${fmt(result.elbowCenterlineRadiusMm)} mm · L = ${fmt(result.lengthMm)} mm · N = ${N} · ${fmt((result.angularStepRad * 180) / Math.PI)}°/P · Div = ${fmt(result.stationSpacingMm)} mm · pi x d.ex = ${fmt(stripLen)} mm`,
      'start', '#222222'));
    parts.push(text(lx, TITLE_ROWS[4], 2.7, meta.conventionLabel, 'start', '#222222'));
    parts.push(text(lx, TITLE_ROWS[5], 3.4, meta.printAtActualSize, 'start', '#000000', true));
    parts.push(text(lx, TITLE_ROWS[6], 2.7, meta.calibrationNote, 'start', '#222222'));
    parts.push(text(lx, TITLE_ROWS[7], 2.7, meta.guideNote, 'start', '#000000', true));
    parts.push(text(RIGHT_X, TITLE_ROWS[0], 3.4, `${meta.pageLabel} ${pageIdx + 1}/${pageCount}`, 'end', '#000000'));
    parts.push(text(RIGHT_X, TITLE_ROWS[1], 2.7, page.id, 'end', '#222222'));
    if (extraRight) parts.push(text(RIGHT_X, TITLE_ROWS[2], 2.7, extraRight, 'end', '#222222'));
  };

  const calibration = (parts: string[]) => {
    const cb = EQUAL_TUBE_GUIDE_CALIBRATION_MM;
    const cbX = RIGHT_X - cb - 22;
    parts.push(`<line data-calibration-mm="${cb}" x1="${cbX}" y1="${CALIB_Y}" x2="${cbX + cb}" y2="${CALIB_Y}" stroke="#000000" stroke-width="0.5"/>`);
    parts.push(`<line x1="${cbX}" y1="${CALIB_Y - 2}" x2="${cbX}" y2="${CALIB_Y + 2}" stroke="#000000" stroke-width="0.5"/>`);
    parts.push(`<line x1="${cbX + cb}" y1="${CALIB_Y - 2}" x2="${cbX + cb}" y2="${CALIB_Y + 2}" stroke="#000000" stroke-width="0.5"/>`);
    parts.push(text(cbX + cb / 2, CALIB_Y - 2.5, 3.0, `${cb} mm`, 'middle', '#000000'));
    parts.push(text(cbX + cb + 5, CALIB_Y + 1.2, 2.5, meta.generatedLabel, 'start', '#444444'));
  };

  /** Station table blocks from row `start`; every cell is a kernel value, verbatim. */
  const table = (parts: string[], x0: number, blocks: number, start: number): number => {
    let row = start;
    for (let b = 0; b < blocks && row < rows; b++) {
      const bx = x0 + b * BLOCK_W;
      let cx = bx;
      const hy = BODY_TOP + 3.5;
      for (const [key, w] of COLS) {
        parts.push(text(cx + w / 2, hy, 2.3, meta[key] as string, 'middle', '#000000', true));
        cx += w;
      }
      parts.push(`<line x1="${fmt(bx)}" y1="${fmt(BODY_TOP + TABLE_HEADER_H - 1)}" x2="${fmt(bx + BLOCK_W - 4)}" y2="${fmt(BODY_TOP + TABLE_HEADER_H - 1)}" stroke="#000000" stroke-width="0.3"/>`);
      for (let r = 0; r < rowsPerBlock && row < rows; r++, row++) {
        const st = result.stations[row];
        const isClosure = st.isClosure;
        const y = BODY_TOP + TABLE_HEADER_H + (r + 1) * ROW_H - 1;
        const cells = [
          isClosure ? meta.closureLabel : `P${row + 1}`,
          fmt((st.angleRad * 180) / Math.PI),
          fmt(st.circumferentialPositionMm),
          fmt(st.elbowArcRadiusMm),
          fmt(st.elbowArcLengthMm),
          fmt((st.elbowBendAngleRad * 180) / Math.PI),
          st.clampedAtElbowEnd ? meta.limitCell : '-',
        ];
        cx = bx;
        cells.forEach((cell, c) => {
          const w = COLS[c][1];
          parts.push(`<text data-table-station="${row}" data-col="${c}" data-clamped="${st.clampedAtElbowEnd}" x="${fmt(cx + w / 2)}" y="${fmt(y)}" font-size="2.3" text-anchor="middle" fill="${isClosure ? '#555555' : '#000000'}" font-family="monospace"${c === 6 && st.clampedAtElbowEnd ? ' font-weight="bold"' : ''}>${escapeXml(cell)}</text>`);
          cx += w;
        });
      }
    }
    return row;
  };

  const schematic = (parts: string[]) => {
    const x0 = M + PAD;
    const y0 = BODY_TOP;
    parts.push(text(x0, y0 + 3.5, 2.8, meta.schematicTitle, 'start', '#000000', true));
    parts.push(text(x0, y0 + 7.5, 2.3, meta.notToScale, 'start', '#444444'));
    /* Cross-section at the t = 0 end: P stations around the OD, θ from the bend plane. */
    const rr = 15;
    const cx = x0 + 22;
    const cy = y0 + 34;
    parts.push(text(x0, y0 + 11.5, 2.3, meta.sectionLabel, 'start', '#222222'));
    parts.push(`<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${rr}" fill="none" stroke="#000000" stroke-width="0.35"/>`);
    parts.push(`<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${rr * 0.86}" fill="none" stroke="#000000" stroke-width="0.25"/>`);
    parts.push(`<line x1="${fmt(cx - rr - 4)}" y1="${fmt(cy)}" x2="${fmt(cx + rr + 4)}" y2="${fmt(cy)}" stroke="#666666" stroke-width="0.2" stroke-dasharray="1.5,1"/>`);
    for (let k = 0; k < 8; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 4;
      const pxl = cx + rr * Math.cos(a);
      const pyl = cy + rr * Math.sin(a);
      parts.push(`<circle cx="${fmt(pxl)}" cy="${fmt(pyl)}" r="0.7" fill="#000000" stroke="none"/>`);
    }
    parts.push(text(cx, cy - rr - 2, 2.1, 'P1 (th = 0)', 'middle', '#000000'));
    parts.push(text(cx + rr + 4.5, cy + 0.8, 2.0, 'OD', 'start', '#000000'));
    parts.push(text(cx, cy + rr + 3.5, 2.1, 'Div = pi x d.ex / N', 'middle', '#000000'));
    /* Elevation: quarter elbow with the equal tube running along the bend plane. */
    const ex = x0 + 88;
    const ey = y0 + 52;
    const Ro = 36;
    const Ri = 22;
    parts.push(text(x0 + SCHEM_W, y0 + 15, 2.3, meta.elevationLabel, 'end', '#222222'));
    parts.push(`<polyline fill="none" stroke="#000000" stroke-width="0.35" points="${arcPts(ex, ey, Ro, 180, 270)}"/>`);
    parts.push(`<polyline fill="none" stroke="#000000" stroke-width="0.35" points="${arcPts(ex, ey, Ri, 180, 270)}"/>`);
    /* t = 0 end plane (free end, where the strip is wrapped). */
    parts.push(`<line x1="${fmt(ex - Ro)}" y1="${fmt(ey)}" x2="${fmt(ex - Ri)}" y2="${fmt(ey)}" stroke="#000000" stroke-width="0.5"/>`);
    parts.push(text(ex - Ro - 1, ey + 3.5, 2.0, 't = 0', 'start', '#000000'));
    /* 90° end face. */
    parts.push(`<line x1="${fmt(ex)}" y1="${fmt(ey - Ro)}" x2="${fmt(ex)}" y2="${fmt(ey - Ri)}" stroke="#000000" stroke-width="0.5" stroke-dasharray="1.5,1"/>`);
    parts.push(text(ex + 1.5, ey - Ro + 1, 2.0, '90', 'start', '#000000'));
    /* Equal tube: schematic chords continuing the t = 0 leg direction. */
    parts.push(`<line x1="${fmt(ex - Ro - 26)}" y1="${fmt(ey - (Ro + Ri) / 2 - 5)}" x2="${fmt(ex - Ro + 2)}" y2="${fmt(ey - (Ro + Ri) / 2 - 5)}" stroke="#000000" stroke-width="0.4"/>`);
    parts.push(`<line x1="${fmt(ex - Ro - 26)}" y1="${fmt(ey - (Ro + Ri) / 2 + 5)}" x2="${fmt(ex - Ro + 2)}" y2="${fmt(ey - (Ro + Ri) / 2 + 5)}" stroke="#000000" stroke-width="0.4"/>`);
    parts.push(text(ex - Ro - 25, ey - (Ro + Ri) / 2 - 7, 2.0, meta.memberLabel, 'start', '#000000'));
    /* Highlighted generating arc of a mid station with its Longitud arco. */
    const Rm = (Ro + Ri) / 2 + 4;
    parts.push(`<polyline fill="none" stroke="#000000" stroke-width="0.7" points="${arcPts(ex, ey, Rm, 180, 232)}"/>`);
    const cutA = (232 * Math.PI) / 180;
    parts.push(`<circle cx="${fmt(ex + Rm * Math.cos(cutA))}" cy="${fmt(ey + Rm * Math.sin(cutA))}" r="1" fill="#000000" stroke="none"/>`);
    parts.push(text(x0 + SCHEM_W, ey + 4, 2.0, meta.arcDirectionLabel, 'end', '#000000'));
    parts.push(text(ex - 20, ey - Ro - 3, 2.0, `R arco = R + r.ex sin(th)`, 'start', '#000000'));
    parts.push(text(x0, y0 + 66, 2.0, meta.endPlaneLabel, 'start', '#444444'));
    parts.push(text(x0, y0 + 69.5, 2.0, meta.endFaceLabel, 'start', '#444444'));
    let sy = y0 + 75;
    meta.steps.forEach((step, i) => {
      for (const line of wrap(`${i + 1}. ${step}`, 2.2, SCHEM_W)) {
        parts.push(text(x0, sy, 2.2, line, 'start', '#000000'));
        sy += 3.4;
      }
      sy += 0.6;
    });
  };

  /* ── Strip pages ── */
  let nextRow = 0;
  for (let px = 0; px < stripPagesX; px++) {
    const originC = px * stepX;
    const isFirst = px === 0;
    const isLast = px === stripPagesX - 1;
    const Xs = (pos: number) => pos + PAD + M - originC;
    const xL = M;
    const xR = M + usableW;
    const parts: string[] = [];
    parts.push(`<rect x="0" y="0" width="${PAGE_W}" height="${PAGE_H}" fill="#ffffff" stroke="none"/>`);
    titleBlock(parts, stripPagesX > 1 ? `${meta.overlapLabel} ${fmt(overlap)} mm · X ${px + 1}/${stripPagesX}` : null);

    parts.push(text(M + PAD, STRIP_TOP - 4.5, 2.8, meta.stripTitle, 'start', '#000000', true));
    const sx0 = Math.max(xL, Xs(0) - PAD);
    const sx1 = Math.min(xR, Xs(stripLen) + PAD);
    parts.push(`<rect data-strip-length-mm="${fmt(stripLen)}" data-od-strip-1to1="true" x="${fmt(sx0)}" y="${STRIP_TOP}" width="${fmt(sx1 - sx0)}" height="${STRIP_H}" fill="none" stroke="#000000" stroke-width="0.5"/>`);
    parts.push(`<line x1="${fmt(sx0 + 2)}" y1="${fmt(STRIP_BOTTOM + 3)}" x2="${fmt(sx0 + 22)}" y2="${fmt(STRIP_BOTTOM + 3)}" stroke="#000000" stroke-width="0.3"/>`);
    parts.push(`<polygon points="${fmt(sx0 + 22)},${fmt(STRIP_BOTTOM + 3)} ${fmt(sx0 + 19.5)},${fmt(STRIP_BOTTOM + 1.8)} ${fmt(sx0 + 19.5)},${fmt(STRIP_BOTTOM + 4.2)}" fill="#000000" stroke="none"/>`);
    parts.push(text(sx0 + 24, STRIP_BOTTOM + 4, 2.2, `th + · ${fmt((result.angularStepRad * 180) / Math.PI)} deg/P · Div ${fmt(result.stationSpacingMm)} mm`, 'start', '#000000'));

    const inWindow = (x: number) => x >= xL - 1e-9 && x <= xR + 1e-9;
    let lastLabelTop = -Infinity;
    let lastLabelBottom = -Infinity;
    for (let i = 0; i <= N; i++) {
      const x = Xs(stripPositions[i]);
      if (!inWindow(x)) continue;
      const isClosure = i === N;
      const even = i % 2 === 0;
      const full = i === 0 || isClosure;
      const y1 = full ? STRIP_TOP : even ? STRIP_TOP : STRIP_TOP + STRIP_H * 0.65;
      const y2 = full ? STRIP_BOTTOM : even ? STRIP_TOP + STRIP_H * 0.35 : STRIP_BOTTOM;
      parts.push(`<line data-strip-station="${i}" data-arc-position-mm="${fmt(stripPositions[i])}" data-closure="${isClosure}" x1="${fmt(x)}" y1="${fmt(y1)}" x2="${fmt(x)}" y2="${fmt(y2)}" stroke="#000000" stroke-width="${full ? 0.6 : 0.3}"/>`);
      const label = isClosure ? meta.closureLabel : `P${i + 1}`;
      const w = textW(label, 2.0);
      if (isClosure) {
        parts.push(text(Math.min(x, xR - 1 - w / 2), STRIP_TOP - 1, 2.0, label, 'middle', '#000000'));
      } else if (even && x - lastLabelTop >= w + 0.8) {
        parts.push(text(x, STRIP_TOP + STRIP_H * 0.35 + 2.6, 2.0, label, 'middle', '#000000'));
        lastLabelTop = x;
      } else if (!even && x - lastLabelBottom >= w + 0.8) {
        parts.push(text(x, STRIP_TOP + STRIP_H * 0.65 - 0.8, 2.0, label, 'middle', '#000000'));
        lastLabelBottom = x;
      }
    }
    const mark = (cx: number) => {
      parts.push(`<circle data-registration="1" cx="${fmt(cx)}" cy="${MARK_Y}" r="1.5" fill="none" stroke="#000000" stroke-width="0.3"/>`);
      parts.push(`<line x1="${fmt(cx - 2.5)}" y1="${MARK_Y}" x2="${fmt(cx + 2.5)}" y2="${MARK_Y}" stroke="#000000" stroke-width="0.3"/>`);
    };
    if (!isLast) mark(M + usableW - overlap / 2);
    if (!isFirst) mark(M + overlap / 2);

    if (isFirst) {
      schematic(parts);
      nextRow = table(parts, firstTableX0, blocksFirst, 0);
    }
    calibration(parts);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}mm" height="${PAGE_H}mm" viewBox="0 0 ${PAGE_W} ${PAGE_H}" data-physical-template="equal-tube-elbow-marking-guide" data-flat-cut-template="false" data-od-strip-1to1="true">${parts.join('')}</svg>`;
    tiles.push({ pageIndex: pageIdx, pageCount, kind: 'strip', stripCol: px, widthMm: PAGE_W, heightMm: PAGE_H, svg });
    pageIdx++;
  }

  /* ── Table continuation pages ── */
  for (let tp = 0; tp < tablePages; tp++) {
    const parts: string[] = [];
    parts.push(`<rect x="0" y="0" width="${PAGE_W}" height="${PAGE_H}" fill="#ffffff" stroke="none"/>`);
    titleBlock(parts, null);
    nextRow = table(parts, M + PAD, blocksCont, nextRow);
    calibration(parts);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}mm" height="${PAGE_H}mm" viewBox="0 0 ${PAGE_W} ${PAGE_H}" data-physical-template="equal-tube-elbow-marking-guide" data-flat-cut-template="false" data-od-strip-1to1="false">${parts.join('')}</svg>`;
    tiles.push({ pageIndex: pageIdx, pageCount, kind: 'table', stripCol: -1, widthMm: PAGE_W, heightMm: PAGE_H, svg });
    pageIdx++;
  }

  return {
    tiles, stripPagesX, tablePages, stripLengthMm: stripLen,
    stationSpacingMm: result.stationSpacingMm, stripPositionsMm: stripPositions, overlapMm: overlap,
  };
}

function text(x: number, y: number, fs: number, content: string, anchor: 'start' | 'middle' | 'end', fill: string, bold = false): string {
  const anchorAttr = anchor !== 'start' ? ` text-anchor="${anchor}"` : '';
  const boldAttr = bold ? ' font-weight="bold"' : '';
  return `<text x="${fmt(x)}" y="${fmt(y)}" font-size="${fs}"${anchorAttr}${boldAttr} fill="${fill}" font-family="monospace">${escapeXml(content)}</text>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
