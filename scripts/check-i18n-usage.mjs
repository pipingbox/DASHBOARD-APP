#!/usr/bin/env node
/**
 * PB-I18N-USAGE-001 — i18n usage guard.
 *
 * Fails the build when a STATIC `t('...')` call in the frontend code resolves to
 * something other than a non-empty string in any locale, or does not exist at
 * all. This catches the specific failure mode that produced
 * "returned an object instead of string" on the landing page.
 *
 * MODES:
 *   - default (CI): scans public/marketing pages only. These are the surfaces
 *     a visitor reads before signing in, so a bad translation there is the
 *     highest-impact i18n failure.
 *   - --full: scans every .ts/.tsx file. Intended for debt-paydown work; NOT
 *     run in CI until the existing missing-key debt is cleared.
 *
 * DYNAMIC calls such as t(`${variable}.foo`) are SKIPPED: the guard cannot prove
 * their runtime value. The code author remains responsible for those.
 *
 * DEFAULT VALUES: calls with a `defaultValue` are checked too, because i18next
 * still needs the key to exist when a locale IS present; the default only helps
 * when the whole namespace is missing. A call that relies ONLY on defaultValue
 * in every locale is treated as an English hardcode and reported.
 *
 * Allowlist: PB-I18N-SCHEMA-001 already owns the canonical coverage-debt list.
 * This guard reuses it only in --full mode; the default mode has NO allowlist,
 * because the public pages must be fully translatable in all seven languages.
 *
 * Exit codes: 0 = OK, 1 = usage errors, 2 = unreadable/invalid JSON.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const LOCALES_DIR = join(REPO_ROOT, 'app', 'frontend', 'src', 'i18n', 'locales');
const SRC = join(REPO_ROOT, 'app', 'frontend', 'src');

const REQUIRED_LOCALES = ['en', 'es', 'nl', 'de', 'fr', 'pt', 'it'];

/**
 * Public pages scanned in default (CI) mode. A visitor can reach these without
 * signing in, so they must render correctly in every supported language.
 */
const PUBLIC_PAGES = [
  'pages/Index.tsx',
  'pages/Login.tsx',
  'pages/Register.tsx',
  'pages/ResetPassword.tsx',
  'pages/Privacy.tsx',
  'pages/Terms.tsx',
  'pages/DsaContact.tsx',
];

/**
 * Inherited coverage debt from PB-I18N-SCHEMA-001. Used ONLY in --full mode.
 * May only shrink, never grow.
 */
const ALLOWED_MISSING_PATHS = new Set([
  'academy.examBackToAcademy',
  'academy.examCorrectAnswer',
  'academy.examFinish',
  'academy.examFinishConfirm',
  'academy.examFinishConfirmNo',
  'academy.examFinishConfirmText',
  'academy.examFinishConfirmYes',
  'academy.examIntroBVCA',
  'academy.examIntroDuration',
  'academy.examIntroFormat',
  'academy.examIntroFormatValue',
  'academy.examIntroPassScore',
  'academy.examIntroQuestions',
  'academy.examIntroRule1',
  'academy.examIntroRule2',
  'academy.examIntroRule3',
  'academy.examIntroRule4',
  'academy.examIntroRules',
  'academy.examIntroTitle',
  'academy.examIntroVOLVCA',
  'academy.examNewExam',
  'academy.examNext',
  'academy.examNoAnswer',
  'academy.examPrevious',
  'academy.examQuestionOf',
  'academy.examResultFailed',
  'academy.examResultPassed',
  'academy.examResultScore',
  'academy.examResultTime',
  'academy.examReviewAnswers',
  'academy.examStart',
  'academy.examTimeUp',
  'academy.examTimeWarning',
  'academy.examUnderstand',
  'academy.examYourAnswer',
  'academy.questions',
  'landing.footer.blogLink',
  'landing.footer.links',
  'landing.footer.loginLink',
  'landing.footer.registerLink',
  'landing.footer.toolsLink',
  'tools.additionalInfo',
  'tools.angle',
  'tools.backToCatalog',
  'tools.boltSize',
  'tools.bolted',
  'tools.bolts.desc',
  'tools.bolts.description',
  'tools.bolts.diameter',
  'tools.bolts.length',
  'tools.bolts.name',
  'tools.bolts.nutWidth',
  'tools.bolts.quantity',
  'tools.bolts.symbol',
  'tools.bolts.threadPitch',
  'tools.bolts.unit',
  'tools.bolts.value',
  'tools.categoryInspection',
  'tools.categoryLayout',
  'tools.categoryLibrary',
  'tools.centerArc',
  'tools.comingSoonData',
  'tools.commonAngles',
  'tools.cutAngle',
  'tools.degrees',
  'tools.desiredAngle',
  'tools.discardedPart',
  'tools.dry',
  'tools.elbowCut.angleDeg',
  'tools.elbowCut.arcExtrados',
  'tools.elbowCut.arcIntrados',
  'tools.elbowCut.arcNeutral',
  'tools.elbowCut.cutExtrados',
  'tools.elbowCut.cutIntrados',
  'tools.elbowCut.cutLine',
  'tools.elbowCut.desiredAngle',
  'tools.elbowCut.elbowRadius',
  'tools.elbowCut.formula',
  'tools.elbowCut.neutralAxis',
  'tools.elbowCut.nps',
  'tools.elbowCut.referenceTable',
  'tools.elbowCut.results',
  'tools.elbowCut.schedule',
  'tools.elbowCut.standard',
  'tools.elbowCut.wallThickness',
  'tools.elbowNote',
  'tools.elbowRadius',
  'tools.elbowType',
  'tools.exportImage',
  'tools.exportPdf',
  'tools.extradosArc',
  'tools.fittingTakeOff',
  'tools.flangeClass',
  'tools.flanges',
  'tools.intradosArc',
  'tools.longRadius',
  'tools.lubricated',
  'tools.numericalResults',
  'tools.pipeDataTables',
  'tools.pipeDim.boltDia',
  'tools.pipeDim.boltLen',
  'tools.pipeDim.boltSize',
  'tools.pipeDim.bolts',
  'tools.pipeDim.class',
  'tools.pipeDim.dry',
  'tools.pipeDim.lubed',
  'tools.pipeDim.searchPlaceholder',
  'tools.pipeDim.showInches',
  'tools.pipeDim.tabBolt',
  'tools.pipeDim.tabFlange',
  'tools.pipeDim.tabPipe',
  'tools.pipeDim.thickness',
  'tools.pipeSize',
  'tools.pressureDropDesc',
  'tools.reynoldsDesc',
  'tools.saveFavorite',
  'tools.schedule',
  'tools.searchSize',
  'tools.shortRadius',
  'tools.tabBoltTorque',
  'tools.tabFlangeDimensions',
  'tools.tabPipeDimensions',
  'tools.technicalDrawing',
  'tools.thermalExpansionDesc',
  'tools.toggleMmIn',
  'tools.toggleUnits',
  'tools.torqueWarning',
  'tools.unitConv.catDiameter',
  'tools.unitConv.catNpsDn',
  'tools.unitConv.dn',
  'tools.unitConv.enterValue',
  'tools.unitConv.nps',
  'tools.unitConv.npsDnTable',
  'tools.unitConv.npsDnTitle',
  'tools.unitConv.od',
  'tools.unitConv.searchBySize',
  'tools.unitConv.selectCategory',
  'tools.unitConv.swap',
  'tools.unitConverterDesc',
  'tools.usablePart',
  'tools.wallThicknessCol',
  'tools.wallThicknessDesc',
  'tools.weight',
]);

