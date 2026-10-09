/**
 * Pipe comb fabrication PDF exporter (P3-C): dimensioned fabrication sheet
 * + cut list, generated with jsPDF (already a project dependency).
 *
 * SINGLE SOURCE CONTRACT: every number, identifier, status and warning
 * comes from the approved `PipeCombFabricationSolution` and the pure
 * drawing model `buildPipeCombFabDrawing`. The exporter NEVER recomputes
 * fabrication values and never measures pixels; it only lays out the
 * drawing model and the solution on the page.
 *
 * Print contract:
 * - White background, grayscale-safe (no meaning carried by colour alone:
 *   line styles and labels distinguish pieces/references/theoretical).
 * - Vector strokes + selectable text (jsPDF native text/vector ops).
 * - Technical text >= 9 pt equivalent (jsPDF pt units on A4/A3).
 * - Landscape A4 (default) and A3; multi-page with repeated table headers
 *   and "page X of Y"; no ambiguous split rows (autotable rowPageBreak
 *   avoidance).
 * - Title block: PIPINGBOX, tool name, document id, generation date,
 *   unit, pipe/elbow spec, optional job reference, traceability.
 * - "Dimensioned representation — do not scale the drawing" note.
 * - Warnings stay visible; the document is never labelled as a certified
 *   interference-free assembly.
 *
 * i18n: all strings arrive already localized through `PdfStrings` (the
 * caller resolves them from i18next); this module has NO i18n dependency
 * of its own so it stays testable in Node.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  PipeCombFabricationSolution,
  FabricationPiece,
} from './pipe-comb-fabrication.ts';
import {
  buildPipeCombFabDrawing,
  projectPoint,
  type FabDrawingDimension,
  type FabDrawingJointMarker,
  type PipeCombFabDrawing,
  type Vec2,
} from './pipe-comb-fab-drawing.ts';

export type PdfPaperFormat = 'a4' | 'a3';

export interface PipeCombFabPdfSnapshot {
  /** Approved fabrication solution (immutable at export time). */
  solution: PipeCombFabricationSolution;
  /** Active presentation unit. */
  unit: 'mm' | 'in';
  /** BCP-47-ish language tag used for the strings (traceability only). */
  language: string;
  /** Presentation formatter (P3-B policy), canonical mm -> display text. */
  formatLength: (mm: number) => string;
  /** All user-visible strings, already localized. */
  strings: PdfStrings;
  /** Optional job/project reference (never required). */
  jobReference?: string;
  /** Document id / revision (traceability). */
  documentId: string;
  /** Generation date, already formatted for the document locale. */
  generatedAt: string;
  /** Paper format. */
  paper: PdfPaperFormat;
  /** Optional resolver mapping the module's stable internal joint-face
   *  strings to localized labels (screen parity). When omitted the raw
   *  stable identifiers are printed (Node tests use this path). */
  localizeJointFace?: (raw: string) => string;
  /**
   * Embedded fonts (REQUIRED): base64-encoded TTF files registered into
   * the document. The standard-14 Helvetica is WinAnsi-only and cannot
   * represent the accepted languages (Polish, Romanian, Cyrillic…), so
   * the exporter embeds Noto Sans (SIL OFL 1.1) loaded locally by the
   * caller — no remote requests, no transliteration, no dropped letters.
   */
  fonts: { regularBase64: string; boldBase64: string };
  /**
   * Selected radius family in catalog mode ('LR' | 'SR'), captured at
   * snapshot time from the current UI selection (the approved fabrication
   * result carries only clrSource, not the family). Undefined in bend
   * mode. Never inferred from text or radius heuristics.
   */
  elbowRadiusFamily?: 'LR' | 'SR';
}

export interface PdfStrings {
  title: string;
  docId: string;
  date: string;
  unit: string;
  language: string;
  jobRef: string;
  pageOf: string; // "Page {x} of {y}"
  generalView: string;
  /** Section/view title for the per-pipe-group dimensioned detail views
   *  used when the assembly is dense (N > 6). */
  detailView: string;
  cutList: string;
  elbowDetail: string;
  markingTitle: string;
  jointsTitle: string;
  warningsTitle: string;
  notToScale: string;
  nominalModelNote: string;
  notCertified: string;
  colPiece: string;
  colQty: string;
  colType: string;
  colFinished: string;
  colAllowance: string;
  colCut: string;
  colStatus: string;
  typeInlet: string;
  typeOutlet: string;
  typeBend: string;
  statusOk: string;
  statusInvalid: string;
  statusPending: string;
  accessoriesTitle: string;
  /** "{id}: NPS {nps} 90° {family} elbow cut to {angle}° — qty 1".
   *  {family} is the SELECTED radius family (LR/SR), captured in the
   *  snapshot — never a fixed string. */
  accessoryLine: string;
  bendAccessoryLine: string;
  dimLin: string;
  dimLout: string;
  dimDi: string;
  dimDf: string;
  dimStagger: string;
  dimAngle: string;
  dimFinished: string;
  dimCut: string;
  dimGap: string;
  refEnt: string;
  refSal: string;
  axisE: string; // "E{pipe}"
  pipeLabel: string; // "P{pipe}"
  elbowSpecLine: string; // "NPS {nps} · OD {od} · CLR {clr} ({source})"
  clrSourceCatalog: string;
  clrSourceCustom: string;
  keptAngleLine: string; // "90° elbow cut down, kept angle {angle}°"
  bendAngleLine: string;
  takeOutLine: string; // "take-out t = {value} per side"
  markMaterial: string;
  markReference: string;
  /** "{label}: {value} — {origin} to {destination} ({method})". Use ASCII
   *  arrows only: jsPDF's standard-14 Helvetica is WinAnsi-encoded and
   *  cannot encode "→" (it would render as "!'" in the real file). */
  markLine: string;
  /** "{id}: {faceA} <-> {faceB} · gap {gap}". ASCII "<->": the standard-14
   *  Helvetica cannot encode "↔" (WinAnsi). */
  jointLine: string;
  gapNote: string;
  allowanceNote: string; // "allowance {value} per pup — remove at fit-up"
  straightInlet: string;
  straightOutlet: string;
  arcDeveloped: string;
  barDeveloped: string;
  warnings: string[]; // already localized warning lines
  marks: { id: string; label: string; origin: string; destination: string; method: string; onMaterial: boolean }[];
}

const BRAND: [number, number, number] = [255, 140, 0];
const INK: [number, number, number] = [25, 25, 25];
const GREY: [number, number, number] = [110, 110, 110];
const LIGHT: [number, number, number] = [200, 200, 200];

const MARGIN = 12;
const TITLE_BLOCK_H = 26;

/** Embedded font family (Noto Sans, SIL OFL 1.1): full Latin-extended and
 *  Cyrillic coverage for all accepted languages. Registered per document
 *  from the snapshot's base64 payload; no remote requests at export time
 *  and no transliteration or letter dropping. */
const FONT_FAMILY = 'NotoSans';

function registerFonts(doc: jsPDF, snap: PipeCombFabPdfSnapshot): void {
  doc.addFileToVFS('NotoSans-Regular.ttf', snap.fonts.regularBase64);
  doc.addFont('NotoSans-Regular.ttf', FONT_FAMILY, 'normal');
  doc.addFileToVFS('NotoSans-Bold.ttf', snap.fonts.boldBase64);
  doc.addFont('NotoSans-Bold.ttf', FONT_FAMILY, 'bold');
  doc.setFont(FONT_FAMILY, 'normal');
}

/** Real rendered height (mm) of a possibly multi-line text block, from
 *  the document's own line-height metrics. Pagination decisions use this
 *  measured height, never a fixed per-line constant. */
function measureWrapped(doc: jsPDF, text: string, maxWidth: number): { lines: string[]; height: number } {
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  const height = (doc.getLineHeight() / doc.internal.scaleFactor) * lines.length;
  return { lines, height };
}

/* ------------------------------------------------------------------ */
/* Page-space annotation layout: every floating label (piece ids, E    */
/* points, dimension labels, reference names) is planned with its REAL  */
/* text box in page coordinates and resolved against the other labels,  */
/* the fixed text rows (titles, legends, data strips) and the drawn     */
/* strokes before anything is written, so labels can neither stack on   */
/* each other nor sit on the geometry. Values, anchors and the physical */
/* geometry never change — only the label position (with a thin leader  */
/* when displaced), which is representation, not recomputation.         */

interface PageBox { x0: number; y0: number; x1: number; y1: number }
interface PageSeg { x0: number; y0: number; x1: number; y1: number }

