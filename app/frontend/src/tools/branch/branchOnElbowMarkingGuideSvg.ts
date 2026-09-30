/* ───────────────────────────────────────────────────────────────────────────
   TUBO→CODO — ELBOW HOLE MARKING GUIDE (picaje) — physical workshop PDF
   (PB-BRANCH-INJERTO-EXPANSION-001 U4).

   WHY NOT A FLAT 1:1 HOLE TEMPLATE
   The elbow surface is a torus. Its Gaussian curvature K = cosψ / (ρ·rMer) is
   strictly positive around the branch (cosψ > 0 on the extrados side), so by
   Gauss's Theorema Egregium NO isometric flat development exists. Plotting
   (picajeX, picajeY) as Cartesian paper coordinates is not length-preserving:
   for the 3" × 6" reference case the P7–P19 paper distance overshoots the true
   chord by up to 4.97 mm (TOP/BOP). A paper template of the contour would be
   an approximation and is therefore NOT emitted.

   WHAT IS EXACT INSTEAD
   Each U1 picaje coordinate is a true arc length along a curve that lies ON
   the elbow surface and can be measured with a flexible tape:
     picajeX = −ρ (ψ − ψ₀): arc along the elbow RING (cross-section circle of
               radius ρ) through Ω, + toward BOP, − toward TOP;
     picajeY = rMer(ψ) (φ − φ₀): arc ALONG the elbow at constant clock position
               (constant ψ), + toward end B (elbow face perpendicular to the
               branch axis), − toward end A (face parallel to the branch axis).
     Cota X' = ρ ψ₀: ring arc from the bend-plane extrados line to Ω, + toward TOP.
     Cota Y' = rMer₀ (π/2 − φ₀): arc from end B to Ω at Ω's clock position.
   The ring is a planar circle, so a paper STRIP wrapped square around the
   elbow is an exact 1:1 development of that ring (1-D curve). The strip
   carries: bend-plane mark (X' = 0), Ω at Cota X', and every station at
     ringPosition_k = Cota X' − picajeX_k   (mm from the bend plane, + toward TOP)
   — pure arithmetic on U1 outputs, no geometry recomputed. From each ring
   mark the fabricator measures picajeY along the elbow at that clock position.

   ARTIFACT CONTENT
   - Ring strip 1:1 (tiled in X with the H-001 overlap contract when needed).
   - Station table: P#, θ, ring position, X (+dir), Y (+dir), injerto.
   - Schematic NOT TO SCALE (ring section + elevation) and numbered steps.
   - 100 mm calibration bar + PRINT AT 100% on every page.
   Only the strip is 1:1; the sheet says so explicitly. Deterministic output.
   ─────────────────────────────────────────────────────────────────────────── */

import type { BranchOnElbowResult } from './branchOnElbowGeometry';
import { getPdfPageFormat, pdfFormatUsableWidthMm } from './pdfPageFormat.ts';
import type { PdfPageFormatId } from './pdfPageFormat.ts';

export interface BranchOnElbowMarkingGuideMeta {
  titleLabel: string;
  familyLabel: string;
  datumLabel: string;
  branchLabel: string;
  elbowLabel: string;
  /** Must state: PIPINGBOX SET-ON · hole reference = branch ID. */
  conventionLabel: string;
  /** "MARKING GUIDE — not a 1:1 template of the hole; only the ring strip is 1:1". */
  guideNote: string;
  stripTitle: string;
  bendPlaneLabel: string;
  omegaLabel: string;
  towardTopLabel: string;
  towardBopLabel: string;
  endALabel: string;
  endBLabel: string;
  colStation: string;
  colTheta: string;
  colRing: string;
  colX: string;
  colY: string;
  colDir: string;
  colInjerto: string;
  closureLabel: string;
  /** Numbered workshop steps (already localized, no numbering prefix). */
  steps: string[];
  schematicTitle: string;
  notToScale: string;
  sectionLabel: string;
  elevationLabel: string;
  cotaXLabel: string;
  cotaYLabel: string;
  pageLabel: string;
  overlapLabel: string;
  calibrationNote: string;
  printAtActualSize: string;
  generatedLabel: string;
}

export interface BranchOnElbowMarkingGuideOptions {
  format?: PdfPageFormatId;
  overlapMm?: number;
  /** Elbow outer diameter D — mm (schematic ring radius ρ = D/2, presentation only). */
  elbowOuterDiameterMm: number;
  meta: BranchOnElbowMarkingGuideMeta;
}

