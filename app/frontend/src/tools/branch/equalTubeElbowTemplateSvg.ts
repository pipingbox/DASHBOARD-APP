/* ───────────────────────────────────────────────────────────────────────────
   TUBO ⇄ CODO IGUALES — TUBE CUT TEMPLATE 1:1 — physical workshop PDF
   (PB-BRANCH-EQUAL-TUBE-ELBOW-001 U6.2).

   The tube is a CYLINDER: its cut contour has an exact flat development, so
   this sheet IS a true 1:1 cut template — unlike the elbow member, which is a
   torus and gets a separate MARKING GUIDE (equalTubeElbowGuideSvg.ts).

   Two ordinate modes, both physically honest:

     fromEnd (default)  Y = lengthMm − tubeCutPositionMm, the CUT-BACK measured
                        from the tube's square end at the elbow side. The strip
                        wraps with Y = 0 on that end and the fabricator cuts
                        above the curve. This is the only reference a short
                        strip can physically wrap against.
     cota               Y = tubeCutPositionMm (Cota tubo), the remaining tube
                        length from the FAR square end — the corpus/table value.
                        Shown for cross-checking against the station table.

   Page model follows branchTemplateSvg (H-001): landscape full-page tiles,
   5 mm safe margin, 2 mm content pad, X+Y tiling with 15 mm additive overlap,
   global page numbers, registration marks, 100 mm calibration on every page.
   Nothing is scaled to fit. No geometry is recomputed: every millimetre is
   copied from the U6.1 kernel result.
   ─────────────────────────────────────────────────────────────────────────── */

import type { EqualTubeElbowResult } from './equalTubeElbowGeometry.ts';
import { getPdfPageFormat, pdfFormatUsableWidthMm } from './pdfPageFormat.ts';
import type { PdfPageFormatId } from './pdfPageFormat.ts';

export type EqualTubeTemplateOrdinate = 'fromEnd' | 'cota';

export interface EqualTubeTemplateMeta {
  titleLabel: string;
  familyLabel: string;
  memberLabel: string;
  /** e.g. '3" Sch 40 · OD 88.9 mm · ID 77.92 mm · R 114.3 mm'. */
  tubeLabel: string;
  /** Must read: ORDINATES = CUT-BACK FROM THE SQUARE END AT THE ELBOW SIDE … */
  ordinateFromEndNote: string;
  /** Must read: ORDINATES = COTA TUBO measured from the FAR square end … */
  ordinateCotaNote: string;
  seamLabel: string;
  pageLabel: string;
  overlapLabel: string;
  wrapNoteLabel: string;
  calibrationNote: string;
  printAtActualSize: string;
  generatedLabel: string;
}

export interface EqualTubeTemplateOptions {
  format?: PdfPageFormatId;
  usableWidthMm?: number;
  usableHeightMm?: number;
  overlapMm?: number;
  ordinate: EqualTubeTemplateOrdinate;
  meta: EqualTubeTemplateMeta;
}

export interface EqualTubeTemplateTile {
  pageIndex: number;
  pageCount: number;
  originX: number;
  originY: number;
  pageCol: number;
  pageRow: number;
  widthMm: number;
  heightMm: number;
  svg: string;
}

export interface EqualTubeTemplateResult {
  tiles: EqualTubeTemplateTile[];
  tiled: boolean;
  exceedsUsableHeight: boolean;
  pagesX: number;
  pagesY: number;
  circumferenceMm: number;
  ordinateRangeMm: number;
}

const PAD_X = 2;
const TITLE_ROWS = [9, 15, 21, 27, 32.5, 37.5];
const CURVE_TOP = 48;
const SEAM_TOP = 45;
const MARK_Y = 47.5;
const BOTTOM_BAND = 60;
const MARK_X_LEFT = 14;

/** Canonical template coordinates: (arc, ordinate) in mm for station i. */
export function equalTubeTemplatePoint(
  result: EqualTubeElbowResult,
  index: number,
  ordinate: EqualTubeTemplateOrdinate,
): [number, number] {
  const st = result.stations[index];
  const y = ordinate === 'fromEnd'
    ? result.lengthMm - st.tubeCutPositionMm
    : st.tubeCutPositionMm;
  return [st.circumferentialPositionMm, y];
}

const fmt = (v: number) => Number(v.toFixed(3)).toString();
const textW = (s: string, fs: number) => s.length * 0.6 * fs;