interface PlannedLabel {
  text: string;
  /** Baseline anchor (preferred position). */
  x: number;
  y: number;
  align: 'left' | 'center' | 'right';
  fontPt: number;
  bold: boolean;
  color: [number, number, number];
  /** Lower is placed first (semantic anchors keep their spot). */
  priority: number;
  /** Ordered page-space unit vectors tried at growing distances. */
  escape: Vec2[];
  /** Point the label refers to: a thin leader is drawn when displaced. */
  anchor?: Vec2;
  /** Strokes ignored while scoring THIS label (its own dimension and
   *  extension lines — the dimension line is gapped around the label). */
  ownLines?: PageSeg[];
  origX?: number;
  origY?: number;
}

/** Candidate displacement distances (mm), tried per escape direction. */
const LABEL_DIST_LADDER = [2.5, 5, 8, 12, 17, 24, 32, 45, 60];

function boxesOverlapArea(a: PageBox, b: PageBox): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Liang-Barsky segment × axis-aligned-box intersection test. */
function segHitsBox(s: PageSeg, b: PageBox): boolean {
  if (Math.max(s.x0, s.x1) < b.x0 || Math.min(s.x0, s.x1) > b.x1) return false;
  if (Math.max(s.y0, s.y1) < b.y0 || Math.min(s.y0, s.y1) > b.y1) return false;
  const dx = s.x1 - s.x0;
  const dy = s.y1 - s.y0;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return (
    clip(-dx, s.x0 - b.x0) && clip(dx, b.x1 - s.x0) &&
    clip(-dy, s.y0 - b.y0) && clip(dy, b.y1 - s.y0)
  );
}

const norm2 = (v: Vec2): Vec2 => {
  const l = Math.hypot(v.x, v.y);
  return l === 0 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
};

/** Greedy, priority-ordered, deterministic label placement. */
class AnnotationLayout {
  private labels: PlannedLabel[] = [];
  private placed: { box: PageBox; label: PlannedLabel }[] = [];
  private fixedBoxes: PageBox[] = [];
  private segs: PageSeg[] = [];
  private readonly doc: jsPDF;
  private readonly pageW: number;
  private readonly pageH: number;
  /** Lowest allowed box top (below the title block + view title). */
  private readonly yTopLimit: number;

  constructor(doc: jsPDF, pageW: number, pageH: number, yTopLimit: number) {
    this.doc = doc;
    this.pageW = pageW;
    this.pageH = pageH;
    this.yTopLimit = yTopLimit;
  }

  label(l: PlannedLabel): void {
    l.origX = l.x;
    l.origY = l.y;
    this.labels.push(l);
  }

  fixedBox(b: PageBox): void {
    this.fixedBoxes.push(b);
  }

  /** Measured box of a fixed text row already drawn on the page. */
  fixedText(text: string, x: number, y: number, fontPt: number, bold: boolean, pageWLimit: number): void {
    this.doc.setFont(FONT_FAMILY, bold ? 'bold' : 'normal');
    this.doc.setFontSize(fontPt);
    const w = Math.min(this.doc.getTextWidth(text), pageWLimit);
    const h = fontPt * 0.48;
    this.fixedBoxes.push({ x0: x, y0: y - h * 0.78, x1: x + w, y1: y + h * 0.22 });
  }

  seg(s: PageSeg): void {
    this.segs.push(s);
  }

  boxOf(l: PlannedLabel, x: number, y: number): PageBox {
    this.doc.setFont(FONT_FAMILY, l.bold ? 'bold' : 'normal');
    this.doc.setFontSize(l.fontPt);
    const w = this.doc.getTextWidth(l.text);
    const h = l.fontPt * 0.48;
    const x0 = l.align === 'center' ? x - w / 2 : l.align === 'right' ? x - w : x;
    return { x0, y0: y - h * 0.78, x1: x0 + w, y1: y + h * 0.22 };
  }

  private score(l: PlannedLabel, x: number, y: number): number {
    const b = this.boxOf(l, x, y);
    let s = 0;
    for (const f of this.fixedBoxes) s += boxesOverlapArea(b, f) * 3;
    for (const p of this.placed) s += boxesOverlapArea(b, p.box) * 3;
    /* Geometry strokes dominate: text on a piece line is far worse than
     * a slightly larger displacement, so a segment hit outweighs typical
     * box-overlap penalties. */
    for (const seg of this.segs) {
      if (l.ownLines && l.ownLines.indexOf(seg) >= 0) continue;
      if (segHitsBox(seg, b)) s += 60;
    }
    if (b.x0 < MARGIN) s += (MARGIN - b.x0) * 5;
    if (b.x1 > this.pageW - MARGIN) s += (b.x1 - (this.pageW - MARGIN)) * 5;
    if (b.y0 < this.yTopLimit) s += (this.yTopLimit - b.y0) * 5;
    if (b.y1 > this.pageH - MARGIN - 8) s += (b.y1 - (this.pageH - MARGIN - 8)) * 5;
    return s;
  }

  /** Place every label: preferred spot first, then escape directions at
   *  growing distances; first collision-free candidate wins, otherwise
   *  the least-overlapping one (bounded, no oscillation). */
  resolve(): void {
    const sorted = [...this.labels].sort((a, b) => a.priority - b.priority);
    for (const l of sorted) {
      const cands: { x: number; y: number }[] = [{ x: l.x, y: l.y }];
      for (const d of l.escape) {
        for (const m of LABEL_DIST_LADDER) cands.push({ x: l.x + d.x * m, y: l.y + d.y * m });
      }
      let best = cands[0];
      let bestScore = Infinity;
      for (const c of cands) {
        const s = this.score(l, c.x, c.y);
        if (s <= 0) {
          best = c;
          bestScore = 0;
          break;
        }
        if (s < bestScore) {
          bestScore = s;
          best = c;
        }
      }
      l.x = best.x;
      l.y = best.y;
      this.placed.push({ box: this.boxOf(l, l.x, l.y), label: l });
    }
  }

  /** Final placed label boxes — auxiliary strokes (reference planes,
   *  dimension/extension lines, leaders) are gapped around them after
   *  resolve. */
  placedBoxes(): PageBox[] {
    return this.placed.map((p) => p.box);
  }

  /** Draw leaders for displaced labels, then all label texts. Leaders
   *  stop at the label's REAL glyph box (tighter than the layout box, so
   *  the stroke never penetrates the rendered text) and are gapped
   *  around every OTHER placed label — a long leader never crosses text. */
  draw(): void {
    this.doc.setDrawColor(...GREY);
    this.doc.setLineWidth(0.15);
    for (const l of this.labels) {
      if (!l.anchor || l.origX === undefined || l.origY === undefined) continue;
      if (Math.hypot(l.x - l.origX, l.y - l.origY) <= 3) continue;
      /* Real glyph extents (mm from baseline): ascent 0.72*em, descent
       * 0.28*em — tighter than the superset box used for placement. */
      const w = this.placed.find((p) => p.label === l)?.box;
      if (!w) continue;
      const rb = {
        x0: w.x0 + 0.3,
        x1: w.x1 - 0.3,
        y0: l.y - (l.fontPt * 0.48) * 0.72,
        y1: l.y + (l.fontPt * 0.48) * 0.28,
      };
      const tx = Math.max(rb.x0, Math.min(l.anchor.x, rb.x1));
      const ty = Math.max(rb.y0, Math.min(l.anchor.y, rb.y1));
      if (tx === l.anchor.x && ty === l.anchor.y) continue; // inside its own box
      const others = this.placed.filter((p) => p.label !== l).map((p) => p.box);
      drawGappedLine(this.doc, { x0: l.anchor.x, y0: l.anchor.y, x1: tx, y1: ty }, others, 0.4);
    }
    for (const l of this.labels) {
      this.doc.setFont(FONT_FAMILY, l.bold ? 'bold' : 'normal');
      this.doc.setFontSize(l.fontPt);
      this.doc.setTextColor(...l.color);
      this.doc.text(l.text, l.x, l.y, { align: l.align });
    }
  }
}

/** Draw an AUXILIARY stroke (reference plane, dimension or extension
 *  line) split around every placed label box: the line keeps its exact
 *  endpoints and direction, only short gaps open where a label sits, so
 *  no text is ever crossed by an auxiliary line. Geometry strokes
 *  (pieces, arcs, joint ticks) are never gapped. */
