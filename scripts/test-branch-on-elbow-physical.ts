/* ───────────────────────────────────────────────────────────────────────────
   PB-BRANCH-INJERTO-EXPANSION-001 U4 — physical fabrication outputs for the
   tubo→codo family: 1:1 branch cut template + elbow marking guide.

   Run:  node --experimental-strip-types scripts/test-branch-on-elbow-physical.ts

   Independent of the U1 suite: it never recomputes elbow geometry. It takes
   BranchOnElbowResult from the frozen kernel and verifies that the PHYSICAL
   artifacts reproduce those millimetres exactly (A–L of the U4 contract):
     A circumference   B station spacing   C plotted mm = U1 values
     D 100 mm bar      E MediaBox          F tiling coverage   G overlap
     H registration    I closure           J clipping          K no scale-to-fit
     L deterministic bytes
   plus the torus non-developability proof that motivates the marking guide.
   ─────────────────────────────────────────────────────────────────────────── */

import { readFileSync } from 'node:fs';
import { computeBranchOnElbow } from '../app/frontend/src/tools/branch/branchOnElbowGeometry.ts';
import type { BranchOnElbowInput, BranchOnElbowResult } from '../app/frontend/src/tools/branch/branchOnElbowGeometry.ts';
import {
  buildBranchOnElbowCutTemplate, elbowTemplatePoint,
  ELBOW_TEMPLATE_OVERLAP_MM, ELBOW_TEMPLATE_PAD_MM, ELBOW_TEMPLATE_CALIBRATION_MM,
} from '../app/frontend/src/tools/branch/branchOnElbowTemplateSvg.ts';
import type { BranchOnElbowTemplateMeta } from '../app/frontend/src/tools/branch/branchOnElbowTemplateSvg.ts';
import {
  buildBranchOnElbowMarkingGuide, ringPositionMm, MARKING_GUIDE_CALIBRATION_MM,
} from '../app/frontend/src/tools/branch/branchOnElbowMarkingGuideSvg.ts';
import type { BranchOnElbowMarkingGuideMeta } from '../app/frontend/src/tools/branch/branchOnElbowMarkingGuideSvg.ts';
import { svgPagesToPdf } from '../app/frontend/src/tools/branch/svgMmToPdf.ts';
import {
  buildBranchOnElbowPdfLabels, pdfSafeLabel, pdfLabelEncodable, PDF_ORIGIN_LABEL,
} from '../app/frontend/src/tools/branch/branchOnElbowPdfLabels.ts';
import { PDF_PAGE_FORMATS, getPdfPageFormat, pdfFormatUsableWidthMm } from '../app/frontend/src/tools/branch/pdfPageFormat.ts';
import type { PdfPageFormatId } from '../app/frontend/src/tools/branch/pdfPageFormat.ts';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) pass++;
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  — ${detail}` : ''}`); }
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const MM2PT = 72 / 25.4;

/* ── Reference case (U4 §13) and large tiling case (U4 §14) ── */
const REF = {
  elbowCentrelineRadiusMm: 228.6, elbowOuterDiameterMm: 168.3,
  branchInnerDiameterMm: 77.92, branchOuterDiameterMm: 88.9,
  axisHeightMm: 150, referenceLengthMm: 200, divisions: 24,
} as const;
const DATUMS: { id: string; datum: BranchOnElbowInput['datum'] }[] = [
  { id: 'EJE', datum: { type: 'EJE' } },
  { id: 'BOP', datum: { type: 'BOP' } },
  { id: 'TOP', datum: { type: 'TOP' } },
  { id: 'FE+20', datum: { type: 'FE', fe: 20 } },
  { id: 'FE-20', datum: { type: 'FE', fe: -20 } },
];
/* 8" Sch 40 branch on a 24" long-radius elbow (R = 1.5 D), TOP datum. */
const BIG: BranchOnElbowInput = {
  elbowCentrelineRadiusMm: 914.4, elbowOuterDiameterMm: 609.6,
  branchInnerDiameterMm: 202.72, branchOuterDiameterMm: 219.1,
  axisHeightMm: 600, referenceLengthMm: 400, divisions: 24, datum: { type: 'TOP' },
};

const cutMeta = (datumLabel: string): BranchOnElbowTemplateMeta => ({
  titleLabel: 'CUT TEMPLATE 1:1 - BRANCH TUBE (tube -> elbow)', familyLabel: 'TUBO-CODO', datumLabel,
  branchLabel: '3" Sch 40 · OD 88.9 mm · ID 77.92 mm', elbowLabel: '6" · D 168.3 mm · R 228.6 mm · L 200 mm · a 150 mm',
  conventionLabel: 'PIPINGBOX SET-ON · cut reference = branch OD', seamLabel: 'Seam', pageLabel: 'Page',
  overlapLabel: 'Overlap', baselineLabel: 'Baseline from square end', injertoLabel: 'injerto (mm)',
  wrapNoteLabel: 'Wrap around the branch OD; align the seam.', calibrationNote: 'Verify the 100 mm calibration bar before cutting.',
  printAtActualSize: 'PRINT AT 100% / ACTUAL SIZE', generatedLabel: 'PIPINGBOX',
});
const guideMeta = (datumLabel: string): BranchOnElbowMarkingGuideMeta => ({
  titleLabel: 'ELBOW HOLE MARKING GUIDE (picaje)', familyLabel: 'TUBO-CODO', datumLabel,
  branchLabel: '3" Sch 40', elbowLabel: '6" LR', conventionLabel: 'PIPINGBOX SET-ON · hole reference = branch ID',
  guideNote: 'MARKING GUIDE - not a 1:1 hole template. Only the ring strip is 1:1.', stripTitle: 'RING STRIP 1:1',
  bendPlaneLabel: "X'=0 bend plane", omegaLabel: 'Omega', towardTopLabel: '->TOP', towardBopLabel: '->BOP',
  endALabel: 'end A', endBLabel: 'end B', colStation: 'P', colTheta: 'theta', colRing: 'ring mm', colX: 'X mm',
  colY: 'Y mm', colDir: 'dir', colInjerto: 'inj.', closureLabel: '360', steps: ['one', 'two', 'three'],
  schematicTitle: 'SCHEMATIC', notToScale: 'NOT TO SCALE', sectionLabel: 'Ring section', elevationLabel: 'Elevation',
  cotaXLabel: "Cota X'", cotaYLabel: "Cota Y'", pageLabel: 'Page', overlapLabel: 'Overlap',
  calibrationNote: 'Verify the 100 mm calibration bar.', printAtActualSize: 'PRINT AT 100% / ACTUAL SIZE', generatedLabel: 'PIPINGBOX',
});