export interface BranchOnElbowMarkingGuideTile {
  pageIndex: number;
  pageCount: number;
  kind: 'strip' | 'table';
  /** Strip column for kind 'strip' (0-based), −1 for table-only pages. */
  stripCol: number;
  /** Ring position (mm) at this tile's left usable edge — strip pages only. */
  originRingMm: number;
  widthMm: number;
  heightMm: number;
  svg: string;
}

export interface BranchOnElbowMarkingGuideResult {
  tiles: BranchOnElbowMarkingGuideTile[];
  stripPagesX: number;
  tablePages: number;
  /** Ring position of every station: Cota X' − picajeX — mm from the bend plane, + toward TOP. */
  ringPositionsMm: number[];
  /** Physical strip span [min, max] in ring mm (includes X' = 0 and Ω). */
  stripMinMm: number;
  stripMaxMm: number;
  stripLengthMm: number;
  overlapMm: number;
}

export const MARKING_GUIDE_PAD_MM = 4;
export const MARKING_GUIDE_OVERLAP_MM = 15;
export const MARKING_GUIDE_CALIBRATION_MM = 100;
const TITLE_ROWS = [8, 12.5, 17, 21.5, 26, 30.5, 34, 37.5];
const STRIP_TOP = 50;
const STRIP_H = 26;
const STRIP_BOTTOM = STRIP_TOP + STRIP_H;
const MARK_Y = 46.5;
const BODY_TOP = STRIP_BOTTOM + 14;
const BOTTOM_BAND = 22;
const ROW_H = 4.2;
const TABLE_HEADER_H = 6;
const SCHEM_W = 92;
/* Table block columns: [label key, width mm]. */
const COLS: [keyof BranchOnElbowMarkingGuideMeta, number][] = [
  ['colStation', 7], ['colTheta', 10], ['colRing', 13], ['colX', 13], ['colDir', 8], ['colY', 13], ['colDir', 8], ['colInjerto', 13],
];
const BLOCK_W = COLS.reduce((sum, [, w]) => sum + w, 0) + 4;

const fmt = (v: number) => Number(v.toFixed(3)).toString();
const textW = (s: string, fs: number) => s.length * 0.6 * fs;

/** Greedy word wrap to a physical width (Courier advance 0.6 em). */
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

/** Ring position of station i on the strip: Cota X' − picajeX (mm from the bend plane, + toward TOP). */
export function ringPositionMm(result: BranchOnElbowResult, index: number): number {
  return result.cotaX - result.stations[index].picajeX;
}