function drawGappedLine(doc: jsPDF, s: PageSeg, boxes: PageBox[], gap = 0.8): void {
  const dx = s.x1 - s.x0;
  const dy = s.y1 - s.y0;
  if (dx === 0 && dy === 0) return;
  const clips: { t0: number; t1: number }[] = [];
  for (const raw of boxes) {
    const b = { x0: raw.x0 - gap, y0: raw.y0 - gap, x1: raw.x1 + gap, y1: raw.y1 + gap };
    let t0 = 0;
    let t1 = 1;
    let ok = true;
    const clip = (p: number, q: number): void => {
      if (p === 0) {
        if (q < 0) ok = false;
        return;
      }
      const r = q / p;
      if (p < 0) {
        if (r > t1) ok = false;
        else if (r > t0) t0 = r;
      } else {
        if (r < t0) ok = false;
        else if (r < t1) t1 = r;
      }
    };
    clip(-dx, s.x0 - b.x0);
    if (ok) clip(dx, b.x1 - s.x0);
    if (ok) clip(-dy, s.y0 - b.y0);
    if (ok) clip(dy, b.y1 - s.y0);
    if (ok && t1 > t0) clips.push({ t0, t1 });
  }
  clips.sort((a, b) => a.t0 - b.t0);
  const merged: { t0: number; t1: number }[] = [];
  for (const c of clips) {
    const last = merged[merged.length - 1];
    if (last && c.t0 <= last.t1) last.t1 = Math.max(last.t1, c.t1);
    else merged.push({ ...c });
  }
  let t = 0;
  for (const c of merged) {
    if (c.t0 > t + 0.05) doc.line(s.x0 + dx * t, s.y0 + dy * t, s.x0 + dx * c.t0, s.y0 + dy * c.t0);
    t = Math.max(t, c.t1);
  }
  if (t < 1 - 0.05) doc.line(s.x0 + dx * t, s.y0 + dy * t, s.x1, s.y1);
}

/**
 * Generate the fabrication PDF and return the jsPDF document (caller
 * decides `save()` vs `output()` — the tests inspect the real file).
 */
export function generatePipeCombFabPdf(snapshot: PipeCombFabPdfSnapshot): jsPDF {
  const { solution: sol, strings: S, paper } = snapshot;
  const drawing = buildPipeCombFabDrawing(sol);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: paper });
  registerFonts(doc, snapshot);
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  let pageNo = 0;
  const addPage = () => {
    if (pageNo > 0) doc.addPage();
    pageNo += 1;
    drawTitleBlock(doc, snapshot, pageW);
    return MARGIN + TITLE_BLOCK_H + 4;
  };

  // ── Page 1: general dimensioned view + assembly data ──────────────────
  let y = addPage();
  y = drawGeneralView(doc, drawing, sol, snapshot, y, pageW, pageH);

  // ── Cut list (own flow; autotable handles pagination with repeated
  //    headers and no split rows) ─────────────────────────────────────────
  y += 4;
  const ensureShared = (yy: number, needed: number): number =>
    yy + needed > pageH - MARGIN - 12 ? addPage() : yy;
  drawCutList(doc, sol, snapshot, y, pageW, ensureShared);

  // ── Elbow / marking / joints detail pages (flow with pagination: a
  //    section that would overflow the printable area starts a new page
  //    instead of being clipped). ────────────────────────────────────────
  addPage();
  y = MARGIN + TITLE_BLOCK_H + 4;
  const flow = (draw: (yy: number) => number, needed: number) => {
    if (y + needed > pageH - MARGIN - 12) {
      y = addPage();
    }
    y = draw(y);
  };
  const ensure = ensureShared;
  /* Dense assemblies (N > 6): the overview stays readable (global
   * dimensions only), and EVERY pipe keeps its identifiers, finished/cut
   * dimensions and joint markers in per-group detail views, so no
   * dimension is lost to the density threshold. */
  if (drawing.pipeCount > 6) {
    const groups: number[][] = [];
    for (let i = 0; i < drawing.pipeCount; i += 3) {
      groups.push(Array.from({ length: Math.min(3, drawing.pipeCount - i) }, (_, j) => i + j + 1));
    }
    const groupNeeded = Math.min(pageH - (MARGIN + TITLE_BLOCK_H + 4) - 38, (pageW - 2 * MARGIN) * 0.26) + 36;
    for (const group of groups) {
      flow((yy) => drawPipeGroupView(doc, drawing, sol, snapshot, yy, pageW, pageH, group), groupNeeded);
    }
  }
  flow((yy) => drawElbowDetail(doc, drawing, sol, snapshot, yy, pageW), elbowDetailExtent(doc, drawing, sol, snapshot, pageW));
  flow((yy) => drawMarking(doc, sol, snapshot, yy, pageW, ensure), 14 + sol.elbow.marks.length * 5 + 12);
  flow((yy) => drawJoints(doc, sol, snapshot, yy, pageW, ensure), 14 + Math.min(sol.joints.length, 8) * 5 + 10);
  flow((yy) => drawWarnings(doc, sol, snapshot, yy, pageW, ensure), 16 + Math.max(1, snapshot.strings.warnings.length) * 5 + 10);

  // ── Footer: page X of Y on every page ─────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont(FONT_FAMILY, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GREY);
    doc.text(
      S.pageOf.replace('{x}', String(p)).replace('{y}', String(total)),
      pageW - MARGIN,
      pageH - 6,
      { align: 'right' },
    );
    doc.text(S.notToScale, MARGIN, pageH - 6);
  }
  return doc;
}

/* ------------------------------------------------------------------ */

function drawTitleBlock(doc: jsPDF, snap: PipeCombFabPdfSnapshot, pageW: number): void {
  const S = snap.strings;
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageW, 12, 'F');
  doc.setFont(FONT_FAMILY, 'bold');
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text('PIPINGBOX', MARGIN, 8);
  doc.setFontSize(9);
  doc.setFont(FONT_FAMILY, 'normal');
  doc.text(S.title, MARGIN + 34, 8);

  doc.setFontSize(9);
  doc.setTextColor(...INK);
  const line2 = [
    `${S.docId}: ${snap.documentId}`,
    `${S.date}: ${snap.generatedAt}`,
    `${S.unit}: ${snap.unit}`,
    `${S.language}: ${snap.language}`,
  ];
  if (snap.jobReference) line2.push(`${S.jobRef}: ${snap.jobReference}`);
  doc.text(line2.join('   ·   '), MARGIN, 17.5);

  const sol = snap.solution;
  const spec = sol.elbow.mode === 'catalog-cut'
    ? `${S.elbowSpecLine.replace('{nps}', sol.elbow.nps).replace('{od}', snap.formatLength(sol.elbow.odMm)).replace('{clr}', snap.formatLength(sol.elbow.clrMm)).replace('{source}', S.clrSourceCatalog)} · ${S.keptAngleLine.replace('{angle}', String(sol.elbow.keptAngleDeg))}`
    : `${S.elbowSpecLine.replace('{nps}', sol.elbow.nps).replace('{od}', snap.formatLength(sol.elbow.odMm)).replace('{clr}', snap.formatLength(sol.elbow.clrMm)).replace('{source}', S.clrSourceCustom)} · ${S.bendAngleLine.replace('{angle}', String(sol.elbow.keptAngleDeg))}`;
  doc.setTextColor(...GREY);
  doc.text(spec, MARGIN, 23);
  doc.setDrawColor(...LIGHT);
  doc.line(MARGIN, TITLE_BLOCK_H, pageW - MARGIN, TITLE_BLOCK_H);
}

/** Fit the drawing bounds into a box and return the affine transform. */
function fitTransform(
  drawing: PipeCombFabDrawing,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
): { scale: number; tx: number; ty: number } {
  const pMin = { x: Infinity, y: Infinity };
  const pMax = { x: -Infinity, y: -Infinity };
  const corners = [
    projectPoint({ x: drawing.bounds.min.x, y: drawing.bounds.min.y }),
    projectPoint({ x: drawing.bounds.min.x, y: drawing.bounds.max.y }),
    projectPoint({ x: drawing.bounds.max.x, y: drawing.bounds.min.y }),
    projectPoint({ x: drawing.bounds.max.x, y: drawing.bounds.max.y }),
  ];
  for (const c of corners) {
    pMin.x = Math.min(pMin.x, c.x);
    pMin.y = Math.min(pMin.y, c.y);
    pMax.x = Math.max(pMax.x, c.x);
    pMax.y = Math.max(pMax.y, c.y);
  }
  const w = Math.max(pMax.x - pMin.x, 1e-6);
  const h = Math.max(pMax.y - pMin.y, 1e-6);
  const scale = Math.min(boxW / w, boxH / h);
  // jsPDF y grows downwards; flip the projected y.
  const tx = boxX - pMin.x * scale;
  const ty = boxY + pMax.y * scale;
  return { scale, tx, ty };
}