export function buildEqualTubeTemplate(
  result: EqualTubeElbowResult,
  options: EqualTubeTemplateOptions,
): EqualTubeTemplateResult {
  const page = getPdfPageFormat(options.format);
  const PAGE_W = page.widthMm;
  const PAGE_H = page.heightMm;
  const M = page.safeMarginMm;
  const usableW = options.usableWidthMm ?? pdfFormatUsableWidthMm(page);
  const overlap = options.overlapMm ?? 15;
  const { meta } = options;

  const BASELINE = PAGE_H - BOTTOM_BAND;
  const STATION_ROW_NUM = BASELINE + 12;
  const STATION_ROW_ARC = BASELINE + 17.5;
  const STATION_ROW_THETA = BASELINE + 23;
  const CALIB_Y = BASELINE + 30;
  const RIGHT_X = PAGE_W - 6.5;
  const CURVE_WINDOW = BASELINE - CURVE_TOP;
  const clampLabelX = (x: number, w: number) => Math.min(Math.max(x, M + 1.5 + w / 2), RIGHT_X - w / 2);

  const C = result.circumferenceMm;
  const N = result.divisions;
  const ys = result.stations.map((_, i) => equalTubeTemplatePoint(result, i, options.ordinate)[1]);
  const yMin = Math.min(...ys);
  const range = Math.max(...ys) - yMin;

  const usableH = options.usableHeightMm ?? CURVE_WINDOW;
  const contentH = range + 2 * PAD_X;
  const stepY = usableH - overlap;
  const pagesY = contentH <= usableH ? 1 : Math.ceil((contentH - usableH) / stepY) + 1;
  const exceedsUsableHeight = pagesY > 1;

  const contentW = C + 2 * PAD_X;
  const step = usableW - overlap;
  const pagesX = contentW <= usableW ? 1 : Math.ceil((contentW - usableW) / step) + 1;
  const pageCount = pagesX * pagesY;

  const spacing = result.stationSpacingMm;
  const arcLabelW = textW(fmt(C), 2.6);
  const labelStep = Math.max(1, Math.ceil(arcLabelW / (0.95 * spacing)));

  const tiles: EqualTubeTemplateTile[] = [];
  let pageIdx = 0;
  for (let py = 0; py < pagesY; py++) {
    for (let p = 0; p < pagesX; p++) {
      const originC = p * step;
      const originX = originC - PAD_X;
      const originY = py * stepY;
      const isFirst = p === 0;
      const isLast = p === pagesX - 1;
      const isFirstY = py === 0;
      const isLastY = py === pagesY - 1;

      const X = (arc: number) => fmt(arc + PAD_X + M - originC);
      const Yraw = (ord: number) => BASELINE - ((ord - yMin) - originY);
      const Y = (ord: number) => fmt(Yraw(ord));

      const parts: string[] = [];
      parts.push(`<rect x="0" y="0" width="${PAGE_W}" height="${PAGE_H}" fill="#ffffff" stroke="none"/>`);

      /* Title block. */
      parts.push(text(M + PAD_X, TITLE_ROWS[0], 3.6, meta.titleLabel, 'start', '#000000'));
      parts.push(text(M + PAD_X, TITLE_ROWS[1], 3.0, `${meta.familyLabel} · ${meta.memberLabel}`, 'start', '#222222'));
      parts.push(text(M + PAD_X, TITLE_ROWS[2], 3.0, meta.tubeLabel, 'start', '#222222'));
      parts.push(text(M + PAD_X, TITLE_ROWS[3], 3.0, `pi x OD = ${fmt(C)} mm · N = ${N} · dt = ${fmt((result.angularStepRad * 180) / Math.PI)}° · Div = ${fmt(spacing)} mm · L = ${fmt(result.lengthMm)} mm`, 'start', '#222222'));
      parts.push(text(M + PAD_X, TITLE_ROWS[4], 3.4, meta.printAtActualSize, 'start', '#000000', true));
      const ordinateNote = options.ordinate === 'fromEnd' ? meta.ordinateFromEndNote : meta.ordinateCotaNote;
      parts.push(text(M + PAD_X, TITLE_ROWS[5], 2.7, ordinateNote, 'start', '#000000', true));
      parts.push(text(RIGHT_X, TITLE_ROWS[0], 3.4, `${meta.pageLabel} ${pageIdx + 1}/${pageCount}`, 'end', '#000000'));
      if (!isLast || !isLastY) {
        parts.push(text(RIGHT_X, TITLE_ROWS[1], 2.7, `${meta.overlapLabel} ${fmt(overlap)} mm`, 'end', '#222222'));
      }

      /* Cut contour: single polyline when fully visible; clipped segments otherwise. */
      const rawPts: [number, number][] = result.stations.map((_, i) => {
        const [ax, ord] = equalTubeTemplatePoint(result, i, options.ordinate);
        return [Number(X(ax)), Yraw(ord)];
      });
      const clippedSegs: string[] = [];
      let allVisible = true;
      for (let i = 0; i < rawPts.length - 1; i++) {
        const [x0, y0] = rawPts[i];
        const [x1, y1] = rawPts[i + 1];
        let t0 = 0;
        let t1 = 1;
        if (y1 !== y0) {
          const tTop = (CURVE_TOP - y0) / (y1 - y0);
          const tBot = (BASELINE - y0) / (y1 - y0);
          t0 = Math.max(t0, Math.min(tTop, tBot));
          t1 = Math.min(t1, Math.max(tTop, tBot));
        } else if (y0 < CURVE_TOP || y0 > BASELINE) {
          t0 = 1;
          t1 = 0;
        }
        if (t0 >= t1) { allVisible = false; continue; }
        if (t0 !== 0 || t1 !== 1) allVisible = false;
        clippedSegs.push(`<line data-seg="${i}" x1="${fmt(x0 + (x1 - x0) * t0)}" y1="${fmt(y0 + (y1 - y0) * t0)}" x2="${fmt(x0 + (x1 - x0) * t1)}" y2="${fmt(y0 + (y1 - y0) * t1)}" stroke="#000000" stroke-width="0.6"/>`);
      }
      if (allVisible) {
        const pts = result.stations.map((_, i) => {
          const [ax, ord] = equalTubeTemplatePoint(result, i, options.ordinate);
          return `${X(ax)},${Y(ord)}`;
        }).join(' ');
        parts.push(`<polyline points="${pts}" fill="none" stroke="#000000" stroke-width="0.6"/>`);
      } else {
        parts.push(clippedSegs.join(''));
      }

      /* Station generator lines + labels. */
      for (let i = 0; i < result.stations.length; i++) {
        const st = result.stations[i];
        const cc = st.circumferentialPositionMm + PAD_X;
        if (cc < originC - 1e-9 || cc > originC + usableW + 1e-9) continue;
        const x = X(st.circumferentialPositionMm);
        const ord = ys[i];
        const y1 = fmt(Math.min(Math.max(Yraw(ord), CURVE_TOP), BASELINE));
        const isClosure = st.isClosure;
        parts.push(`<line data-station="${i}" x1="${x}" y1="${y1}" x2="${x}" y2="${fmt(STATION_ROW_NUM - 5)}" stroke="#888888" stroke-width="0.2" stroke-dasharray="2,1.5"/>`);
        const numTxt = isClosure ? '≡1' : String(i + 1);
        parts.push(text(clampLabelX(Number(x), textW(numTxt, 3.2)), STATION_ROW_NUM, 3.2, numTxt, 'middle', '#000000'));
        if (!isClosure && i % labelStep === 0) {
          const arcTxt = fmt(st.circumferentialPositionMm);
          parts.push(text(clampLabelX(Number(x), textW(arcTxt, 2.6)), STATION_ROW_ARC, 2.6, arcTxt, 'middle', '#222222'));
          const thTxt = `${fmt((st.angleRad * 180) / Math.PI)}°`;
          parts.push(text(clampLabelX(Number(x), textW(thTxt, 2.6)), STATION_ROW_THETA, 2.6, thTxt, 'middle', '#444444'));
        }
      }

      /* Seam lines (0° and 360°). */
      if (isFirst) {
        parts.push(`<line x1="${X(0)}" y1="${SEAM_TOP}" x2="${X(0)}" y2="${fmt(STATION_ROW_NUM - 5)}" stroke="#000000" stroke-width="0.5" stroke-dasharray="5,2"/>`);
        parts.push(text(Number(X(0)) + 1.5, SEAM_TOP - 2, 3.0, `${meta.seamLabel} 0°`, 'start', '#000000'));
        parts.push(text(M + PAD_X, SEAM_TOP - 2, 2.7, meta.wrapNoteLabel, 'start', '#000000'));
      }
      if (isLast) {
        parts.push(`<line x1="${X(C)}" y1="${SEAM_TOP}" x2="${X(C)}" y2="${fmt(STATION_ROW_NUM - 5)}" stroke="#000000" stroke-width="0.5" stroke-dasharray="5,2"/>`);
        parts.push(text(Number(X(C)) - 1.5, SEAM_TOP - 2, 3.0, `${meta.seamLabel} 360°`, 'end', '#000000'));
      }

      /* 100 mm calibration bar on every page. */
      const cbX = M + PAD_X;
      parts.push(`<line x1="${cbX}" y1="${CALIB_Y}" x2="${cbX + 100}" y2="${CALIB_Y}" stroke="#000000" stroke-width="0.5"/>`);
      parts.push(`<line x1="${cbX}" y1="${CALIB_Y - 2}" x2="${cbX}" y2="${CALIB_Y + 2}" stroke="#000000" stroke-width="0.5"/>`);
      parts.push(`<line x1="${cbX + 100}" y1="${CALIB_Y - 2}" x2="${cbX + 100}" y2="${CALIB_Y + 2}" stroke="#000000" stroke-width="0.5"/>`);
      parts.push(text(cbX + 50, CALIB_Y - 2.5, 3.0, '100 mm', 'middle', '#000000'));
      parts.push(text(cbX + 105, CALIB_Y + 1.2, 2.5, meta.generatedLabel, 'start', '#444444'));
      parts.push(text(cbX, CALIB_Y + 4.5, 2.5, meta.calibrationNote, 'start', '#222222', true));

      /* Registration marks (tiled pages). */
      if (!isLast) {
        const cx = fmt(M + usableW - overlap / 2);
        parts.push(`<circle cx="${cx}" cy="${MARK_Y}" r="1.5" fill="none" stroke="#000000" stroke-width="0.3"/>`);
        parts.push(`<line x1="${fmt(M + usableW - overlap / 2 - 2.5)}" y1="${MARK_Y}" x2="${fmt(M + usableW - overlap / 2 + 2.5)}" y2="${MARK_Y}" stroke="#000000" stroke-width="0.3"/>`);
      }
      if (!isFirst) {
        const cx = fmt(M + overlap / 2);
        parts.push(`<circle cx="${cx}" cy="${MARK_Y}" r="1.5" fill="none" stroke="#000000" stroke-width="0.3"/>`);
        parts.push(`<line x1="${fmt(M + overlap / 2 - 2.5)}" y1="${MARK_Y}" x2="${fmt(M + overlap / 2 + 2.5)}" y2="${MARK_Y}" stroke="#000000" stroke-width="0.3"/>`);
      }
      if (!isLastY) {
        const my = fmt(CURVE_TOP + overlap / 2);
        parts.push(`<circle cx="${MARK_X_LEFT}" cy="${my}" r="1.5" fill="none" stroke="#000000" stroke-width="0.3"/>`);
        parts.push(`<line x1="${MARK_X_LEFT - 2.5}" y1="${my}" x2="${MARK_X_LEFT + 2.5}" y2="${my}" stroke="#000000" stroke-width="0.3"/>`);
      }
      if (!isFirstY) {
        const my = fmt(BASELINE - overlap / 2);
        parts.push(`<circle cx="${MARK_X_LEFT}" cy="${my}" r="1.5" fill="none" stroke="#000000" stroke-width="0.3"/>`);
        parts.push(`<line x1="${MARK_X_LEFT - 2.5}" y1="${my}" x2="${MARK_X_LEFT + 2.5}" y2="${my}" stroke="#000000" stroke-width="0.3"/>`);
      }

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}mm" height="${PAGE_H}mm" viewBox="0 0 ${PAGE_W} ${PAGE_H}" data-physical-template="equal-tube-elbow-tube-cut" data-flat-cut-template="true" data-ordinate="${options.ordinate}">${parts.join('')}</svg>`;
      tiles.push({ pageIndex: pageIdx, pageCount, originX, originY, pageCol: p, pageRow: py, widthMm: PAGE_W, heightMm: PAGE_H, svg });
      pageIdx++;
    }
  }

  return { tiles, tiled: pageCount > 1, exceedsUsableHeight, pagesX, pagesY, circumferenceMm: C, ordinateRangeMm: range };
}

function text(x: number, y: number, fs: number, content: string, anchor: 'start' | 'middle' | 'end', fill: string, bold = false): string {
  const anchorAttr = anchor !== 'start' ? ` text-anchor="${anchor}"` : '';
  const boldAttr = bold ? ' font-weight="bold"' : '';
  return `<text x="${fmt(x)}" y="${fmt(y)}" font-size="${fs}"${anchorAttr}${boldAttr} fill="${fill}" font-family="monospace">${escapeXml(content)}</text>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