export function buildBranchOnElbowMarkingGuide(
  result: BranchOnElbowResult,
  options: BranchOnElbowMarkingGuideOptions,
): BranchOnElbowMarkingGuideResult | null {
  if (!result.valid || result.stations.length < 2) return null;

  const page = getPdfPageFormat(options.format);
  const PAGE_W = page.widthMm;
  const PAGE_H = page.heightMm;
  const M = page.safeMarginMm;
  const usableW = pdfFormatUsableWidthMm(page);
  const overlap = options.overlapMm ?? MARKING_GUIDE_OVERLAP_MM;
  const PAD = MARKING_GUIDE_PAD_MM;
  const { meta } = options;
  const RIGHT_X = PAGE_W - 6.5;
  const CALIB_Y = PAGE_H - BOTTOM_BAND + 10;
  const TABLE_BOTTOM = PAGE_H - BOTTOM_BAND - 4;
  /* stations = N physical + closure (repeats P1). */
  const N = result.stations.length - 1;
  const physical = result.stations.slice(0, N);

  /* ── Strip domain: bend plane (0), Ω (Cota X') and every station ── */
  const ringPositions = result.stations.map((_, i) => ringPositionMm(result, i));
  const stripMin = Math.min(0, result.cotaX, ...ringPositions);
  const stripMax = Math.max(0, result.cotaX, ...ringPositions);
  const stripLen = stripMax - stripMin;
  const contentW = stripLen + 2 * PAD;
  const stepX = usableW - overlap;
  const stripPagesX = contentW <= usableW ? 1 : Math.ceil((contentW - usableW) / stepX) + 1;

  /* ── Table pagination ── */
  const rows = result.stations.length; // N physical + closure
  const rowsPerBlock = Math.max(1, Math.floor((TABLE_BOTTOM - BODY_TOP - TABLE_HEADER_H) / ROW_H));
  const firstTableX0 = M + PAD + SCHEM_W + 6;
  const blocksFirst = Math.max(1, Math.floor((RIGHT_X - firstTableX0) / BLOCK_W));
  const blocksCont = Math.max(1, Math.floor((RIGHT_X - (M + PAD)) / BLOCK_W));
  const rowsFirst = blocksFirst * rowsPerBlock;
  const tablePages = rows <= rowsFirst ? 0 : Math.ceil((rows - rowsFirst) / (blocksCont * rowsPerBlock));
  const pageCount = stripPagesX + tablePages;

  const tiles: BranchOnElbowMarkingGuideTile[] = [];
  let pageIdx = 0;

  const titleBlock = (parts: string[], extraRight: string | null) => {
    const lx = M + PAD;
    parts.push(text(lx, TITLE_ROWS[0], 3.6, meta.titleLabel, 'start', '#000000', true));
    parts.push(text(lx, TITLE_ROWS[1], 2.8, `${meta.familyLabel} · ${meta.datumLabel}`, 'start', '#000000'));
    parts.push(text(lx, TITLE_ROWS[2], 2.8, meta.branchLabel, 'start', '#222222'));
    parts.push(text(lx, TITLE_ROWS[3], 2.8, meta.elbowLabel, 'start', '#222222'));
    parts.push(text(lx, TITLE_ROWS[4], 2.7,
      `${meta.cotaXLabel} = ${fmt(result.cotaX)} mm · ${meta.cotaYLabel} = ${fmt(result.cotaY)} mm · N = ${N} · ${fmt(result.angularStepDeg)}°/station`,
      'start', '#222222'));
    parts.push(text(lx, TITLE_ROWS[5], 3.4, meta.printAtActualSize, 'start', '#000000', true));
    parts.push(text(lx, TITLE_ROWS[6], 2.7, meta.calibrationNote, 'start', '#222222'));
    parts.push(text(lx, TITLE_ROWS[7], 2.7, meta.guideNote, 'start', '#000000', true));
    parts.push(text(RIGHT_X, TITLE_ROWS[0], 3.4, `${meta.pageLabel} ${pageIdx + 1}/${pageCount}`, 'end', '#000000'));
    parts.push(text(RIGHT_X, TITLE_ROWS[1], 2.7, page.id, 'end', '#222222'));
    if (extraRight) parts.push(text(RIGHT_X, TITLE_ROWS[2], 2.7, extraRight, 'end', '#222222'));
    parts.push(text(RIGHT_X, TITLE_ROWS[3], 2.7, meta.conventionLabel, 'end', '#222222'));
  };

  const calibration = (parts: string[]) => {
    const cbX = M + PAD;
    const cb = MARKING_GUIDE_CALIBRATION_MM;
    parts.push(`<line data-calibration-mm="${cb}" x1="${cbX}" y1="${CALIB_Y}" x2="${cbX + cb}" y2="${CALIB_Y}" stroke="#000000" stroke-width="0.5"/>`);
    parts.push(`<line x1="${cbX}" y1="${CALIB_Y - 2}" x2="${cbX}" y2="${CALIB_Y + 2}" stroke="#000000" stroke-width="0.5"/>`);
    parts.push(`<line x1="${cbX + cb}" y1="${CALIB_Y - 2}" x2="${cbX + cb}" y2="${CALIB_Y + 2}" stroke="#000000" stroke-width="0.5"/>`);
    parts.push(text(cbX + cb / 2, CALIB_Y - 2.5, 3.0, `${cb} mm`, 'middle', '#000000'));
    parts.push(text(cbX + cb + 5, CALIB_Y + 1.2, 2.5, meta.generatedLabel, 'start', '#444444'));
  };

  /** Station table blocks from row `start`; returns the next row index. */
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
        const isClosure = row === rows - 1;
        const y = BODY_TOP + TABLE_HEADER_H + (r + 1) * ROW_H - 1;
        /* Short physical direction codes; A/B are defined in the sheet legend. */
        const dirX = st.picajeX < -1e-9 ? 'TOP' : st.picajeX > 1e-9 ? 'BOP' : '-';
        const dirY = st.picajeY > 1e-9 ? 'B' : st.picajeY < -1e-9 ? 'A' : '-';
        const cells = [
          isClosure ? meta.closureLabel : `P${row + 1}`, fmt(st.thetaDeg), fmt(ringPositions[row]),
          fmt(st.picajeX), dirX, fmt(st.picajeY), dirY, fmt(st.cutOrdinate),
        ];
        cx = bx;
        cells.forEach((cell, c) => {
          const w = COLS[c][1];
          parts.push(`<text data-table-station="${row}" data-col="${c}" x="${fmt(cx + w / 2)}" y="${fmt(y)}" font-size="2.3" text-anchor="middle" fill="${isClosure ? '#555555' : '#000000'}" font-family="monospace">${escapeXml(cell)}</text>`);
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
    /* Ring section: circle, bend plane, TOP/BOP, Ω at angle Cota X'/ρ (presentation only). */
    const rr = 15;
    const cx = x0 + 22;
    const cy = y0 + 34;
    parts.push(text(cx, y0 + 11.5, 2.3, meta.sectionLabel, 'middle', '#222222'));
    parts.push(`<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${rr}" fill="none" stroke="#000000" stroke-width="0.35"/>`);
    parts.push(`<line x1="${fmt(cx - rr - 4)}" y1="${fmt(cy)}" x2="${fmt(cx + rr + 4)}" y2="${fmt(cy)}" stroke="#666666" stroke-width="0.2" stroke-dasharray="1.5,1"/>`);
    parts.push(text(cx, cy - rr - 2, 2.1, "+X' -> TOP", 'middle', '#000000'));
    parts.push(text(cx, cy + rr + 3.5, 2.1, "-X' -> BOP", 'middle', '#000000'));
    parts.push(text(cx + rr + 4.5, cy + 0.8, 2.0, "X'=0", 'start', '#000000'));
    const rho = options.elbowOuterDiameterMm / 2;
    const psi0 = rho > 0 ? Math.max(-Math.PI / 2, Math.min(Math.PI / 2, result.cotaX / rho)) : 0;
    const ox = cx + rr * Math.cos(psi0);
    const oy = cy - rr * Math.sin(psi0);
    parts.push(`<circle cx="${fmt(ox)}" cy="${fmt(oy)}" r="1" fill="#000000" stroke="none"/>`);
    parts.push(text(ox + 2, oy - 1.5, 2.0, meta.omegaLabel, 'start', '#000000'));
    for (const [k, line] of wrap(`${meta.omegaLabel} = ${meta.datumLabel}`, 2.0, 44).entries()) {
      parts.push(text(x0, cy + rr + 8 + k * 3.2, 2.0, line, 'start', '#000000'));
    }
    /* Elevation: quarter elbow between ends A and B, Ω on the outer side, +Y toward B. */
    const ex = x0 + 88;
    const ey = y0 + 50;
    const Ro = 34;
    const Ri = 22;
    parts.push(text(ex - 30, y0 + 11.5, 2.3, meta.elevationLabel, 'middle', '#222222'));
    parts.push(`<polyline fill="none" stroke="#000000" stroke-width="0.35" points="${arcPts(ex, ey, Ro, 180, 270)}"/>`);
    parts.push(`<polyline fill="none" stroke="#000000" stroke-width="0.35" points="${arcPts(ex, ey, Ri, 180, 270)}"/>`);
    parts.push(`<line x1="${fmt(ex - Ro)}" y1="${fmt(ey)}" x2="${fmt(ex - Ri)}" y2="${fmt(ey)}" stroke="#000000" stroke-width="0.35"/>`);
    parts.push(`<line x1="${fmt(ex)}" y1="${fmt(ey - Ro)}" x2="${fmt(ex)}" y2="${fmt(ey - Ri)}" stroke="#000000" stroke-width="0.35"/>`);
    parts.push(text(ex - Ro - 1, ey + 3.5, 2.0, 'A', 'start', '#000000'));
    parts.push(text(ex + 1.5, ey - Ro + 1, 2.0, 'B', 'start', '#000000'));
    const wx = ex + Ro * Math.cos(Math.PI * 1.22);
    const wy = ey + Ro * Math.sin(Math.PI * 1.22);
    parts.push(`<circle cx="${fmt(wx)}" cy="${fmt(wy)}" r="1" fill="#000000" stroke="none"/>`);
    parts.push(`<line x1="${fmt(ex + Ri * Math.cos(Math.PI * 1.22))}" y1="${fmt(ey + Ri * Math.sin(Math.PI * 1.22))}" x2="${fmt(wx)}" y2="${fmt(wy)}" stroke="#000000" stroke-width="0.4" stroke-dasharray="1.5,1"/>`);
    /* Branch stub leaving Ω outward (branch axis direction). */
    parts.push(`<line x1="${fmt(wx)}" y1="${fmt(wy)}" x2="${fmt(wx - 14 * Math.cos(Math.PI * 0.22))}" y2="${fmt(wy - 14 * Math.sin(Math.PI * 0.22))}" stroke="#000000" stroke-width="0.6"/>`);
    parts.push(text(wx - 8, wy - 9.5, 2.0, `${meta.omegaLabel} ring`, 'end', '#000000'));
    parts.push(text(ex - 2, ey - Ro - 2, 2.0, '+Y -> B', 'end', '#000000'));
    parts.push(text(ex - Ro - 1, ey + 7, 2.0, '-Y -> A', 'start', '#000000'));
    parts.push(text(x0, y0 + 64, 2.0, `A: ${meta.endALabel}`, 'start', '#444444'));
    parts.push(text(x0, y0 + 67.5, 2.0, `B: ${meta.endBLabel}`, 'start', '#444444'));
    /* Steps (wrapped to the schematic column) */
    let sy = y0 + 73;
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
    const originRing = stripMin + originC - PAD;
    const isFirst = px === 0;
    const isLast = px === stripPagesX - 1;
    const Xr = (ring: number) => (ring - stripMin) + PAD + M - originC;
    const xL = M;
    const xR = M + usableW;
    const parts: string[] = [];
    parts.push(`<rect x="0" y="0" width="${PAGE_W}" height="${PAGE_H}" fill="#ffffff" stroke="none"/>`);
    titleBlock(parts, stripPagesX > 1 ? `${meta.overlapLabel} ${fmt(overlap)} mm · X ${px + 1}/${stripPagesX}` : null);

    parts.push(text(M + PAD, STRIP_TOP - 4.5, 2.8, meta.stripTitle, 'start', '#000000', true));
    /* Strip outline (cut line), clipped to the usable window. */
    const sx0 = Math.max(xL, Xr(stripMin) - PAD);
    const sx1 = Math.min(xR, Xr(stripMax) + PAD);
    parts.push(`<rect data-strip-length-mm="${fmt(stripLen)}" x="${fmt(sx0)}" y="${STRIP_TOP}" width="${fmt(sx1 - sx0)}" height="${STRIP_H}" fill="none" stroke="#000000" stroke-width="0.5"/>`);
    /* Direction arrow: + toward TOP (increasing ring position → page right). */
    parts.push(`<line x1="${fmt(sx0 + 2)}" y1="${fmt(STRIP_BOTTOM + 3)}" x2="${fmt(sx0 + 22)}" y2="${fmt(STRIP_BOTTOM + 3)}" stroke="#000000" stroke-width="0.3"/>`);
    parts.push(`<polygon points="${fmt(sx0 + 22)},${fmt(STRIP_BOTTOM + 3)} ${fmt(sx0 + 19.5)},${fmt(STRIP_BOTTOM + 1.8)} ${fmt(sx0 + 19.5)},${fmt(STRIP_BOTTOM + 4.2)}" fill="#000000" stroke="none"/>`);
    parts.push(text(sx0 + 24, STRIP_BOTTOM + 4, 2.2, `+X' ${meta.towardTopLabel}`, 'start', '#000000'));

    const inWindow = (x: number) => x >= xL - 1e-9 && x <= xR + 1e-9;
    /* Bend-plane reference X' = 0 */
    const xBend = Xr(0);
    if (inWindow(xBend)) {
      parts.push(`<line data-strip-reference="bend-plane" data-ring-mm="0" x1="${fmt(xBend)}" y1="${STRIP_TOP}" x2="${fmt(xBend)}" y2="${STRIP_BOTTOM}" stroke="#000000" stroke-width="0.6"/>`);
      const bw = textW(meta.bendPlaneLabel, 2.2);
      parts.push(text(Math.min(Math.max(xBend, xL + 1 + bw / 2), xR - 1 - bw / 2), STRIP_TOP - 1, 2.2, meta.bendPlaneLabel, 'middle', '#000000'));
    }
    /* Ω at Cota X' */
    const xOmega = Xr(result.cotaX);
    if (inWindow(xOmega)) {
      parts.push(`<line data-strip-omega="1" data-cota-x-mm="${fmt(result.cotaX)}" x1="${fmt(xOmega)}" y1="${STRIP_TOP}" x2="${fmt(xOmega)}" y2="${STRIP_BOTTOM}" stroke="#000000" stroke-width="0.6" stroke-dasharray="2,1"/>`);
      parts.push(text(xOmega, STRIP_BOTTOM + 8, 2.2, `${meta.omegaLabel} · ${meta.cotaXLabel} ${fmt(result.cotaX)}`, 'middle', '#000000'));
    }
    /* Stations: alternate tick heights (even from top, odd from bottom); labels thinned by collision, values in the table. */
    let lastLabelTop = -Infinity;
    let lastLabelBottom = -Infinity;
    const order = physical.map((st, i) => ({ i, x: Xr(ringPositions[i]) })).sort((a, b) => a.x - b.x);
    for (const { i, x } of order) {
      if (!inWindow(x)) continue;
      const even = i % 2 === 0;
      const y1 = even ? STRIP_TOP : STRIP_TOP + STRIP_H * 0.65;
      const y2 = even ? STRIP_TOP + STRIP_H * 0.35 : STRIP_BOTTOM;
      parts.push(`<line data-strip-station="${i}" data-ring-mm="${fmt(ringPositions[i])}" data-picaje-x-mm="${fmt(physical[i].picajeX)}" x1="${fmt(x)}" y1="${fmt(y1)}" x2="${fmt(x)}" y2="${fmt(y2)}" stroke="#000000" stroke-width="0.3"/>`);
      const label = `P${i + 1}`;
      const w = textW(label, 2.0);
      if (even && x - lastLabelTop >= w + 0.8) {
        parts.push(text(x, STRIP_TOP + STRIP_H * 0.35 + 2.6, 2.0, label, 'middle', '#000000'));
        lastLabelTop = x;
      } else if (!even && x - lastLabelBottom >= w + 0.8) {
        parts.push(text(x, STRIP_TOP + STRIP_H * 0.65 - 0.8, 2.0, label, 'middle', '#000000'));
        lastLabelBottom = x;
      }
    }
    /* Registration marks at the overlap centres */
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
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}mm" height="${PAGE_H}mm" viewBox="0 0 ${PAGE_W} ${PAGE_H}" data-physical-template="branch-on-elbow-marking-guide" data-strip-1to1="true" data-origin-ring-mm="${fmt(originRing)}">${parts.join('')}</svg>`;
    tiles.push({ pageIndex: pageIdx, pageCount, kind: 'strip', stripCol: px, originRingMm: originRing, widthMm: PAGE_W, heightMm: PAGE_H, svg });
    pageIdx++;
  }

  /* ── Table continuation pages ── */
  for (let tp = 0; tp < tablePages; tp++) {
    const parts: string[] = [];
    parts.push(`<rect x="0" y="0" width="${PAGE_W}" height="${PAGE_H}" fill="#ffffff" stroke="none"/>`);
    titleBlock(parts, null);
    nextRow = table(parts, M + PAD, blocksCont, nextRow);
    calibration(parts);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}mm" height="${PAGE_H}mm" viewBox="0 0 ${PAGE_W} ${PAGE_H}" data-physical-template="branch-on-elbow-marking-guide" data-strip-1to1="false">${parts.join('')}</svg>`;
    tiles.push({ pageIndex: pageIdx, pageCount, kind: 'table', stripCol: -1, originRingMm: Number.NaN, widthMm: PAGE_W, heightMm: PAGE_H, svg });
    pageIdx++;
  }

  return {
    tiles, stripPagesX, tablePages, ringPositionsMm: ringPositions,
    stripMinMm: stripMin, stripMaxMm: stripMax, stripLengthMm: stripLen, overlapMm: overlap,
  };
}

function arcPts(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const pts: string[] = [];
  for (let k = 0; k <= 24; k++) {
    const a = (fromDeg + (toDeg - fromDeg) * k / 24) * Math.PI / 180;
    pts.push(`${fmt(cx + r * Math.cos(a))},${fmt(cy + r * Math.sin(a))}`);
  }
  return pts.join(' ');
}

function text(x: number, y: number, fs: number, content: string, anchor: 'start' | 'middle' | 'end', fill: string, bold = false): string {
  const anchorAttr = anchor !== 'start' ? ` text-anchor="${anchor}"` : '';
  const boldAttr = bold ? ' font-weight="bold"' : '';
  return `<text x="${fmt(x)}" y="${fmt(y)}" font-size="${fs}"${anchorAttr}${boldAttr} fill="${fill}" font-family="monospace">${escapeXml(content)}</text>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
