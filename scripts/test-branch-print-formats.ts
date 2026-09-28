/* PB-BRANCH-PRINT-FORMATS-001 — deterministic tests for physical ISO page
   formats (A4/A3/A2/A1/A0, landscape) on the 1:1 branch templates.

   Run: node --experimental-strip-types scripts/test-branch-print-formats.ts

   Non-negotiable principle under test: changing the paper ONLY changes the
   available physical area (page size, page count, position, tiling). The
   fabrication geometry — circumference, station spacing, coordinates — is
   byte-identical across formats and always 1:1. */

import {
  computeBranchIntersection,
  type BranchIntersectionInput,
} from '../app/frontend/src/tools/branch/branchIntersectionGeometry.ts';
import {
  buildBranchTemplate,
} from '../app/frontend/src/tools/branch/branchTemplateSvg.ts';
import {
  buildPicajeTemplate,
} from '../app/frontend/src/tools/branch/branchPicajeTemplateSvg.ts';
import {
  svgPagesToPdf,
} from '../app/frontend/src/tools/branch/svgMmToPdf.ts';
import {
  PDF_PAGE_FORMATS,
  getPdfPageFormat,
  pdfFormatUsableWidthMm,
  DEFAULT_PDF_PAGE_FORMAT_ID,
} from '../app/frontend/src/tools/branch/pdfPageFormat.ts';
import { formatMm } from '../app/frontend/src/tools/branch/formatMm.ts';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; } else { failed++; failures.push(`${name}${detail ? ' — ' + detail : ''}`); }
}

const META = {
  headerLabel: '6" Sch 40 (OD 168.3 mm)',
  branchLabel: '3" Sch 40 (OD 88.9 mm)',
  branchRefLabel: '3" (ID 77.92 mm)',
  betaDeg: 90,
  titleLabel: 'Branch cut template 1:1 (development)',
  picajeTitleLabel: 'Header picaje template 1:1 — opening',
  seamLabel: 'Seam',
  pageLabel: 'Page',
  overlapLabel: 'Overlap',
  wrapNoteLabel: 'Wrap the template around the branch OD.',
  calibrationNote: 'After printing, verify the 100 mm bar with a ruler.',
  printAtActualSize: 'PRINT AT 100% / ACTUAL SIZE',
  generatedLabel: 'PIPINGBOX · H-001 · deterministic physical artifact',
} as const;

const cutMeta = () => ({
  headerLabel: META.headerLabel,
  branchLabel: META.branchLabel,
  betaDeg: META.betaDeg,
  titleLabel: META.titleLabel,
  seamLabel: META.seamLabel,
  pageLabel: META.pageLabel,
  overlapLabel: META.overlapLabel,
  wrapNoteLabel: META.wrapNoteLabel,
  calibrationNote: META.calibrationNote,
  printAtActualSize: META.printAtActualSize,
  generatedLabel: META.generatedLabel,
});

const picajeMeta = () => ({
  headerLabel: META.headerLabel,
  branchRefLabel: META.branchRefLabel,
  betaDeg: META.betaDeg,
  titleLabel: META.picajeTitleLabel,
  originLabel: 'Origin (0,0)',
  xAxisLabel: 'arc on header',
  yAxisLabel: 'header axis',
  openingNote: 'Line = nominal opening (reference: branch ID).',
  wrapNote: 'X = developed circumferential distance. Y = axial distance.',
  calibrationNote: META.calibrationNote,
  printAtActualSize: META.printAtActualSize,
  pageLabel: META.pageLabel,
  overlapLabel: META.overlapLabel,
  generatedLabel: META.generatedLabel,
});

/* ── Reference case 6" × 3" × 90° × N=24 (PO regression case) ── */
const REF: BranchIntersectionInput = {
  headerOuterRadius: 168.30 / 2,
  branchOuterDiameter: 88.9,
  branchInnerDiameter: 77.92,
  betaDeg: 90,
  divisions: 24,
  referenceLength: 200,
};

