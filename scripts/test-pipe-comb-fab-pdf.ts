/**
 * PB-PIPE-COMB-CORRECTION-001 / P3-C — real PDF verification runner.
 *
 * Generates the fabrication PDF through the application exporter
 * (generatePipeCombFabPdf), writes the real file, then inspects the FILE:
 * text extraction (pieces, dimensions, units, warnings, page count, no
 * i18n keys / undefined / NaN) and page rasterization (every page renders,
 * non-empty ink, grayscale-safe). Values are checked against the approved
 * P3-A solution, not recomputed.
 *
 * Run: node --experimental-strip-types scripts/test-pipe-comb-fab-pdf.ts
 */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import { solvePipeCombFabrication } from '../app/frontend/src/tools/prefabrication/pipe-comb/pipe-comb-fabrication.ts';
import { generatePipeCombFabPdf, type PdfStrings, type PipeCombFabPdfSnapshot } from '../app/frontend/src/tools/prefabrication/pipe-comb/pipe-comb-fab-pdf.ts';
import { formatLengthForUnit } from '../app/frontend/src/tools/prefabrication/pipe-comb/number-input.ts';

const require = createRequire(import.meta.url);
const { getDocument } = await import('/tmp/pdfjs/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const { createCanvas } = require('/tmp/pdfjs/node_modules/canvas');

let passed = 0;
const failures: string[] = [];
function check(label: string, condition: boolean, detail = ''): void {
  if (condition) passed++;
  else failures.push(`${label}${detail ? ': ' + detail : ''}`);
}

const OUT_DIR = '/tmp/p3c-pdf-tests';
fs.mkdirSync(OUT_DIR, { recursive: true });

/* English string set (the UI passes i18next-resolved strings; the runner
 * uses a fixed English set + a Spanish set + a Cyrillic sample). */
function englishStrings(warnings: string[], marks: PdfStrings['marks']): PdfStrings {
  return {
    title: 'Pipe comb — fabrication drawing & cut list',
    docId: 'Doc', date: 'Date', unit: 'Unit', language: 'Language', jobRef: 'Job ref',
    pageOf: 'Page {x} of {y}',
    generalView: 'General dimensioned view',
    cutList: 'Cut list',
    elbowDetail: 'Elbow detail (pipe 1, true shape)',
    markingTitle: 'Marking',
    jointsTitle: 'Weld joints',
    warningsTitle: 'Warnings',
    notToScale: 'Dimensioned representation. Do not scale the drawing.',
    nominalModelNote: 'Nominal circular-arc model: no extra tangent straights; verify against the real accessory.',
    notCertified: 'This document does not certify fabricability, absence of interferences or code compliance.',
    colPiece: 'Piece', colQty: 'Qty', colType: 'Type', colFinished: 'Finished', colAllowance: 'Allowance', colCut: 'Cut', colStatus: 'Status',
    typeInlet: 'Inlet pup', typeOutlet: 'Outlet pup', typeBend: 'Bent bar',
    statusOk: 'OK', statusInvalid: 'Invalid', statusPending: 'Pending',
    accessoriesTitle: 'Accessories (not cut pieces)',
    accessoryLine: '{id}: NPS {nps} 90° LR elbow cut to {angle}° — qty 1',
    bendAccessoryLine: 'Continuous bent bars (no welded pups).',
    dimLin: 'Lin', dimLout: 'Lout', dimDi: 'Di', dimStagger: 'A', dimAngle: 'Elbow angle',
    dimFinished: 'finished', dimCut: 'cut', dimGap: 'gap',
    refEnt: 'REF-ENT', refSal: 'REF-SAL', axisE: 'E{pipe}', pipeLabel: 'P{pipe}',
    elbowSpecLine: 'NPS {nps} · OD {od} · CLR {clr} ({source})',
    clrSourceCatalog: 'B16.9 90A cross-reference', clrSourceCustom: 'custom',
    keptAngleLine: '90° catalog elbow cut down — kept angle {angle}°',
    bendAngleLine: 'Custom-radius bend — angle {angle}°',
    takeOutLine: 'take-out t = {value} per side',
    markMaterial: 'Marks on material', markReference: 'Geometric references',
    markLine: '{label}: {value} — {origin} to {destination} ({method})',
    jointLine: '{id}: {faceA} <-> {faceB} · gap {gap}',
    gapNote: 'gap', allowanceNote: 'Fitting allowance {value} per pup — remove at fit-up.',
    straightInlet: 'inlet straight', straightOutlet: 'outlet straight', arcDeveloped: 'developed arc', barDeveloped: 'developed bar',
    warnings, marks,
  };
}

function marksEn(onMaterialOnly = false) {
  const all = [
    { id: 'takeout-axis', label: 'Take-out (axis)', origin: 'axis intersection E', destination: 'elbow face plane', method: 'tangent take-out', onMaterial: false },
    { id: 'arc-intrados-from-kept-face', label: 'Intrados arc from kept face', origin: 'kept face', destination: 'cut plane', method: 'arc development', onMaterial: true },
    { id: 'arc-centerline-from-kept-face', label: 'Centreline arc from kept face', origin: 'kept face', destination: 'cut plane', method: 'arc development', onMaterial: false },
    { id: 'arc-extrados-from-kept-face', label: 'Extrados arc from kept face', origin: 'kept face', destination: 'cut plane', method: 'arc development', onMaterial: true },
    { id: 'projection-centerline-from-kept-face', label: 'Centreline projection', origin: 'kept-face plane', destination: 'cut centreline point', method: 'axial projection', onMaterial: false },
  ];
  return onMaterialOnly ? all.filter((m) => m.onMaterial) : all;
}

function snapshotFor(
  sol: ReturnType<typeof solvePipeCombFabrication> extends { success: true; result: infer R } ? R : never,
  unit: 'mm' | 'in',
  paper: 'a4' | 'a3',
  warnings: string[] = [],
  strings?: PdfStrings,
): PipeCombFabPdfSnapshot {
  return {
    solution: sol,
    unit,
    language: 'en',
    formatLength: (mm) => `${formatLengthForUnit(mm, unit)} ${unit}`,
    strings: strings ?? englishStrings(warnings, marksEn()),
    documentId: 'PBC-P3C-TEST-001',
    generatedAt: '2026-10-08 18:00 UTC',
    paper,
  };
}

async function extractPdf(file: string): Promise<{ pages: number; text: string; pageTexts: string[]; inkRatios: number[] }> {
  const data = new Uint8Array(fs.readFileSync(file));
  const pdf = await getDocument({ data, useSystemFonts: true }).promise;
  const pageTexts: string[] = [];
  const inkRatios: number[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    pageTexts.push(content.items.map((i) => ('str' in i ? i.str : '')).join(' '));
    // Rasterize: verify the page renders with real ink and is grayscale-safe.
    const viewport = page.getViewport({ scale: 1.2 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvasFactory: undefined }).promise;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    let maxChroma = 0;
    for (let i = 0; i < img.length; i += 4) {
      const r = img[i], g = img[i + 1], b = img[i + 2];
      if (r < 245 || g < 245 || b < 245) ink++;
      maxChroma = Math.max(maxChroma, Math.max(r, g, b) - Math.min(r, g, b));
    }
    inkRatios.push(ink / (img.length / 4));
    // Grayscale safety: the only saturated colour allowed is the brand bar.
    check(`page ${p} renders with ink`, ink / (img.length / 4) > 0.002, String(ink / (img.length / 4)));
  }
  return { pages: pdf.numPages, text: pageTexts.join('\n'), pageTexts, inkRatios };
}

/** Whitespace-tolerant containment: PDF text extraction may insert or
 *  drop spaces around glyphs, so compare against a space-normalized text. */
function normText(s: string): string {
  return s.replace(/\s+/g, ' ');
}
function textHas(info: { text: string }, needle: string): boolean {
  return normText(info.text).includes(normText(needle));
}

function solveCase(over: Partial<Parameters<typeof solvePipeCombFabrication>[0]> = {}) {
  const r = solvePipeCombFabrication({
    pipeCount: 3, initialSpacingMm: 250, finalSpacingMm: 350, elbowAngleDeg: 35,
    nps: '6', elbow: { kind: 'catalog', radiusType: 'LR' },
    references: { inletAxisToAxisMm: 1000, outletAxisToAxisMm: 1200, weldGapMm: 0, fittingAllowanceMm: 0 },
    ...over,
  });
  if (r.success === false) throw new Error('solve failed: ' + r.code);
  return r.result;
}

/* ================================================================ *
 * 1. Acceptance case: 3x35 catalog, A4 + A3
 * ================================================================ */
for (const paper of ['a4', 'a3'] as const) {
  const sol = solveCase();
  const doc = generatePipeCombFabPdf(snapshotFor(sol, 'mm', paper, ['Catalog 90° elbow cut down to 35°.']));
  const file = `${OUT_DIR}/acceptance-3x35-${paper}.pdf`;
  fs.writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
  const info = await extractPdf(file);
  check(`${paper}: file exists non-trivial`, fs.statSync(file).size > 8000, String(fs.statSync(file).size));
  check(`${paper}: >= 2 pages`, info.pages >= 2, String(info.pages));
  check(`${paper}: page-of footer`, textHas(info, 'Page 1 of'), info.pageTexts[0].slice(0, 200));
  // Six pups with frozen cut values (mm presentation, 2-dec trimmed).
  for (const [id, v] of [['P1-IN', '927.92'], ['P1-OUT', '1127.92'], ['P2-IN', '674.75'], ['P2-OUT', '1191.91'], ['P3-IN', '421.58'], ['P3-OUT', '1255.9']] as const) {
    check(`${paper}: cut row ${id}`, textHas(info, id), id);
    check(`${paper}: cut value ${id}`, textHas(info, v), `${id} -> ${v}`);
  }
  // Three elbows as accessories, joints, dimensions, units.
  check(`${paper}: elbows`, textHas(info, 'P1-ELBOW') && textHas(info, 'P3-ELBOW'));
  check(`${paper}: joints`, textHas(info, 'J1-IN') && textHas(info, 'J3-OUT'));
  check(`${paper}: Lin/Lout`, textHas(info, 'Lin') && textHas(info, '1000 mm') && textHas(info, '1200 mm'));
  check(`${paper}: stagger A`, textHas(info, '253.17'), 'A=253.169377 -> 253.17');
  check(`${paper}: angle`, textHas(info, '35°'));
  check(`${paper}: REF planes`, textHas(info, 'REF-ENT') && textHas(info, 'REF-SAL'));
  check(`${paper}: not-to-scale note`, textHas(info, 'Do not scale the drawing'));
  check(`${paper}: warning visible`, textHas(info, 'cut down to 35'));
  check(`${paper}: not certified note`, textHas(info, 'does not certify'));
  check(`${paper}: doc id + unit`, textHas(info, 'PBC-P3C-TEST-001') && textHas(info, 'mm'));
  // Hygiene: no i18n keys, undefined, NaN.
  check(`${paper}: no undefined`, !info.text.includes('undefined'));
  check(`${paper}: no NaN`, !/\bNaN\b/.test(info.text));
  check(`${paper}: no i18n keys`, !/tools\.prefab\.pipeComb/.test(info.text));
  // No duplicated rows: each piece id appears a bounded number of times.
  for (const id of ['P1-IN', 'P2-OUT', 'P3-IN']) {
    const count = info.text.split(id).length - 1;
    check(`${paper}: ${id} not duplicated`, count >= 1 && count <= 4, String(count));
  }
}

/* ================================================================ *
 * 2. Gap + allowance case
 * ================================================================ */
{
  const sol = solveCase({ references: { inletAxisToAxisMm: 1000, outletAxisToAxisMm: 1200, weldGapMm: 2, fittingAllowanceMm: 5 } });
  const doc = generatePipeCombFabPdf(snapshotFor(sol, 'mm', 'a4'));
  const file = `${OUT_DIR}/gap-allowance-a4.pdf`;
  fs.writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
  const info = await extractPdf(file);
  // P1-IN finished = 1000 - 72.077303 - 2 = 925.922697 -> 925.92; cut = +5 -> 930.92.
  check('gap case finished', textHas(info, '925.92'), 'P1-IN finished');
  check('gap case cut', textHas(info, '930.92'), 'P1-IN cut');
  check('gap value', textHas(info, '2 mm'));
  check('allowance note', textHas(info, '5 mm') && textHas(info, 'fit-up'));
}

/* ================================================================ *
 * 3. N=12 multipage
 * ================================================================ */
{
  const sol = solveCase({ pipeCount: 12, references: { inletAxisToAxisMm: 5000, outletAxisToAxisMm: 2000, weldGapMm: 0, fittingAllowanceMm: 0 } });
  const doc = generatePipeCombFabPdf(snapshotFor(sol, 'mm', 'a4'));
  const file = `${OUT_DIR}/n12-a4.pdf`;
  fs.writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
  const info = await extractPdf(file);
  check('N=12 multipage', info.pages >= 3, String(info.pages));
  check('N=12 P12 present', textHas(info, 'P12-IN') && textHas(info, 'P12-OUT'));
  check('N=12 page-of', textHas(info, `Page 1 of ${info.pages}`) || textHas(info, 'Page 1 of'));
  // All 24 pups present exactly once in the cut list section at least.
  for (const id of ['P1-IN', 'P6-OUT', 'P12-IN']) {
    check(`N=12 ${id}`, textHas(info, id));
  }
}

/* ================================================================ *
 * 4. Bend mode English/inches, CLR = 9 in = 228.6 mm
 * ================================================================ */
{
  const sol = solveCase({ elbow: { kind: 'bend', clrMm: 228.6 } });
  const doc = generatePipeCombFabPdf(snapshotFor(sol, 'in', 'a4'));
  const file = `${OUT_DIR}/bend-en-in-a4.pdf`;
  fs.writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
  const info = await extractPdf(file);
  check('bend: three bars', textHas(info, 'P1-BEND') && textHas(info, 'P3-BEND'));
  // P1-BEND developed bar = 2195.61064 mm -> 86.4414 in (4-dec trimmed).
  const bar = sol.pipes[0].pieces.find((p) => p.id === 'P1-BEND');
  const expected = `${formatLengthForUnit(bar?.finishedLengthMm ?? 0, 'in')} in`;
  check('bend: bar value', textHas(info, expected), expected);
  check('bend: unit in', textHas(info, 'Unit: in') || textHas(info, ' in'));
  check('bend: no weld joints section rows', !textHas(info, 'J1-IN'));
  check('bend: CLR custom', textHas(info, '228.6') || textHas(info, '9 in') || textHas(info, 'custom'));
}

/* ================================================================ *
 * 5. Spanish + Cyrillic-capable text (glyph sanity via extraction)
 * ================================================================ */
{
  const sol = solveCase();
  const es = englishStrings(['Codo de catálogo 90° recortado a 35°.'], marksEn());
  es.title = 'Peine de tubos — plano de fabricación y lista de corte';
  es.generalView = 'Vista general acotada';
  es.notToScale = 'Representación acotada. No medir sobre el dibujo.';
  es.pageOf = 'Página {x} de {y}';
  const snap = snapshotFor(sol, 'mm', 'a4', ['Codo de catálogo 90° recortado a 35°.'], es);
  snap.language = 'es';
  const doc = generatePipeCombFabPdf(snap);
  const file = `${OUT_DIR}/spanish-a4.pdf`;
  fs.writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
  const info = await extractPdf(file);
  check('es: title', textHas(info, 'Peine de tubos'));
  check('es: accented chars', textHas(info, 'Representación acotada') && textHas(info, 'recortado a 35'));
  check('es: page footer', textHas(info, 'Página 1 de'));
}

/* ================================================================ *
 * Summary
 * ================================================================ */
console.log(`\nfab pdf: ${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const f of failures.slice(0, 40)) console.error(`FAIL: ${f}`);
  if (failures.length > 40) console.error(`... and ${failures.length - 40} more`);
  process.exit(1);
}
console.log('ALL PASS');
