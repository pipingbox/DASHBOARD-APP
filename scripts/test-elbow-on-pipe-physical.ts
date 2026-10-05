/* ───────────────────────────────────────────────────────────────────────────
   PB-BRANCH-INJERTO-EXPANSION-001 U5.4 — physical fabrication outputs for the
   codo→tubo family: receiver PICAJE TEMPLATE 1:1 + ELBOW MARKING GUIDE.

   Run:  node --experimental-strip-types scripts/test-elbow-on-pipe-physical.ts

   Never recomputes geometry. Takes ElbowOnPipeResult from the frozen U5.1
   kernel and verifies that the PHYSICAL artifacts reproduce those millimetres.

   Receiver template (§20):  A picajeX  B picajeY  C closure  D contour order
     E 1 mm/mm  F Cota X' relationship  G Y' invariance  H MediaBox
     I calibration  J tiling coverage  K overlap  L registration  M deterministic
     N no scale-to-fit
   Elbow guide (§21):  A strip = π·d.ex  B Div  C P positions  D arcLength
     E arcRadius  F bendAngle  G/H clamped marks  I table traces to U5.1
     J no flat 1:1 claim  K final PDF no '?'  L NOT TO SCALE
   Terminology contract (§22) + final-PDF glyph audit across 11 locales (§17).
   ─────────────────────────────────────────────────────────────────────────── */

import { readFileSync } from 'node:fs';
import { computeElbowOnPipe } from '../app/frontend/src/tools/branch/elbowOnPipeGeometry.ts';
import type { ElbowOnPipeInput, ElbowOnPipeResult } from '../app/frontend/src/tools/branch/elbowOnPipeGeometry.ts';
import {
  buildElbowOnPipeReceiverTemplate, receiverTemplatePoint, receiverCrownArcMm,
  RECEIVER_TEMPLATE_OVERLAP_MM, RECEIVER_TEMPLATE_PAD_MM, RECEIVER_TEMPLATE_CALIBRATION_MM,
  RECEIVER_TEMPLATE_CONTENT_TOP_MM, RECEIVER_TEMPLATE_BOTTOM_BAND_MM,
} from '../app/frontend/src/tools/branch/elbowOnPipeReceiverTemplateSvg.ts';
import type { ElbowOnPipeReceiverTemplateMeta } from '../app/frontend/src/tools/branch/elbowOnPipeReceiverTemplateSvg.ts';
import {
  buildElbowOnPipeMarkingGuide, ELBOW_GUIDE_CALIBRATION_MM,
} from '../app/frontend/src/tools/branch/elbowOnPipeMarkingGuideSvg.ts';
import type { ElbowOnPipeMarkingGuideMeta } from '../app/frontend/src/tools/branch/elbowOnPipeMarkingGuideSvg.ts';
import { svgPagesToPdf } from '../app/frontend/src/tools/branch/svgMmToPdf.ts';
import { buildElbowOnPipePdfLabels } from '../app/frontend/src/tools/branch/elbowOnPipePdfLabels.ts';
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

/* ── Reference case (§18) and large case (§19) ── */
const REF = {
  elbowInnerDiameterMm: 77.92, elbowOuterDiameterMm: 88.9, elbowCentrelineRadiusMm: 114.3,
  receiverOuterDiameterMm: 168.3, divisions: 24,
} as const;
const DATUMS: { id: string; datum: ElbowOnPipeInput['datum'] }[] = [
  { id: 'EJE', datum: { type: 'EJE' } },
  { id: 'BOP', datum: { type: 'BOP' } },
  { id: 'TOP', datum: { type: 'TOP' } },
  { id: 'FE+20', datum: { type: 'FE', fe: 20 } },
  { id: 'FE-20', datum: { type: 'FE', fe: -20 } },
];
/* 12" Sch 40 elbow (R = 1.5 D) on a 20" receiver, EJE, N = 48 → receiver tiles X and Y on A4,
   strip π·323.8 = 1017 mm tiles in X on A4, table continues. */
const BIG: ElbowOnPipeInput = {
  elbowInnerDiameterMm: 303.2, elbowOuterDiameterMm: 323.8, elbowCentrelineRadiusMm: 457.2,
  receiverOuterDiameterMm: 508, divisions: 48, datum: { type: 'EJE' },
};

