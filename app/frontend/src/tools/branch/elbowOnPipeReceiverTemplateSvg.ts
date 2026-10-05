/* ───────────────────────────────────────────────────────────────────────────
   CODO→TUBO — PICAJE TEMPLATE 1:1 — RECEIVER TUBE — physical workshop PDF
   (PB-BRANCH-INJERTO-EXPANSION-001 U5.4).

   WHY THIS ONE IS A TRUE 1:1 TEMPLATE
   The receiver is a cylinder, a developable surface: unrolling it onto the
   plane preserves every length. The U5.1 kernel already returns each hole
   station as two true arc lengths ON that cylinder:
     picajeX = ρ·[asin(e/ρ) − asin(x/ρ)]  circumferential arc from the datum
               generatrix (bend plane × receiver) to the station generatrix,
               + toward the TOP side (−Xg), − toward the BOP side (+Xg);
     picajeY = R − m·cos t                 axial distance along the receiver
               from the plane of the t = 0 leg axis, + toward the 90° end face.
   Plotting (picajeX, picajeY) as paper millimetres therefore IS the exact flat
   development of the local receiver surface around the opening. Wrapped back on
   the receiver with X = 0 on the datum generatrix and Y = 0 on the leg-axis
   plane, every P mark lands on its physical point.

   COTA X' PLACEMENT PROOF (pure arithmetic on U5.1 outputs — nothing recomputed)
     Cota X' = ρ·asin(e/ρ)   arc from the receiver CROWN (top generatrix, Xg = 0)
                             to the datum generatrix, + toward the BOP side.
     ⇒ absolute crown arc of station i:
       s_i = Cota X' − picajeX_i = ρ·asin(x_i/ρ)      (+ toward the BOP side)
     The crown itself therefore sits at picajeX = Cota X' on this template and is
     drawn as a reference line whenever it falls inside the sheet. Tests verify
     s_i against the kernel's own sectionCoordinateMm (x_i) to 1e-9 mm.

   Y' IS EXTERNAL
   Cota Y' is a drawing placement dimension (REF O → origin). It is annotated
   when supplied and never enters any coordinate, bound or tile count.

   Page model: shared pdfPageFormat (landscape A4–A0), additive-overlap tiling
   in X and Y, Liang–Barsky clipping against the usable window, never scaling.
   100 mm calibration bar + PRINT AT 100% on every page. Deterministic output.
   ─────────────────────────────────────────────────────────────────────────── */

import type { ElbowOnPipeResult } from './elbowOnPipeGeometry';
import { getPdfPageFormat, pdfFormatUsableWidthMm } from './pdfPageFormat.ts';
import type { PdfPageFormatId } from './pdfPageFormat.ts';

export interface ElbowOnPipeReceiverTemplateMeta {
  /** Must read: PICAJE TEMPLATE 1:1 - RECEIVER TUBE. */
  titleLabel: string;
  familyLabel: string;
  datumLabel: string;
  elbowLabel: string;
  receiverLabel: string;
  /** PIPINGBOX SET-ON · hole reference = elbow ID. */
  conventionLabel: string;
  /** Origin (0,0): datum generatrix × t = 0 leg-axis plane. */
  originLabel: string;
  xAxisLabel: string;
  yAxisLabel: string;
  towardTopLabel: string;
  towardBopLabel: string;
  /** Receiver crown (top generatrix) reference line. */
  crownLabel: string;
  /** Y = 0 reference: t = 0 leg-axis plane. */
  legPlaneLabel: string;
  /** Y = R reference: 90° end-face plane (clamped stations sit on it). */
  endFaceLabel: string;
  cotaXLabel: string;
  cotaYLabel: string;
  /** Explains that Y' is an external placement dimension, not geometry. */
  cotaYNote: string;
  cotaYAbsent: string;
  pageLabel: string;
  overlapLabel: string;
  calibrationNote: string;
  printAtActualSize: string;
  generatedLabel: string;
}

export interface ElbowOnPipeReceiverTemplateOptions {
  format?: PdfPageFormatId;
  overlapMm?: number;
  /** External Cota Y' — annotation only. */
  yPrimeMm?: number | null;
  meta: ElbowOnPipeReceiverTemplateMeta;
}

export interface ElbowOnPipeReceiverTemplateTile {
  pageIndex: number;
  pageCount: number;
  pageCol: number;
  pageRow: number;
  /** picajeX (mm) at this tile's left usable edge. */
  originXMm: number;
  /** picajeY (mm) at this tile's top usable edge. */
  originYMm: number;
  widthMm: number;
  heightMm: number;
  svg: string;
}