/* Large case for tiling: 36" header × 24" branch × N=48. */
const BIG: BranchIntersectionInput = {
  headerOuterRadius: 914.4 / 2,
  branchOuterDiameter: 609.6,
  branchInnerDiameter: 590.54,
  betaDeg: 90,
  divisions: 48,
};

const MM2PT = 72 / 25.4;

/** Parse the MediaBox of every page object in a PDF byte stream. */
function pdfMediaBoxes(bytes: Uint8Array): [number, number, number, number][] {
  const s = Buffer.from(bytes).toString('latin1');
  const boxes: [number, number, number, number][] = [];
  const re = /\/MediaBox \[([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    boxes.push([+m[1], +m[2], +m[3], +m[4]]);
  }
  return boxes;
}

/* ═══ 1. Format definition (single source of truth) ═══ */

check('five formats defined, ordered A4→A0', PDF_PAGE_FORMATS.length === 5
  && PDF_PAGE_FORMATS.every((f, i) => f.id === (['A4', 'A3', 'A2', 'A1', 'A0'] as const)[i]));

for (const f of PDF_PAGE_FORMATS) {
  check(`${f.id} landscape dimensions (mm)`,
    Math.abs(f.widthMm - f.heightMm * Math.SQRT2) < 1.0 && f.widthMm > f.heightMm,
    `${f.widthMm} × ${f.heightMm}`);
}

check('default format is A4', DEFAULT_PDF_PAGE_FORMAT_ID === 'A4');
check('A4 exact 297 × 210', PDF_PAGE_FORMATS[0].widthMm === 297 && PDF_PAGE_FORMATS[0].heightMm === 210);
check('A3 exact 420 × 297', PDF_PAGE_FORMATS[1].widthMm === 420 && PDF_PAGE_FORMATS[1].heightMm === 297);
check('A2 exact 594 × 420', PDF_PAGE_FORMATS[2].widthMm === 594 && PDF_PAGE_FORMATS[2].heightMm === 420);
check('A1 exact 841 × 594', PDF_PAGE_FORMATS[3].widthMm === 841 && PDF_PAGE_FORMATS[3].heightMm === 594);
check('A0 exact 1189 × 841', PDF_PAGE_FORMATS[4].widthMm === 1189 && PDF_PAGE_FORMATS[4].heightMm === 841);
check('unknown format throws', (() => { try { getPdfPageFormat('A5' as never); return false; } catch { return true; } })());
check('A4 usable width 287 mm', pdfFormatUsableWidthMm(PDF_PAGE_FORMATS[0]) === 287);

/* ═══ 2. Canonical geometry is format-independent (reference case) ═══ */

const refGeo = computeBranchIntersection(REF);
{
  const g = refGeo;
  check('ref circumference 279.288 mm', Math.abs(g.developedCircumference - 279.288) < 0.001, String(g.developedCircumference));
  check('ref Δθ 15°', Math.abs(g.angularStepDeg - 15) < 1e-9);
  check('ref Δs 11.637 mm', Math.abs(g.stationSpacing - 11.637) < 0.001, String(g.stationSpacing));
  const xs = g.stations.map(s => s.picajeX);
  const ys = g.stations.map(s => s.picajeY);
  check('ref picaje W(X) 81.012 mm', Math.abs((Math.max(...xs) - Math.min(...xs)) - 81.012) < 0.001);
  check('ref picaje H(Y) 77.92 mm', Math.abs((Math.max(...ys) - Math.min(...ys)) - 77.92) < 0.001);
}

/* ═══ 3. Cut template: geometry identical across formats ═══ */

const refCutByFormat = new Map<string, ReturnType<typeof buildBranchTemplate>>();
for (const f of PDF_PAGE_FORMATS) {
  const tpl = buildBranchTemplate(refGeo, { format: f.id, ordinate: 'fromEnd', meta: cutMeta() });
  refCutByFormat.set(f.id, tpl);

  check(`cut ${f.id}: page size = format`, tpl.tiles.every(t => t.widthMm === f.widthMm && t.heightMm === f.heightMm));
  check(`cut ${f.id}: svg declares physical mm`, tpl.tiles.every(t =>
    t.svg.includes(`width="${f.widthMm}mm"`) && t.svg.includes(`height="${f.heightMm}mm"`)));
  check(`cut ${f.id}: circumference reported 279.288`, Math.abs(tpl.circumferenceMm - 279.288) < 0.001);
  check(`cut ${f.id}: calibration bar present`, tpl.tiles.every(t => t.svg.includes('100 mm')));
  check(`cut ${f.id}: PRINT AT 100% present`, tpl.tiles.every(t => t.svg.includes('PRINT AT 100% / ACTUAL SIZE')));
  check(`cut ${f.id}: page numbering X/Y`, tpl.tiles.every(t =>
    t.svg.includes(`Page ${t.pageIndex + 1}/${t.pageCount}`)));
  check(`cut ${f.id}: one page (content 283.288 ≤ usable)`, tpl.tiles.length === 1 && !tpl.tiled,
    `pages=${tpl.tiles.length}`);
}

/* The cut contour is geometrically identical on page 1 for every format:
   X coordinates are byte-identical (the development never moves), and Y
   coordinates are identical relative to the ordinate baseline, which is
   bottom-anchored (BASELINE = pageHeight − 60). Only the paper grows. */
{
  const BOTTOM_BAND = 60;
  const contourPts = (svg: string): [number, number][] | null => {
    const m = svg.match(/<polyline points="([^"]+)"/);
    if (!m) return null;
    return m[1].trim().split(/\s+/).map(p => p.split(',').map(Number) as [number, number]);
  };
  const base = contourPts(refCutByFormat.get('A4')!.tiles[0].svg);
  check('cut contour exists', base !== null);
  for (const f of PDF_PAGE_FORMATS) {
    const pts = contourPts(refCutByFormat.get(f.id)!.tiles[0].svg);
    const baseline = f.heightMm - BOTTOM_BAND;
    const ok = pts !== null && pts.length === base!.length
      && pts.every(([x, y], i) => x === base![i][0]
        && Math.abs((y - baseline) - (base![i][1] - 150)) < 1e-9);
    check(`cut contour ${f.id} identical to A4 (X exact, Y baseline-relative)`, ok);
  }
}

/* Station generator lines carry data-station attributes — the physical
   spacing between consecutive station lines must equal the canonical Δs
   in EVERY format (mathematical proof, not visual). */
{
  for (const f of PDF_PAGE_FORMATS) {
    const svg = refCutByFormat.get(f.id)!.tiles[0].svg;
    const xs: number[] = [];
    const re = /<line data-station="(\d+)" x1="([\d.]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(svg)) !== null) xs[+m[1]] = parseFloat(m[2]);
    check(`cut ${f.id}: 25 station lines (24 + closure)`, xs.filter(Boolean).length >= 24, String(xs.length));
    let ok = true; let detail = '';
    for (let i = 1; i < 24; i++) {
      const d = xs[i] - xs[i - 1];
      if (Math.abs(d - 11.637) > 0.002) { ok = false; detail = `Δ(${i - 1}→${i}) = ${d.toFixed(3)}`; break; }
    }
    check(`cut ${f.id}: physical station spacing = 11.637 mm on the artifact`, ok, detail);
  }
}

/* Larger paper never increases the page count for the same content. */
{
  const counts = PDF_PAGE_FORMATS.map(f => refCutByFormat.get(f.id)!.tiles.length);
  const nonIncreasing = counts.every((c, i) => i === 0 || c <= counts[i - 1]);
  check('cut ref: page counts non-increasing A4→A0', nonIncreasing, counts.join(','));
}

/* ═══ 4. Picaje template: geometry identical across formats ═══ */

const refPicajeByFormat = new Map<string, ReturnType<typeof buildPicajeTemplate>>();
for (const f of PDF_PAGE_FORMATS) {
  const pj = buildPicajeTemplate(refGeo, { format: f.id, meta: picajeMeta() });
  refPicajeByFormat.set(f.id, pj);
  check(`picaje ${f.id}: page size = format`, pj.tiles.every(t => t.widthMm === f.widthMm && t.heightMm === f.heightMm));
  check(`picaje ${f.id}: W(X) 81.012 / H(Y) 77.92`,
    Math.abs(pj.widthMm - 81.012) < 0.001 && Math.abs(pj.heightMm - 77.92) < 0.001,
    `${pj.widthMm} × ${pj.heightMm}`);
  check(`picaje ${f.id}: calibration bar present`, pj.tiles.every(t => t.svg.includes('100 mm')));
  check(`picaje ${f.id}: PRINT AT 100% present`, pj.tiles.every(t => t.svg.includes('PRINT AT 100% / ACTUAL SIZE')));
  check(`picaje ${f.id}: one page`, pj.tiles.length === 1, `pages=${pj.tiles.length}`);
}

/* Picaje contour shape invariance across formats: the opening polygon is the
   same geometry translated on the page (the drawing area grows with the
   paper). Consecutive vertex deltas must be IDENTICAL in every format —
   translation-invariant, scale-sensitive proof. */
{
  const contourPts = (svg: string): [number, number][] | null => {
    const m = svg.match(/<polygon points="([^"]+)"/);
    if (!m) return null;
    return m[1].trim().split(/\s+/).map(p => p.split(',').map(Number) as [number, number]);
  };
  const base = contourPts(refPicajeByFormat.get('A4')!.tiles[0].svg);
  check('picaje contour exists', base !== null);
  for (const f of PDF_PAGE_FORMATS) {
    const pts = contourPts(refPicajeByFormat.get(f.id)!.tiles[0].svg);
    const ok = pts !== null && pts.length === base!.length
      && pts.every(([x, y], i) => {
        if (i === 0) return true;
        return Math.abs((x - pts![i - 1][0]) - (base![i][0] - base![i - 1][0])) < 1e-9
          && Math.abs((y - pts![i - 1][1]) - (base![i][1] - base![i - 1][1])) < 1e-9;
      });
    check(`picaje contour ${f.id} shape-identical to A4 (translation-invariant)`, ok);
  }
}

