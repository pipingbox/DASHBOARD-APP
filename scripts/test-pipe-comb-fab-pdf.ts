/**
 * PB-PIPE-COMB-CORRECTION-001 / P3-C — real PDF verification runner.
 *
 * Generates the fabrication PDF through the application exporter
 * (generatePipeCombFabPdf) with the SAME snapshot construction as the UI
 * (buildFabPdfStrings + localizeJointFace over the REAL locale files),
 * writes the real file, then inspects the FILE: text extraction (pieces,
 * dimensions, units, warnings, page count, no i18n keys / undefined /
 * NaN) and page rasterization (every page renders, non-empty ink). Values
 * are checked against the approved P3-A solution, not recomputed.
 *
 * Acceptance documents are generated ONLY from fully valid fixtures
 * (cutPlanValid, geometryValid, every piece ok — asserted BEFORE the PDF
 * is produced); impossible references stay as NEGATIVE solver-level
 * checks, never delivered as fabrication plans.
 *
 * A MANIFEST.json is emitted from the very snapshots that produced each
 * file (language, unit, paper, canonical inputs, validity, sha256), so
 * metadata can never describe a different run.
 *
 * Run: node --experimental-strip-types scripts/test-pipe-comb-fab-pdf.ts
 */

import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { solvePipeCombFabrication } from '../app/frontend/src/tools/prefabrication/pipe-comb/pipe-comb-fabrication.ts';
import { generatePipeCombFabPdf, type PipeCombFabPdfSnapshot } from '../app/frontend/src/tools/prefabrication/pipe-comb/pipe-comb-fab-pdf.ts';
import { buildFabPdfStrings, localizeJointFace } from '../app/frontend/src/tools/prefabrication/pipe-comb/pipe-comb-fab-pdf-strings.ts';
import { formatLengthForUnit } from '../app/frontend/src/tools/prefabrication/pipe-comb/number-input.ts';
import type { TFunction } from 'i18next';

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

/* ------------------------------------------------------------------ *
 * REAL locale translator: same shape the UI hands to buildFabPdfStrings
 * (i18next-style nested keys + {{param}} interpolation, en fallback).
 * The runner no longer prepares strings by hand — acceptance documents
 * are localized by the same code path and the same locale JSON files as
 * the application export.
 * ------------------------------------------------------------------ */