function drawGeneralView(
  doc: jsPDF,
  drawing: PipeCombFabDrawing,
  sol: PipeCombFabricationSolution,
  snap: PipeCombFabPdfSnapshot,
  yTop: number,
  pageW: number,
  pageH: number,
): number {
  const S = snap.strings;
  const titleY = yTop + 4;
  const layout = new AnnotationLayout(doc, pageW, pageH, titleY + 2.5);

  doc.setFont(FONT_FAMILY, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(S.generalView, MARGIN, titleY);
  layout.fixedText(S.generalView, MARGIN, titleY, 11, true, pageW - 2 * MARGIN);

  const boxX = MARGIN;
  const boxY = yTop + 8;
  const boxW = pageW - 2 * MARGIN;
  const boxH = Math.min(pageH - boxY - 30, (pageW - 2 * MARGIN) * 0.42);
  const { scale, tx, ty } = fitTransform(drawing, boxX, boxY, boxW, boxH);
  const map = (p: Vec2): Vec2 => {
    const q = projectPoint(p);
    return { x: tx + q.x * scale, y: ty - q.y * scale };
  };
  /* Keep a dense N=12 overview readable: the cut list and detail pages
   * retain every piece identifier and its physical dimension. The overview
   * still shows the complete topology, reference planes and global Di/Df/A/
   * Lin/Lout dimensions. */
  const overviewIsDense = drawing.pipeCount > 6;

  // Reference planes (dashed) + floating plane labels. The STROKE is
  // deferred until after the label layout resolves: planes are auxiliary
  // lines and are gapped around the final label boxes (they pass through
  // the piece faces, so ungapped they would cross the piece labels).
  const planeSegs: PageSeg[] = [];
  for (const ref of drawing.referencePlanes) {
    const half = (drawing.bounds.max.y - drawing.bounds.min.y) * 0.62 + 20;
    let a = map({ x: ref.point.x - ref.direction.x * half, y: ref.point.y - ref.direction.y * half });
    let b = map({ x: ref.point.x + ref.direction.x * half, y: ref.point.y + ref.direction.y * half });
    /* Clamp the plane stroke to the drawing box (+3 mm): an unclamped
     * plane line runs far below the fitted view and crosses the assembly
     * data strip under it. */
    const clampY = (p: Vec2): Vec2 => ({ x: p.x, y: Math.max(boxY - 3, Math.min(boxY + boxH + 3, p.y)) });
    a = clampY(a);
    b = clampY(b);
    const seg: PageSeg = { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
    planeSegs.push(seg);
    const labelPos = map({ x: ref.point.x + ref.direction.x * (half + 4), y: ref.point.y + ref.direction.y * (half + 4) });
    const pd = directionToPage(ref.direction);
    layout.label({
      text: ref.id === 'REF-ENT' ? S.refEnt : S.refSal,
      x: labelPos.x,
      y: labelPos.y,
      align: 'left',
      fontPt: 9,
      bold: true,
      color: GREY,
      priority: 1,
      escape: [pd, { x: -pd.x, y: -pd.y }, { x: -pd.y, y: pd.x }, { x: pd.y, y: -pd.x }],
      anchor: map(ref.point),
    });
  }

  // Pieces: solid for finished, thin dashed for allowance over-length.
  for (const seg of drawing.segments) {
    const a = map(seg.from);
    const b = map(seg.to);
    if (seg.finished) {
      doc.setDrawColor(...INK);
      doc.setLineWidth(0.7);
      doc.setLineDashPattern([], 0);
    } else {
      doc.setDrawColor(...GREY);
      doc.setLineWidth(0.3);
      doc.setLineDashPattern([1.5, 1.5], 0);
    }
    doc.line(a.x, a.y, b.x, b.y);
    layout.seg({ x0: a.x, y0: a.y, x1: b.x, y1: b.y });
  }
  doc.setLineDashPattern([], 0);

  // Elbow / bend arcs (polyline approximation of the model arc).
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.7);
  for (const arc of drawing.arcs) strokeArc(doc, arc, map, layout);

  // Axis intersections E_i (theoretical points) + floating labels.
  for (const det of drawing.elbowDetails) {
    const e = map(det.axisIntersection);
    doc.setDrawColor(...GREY);
    doc.setLineWidth(0.2);
    doc.line(e.x - 2, e.y, e.x + 2, e.y);
    doc.line(e.x, e.y - 2, e.x, e.y + 2);
    layout.seg({ x0: e.x - 2, y0: e.y, x1: e.x + 2, y1: e.y });
    layout.seg({ x0: e.x, y0: e.y - 2, x1: e.x, y1: e.y + 2 });
    if (!overviewIsDense) {
      layout.label({
        text: S.axisE.replace('{pipe}', String(det.pipeNumber)),
        x: e.x + 3.2,
        y: e.y - 2.4,
        align: 'left',
        fontPt: 9,
        bold: false,
        color: GREY,
        priority: 3,
        escape: [
          norm2({ x: 1, y: -0.5 }),
          norm2({ x: -1, y: -0.5 }),
          norm2({ x: 1, y: 0.6 }),
          norm2({ x: -1, y: 0.6 }),
          { x: 0, y: -1 },
        ],
        anchor: { x: e.x, y: e.y },
      });
    }
  }

  // Joint markers: orientation from the joint's LOCAL AXIS (model data),
  // never from the two faces — they coincide when g = 0 and would
  // degenerate the marker into a zero-length line.
  drawJointMarkers(doc, drawing.joints, map, false, snap, layout);

  /* Dimensions (thin lines with end ticks + label carrying the real model
   * value). Dense overviews keep only the GLOBAL dimensions (Lin/Lout/Di/
   * Df/A); per-piece lengths live in the per-group detail views. The
   * Di/Df/A anchors collapse onto the same corner at dense scale, so
   * their preferred label positions start on short page-space offsets
   * (resolved further by the label layout). */
  const pending: PendingDimension[] = [];
  const denseLeader: Record<string, { mm: number; dir?: Vec2 }> = {
    'dim-Di': { mm: 10 },
    'dim-stagger': { mm: 15 },
    'dim-Df': { mm: 12, dir: { x: 0.5, y: 0.87 } },
  };
  for (const dim of drawing.dimensions) {
    const isPieceDim = dim.kind === 'finished-length' || dim.kind === 'cut-length';
    if (overviewIsDense && isPieceDim) continue;
    let d = dim;
    if (!overviewIsDense && isPieceDim) {
      /* Along-run parity shift: keeps a pup's finished/cut labels away
       * from the Lin/Lout global anchors (e.g. the 90° case, where those
       * anchors coincide visually). Only the initial label position
       * slides parallel to the run. */
      const pipeNo = Number(/^P(\d+)-/.exec(dim.ownerId)?.[1] ?? 0);
      const f = pipeNo % 2 === 0 ? 0.7 : 0.3;
      const mid = { x: (dim.from.x + dim.to.x) / 2, y: (dim.from.y + dim.to.y) / 2 };
      const perpOff = { x: dim.labelAt.x - mid.x, y: dim.labelAt.y - mid.y };
      d = {
        ...dim,
        labelAt: {
          x: dim.from.x + (dim.to.x - dim.from.x) * f + perpOff.x,
          y: dim.from.y + (dim.to.y - dim.from.y) * f + perpOff.y,
        },
      };
    }
    const pre = overviewIsDense ? denseLeader[dim.id] : undefined;
    const preDir = pre ? norm2(pre.dir ?? directionToPage(d.offsetDir)) : undefined;
    pending.push(
      planDimension(
        doc,
        layout,
        d,
        map,
        snap,
        isPieceDim ? 0 : 0,
        pre && preDir ? { x: preDir.x * pre.mm, y: preDir.y * pre.mm } : undefined,
      ),
    );
  }

  // Piece identifiers near segment midpoints (floating, with leaders).
  for (const seg of drawing.segments) {
    if (!seg.finished) continue;
    if (overviewIsDense) continue;
    const mid = map({ x: (seg.from.x + seg.to.x) / 2, y: (seg.from.y + seg.to.y) / 2 });
    layout.label({
      text: seg.pieceId,
      x: mid.x,
      y: mid.y - 1.6,
      align: 'center',
      fontPt: 9,
      bold: true,
      color: INK,
      priority: 1,
      escape: [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0.7, y: -0.7 }, { x: -0.7, y: -0.7 }, { x: 0.7, y: 0.7 }, { x: -0.7, y: 0.7 }],
      anchor: mid,
    });
  }
  for (const arc of drawing.arcs) {
    const midAng = (arc.startRad + arc.endRad) / 2;
    const p = map({
      x: arc.center.x + arc.radiusMm * Math.cos(midAng),
      y: arc.center.y + arc.radiusMm * Math.sin(midAng),
    });
    if (!overviewIsDense) {
      layout.label({
        text: arc.pieceId,
        x: p.x,
        y: p.y - 1.6,
        align: 'center',
        fontPt: 9,
        bold: true,
        color: INK,
        priority: 1,
        escape: [
          { x: 0, y: -1 },
          norm2({ x: 0.6, y: -0.8 }),
          norm2({ x: -0.6, y: -0.8 }),
          { x: 0, y: 1 },
          { x: 1, y: 0 },
          { x: -1, y: 0 },
        ],
        anchor: p,
      });
    } else {
      // Dense overview: short pipe labels keep every pipe (and therefore
      // every detail-view group) unequivocally identifiable.
      const pipeNo = arc.pieceId.match(/^P(\d+)-/)?.[1];
      if (pipeNo) {
        layout.label({
          text: S.pipeLabel.replace('{pipe}', pipeNo),
          x: p.x,
          y: p.y - 1.6,
          align: 'center',
          fontPt: 9,
          bold: true,
          color: INK,
          priority: 1,
          escape: [
            { x: 0, y: -1 },
            norm2({ x: 0.6, y: -0.8 }),
            norm2({ x: -0.6, y: -0.8 }),
            { x: 0, y: 1 },
            { x: 1, y: 0 },
            { x: -1, y: 0 },
          ],
          anchor: p,
        });
      }
    }
  }

  // Assembly data strip under the view (fixed obstacle for the labels).
  const dataY = boxY + boxH + 6;
  doc.setFont(FONT_FAMILY, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  const staggerTxt = `${S.dimStagger}: ${snap.formatLength(sol.stagger.adjacentStaggerMm)}`;
  const angleTxt = `${S.dimAngle}: ${sol.stagger.elbowAngleDeg}°`;
  const diTxt = `${S.dimDi}: ${snap.formatLength(sol.stagger.initialSpacingMm)}`;
  const dfTxt = `Df: ${snap.formatLength(sol.stagger.finalSpacingMm)}`;
  const linTxt = `${S.dimLin}: ${sol.references.inletAxisToAxisMm !== undefined ? snap.formatLength(sol.references.inletAxisToAxisMm) : '—'}`;
  const loutTxt = `${S.dimLout}: ${sol.references.outletAxisToAxisMm !== undefined ? snap.formatLength(sol.references.outletAxisToAxisMm) : '—'}`;
  const strip = [diTxt, dfTxt, angleTxt, staggerTxt, linTxt, loutTxt].join('    ·    ');
  doc.text(strip, MARGIN, dataY);
  layout.fixedText(strip, MARGIN, dataY, 9, false, pageW - 2 * MARGIN);

  // Resolve the annotation layout, then draw the reference planes
  // (dashed, gapped around the final label boxes), the dimension strokes
  // (gapped likewise), leaders and texts.
  layout.resolve();
  doc.setDrawColor(...GREY);
  doc.setLineDashPattern([3, 2], 0);
  doc.setLineWidth(0.25);
  for (const seg of planeSegs) drawGappedLine(doc, seg, layout.placedBoxes());
  doc.setLineDashPattern([], 0);
  for (const pd of pending) drawResolvedDimension(doc, layout, pd);
  layout.draw();
  return dataY + 2;
}

/** Page-space image of a model-plane DIRECTION vector: the projection is
 *  linear (so it maps vectors too) and jsPDF y grows downwards (flip). */
function directionToPage(v: Vec2): Vec2 {
  const q = projectPoint(v);
  const n = Math.hypot(q.x, q.y) || 1;
  return { x: q.x / n, y: -q.y / n };
}

/**
 * Joint tick markers. The tick orientation comes from the joint's LOCAL
 * AXIS provided by the drawing model (j.axis), transformed to page space
 * and normalized — NEVER from the segment between the two joint faces,
 * which COINCIDE when g = 0 and used to degenerate the marker into a
 * zero-length line (the old "|| 1" fallback produced length, not
 * direction). g > 0 keeps both real faces with their true separation;
 * no fictitious gap is introduced when g = 0.
 */
function drawJointMarkers(
  doc: jsPDF,
  joints: FabDrawingJointMarker[],
  map: (p: Vec2) => Vec2,
  withIds: boolean,
  snap: PipeCombFabPdfSnapshot,
  layout?: AnnotationLayout,
): void {
  const off = 1.6;
  for (const j of joints) {
    const d = directionToPage(j.axis);
    const n = { x: -d.y, y: d.x };
    const a = map(j.pupFace);
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.5);
    doc.line(a.x - n.x * off, a.y - n.y * off, a.x + n.x * off, a.y + n.y * off);
    layout?.seg({ x0: a.x - n.x * off, y0: a.y - n.y * off, x1: a.x + n.x * off, y1: a.y + n.y * off });
    if (j.gapMm > 0) {
      const b = map(j.elbowFace);
      doc.line(b.x - n.x * off, b.y - n.y * off, b.x + n.x * off, b.y + n.y * off);
      layout?.seg({ x0: b.x - n.x * off, y0: b.y - n.y * off, x1: b.x + n.x * off, y1: b.y + n.y * off });
    }
    if (withIds) {
      const label = j.gapMm > 0
        ? `${j.jointId} · ${snap.strings.dimGap} ${snap.formatLength(j.gapMm)}`
        : j.jointId;
      /* Alternate the label side per pipe so adjacent pipes' joint ids do
       * not stack on top of each other in the compressed elbow zone. */
      const pipeNo = Number(/^J(\d+)-/.exec(j.jointId)?.[1] ?? 0);
      const side = pipeNo % 2 === 0 ? 1 : -1;
      const lx = a.x + n.x * side * (off + 2.5);
      const ly = a.y + n.y * side * (off + 2.5) + 1;
      layout?.label({
        text: label,
        x: lx,
        y: ly,
        align: 'left',
        fontPt: 9,
        bold: false,
        color: INK,
        priority: 2,
        escape: [norm2(n), norm2(d), norm2({ x: -d.x, y: -d.y }), norm2({ x: -n.x, y: -n.y })],
        anchor: { x: a.x, y: a.y },
      });
      if (!layout) {
        doc.setFont(FONT_FAMILY, 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...INK);
        doc.text(label, lx, ly);
      }
    }
  }
}