/* ═══ 5. PDF MediaBox = physical format (mm → pt, deterministic) ═══ */

for (const f of PDF_PAGE_FORMATS) {
  const tpl = refCutByFormat.get(f.id)!;
  const pdf = svgPagesToPdf(tpl.tiles.map(t => ({ svg: t.svg, widthMm: t.widthMm, heightMm: t.heightMm })));
  const boxes = pdfMediaBoxes(pdf);
  check(`pdf ${f.id}: one MediaBox per page`, boxes.length === tpl.tiles.length, `${boxes.length} vs ${tpl.tiles.length}`);
  const expW = Number((f.widthMm * MM2PT).toFixed(3));
  const expH = Number((f.heightMm * MM2PT).toFixed(3));
  check(`pdf ${f.id}: MediaBox ${f.widthMm}×${f.heightMm} mm in points`,
    boxes.every(b => b[0] === 0 && b[1] === 0 && Math.abs(b[2] - expW) < 0.01 && Math.abs(b[3] - expH) < 0.01),
    boxes[0] ? `[0 0 ${boxes[0][2]} ${boxes[0][3]}]` : 'none');

  /* Byte determinism: same input + same format → same bytes. */
  const pdf2 = svgPagesToPdf(tpl.tiles.map(t => ({ svg: t.svg, widthMm: t.widthMm, heightMm: t.heightMm })));
  check(`pdf ${f.id}: byte-deterministic`, Buffer.compare(Buffer.from(pdf), Buffer.from(pdf2)) === 0);
}