/* ── Minimal SVG/PDF parsing helpers (no DOM) ── */
function elements(svg: string, tag: string, attrFilter?: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  const re = new RegExp(`<${tag}\\b([^>]*)>`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg)) !== null) {
    if (attrFilter && !m[1].includes(attrFilter)) continue;
    const attrs: Record<string, string> = {};
    const ar = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)="([^"]*)"/g;
    let a: RegExpExecArray | null;
    while ((a = ar.exec(m[1])) !== null) attrs[a[1]] = a[2];
    out.push(attrs);
  }
  return out;
}
function pdfMediaBoxes(bytes: Uint8Array): [number, number, number, number][] {
  const s = Buffer.from(bytes).toString('latin1');
  const boxes: [number, number, number, number][] = [];
  const re = /\/MediaBox \[([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) boxes.push([+m[1], +m[2], +m[3], +m[4]]);
  return boxes;
}
/** Horizontal stroked segments (x1,x2,y in pt) found in the PDF content streams. */
function pdfHorizontalSegments(bytes: Uint8Array): { x1: number; x2: number; y: number }[] {
  const s = Buffer.from(bytes).toString('latin1');
  const out: { x1: number; x2: number; y: number }[] = [];
  const re = /(-?[\d.]+) (-?[\d.]+) m (-?[\d.]+) (-?[\d.]+) l S/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (Math.abs(+m[2] - +m[4]) < 1e-6) out.push({ x1: +m[1], x2: +m[3], y: +m[2] });
  }
  return out;
}
const pdfPages = (bytes: Uint8Array) => (Buffer.from(bytes).toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
const pdfCount = (bytes: Uint8Array) => Number(/\/Count (\d+)/.exec(Buffer.from(bytes).toString('latin1'))?.[1] ?? -1);

function toPdf(tiles: { svg: string; widthMm: number; heightMm: number }[]): Uint8Array {
  return svgPagesToPdf(tiles.map(t => ({ svg: t.svg, widthMm: t.widthMm, heightMm: t.heightMm })));
}

/* ═══ 0. Kernel reference values (frozen inputs to the physical layer) ═══ */
const refResults = new Map<string, BranchOnElbowResult>();
for (const { id, datum } of DATUMS) {
  const r = computeBranchOnElbow({ ...REF, datum });
  refResults.set(id, r);
  check(`${id}: kernel valid`, r.valid, r.errors.map(e => e.code).join(','));
}
{
  const r = refResults.get('EJE')!;
  check('A. circumference = π·88.90 = 279.288 mm', near(r.developedCircumference, Math.PI * 88.9, 1e-9) && near(r.developedCircumference, 279.288, 5e-4), String(r.developedCircumference));
  check('B. station spacing = 279.288/24 = 11.637 mm', near(r.stationSpacing, Math.PI * 88.9 / 24, 1e-9) && near(r.stationSpacing, 11.637, 5e-4), String(r.stationSpacing));
  check('stations = 24 physical + closure', r.stations.length === 25);
}

/* ═══ 1. Feasibility: the elbow surface is NOT developable (motivates the guide) ═══ */
{
  /* Gaussian curvature of the torus at Ω: K = cosψ0 / (ρ · rMer0) > 0 on the extrados. */
  const rho = REF.elbowOuterDiameterMm / 2;
  for (const { id } of DATUMS) {
    const r = refResults.get(id)!;
    const psi0 = Math.asin(r.datumOffsetMm / rho);
    const K = Math.cos(psi0) / (rho * (REF.elbowCentrelineRadiusMm + rho * Math.cos(psi0)));
    check(`${id}: Gaussian curvature at Omega > 0 (no isometric flat development)`, K > 1e-6, K.toExponential(3));
  }
  /* Cartesian plot of (picajeX, picajeY) is NOT length-preserving: compare paper diameters with true 3-D chords. */
  const r = refResults.get('TOP')!;
  const holeR = REF.branchInnerDiameterMm / 2;
  const p3 = (i: number): [number, number, number] => {
    const th = i * 2 * Math.PI / 24;
    const y = REF.axisHeightMm + holeR * Math.cos(th);
    const z = r.datumOffsetMm + holeR * Math.sin(th);
    const psi = Math.asin(z / rho);
    const rm = REF.elbowCentrelineRadiusMm + rho * Math.cos(psi);
    return [Math.sqrt(rm * rm - y * y), y, z];
  };
  const dist3 = (a: [number, number, number], b: [number, number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const paper = (i: number, j: number) => Math.hypot(r.stations[i].picajeX - r.stations[j].picajeX, r.stations[i].picajeY - r.stations[j].picajeY);
  const err = Math.abs(paper(6, 18) - dist3(p3(6), p3(18)));
  check('TOP: flat plot of picaje X/Y distorts the P7-P19 chord by > 1 mm (must not be sold as 1:1)', err > 1.0, `${err.toFixed(3)} mm`);
  /* The ring, by contrast, is a planar circle: ring positions are exact arc lengths ρψ (1-D, developable). */
  for (const i of [0, 6, 12, 18]) {
    const th = i * 2 * Math.PI / 24;
    const z = r.datumOffsetMm + holeR * Math.sin(th);
    check(`TOP P${i + 1}: ring position = ρ·ψ exactly`, near(ringPositionMm(r, i), rho * Math.asin(z / rho), 1e-9));
  }
}

/* ═══ 2. Cut template — physical coordinates equal U1 for every datum and format ═══ */
for (const { id } of DATUMS) {
  const r = refResults.get(id)!;
  for (const f of PDF_PAGE_FORMATS) {
    const tpl = buildBranchOnElbowCutTemplate(r, { format: f.id, meta: cutMeta(id) });
    check(`${id} ${f.id}: template built`, tpl !== null);
    if (!tpl) continue;
    check(`${id} ${f.id}: page size = format`, tpl.tiles.every(t => t.widthMm === f.widthMm && t.heightMm === f.heightMm));
    check(`${id} ${f.id}: svg declares physical mm, no scale-to-fit`, tpl.tiles.every(t =>
      t.svg.includes(`width="${f.widthMm}mm" height="${f.heightMm}mm" viewBox="0 0 ${f.widthMm} ${f.heightMm}"`)
      && !t.svg.includes('preserveAspectRatio') && !t.svg.includes('transform="scale')));
    check(`${id} ${f.id}: circumference = kernel`, tpl.circumferenceMm === r.developedCircumference);
    check(`${id} ${f.id}: baseline = min injerto`, near(tpl.baselineFromEndMm, Math.min(...r.stations.map(s => s.cutOrdinate)), 1e-12));

    /* C. every plotted station marker carries the exact U1 mm and sits at the exact affine position */
    const pts = tpl.tiles.flatMap(t => elements(t.svg, 'circle', 'data-station-point').map(a => ({ tile: t, a })));
    let posOk = true;
    let mmOk = true;
    const seen = new Set<number>();
    for (const { tile, a } of pts) {
      const i = Number(a['data-station-point']);
      seen.add(i);
      const [arc, ord] = elbowTemplatePoint(r, i);
      if (!near(Number(a['data-arc-mm']), arc, 5e-4) || !near(Number(a['data-injerto-mm']), ord, 5e-4)) mmOk = false;
      const expX = arc + ELBOW_TEMPLATE_PAD_MM + f.safeMarginMm - (tile.originX + ELBOW_TEMPLATE_PAD_MM);
      const expY = (f.heightMm - 60) - ((ord - tpl.baselineFromEndMm) - tile.originY);
      if (!near(Number(a.cx), expX, 1e-3) || !near(Number(a.cy), expY, 1e-3)) posOk = false;
    }
    check(`${id} ${f.id}: C. marker mm = U1 (${pts.length} markers)`, mmOk && pts.length > 0);
    check(`${id} ${f.id}: C. marker position = 1 mm per mm (no scaling)`, posOk);
    check(`${id} ${f.id}: F. every station appears on at least one page`, seen.size === r.stations.length, `${seen.size}/${r.stations.length}`);

    /* I. closure station repeats P1 and is labelled as such, not as station 25 */
    const last = r.stations[r.stations.length - 1];
    check(`${id} ${f.id}: I. closure ordinate = P1 ordinate`, near(last.cutOrdinate, r.stations[0].cutOrdinate, 1e-9));
    check(`${id} ${f.id}: I. closure labelled ≡1 and no "25"`, tpl.tiles.some(t => t.svg.includes('>≡1<')) && !tpl.tiles.some(t => /<text[^>]*>25<\/text>/.test(t.svg)));

    /* D. calibration bar on every page: exactly 100 mm in SVG mm */
    check(`${id} ${f.id}: D. 100 mm bar on every page (svg)`, tpl.tiles.every(t => {
      const bars = elements(t.svg, 'line', 'data-calibration-mm');
      return bars.length === 1 && near(Number(bars[0].x2) - Number(bars[0].x1), ELBOW_TEMPLATE_CALIBRATION_MM, 1e-9) && bars[0].y1 === bars[0].y2;
    }));
    check(`${id} ${f.id}: PRINT AT 100% on every page`, tpl.tiles.every(t => t.svg.includes('PRINT AT 100% / ACTUAL SIZE')));
    check(`${id} ${f.id}: SET-ON OD convention on every page`, tpl.tiles.every(t => t.svg.includes('cut reference = branch OD')));

    /* J. no geometry outside the usable window */
    const M = f.safeMarginMm;
    const xR = M + pdfFormatUsableWidthMm(f);
    let inside = true;
    for (const t of tpl.tiles) {
      for (const l of elements(t.svg, 'line', 'data-seg')) {
        for (const k of ['x1', 'x2']) if (Number(l[k]) < M - 1e-6 || Number(l[k]) > xR + 1e-6) inside = false;
        for (const k of ['y1', 'y2']) if (Number(l[k]) < 48 - 1e-6 || Number(l[k]) > f.heightMm - 60 + 1e-6) inside = false;
      }
      for (const p of elements(t.svg, 'polyline', 'data-cut-curve')) {
        for (const pair of p.points.trim().split(/\s+/)) {
          const [x, y] = pair.split(',').map(Number);
          if (x < M - 1e-6 || x > xR + 1e-6 || y < 48 - 1e-6 || y > f.heightMm - 60 + 1e-6) inside = false;
        }
      }
    }
    check(`${id} ${f.id}: J. curve clipped inside the printable window`, inside);
  }
}

/* ═══ 3. Cut template — E. MediaBox, D. calibration in PDF points, L. determinism ═══ */
for (const f of PDF_PAGE_FORMATS) {
  const r = refResults.get('EJE')!;
  const tpl = buildBranchOnElbowCutTemplate(r, { format: f.id, meta: cutMeta('EJE') })!;
  const pdf = toPdf(tpl.tiles);
  const pdf2 = toPdf(buildBranchOnElbowCutTemplate(r, { format: f.id, meta: cutMeta('EJE') })!.tiles);
  const boxes = pdfMediaBoxes(pdf);
  check(`pdf cut ${f.id}: one MediaBox per page`, boxes.length === tpl.tiles.length && pdfPages(pdf) === tpl.tiles.length && pdfCount(pdf) === tpl.tiles.length);
  check(`pdf cut ${f.id}: E. MediaBox = ${f.widthMm}×${f.heightMm} mm in points`, boxes.every(b =>
    b[0] === 0 && b[1] === 0 && near(b[2], f.widthMm * MM2PT, 0.01) && near(b[3], f.heightMm * MM2PT, 0.01)), JSON.stringify(boxes[0]));
  if (f.id === 'A4') check('pdf cut A4: MediaBox ≈ 841.89 × 595.276 pt', near(boxes[0][2], 841.89, 0.01) && near(boxes[0][3], 595.276, 0.01));
  const head = Buffer.from(pdf.subarray(0, 8)).toString('latin1');
  const tail = Buffer.from(pdf.subarray(pdf.length - 64)).toString('latin1');
  check(`pdf cut ${f.id}: header/xref/EOF`, head.startsWith('%PDF-1.') && tail.includes('startxref') && tail.trimEnd().endsWith('%%EOF'));
  const segs = pdfHorizontalSegments(pdf);
  const bars = segs.filter(s => near(Math.abs(s.x2 - s.x1), ELBOW_TEMPLATE_CALIBRATION_MM * MM2PT, 1e-3));
  check(`pdf cut ${f.id}: D. 100 mm bar = ${(100 * MM2PT).toFixed(3)} pt in content stream`, bars.length >= tpl.tiles.length, `${bars.length} bars / ${tpl.tiles.length} pages`);
  check(`pdf cut ${f.id}: L. byte-deterministic`, Buffer.compare(Buffer.from(pdf), Buffer.from(pdf2)) === 0);
  check(`pdf cut ${f.id}: K. no scale operator in content`, !/\b0\.\d+ 0 0 0\.\d+ 0 0 cm\b/.test(Buffer.from(pdf).toString('latin1')));
}

/* ═══ 4. Large case — X+Y tiling, coverage, overlap, registration ═══ */
{
  const big = computeBranchOnElbow(BIG);
  check('big: kernel valid (8" on 24" LR elbow, TOP)', big.valid, big.errors.map(e => e.code).join(','));
  check('big: circumference = π·219.1', near(big.developedCircumference, Math.PI * 219.1, 1e-9));
  const counts: number[] = [];
  for (const f of PDF_PAGE_FORMATS) {
    const tpl = buildBranchOnElbowCutTemplate(big, { format: f.id, meta: cutMeta('TOP') })!;
    counts.push(tpl.tiles.length);
    const usableW = pdfFormatUsableWidthMm(f);
    const usableH = f.heightMm - 60 - 48;
    const stepX = usableW - tpl.overlapMm;
    const stepY = usableH - tpl.overlapMm;
    const contentW = big.developedCircumference + 2 * ELBOW_TEMPLATE_PAD_MM;
    const contentH = tpl.ordinateRangeMm + 2 * ELBOW_TEMPLATE_PAD_MM;
    /* F. coverage: union of usable windows covers the content in both axes, without gaps */
    check(`big ${f.id}: F. X coverage (${tpl.pagesX} cols)`, (tpl.pagesX - 1) * stepX + usableW >= contentW - 1e-9 && (tpl.pagesX === 1 || (tpl.pagesX - 2) * stepX + usableW < contentW));
    check(`big ${f.id}: F. Y coverage (${tpl.pagesY} rows)`, (tpl.pagesY - 1) * stepY + usableH >= contentH - 1e-9 && (tpl.pagesY === 1 || (tpl.pagesY - 2) * stepY + usableH < contentH));
    check(`big ${f.id}: page count = pagesX·pagesY`, tpl.tiles.length === tpl.pagesX * tpl.pagesY && tpl.tiles.every(t => t.pageCount === tpl.tiles.length));
    /* G. overlap: consecutive tiles share exactly 15 mm of content */
    check(`big ${f.id}: G. overlap = ${ELBOW_TEMPLATE_OVERLAP_MM} mm (H-001 value)`, tpl.overlapMm === ELBOW_TEMPLATE_OVERLAP_MM
      && tpl.tiles.every(t => t.pageCol === 0 || near(t.originX - tpl.tiles.find(u => u.pageRow === t.pageRow && u.pageCol === t.pageCol - 1)!.originX, stepX, 1e-9))
      && tpl.tiles.every(t => t.pageRow === 0 || near(t.originY - tpl.tiles.find(u => u.pageCol === t.pageCol && u.pageRow === t.pageRow - 1)!.originY, stepY, 1e-9)));
    /* H. registration marks at the overlap centres, on the correct edges only */
    let regOk = true;
    for (const t of tpl.tiles) {
      const marks = elements(t.svg, 'circle', 'data-registration');
      const has = (cx: number, cy: number) => marks.some(m => near(Number(m.cx), cx, 1e-6) && near(Number(m.cy), cy, 1e-6));
      const M = f.safeMarginMm;
      const expected = [
        [t.pageCol < tpl.pagesX - 1, M + usableW - tpl.overlapMm / 2, 47.5],
        [t.pageCol > 0, M + tpl.overlapMm / 2, 47.5],
        [t.pageRow < tpl.pagesY - 1, 14, 48 + tpl.overlapMm / 2],
        [t.pageRow > 0, 14, f.heightMm - 60 - tpl.overlapMm / 2],
      ] as [boolean, number, number][];
      for (const [should, cx, cy] of expected) if (has(cx, cy) !== should) regOk = false;
      if (marks.length !== expected.filter(e => e[0]).length) regOk = false;
    }
    check(`big ${f.id}: H. registration marks exactly at overlap centres`, regOk);
    check(`big ${f.id}: page x/y labels`, tpl.tiles.every(t => t.svg.includes(`X ${t.pageCol + 1}/${tpl.pagesX} · Y ${t.pageRow + 1}/${tpl.pagesY}`)));
    /* Geometry unchanged by paper */
    check(`big ${f.id}: geometry values unchanged by paper`, tpl.circumferenceMm === big.developedCircumference && near(tpl.ordinateRangeMm, Math.max(...big.stations.map(s => s.cutOrdinate)) - Math.min(...big.stations.map(s => s.cutOrdinate)), 1e-12));
    /* Every station point is drawn on at least one page, and every drawn instance has the same mm */
    const seen = new Map<number, string>();
    let consistent = true;
    for (const t of tpl.tiles) for (const a of elements(t.svg, 'circle', 'data-station-point')) {
      const key = `${a['data-arc-mm']}|${a['data-injerto-mm']}`;
      const i = Number(a['data-station-point']);
      if (seen.has(i) && seen.get(i) !== key) consistent = false;
      seen.set(i, key);
    }
    check(`big ${f.id}: all ${big.stations.length} stations plotted, consistent across pages`, seen.size === big.stations.length && consistent);
    /* PDF page count matches */
    const pdf = toPdf(tpl.tiles);
    check(`big ${f.id}: pdf pages = ${tpl.tiles.length}`, pdfMediaBoxes(pdf).length === tpl.tiles.length && pdfCount(pdf) === tpl.tiles.length);
  }
  check('big A4: forces tiling (pagesX > 1 and pagesY > 1)', (() => { const t = buildBranchOnElbowCutTemplate(big, { format: 'A4', meta: cutMeta('TOP') })!; return t.pagesX > 1 && t.pagesY > 1; })());
  check('big: page counts non-increasing A4→A0', counts.every((c, i) => i === 0 || c <= counts[i - 1]), counts.join(','));
  check('big: A4 pages > A0 pages', counts[0] > counts[4], counts.join(','));
  console.log(`  big case A4→A0 page counts: ${counts.join(', ')}`);
}

/* ═══ 5. Reference TOP on A4 tiles in Y (range 117.7 > 102 usable) and reassembles ═══ */
{
  const r = refResults.get('TOP')!;
  const tpl = buildBranchOnElbowCutTemplate(r, { format: 'A4', meta: cutMeta('TOP') })!;
  check('TOP A4: pagesY = 2, pagesX = 1', tpl.pagesX === 1 && tpl.pagesY === 2, `${tpl.pagesX}x${tpl.pagesY}`);
  /* A station visible on both rows must map to the same content ordinate (reconstruction across the seam). */
  const byRow = tpl.tiles.map(t => new Map(elements(t.svg, 'circle', 'data-station-point').map(a => [Number(a['data-station-point']), a])));
  const shared = [...byRow[0].keys()].filter(i => byRow[1].has(i));
  check('TOP A4: overlap band contains shared stations', shared.length > 0, String(shared.length));
  check('TOP A4: shared stations reconstruct to identical mm across pages', shared.every(i => {
    const a = byRow[0].get(i)!;
    const b = byRow[1].get(i)!;
    const ordA = tpl.baselineFromEndMm + tpl.tiles[0].originY + ((210 - 60) - Number(a.cy));
    const ordB = tpl.baselineFromEndMm + tpl.tiles[1].originY + ((210 - 60) - Number(b.cy));
    return near(ordA, ordB, 1e-3) && a['data-injerto-mm'] === b['data-injerto-mm'];
  }));
}

/* ═══ 6. Invalid geometry → no artifact (never a fabricated sheet) ═══ */
{
  const bad = computeBranchOnElbow({ ...REF, datum: { type: 'FE', fe: 500 } });
  check('invalid kernel result → cut template null', !bad.valid && buildBranchOnElbowCutTemplate(bad, { meta: cutMeta('FE') }) === null);
  check('invalid kernel result → marking guide null', buildBranchOnElbowMarkingGuide(bad, { elbowOuterDiameterMm: 168.3, meta: guideMeta('FE') }) === null);
  check('default format = A4 (bytes)', (() => {
    const r = refResults.get('EJE')!;
    return buildBranchOnElbowCutTemplate(r, { meta: cutMeta('EJE') })!.tiles[0].svg === buildBranchOnElbowCutTemplate(r, { format: 'A4', meta: cutMeta('EJE') })!.tiles[0].svg;
  })());
}

/* ═══ 7. Marking guide — strip is exact, table = U1, labelled honestly ═══ */
for (const { id } of DATUMS) {
  const r = refResults.get(id)!;
  const g = buildBranchOnElbowMarkingGuide(r, { format: 'A4', elbowOuterDiameterMm: REF.elbowOuterDiameterMm, meta: guideMeta(id) });
  check(`guide ${id}: built`, g !== null);
  if (!g) continue;
  /* ring positions are pure arithmetic on U1: Cota X' − picajeX */
  check(`guide ${id}: ring position = cotaX − picajeX for every station`, r.stations.every((s, i) => near(g.ringPositionsMm[i], r.cotaX - s.picajeX, 1e-12)));
  check(`guide ${id}: strip spans bend plane, Omega and all stations`, g.stripMinMm <= Math.min(0, r.cotaX) && g.stripMaxMm >= Math.max(0, r.cotaX)
    && g.ringPositionsMm.every(p => p >= g.stripMinMm - 1e-12 && p <= g.stripMaxMm + 1e-12));
  const strip = g.tiles.filter(t => t.kind === 'strip');
  check(`guide ${id}: strip is 1:1 (1 mm per mm) for every station tick`, strip.every(t => elements(t.svg, 'line', 'data-strip-station').every(a => {
    const i = Number(a['data-strip-station']);
    const expX = (g.ringPositionsMm[i] - g.stripMinMm) + 4 + 5 - t.stripCol * (pdfFormatUsableWidthMm(getPdfPageFormat('A4')) - g.overlapMm);
    return near(Number(a.x1), expX, 1e-3) && a.x1 === a.x2 && near(Number(a['data-ring-mm']), g.ringPositionsMm[i], 5e-4) && near(Number(a['data-picaje-x-mm']), r.stations[i].picajeX, 5e-4);
  })));
  check(`guide ${id}: all ${r.stations.length - 1} physical stations ticked on the strip`, new Set(strip.flatMap(t => elements(t.svg, 'line', 'data-strip-station').map(a => a['data-strip-station']))).size === r.stations.length - 1);
  check(`guide ${id}: Omega tick at Cota X'`, strip.some(t => elements(t.svg, 'line', 'data-strip-omega').some(a => near(Number(a['data-cota-x-mm']), r.cotaX, 5e-4))));
  check(`guide ${id}: bend-plane tick at X' = 0`, strip.some(t => elements(t.svg, 'line', 'data-strip-reference').length === 1));
  /* table cells = U1 values (ring, X, Y, injerto) for every station incl. closure */
  let tableOk = true;
  const cells = g.tiles.flatMap(t => elements(t.svg, 'text', 'data-table-station'));
  for (const s of r.stations) {
    const i = s.index;
    const cell = (c: number) => cells.find(a => Number(a['data-table-station']) === i && Number(a['data-col']) === c);
    const get = (c: number) => {
      const el = cell(c);
      if (!el) return Number.NaN;
      const m = new RegExp(`data-table-station="${i}" data-col="${c}"[^>]*>([^<]*)<`).exec(g.tiles.map(t => t.svg).join(''));
      return Number(m?.[1]);
    };
    if (!near(get(2), r.cotaX - s.picajeX, 5e-4) || !near(get(3), s.picajeX, 5e-4) || !near(get(5), s.picajeY, 5e-4) || !near(get(7), s.cutOrdinate, 5e-4)) tableOk = false;
  }
  check(`guide ${id}: table = U1 for ${r.stations.length} rows`, tableOk);
  check(`guide ${id}: honest labelling (guide note + strip 1:1 flag, no hole template claim)`, g.tiles.every(t => t.svg.includes('not a 1:1 hole template'))
    && strip.every(t => t.svg.includes('data-strip-1to1="true"')) && !g.tiles.some(t => t.svg.includes('data-physical-template="branch-on-elbow-cut"')));
  check(`guide ${id}: 100 mm bar on every page`, g.tiles.every(t => {
    const bars = elements(t.svg, 'line', 'data-calibration-mm');
    return bars.length === 1 && near(Number(bars[0].x2) - Number(bars[0].x1), MARKING_GUIDE_CALIBRATION_MM, 1e-9);
  }));
  check(`guide ${id}: hole reference = branch ID stated`, g.tiles.every(t => t.svg.includes('hole reference = branch ID')));
  const pdf = toPdf(g.tiles);
  const pdf2 = toPdf(buildBranchOnElbowMarkingGuide(r, { format: 'A4', elbowOuterDiameterMm: REF.elbowOuterDiameterMm, meta: guideMeta(id) })!.tiles);
  check(`guide ${id}: pdf pages + A4 MediaBox + deterministic`, pdfMediaBoxes(pdf).length === g.tiles.length
    && pdfMediaBoxes(pdf).every(b => near(b[2], 297 * MM2PT, 0.01) && near(b[3], 210 * MM2PT, 0.01))
    && Buffer.compare(Buffer.from(pdf), Buffer.from(pdf2)) === 0);
  check(`guide ${id}: D. 100 mm bar in PDF points on every page`, pdfHorizontalSegments(pdf).filter(s => near(Math.abs(s.x2 - s.x1), 100 * MM2PT, 1e-3)).length >= g.tiles.length);
}
/* Sign semantics: TOP strip lies entirely on the +X' side of the bend plane, BOP on the −X' side; mirrored. */
{
  const top = buildBranchOnElbowMarkingGuide(refResults.get('TOP')!, { elbowOuterDiameterMm: 168.3, meta: guideMeta('TOP') })!;
  const bop = buildBranchOnElbowMarkingGuide(refResults.get('BOP')!, { elbowOuterDiameterMm: 168.3, meta: guideMeta('BOP') })!;
  check('TOP strip: all ring positions ≥ 0 (toward TOP)', top.ringPositionsMm.every(p => p >= -1e-9));
  check('BOP strip: all ring positions ≤ 0 (toward BOP)', bop.ringPositionsMm.every(p => p <= 1e-9));
  check('TOP/BOP strips are mirror images (as sets)', near(top.stripLengthMm, bop.stripLengthMm, 1e-9)
    && top.ringPositionsMm.slice().sort((a, b) => a - b).every((p, k) => near(p, -bop.ringPositionsMm.slice().sort((a, b) => b - a)[k], 1e-9)));
  const eje = buildBranchOnElbowMarkingGuide(refResults.get('EJE')!, { elbowOuterDiameterMm: 168.3, meta: guideMeta('EJE') })!;
  check('EJE strip length = 2·ρ·asin(r_hole/ρ) = 81.012 mm', near(eje.stripLengthMm, 2 * 84.15 * Math.asin(38.96 / 84.15), 1e-9) && near(eje.stripLengthMm, 81.012, 5e-4), String(eje.stripLengthMm));
  /* Large case strip tiles in X and every station still appears exactly once per column overlap rules */
  const bigG = buildBranchOnElbowMarkingGuide(computeBranchOnElbow(BIG), { format: 'A4', elbowOuterDiameterMm: 609.6, meta: guideMeta('TOP') })!;
  check('big guide A4: strip tiles in X (> 1 column)', bigG.stripPagesX > 1, String(bigG.stripPagesX));
  check('big guide A4: strip coverage', (bigG.stripPagesX - 1) * (287 - bigG.overlapMm) + 287 >= bigG.stripLengthMm + 8 - 1e-9);
  check('big guide A4: registration marks on strip pages', bigG.tiles.filter(t => t.kind === 'strip').every(t => elements(t.svg, 'circle', 'data-registration').length === (t.stripCol > 0 ? 1 : 0) + (t.stripCol < bigG.stripPagesX - 1 ? 1 : 0)));
  /* N = 48 → table continuation page */
  const dense = computeBranchOnElbow({ ...REF, divisions: 48, datum: { type: 'EJE' } });
  const denseG = buildBranchOnElbowMarkingGuide(dense, { format: 'A4', elbowOuterDiameterMm: 168.3, meta: guideMeta('EJE') })!;
  check('N=48 guide A4: table continues on an extra page, all 49 rows present', denseG.tablePages >= 1
    && new Set(denseG.tiles.flatMap(t => elements(t.svg, 'text', 'data-table-station').map(a => a['data-table-station']))).size === 49);
}

/* ═══ 6. Final-PDF text safety (U4 glyph hotfix §7) ═══
   These checks run on the FINAL PDF bytes, not on the source SVG: the PDF
   writer transliterates to WinAnsi and substitutes '?' for anything it cannot
   encode, so only the artifact itself can prove a workshop sheet is legible. */
const LOCALES = ['en', 'es', 'de', 'fr', 'it', 'nl', 'pt', 'ro', 'pl', 'bg', 'uk'] as const;
/** Locales whose text cannot be encoded in PDF Latin-1 → ASCII English sheet. */
const NON_LATIN1 = new Set(['ro', 'pl', 'bg', 'uk']);

const localeDict = new Map<string, Record<string, unknown>>();
for (const lng of LOCALES) {
  localeDict.set(lng, JSON.parse(readFileSync(
    new URL(`../app/frontend/src/i18n/locales/${lng}.json`, import.meta.url), 'utf8')) as Record<string, unknown>);
}
const translator = (lng: string) => (key: string): string => {
  let node: unknown = localeDict.get(lng);
  for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
  if (typeof node !== 'string') throw new Error(`missing i18n key ${lng}:${key}`);
  return node;
};
const labelsFor = (lng: string, datumLabel: string) => buildBranchOnElbowPdfLabels({
  translate: translator(lng), datumLabel,
  branchLabel: '3" Sch 40 · OD 88.9 mm · ID 77.92 mm',
  elbowLabel: '6" · D 168.3 mm · R 228.6 mm · L 200 mm · a 150 mm',
});
/** Text drawn by the PDF (concatenated Tj operands, PDF escapes resolved). */
function pdfText(bytes: Uint8Array): string {
  const s = Buffer.from(bytes).toString('latin1');
  return [...s.matchAll(/\(((?:\\.|[^\\()])*)\)\s*Tj/g)]
    .map(m => m[1].replace(/\\([()\\])/g, '$1')).join('\n');
}
const qmarks = (bytes: Uint8Array) => (Buffer.from(bytes).toString('latin1').match(/\?/g) ?? []).length;

check('folding: Ω → REF O, ′ → \', − → -', pdfSafeLabel("Ω · Cota X′ −1") === `${PDF_ORIGIN_LABEL} · Cota X' -1`
  && PDF_ORIGIN_LABEL === 'REF O', pdfSafeLabel("Ω · Cota X′ −1"));
check('folding: encodability detection', pdfLabelEncodable("Ω Cota X′ −20") && !pdfLabelEncodable('Шаблон') && !pdfLabelEncodable('ș'));

/* Every locale, every reference datum + the large case: zero '?' in the final PDF. */
for (const lng of LOCALES) {
  const guideQ: number[] = [];
  const cutQ: number[] = [];
  for (const { id, datum } of DATUMS) {
    const r = id === 'EJE' ? refResults.get(id)! : computeBranchOnElbow({ ...REF, datum });
    const labels = labelsFor(lng, id);
    guideQ.push(qmarks(toPdf(buildBranchOnElbowMarkingGuide(r, {
      format: 'A4', elbowOuterDiameterMm: REF.elbowOuterDiameterMm, meta: labels.guide })!.tiles)));
    cutQ.push(qmarks(toPdf(buildBranchOnElbowCutTemplate(r, { format: 'A4', meta: labels.cut })!.tiles)));
  }
  const big = labelsFor(lng, 'TOP');
  const bigGuide = toPdf(buildBranchOnElbowMarkingGuide(computeBranchOnElbow(BIG), {
    format: 'A4', elbowOuterDiameterMm: BIG.elbowOuterDiameterMm, meta: big.guide })!.tiles);
  const bigCut = toPdf(buildBranchOnElbowCutTemplate(computeBranchOnElbow(BIG), { format: 'A4', meta: big.cut })!.tiles);
  check(`pdf ${lng}: marking-guide PDFs contain zero '?' (5 datums + large TOP)`,
    guideQ.every(q => q === 0) && qmarks(bigGuide) === 0, `${guideQ.join(',')} | big ${qmarks(bigGuide)}`);
  check(`pdf ${lng}: cut-template PDFs contain zero '?' (5 datums + large TOP)`,
    cutQ.every(q => q === 0) && qmarks(bigCut) === 0, `${cutQ.join(',')} | big ${qmarks(bigCut)}`);
  check(`pdf ${lng}: label set localized exactly when PDF-encodable`,
    labelsFor(lng, 'EJE').localized === !NON_LATIN1.has(lng));
}

/* Required fabrication labels must be present in the final PDF text. */
const REQUIRED = ['MARKING GUIDE', 'RING STRIP 1:1', "X'=0", 'TOP', 'BOP', '+Y', 'end A', 'end B',
  `${PDF_ORIGIN_LABEL} ring`, "+X' -> TOP", "-X' -> BOP", '-Y -> A', 'PRINT AT 100% / ACTUAL SIZE',
  'VERIFY THE 100 mm CALIBRATION BAR BEFORE MARKING OR CUTTING', 'not a 1:1 hole template'];
for (const { id, datum } of DATUMS) {
  const r = id === 'EJE' ? refResults.get(id)! : computeBranchOnElbow({ ...REF, datum });
  const labels = labelsFor('en', id);
  const guide = buildBranchOnElbowMarkingGuide(r, {
    format: 'A4', elbowOuterDiameterMm: REF.elbowOuterDiameterMm, meta: labels.guide })!;
  const txt = pdfText(toPdf(guide.tiles));
  const missing = REQUIRED.filter(label => !txt.includes(label));
  check(`pdf guide ${id}: required fabrication labels present`, missing.length === 0, missing.join(' | '));
  check(`pdf guide ${id}: no '?' and no Greek/Unicode leftovers`, !txt.includes('?') && !/[^\x00-\xff]/.test(txt));
  check(`pdf guide ${id}: signed Y instruction, never a bare sign`, txt.includes('end B (+Y) or end A (-Y)'));
  /* Physical invariance vs the label-independent stub metadata. */
  const stub = buildBranchOnElbowMarkingGuide(r, {
    format: 'A4', elbowOuterDiameterMm: REF.elbowOuterDiameterMm, meta: guideMeta(id) })!;
  check(`pdf guide ${id}: labels do not move geometry`, stub.tiles.length === guide.tiles.length
    && near(stub.stripLengthMm, guide.stripLengthMm, 1e-12) && near(stub.overlapMm, guide.overlapMm, 1e-12)
    && stub.ringPositionsMm.every((v, k) => near(v, guide.ringPositionsMm[k], 1e-12))
    && JSON.stringify(pdfMediaBoxes(toPdf(stub.tiles))) === JSON.stringify(pdfMediaBoxes(toPdf(guide.tiles))));
  const cutTxt = pdfText(toPdf(buildBranchOnElbowCutTemplate(r, { format: 'A4', meta: labels.cut })!.tiles));
  check(`pdf cut ${id}: 1:1 cut-template wording + own calibration note`,
    cutTxt.includes('CUT TEMPLATE 1:1') && cutTxt.includes('VERIFY THE 100 mm CALIBRATION BAR BEFORE CUTTING')
    && !cutTxt.includes('MARKING OR CUTTING') && !cutTxt.includes('?'));
}
{
  const labels = labelsFor('en', 'TOP');
  const bigTxt = pdfText(toPdf(buildBranchOnElbowMarkingGuide(computeBranchOnElbow(BIG), {
    format: 'A4', elbowOuterDiameterMm: BIG.elbowOuterDiameterMm, meta: labels.guide })!.tiles));
  check('pdf guide large TOP: required labels present and zero \'?\'',
    REQUIRED.every(label => bigTxt.includes(label)) && !bigTxt.includes('?'));
  const fb = labelsFor('bg', 'TOP');
  const fbTxt = pdfText(toPdf(buildBranchOnElbowMarkingGuide(refResults.get('TOP')!, {
    format: 'A4', elbowOuterDiameterMm: REF.elbowOuterDiameterMm, meta: fb.guide })!.tiles));
  check('pdf guide bg: ASCII English fallback sheet, fully legible',
    !fbTxt.includes('?') && REQUIRED.every(label => fbTxt.includes(label)) && fb.localized === false);
}

console.log(`\nbranch-on-elbow physical outputs: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
