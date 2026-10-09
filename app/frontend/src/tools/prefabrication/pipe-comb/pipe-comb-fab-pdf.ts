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
  flow((yy) => drawElbowDetail(doc, drawing, sol, snapshot, yy, pageW), 100);
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
  doc.setFont(FONT_FAMILY, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(S.generalView, MARGIN, yTop + 4);

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

  // Reference planes (dashed).
  doc.setDrawColor(...GREY);
  doc.setLineDashPattern([3, 2], 0);
  doc.setLineWidth(0.25);
  for (const ref of drawing.referencePlanes) {
    const half = (drawing.bounds.max.y - drawing.bounds.min.y) * 0.62 + 20;
    const a = map({ x: ref.point.x - ref.direction.x * half, y: ref.point.y - ref.direction.y * half });
    const b = map({ x: ref.point.x + ref.direction.x * half, y: ref.point.y + ref.direction.y * half });
    doc.line(a.x, a.y, b.x, b.y);
    const labelPos = map({ x: ref.point.x + ref.direction.x * (half + 4), y: ref.point.y + ref.direction.y * (half + 4) });
    doc.setFont(FONT_FAMILY, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...GREY);
    doc.text(ref.id === 'REF-ENT' ? S.refEnt : S.refSal, labelPos.x, labelPos.y);
  }
  doc.setLineDashPattern([], 0);

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
  }
  doc.setLineDashPattern([], 0);

  // Elbow / bend arcs (polyline approximation of the model arc).
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.7);
  for (const arc of drawing.arcs) {
    const steps = Math.max(12, Math.ceil(Math.abs(arc.endRad - arc.startRad) / (Math.PI / 72)));
    let prev: Vec2 | null = null;
    for (let i = 0; i <= steps; i++) {
      const ang = arc.startRad + ((arc.endRad - arc.startRad) * i) / steps;
      const p = map({
        x: arc.center.x + arc.radiusMm * Math.cos(ang),
        y: arc.center.y + arc.radiusMm * Math.sin(ang),
      });
      if (prev) doc.line(prev.x, prev.y, p.x, p.y);
      prev = p;
    }
  }

  // Axis intersections E_i (theoretical points).
  doc.setFont(FONT_FAMILY, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GREY);
  for (const det of drawing.elbowDetails) {
    const e = map(det.axisIntersection);
    doc.setDrawColor(...GREY);
    doc.setLineWidth(0.2);
    doc.line(e.x - 2, e.y, e.x + 2, e.y);
    doc.line(e.x, e.y - 2, e.x, e.y + 2);
    if (!overviewIsDense) doc.text(S.axisE.replace('{pipe}', String(det.pipeNumber)), e.x + 2.5, e.y - 1.5);
  }

  // Joint markers: two short ticks when g > 0 (distinct faces), one when 0.
  for (const j of drawing.joints) {
    const a = map(j.pupFace);
    const b = map(j.elbowFace);
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.5);
    const n = { x: -(b.y - a.y), y: b.x - a.x };
    const nl = Math.hypot(n.x, n.y) || 1;
    const off = 1.6;
    doc.line(a.x - (n.x / nl) * off, a.y - (n.y / nl) * off, a.x + (n.x / nl) * off, a.y + (n.y / nl) * off);
    if (j.gapMm > 0) {
      doc.line(b.x - (n.x / nl) * off, b.y - (n.y / nl) * off, b.x + (n.x / nl) * off, b.y + (n.y / nl) * off);
    }
  }

  // Dimensions: thin lines with end ticks + label (real model values).
  doc.setLineWidth(0.2);
  for (const dim of drawing.dimensions) {
    if (overviewIsDense) continue;
    const a = map(dim.from);
    const b = map(dim.to);
    const l = map(dim.labelAt);
    doc.setDrawColor(...GREY);
    // Extension + dimension line through the label anchor offset.
    const dir = { x: b.x - a.x, y: b.y - a.y };
    const len = Math.hypot(dir.x, dir.y) || 1;
    const u = { x: dir.x / len, y: dir.y / len };
    // Project label anchor onto the dimension line direction.
    const tStar = ((l.x - a.x) * u.x + (l.y - a.y) * u.y);
    const proj = { x: a.x + u.x * tStar, y: a.y + u.y * tStar };
    const offVec = { x: l.x - proj.x, y: l.y - proj.y };
    const a2 = { x: a.x + offVec.x, y: a.y + offVec.y };
    const b2 = { x: b.x + offVec.x, y: b.y + offVec.y };
    doc.line(a.x, a.y, a2.x, a2.y);
    doc.line(b.x, b.y, b2.x, b2.y);
    doc.line(a2.x, a2.y, b2.x, b2.y);
    // End ticks.
    const tick = 1.4;
    const tn = { x: -u.y, y: u.x };
    doc.line(a2.x - tn.x * tick, a2.y - tn.y * tick, a2.x + tn.x * tick, a2.y + tn.y * tick);
    doc.line(b2.x - tn.x * tick, b2.y - tn.y * tick, b2.x + tn.x * tick, b2.y + tn.y * tick);
    doc.setFont(FONT_FAMILY, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(dimensionLabel(dim.id, dim.measureKey, dim.valueMm, snap), l.x, l.y, { align: 'center' });
  }

  // Piece identifiers near segment midpoints.
  doc.setFont(FONT_FAMILY, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  for (const seg of drawing.segments) {
    if (!seg.finished) continue;
    if (overviewIsDense) continue;
    const mid = map({ x: (seg.from.x + seg.to.x) / 2, y: (seg.from.y + seg.to.y) / 2 });
    doc.text(seg.pieceId, mid.x, mid.y - 1.6, { align: 'center' });
  }
  for (const arc of drawing.arcs) {
    const midAng = (arc.startRad + arc.endRad) / 2;
    const p = map({
      x: arc.center.x + arc.radiusMm * Math.cos(midAng),
      y: arc.center.y + arc.radiusMm * Math.sin(midAng),
    });
    if (!overviewIsDense) doc.text(arc.pieceId, p.x, p.y - 1.6, { align: 'center' });
  }

  // Assembly data strip under the view.
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
  doc.text([diTxt, dfTxt, angleTxt, staggerTxt, linTxt, loutTxt].join('    ·    '), MARGIN, dataY);
  return dataY + 2;
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

  autoTable(doc, {
    startY: yTop + 2,
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
  return yTop + 96;
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