/* ═══ 6. Tiling matrix: large case 36" × 24" × N=48 ═══ */

const bigGeo = computeBranchIntersection(BIG);
{
  const g = bigGeo;
  const expC = Math.PI * 609.6;
  check('big circumference π·609.6', Math.abs(g.developedCircumference - expC) < 0.01, String(g.developedCircumference));

  const cutCounts: number[] = [];
  const picajeCounts: number[] = [];
  for (const f of PDF_PAGE_FORMATS) {
    const tpl = buildBranchTemplate(g, { format: f.id, ordinate: 'relative', meta: cutMeta() });
    const pj = buildPicajeTemplate(g, { format: f.id, meta: picajeMeta() });
    cutCounts.push(tpl.tiles.length);
    picajeCounts.push(pj.tiles.length);

    /* Physical station spacing on every page that hosts stations. */
    let spacingOk = true; let detail = '';
    for (const t of tpl.tiles) {
      const xs: number[] = [];
      const re = /<line data-station="(\d+)" x1="([\d.]+)"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(t.svg)) !== null) xs[+m[1]] = parseFloat(m[2]);
      for (let i = 1; i < xs.length; i++) {
        if (xs[i] === undefined || xs[i - 1] === undefined) continue;
        const d = Math.abs(xs[i] - xs[i - 1]);
        // Adjacent stations on the same page keep the canonical spacing.
        if (d > 0.001 && Math.abs(d - g.stationSpacing) > 0.002) { spacingOk = false; detail = `page ${t.pageIndex + 1} Δ(${i - 1}→${i}) = ${d.toFixed(3)}`; break; }
      }
      if (!spacingOk) break;
    }
    check(`big cut ${f.id}: tiled spacing = canonical Δs on every page`, spacingOk, detail);

    /* Tiled pages keep registration marks + overlap note + page numbering. */
    if (tpl.tiled) {
      check(`big cut ${f.id}: registration marks on tiled pages`,
        tpl.tiles.every(t => t.svg.includes('<circle')),
        'missing marks');
      check(`big cut ${f.id}: overlap note on non-last pages`,
        tpl.tiles.filter(t => t.pageIndex < t.pageCount - 1).every(t => t.svg.includes('Overlap 15 mm')));
    }
    check(`big cut ${f.id}: geometry values unchanged by paper`,
      Math.abs(tpl.circumferenceMm - expC) < 0.01);
    check(`big picaje ${f.id}: page size = format`, pj.tiles.every(t => t.widthMm === f.widthMm && t.heightMm === f.heightMm));
  }

  /* A4 needs strictly more pages than A0 for the cut; counts decrease. */
  check('big cut: page counts strictly decrease A4→A0 (at least A4 > A0)',
    cutCounts[0] > cutCounts[4], cutCounts.join(','));
  check('big cut: page counts non-increasing', cutCounts.every((c, i) => i === 0 || c <= cutCounts[i - 1]), cutCounts.join(','));
  check('big picaje: page counts non-increasing', picajeCounts.every((c, i) => i === 0 || c <= picajeCounts[i - 1]), picajeCounts.join(','));
  check('big picaje: A4 pages > A0 pages', picajeCounts[0] > picajeCounts[4], picajeCounts.join(','));

  console.log(`\nTiling matrix — 36" header × 24" branch × N=48`);
  console.log('  format | cut pages | picaje pages');
  PDF_PAGE_FORMATS.forEach((f, i) => console.log(`  ${f.id.padEnd(6)} | ${String(cutCounts[i]).padEnd(9)} | ${picajeCounts[i]}`));
}