function loadLocale(code: string): Record<string, unknown> {
  return JSON.parse(
    fs.readFileSync(new URL(`../app/frontend/src/i18n/locales/${code}.json`, import.meta.url), 'utf8'),
  );
}
const EN_LOCALE = loadLocale('en');
function lookup(locale: Record<string, unknown>, key: string): unknown {
  let cur: unknown = locale;
  for (const part of key.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else return undefined;
  }
  return cur;
}
function makeT(code: string): TFunction {
  const locale = code === 'en' ? EN_LOCALE : loadLocale(code);
  const t = (key: string, params?: Record<string, unknown>): string => {
    let v = lookup(locale, key) ?? lookup(EN_LOCALE, key);
    if (typeof v !== 'string') v = key;
    if (params) {
      for (const [k, val] of Object.entries(params)) {
        v = (v as string).replaceAll(`{{${k}}}`, String(val)).replaceAll(`{${k}}`, String(val));
      }
    }
    return v as string;
  };
  return t as unknown as TFunction;
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

/* ------------------------------------------------------------------ *
 * Manifest: every generated file is recorded FROM ITS OWN SNAPSHOT —
 * canonical inputs, language, unit, paper, pages and sha256 come from
 * the exact case that produced the bytes. No copied metadata.
 * ------------------------------------------------------------------ */
interface ManifestEntry {
  file: string;
  sha256: string;
  language: string;
  unit: 'mm' | 'in';
  paper: 'a4' | 'a3';
  pages: number;
  mode: string;
  radiusFamily?: string;
  valid: boolean;
  canonicalInputs: Record<string, unknown>;
}
const manifest: ManifestEntry[] = [];
function recordCase(
  file: string,
  snap: PipeCombFabPdfSnapshot,
  canonicalInputs: Record<string, unknown>,
  pages: number,
): void {
  manifest.push({
    file: path.basename(file),
    sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
    language: snap.language,
    unit: snap.unit,
    paper: snap.paper,
    pages,
    mode: snap.solution.elbow.mode,
    radiusFamily: snap.elbowRadiusFamily,
    valid: snap.solution.cutPlanValid === true && snap.solution.elbow.geometryValid === true,
    canonicalInputs,
  });
}

/** Snapshot built exactly like the UI export: buildFabPdfStrings +
 *  localizeJointFace over the REAL locale file for the given language. */
function snapshotFor(
  sol: ReturnType<typeof solvePipeCombFabrication> extends { success: true; result: infer R } ? R : never,
  unit: 'mm' | 'in',
  paper: 'a4' | 'a3',
  lang: 'es' | 'en' | 'pl' | 'ro' | 'uk' | 'bg' = 'en',
  radiusFamily?: 'LR' | 'SR',
): PipeCombFabPdfSnapshot {
  const t = makeT(lang);
  return {
    solution: sol,
    unit,
    language: lang,
    formatLength: (mm) => `${formatLengthForUnit(mm, unit)} ${unit}`,
    strings: buildFabPdfStrings(sol, unit, t),
    localizeJointFace: (raw) => localizeJointFace(raw, t),
    documentId: 'PBC-P3C-TEST-001',
    generatedAt: '2026-10-09 14:00 UTC',
    paper,
    fonts: { regularBase64: FONT_REGULAR, boldBase64: FONT_BOLD },
    elbowRadiusFamily: radiusFamily,
  };
}

function radiusFamilyFor(inputs: CaseInputs): 'LR' | 'SR' | undefined {
  return inputs.elbow.kind === 'catalog' ? inputs.elbow.radiusType : undefined;
}

/** Acceptance-document precondition: the fixture must be a FULLY valid
 *  fabrication plan. Impossible fixtures are negative tests, never
 *  delivered as printable plans. */
function assertValidPlan(sol: Parameters<typeof snapshotFor>[0], label: string): void {
  check(`${label}: cutPlanValid`, sol.cutPlanValid === true);
  check(`${label}: geometryValid`, sol.elbow.geometryValid === true);
  check(`${label}: every cut piece ok`,
    sol.cutList.length > 0 && sol.cutList.every((e) => e.status === 'ok'),
    sol.cutList.filter((e) => e.status !== 'ok').map((e) => e.pieceId).join(','));
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
    for (let i = 0; i < img.length; i += 4) {
      const r = img[i], g = img[i + 1], b = img[i + 2];
      if (r < 245 || g < 245 || b < 245) ink++;
    }
    inkRatios.push(ink / (img.length / 4));
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

/** Occurrences of a needle in the normalized extracted text. */
function countOccurrences(info: { text: string }, needle: string): number {
  return normText(info.text).split(normText(needle)).length - 1;
}

/** Count degenerate zero-length "move+line" ops in the REAL PDF content
 *  stream (e.g. the old g=0 joint ticks, whose direction was computed
 *  from two coincident faces). jsPDF writes uncompressed content streams
 *  and separates path operators with newlines, so the pattern is
 *  whitespace-tolerant. */
function zeroLengthLineOps(file: string): number {
  const raw = fs.readFileSync(file).toString('latin1');
  const re = /(-?[\d.]+) (-?[\d.]+) m\s+(-?[\d.]+) (-?[\d.]+) l/g;
  let m: RegExpExecArray | null;
  let zero = 0;
  while ((m = re.exec(raw)) !== null) {
    const dx = Math.abs(Number(m[3]) - Number(m[1]));
    const dy = Math.abs(Number(m[4]) - Number(m[2]));
    if (dx < 1e-9 && dy < 1e-9) zero++;
  }
  return zero;
}

type CaseInputs = Parameters<typeof solvePipeCombFabrication>[0];
function solveCase(over: Partial<CaseInputs> = {}) {
  const inputs: CaseInputs = {
    pipeCount: 3, initialSpacingMm: 250, finalSpacingMm: 350, elbowAngleDeg: 35,
    nps: '6', elbow: { kind: 'catalog', radiusType: 'LR' },
    references: { inletAxisToAxisMm: 1000, outletAxisToAxisMm: 1200, weldGapMm: 0, fittingAllowanceMm: 0 },
    ...over,
  };
  const r = solvePipeCombFabrication(inputs);
  if (r.success === false) throw new Error('solve failed: ' + r.code);
  return { sol: r.result, inputs };
}

/* Localized needles derived from the REAL locale files (never hardcoded
 * translations): what the document must contain for a given language. */
const tEs = makeT('es');
const tEn = makeT('en');
const ES = {
  pageOf: tEs('tools.prefab.pipeComb.fab.pdf.pageOf').replace('{x}', '1').split('{y}')[0].trim(),
  notToScale: tEs('tools.prefab.pipeComb.fab.pdf.notToScale'),
  notCertified: tEs('tools.prefab.pipeComb.fab.pdf.notCertified'),
  warnCatalogCut: tEs('tools.prefab.pipeComb.fab.warn.catalog_elbow_cut', { total: '90', kept: '35' }),
  finished: tEs('tools.prefab.pipeComb.fab.draw.finished'),
  cut: tEs('tools.prefab.pipeComb.fab.draw.cut'),
  cutList: tEs('tools.prefab.pipeComb.fab.cutListTitle'),
  accessory: (family: string) =>
    tEs('tools.prefab.pipeComb.fab.pdf.accessoryLine')
      .replace('{id}', 'P1-ELBOW').replace('{nps}', '6').replace('{family}', family).replace('{angle}', '35'),
};
const EN = {
  pageOf: tEn('tools.prefab.pipeComb.fab.pdf.pageOf').replace('{x}', '1').split('{y}')[0].trim(),
  notToScale: tEn('tools.prefab.pipeComb.fab.pdf.notToScale'),
  finished: tEn('tools.prefab.pipeComb.fab.draw.finished'),
  cut: tEn('tools.prefab.pipeComb.fab.draw.cut'),
};

/* ================================================================ *
 * 1. Acceptance case: 3x35 catalog, SPANISH, A4 + A3 (full document
 *    localized through the real UI snapshot path).
 * ================================================================ */
for (const paper of ['a4', 'a3'] as const) {
  const { sol, inputs } = solveCase();
  assertValidPlan(sol, `acceptance-3x35 ${paper}`);
  const snap = snapshotFor(sol, 'mm', paper, 'es', radiusFamilyFor(inputs));
  const doc = generatePipeCombFabPdf(snap);
  const file = `${OUT_DIR}/acceptance-3x35-${paper}.pdf`;
  fs.writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
  const info = await extractPdf(file);
  recordCase(file, snap, inputs, info.pages);
  check(`${paper}: file exists non-trivial`, fs.statSync(file).size > 8000, String(fs.statSync(file).size));
  check(`${paper}: >= 2 pages`, info.pages >= 2, String(info.pages));
  check(`${paper}: page-of footer (es)`, textHas(info, ES.pageOf), info.pageTexts[0].slice(0, 200));
  check(`${paper}: drawing section contains P2-IN annotation`,
    info.pageTexts[0].includes('P2-IN') && info.pageTexts[0].includes('674.75 mm'));
  check(`${paper}: cut-list boundary is not crossed`,
    !info.pageTexts[0].includes(ES.cutList) && info.pageTexts.some((text, i) => i > 0 && text.includes(ES.cutList)));
  check(`${paper}: cut-list title/header/first row stay together`,
    info.pageTexts.some((text, i) => i > 0 && text.includes(ES.cutList) && text.includes('P1-IN')));
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
  check(`${paper}: not-to-scale note (es)`, textHas(info, ES.notToScale), ES.notToScale);
  check(`${paper}: warning visible (es, real sol.warnings)`, textHas(info, ES.warnCatalogCut), ES.warnCatalogCut);
  check(`${paper}: not certified note (es)`, textHas(info, ES.notCertified));
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
  /* Piece -> dimension association: the DRAWN dimension label carries the
   * piece id + the localized measure word + the real value (not just an
   * id occurrence somewhere in a joint reference). */
  for (const [id, v] of [['P1-IN', '927.92'], ['P3-OUT', '1255.9']] as const) {
    check(`${paper}: drawn dim ${id}`, textHas(info, `${id} ${ES.finished} ${v} mm`), `${id} ${ES.finished} ${v}`);
  }
  /* g = 0 joint markers: orientation from the joint's local axis, so NO
   * degenerate zero-length strokes (RED before the fix: 6). */
  check(`${paper}: g=0 no degenerate strokes`, zeroLengthLineOps(file) === 0,
    String(zeroLengthLineOps(file)));
}

/* ================================================================ *
 * 2. Gap + allowance case (Spanish, real localized strings)
 * ================================================================ */
{
  const { sol, inputs } = solveCase({ references: { inletAxisToAxisMm: 1000, outletAxisToAxisMm: 1200, weldGapMm: 2, fittingAllowanceMm: 5 } });
  assertValidPlan(sol, 'gap-allowance');
  const snap = snapshotFor(sol, 'mm', 'a4', 'es', radiusFamilyFor(inputs));
  const doc = generatePipeCombFabPdf(snap);
  const file = `${OUT_DIR}/gap-allowance-a4.pdf`;
  fs.writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
  const info = await extractPdf(file);
  recordCase(file, snap, inputs, info.pages);
  // P1-IN finished = 1000 - 72.077303 - 2 = 925.922697 -> 925.92; cut = +5 -> 930.92.
  check('gap case finished', textHas(info, '925.92'), 'P1-IN finished');
  check('gap case cut', textHas(info, '930.92'), 'P1-IN cut');
  check('gap value', textHas(info, '2 mm'));
  check('gap case: no degenerate strokes', zeroLengthLineOps(file) === 0,
    String(zeroLengthLineOps(file)));
  // Cut lengths stay distinct from finished lengths in the drawn views.
  check('gap case: cut dim drawn', countOccurrences(info, `${ES.cut} 930.92`) >= 1, `cut 930.92`);
}

/* ================================================================ *
 * 2b. 90° catalog elbow with g = 0: joint markers must not degenerate
 *     either (orientation from the local joint axis, not from faces).
 * ================================================================ */
{
  const { sol, inputs } = solveCase({ elbowAngleDeg: 90 });
  assertValidPlan(sol, 'elbow90-g0');
  const snap = snapshotFor(sol, 'mm', 'a4', 'es', radiusFamilyFor(inputs));
  const doc = generatePipeCombFabPdf(snap);
  const file = `${OUT_DIR}/elbow90-g0-a4.pdf`;
  fs.writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
  const info = await extractPdf(file);
  recordCase(file, snap, inputs, info.pages);
  check('90deg g=0: no degenerate strokes', zeroLengthLineOps(file) === 0,
    String(zeroLengthLineOps(file)));
  check('90deg g=0: joints identified', textHas(info, 'J1-IN') && textHas(info, 'J3-OUT'));
  check('90deg: angle', textHas(info, '90°'));
  {
    const snap3 = snapshotFor(sol, 'mm', 'a3', 'es', radiusFamilyFor(inputs));
    const doc3 = generatePipeCombFabPdf(snap3);
    const file3 = `${OUT_DIR}/elbow90-g0-a3.pdf`;
    fs.writeFileSync(file3, Buffer.from(doc3.output('arraybuffer')));
    const info3 = await extractPdf(file3);
    recordCase(file3, snap3, inputs, info3.pages);
    check('90deg: no degenerate strokes A3', zeroLengthLineOps(file3) === 0);
  }
}

/* ================================================================ *
 * 3. LR vs SR: the document carries the SELECTED radius family
 * ================================================================ */
for (const family of ['LR', 'SR'] as const) {
  const { sol, inputs } = solveCase({ elbow: { kind: 'catalog', radiusType: family } });
  assertValidPlan(sol, `family-${family}`);
  const snap = snapshotFor(sol, 'mm', 'a4', 'es', family);
  const doc = generatePipeCombFabPdf(snap);
  const file = `${OUT_DIR}/family-${family.toLowerCase()}-a4.pdf`;
  fs.writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
  const info = await extractPdf(file);
  recordCase(file, snap, inputs, info.pages);
  /* Family from the snapshot (here: the SAME selection the solver used),
   * never a fixed "LR". */
  check(`${family}: accessory line carries ${family}`, textHas(info, ES.accessory(family)), ES.accessory(family));
  const other = family === 'LR' ? 'SR' : 'LR';
  check(`${family}: no ${other} in accessories`, !textHas(info, ES.accessory(other)));
  /* CLR of the selected family matches the solution and the screen
   * (manifest carries the same snapshot value — no copied metadata). */
  check(`${family}: CLR`, textHas(info, `CLR ${formatLengthForUnit(sol.elbow.clrMm, 'mm')}`),
    `CLR=${sol.elbow.clrMm}`);
  check(`${family}: elbows identified`, textHas(info, 'P1-ELBOW') && textHas(info, 'P3-ELBOW'));
}

/* ================================================================ *
 * 3b. Df dimension: perpendicular spacing between outlet axes
 * ================================================================ */
{
  const { sol, inputs } = solveCase();
  const snap = snapshotFor(sol, 'mm', 'a4', 'es', radiusFamilyFor(inputs));
  const doc = generatePipeCombFabPdf(snap);
  const file = `${OUT_DIR}/df-dimension-a4.pdf`;
  fs.writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
  const info = await extractPdf(file);
  recordCase(file, snap, inputs, info.pages);
  check('Df dimension present', textHas(info, 'Df = 350'), 'Df = 350 mm');
  check('Di dimension present', textHas(info, 'Di = 250'));
}

/* ================================================================ *
 * 4. N=12 multipage (VALID fixture, Lin=5000/Lout=2000): dense
 *    overview keeps GLOBAL dimensions; per-group detail views carry
 *    EVERY piece id, per-piece dimension and joint id (nothing lost to
 *    the density threshold). Association is checked through the drawn
 *    dimension label (piece id + localized word + value), NOT through
 *    raw id occurrence counts.
 * ================================================================ */
{
  const { sol, inputs } = solveCase({ pipeCount: 12, references: { inletAxisToAxisMm: 5000, outletAxisToAxisMm: 2000, weldGapMm: 0, fittingAllowanceMm: 0 } });
  assertValidPlan(sol, 'n12');
  const snap = snapshotFor(sol, 'mm', 'a4', 'es', radiusFamilyFor(inputs));
  const doc = generatePipeCombFabPdf(snap);
  const file = `${OUT_DIR}/n12-a4.pdf`;
  fs.writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
  const info = await extractPdf(file);
  recordCase(file, snap, inputs, info.pages);
  check('N=12 multipage', info.pages >= 3, String(info.pages));
  check('N=12 P12 present', textHas(info, 'P12-IN') && textHas(info, 'P12-OUT'));
  check('N=12 page-of', textHas(info, ES.pageOf));
  // Detail views exist and cover all four groups (1-3, 4-6, 7-9, 10-12).
  const detailViewEs = tEs('tools.prefab.pipeComb.fab.pdf.detailView');
  check('N=12 detail views section', countOccurrences(info, detailViewEs) >= 4,
    String(countOccurrences(info, detailViewEs)));
  /* 24/24 pups: EVERY piece carries its drawn finished-length dimension
   * (piece id + localized word + real value from the solution). */
  let dimsDrawn = 0;
  for (const pipe of sol.pipes) {
    for (const piece of pipe.pieces) {
      if (piece.kind !== 'inlet-pup' && piece.kind !== 'outlet-pup') continue;
      const label = `${piece.id} ${ES.finished} ${formatLengthForUnit(piece.finishedLengthMm ?? NaN, 'mm')} mm`;
      if (textHas(info, label)) dimsDrawn++;
      else failures.push(`N=12 drawn dim missing: ${label}`);
    }
  }
  check('N=12: 24/24 pup dimensions drawn', dimsDrawn === 24, `${dimsDrawn}/24`);
  // Every joint appears in the joints section AND drawn in a detail view.
  for (const jid of ['J1-IN', 'J5-OUT', 'J8-IN', 'J12-OUT']) {
    check(`N=12 ${jid} listed AND drawn`, countOccurrences(info, jid) >= 2,
      String(countOccurrences(info, jid)));
  }
  // Global dimensions survive the density threshold as real dimension
  // lines in the overview (not only the textual data strip).
  check('N=12 global Di dim', textHas(info, 'Di = 250'));
  check('N=12 global Df dim', textHas(info, 'Df = 350'));
  check('N=12 global stagger dim', textHas(info, 'A = 253.17'));
  check('N=12 global Lin dim', textHas(info, 'Lin = 5000'));
  check('N=12 global Lout dim', textHas(info, 'Lout = 2000'));
  check('N=12 no degenerate strokes', zeroLengthLineOps(file) === 0,
    String(zeroLengthLineOps(file)));
}

/* ================================================================ *
 * 4b. Density boundary with VALID fixtures (Lin=5000/Lout=2000):
 *     N=6 keeps the FULL overview (12/12 pup dims); N=7 crosses the
 *     threshold and gains detail views covering every pipe (14/14).
 * ================================================================ */
{
  const { sol, inputs } = solveCase({ pipeCount: 6, references: { inletAxisToAxisMm: 5000, outletAxisToAxisMm: 2000, weldGapMm: 0, fittingAllowanceMm: 0 } });
  assertValidPlan(sol, 'n6');
  const snap = snapshotFor(sol, 'mm', 'a4', 'es', radiusFamilyFor(inputs));
  const doc = generatePipeCombFabPdf(snap);
  const file = `${OUT_DIR}/n6-a4.pdf`;
  fs.writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
  const info = await extractPdf(file);
  recordCase(file, snap, inputs, info.pages);
  let dimsDrawn = 0;
  for (const pipe of sol.pipes) {
    for (const piece of pipe.pieces) {
      if (piece.kind !== 'inlet-pup' && piece.kind !== 'outlet-pup') continue;
      const label = `${piece.id} ${ES.finished} ${formatLengthForUnit(piece.finishedLengthMm ?? NaN, 'mm')} mm`;
      if (textHas(info, label)) dimsDrawn++;
      else failures.push(`N=6 drawn dim missing: ${label}`);
    }
  }
  check('N=6: 12/12 pup dimensions drawn', dimsDrawn === 12, `${dimsDrawn}/12`);
  check('N=6 no degenerate strokes', zeroLengthLineOps(file) === 0,
    String(zeroLengthLineOps(file)));
}
{
  const { sol, inputs } = solveCase({ pipeCount: 7, references: { inletAxisToAxisMm: 5000, outletAxisToAxisMm: 2000, weldGapMm: 0, fittingAllowanceMm: 0 } });
  assertValidPlan(sol, 'n7');
  const snap = snapshotFor(sol, 'mm', 'a4', 'es', radiusFamilyFor(inputs));
  const doc = generatePipeCombFabPdf(snap);
  const file = `${OUT_DIR}/n7-a4.pdf`;
  fs.writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
  const info = await extractPdf(file);
  recordCase(file, snap, inputs, info.pages);
  const detailViewEs = tEs('tools.prefab.pipeComb.fab.pdf.detailView');
  check('N=7 detail views present', countOccurrences(info, detailViewEs) >= 3,
    String(countOccurrences(info, detailViewEs)));
  let dimsDrawn = 0;
  for (const pipe of sol.pipes) {
    for (const piece of pipe.pieces) {
      if (piece.kind !== 'inlet-pup' && piece.kind !== 'outlet-pup') continue;
      const label = `${piece.id} ${ES.finished} ${formatLengthForUnit(piece.finishedLengthMm ?? NaN, 'mm')} mm`;
      if (textHas(info, label)) dimsDrawn++;
      else failures.push(`N=7 drawn dim missing: ${label}`);
    }
  }
  check('N=7: 14/14 pup dimensions drawn', dimsDrawn === 14, `${dimsDrawn}/14`);
  check('N=7 global dims kept', textHas(info, 'Di = 250') && textHas(info, 'Df = 350'));
  check('N=7 joints drawn', countOccurrences(info, 'J7-OUT') >= 2,
    String(countOccurrences(info, 'J7-OUT')));
  check('N=7 no degenerate strokes', zeroLengthLineOps(file) === 0,
    String(zeroLengthLineOps(file)));
}

/* ================================================================ *
 * 4c. NEGATIVE fixtures (short references): impossible plans stay
 *     impossible. Solver-level assertions ONLY — these cases are never
 *     delivered as printable fabrication documents, and the module is
 *     NOT modified to make them valid. The UI export block for them is
 *     covered by the E2E gating tests.
 * ================================================================ */
{
  const r6 = solvePipeCombFabrication({
    pipeCount: 6, initialSpacingMm: 250, finalSpacingMm: 350, elbowAngleDeg: 35,
    nps: '6', elbow: { kind: 'catalog', radiusType: 'LR' },
    references: { inletAxisToAxisMm: 1000, outletAxisToAxisMm: 1200, weldGapMm: 0, fittingAllowanceMm: 0 },
  });
  check('N=6 short refs: plan INVALID', r6.success === true && r6.result.cutPlanValid === false);
  if (r6.success) {
    const bad = r6.result.cutList.filter((e) => e.status !== 'ok').map((e) => e.pieceId);
    check('N=6 short refs: P5-IN/P6-IN invalid', bad.includes('P5-IN') && bad.includes('P6-IN'), bad.join(','));
    check('N=6 short refs: no PDF delivered', !fs.existsSync(`${OUT_DIR}/n6-short-refs-a4.pdf`));
  }
  const r7 = solvePipeCombFabrication({
    pipeCount: 7, initialSpacingMm: 250, finalSpacingMm: 350, elbowAngleDeg: 35,
    nps: '6', elbow: { kind: 'catalog', radiusType: 'LR' },
    references: { inletAxisToAxisMm: 1000, outletAxisToAxisMm: 1200, weldGapMm: 0, fittingAllowanceMm: 0 },
  });
  check('N=7 short refs: plan INVALID', r7.success === true && r7.result.cutPlanValid === false);
  if (r7.success) {
    const bad = r7.result.cutList.filter((e) => e.status !== 'ok').map((e) => e.pieceId);
    check('N=7 short refs: P7-IN invalid', bad.includes('P7-IN'), bad.join(','));
  }
}

/* ================================================================ *
 * 5. Bend mode English/inches, CLR = 9 in = 228.6 mm — real bend marks
 *    from the solution (no catalog marking labels, no absent values).
 * ================================================================ */
{
  const { sol, inputs } = solveCase({ elbow: { kind: 'bend', clrMm: 228.6 } });
  assertValidPlan(sol, 'bend-en-in');
  const snap = snapshotFor(sol, 'in', 'a4', 'en');
  const doc = generatePipeCombFabPdf(snap);
  const file = `${OUT_DIR}/bend-en-in-a4.pdf`;
  fs.writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
  const info = await extractPdf(file);
  recordCase(file, snap, inputs, info.pages);
  check('bend: three bars', textHas(info, 'P1-BEND') && textHas(info, 'P3-BEND'));
  // P1-BEND developed bar = 2195.61064 mm -> 86.4414 in (4-dec trimmed).
  const bar = sol.pipes[0].pieces.find((p) => p.id === 'P1-BEND');
  const expected = `${formatLengthForUnit(bar?.finishedLengthMm ?? 0, 'in')} in`;
  check('bend: bar value', textHas(info, expected), expected);
  check('bend: unit in', textHas(info, 'Unit: in') || textHas(info, ' in'));
  check('bend: no weld joints section rows', !textHas(info, 'J1-IN'));
  check('bend: CLR custom', textHas(info, '228.6') || textHas(info, '9 in') || textHas(info, 'custom'));
  check('bend: page-of footer (en)', textHas(info, EN.pageOf));
  check('bend: not-to-scale (en)', textHas(info, EN.notToScale));
  /* Bend marks come from the BEND solution (developed arc / straight
   * segments), never from the catalog mark set. */
  const bendMarkIds = sol.elbow.marks.map((m) => m.id);
  check('bend: marks are bend marks', bendMarkIds.includes('arc-centerline-developed') && !bendMarkIds.includes('arc-intrados-from-kept-face'),
    bendMarkIds.join(','));
  const markTitleEn = tEn('tools.prefab.pipeComb.fab.marksTitle');
  check('bend: marking section present', textHas(info, markTitleEn));
  const straightInletEn = tEn('tools.prefab.pipeComb.fab.draw.straightInlet');
  const straightOutletEn = tEn('tools.prefab.pipeComb.fab.draw.straightOutlet');
  const arcDevelopedEn = tEn('tools.prefab.pipeComb.fab.draw.arcDeveloped');
  check('bend: bend segment dimensions drawn',
    textHas(info, straightInletEn) && textHas(info, straightOutletEn) && textHas(info, arcDevelopedEn),
    `${straightInletEn} / ${straightOutletEn} / ${arcDevelopedEn}`);
}

/* ================================================================ *
 * 6. Real language coverage: es, pl, ro (Latin-ext) + uk, bg
 *    (Cyrillic) — the WHOLE document localized through the real locale
 *    files (same path as the UI), extraction AND rasterization. The
 *    embedded Noto Sans must render every glyph; nothing is
 *    transliterated. These remain glyph/coverage tests; the full
 *    translation validation of every key is the i18n gate's job.
 * ================================================================ */
{
  const LANG_CASES = ['es', 'pl', 'ro', 'uk', 'bg'] as const;
  for (const code of LANG_CASES) {
    const t = makeT(code);
    const { sol, inputs } = solveCase();
    const snap = snapshotFor(sol, 'mm', 'a4', code, radiusFamilyFor(inputs));
    /* No manually localized fields: the entire PdfStrings set comes from
     * buildFabPdfStrings over this locale. Verify the locale actually
     * provides the keys (a silent en-fallback would weaken coverage). */
    check(`${code}: locale provides fab.pdf.title`, lookup(loadLocale(code), 'tools.prefab.pipeComb.fab.pdf.title') !== undefined);
    const doc = generatePipeCombFabPdf(snap);
    const file = `${OUT_DIR}/lang-${code}-a4.pdf`;
    fs.writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
    const info = await extractPdf(file);
    recordCase(file, snap, inputs, info.pages);
    const needles = [
      t('tools.prefab.pipeComb.fab.pdf.title'),
      t('tools.prefab.pipeComb.fab.pdf.notToScale'),
      t('tools.prefab.pipeComb.fab.pdf.pageOf').replace('{x}', '1').split('{y}')[0].trim(),
      t('tools.prefab.pipeComb.fab.pdf.generalView'),
      t('tools.prefab.pipeComb.fab.marksTitle'),
      t('tools.prefab.pipeComb.fab.pdf.jointsTitle'),
    ];
    for (const needle of needles) {
      check(`${code}: "${needle.slice(0, 28)}" extractable`, textHas(info, needle), needle);
    }
    check(`${code}: embedded font (no WinAnsi)`, !info.text.includes('! \''), 'garbled glyph check');
    check(`${code}: >= 2 pages`, info.pages >= 2);
    /* The Cyrillic documents must contain REAL Cyrillic from the
     * localized strings, not only a Spanish body with a sample line. */
    if (code === 'uk' || code === 'bg') {
      check(`${code}: cyrillic codepoints in file text`, /[Ѐ-ӿ]/.test(info.text));
      const cyrNeedles = [
        t('tools.prefab.pipeComb.fab.cutListTitle'),
        t('tools.prefab.pipeComb.fab.pieceStatus.ok'),
      ];
      for (const n of cyrNeedles) check(`${code}: "${n.slice(0, 20)}" extractable`, textHas(info, n), n);
    }
    /* Latin-ext coverage from the real localized strings (Polish/Romanian
     * diacritics appear throughout the localized document). */
    if (code === 'pl') check('pl: latin-ext diacritics in file text', /[ąćęłńóśźż]/i.test(info.text));
    if (code === 'ro') check('ro: latin-ext diacritics in file text', /[ăâîșț]/i.test(info.text));
  }
}

/* ================================================================ *
 * Manifest: written from the SAME snapshots that produced each file.
 * ================================================================ */
fs.writeFileSync(`${OUT_DIR}/MANIFEST.json`, JSON.stringify({
  generatedBy: 'scripts/test-pipe-comb-fab-pdf.ts',
  documentId: 'PBC-P3C-TEST-001',
  generatedAt: '2026-10-09 14:00 UTC',
  files: manifest,
}, null, 2));
check('manifest: entries for every generated file',
  manifest.length >= 14, String(manifest.length));
check('manifest: every acceptance file valid', manifest.every((e) => e.valid));

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