const argv = process.argv.slice(2);
const fullMode = argv.includes('--full');

function readLocale(code) {
  const file = join(LOCALES_DIR, `${code}.json`);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`✗ ${code}.json is not readable/valid JSON: ${err.message}`);
    process.exit(2);
  }
}

function resolve(root, path) {
  return path.split('.').reduce((node, key) => {
    if (node === null || typeof node !== 'object') return undefined;
    return node[key];
  }, root);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'i18n') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

function extractStaticKeys(file) {
  const source = readFileSync(file, 'utf8');
  const keys = [];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const m of line.matchAll(/\bt\(\s*['"`]([a-zA-Z0-9_.-]+)['"`]\s*(?:,\s*\{)?/g)) {
      keys.push({ path: m[1], line: i + 1 });
    }
  }
  return keys;
}

// Determine scan scope
let files;
if (fullMode) {
  files = walk(SRC);
} else {
  files = PUBLIC_PAGES.map((rel) => join(SRC, rel)).filter((f) => {
    try {
      statSync(f);
      return true;
    } catch {
      console.warn(`  ⚠ public page not found: ${relative(REPO_ROOT, f)}`);
      return false;
    }
  });
}

const locales = Object.fromEntries(REQUIRED_LOCALES.map((c) => [c, readLocale(c)]));
const errors = [];

for (const file of files) {
  const keys = extractStaticKeys(file);
  for (const { path, line } of keys) {
    // The allowlist is inherited debt from PB-I18N-SCHEMA-001 and applies ONLY
    // to --full mode. In CI (public pages) it must NOT apply: a visitor-facing
    // key with no translation is the exact defect this guard exists to catch,
    // and honouring the allowlist here is how `landing.footer.madeIn` shipped
    // to production missing from all seven locales.
    if (fullMode && ALLOWED_MISSING_PATHS.has(path)) continue;

    for (const code of REQUIRED_LOCALES) {
      const value = resolve(locales[code], path);
      if (value === undefined) {
        errors.push({ file: relative(REPO_ROOT, file), line, code, path, kind: 'missing' });
      } else if (typeof value !== 'string') {
        errors.push({
          file: relative(REPO_ROOT, file),
          line,
          code,
          path,
          kind: 'not-a-string',
          type: Array.isArray(value) ? 'array' : typeof value,
        });
      } else if (value.trim() === '') {
        errors.push({ file: relative(REPO_ROOT, file), line, code, path, kind: 'empty' });
      }
    }
  }
}

if (errors.length === 0) {
  const scope = fullMode ? 'all source files' : `${PUBLIC_PAGES.length} public pages`;
  console.log(
    `i18n usage guard — ${REQUIRED_LOCALES.length} locales, ${scope} scanned.\n`,
  );
  console.log('  ✓ every static t(...) call resolves to a non-empty string in every locale');
  console.log('  ✓ no object/array/value used where a string is expected');
  console.log(`  mode: ${fullMode ? '--full' : 'CI (public pages only)'}`);
  console.log('\n✓ i18n usage is consistent.\n');
  process.exit(0);
}

console.error('\ni18n usage errors detected:\n');
const byFile = new Map();
for (const e of errors) {
  const key = `${e.file}:${e.line}`;
  if (!byFile.has(key)) byFile.set(key, []);
  byFile.get(key).push(e);
}

for (const [site, items] of byFile) {
  console.error(`  ${site}`);
  for (const e of items) {
    const prefix =
      e.kind === 'missing' ? 'missing in' : e.kind === 'empty' ? 'empty in' : 'not a string in';
    console.error(`    - "${e.path}" ${prefix} ${e.code}${e.type ? ` (${e.type})` : ''}`);
  }
}

console.error(`\n${errors.length} problem(s). See PB-I18N-USAGE-001.\n`);
process.exit(1);
