/* ───────────────────────────────────────────────────────────────────────────
   TUBO→CODO — physical 1:1 CUT TEMPLATE for the BRANCH TUBE
   (PB-BRANCH-INJERTO-EXPANSION-001 U4).

   The branch tube is a cylinder, so its cut profile develops EXACTLY onto a
   plane:  X = circumferential arc position on the branch OD,
           Y = cut ordinate (injerto) measured from the square-cut end.
   Both come verbatim from BranchOnElbowResult (U1). The template wraps around
   the branch OD: developed length = π · OD = developedCircumference.

   Page model — same physical contract as the H-001 tube→tube template
   (branchTemplateSvg.ts) so the workshop handles both sheets identically:
   - shared pdfPageFormat source of truth (A4–A0 landscape, 5 mm safe border);
   - 1 SVG unit = 1 mm, no scale-to-fit, every tile is a full page;
   - internal content pad 2 mm, fixed additive overlap 15 mm, X+Y tiling with
     global page numbers and registration marks at the overlap centres;
   - 100 mm calibration bar and "PRINT AT 100% / ACTUAL SIZE" on every page;
   - clipping only (Liang–Barsky against the usable window), never scaling.

   This module lays out a DIFFERENT family (curved header) and therefore has
   its own title block; it does not touch branchTemplateSvg.ts and shares the
   single PDF engine svgMmToPdf.ts. Deterministic: no timestamps, no ids.
   Station markers carry data-* attributes with the exact U1 millimetres so
   tests verify the physical positions.
   ─────────────────────────────────────────────────────────────────────────── */

import type { BranchOnElbowResult } from './branchOnElbowGeometry';
import { getPdfPageFormat, pdfFormatUsableWidthMm } from './pdfPageFormat.ts';
import type { PdfPageFormatId } from './pdfPageFormat.ts';

export interface BranchOnElbowTemplateMeta {
  /** e.g. "CUT TEMPLATE 1:1 — BRANCH TUBE (tube → elbow)". */
  titleLabel: string;
  /** e.g. "TUBO-CODO". */
  familyLabel: string;
  /** Resolved datum text, e.g. "EJE" or "COTA Fe = +20 mm". */
  datumLabel: string;
  /** e.g. '3" Sch 40 · OD 88.9 mm · ID 77.92 mm'. */
  branchLabel: string;
  /** e.g. '6" · D 168.3 mm · R 228.6 mm'. */
  elbowLabel: string;
  /** Fabrication convention; must state the PIPINGBOX SET-ON OD cut reference. */
  conventionLabel: string;
  seamLabel: string;
  pageLabel: string;
  overlapLabel: string;
  /** Label for the minimum-injerto baseline row, e.g. "Baseline (min injerto from square end)". */
  baselineLabel: string;
  /** Label for the per-station injerto row, e.g. "injerto". */
  injertoLabel: string;
  wrapNoteLabel: string;
  calibrationNote: string;
  /** Literal required instruction; kept in English on purpose. */
  printAtActualSize: string;
  generatedLabel: string;
}

export interface BranchOnElbowTemplateOptions {
  /** Physical page format (shared source of truth). Default A4 landscape. */
  format?: PdfPageFormatId;
  /** Fixed additive overlap between tiles — mm. Default 15 (H-001 value). */
  overlapMm?: number;
  meta: BranchOnElbowTemplateMeta;
}

export interface BranchOnElbowTemplateTile {
  pageIndex: number;
  pageCount: number;
  pageCol: number;
  pageRow: number;
  /** Development arc coordinate at this tile's left usable edge — mm (diagnostic). */
  originX: number;
  /** Ordinate s = injerto − min(injerto) at this tile's bottom window edge — mm. */
  originY: number;
  widthMm: number;
  heightMm: number;
  svg: string;
}

export interface BranchOnElbowTemplateResult {
  tiles: BranchOnElbowTemplateTile[];
  tiled: boolean;
  pagesX: number;
  pagesY: number;
  /** π · OD — mm. */
  circumferenceMm: number;
  /** max(injerto) − min(injerto) — mm. */
  ordinateRangeMm: number;
  /** min(injerto): distance from the square-cut end to the template baseline — mm. */
  baselineFromEndMm: number;
  overlapMm: number;
  usableWidthMm: number;
  usableHeightMm: number;
}