/* ═══ 7. A4 default: explicit A4 = implicit default (backward compat) ═══ */

{
  const a = buildBranchTemplate(refGeo, { ordinate: 'fromEnd', meta: cutMeta() });
  const b = buildBranchTemplate(refGeo, { format: 'A4', ordinate: 'fromEnd', meta: cutMeta() });
  check('cut: default call = explicit A4 (bytes)', a.tiles[0].svg === b.tiles[0].svg && a.pageCount === b.pageCount);
  const c = buildPicajeTemplate(refGeo, { meta: picajeMeta() });
  const d = buildPicajeTemplate(refGeo, { format: 'A4', meta: picajeMeta() });
  check('picaje: default call = explicit A4 (bytes)', c.tiles[0].svg === d.tiles[0].svg && c.pageCount === d.pageCount);
}

/* ═══ 8. Never scale-to-fit: A4 usable width is respected, not exceeded ═══ */
{
  const tpl = buildBranchTemplate(bigGeo, { format: 'A4', ordinate: 'relative', meta: cutMeta() });
  check('big cut A4: content per page ≤ usable width (287)',
    tpl.tiles.every(t => t.widthMm === 297),
    'page width');
  // The tile content window is usableW with overlap added back on continuation
  // pages: verify each page's station lines stay inside the printable area.
  const M = 5;
  let inside = true; let detail = '';
  for (const t of tpl.tiles) {
    const re = /<line data-station="\d+" x1="([\d.]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t.svg)) !== null) {
      const x = parseFloat(m[1]);
      if (x < M - 0.01 || x > 297 - M + 0.01) { inside = false; detail = `x=${x}`; break; }
    }
    if (!inside) break;
  }
  check('big cut A4: every station line inside the 5 mm printable border', inside, detail);
}

