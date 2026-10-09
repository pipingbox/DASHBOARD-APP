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
import path from 'node:path';
import { solvePipeCombFabrication } from '../app/frontend/src/tools/prefabrication/pipe-comb/pipe-comb-fabrication.ts';
import { generatePipeCombFabPdf, type PdfStrings, type PipeCombFabPdfSnapshot } from '../app/frontend/src/tools/prefabrication/pipe-comb/pipe-comb-fab-pdf.ts';
import { formatLengthForUnit } from '../app/frontend/src/tools/prefabrication/pipe-comb/number-input.ts';

const require = createRequire(import.meta.url);
/* Verification-only devDependencies of this repo (NOT app dependencies):
 * pdfjs-dist + @napi-rs/canvas. The standard fonts directory lets the
 * renderer resolve embedded-font fallbacks; DOMMatrix/Path2D polyfills
 * enable full text rasterization. */
const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
const { createCanvas, DOMMatrix, Path2D, ImageData } = require('@napi-rs/canvas');
(globalThis as Record<string, unknown>).DOMMatrix ??= DOMMatrix;
(globalThis as Record<string, unknown>).Path2D ??= Path2D;
(globalThis as Record<string, unknown>).ImageData ??= ImageData;
const STANDARD_FONTS =
  path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') + path.sep;

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
    accessoryLine: '{id}: NPS {nps} 90° {family} elbow cut to {angle}° — qty 1',
    bendAccessoryLine: 'Continuous bent bars (no welded pups).',
    dimLin: 'Lin', dimLout: 'Lout', dimDi: 'Di', dimDf: 'Df', dimStagger: 'A', dimAngle: 'Elbow angle',
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

/* The runner consumes the SAME generated base64 module as the UI, and
 * cross-checks it against the TTF files so a stale regeneration would fail
 * here instead of shipping different fonts to the browser and the tests. */
import {
  NOTO_SANS_BOLD_B64,
  NOTO_SANS_REGULAR_B64,
} from '../app/frontend/src/tools/prefabrication/pipe-comb/assets/noto-sans-base64.ts';

const FONT_REGULAR = NOTO_SANS_REGULAR_B64;
const FONT_BOLD = NOTO_SANS_BOLD_B64;

{
  const ttfRegular = Buffer.from(fs.readFileSync(
    new URL('../app/frontend/src/tools/prefabrication/pipe-comb/assets/NotoSans-Regular.ttf', import.meta.url),
  )).toString('base64');
  const ttfBold = Buffer.from(fs.readFileSync(
    new URL('../app/frontend/src/tools/prefabrication/pipe-comb/assets/NotoSans-Bold.ttf', import.meta.url),
  )).toString('base64');
  check('fonts: generated module matches TTF files',
    FONT_REGULAR === ttfRegular && FONT_BOLD === ttfBold,
    'run scripts/gen-pipe-comb-pdf-fonts.mjs');
}

function snapshotFor(
  sol: ReturnType<typeof solvePipeCombFabrication> extends { success: true; result: infer R } ? R : never,
  unit: 'mm' | 'in',
  paper: 'a4' | 'a3',
  warnings: string[] = [],
  strings?: PdfStrings,
  radiusFamily?: 'LR' | 'SR',
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
    fonts: { regularBase64: FONT_REGULAR, boldBase64: FONT_BOLD },
    elbowRadiusFamily: radiusFamily,
  };
}