export interface ElbowOnPipeReceiverTemplateResult {
  tiles: ElbowOnPipeReceiverTemplateTile[];
  pagesX: number;
  pagesY: number;
  tiled: boolean;
  /** Template domain (includes the origin and the crown line). */
  xMinMm: number;
  xMaxMm: number;
  yMinMm: number;
  yMaxMm: number;
  widthMm: number;
  heightMm: number;
  overlapMm: number;
  /** Template coordinates [picajeX, picajeY] of every kernel station, closure included. */
  pointsMm: [number, number][];
  /** Absolute crown arc per station: Cota X' − picajeX (+ toward the BOP side). */
  crownArcMm: number[];
  /** picajeX of the receiver crown on this template (= Cota X'). */
  crownXMm: number;
}

export const RECEIVER_TEMPLATE_PAD_MM = 2;
export const RECEIVER_TEMPLATE_OVERLAP_MM = 15;
export const RECEIVER_TEMPLATE_CALIBRATION_MM = 100;
/** Drawing window: below the title block, above the calibration band. */
export const RECEIVER_TEMPLATE_CONTENT_TOP_MM = 48;
export const RECEIVER_TEMPLATE_BOTTOM_BAND_MM = 14;
const TITLE_ROWS = [8, 12.5, 17, 21.5, 26, 30.5, 35, 39.5, 44];
const CONTENT_TOP = RECEIVER_TEMPLATE_CONTENT_TOP_MM;
const BOTTOM_BAND = RECEIVER_TEMPLATE_BOTTOM_BAND_MM;
const MARK_X_LEFT = 14;

const fmt = (v: number) => Number(v.toFixed(3)).toString();
const textW = (s: string, fs: number) => s.length * 0.6 * fs;

/** Template coordinates of station i — the kernel's physical arc lengths, verbatim. */
export function receiverTemplatePoint(result: ElbowOnPipeResult, index: number): [number, number] {
  const st = result.stations[index];
  return [st.picajeXMm, st.picajeYMm];
}