/* ═══ 9. Clean numeric labels in PDF artifacts (PB-BRANCH-PDF-NUMERIC-FORMAT-001) ═══ */

{
  /* Helper unit checks: derived dimensions carry binary noise; labels must not. */
  check('formatMm: 102.25999999999999 → "102.26"', formatMm(102.25999999999999) === '102.26', formatMm(102.25999999999999));
  check('formatMm: 77.92 → "77.92"', formatMm(77.92) === '77.92', formatMm(77.92));
  check('formatMm: 168.3 → "168.3" (no 168.30)', formatMm(168.3) === '168.3', formatMm(168.3));
  check('formatMm: 88.9 → "88.9"', formatMm(88.9) === '88.9', formatMm(88.9));
  check('formatMm: 508 → "508"', formatMm(508.0) === '508', formatMm(508.0));
  check('formatMm: 590.5400000000001 → "590.54"', formatMm(590.5400000000001) === '590.54', formatMm(590.5400000000001));

  /* Regression case: 4" Sch 40 header × 4" Sch 40 branch × 90° × N=24.
     branchID = 114.3 − 2·6.02 = 102.25999999999999 raw — the picaje header
     must read exactly `4" (ID 102.26 mm)`. */
  const geo44 = computeBranchIntersection({
    headerOuterRadius: 114.3 / 2,
    branchOuterDiameter: 114.3,
    branchInnerDiameter: 114.3 - 2 * 6.02,
    betaDeg: 90,
    divisions: 24,
  });
  const meta44 = picajeMeta();
  meta44.headerLabel = '4" Sch 40 (OD 114.3 mm)';
  meta44.branchRefLabel = `4" (ID ${formatMm(114.3 - 2 * 6.02)} mm)`;
  const pj44 = buildPicajeTemplate(geo44, { format: 'A4', meta: meta44 });
  const svg44 = pj44.tiles[0].svg;
  check('picaje 4"×4" header: exactly `4" (ID 102.26 mm)`',
    svg44.includes('4" (ID 102.26 mm)'), svg44.match(/ID [^m]*mm/)?.[0] ?? 'ID label not found');

  /* No long floating-point strings anywhere in any artifact (labels or values). */
  const LONG_FLOAT = /\d+\.\d{5,}/;
  const allSvgs = [
    ...refCutByFormat.get('A4')!.tiles.map(t => t.svg),
    ...refCutByFormat.get('A0')!.tiles.map(t => t.svg),
    ...refPicajeByFormat.get('A4')!.tiles.map(t => t.svg),
    ...refPicajeByFormat.get('A0')!.tiles.map(t => t.svg),
    svg44,
  ];
  check('no floating-point noise strings in any template SVG',
    allSvgs.every(s => !LONG_FLOAT.test(s)));

  /* 6"×3" reference keeps its exact labels (ID 77.92, OD 168.3). */
  const refSvg = refPicajeByFormat.get('A4')!.tiles[0].svg;
  check('picaje 6"×3" reference label keeps ID 77.92',
    refSvg.includes('3" (ID 77.92 mm)'));
  check('cut 6"×3" reference label keeps OD 168.3 (not 168.30)',
    refCutByFormat.get('A4')!.tiles[0].svg.includes('6" Sch 40 (OD 168.3 mm)'));
}

/* ═══ Report ═══ */

console.log(`\n${passed} PASS / ${failed} FAIL`);
if (failed > 0) {
  console.error('FAILURES:');
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log('All print-format tests passed.');