/** A dimension whose label is planned into the view's AnnotationLayout;
 *  the strokes are drawn only after resolve() so the dimension line is
 *  gapped around the label's FINAL position (never under the text). */
interface PendingDimension {
  a: Vec2;
  b: Vec2;
  a2: Vec2;
  b2: Vec2;
  label: PlannedLabel;
}

/** Plan one dimension: page-space endpoints, offset dimension line,
 *  extension lines (registered as obstacles for OTHER labels) and the
 *  floating label. `preOffset` moves the preferred label position in
 *  page space (dense-overview leaders) without touching the anchor. */
function planDimension(
  doc: jsPDF,
  layout: AnnotationLayout,
  dim: FabDrawingDimension,
  map: (p: Vec2) => Vec2,
  snap: PipeCombFabPdfSnapshot,
  priority: number,
  preOffset?: Vec2,
): PendingDimension {
  const a = map(dim.from);
  const b = map(dim.to);
  const l = map(dim.labelAt);
  const dir = { x: b.x - a.x, y: b.y - a.y };
  const len = Math.hypot(dir.x, dir.y) || 1;
  const u = { x: dir.x / len, y: dir.y / len };
  const tStar = (l.x - a.x) * u.x + (l.y - a.y) * u.y;
  const proj = { x: a.x + u.x * tStar, y: a.y + u.y * tStar };
  const offVec = { x: l.x - proj.x, y: l.y - proj.y };
  const a2 = { x: a.x + offVec.x, y: a.y + offVec.y };
  const b2 = { x: b.x + offVec.x, y: b.y + offVec.y };
  const extA: PageSeg = { x0: a.x, y0: a.y, x1: a2.x, y1: a2.y };
  const extB: PageSeg = { x0: b.x, y0: b.y, x1: b2.x, y1: b2.y };
  const dimLine: PageSeg = { x0: a2.x, y0: a2.y, x1: b2.x, y1: b2.y };
  /* Aux strokes are NOT registered as label obstacles: they are gapped
   * around the final label boxes at draw time (drawGappedLine), so a
   * label may legitimately sit on its own or another dimension line —
   * only real geometry constrains the labels. */
  const offDir = norm2(offVec.x === 0 && offVec.y === 0 ? { x: -u.y, y: u.x } : offVec);
  const label: PlannedLabel = {
    text: dimensionLabel(dim.id, dim.measureKey, dim.valueMm, snap),
    x: l.x + (preOffset?.x ?? 0),
    y: l.y + (preOffset?.y ?? 0),
    align: 'center',
    fontPt: 9,
    bold: false,
    color: INK,
    priority,
    escape: [
      offDir,
      { x: -offDir.x, y: -offDir.y },
      { x: u.x, y: u.y },
      { x: -u.x, y: -u.y },
      norm2({ x: offDir.x + u.x, y: offDir.y + u.y }),
      norm2({ x: offDir.x - u.x, y: offDir.y - u.y }),
      norm2({ x: -offDir.x + u.x, y: -offDir.y + u.y }),
      norm2({ x: -offDir.x - u.x, y: -offDir.y - u.y }),
      { x: -u.y, y: u.x },
      { x: u.y, y: -u.x },
    ],
    anchor: { x: l.x, y: l.y },
    ownLines: [extA, extB, dimLine],
  };
  layout.label(label);
  void extA; void extB; void dimLine;
  void doc;
  return { a, b, a2, b2, label };
}

/** Draw a resolved dimension: extension lines, dimension line and end
 *  ticks, all gapped around the FINAL placed label boxes (its own label
 *  first, but every other displaced label too). Values and anchors are
 *  untouched — only the gaps follow the resolved labels. */