/* Page geometry (mm). Identical physical constants to the H-001 template. */
export const ELBOW_TEMPLATE_PAD_MM = 2;
export const ELBOW_TEMPLATE_OVERLAP_MM = 15;
export const ELBOW_TEMPLATE_CALIBRATION_MM = 100;
const TITLE_ROWS = [8, 12.5, 17, 21.5, 26, 30.5, 34, 37.5];
const CURVE_TOP = 48;
const SEAM_TOP = 45;
const MARK_Y = 47.5;
const BOTTOM_BAND = 60;
const MARK_X_LEFT = 14;

const fmt = (v: number) => Number(v.toFixed(3)).toString();
/** Estimated Courier text width in mm (0.6 em advance per glyph). */
const textW = (s: string, fs: number) => s.length * 0.6 * fs;

/** Canonical template coordinates for station i: [arc position, injerto] — mm. */
export function elbowTemplatePoint(result: BranchOnElbowResult, index: number): [number, number] {
  const st = result.stations[index];
  return [st.arcPosition, st.cutOrdinate];
}

/** Liang–Barsky clip of segment (x0,y0)-(x1,y1) to [xL,xR]×[yT,yB]; null when fully outside. */
function clipSegment(
  x0: number, y0: number, x1: number, y1: number,
  xL: number, xR: number, yT: number, yB: number,
): [number, number, number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const edges: [number, number][] = [[-dx, x0 - xL], [dx, xR - x0], [-dy, y0 - yT], [dy, yB - y0]];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < -1e-9) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return [x0 + dx * t0, y0 + dy * t0, x0 + dx * t1, y0 + dy * t1];
}