const receiverMeta = (datumLabel: string): ElbowOnPipeReceiverTemplateMeta => ({
  titleLabel: 'PICAJE TEMPLATE 1:1 - RECEIVER TUBE (elbow -> tube)', familyLabel: 'CODO-TUBO', datumLabel,
  elbowLabel: '3" Sch 40 · OD 88.9 mm · ID 77.92 mm · R 114.3 mm', receiverLabel: '6" · D 168.3 mm',
  conventionLabel: 'PIPINGBOX SET-ON · hole reference = elbow ID', originLabel: '(0,0) = datum generatrix x t=0 plane',
  xAxisLabel: 'X arc on receiver', yAxisLabel: 'Y along receiver axis', towardTopLabel: 'toward TOP', towardBopLabel: 'toward BOP',
  crownLabel: 'receiver crown', legPlaneLabel: 't=0 leg plane', endFaceLabel: '90 end face', cotaXLabel: "Cota X'", cotaYLabel: "Cota Y'",
  cotaYNote: "Y' is external", cotaYAbsent: 'not set', pageLabel: 'Page', overlapLabel: 'Overlap',
  calibrationNote: 'VERIFY THE 100 mm CALIBRATION BAR BEFORE MARKING OR CUTTING', printAtActualSize: 'PRINT AT 100% / ACTUAL SIZE', generatedLabel: 'PIPINGBOX',
});
const guideMeta = (datumLabel: string): ElbowOnPipeMarkingGuideMeta => ({
  titleLabel: 'ELBOW MARKING GUIDE (elbow -> tube)', familyLabel: 'CODO-TUBO', datumLabel,
  elbowLabel: '3" Sch 40', receiverLabel: '6"', conventionLabel: 'PIPINGBOX SET-ON · elbow cut reference = elbow OD',
  guideNote: 'NOT A 1:1 FLAT CUT TEMPLATE', stripTitle: 'OD DIVISION STRIP 1:1', closureLabel: '360 = P1',
  cotaXLabel: "Cota X'", cotaYLabel: "Cota Y'", cotaYAbsent: 'not set', cotaYNote: "Y' is external",
  colStation: 'P', colPsi: 'psi', colArcPos: 'OD pos', colArcRadius: 'R arc', colArcLength: 'L arc', colBend: 't', colLimit: 'limit', limitCell: '90 END',
  schematicTitle: 'SCHEMATIC', notToScale: 'SCHEMATIC - NOT TO SCALE', sectionLabel: 'Section', elevationLabel: 'Elevation',
  endPlaneLabel: 't=0 plane', endFaceLabel: '90 end face', arcDirectionLabel: 'L arc along bend', steps: ['one', 'two', 'three', 'four', 'five'],
  pageLabel: 'Page', overlapLabel: 'Overlap', calibrationNote: 'VERIFY THE 100 mm CALIBRATION BAR BEFORE MARKING OR CUTTING',
  printAtActualSize: 'PRINT AT 100% / ACTUAL SIZE', generatedLabel: 'PIPINGBOX',
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
function pdfText(bytes: Uint8Array): string {
  const s = Buffer.from(bytes).toString('latin1');
  return [...s.matchAll(/\(((?:\\.|[^\\()])*)\)\s*Tj/g)].map(m => m[1].replace(/\\([()\\])/g, '$1')).join('\n');
}
const qmarks = (bytes: Uint8Array) => (Buffer.from(bytes).toString('latin1').match(/\?/g) ?? []).length;
const pdfPages = (bytes: Uint8Array) => (Buffer.from(bytes).toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
function toPdf(tiles: { svg: string; widthMm: number; heightMm: number }[]): Uint8Array {
  return svgPagesToPdf(tiles.map(t => ({ svg: t.svg, widthMm: t.widthMm, heightMm: t.heightMm })));
}
const stationAttr = (svg: string, tag: string) => elements(svg, tag, 'data-template-station');

/* ═══ 0. Kernel reference values ═══ */
const refResults = new Map<string, ElbowOnPipeResult>();
for (const { id, datum } of DATUMS) {
  const r = computeElbowOnPipe({ ...REF, datum });
  refResults.set(id, r);
  check(`${id}: kernel valid`, r.valid, r.errors.map(e => e.code).join(','));
}
const bigResult = computeElbowOnPipe(BIG);
check('BIG: kernel valid', bigResult.valid, bigResult.errors.map(e => e.code).join(','));
{
  const r = refResults.get('EJE')!;
  check('circumference = π·88.90 = 279.288 mm', near(r.circumferenceMm, Math.PI * 88.9, 1e-9) && near(r.circumferenceMm, 279.288, 5e-4));
  check('Div = 279.288/24 = 11.637 mm', near(r.stationSpacingMm, Math.PI * 88.9 / 24, 1e-9));
  check('stations = 24 physical + closure', r.stations.length === 25);
}

/* ═══ 1. Receiver developability + Cota X' relationship proof (§4 F) ═══ */
{
  const rho = REF.receiverOuterDiameterMm / 2;
  for (const { id } of DATUMS) {
    const r = refResults.get(id)!;
    /* Cota X' = ρ·asin(e/ρ): arc from the receiver crown to the datum generatrix. */
    check(`${id}: Cota X' = rho*asin(e/rho)`, near(r.cotaXMm, rho * Math.asin(r.datumOffsetMm / rho), 1e-9));
    /* Absolute crown arc of each station: Cota X' − picajeX = ρ·asin(x/ρ), x = kernel sectionCoordinateMm. */
    let maxErr = 0;
    for (const st of r.stations) {
      const abs = receiverCrownArcMm(r, st.index);
      maxErr = Math.max(maxErr, Math.abs(abs - rho * Math.asin(st.sectionCoordinateMm / rho)));
    }
    check(`${id}: F. crown arc = Cota X' - picajeX = rho*asin(x/rho) for all stations`, maxErr < 1e-9, maxErr.toExponential(2));
    /* Direction: + picajeX ⇔ station on the TOP side (x < e). */
    check(`${id}: picajeX sign = toward TOP when x < e`, r.stations.every(st => (st.picajeXMm > 1e-9) === (st.sectionCoordinateMm < r.datumOffsetMm - 1e-9)));
    /* picajeX is the true receiver arc between generatrices (cylinder → isometric). */
    check(`${id}: picajeX is an arc length on the receiver (|picajeX| <= rho*pi/2)`, r.stations.every(st => Math.abs(st.picajeXMm) <= rho * Math.PI / 2 + 1e-9));
  }
  /* EJE symmetry: crown passes through the origin; template is mirror-symmetric in X. */
  const eje = refResults.get('EJE')!;
  check('EJE: Cota X\' = 0 → crown line coincides with X = 0', near(eje.cotaXMm, 0, 1e-12));
  check('EJE: template mirror symmetric (P_k vs P_{N-k})', eje.stations.slice(1, 12).every((st, k) => near(st.picajeXMm, -eje.stations[24 - (k + 1)].picajeXMm, 1e-9) && near(st.picajeYMm, eje.stations[24 - (k + 1)].picajeYMm, 1e-9)));
  /* BOP/TOP: crown lands at ±41.343 mm. They are NOT mirror images: the elbow seats at a different
     receiver height (e = ±39.7), so the axial profile differs — the template must follow the kernel. */
  const bop = refResults.get('BOP')!;
  const top = refResults.get('TOP')!;
  check('BOP: crown at X = +41.343 (crown on the TOP side of the datum generatrix)', near(bop.cotaXMm, 41.343, 5e-4) && bop.cotaXMm > 0);
  check('TOP: crown at X = -41.343', near(top.cotaXMm, -41.343, 5e-4));
  check('BOP/TOP: same P1 (psi = 0 lies on the bend plane for both), different axial profile elsewhere', near(bop.stations[0].picajeYMm, top.stations[0].picajeYMm, 1e-9) && !near(bop.stations[6].picajeYMm, top.stations[6].picajeYMm, 1e-3) && bop.stations[6].clampedAtElbowEnd !== top.stations[6].clampedAtElbowEnd);
}

/* ═══ 2. Receiver template: physical coordinates (§20 A–E, N) ═══ */
for (const { id } of DATUMS) {
  const r = refResults.get(id)!;
  const t = buildElbowOnPipeReceiverTemplate(r, { meta: receiverMeta(id) })!;
  check(`receiver ${id}: built`, !!t);
  const N = r.stations.length - 1;
  check(`receiver ${id}: A/B. pointsMm = kernel (picajeX, picajeY) verbatim`, t.pointsMm.every((p, i) => p[0] === r.stations[i].picajeXMm && p[1] === r.stations[i].picajeYMm));
  check(`receiver ${id}: receiverTemplatePoint = kernel`, r.stations.every((st, i) => { const p = receiverTemplatePoint(r, i); return p[0] === st.picajeXMm && p[1] === st.picajeYMm; }));
  check(`receiver ${id}: C. closure point = P1 point`, near(t.pointsMm[N][0], t.pointsMm[0][0], 1e-9) && near(t.pointsMm[N][1], t.pointsMm[0][1], 1e-9));
  check(`receiver ${id}: single page for A4`, t.tiles.length === t.pagesX * t.pagesY && t.pagesX === 1);
  /* E/N: plotted mm on the page = kernel mm + constant offset per page (1 mm/mm, no scale). */
  for (const tile of t.tiles) {
    const marks = [...stationAttr(tile.svg, 'circle'), ...stationAttr(tile.svg, 'polygon')];
    let ok = marks.length > 0;
    const offs: [number, number][] = [];
    for (const m of marks) {
      const i = Number(m['data-template-station']);
      const st = r.stations[i];
      ok &&= near(Number(m['data-picaje-x-mm']), st.picajeXMm, 5e-4) && near(Number(m['data-picaje-y-mm']), st.picajeYMm, 5e-4)
        && near(Number(m['data-crown-arc-mm']), receiverCrownArcMm(r, i), 5e-4) && m['data-clamped'] === String(st.clampedAtElbowEnd);
      const px = m.cx !== undefined ? Number(m.cx) : Number(m.points!.split(' ')[0].split(',')[0]);
      const py = m.cy !== undefined ? Number(m.cy) : Number(m.points!.split(' ')[0].split(',')[1]) + (i === 0 ? 1.8 : 1.3);
      offs.push([px - st.picajeXMm, py + st.picajeYMm]);
    }
    const [ox, oy] = offs[0];
    check(`receiver ${id} p${tile.pageIndex}: E. every station mark at 1 mm/mm (constant offset, Y up)`, ok && offs.every(([a, b]) => near(a, ox, 2e-3) && near(b, oy, 2e-3)));
    check(`receiver ${id} p${tile.pageIndex}: D. contour polygon lists N stations in kernel order and closes on station 0`, (() => {
      const poly = elements(tile.svg, 'polygon', 'data-picaje-contour')[0];
      if (!poly) return false;
      const pts = poly.points.split(' ').map(s => s.split(',').map(Number));
      return pts.length === N && poly['data-closes-on'] === '0' && pts.every((p, i) => near(p[0] - r.stations[i].picajeXMm, ox, 2e-3));
    })());
    /* Datum generatrix X = 0 and crown reference lines carry kernel values. */
    const crown = elements(tile.svg, 'line', 'data-reference="crown"')[0];
    check(`receiver ${id} p${tile.pageIndex}: F. crown line at X = Cota X'`, !!crown && near(Number(crown['data-cota-x-mm']), r.cotaXMm, 5e-4) && near(Number(crown.x1) - r.cotaXMm, ox, 2e-3));
    const datumLine = elements(tile.svg, 'line', 'data-reference="datum-generatrix"')[0];
    check(`receiver ${id} p${tile.pageIndex}: datum generatrix line at X = 0`, !!datumLine && near(Number(datumLine.x1), ox, 2e-3));
    /* Clamped stations → diamonds; end-face line at Y = R. */
    const clamped = r.stations.slice(0, N).filter(s => s.clampedAtElbowEnd).length;
    check(`receiver ${id} p${tile.pageIndex}: clamped stations drawn as diamonds (${clamped})`, stationAttr(tile.svg, 'polygon').length === clamped);
    if (clamped > 0) {
      const ef = elements(tile.svg, 'line', 'data-reference="end-face"')[0];
      check(`receiver ${id} p${tile.pageIndex}: end-face line at Y = R = 114.3`, !!ef && near(Number(ef['data-picaje-y-mm']), REF.elbowCentrelineRadiusMm, 5e-4));
    }
    check(`receiver ${id} p${tile.pageIndex}: N. no transform/scale in SVG`, !/transform=|scale\(/.test(tile.svg) && tile.svg.includes('viewBox="0 0 297 210"') && tile.svg.includes('width="297mm"'));
    check(`receiver ${id} p${tile.pageIndex}: 1:1 flag + title + print policy`, tile.svg.includes('data-template-1to1="true"') && tile.svg.includes('PICAJE TEMPLATE 1:1 - RECEIVER TUBE') && tile.svg.includes('PRINT AT 100% / ACTUAL SIZE') && tile.svg.includes('P1<') && tile.svg.includes(`P${N}<`));
  }
  /* H/I/M: PDF MediaBox, calibration bar in points, deterministic bytes. */
  const pdf = toPdf(t.tiles);
  const pdf2 = toPdf(buildElbowOnPipeReceiverTemplate(r, { meta: receiverMeta(id) })!.tiles);
  const boxes = pdfMediaBoxes(pdf);
  check(`receiver ${id}: H. A4 MediaBox 297x210 mm in pt, one per page`, boxes.length === t.tiles.length && pdfPages(pdf) === t.tiles.length && boxes.every(b => near(b[2], 297 * MM2PT, 0.01) && near(b[3], 210 * MM2PT, 0.01)));
  check(`receiver ${id}: I. 100 mm calibration bar = 100*72/25.4 pt on every page`, pdfHorizontalSegments(pdf).filter(s => near(Math.abs(s.x2 - s.x1), RECEIVER_TEMPLATE_CALIBRATION_MM * MM2PT, 1e-3)).length >= t.tiles.length);
  check(`receiver ${id}: M. deterministic PDF bytes`, Buffer.compare(Buffer.from(pdf), Buffer.from(pdf2)) === 0);
  /* The hole chord P7–P19 on paper equals the kernel arc difference exactly (cylinder → isometric in X). */
  check(`receiver ${id}: paper |X(P7) - X(P19)| = kernel arc difference (isometric)`, near(Math.abs(t.pointsMm[6][0] - t.pointsMm[18][0]), Math.abs(r.stations[6].picajeXMm - r.stations[18].picajeXMm), 1e-12));
}

/* ═══ 3. Receiver: Y' invariance (§6, §20 G) ═══ */
for (const { id } of DATUMS) {
  const r = refResults.get(id)!;
  const a = buildElbowOnPipeReceiverTemplate(r, { meta: receiverMeta(id) })!;
  const b = buildElbowOnPipeReceiverTemplate(r, { meta: receiverMeta(id), yPrimeMm: 100 })!;
  check(`receiver ${id}: G. Y'=100 → same tile count / domain / overlap`, a.tiles.length === b.tiles.length && a.pagesX === b.pagesX && a.pagesY === b.pagesY
    && a.xMinMm === b.xMinMm && a.xMaxMm === b.xMaxMm && a.yMinMm === b.yMinMm && a.yMaxMm === b.yMaxMm && a.overlapMm === b.overlapMm);
  check(`receiver ${id}: G. Y'=100 → identical physical points and crown arcs`, a.pointsMm.every((p, i) => p[0] === b.pointsMm[i][0] && p[1] === b.pointsMm[i][1]) && a.crownArcMm.every((v, i) => v === b.crownArcMm[i]) && a.crownXMm === b.crownXMm);
  const geomOnly = (svg: string) => [...elements(svg, 'polygon'), ...elements(svg, 'circle'), ...elements(svg, 'line')].map(e => JSON.stringify(e)).join('|');
  check(`receiver ${id}: G. Y'=100 → identical contour, marks and reference lines in SVG`, a.tiles.every((t, k) => geomOnly(t.svg) === geomOnly(b.tiles[k].svg)));
  check(`receiver ${id}: G. Y'=100 → only annotation changes (Cota Y' = 100 present, 'not set' absent)`, b.tiles[0].svg.includes("Cota Y' = 100 mm") && b.tiles[0].svg.includes('data-external-cota-y-mm="100"') && !b.tiles[0].svg.includes('not set') && a.tiles[0].svg.includes('not set') && !a.tiles[0].svg.includes('data-external-cota-y-mm'));
  check(`receiver ${id}: G. Y'=100 → identical PDF MediaBoxes`, JSON.stringify(pdfMediaBoxes(toPdf(a.tiles))) === JSON.stringify(pdfMediaBoxes(toPdf(b.tiles))));
}

/* ═══ 4. Receiver: paper formats, tiling, overlap, registration (§13, §16, §20 H–L) ═══ */
for (const f of PDF_PAGE_FORMATS) {
  const r = refResults.get('BOP')!;
  const t = buildElbowOnPipeReceiverTemplate(r, { format: f.id, meta: receiverMeta('BOP') })!;
  const pdf = toPdf(t.tiles);
  check(`receiver BOP ${f.id}: MediaBox = ${f.widthMm}x${f.heightMm} mm`, pdfMediaBoxes(pdf).every(b => near(b[2], f.widthMm * MM2PT, 0.01) && near(b[3], f.heightMm * MM2PT, 0.01)));
  check(`receiver BOP ${f.id}: geometry independent of paper`, t.pointsMm.every((p, i) => p[0] === r.stations[i].picajeXMm && p[1] === r.stations[i].picajeYMm) && t.widthMm === buildElbowOnPipeReceiverTemplate(r, { meta: receiverMeta('BOP') })!.widthMm);
  check(`receiver BOP ${f.id}: calibration bar 100 mm on each page`, pdfHorizontalSegments(pdf).filter(s => near(Math.abs(s.x2 - s.x1), 100 * MM2PT, 1e-3)).length >= t.tiles.length);
}
{
  /* Large case: forces X and Y tiling on A4; single column on A1. */
  for (const f of ['A4', 'A1'] as PdfPageFormatId[]) {
    const page = getPdfPageFormat(f);
    const usableW = pdfFormatUsableWidthMm(page);
    const usableH = page.heightMm - RECEIVER_TEMPLATE_CONTENT_TOP_MM - RECEIVER_TEMPLATE_BOTTOM_BAND_MM;
    const t = buildElbowOnPipeReceiverTemplate(bigResult, { format: f, meta: receiverMeta('EJE') })!;
    const contentW = t.widthMm + 2 * RECEIVER_TEMPLATE_PAD_MM;
    const contentH = t.heightMm + 2 * RECEIVER_TEMPLATE_PAD_MM;
    check(`receiver BIG ${f}: domain ${t.widthMm.toFixed(1)} x ${t.heightMm.toFixed(1)} mm tiles ${t.pagesX}x${t.pagesY}`, t.tiles.length === t.pagesX * t.pagesY && (f === 'A4' ? t.pagesX >= 2 && t.pagesY >= 2 : t.pagesX === 1));
    check(`receiver BIG ${f}: J. X coverage (additive overlap)`, (t.pagesX - 1) * (usableW - t.overlapMm) + usableW >= contentW - 1e-9);
    check(`receiver BIG ${f}: J. Y coverage`, (t.pagesY - 1) * (usableH - t.overlapMm) + usableH >= contentH - 1e-9);
    check(`receiver BIG ${f}: K. overlap = 15 mm`, t.overlapMm === RECEIVER_TEMPLATE_OVERLAP_MM);
    /* Every physical station appears on at least one tile; tile origins step by usable−overlap. */
    const seen = new Set<string>();
    for (const tile of t.tiles) for (const m of [...stationAttr(tile.svg, 'circle'), ...stationAttr(tile.svg, 'polygon')]) seen.add(m['data-template-station']);
    check(`receiver BIG ${f}: every station P1..P${BIG.divisions} on some tile`, seen.size === BIG.divisions);
    check(`receiver BIG ${f}: deterministic tile origins`, t.tiles.every(tile => near(tile.originXMm, t.xMinMm - RECEIVER_TEMPLATE_PAD_MM + tile.pageCol * (usableW - t.overlapMm), 1e-9)));
    /* L: registration marks on interior edges only. */
    check(`receiver BIG ${f}: L. registration marks on shared edges`, t.tiles.every(tile => {
      const n = elements(tile.svg, 'circle', 'data-registration').length;
      const expect = (tile.pageCol > 0 ? 1 : 0) + (tile.pageCol < t.pagesX - 1 ? 1 : 0) + (tile.pageRow > 0 ? 1 : 0) + (tile.pageRow < t.pagesY - 1 ? 1 : 0);
      return n === expect;
    }));
    /* Clipping: no drawn segment escapes the usable window (no geometry leaks outside overlap). */
    check(`receiver BIG ${f}: clipped segments stay inside the usable window`, t.tiles.every(tile => elements(tile.svg, 'line', 'data-seg').every(l => [+l.x1, +l.x2].every(x => x >= page.safeMarginMm - 1e-6 && x <= page.widthMm - page.safeMarginMm + 1e-6) && [+l.y1, +l.y2].every(y => y >= RECEIVER_TEMPLATE_CONTENT_TOP_MM - 1e-6 && y <= page.heightMm - RECEIVER_TEMPLATE_BOTTOM_BAND_MM + 1e-6))));
    const pdf = toPdf(t.tiles);
    check(`receiver BIG ${f}: pages + MediaBox + calibration on every page`, pdfPages(pdf) === t.tiles.length && pdfMediaBoxes(pdf).every(b => near(b[2], page.widthMm * MM2PT, 0.01)) && pdfHorizontalSegments(pdf).filter(s => near(Math.abs(s.x2 - s.x1), 100 * MM2PT, 1e-3)).length >= t.tiles.length);
    check(`receiver BIG ${f}: page numbering 1..${t.tiles.length}`, t.tiles.every((tile, k) => tile.pageIndex === k && tile.svg.includes(`Page ${k + 1}/${t.tiles.length}`) && tile.svg.includes(`X ${tile.pageCol + 1}/${t.pagesX} · Y ${tile.pageRow + 1}/${t.pagesY}`)));
  }
  /* Station appearing on two tiles must be the same physical point (overlap duplicate only). */
  const t4 = buildElbowOnPipeReceiverTemplate(bigResult, { format: 'A4', meta: receiverMeta('EJE') })!;
  const byStation = new Map<string, Set<string>>();
  for (const tile of t4.tiles) for (const m of [...stationAttr(tile.svg, 'circle'), ...stationAttr(tile.svg, 'polygon')]) {
    const k = m['data-template-station'];
    if (!byStation.has(k)) byStation.set(k, new Set());
    byStation.get(k)!.add(`${m['data-picaje-x-mm']},${m['data-picaje-y-mm']}`);
  }
  check('receiver BIG A4: duplicated stations across tiles carry identical physical mm', [...byStation.values()].every(s => s.size === 1));
}
/* Invalid geometry → null (no misleading sheet). */
{
  const bad = computeElbowOnPipe({ ...REF, receiverOuterDiameterMm: 60, datum: { type: 'EJE' } });
  check('invalid: elbow exceeds receiver → kernel invalid', !bad.valid);
  check('invalid: receiver template returns null', buildElbowOnPipeReceiverTemplate(bad, { meta: receiverMeta('EJE') }) === null);
  check('invalid: marking guide returns null', buildElbowOnPipeMarkingGuide(bad, { meta: guideMeta('EJE') }) === null);
}

/* ═══ 5. Elbow marking guide (§7–§11, §21) ═══ */
for (const { id } of DATUMS) {
  const r = refResults.get(id)!;
  const g = buildElbowOnPipeMarkingGuide(r, { meta: guideMeta(id) })!;
  const N = r.stations.length - 1;
  check(`guide ${id}: built, A4 single strip page`, !!g && g.stripPagesX === 1 && g.tablePages === 0 && g.tiles.length === 1);
  check(`guide ${id}: A. strip length = pi*d.ex = 279.288`, near(g.stripLengthMm, Math.PI * REF.elbowOuterDiameterMm, 1e-9) && g.stripLengthMm === r.circumferenceMm);
  check(`guide ${id}: B. Div = pi*d.ex/N`, near(g.stationSpacingMm, Math.PI * REF.elbowOuterDiameterMm / N, 1e-9) && g.stationSpacingMm === r.stationSpacingMm);
  check(`guide ${id}: C. P positions = arcPositionMm = k*Div, closure at pi*d.ex`, g.stripPositionsMm.every((p, k) => p === r.stations[k].arcPositionMm && near(p, k * g.stationSpacingMm, 1e-9)) && near(g.stripPositionsMm[N], g.stripLengthMm, 1e-9));
  const svg = g.tiles[0].svg;
  const ticks = elements(svg, 'line', 'data-strip-station');
  check(`guide ${id}: strip ticks for P1..P${N} + closure at 1 mm/mm`, ticks.length === N + 1 && (() => { const x0 = Number(ticks[0].x1); return ticks.every(t => near(Number(t.x1) - x0, Number(t['data-arc-position-mm']), 2e-3)); })() && ticks[N]['data-closure'] === 'true');
  const stripRect = elements(svg, 'rect', 'data-strip-length-mm')[0];
  check(`guide ${id}: strip rect labelled 1:1 with pi*d.ex`, !!stripRect && stripRect['data-od-strip-1to1'] === 'true' && near(Number(stripRect['data-strip-length-mm']), g.stripLengthMm, 5e-4));
  /* Table traces to U5.1 verbatim (D, E, F, G, I). */
  const cells = elements(svg, 'text', 'data-table-station');
  const rows = new Map<number, string[]>();
  for (const c of cells) { const i = Number(c['data-table-station']); if (!rows.has(i)) rows.set(i, []); }
  const cellText = (i: number, col: number) => { const m = new RegExp(`<text data-table-station="${i}" data-col="${col}"[^>]*>([^<]*)</text>`).exec(svg); return m ? m[1] : null; };
  const f3 = (v: number) => Number(v.toFixed(3)).toString();
  check(`guide ${id}: I. table has N+1 rows`, rows.size === N + 1);
  check(`guide ${id}: table psi column = angleDeg`, r.stations.every((st, i) => cellText(i, 1) === f3(st.angleDeg)));
  check(`guide ${id}: table OD pos = arcPositionMm`, r.stations.every((st, i) => cellText(i, 2) === f3(st.arcPositionMm)));
  check(`guide ${id}: E. table R arc = arcRadiusMm`, r.stations.every((st, i) => cellText(i, 3) === f3(st.arcRadiusMm)));
  check(`guide ${id}: D. table L arc = arcLengthMm`, r.stations.every((st, i) => cellText(i, 4) === f3(st.arcLengthMm)));
  check(`guide ${id}: F. table t = bendAngleDeg`, r.stations.every((st, i) => cellText(i, 5) === f3(st.bendAngleDeg)));
  check(`guide ${id}: G. clamped rows marked '90 END', others '-'`, r.stations.every((st, i) => cellText(i, 6) === (st.clampedAtElbowEnd ? '90 END' : '-')));
  check(`guide ${id}: H. every clamped station has t = 90 and L arc = R arc * pi/2`, r.stations.filter(s => s.clampedAtElbowEnd).every(s => near(s.bendAngleDeg, 90, 1e-9) && near(s.arcLengthMm, s.arcRadiusMm * Math.PI / 2, 1e-9)));
  check(`guide ${id}: data-clamped attribute on table cells = kernel flag`, cells.every(c => c['data-clamped'] === String(r.stations[Number(c['data-table-station'])].clampedAtElbowEnd)));
  check(`guide ${id}: closure row labelled '360 = P1' and equals station 0 values`, cellText(N, 0) === '360 = P1' && cellText(N, 3) === cellText(0, 3) && cellText(N, 4) === cellText(0, 4));
  /* J/L: wording */
  check(`guide ${id}: J. not a flat template flags + L. NOT TO SCALE`, svg.includes('data-flat-cut-template="false"') && svg.includes('NOT A 1:1 FLAT CUT TEMPLATE') && svg.includes('SCHEMATIC - NOT TO SCALE') && svg.includes('OD DIVISION STRIP 1:1') && !svg.includes('data-template-1to1="true"'));
  check(`guide ${id}: no transform/scale`, !/transform=|scale\(/.test(svg));
  /* PDF */
  const pdf = toPdf(g.tiles);
  const pdf2 = toPdf(buildElbowOnPipeMarkingGuide(r, { meta: guideMeta(id) })!.tiles);
  check(`guide ${id}: A4 MediaBox + 100 mm bar + deterministic`, pdfMediaBoxes(pdf).every(b => near(b[2], 297 * MM2PT, 0.01) && near(b[3], 210 * MM2PT, 0.01)) && pdfHorizontalSegments(pdf).filter(s => near(Math.abs(s.x2 - s.x1), ELBOW_GUIDE_CALIBRATION_MM * MM2PT, 1e-3)).length >= g.tiles.length && Buffer.compare(Buffer.from(pdf), Buffer.from(pdf2)) === 0);
  /* Strip is 1-D (developable): P positions are exact OD arc lengths, independent of datum. */
  check(`guide ${id}: strip identical to EJE strip (datum does not move OD divisions)`, g.stripPositionsMm.every((p, k) => p === buildElbowOnPipeMarkingGuide(refResults.get('EJE')!, { meta: guideMeta('EJE') })!.stripPositionsMm[k]));
  /* Y' invariance */
  const gy = buildElbowOnPipeMarkingGuide(r, { meta: guideMeta(id), yPrimeMm: 100 })!;
  const geomOnly = (s: string) => [...elements(s, 'line'), ...elements(s, 'rect'), ...elements(s, 'polygon'), ...elements(s, 'circle'), ...elements(s, 'text', 'data-table-station')].map(e => JSON.stringify(e)).join('|');
  check(`guide ${id}: Y'=100 → identical strip/table/geometry, only annotation`, g.tiles.length === gy.tiles.length && geomOnly(g.tiles[0].svg) === geomOnly(gy.tiles[0].svg) && gy.tiles[0].svg.includes("Cota Y' = 100 mm") && !g.tiles[0].svg.includes("Cota Y' = 100"));
}
/* Torus non-developability: Gaussian curvature at the extrados > 0 → no isometric flat development exists. */
{
  const r = REF.elbowOuterDiameterMm / 2;
  const K = 1 / (r * (REF.elbowCentrelineRadiusMm + r));
  check('elbow surface: Gaussian curvature K = 1/(r(R+r)) > 0 → flat 1:1 cut template impossible', K > 1e-6, K.toExponential(3));
}
/* Large case: strip tiles in X, table continues, all 49 rows. */
{
  for (const f of ['A4', 'A3'] as PdfPageFormatId[]) {
    const page = getPdfPageFormat(f);
    const usableW = pdfFormatUsableWidthMm(page);
    const g = buildElbowOnPipeMarkingGuide(bigResult, { format: f, meta: guideMeta('EJE') })!;
    check(`guide BIG ${f}: strip = pi*323.8 = ${(Math.PI * 323.8).toFixed(2)} mm, pages ${g.stripPagesX}+${g.tablePages}`, near(g.stripLengthMm, Math.PI * 323.8, 1e-9) && (f === 'A4' ? g.stripPagesX >= 4 : g.stripPagesX >= 3));
    check(`guide BIG ${f}: strip coverage with 15 mm overlap`, (g.stripPagesX - 1) * (usableW - g.overlapMm) + usableW >= g.stripLengthMm + 8 - 1e-9 && g.overlapMm === 15);
    check(`guide BIG ${f}: registration marks on strip pages`, g.tiles.filter(t => t.kind === 'strip').every(t => elements(t.svg, 'circle', 'data-registration').length === (t.stripCol > 0 ? 1 : 0) + (t.stripCol < g.stripPagesX - 1 ? 1 : 0)));
    const seen = new Set<string>();
    for (const t of g.tiles) for (const tick of elements(t.svg, 'line', 'data-strip-station')) seen.add(tick['data-strip-station']);
    check(`guide BIG ${f}: all P1..P48 + closure ticks appear across strip pages`, seen.size === 49);
    const rowsSeen = new Set(g.tiles.flatMap(t => elements(t.svg, 'text', 'data-table-station').map(a => a['data-table-station'])));
    check(`guide BIG ${f}: all 49 table rows present across pages`, rowsSeen.size === 49);
    check(`guide BIG ${f}: tick offsets are deterministic per page (1 mm/mm)`, g.tiles.filter(t => t.kind === 'strip').every(t => {
      const ticks = elements(t.svg, 'line', 'data-strip-station');
      if (ticks.length < 2) return true;
      const d0 = Number(ticks[0].x1) - Number(ticks[0]['data-arc-position-mm']);
      return ticks.every(k => near(Number(k.x1) - Number(k['data-arc-position-mm']), d0, 2e-3));
    }));
    const pdf = toPdf(g.tiles);
    check(`guide BIG ${f}: pages, MediaBox, bar on every page`, pdfPages(pdf) === g.tiles.length && pdfMediaBoxes(pdf).every(b => near(b[2], page.widthMm * MM2PT, 0.01)) && pdfHorizontalSegments(pdf).filter(s => near(Math.abs(s.x2 - s.x1), 100 * MM2PT, 1e-3)).length >= g.tiles.length);
  }
}

/* ═══ 6. Terminology contract (§22) ═══ */
const FORBIDDEN = ['ELBOW CUT TEMPLATE 1:1', 'ELBOW FLAT TEMPLATE 1:1', '1:1 TORUS DEVELOPMENT', 'FLAT CUT TEMPLATE 1:1 -', 'elbow cut template 1:1 (PDF)'];
const ALLOWED_RECEIVER = ['PICAJE TEMPLATE 1:1 - RECEIVER TUBE'];
const ALLOWED_GUIDE = ['ELBOW MARKING GUIDE', 'OD DIVISION STRIP 1:1', 'SCHEMATIC - NOT TO SCALE', 'NOT A 1:1 FLAT CUT TEMPLATE'];

/* ═══ 7. Final-PDF text safety across 11 locales (§17) ═══ */
const LOCALES = ['en', 'es', 'de', 'fr', 'it', 'nl', 'pt', 'ro', 'pl', 'bg', 'uk'] as const;
const NON_LATIN1 = new Set(['ro', 'pl', 'bg', 'uk']);
const localeDict = new Map<string, Record<string, unknown>>();
for (const lng of LOCALES) {
  localeDict.set(lng, JSON.parse(readFileSync(new URL(`../app/frontend/src/i18n/locales/${lng}.json`, import.meta.url), 'utf8')) as Record<string, unknown>);
}
const translator = (lng: string) => (key: string): string => {
  let node: unknown = localeDict.get(lng);
  for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
  if (typeof node !== 'string') throw new Error(`missing i18n key ${lng}:${key}`);
  return node;
};
const labelsFor = (lng: string, datumLabel: string) => buildElbowOnPipePdfLabels({
  translate: translator(lng), datumLabel,
  elbowLabel: '3" Sch 40 · OD 88.9 mm · ID 77.92 mm · R 114.3 mm',
  receiverLabel: '6" · D 168.3 mm',
});
for (const lng of LOCALES) {
  const recQ: number[] = [];
  const guideQ: number[] = [];
  let forbiddenHit = '';
  for (const { id } of DATUMS) {
    const r = refResults.get(id)!;
    const labels = labelsFor(lng, id);
    const recPdf = toPdf(buildElbowOnPipeReceiverTemplate(r, { format: 'A4', meta: labels.receiver, yPrimeMm: id === 'EJE' ? 100 : null })!.tiles);
    const guidePdf = toPdf(buildElbowOnPipeMarkingGuide(r, { format: 'A4', meta: labels.guide })!.tiles);
    recQ.push(qmarks(recPdf));
    guideQ.push(qmarks(guidePdf));
    const txt = pdfText(recPdf) + '\n' + pdfText(guidePdf);
    for (const f of FORBIDDEN) if (txt.toUpperCase().includes(f.toUpperCase())) forbiddenHit = `${id}: ${f}`;
    if (!/[^\x00-\xff]/.test(txt) === false) forbiddenHit = `${id}: non-latin1 leftover`;
  }
  const bigLabels = labelsFor(lng, 'EJE');
  const bigRec = toPdf(buildElbowOnPipeReceiverTemplate(bigResult, { format: 'A4', meta: bigLabels.receiver })!.tiles);
  const bigGuide = toPdf(buildElbowOnPipeMarkingGuide(bigResult, { format: 'A4', meta: bigLabels.guide })!.tiles);
  check(`pdf ${lng}: receiver template PDFs contain zero '?' (5 datums + BIG)`, recQ.every(q => q === 0) && qmarks(bigRec) === 0, `${recQ.join(',')} | big ${qmarks(bigRec)}`);
  check(`pdf ${lng}: marking guide PDFs contain zero '?' (5 datums + BIG)`, guideQ.every(q => q === 0) && qmarks(bigGuide) === 0, `${guideQ.join(',')} | big ${qmarks(bigGuide)}`);
  check(`pdf ${lng}: localized exactly when PDF-encodable`, labelsFor(lng, 'EJE').localized === !NON_LATIN1.has(lng));
  check(`pdf ${lng}: no forbidden terminology`, forbiddenHit === '', forbiddenHit);
}
/* English sheets: required labels present in the FINAL PDF text. */
const REQUIRED_RECEIVER = ['PICAJE TEMPLATE 1:1 - RECEIVER TUBE', 'CODO-TUBO', 'PRINT AT 100% / ACTUAL SIZE',
  'VERIFY THE 100 mm CALIBRATION BAR BEFORE MARKING OR CUTTING', 'hole reference = elbow ID', "Cota X' =", "Cota Y'", 'N = 24', 'Div =',
  'P1', 'P24', 'X = 0', 'Y = 0', 'toward TOP', 'toward BOP', 'receiver crown', '100 mm', 'Page 1/'];
const REQUIRED_GUIDE = ['ELBOW MARKING GUIDE', 'CODO-TUBO', 'NOT A 1:1 FLAT CUT TEMPLATE', 'OD DIVISION STRIP 1:1', 'SCHEMATIC - NOT TO SCALE',
  'PRINT AT 100% / ACTUAL SIZE', 'VERIFY THE 100 mm CALIBRATION BAR BEFORE MARKING OR CUTTING', 'elbow cut reference = elbow OD',
  'pi x d.ex = 279.288', 'Div = 11.637', 'R arc mm', 'L arc mm', '90 END', '360° = P1', 'P1', 'P24', 'Longitud arco', '100 mm'];
for (const { id } of DATUMS) {
  const r = refResults.get(id)!;
  const labels = labelsFor('en', id);
  const recTxt = pdfText(toPdf(buildElbowOnPipeReceiverTemplate(r, { format: 'A4', meta: labels.receiver, yPrimeMm: 100 })!.tiles));
  const missingR = REQUIRED_RECEIVER.filter(l => !recTxt.includes(l));
  check(`pdf receiver ${id}: required labels present`, missingR.length === 0, missingR.join(' | '));
  check(`pdf receiver ${id}: "Cota Y' = 100 mm" annotated, no '?'`, recTxt.includes("Cota Y' = 100 mm") && !recTxt.includes('?'));
  check(`pdf receiver ${id}: allowed terminology, no forbidden`, ALLOWED_RECEIVER.every(a => recTxt.includes(a)) && FORBIDDEN.every(f => !recTxt.toUpperCase().includes(f.toUpperCase())) && !recTxt.includes('MARKING GUIDE'));
  const guideTxt = pdfText(toPdf(buildElbowOnPipeMarkingGuide(r, { format: 'A4', meta: labels.guide })!.tiles));
  const missingG = REQUIRED_GUIDE.filter(l => !guideTxt.includes(l));
  check(`pdf guide ${id}: required labels present`, missingG.length === 0, missingG.join(' | '));
  check(`pdf guide ${id}: allowed terminology, no forbidden, no '?'`, ALLOWED_GUIDE.every(a => guideTxt.includes(a)) && FORBIDDEN.every(f => !guideTxt.toUpperCase().includes(f.toUpperCase())) && !guideTxt.includes('?') && !guideTxt.includes('TEMPLATE 1:1 - RECEIVER'));
  check(`pdf guide ${id}: Omega never printed as a glyph (REF O)`, !/[\u03a9\u03c9]/.test(guideTxt) && guideTxt.includes('REF O'));
  /* Labels do not move geometry: stub-meta vs localized-meta tiles are geometrically identical. */
  const stub = buildElbowOnPipeReceiverTemplate(r, { format: 'A4', meta: receiverMeta(id) })!;
  const loc = buildElbowOnPipeReceiverTemplate(r, { format: 'A4', meta: labels.receiver })!;
  check(`pdf receiver ${id}: labels do not move geometry`, stub.tiles.length === loc.tiles.length && stub.pointsMm.every((p, i) => p[0] === loc.pointsMm[i][0] && p[1] === loc.pointsMm[i][1]) && JSON.stringify(pdfMediaBoxes(toPdf(stub.tiles))) === JSON.stringify(pdfMediaBoxes(toPdf(loc.tiles))));
}
{
  const fb = labelsFor('bg', 'TOP');
  const fbRec = pdfText(toPdf(buildElbowOnPipeReceiverTemplate(refResults.get('TOP')!, { format: 'A4', meta: fb.receiver })!.tiles));
  const fbGuide = pdfText(toPdf(buildElbowOnPipeMarkingGuide(refResults.get('TOP')!, { format: 'A4', meta: fb.guide })!.tiles));
  check('pdf bg: ASCII English fallback sheets, fully legible', fb.localized === false && !fbRec.includes('?') && !fbGuide.includes('?') && REQUIRED_RECEIVER.every(l => fbRec.includes(l)) && REQUIRED_GUIDE.every(l => fbGuide.includes(l)));
  const es = labelsFor('es', 'TOP');
  const esGuide = pdfText(toPdf(buildElbowOnPipeMarkingGuide(refResults.get('TOP')!, { format: 'A4', meta: es.guide })!.tiles));
  check('pdf es: localized sheet (not the English fallback), no \'?\'', es.localized === true && !esGuide.includes('?') && !esGuide.includes('ELBOW MARKING GUIDE (elbow -> tube)'));
  /* i18n source strings themselves must not carry the forbidden terminology in any locale. */
  let hit = '';
  for (const lng of LOCALES) {
    const block = (localeDict.get(lng) as { tools: { elbowOnPipe: Record<string, string> } }).tools.elbowOnPipe;
    for (const [k, v] of Object.entries(block)) for (const f of FORBIDDEN) if (v.toUpperCase().includes(f.toUpperCase())) hit = `${lng}.${k}`;
  }
  check('i18n: no locale string uses forbidden elbow-template terminology', hit === '', hit);
}

console.log(`\nelbow-on-pipe physical outputs: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