function drawResolvedDimension(doc: jsPDF, layout: AnnotationLayout, pd: PendingDimension): void {
  const { a, b, a2, b2 } = pd;
  const boxes = layout.placedBoxes();
  doc.setDrawColor(...GREY);
  doc.setLineWidth(0.2);
  drawGappedLine(doc, { x0: a.x, y0: a.y, x1: a2.x, y1: a2.y }, boxes);
  drawGappedLine(doc, { x0: b.x, y0: b.y, x1: b2.x, y1: b2.y }, boxes);
  drawGappedLine(doc, { x0: a2.x, y0: a2.y, x1: b2.x, y1: b2.y }, boxes);
  const dx = b2.x - a2.x;
  const dy = b2.y - a2.y;
  const L = Math.hypot(dx, dy) || 1;
  const u = { x: dx / L, y: dy / L };
  const tick = 1.4;
  const tn = { x: -u.y, y: u.x };
  doc.line(a2.x - tn.x * tick, a2.y - tn.y * tick, a2.x + tn.x * tick, a2.y + tn.y * tick);
  doc.line(b2.x - tn.x * tick, b2.y - tn.y * tick, b2.x + tn.x * tick, b2.y + tn.y * tick);
}

/** Polyline stroke of a drawing-model arc (elbow/bend centerline). The
 *  polyline segments are registered as label obstacles. */
function strokeArc(doc: jsPDF, arc: PipeCombFabDrawing['arcs'][number], map: (p: Vec2) => Vec2, layout?: AnnotationLayout): void {
  const steps = Math.max(12, Math.ceil(Math.abs(arc.endRad - arc.startRad) / (Math.PI / 72)));
  let prev: Vec2 | null = null;
  for (let i = 0; i <= steps; i++) {
    const ang = arc.startRad + ((arc.endRad - arc.startRad) * i) / steps;
    const p = map({
      x: arc.center.x + arc.radiusMm * Math.cos(ang),
      y: arc.center.y + arc.radiusMm * Math.sin(ang),
    });
    if (prev) {
      doc.line(prev.x, prev.y, p.x, p.y);
      layout?.seg({ x0: prev.x, y0: prev.y, x1: p.x, y1: p.y });
    }
    prev = p;
  }
}

/**
 * Dense-assembly detail view (N > 6) for a group of up to three pipes.
 * The de-cluttered overview keeps only the global dimensions; this view
 * carries, for every pipe of the group: piece identifiers, finished and
 * cut dimension lines (when an allowance makes them differ), joint
 * markers with their ids and real gaps, and the theoretical intersection
 * E. Values come from the solution/drawing model — nothing recomputed,
 * no topology or measure altered for layout.
 */