export function buildBranchOnElbowCutTemplate(
  result: BranchOnElbowResult,
  options: BranchOnElbowTemplateOptions,
): BranchOnElbowTemplateResult | null {
  if (!result.valid || result.stations.length < 2) return null;

  const page = getPdfPageFormat(options.format);
  const PAGE_W = page.widthMm;
  const PAGE_H = page.heightMm;
  const M = page.safeMarginMm;
  const usableW = pdfFormatUsableWidthMm(page);
  const overlap = options.overlapMm ?? ELBOW_TEMPLATE_OVERLAP_MM;
  const PAD = ELBOW_TEMPLATE_PAD_MM;
  const { meta } = options;

  const BASELINE = PAGE_H - BOTTOM_BAND;
  const ROW_NUM = BASELINE + 11;
  const ROW_ARC = BASELINE + 15.5;
  const ROW_THETA = BASELINE + 22.5;
  const ROW_INJERTO = BASELINE + 26.5;
  const STAGGER_DY = 3.5;
  const CALIB_Y = BASELINE + 36;
  const RIGHT_X = PAGE_W - 6.5;
  const CURVE_WINDOW = BASELINE - CURVE_TOP;
  const clampLabelX = (x: number, w: number) => Math.min(Math.max(x, M + 1.5 + w / 2), RIGHT_X - w / 2);

  const C = result.developedCircumference;
  /* stations = N physical + closure (repeats P1). */
  const N = result.stations.length - 1;
  const ys = result.stations.map(st => st.cutOrdinate);
  const yMin = Math.min(...ys);
  const range = Math.max(...ys) - yMin;

  /* X+Y tiling — same arithmetic as PB-BRANCH-CUT-TILING-Y-001. */
  const usableH = CURVE_WINDOW;
  const contentH = range + 2 * PAD;
  const stepY = usableH - overlap;
  const pagesY = contentH <= usableH ? 1 : Math.ceil((contentH - usableH) / stepY) + 1;
  const contentW = C + 2 * PAD;
  const stepX = usableW - overlap;
  const pagesX = contentW <= usableW ? 1 : Math.ceil((contentW - usableW) / stepX) + 1;
  const pageCount = pagesX * pagesY;

  /* Numeric rows: stagger odd/even labels onto two rows when a value is wider than
     the station pitch; thin further only if two pitches are still too narrow.
     Station numbers are never thinned. */
  const widest = Math.max(textW(fmt(C), 2.6), textW(fmt(Math.max(...ys)), 2.6));
  const stagger = widest > 0.85 * result.stationSpacing;
  const labelStep = stagger ? Math.max(1, Math.ceil(widest / (0.85 * 2 * result.stationSpacing))) : 1;

  const tiles: BranchOnElbowTemplateTile[] = [];
  let pageIdx = 0;
  for (let py = 0; py < pagesY; py++) {
    for (let px = 0; px < pagesX; px++) {
      const originC = px * stepX;
      const originX = originC - PAD;
      const originY = py * stepY;
      const isFirst = px === 0;
      const isLast = px === pagesX - 1;
      const isFirstY = py === 0;
      const isLastY = py === pagesY - 1;

      /* Content arc → page x; injerto → page y (bottom-anchored ordinate band). */
      const Xraw = (arc: number) => arc + PAD + M - originC;
      const Yraw = (ord: number) => BASELINE - ((ord - yMin) - originY);
      const X = (arc: number) => fmt(Xraw(arc));
      const Y = (ord: number) => fmt(Yraw(ord));
      const xL = M;
      const xR = M + usableW;

      const parts: string[] = [];
      parts.push(`<rect x="0" y="0" width="${PAGE_W}" height="${PAGE_H}" fill="#ffffff" stroke="none"/>`);

      /* ── Title block ── */
      const lx = M + PAD;
      parts.push(text(lx, TITLE_ROWS[0], 3.6, meta.titleLabel, 'start', '#000000', true));
      parts.push(text(lx, TITLE_ROWS[1], 2.8, `${meta.familyLabel} · ${meta.datumLabel}`, 'start', '#000000'));
      parts.push(text(lx, TITLE_ROWS[2], 2.8, meta.branchLabel, 'start', '#222222'));
      parts.push(text(lx, TITLE_ROWS[3], 2.8, meta.elbowLabel, 'start', '#222222'));
      parts.push(text(lx, TITLE_ROWS[4], 2.7,
        `N = ${N} · ${fmt(result.angularStepDeg)}°/station · C = π·OD = ${fmt(C)} mm · C/N = ${fmt(result.stationSpacing)} mm`,
        'start', '#222222'));
      parts.push(text(lx, TITLE_ROWS[5], 3.4, meta.printAtActualSize, 'start', '#000000', true));
      parts.push(text(lx, TITLE_ROWS[6], 2.7, meta.calibrationNote, 'start', '#222222'));
      parts.push(text(lx, TITLE_ROWS[7], 2.7, meta.wrapNoteLabel, 'start', '#222222'));

      parts.push(text(RIGHT_X, TITLE_ROWS[0], 3.4, `${meta.pageLabel} ${pageIdx + 1}/${pageCount}`, 'end', '#000000'));
      parts.push(text(RIGHT_X, TITLE_ROWS[1], 2.7, `${page.id} · X ${px + 1}/${pagesX} · Y ${py + 1}/${pagesY}`, 'end', '#222222'));
      if (pageCount > 1) {
        parts.push(text(RIGHT_X, TITLE_ROWS[2], 2.7, `${meta.overlapLabel} ${fmt(overlap)} mm`, 'end', '#222222'));
      }
      parts.push(text(RIGHT_X, TITLE_ROWS[3], 2.7, meta.conventionLabel, 'end', '#222222'));

      /* ── Cut contour through the U1 stations (clipped, never scaled) ── */
      const raw = result.stations.map((_, i) => {
        const [arc, ord] = elbowTemplatePoint(result, i);
        return [Xraw(arc), Yraw(ord)] as [number, number];
      });
      let allVisible = true;
      const segs: string[] = [];
      for (let i = 0; i < raw.length - 1; i++) {
        const [x0, y0] = raw[i];
        const [x1, y1] = raw[i + 1];
        const c = clipSegment(x0, y0, x1, y1, xL, xR, CURVE_TOP, BASELINE);
        if (!c) { allVisible = false; continue; }
        const untouched = Math.abs(c[0] - x0) < 1e-9 && Math.abs(c[1] - y0) < 1e-9
          && Math.abs(c[2] - x1) < 1e-9 && Math.abs(c[3] - y1) < 1e-9;
        if (!untouched) allVisible = false;
        segs.push(`<line data-seg="${i}" x1="${fmt(c[0])}" y1="${fmt(c[1])}" x2="${fmt(c[2])}" y2="${fmt(c[3])}" stroke="#000000" stroke-width="0.6"/>`);
      }
      if (allVisible) {
        const pts = result.stations.map((_, i) => {
          const [arc, ord] = elbowTemplatePoint(result, i);
          return `${X(arc)},${Y(ord)}`;
        }).join(' ');
        parts.push(`<polyline data-cut-curve="u1-stations" points="${pts}" fill="none" stroke="#000000" stroke-width="0.6"/>`);
      } else {
        parts.push(segs.join(''));
      }

      /* ── Station markers with exact U1 millimetres (only inside this tile's window) ── */
      for (let i = 0; i < result.stations.length; i++) {
        const st = result.stations[i];
        const [x, y] = raw[i];
        if (x < xL - 1e-9 || x > xR + 1e-9 || y < CURVE_TOP - 1e-9 || y > BASELINE + 1e-9) continue;
        parts.push(`<circle data-station-point="${i}" data-arc-mm="${fmt(st.arcPosition)}" data-injerto-mm="${fmt(st.cutOrdinate)}" cx="${fmt(x)}" cy="${fmt(y)}" r="0.5" fill="#000000" stroke="none"/>`);
      }

      /* ── Baseline (min injerto) ── */
      const edgeAttr = isFirstY ? `data-baseline-mm="${fmt(yMin)}"` : `data-window-edge="bottom" data-ordinate-mm="${fmt(yMin + originY)}"`;
      parts.push(`<line ${edgeAttr} x1="${fmt(xL)}" y1="${fmt(BASELINE)}" x2="${fmt(xR)}" y2="${fmt(BASELINE)}" stroke="#555555" stroke-width="0.25" stroke-dasharray="1.5,1.5"/>`);
      if (isFirstY) {
        const labelRight = isLast ? Math.min(RIGHT_X, Xraw(C) - 2) : RIGHT_X;
        parts.push(text(labelRight, BASELINE + 3.2, 2.5, `${meta.baselineLabel} = ${fmt(yMin)} mm`, 'end', '#444444'));
        if (isFirst) {
          parts.push(text(M + 1.5, BASELINE + 3.2, 2.5, meta.injertoLabel, 'start', '#444444'));
        }
      }

      /* ── Station generator lines + label rows ── */
      for (let i = 0; i < result.stations.length; i++) {
        const st = result.stations[i];
        const cc = st.arcPosition + PAD;
        if (cc < originC - 1e-9 || cc > originC + usableW + 1e-9) continue;
        const x = Xraw(st.arcPosition);
        const y1 = fmt(Math.min(Math.max(Yraw(st.cutOrdinate), CURVE_TOP), BASELINE));
        const isClosure = i === result.stations.length - 1;
        parts.push(`<line data-station="${i}" x1="${fmt(x)}" y1="${y1}" x2="${fmt(x)}" y2="${fmt(ROW_NUM - 5)}" stroke="#888888" stroke-width="0.2" stroke-dasharray="2,1.5"/>`);
        const numTxt = isClosure ? '≡1' : String(i + 1);
        parts.push(text(clampLabelX(x, textW(numTxt, 3.2)), ROW_NUM, 3.2, numTxt, 'middle', '#000000'));
        if (!isClosure && i % labelStep === 0) {
          const dy = stagger && ((i / labelStep) % 2 === 1) ? STAGGER_DY : 0;
          const arcTxt = fmt(st.arcPosition);
          parts.push(text(clampLabelX(x, textW(arcTxt, 2.6)), ROW_ARC + dy, 2.6, arcTxt, 'middle', '#222222'));
          const thTxt = `${fmt(st.thetaDeg)}°`;
          parts.push(text(clampLabelX(x, textW(thTxt, 2.6)), ROW_THETA, 2.6, thTxt, 'middle', '#444444'));
          const injTxt = fmt(st.cutOrdinate);
          parts.push(text(clampLabelX(x, textW(injTxt, 2.6)), ROW_INJERTO + dy, 2.6, injTxt, 'middle', '#000000'));
        }
      }

      /* ── Seam lines (0° and 360°) ── */
      if (isFirst) {
        parts.push(`<line data-seam="0" x1="${X(0)}" y1="${SEAM_TOP}" x2="${X(0)}" y2="${fmt(ROW_NUM - 5)}" stroke="#000000" stroke-width="0.5" stroke-dasharray="5,2"/>`);
        parts.push(text(Xraw(0) + 1.5, SEAM_TOP - 2, 3.0, `${meta.seamLabel} 0°`, 'start', '#000000'));
      }
      if (isLast) {
        parts.push(`<line data-seam="360" x1="${X(C)}" y1="${SEAM_TOP}" x2="${X(C)}" y2="${fmt(ROW_NUM - 5)}" stroke="#000000" stroke-width="0.5" stroke-dasharray="5,2"/>`);
        parts.push(text(Xraw(C) - 1.5, SEAM_TOP - 2, 3.0, `${meta.seamLabel} 360°`, 'end', '#000000'));
      }

      /* ── 100 mm calibration bar (every page) ── */
      const cbX = M + PAD;
      const cb = ELBOW_TEMPLATE_CALIBRATION_MM;
      parts.push(`<line data-calibration-mm="${cb}" x1="${cbX}" y1="${CALIB_Y}" x2="${cbX + cb}" y2="${CALIB_Y}" stroke="#000000" stroke-width="0.5"/>`);
      parts.push(`<line x1="${cbX}" y1="${CALIB_Y - 2}" x2="${cbX}" y2="${CALIB_Y + 2}" stroke="#000000" stroke-width="0.5"/>`);
      parts.push(`<line x1="${cbX + cb}" y1="${CALIB_Y - 2}" x2="${cbX + cb}" y2="${CALIB_Y + 2}" stroke="#000000" stroke-width="0.5"/>`);
      parts.push(text(cbX + cb / 2, CALIB_Y - 2.5, 3.0, `${cb} mm`, 'middle', '#000000'));
      parts.push(text(cbX + cb + 5, CALIB_Y + 1.2, 2.5, meta.generatedLabel, 'start', '#444444'));

      /* ── Registration marks at the overlap centres (tiled pages) ── */
      const mark = (cx: number, cy: number) => {
        parts.push(`<circle data-registration="1" cx="${fmt(cx)}" cy="${fmt(cy)}" r="1.5" fill="none" stroke="#000000" stroke-width="0.3"/>`);
        parts.push(`<line x1="${fmt(cx - 2.5)}" y1="${fmt(cy)}" x2="${fmt(cx + 2.5)}" y2="${fmt(cy)}" stroke="#000000" stroke-width="0.3"/>`);
      };
      if (!isLast) mark(M + usableW - overlap / 2, MARK_Y);
      if (!isFirst) mark(M + overlap / 2, MARK_Y);
      if (!isLastY) mark(MARK_X_LEFT, CURVE_TOP + overlap / 2);
      if (!isFirstY) mark(MARK_X_LEFT, BASELINE - overlap / 2);

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}mm" height="${PAGE_H}mm" viewBox="0 0 ${PAGE_W} ${PAGE_H}" data-physical-template="branch-on-elbow-cut" data-origin-arc-mm="${fmt(originX)}" data-origin-ordinate-mm="${fmt(originY)}" data-baseline-mm="${fmt(yMin)}">${parts.join('')}</svg>`;
      tiles.push({ pageIndex: pageIdx, pageCount, pageCol: px, pageRow: py, originX, originY, widthMm: PAGE_W, heightMm: PAGE_H, svg });
      pageIdx++;
    }
  }

  return {
    tiles, tiled: pageCount > 1, pagesX, pagesY,
    circumferenceMm: C, ordinateRangeMm: range, baselineFromEndMm: yMin,
    overlapMm: overlap, usableWidthMm: usableW, usableHeightMm: usableH,
  };
}

/** Text element helper (single source of typography for the artifact). */
function text(x: number, y: number, fs: number, content: string, anchor: 'start' | 'middle' | 'end', fill: string, bold = false): string {
  const anchorAttr = anchor !== 'start' ? ` text-anchor="${anchor}"` : '';
  const boldAttr = bold ? ' font-weight="bold"' : '';
  return `<text x="${fmt(x)}" y="${fmt(y)}" font-size="${fs}"${anchorAttr}${boldAttr} fill="${fill}" font-family="monospace">${escapeXml(content)}</text>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