/** Absolute circumferential arc from the receiver crown to station i: Cota X' − picajeX. */
export function receiverCrownArcMm(result: ElbowOnPipeResult, index: number): number {
  return result.cotaXMm - result.stations[index].picajeXMm;
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

export function buildElbowOnPipeReceiverTemplate(
  result: ElbowOnPipeResult,
  options: ElbowOnPipeReceiverTemplateOptions,
): ElbowOnPipeReceiverTemplateResult | null {
  if (!result.valid || result.stations.length < 2) return null;

  const page = getPdfPageFormat(options.format);
  const PAGE_W = page.widthMm;
  const PAGE_H = page.heightMm;
  const M = page.safeMarginMm;
  const usableW = pdfFormatUsableWidthMm(page);
  const overlap = options.overlapMm ?? RECEIVER_TEMPLATE_OVERLAP_MM;
  const PAD = RECEIVER_TEMPLATE_PAD_MM;
  const { meta } = options;
  const RIGHT_X = PAGE_W - 6.5;
  const CONTENT_BOTTOM = PAGE_H - BOTTOM_BAND;
  const CALIB_Y = PAGE_H - 6;
  const usableH = CONTENT_BOTTOM - CONTENT_TOP;
  const yPrime = options.yPrimeMm;
  const hasYPrime = yPrime !== null && yPrime !== undefined && Number.isFinite(yPrime);

  /* stations = N physical + closure (repeats P1). */
  const N = result.stations.length - 1;
  const points = result.stations.map((_, i) => receiverTemplatePoint(result, i));
  const crownArc = result.stations.map((_, i) => receiverCrownArcMm(result, i));
  const crownX = result.cotaXMm;
  /* Domain: every station plus the two placement references (origin, crown). */
  const xs = [0, crownX, ...points.map(p => p[0])];
  const ys = [0, ...points.map(p => p[1])];
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const Wp = xMax - xMin;
  const Hp = yMax - yMin;

  /* X+Y additive-overlap tiling — same arithmetic as the H-001 / U4 sheets. */
  const contentW = Wp + 2 * PAD;
  const contentH = Hp + 2 * PAD;
  const stepX = usableW - overlap;
  const stepY = usableH - overlap;
  const pagesX = contentW <= usableW ? 1 : Math.ceil((contentW - usableW) / stepX) + 1;
  const pagesY = contentH <= usableH ? 1 : Math.ceil((contentH - usableH) / stepY) + 1;
  const pageCount = pagesX * pagesY;

  const anyClamped = result.stations.some(st => st.clampedAtElbowEnd);
  const endFaceY = points.find((_, i) => result.stations[i].clampedAtElbowEnd)?.[1] ?? Number.NaN;
  const labelStep = Math.max(1, Math.ceil(N / 24));
  const cx = points.slice(0, N).reduce((s, p) => s + p[0], 0) / N;
  const cy = points.slice(0, N).reduce((s, p) => s + p[1], 0) / N;

  const tiles: ElbowOnPipeReceiverTemplateTile[] = [];
  let pageIdx = 0;
  for (let py = 0; py < pagesY; py++) {
    for (let px = 0; px < pagesX; px++) {
      const isFirstX = px === 0;
      const isLastX = px === pagesX - 1;
      const isFirstY = py === 0;
      const isLastY = py === pagesY - 1;
      const xL = M;
      const xR = M + usableW;
      /* Data (X, Y) → page. Y grows UP on the page. */
      const XP = (X: number) => M + (X - xMin + PAD - px * stepX);
      const YP = (Y: number) => CONTENT_TOP + (yMax - Y + PAD - py * stepY);
      const inX = (x: number) => x >= xL - 1e-9 && x <= xR + 1e-9;
      const inY = (y: number) => y >= CONTENT_TOP - 1e-9 && y <= CONTENT_BOTTOM + 1e-9;

      const parts: string[] = [];
      parts.push(`<rect x="0" y="0" width="${PAGE_W}" height="${PAGE_H}" fill="#ffffff" stroke="none"/>`);

      /* ── Title block ── */
      const lx = M + PAD;
      parts.push(text(lx, TITLE_ROWS[0], 3.6, meta.titleLabel, 'start', '#000000', true));
      parts.push(text(lx, TITLE_ROWS[1], 2.8, `${meta.familyLabel} · ${meta.datumLabel}`, 'start', '#000000'));
      parts.push(text(lx, TITLE_ROWS[2], 2.8, meta.elbowLabel, 'start', '#222222'));
      parts.push(text(lx, TITLE_ROWS[3], 2.8, meta.receiverLabel, 'start', '#222222'));
      parts.push(text(lx, TITLE_ROWS[4], 2.7,
        `${meta.cotaXLabel} = ${fmt(result.cotaXMm)} mm · N = ${N} · ${fmt(result.angularStepDeg)}°/P · Div = ${fmt(result.stationSpacingMm)} mm · X ${fmt(xMin)}..${fmt(xMax)} · Y ${fmt(yMin)}..${fmt(yMax)} mm`,
        'start', '#222222'));
      parts.push(text(lx, TITLE_ROWS[5], 2.7,
        hasYPrime ? `${meta.cotaYLabel} = ${fmt(yPrime as number)} mm · ${meta.cotaYNote}` : `${meta.cotaYLabel}: ${meta.cotaYAbsent} · ${meta.cotaYNote}`,
        'start', '#222222'));
      parts.push(text(lx, TITLE_ROWS[6], 3.4, meta.printAtActualSize, 'start', '#000000', true));
      parts.push(text(lx, TITLE_ROWS[7], 2.7, meta.calibrationNote, 'start', '#222222'));
      parts.push(text(lx, TITLE_ROWS[8], 2.7, meta.originLabel, 'start', '#222222'));
      parts.push(text(RIGHT_X, TITLE_ROWS[0], 3.4, `${meta.pageLabel} ${pageIdx + 1}/${pageCount}`, 'end', '#000000'));
      parts.push(text(RIGHT_X, TITLE_ROWS[1], 2.7, `${page.id} · X ${px + 1}/${pagesX} · Y ${py + 1}/${pagesY}`, 'end', '#222222'));
      if (pageCount > 1) {
        parts.push(text(RIGHT_X, TITLE_ROWS[2], 2.7, `${meta.overlapLabel} ${fmt(overlap)} mm`, 'end', '#222222'));
      }
      parts.push(text(RIGHT_X, TITLE_ROWS[3], 2.7, meta.conventionLabel, 'end', '#222222'));

      /* ── Direction legend (title block, right column) ── */
      {
        const lgx = RIGHT_X - 95;
        parts.push(`<line x1="${fmt(lgx)}" y1="${TITLE_ROWS[5] - 1}" x2="${fmt(lgx + 8)}" y2="${TITLE_ROWS[5] - 1}" stroke="#000000" stroke-width="0.4"/>`);
        parts.push(`<polygon points="${fmt(lgx + 8)},${TITLE_ROWS[5] - 1} ${fmt(lgx + 6)},${TITLE_ROWS[5] - 2} ${fmt(lgx + 6)},${TITLE_ROWS[5]}" fill="#000000" stroke="none"/>`);
        parts.push(text(lgx + 10, TITLE_ROWS[5], 2.4, `+X ${meta.towardTopLabel} · -X ${meta.towardBopLabel}`, 'start', '#000000'));
        parts.push(text(lgx + 10, TITLE_ROWS[6], 2.4, meta.xAxisLabel, 'start', '#000000'));
        parts.push(`<line x1="${fmt(lgx + 4)}" y1="${TITLE_ROWS[7]}" x2="${fmt(lgx + 4)}" y2="${TITLE_ROWS[7] - 6}" stroke="#000000" stroke-width="0.4"/>`);
        parts.push(`<polygon points="${fmt(lgx + 4)},${TITLE_ROWS[7] - 6} ${fmt(lgx + 3)},${TITLE_ROWS[7] - 4} ${fmt(lgx + 5)},${TITLE_ROWS[7] - 4}" fill="#000000" stroke="none"/>`);
        parts.push(text(lgx + 10, TITLE_ROWS[7], 2.4, `+Y ${meta.yAxisLabel}`, 'start', '#000000'));
        if (anyClamped) {
          parts.push(`<polygon points="${fmt(lgx + 4)},${TITLE_ROWS[8] - 2.3} ${fmt(lgx + 5.3)},${TITLE_ROWS[8] - 1} ${fmt(lgx + 4)},${TITLE_ROWS[8] + 0.3} ${fmt(lgx + 2.7)},${TITLE_ROWS[8] - 1}" fill="#000000" stroke="none"/>`);
          parts.push(text(lgx + 10, TITLE_ROWS[8], 2.4, meta.endFaceLabel, 'start', '#000000'));
        }
      }

      /* ── Reference lines: X = 0 (datum generatrix), Y = 0 (leg plane), crown, end face ── */
      const x0 = XP(0);
      const y0 = YP(0);
      if (inX(x0)) {
        parts.push(`<line data-reference="datum-generatrix" data-picaje-x-mm="0" x1="${fmt(x0)}" y1="${CONTENT_TOP - 2}" x2="${fmt(x0)}" y2="${fmt(CONTENT_BOTTOM + 2)}" stroke="#777777" stroke-width="0.3" stroke-dasharray="8,2,2,2"/>`);
        parts.push(text(x0 - 1.2, CONTENT_TOP - 1, 2.4, 'X = 0', 'end', '#777777'));
      }
      if (inY(y0)) {
        parts.push(`<line data-reference="leg-plane" data-picaje-y-mm="0" x1="${fmt(Math.max(xL, XP(xMin) - 2))}" y1="${fmt(y0)}" x2="${fmt(Math.min(xR, XP(xMax) + 2))}" y2="${fmt(y0)}" stroke="#777777" stroke-width="0.3" stroke-dasharray="8,2,2,2"/>`);
        parts.push(text(Math.min(xR - 1, XP(xMax) + 3), y0 + 4, 2.4, `Y = 0 · ${meta.legPlaneLabel}`, 'start', '#777777'));
      }
      const xCrown = XP(crownX);
      if (inX(xCrown)) {
        parts.push(`<line data-reference="crown" data-picaje-x-mm="${fmt(crownX)}" data-cota-x-mm="${fmt(result.cotaXMm)}" x1="${fmt(xCrown)}" y1="${CONTENT_TOP - 2}" x2="${fmt(xCrown)}" y2="${fmt(CONTENT_BOTTOM + 2)}" stroke="#000000" stroke-width="0.35" stroke-dasharray="3,1.5"/>`);
        const cl = `${meta.crownLabel} · X = ${meta.cotaXLabel} = ${fmt(crownX)}`;
        const w = textW(cl, 2.4);
        parts.push(text(Math.min(Math.max(xCrown + 1.2 + w / 2, xL + w / 2), xR - w / 2), CONTENT_TOP - 1, 2.4, cl, 'middle', '#000000'));
      }
      if (anyClamped && Number.isFinite(endFaceY)) {
        const yEnd = YP(endFaceY);
        if (inY(yEnd)) {
          parts.push(`<line data-reference="end-face" data-picaje-y-mm="${fmt(endFaceY)}" x1="${fmt(Math.max(xL, XP(xMin) - 2))}" y1="${fmt(yEnd)}" x2="${fmt(Math.min(xR, XP(xMax) + 2))}" y2="${fmt(yEnd)}" stroke="#000000" stroke-width="0.3" stroke-dasharray="3,1.5"/>`);
          parts.push(text(Math.min(xR - 1, XP(xMax) + 3), yEnd + 3.5, 2.4, `Y = R = ${fmt(endFaceY)} · ${meta.endFaceLabel}`, 'start', '#444444'));
        }
      }

      /* ── Hole contour through the kernel stations (clipped, never scaled) ── */
      const raw = points.map(([X, Y]) => [XP(X), YP(Y)] as [number, number]);
      let allVisible = true;
      const segs: string[] = [];
      for (let i = 0; i < raw.length - 1; i++) {
        const [ax, ay] = raw[i];
        const [bx, by] = raw[i + 1];
        const c = clipSegment(ax, ay, bx, by, xL, xR, CONTENT_TOP, CONTENT_BOTTOM);
        if (!c) { allVisible = false; continue; }
        const untouched = Math.abs(c[0] - ax) < 1e-9 && Math.abs(c[1] - ay) < 1e-9
          && Math.abs(c[2] - bx) < 1e-9 && Math.abs(c[3] - by) < 1e-9;
        if (!untouched) allVisible = false;
        segs.push(`<line data-seg="${i}" x1="${fmt(c[0])}" y1="${fmt(c[1])}" x2="${fmt(c[2])}" y2="${fmt(c[3])}" stroke="#000000" stroke-width="0.6"/>`);
      }
      if (allVisible) {
        const pts = raw.slice(0, N).map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ');
        parts.push(`<polygon data-picaje-contour="kernel-stations" data-contour-points="${N}" data-closes-on="0" points="${pts}" fill="none" stroke="#000000" stroke-width="0.6"/>`);
      } else {
        parts.push(segs.join(''));
      }

      /* ── Origin ── */
      if (inX(x0) && inY(y0)) {
        parts.push(`<line x1="${fmt(x0 - 3)}" y1="${fmt(y0)}" x2="${fmt(x0 + 3)}" y2="${fmt(y0)}" stroke="#000000" stroke-width="0.4"/>`);
        parts.push(`<line x1="${fmt(x0)}" y1="${fmt(y0 - 3)}" x2="${fmt(x0)}" y2="${fmt(y0 + 3)}" stroke="#000000" stroke-width="0.4"/>`);
        parts.push(`<circle data-origin="1" cx="${fmt(x0)}" cy="${fmt(y0)}" r="1" fill="#000000" stroke="none"/>`);
        parts.push(text(x0 + 2, y0 - 2, 2.6, '(0,0)', 'start', '#000000'));
        if (hasYPrime) {
          parts.push(text(x0 + 2, y0 + 4.5, 2.4, `${meta.cotaYLabel} ${fmt(yPrime as number)} mm`, 'start', '#444444'));
        }
      }

      /* ── Stations P1..PN (closure IS P1). Clamped → diamond ── */
      for (let i = 0; i < N; i++) {
        const st = result.stations[i];
        const [xpi, ypi] = raw[i];
        if (xpi < xL - 1 || xpi > xR + 1 || ypi < CONTENT_TOP - 1 || ypi > CONTENT_BOTTOM + 1) continue;
        const shared = `data-template-station="${i}" data-picaje-x-mm="${fmt(st.picajeXMm)}" data-picaje-y-mm="${fmt(st.picajeYMm)}" data-crown-arc-mm="${fmt(crownArc[i])}" data-clamped="${st.clampedAtElbowEnd}"`;
        const isOne = i === 0;
        if (st.clampedAtElbowEnd) {
          const d = isOne ? 1.8 : 1.3;
          parts.push(`<polygon ${shared} points="${fmt(xpi)},${fmt(ypi - d)} ${fmt(xpi + d)},${fmt(ypi)} ${fmt(xpi)},${fmt(ypi + d)} ${fmt(xpi - d)},${fmt(ypi)}" fill="#000000" stroke="none"/>`);
        } else {
          parts.push(`<circle ${shared} cx="${fmt(xpi)}" cy="${fmt(ypi)}" r="${isOne ? 1.3 : 0.8}" fill="none" stroke="#000000" stroke-width="${isOne ? 0.5 : 0.3}"/>`);
        }
        if (i % labelStep === 0) {
          const dx = st.picajeXMm - cx;
          const dy = st.picajeYMm - cy;
          const len = Math.hypot(dx, dy) || 1;
          /* Stations lying on the 90° end-face row share one straight edge at the top of the
             sheet; a radial label would leave the content area and sit on the reference
             captions, so those labels go just below the edge instead. */
          const onEndFace = st.clampedAtElbowEnd && Math.abs(st.picajeYMm - yMax) < 1e-6;
          const lxp = Math.min(Math.max(XP(st.picajeXMm + (onEndFace ? 0 : (dx / len) * 4.2)), xL + 1.5), xR - 1.5);
          const lyp = onEndFace
            ? YP(st.picajeYMm) + 4.6
            : Math.min(Math.max(YP(st.picajeYMm + (dy / len) * 4.2), CONTENT_TOP + 2.5), CONTENT_BOTTOM + 6);
          parts.push(text(lxp, lyp + 0.9, 2.6, `P${i + 1}`, 'middle', '#222222'));
        }
      }

      /* ── 100 mm calibration bar ── */
      const cbX = M + PAD;
      const cb = RECEIVER_TEMPLATE_CALIBRATION_MM;
      parts.push(`<line data-calibration-mm="${cb}" x1="${cbX}" y1="${CALIB_Y}" x2="${cbX + cb}" y2="${CALIB_Y}" stroke="#000000" stroke-width="0.5"/>`);
      parts.push(`<line x1="${cbX}" y1="${CALIB_Y - 2}" x2="${cbX}" y2="${CALIB_Y + 2}" stroke="#000000" stroke-width="0.5"/>`);
      parts.push(`<line x1="${cbX + cb}" y1="${CALIB_Y - 2}" x2="${cbX + cb}" y2="${CALIB_Y + 2}" stroke="#000000" stroke-width="0.5"/>`);
      parts.push(text(cbX + cb / 2, CALIB_Y - 2.5, 3.0, `${cb} mm`, 'middle', '#000000'));
      parts.push(text(cbX + cb + 5, CALIB_Y + 1.2, 2.5, meta.generatedLabel, 'start', '#444444'));

      /* ── Registration marks at the overlap centres (tiled pages) ── */
      const mark = (mx: number, my: number) => {
        parts.push(`<circle data-registration="1" cx="${fmt(mx)}" cy="${fmt(my)}" r="1.5" fill="none" stroke="#000000" stroke-width="0.3"/>`);
        parts.push(`<line x1="${fmt(mx - 2.5)}" y1="${fmt(my)}" x2="${fmt(mx + 2.5)}" y2="${fmt(my)}" stroke="#000000" stroke-width="0.3"/>`);
      };
      if (!isLastX) mark(M + usableW - overlap / 2, CONTENT_TOP + 4);
      if (!isFirstX) mark(M + overlap / 2, CONTENT_TOP + 4);
      if (!isLastY) mark(MARK_X_LEFT, CONTENT_TOP + usableH - overlap / 2);
      if (!isFirstY) mark(MARK_X_LEFT, CONTENT_TOP + overlap / 2);

      const originXMm = xMin - PAD + px * stepX;
      const originYMm = yMax + PAD - py * stepY;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}mm" height="${PAGE_H}mm" viewBox="0 0 ${PAGE_W} ${PAGE_H}" data-physical-template="elbow-on-pipe-receiver-picaje" data-template-1to1="true" data-page-col="${px}" data-page-row="${py}"${hasYPrime ? ` data-external-cota-y-mm="${fmt(yPrime as number)}"` : ''}>${parts.join('')}</svg>`;
      tiles.push({ pageIndex: pageIdx, pageCount, pageCol: px, pageRow: py, originXMm, originYMm, widthMm: PAGE_W, heightMm: PAGE_H, svg });
      pageIdx++;
    }
  }

  return {
    tiles, pagesX, pagesY, tiled: pageCount > 1,
    xMinMm: xMin, xMaxMm: xMax, yMinMm: yMin, yMaxMm: yMax, widthMm: Wp, heightMm: Hp,
    overlapMm: overlap, pointsMm: points, crownArcMm: crownArc, crownXMm: crownX,
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