function drawPipeGroupView(
  doc: jsPDF,
  drawing: PipeCombFabDrawing,
  sol: PipeCombFabricationSolution,
  snap: PipeCombFabPdfSnapshot,
  yTop: number,
  pageW: number,
  pageH: number,
  pipeNumbers: number[],
): number {
  const S = snap.strings;
  const titleY = yTop + 4;
  const layout = new AnnotationLayout(doc, pageW, pageH, titleY + 2.5);
  doc.setFont(FONT_FAMILY, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  const title = `${S.detailView}: ${pipeNumbers.map((n) => S.pipeLabel.replace('{pipe}', String(n))).join('–')}`;
  doc.text(title, MARGIN, titleY);
  layout.fixedText(title, MARGIN, titleY, 11, true, pageW - 2 * MARGIN);

  const pieceIds = new Set(
    sol.pipes
      .filter((p) => pipeNumbers.includes(p.pipeNumber))
      .flatMap((p) => p.pieces.map((x) => x.id)),
  );
  const segs = drawing.segments.filter((s) => pieceIds.has(s.pieceId));
  const arcs = drawing.arcs.filter((a) => pieceIds.has(a.pieceId));
  const joints = drawing.joints.filter((j) => {
    const m = /^J(\d+)-/.exec(j.jointId);
    return m !== null && pipeNumbers.includes(Number(m[1]));
  });
  const dims = drawing.dimensions.filter((d) => pieceIds.has(d.ownerId));
  const dets = drawing.elbowDetails.filter((d) => pipeNumbers.includes(d.pipeNumber));

  // Local framing: projected bounds of everything drawn, labels included.
  const pts: Vec2[] = [];
  for (const s of segs) pts.push(s.from, s.to);
  for (const a of arcs) {
    pts.push(
      { x: a.center.x - a.radiusMm, y: a.center.y - a.radiusMm },
      { x: a.center.x + a.radiusMm, y: a.center.y + a.radiusMm },
    );
  }
  for (const d of dims) pts.push(d.from, d.to, d.labelAt);
  for (const j of joints) pts.push(j.pupFace, j.elbowFace);
  for (const d of dets) pts.push(d.axisIntersection);
  const pMin = { x: Infinity, y: Infinity };
  const pMax = { x: -Infinity, y: -Infinity };
  for (const p of pts) {
    const q = projectPoint(p);
    pMin.x = Math.min(pMin.x, q.x);
    pMin.y = Math.min(pMin.y, q.y);
    pMax.x = Math.max(pMax.x, q.x);
    pMax.y = Math.max(pMax.y, q.y);
  }
  const w = Math.max(pMax.x - pMin.x, 1e-6);
  const h = Math.max(pMax.y - pMin.y, 1e-6);
  const boxX = MARGIN;
  const boxY = yTop + 8;
  const boxW = pageW - 2 * MARGIN;
  const boxH = Math.min(pageH - boxY - 30, boxW * 0.26);
  const scale = Math.min(boxW / w, boxH / h);
  const tx = boxX + (boxW - w * scale) / 2 - pMin.x * scale;
  const ty = boxY + (boxH - h * scale) / 2 + pMax.y * scale;
  const map = (p: Vec2): Vec2 => {
    const q = projectPoint(p);
    return { x: tx + q.x * scale, y: ty - q.y * scale };
  };

  // Pieces: solid for finished, thin dashed for allowance over-length.
  for (const seg of segs) {
    const a = map(seg.from);
    const b = map(seg.to);
    if (seg.finished) {
      doc.setDrawColor(...INK);
      doc.setLineWidth(0.7);
      doc.setLineDashPattern([], 0);
    } else {
      doc.setDrawColor(...GREY);
      doc.setLineWidth(0.3);
      doc.setLineDashPattern([1.5, 1.5], 0);
    }
    doc.line(a.x, a.y, b.x, b.y);
    layout.seg({ x0: a.x, y0: a.y, x1: b.x, y1: b.y });
  }
  doc.setLineDashPattern([], 0);

  // Elbow / bend arcs.
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.7);
  for (const arc of arcs) strokeArc(doc, arc, map, layout);

  // Axis intersections E_i (theoretical points), labelled.
  for (const det of dets) {
    const e = map(det.axisIntersection);
    doc.setDrawColor(...GREY);
    doc.setLineWidth(0.2);
    doc.line(e.x - 2, e.y, e.x + 2, e.y);
    doc.line(e.x, e.y - 2, e.x, e.y + 2);
    layout.seg({ x0: e.x - 2, y0: e.y, x1: e.x + 2, y1: e.y });
    layout.seg({ x0: e.x, y0: e.y - 2, x1: e.x, y1: e.y + 2 });
    layout.label({
      text: S.axisE.replace('{pipe}', String(det.pipeNumber)),
      x: e.x + 3.2,
      y: e.y - 2.4,
      align: 'left',
      fontPt: 9,
      bold: false,
      color: GREY,
      priority: 3,
      escape: [
        norm2({ x: 1, y: -0.5 }),
        norm2({ x: -1, y: -0.5 }),
        norm2({ x: 1, y: 0.6 }),
        norm2({ x: -1, y: 0.6 }),
        { x: 0, y: -1 },
      ],
      anchor: { x: e.x, y: e.y },
    });
  }

  // Joint ticks (axis-based orientation; non-degenerate at g = 0; both
  // real faces + true gap when g > 0). Ids live in the per-pipe legend
  // below: the elbow zone of a dense group is far too compressed to
  // carry six joint ids + three elbow ids legibly at 9 pt.
  drawJointMarkers(doc, joints, map, false, snap, layout);

  /* Per-piece finished/cut dimensions with real model values. Adjacent
   * pipes share the same visual region in a group view, so each label
   * anchor is shifted ALONG its measured run by a modulo-3 fraction
   * (0.25 / 0.55 / 0.85 by pipe position in the group): the run, value
   * and perpendicular offset are unchanged, only the anchor slides
   * parallel to the run so same-name dimensions of neighbouring pipes
   * never stack. The annotation layout resolves any residual overlap. */
  const pending: PendingDimension[] = [];
  for (const dim of dims) {
    const pipeNo = Number(/^P(\d+)-/.exec(dim.ownerId)?.[1] ?? 0);
    const slot = (pipeNumbers.indexOf(pipeNo) + 3) % 3;
    const f = [0.25, 0.55, 0.85][slot];
    const mid = { x: (dim.from.x + dim.to.x) / 2, y: (dim.from.y + dim.to.y) / 2 };
    const perpOff = { x: dim.labelAt.x - mid.x, y: dim.labelAt.y - mid.y };
    const anchored: FabDrawingDimension = {
      ...dim,
      labelAt: {
        x: dim.from.x + (dim.to.x - dim.from.x) * f + perpOff.x,
        y: dim.from.y + (dim.to.y - dim.from.y) * f + perpOff.y,
      },
    };
    pending.push(planDimension(doc, layout, anchored, map, snap, 0));
  }

  /* Per-pipe identification legend: every elbow (catalog) or bend bar,
   * and every joint of the group, unequivocally tied to its pipe. The
   * pup ids are already carried by their finished-length dimension
   * labels, so each cut-list row links to a represented piece. Legend
   * rows are FIXED obstacles for the floating labels above. */
  const legendRows: string[] = [];
  for (const pipeNo of pipeNumbers) {
    const pipe = sol.pipes.find((p) => p.pipeNumber === pipeNo);
    if (!pipe) continue;
    const fitting = pipe.pieces.find((p) => p.kind === 'elbow' || p.kind === 'bent-tube');
    if (!fitting) continue;
    const jointIds = joints
      .filter((j) => j.jointId.startsWith(`J${pipeNo}-`))
      .map((j) => (j.gapMm > 0 ? `${j.jointId} (${S.dimGap} ${snap.formatLength(j.gapMm)})` : j.jointId));
    legendRows.push(jointIds.length > 0 ? `${fitting.id}  ·  ${jointIds.join('  ·  ')}` : fitting.id);
  }
  let legendY = boxY + boxH + 5;
  for (const row of legendRows) {
    layout.fixedText(row, MARGIN + 1, legendY, 9, true, pageW - 2 * MARGIN);
    legendY += 4.6;
  }

  // Resolve, draw the dimension strokes (gapped around the final label
  // positions), leaders and texts, then the legend rows themselves.
  layout.resolve();
  for (const pd of pending) drawResolvedDimension(doc, layout, pd);
  layout.draw();
  legendY = boxY + boxH + 5;
  for (const row of legendRows) {
    doc.setFont(FONT_FAMILY, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(row, MARGIN + 1, legendY);
    legendY += 4.6;
  }
  return legendY + 2;
}

function dimensionLabel(id: string, measureKey: string, valueMm: number, snap: PipeCombFabPdfSnapshot): string {
  const S = snap.strings;
  const v = snap.formatLength(valueMm);
  switch (measureKey) {
    case 'lin': return `${S.dimLin} = ${v}`;
    case 'lout': return `${S.dimLout} = ${v}`;
    case 'di': return `${S.dimDi} = ${v}`;
    case 'df': return `${S.dimDf} = ${v}`;
    case 'staggerA': return `${S.dimStagger} = ${v}`;
    case 'finishedLength': return `${id.replace('dim-', '').replace('-finished-length', '')} ${S.dimFinished} ${v}`;
    case 'cutLength': return `${id.replace('dim-', '').replace('-cut-length', '')} ${S.dimCut} ${v}`;
    case 'straightInlet': return `${S.straightInlet} ${v}`;
    case 'straightOutlet': return `${S.straightOutlet} ${v}`;
    case 'arcDeveloped': return `${S.arcDeveloped} ${v}`;
    default: return v;
  }
}

function drawCutList(
  doc: jsPDF,
  sol: PipeCombFabricationSolution,
  snap: PipeCombFabPdfSnapshot,
  yTop: number,
  pageW: number,
  ensure: (yy: number, needed: number) => number,
): void {
  const S = snap.strings;
  const typeOf = (kind: FabricationPiece['kind']) =>
    kind === 'inlet-pup' ? S.typeInlet : kind === 'outlet-pup' ? S.typeOutlet : S.typeBend;
  const statusOf = (status: string) =>
    status === 'ok' ? S.statusOk : status === 'invalid' ? S.statusInvalid : S.statusPending;
  const pieceById = new Map(sol.pipes.flatMap((p) => p.pieces).map((p) => [p.id, p]));

  const body = sol.cutList.map((entry) => {
    const piece = pieceById.get(entry.pieceId);
    return [
      entry.pieceId,
      '1',
      typeOf(entry.kind),
      piece?.finishedLengthMm !== undefined ? snap.formatLength(piece.finishedLengthMm) : '—',
      piece ? snap.formatLength(piece.fittingAllowanceMm) : '—',
      entry.cutLengthMm !== undefined ? snap.formatLength(entry.cutLengthMm) : '—',
      statusOf(entry.status),
    ];
  });

  /* Section heading (localized) — every section of the document is
   * titled, so the cut list is identifiable on every page it spans. */
  doc.setFont(FONT_FAMILY, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(S.cutList, MARGIN, yTop);

  /* Orphan-header guard: if fewer than ~2 rows + header fit below the
   * start position, start the table on a fresh page instead of leaving a
   * lone header at the bottom (rowPageBreak only protects ROWS). The
   * estimate uses the real 9 pt row metrics (header + 2 data rows). */
  const tableTop = yTop + 6;
  const rowH = (9 * 0.48) + 2 * 1.6; // font height + cell padding
  const availForTable = (doc.internal.pageSize.getHeight()) - tableTop - (MARGIN + 12);
  let startY = tableTop;
  if (availForTable < rowH * 3.2) {
    doc.addPage();
    drawTitleBlock(doc, snap, pageW);
    startY = MARGIN + TITLE_BLOCK_H + 6;
  }
  autoTable(doc, {
    startY,
    head: [[S.colPiece, S.colQty, S.colType, S.colFinished, S.colAllowance, S.colCut, S.colStatus]],
    body,
    theme: 'grid',
    styles: { font: FONT_FAMILY, fontSize: 9, textColor: INK, lineColor: LIGHT, lineWidth: 0.15, cellPadding: 1.6 },
    headStyles: { fontStyle: 'bold', fillColor: [240, 240, 240], textColor: INK },
    rowPageBreak: 'avoid',
    // Pages added by the table keep the title block (top margin reserves
    // the title-block zone) and the footer zone (bottom); repeated header
    // rows come from autotable itself.
    margin: { left: MARGIN, right: MARGIN, top: MARGIN + TITLE_BLOCK_H + 4, bottom: MARGIN + 12 },
    didDrawPage: () => {
      drawTitleBlock(doc, snap, pageW);
    },
  });

  // Accessories (NOT cut pieces) listed separately, with REAL multiline
  // heights and pagination: N=12 accessory lines cannot silently overflow.
  let ay = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? yTop + 20;
  doc.setFont(FONT_FAMILY, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  const titleBlock = measureWrapped(doc, S.accessoriesTitle, pageW - 2 * MARGIN);
  ay = ensure(ay + 8, titleBlock.height + 2);
  doc.setFont(FONT_FAMILY, 'bold');
  doc.setFontSize(10);
  doc.text(titleBlock.lines, MARGIN, ay + 4);
  ay += titleBlock.height + 3;
  doc.setFont(FONT_FAMILY, 'normal');
  doc.setFontSize(9);
  const lines: string[] = [];
  if (sol.elbow.mode === 'catalog-cut') {
    for (const pipe of sol.pipes) {
      lines.push(
        S.accessoryLine
          .replace('{id}', `P${pipe.pipeNumber}-ELBOW`)
          .replace('{nps}', sol.elbow.nps)
          .replace('{family}', snap.elbowRadiusFamily ?? '')
          .replace('{angle}', String(sol.elbow.keptAngleDeg)),
      );
    }
  } else {
    lines.push(S.bendAccessoryLine);
  }
  for (const line of lines) {
    const block = measureWrapped(doc, line, pageW - 2 * MARGIN);
    ay = ensure(ay, block.height + 1.5);
    doc.setFont(FONT_FAMILY, 'normal');
    doc.setFontSize(9);
    doc.text(block.lines, MARGIN, ay + 3.5);
    ay += block.height + 1.5;
  }
}

/** Measured on-paper extent (mm below yTop) of the elbow detail for
 *  pipe 1's construction: every stroked point of the arc, centre/face
 *  lines, tick markers and the wrapped text block on the right. The
 *  section height is MEASURED, never a fixed constant — the pagination
 *  decision uses the same number. */
function elbowDetailExtent(
  doc: jsPDF,
  drawing: PipeCombFabDrawing,
  sol: PipeCombFabricationSolution,
  snap: PipeCombFabPdfSnapshot,
  pageW: number,
): number {
  const det = drawing.elbowDetails.find((d) => d.pipeNumber === 1);
  if (!det) return 8;
  const scale = 44 / det.clrMm;
  let maxDown = 66 + det.clrMm * scale; // arc bottom below the view centre
  maxDown += 2.5; // tick marker overhang
  const S = snap.strings;
  const note = S.nominalModelNote;
  doc.setFont(FONT_FAMILY, 'normal');
  doc.setFontSize(9);
  const noteLines = doc.splitTextToSize(note, pageW - MARGIN - 118 - MARGIN) as string[];
  const noteBottom = 32.5 + ((doc.getLineHeight() / doc.internal.scaleFactor) * noteLines.length);
  maxDown = Math.max(maxDown, noteBottom);
  return maxDown + 4;
}

function drawElbowDetail(
  doc: jsPDF,
  drawing: PipeCombFabDrawing,
  sol: PipeCombFabricationSolution,
  snap: PipeCombFabPdfSnapshot,
  yTop: number,
  pageW: number,
): number {
  const S = snap.strings;
  doc.setFont(FONT_FAMILY, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(S.elbowDetail, MARGIN, yTop + 4);

  // Local view of pipe 1's elbow: true-shape construction (NOT the
  // projected view) so the kept angle and the kept face are readable.
  const det = drawing.elbowDetails.find((d) => d.pipeNumber === 1);
  if (!det) return yTop + 8;
  const cx = MARGIN + 62;
  const cy = yTop + 66;
  const scale = 44 / det.clrMm; // fit CLR ~44 mm on paper
  const toPaper = (p: Vec2): Vec2 => ({ x: cx + (p.x - det.center.x) * scale, y: cy - (p.y - det.center.y) * scale });

  // Arc + faces + centre + axis intersection.
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.7);
  const arc = drawing.arcs.find((a) => a.pieceId === det.pieceId);
  if (arc) {
    const steps = 48;
    let prev: Vec2 | null = null;
    for (let i = 0; i <= steps; i++) {
      const ang = arc.startRad + ((arc.endRad - arc.startRad) * i) / steps;
      const p = toPaper({ x: det.center.x + det.clrMm * Math.cos(ang), y: det.center.y + det.clrMm * Math.sin(ang) });
      if (prev) doc.line(prev.x, prev.y, p.x, p.y);
      prev = p;
    }
  }
  const kf = toPaper(det.keptFacePoint);
  const cf = toPaper(det.cutFacePoint);
  const cc = toPaper(det.center);
  const ee = toPaper(det.axisIntersection);
  doc.setLineWidth(0.3);
  doc.setDrawColor(...GREY);
  doc.line(cc.x, cc.y, kf.x, kf.y);
  doc.line(cc.x, cc.y, cf.x, cf.y);
  doc.line(ee.x, ee.y, kf.x, kf.y);
  doc.line(ee.x, ee.y, cf.x, cf.y);
  // Kept face marker (solid tick) vs cut face (double tick).
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.6);
  doc.line(kf.x - 2, kf.y - 2, kf.x + 2, kf.y + 2);
  doc.line(cf.x - 2, cf.y - 2, cf.x + 2, cf.y + 2);
  doc.line(cf.x - 2, cf.y + 2, cf.x + 2, cf.y - 2);

  doc.setFont(FONT_FAMILY, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  const keptTxt = sol.elbow.mode === 'catalog-cut'
    ? S.keptAngleLine.replace('{angle}', String(sol.elbow.keptAngleDeg))
    : S.bendAngleLine.replace('{angle}', String(sol.elbow.keptAngleDeg));
  doc.text(keptTxt, MARGIN + 118, yTop + 16);
  doc.text(S.takeOutLine.replace('{value}', snap.formatLength(sol.elbow.takeOutMm)), MARGIN + 118, yTop + 21.5);
  doc.text(
    S.elbowSpecLine
      .replace('{nps}', sol.elbow.nps)
      .replace('{od}', snap.formatLength(sol.elbow.odMm))
      .replace('{clr}', snap.formatLength(sol.elbow.clrMm))
      .replace('{source}', sol.elbow.clrSource === 'user-custom' ? S.clrSourceCustom : S.clrSourceCatalog),
    MARGIN + 118,
    yTop + 27,
  );
  doc.setTextColor(...GREY);
  doc.text(S.nominalModelNote, MARGIN + 118, yTop + 32.5, { maxWidth: pageW - MARGIN - 118 - MARGIN });
  /* Return the MEASURED extent (same computation the pagination uses):
   * arc bottom + tick overhang + the wrapped note block, so the next
   * section can never start on top of the drawing. */
  return yTop + elbowDetailExtent(doc, drawing, sol, snap, pageW);
}

function drawMarking(doc: jsPDF, sol: PipeCombFabricationSolution, snap: PipeCombFabPdfSnapshot, yTop: number, pageW: number, ensure: (yy: number, needed: number) => number): number {
  const S = snap.strings;
  doc.setFont(FONT_FAMILY, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(S.markingTitle, MARGIN, yTop);
  let y = yTop + 6;
  const groups: { title: string; marks: typeof S.marks }[] = [
    { title: S.markMaterial, marks: S.marks.filter((m) => m.onMaterial) },
    { title: S.markReference, marks: S.marks.filter((m) => !m.onMaterial) },
  ];
  const valueOf = new Map(sol.elbow.marks.map((m) => [m.id, m.valueMm]));
  for (const group of groups) {
    if (group.marks.length === 0) continue;
    y = ensure(y, 10);
    doc.setFont(FONT_FAMILY, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...GREY);
    doc.text(group.title, MARGIN, y);
    y += 4.6;
    doc.setFont(FONT_FAMILY, 'normal');
    doc.setTextColor(...INK);
    for (const m of group.marks) {
      const v = valueOf.get(m.id);
      const text = S.markLine
        .replace('{label}', m.label)
        .replace('{value}', v !== undefined ? snap.formatLength(v) : '—')
        .replace('{origin}', m.origin)
        .replace('{destination}', m.destination)
        .replace('{method}', m.method);
      const block = measureWrapped(doc, text, pageW - 2 * MARGIN - 2);
      y = ensure(y, block.height + 1);
      doc.text(block.lines, MARGIN + 2, y);
      y += block.height + 1;
    }
    y += 1.5;
  }
  return y + 2;
}

function drawJoints(doc: jsPDF, sol: PipeCombFabricationSolution, snap: PipeCombFabPdfSnapshot, yTop: number, pageW: number, ensure: (yy: number, needed: number) => number): number {
  const S = snap.strings;
  if (sol.joints.length === 0) return yTop;
  doc.setFont(FONT_FAMILY, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(S.jointsTitle, MARGIN, yTop);
  let y = yTop + 6;
  doc.setFont(FONT_FAMILY, 'normal');
  doc.setFontSize(9);
  const face = snap.localizeJointFace ?? ((raw: string) => raw);
  for (const j of sol.joints) {
    const text = S.jointLine
      .replace('{id}', j.id)
      .replace('{faceA}', face(j.faceA))
      .replace('{faceB}', face(j.faceB))
      .replace('{gap}', snap.formatLength(j.gapMm));
    const block = measureWrapped(doc, text, pageW - 2 * MARGIN - 2);
    y = ensure(y, block.height + 1);
    doc.text(block.lines, MARGIN + 2, y);
    y += block.height + 1;
  }
  if (sol.references.fittingAllowanceMm > 0) {
    const note = S.allowanceNote.replace('{value}', snap.formatLength(sol.references.fittingAllowanceMm));
    const block = measureWrapped(doc, note, pageW - 2 * MARGIN - 2);
    y = ensure(y, block.height + 1);
    doc.setTextColor(...GREY);
    doc.text(block.lines, MARGIN + 2, y);
    y += block.height + 1;
  }
  return y + 2;
}

function drawWarnings(doc: jsPDF, sol: PipeCombFabricationSolution, snap: PipeCombFabPdfSnapshot, yTop: number, pageW: number, ensure: (yy: number, needed: number) => number): number {
  const S = snap.strings;
  let y = yTop;
  doc.setFont(FONT_FAMILY, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(S.warningsTitle, MARGIN, y);
  y += 6;
  doc.setFont(FONT_FAMILY, 'normal');
  doc.setFontSize(9);
  if (S.warnings.length === 0) {
    doc.setTextColor(...GREY);
    doc.text('—', MARGIN + 2, y);
    y += 4.6;
  } else {
    doc.setTextColor(...INK);
    for (const w of S.warnings) {
      // ASCII bullet: the standard-14 Helvetica cannot encode "•".
      const block = measureWrapped(doc, `- ${w}`, pageW - 2 * MARGIN - 2);
      y = ensure(y, block.height + 1);
      doc.text(block.lines, MARGIN + 2, y);
      y += block.height + 1;
    }
  }
  const tail = measureWrapped(doc, S.notCertified, pageW - 2 * MARGIN - 2);
  y = ensure(y + 1, tail.height + 2);
  doc.setTextColor(...GREY);
  doc.text(tail.lines, MARGIN + 2, y + 1);
  return y + tail.height + 6;
}