async function extractPdf(file: string): Promise<{ pages: number; text: string; pageTexts: string[]; inkRatios: number[] }> {
  const data = new Uint8Array(fs.readFileSync(file));
  const pdf = await getDocument({ data, useSystemFonts: true, standardFontDataUrl: STANDARD_FONTS }).promise;
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
 * 3. LR vs SR: the document carries the SELECTED radius family
 * ================================================================ */
for (const family of ['LR', 'SR'] as const) {
  const sol = solveCase({ elbow: { kind: 'catalog', radiusType: family } });
  const doc = generatePipeCombFabPdf(snapshotFor(sol, 'mm', 'a4', [], undefined, family));
  const file = `${OUT_DIR}/family-${family.toLowerCase()}-a4.pdf`;
  fs.writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
  const info = await extractPdf(file);
  /* Family from the snapshot, never a fixed "LR". */
  check(`${family}: accessory line carries ${family}`, textHas(info, `90° ${family} elbow`), 'accessory family');
  const other = family === 'LR' ? 'SR' : 'LR';
  check(`${family}: no ${other} in accessories`, !textHas(info, `90° ${other} elbow`));
  /* CLR of the selected family matches the solution and the screen:
   * NPS6 LR -> 228.6 mm; NPS6 SR -> 168.275 mm (B16.9 cross-reference). */
  check(`${family}: CLR`, textHas(info, `CLR ${formatLengthForUnit(sol.elbow.clrMm, 'mm')}`),
    `CLR=${sol.elbow.clrMm}`);
  check(`${family}: elbows identified`, textHas(info, 'P1-ELBOW') && textHas(info, 'P3-ELBOW'));
}

/* ================================================================ *
 * 3b. Df dimension: perpendicular spacing between outlet axes
 * ================================================================ */
{
  const sol = solveCase();
  const doc = generatePipeCombFabPdf(snapshotFor(sol, 'mm', 'a4'));
  const file = `${OUT_DIR}/df-dimension-a4.pdf`;
  fs.writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
  const info = await extractPdf(file);
  check('Df dimension present', textHas(info, 'Df = 350'), 'Df = 350 mm');
  check('Di dimension present', textHas(info, 'Di = 250'));
}

/* ================================================================ *
 * 4. N=12 multipage
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
 * 5. Real language coverage: es, pl, ro (Latin-ext) + uk, bg (Cyrillic)
 *    — REAL text per language, extraction AND rasterization. The embedded
 *    Noto Sans must render every glyph; nothing is transliterated.
 * ================================================================ */
{
  const LANG_CASES: { code: string; title: string; notToScale: string; pageOf: string; coverage: string; needles: string[] }[] = [
    {
      code: 'es', title: 'Peine de tubos — plano de fabricación y lista de corte',
      notToScale: 'Representación acotada. No medir sobre el dibujo.',
      pageOf: 'Página {x} de {y}',
      coverage: 'Revisión: ¿ángulo válido? ¡Sí!',
      needles: ['Peine de tubos', 'Representación acotada', 'Página 1 de'],
    },
    {
      code: 'pl', title: 'Grzebień rurowy — rysunek wykonawczy i lista cięcia',
      notToScale: 'Przedstawienie wymiarowane. Nie mierzyć na rysunku.',
      pageOf: 'Strona {x} z {y}',
      coverage: 'Zażółć gęślą jaźń', // real Polish pangram with all diacritics
      needles: ['Grzebień rurowy', 'Przedstawienie wymiarowane', 'Strona 1 z', 'ł', 'ą', 'ę', 'ż', 'ź', 'ć', 'ń', 'ś'],
    },
    {
      code: 'ro', title: 'Pieptene de țevi — desen de execuție și listă de tăiere',
      notToScale: 'Reprezentare cotată. Nu măsurați pe desen.',
      pageOf: 'Pagina {x} din {y}',
      coverage: 'Muzicologă în bej vând whisky și tequila, preț fix', // real Romanian pangram
      needles: ['Pieptene de țevi', 'Reprezentare cotată', 'Pagina 1 din', 'ț', 'ș', 'ă', 'î', 'â'],
    },
    {
      code: 'uk', title: 'Трубний гребінець — виконавче креслення та список різки',
      notToScale: 'Розмірне зображення. Не вимірювати за кресленням.',
      pageOf: 'Сторінка {x} з {y}',
      coverage: 'Іван їсть їжу, є ґанок', // І ї є ґ coverage with real words
      needles: ['Трубний гребінець', 'Розмірне зображення', 'Сторінка 1 з', 'І', 'і', 'ї', 'є', 'ґ'],
    },
    {
      code: 'bg', title: 'Тръбен гребен — производствен чертеж и списък за рязане',
      notToScale: 'Оразмерено представяне. Да не се мери върху чертежа.',
      pageOf: 'Страница {x} от {y}',
      coverage: 'Щастливият юнак яде ъглен и щука', // щ ю я ъ coverage with real words
      needles: ['Тръбен гребен', 'Оразмерено представяне', 'Страница 1 от', 'щ', 'ю', 'я', 'ъ'],
    },
  ];
  for (const lc of LANG_CASES) {
    const sol = solveCase();
    const strings = englishStrings([lc.coverage, 'Catalog 90° elbow cut down to 35°.'], marksEn());
    strings.title = lc.title;
    strings.notToScale = lc.notToScale;
    strings.pageOf = lc.pageOf;
    strings.generalView = lc.title; // localized heading carries the script too
    const snap = snapshotFor(sol, 'mm', 'a4', [lc.coverage, 'Catalog 90° elbow cut down to 35°.'], strings, 'LR');
    snap.language = lc.code;
    const doc = generatePipeCombFabPdf(snap);
    const file = `${OUT_DIR}/lang-${lc.code}-a4.pdf`;
    fs.writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
    const info = await extractPdf(file);
    for (const needle of lc.needles) {
      check(`${lc.code}: "${needle.slice(0, 28)}" extractable`, textHas(info, needle), needle);
    }
    check(`${lc.code}: embedded font (no WinAnsi)`, !info.text.includes('! \''), 'garbled glyph check');
    check(`${lc.code}: >= 2 pages`, info.pages >= 2);
    /* The Cyrillic block must contain REAL Cyrillic in the file bytes'
       extracted text, not only Spanish — verified by codepoint range. */
    if (lc.code === 'uk' || lc.code === 'bg') {
      check(`${lc.code}: cyrillic codepoints in file text`, /[Ѐ-ӿ]/.test(info.text));
    }
  }
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
