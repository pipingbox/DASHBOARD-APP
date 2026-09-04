#!/usr/bin/env node
/**
 * PB-I18N-SCHEMA-001 — i18n structural guard.
 *
 * Fails the build when the SHAPE of the translation catalogue diverges between
 * locales, as opposed to merely missing a translation.
 *
 * WHY THIS EXISTS.
 * `tools.accessoriesLibrary` was a STRING in en/es/it and ABSENT in de/fr/nl/pt,
 * while AccessoriesLibrary.tsx read ~18 SUBKEYS underneath it
 * (`tools.accessoriesLibrary.searchPlaceholder`, `.emptyHint`, `.sizesDrawn`…).
 *
 * i18next resolves `a.b.c` by walking into `a.b`. When `a.b` is a string there
 * is nothing to walk into, so EVERY subkey missed and EVERY string fell back to
 * the English `defaultValue` embedded in the JSX. The Accessories Library was
 * therefore untranslatable in all seven languages — including English and
 * Spanish, where the namespace looked perfectly populated.
 *
 * NOTHING FAILED. Not the build, not the type-checker, not
 * check-i18n-coverage.mjs — which compares LEAF PATHS and is satisfied by
 * `tools.accessoriesLibrary` existing as a leaf in en.json, because a string IS
 * a leaf. Coverage reported 100% while the feature rendered zero translations.
 * That is precisely the blind spot this guard closes: coverage answers "is the
 * key present?", this answers "is the key the same SHAPE everywhere, and is
 * that shape the one the code actually reads?".
 *
 * It is deliberately dumb and fast: pure JSON structure comparison plus a grep
 * over the consumers. No network, no credentials, no build step, so it can
 * never be skipped for lack of configuration — which is how the original defect
 * survived for seven locales.
 *
 * THE THREE FAILURE MODES, all fatal:
 *   1. MISSING     — a path present in one locale is absent from another.
 *   2. TYPE DRIFT  — the same path is a string here and an object there.
 *   3. EMPTY       — an object with no keys, or a blank string, where other
 *                    locales carry content. This is the "looks translated,
 *                    renders nothing" case.
 *
 * Plus a fourth, consumer-side check:
 *   4. STRING/OBJECT COLLISION — a namespace read BOTH as `t('a.b')` and as
 *      `t('a.b.c')`. Those two uses cannot both be satisfied by one JSON value,
 *      and one of them will silently fall back forever. The fix is an explicit
 *      subkey (`a.b.title`), never a value that tries to be both.
 *
 * Usage:
 *   node scripts/check-i18n-schema.mjs           # check every locale
 *   node scripts/check-i18n-schema.mjs --json    # machine-readable output
 *
 * Exit codes: 0 = OK, 1 = structural divergence, 2 = unreadable/invalid JSON.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const LOCALES_DIR = join(REPO_ROOT, 'app', 'frontend', 'src', 'i18n', 'locales');
const SRC = join(REPO_ROOT, 'app', 'frontend', 'src');

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');

/**
 * Locales the product PROMISES. The commercial one-pager sent to manufacturers
 * claims seven interface languages, so "seven files exist" is a contractual
 * property, not an implementation detail. Hardcoded rather than derived from
 * the directory listing on purpose: deriving it would make the guard pass
 * happily the day someone deletes a locale file.
 */
const REQUIRED_LOCALES = ['en', 'es', 'nl', 'de', 'fr', 'pt', 'it'];

/**
 * Namespaces whose shape is asserted against the code that consumes them.
 *
 * `consumers` are the files whose `t('...')` calls define the real contract.
 * Every subkey the code reads must exist, as a non-empty string, in EVERY
 * locale. This is the half that catches the original defect from the other
 * direction: even if all seven locales agreed with each other, agreeing on the
 * WRONG shape (a bare string) would still render nothing.
 */
const CONTRACTS = [
  {
    namespace: 'tools.accessoriesLibrary',
    consumers: [
      'components/tools/AccessoriesLibrary.tsx',
      'pages/Tools.tsx',
    ],
  },
];

/**
 * PRE-EXISTING COVERAGE DEBT — an EXACT, FROZEN list of key paths that were
 * already absent from some locales when this guard was written.
 *
 * WHY A BASELINE AND NOT A NAMESPACE ALLOWLIST.
 * Exempting whole namespaces (`tools`, `academy`, …) would have exempted the
 * very namespace this ticket exists to fix. The debt is therefore recorded PATH
 * BY PATH: `tools.accessoriesLibrary.*` is not in this list and never can be,
 * so the original defect stays fatal while unrelated, already-known translation
 * gaps do not fail the build.
 *
 * THE EXEMPTION SUPPRESSES ONLY ABSENCE, AND ONLY FOR THESE EXACT PATHS.
 * TYPE DRIFT, EMPTINESS and CONTRACT breakage remain fatal everywhere,
 * including on these paths — those are the failure modes that render the WRONG
 * thing rather than nothing, and they are the ones nobody notices. A missing
 * key shows up the moment a translator opens a coverage report;
 * `tools.accessoriesLibrary` being a string in three locales and absent in four
 * was invisible in all seven.
 *
 * A NEW path missing from some locales is NOT covered by this list and WILL
 * fail the build. That is the anti-recurrence property the ticket asked for:
 * the debt can be paid down, but it cannot grow.
 *
 * Ownership: "is it translated yet?" belongs to check-i18n-coverage.mjs. This
 * guard owns "is it the same SHAPE everywhere?".
 *
 * MAINTENANCE RULE: this list may only ever SHRINK. Delete a line when the key
 * is translated in all seven locales. Never add one.
 */
const BASELINE_MISSING_PATHS = [
  "academy.examBackToAcademy",
  "academy.examCorrectAnswer",
  "academy.examFinish",
  "academy.examFinishConfirm",
  "academy.examFinishConfirmNo",
  "academy.examFinishConfirmText",
  "academy.examFinishConfirmYes",
  "academy.examIntroBVCA",
  "academy.examIntroDuration",
  "academy.examIntroFormat",
  "academy.examIntroFormatValue",
  "academy.examIntroPassScore",
  "academy.examIntroQuestions",
  "academy.examIntroRule1",
  "academy.examIntroRule2",
  "academy.examIntroRule3",
  "academy.examIntroRule4",
  "academy.examIntroRules",
  "academy.examIntroTitle",
  "academy.examIntroVOLVCA",
  "academy.examNewExam",
  "academy.examNext",
  "academy.examNoAnswer",
  "academy.examPrevious",
  "academy.examQuestionOf",
  "academy.examResultFailed",
  "academy.examResultPassed",
  "academy.examResultScore",
  "academy.examResultTime",
  "academy.examReviewAnswers",
  "academy.examStart",
  "academy.examTimeUp",
  "academy.examTimeWarning",
  "academy.examUnderstand",
  "academy.examYourAnswer",
  "academy.questions",
  "landing.footer.blogLink",
  "landing.footer.links",
  "landing.footer.loginLink",
  "landing.footer.registerLink",
  "landing.footer.toolsLink",
  "tools.additionalInfo",
  "tools.angle",
  "tools.backToCatalog",
  "tools.boltSize",
  "tools.bolted",
  "tools.bolts.desc",
  "tools.bolts.description",
  "tools.bolts.diameter",
  "tools.bolts.length",
  "tools.bolts.name",
  "tools.bolts.nutWidth",
  "tools.bolts.quantity",
  "tools.bolts.symbol",
  "tools.bolts.threadPitch",
  "tools.bolts.unit",
  "tools.bolts.value",
  "tools.categoryInspection",
  "tools.categoryLayout",
  "tools.categoryLibrary",
  "tools.centerArc",
  "tools.comingSoonData",
  "tools.commonAngles",
  "tools.cutAngle",
  "tools.degrees",
  "tools.desiredAngle",
  "tools.discardedPart",
  "tools.dry",
  "tools.elbowCut.angleDeg",
  "tools.elbowCut.arcExtrados",
  "tools.elbowCut.arcIntrados",
  "tools.elbowCut.arcNeutral",
  "tools.elbowCut.cutExtrados",
  "tools.elbowCut.cutIntrados",
  "tools.elbowCut.cutLine",
  "tools.elbowCut.desiredAngle",
  "tools.elbowCut.elbowRadius",
  "tools.elbowCut.formula",
  "tools.elbowCut.neutralAxis",
  "tools.elbowCut.nps",
  "tools.elbowCut.referenceTable",
  "tools.elbowCut.results",
  "tools.elbowCut.schedule",
  "tools.elbowCut.standard",
  "tools.elbowCut.wallThickness",
  "tools.elbowNote",
  "tools.elbowRadius",
  "tools.elbowType",
  "tools.exportImage",
  "tools.exportPdf",
  "tools.extradosArc",
  "tools.fittingTakeOff",
  "tools.flangeClass",
  "tools.flanges",
  "tools.intradosArc",
  "tools.longRadius",
  "tools.lubricated",
  "tools.numericalResults",
  "tools.pipeDataTables",
  "tools.pipeDim.boltDia",
  "tools.pipeDim.boltLen",
  "tools.pipeDim.boltSize",
  "tools.pipeDim.bolts",
  "tools.pipeDim.class",
  "tools.pipeDim.dry",
  "tools.pipeDim.lubed",
  "tools.pipeDim.searchPlaceholder",
  "tools.pipeDim.showInches",
  "tools.pipeDim.tabBolt",
  "tools.pipeDim.tabFlange",
  "tools.pipeDim.tabPipe",
  "tools.pipeDim.thickness",
  "tools.pipeSize",
  "tools.pressureDropDesc",
  "tools.reynoldsDesc",
  "tools.saveFavorite",
  "tools.schedule",
  "tools.searchSize",
  "tools.shortRadius",
  "tools.tabBoltTorque",
  "tools.tabFlangeDimensions",
  "tools.tabPipeDimensions",
  "tools.technicalDrawing",
  "tools.thermalExpansionDesc",
  "tools.toggleMmIn",
  "tools.toggleUnits",
  "tools.torqueWarning",
  "tools.unitConv.catDiameter",
  "tools.unitConv.catNpsDn",
  "tools.unitConv.dn",
  "tools.unitConv.enterValue",
  "tools.unitConv.nps",
  "tools.unitConv.npsDnTable",
  "tools.unitConv.npsDnTitle",
  "tools.unitConv.od",
  "tools.unitConv.searchBySize",
  "tools.unitConv.selectCategory",
  "tools.unitConv.swap",
  "tools.unitConverterDesc",
  "tools.usablePart",
  "tools.wallThicknessCol",
  "tools.wallThicknessDesc",
  "tools.weight",
];

const COVERAGE_DEBT = new Set(BASELINE_MISSING_PATHS);

// ─── helpers ─────────────────────────────────────────────────────────────────

function readLocale(code) {
  const file = join(LOCALES_DIR, `${code}.json`);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`✗ ${code}.json is not readable/valid JSON: ${err.message}`);
    process.exit(2);
  }
}

/**
 * Describe every path in a translation tree, recording its KIND rather than its
 * value. Kinds are compared across locales; values deliberately are not, since
 * differing values is the entire point of a translation file.
 *
 * Kinds: 'object' | 'empty-object' | 'string' | 'empty-string' | 'array' | 'other'
 */
function describe(node, prefix = '', out = new Map()) {
  if (node === null || node === undefined) {
    if (prefix) out.set(prefix, 'other');
    return out;
  }
  if (Array.isArray(node)) {
    if (prefix) out.set(prefix, 'array');
    return out;
  }
  if (typeof node === 'object') {
    const keys = Object.keys(node);
    if (prefix) out.set(prefix, keys.length === 0 ? 'empty-object' : 'object');
    for (const [key, value] of Object.entries(node)) {
      describe(value, prefix ? `${prefix}.${key}` : key, out);
    }
    return out;
  }
  if (typeof node === 'string') {
    if (prefix) out.set(prefix, node.trim() === '' ? 'empty-string' : 'string');
    return out;
  }
  if (prefix) out.set(prefix, 'other');
  return out;
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
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

// ─── load ────────────────────────────────────────────────────────────────────

const available = readdirSync(LOCALES_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => basename(f, '.json'));

const errors = [];

for (const code of REQUIRED_LOCALES) {
  if (!available.includes(code)) {
    errors.push(
      `locale "${code}.json" is missing from ${relative(REPO_ROOT, LOCALES_DIR)}. ` +
        `The commercial one-pager claims ${REQUIRED_LOCALES.length} interface languages ` +
        `(${REQUIRED_LOCALES.join(', ')}); that claim has to stay true.`,
    );
  }
}

if (errors.length > 0) {
  console.error('\ni18n structural guard — missing locale file:\n');
  for (const e of errors) console.error(`  - ${e}`);
  console.error(`\n${errors.length} problem(s). See PB-I18N-SCHEMA-001.\n`);
  process.exit(2);
}

const locales = Object.fromEntries(REQUIRED_LOCALES.map((c) => [c, readLocale(c)]));
const shapes = Object.fromEntries(
  REQUIRED_LOCALES.map((c) => [c, describe(locales[c])]),
);

// =============================================================================
// CHECK 1 — every path known to ANY locale must exist in EVERY locale, with the
// SAME kind.
//
// The union is used rather than en.json as the reference, so a namespace that
// exists only in a non-reference locale is still checked. Anchoring on en alone
// would have missed nothing here, but it would mean a de-only key could drift
// unobserved — the same class of blind spot, one file over.
// =============================================================================

const allPaths = new Set();
for (const map of Object.values(shapes)) for (const p of map.keys()) allPaths.add(p);

const missing = [];   // case 1
const typeDrift = []; // case 2
const empties = [];   // case 3

for (const path of [...allPaths].sort()) {
  const byLocale = new Map();
  const absent = [];

  for (const code of REQUIRED_LOCALES) {
    const kind = shapes[code].get(path);
    if (kind === undefined) absent.push(code);
    else byLocale.set(code, kind);
  }

  // A path under a subtree that is itself absent would report once per
  // descendant and bury the actual cause. Only report the shallowest absence.
  //
  // COVERAGE_DEBT suppresses ABSENCE ONLY, and only for the exact paths frozen
  // in the baseline. Type drift, emptiness and contract breakage below are NOT
  // suppressed for those paths.
  if (absent.length > 0 && absent.length < REQUIRED_LOCALES.length) {
    const parent = path.includes('.') ? path.slice(0, path.lastIndexOf('.')) : null;
    const parentAlsoAbsent =
      parent !== null && absent.every((c) => shapes[c].get(parent) === undefined);
    if (!parentAlsoAbsent && !COVERAGE_DEBT.has(path)) {
      missing.push({ path, absent, present: [...byLocale.keys()] });
    }
  }

  // Type drift: normalise empty/non-empty so that "string vs object" is
  // reported here and "empty vs populated" is reported by the emptiness check.
  const family = (kind) =>
    kind === 'empty-object' ? 'object' : kind === 'empty-string' ? 'string' : kind;

  const families = new Map();
  for (const [code, kind] of byLocale) {
    const fam = family(kind);
    if (!families.has(fam)) families.set(fam, []);
    families.get(fam).push(code);
  }
  if (families.size > 1) {
    typeDrift.push({ path, families: [...families.entries()] });
  }

  // Emptiness: an empty object / blank string where any other locale has
  // content. This is the silent one — the key resolves, and renders nothing.
  const hollow = [...byLocale].filter(
    ([, k]) => k === 'empty-object' || k === 'empty-string',
  );
  const filled = [...byLocale].filter(
    ([, k]) => k === 'object' || k === 'string' || k === 'array',
  );
  if (hollow.length > 0 && filled.length > 0) {
    empties.push({
      path,
      hollow: hollow.map(([c, k]) => `${c} (${k})`),
      filled: filled.map(([c]) => c),
    });
  }
}

// =============================================================================
// CHECK 1b — BASELINE INTEGRITY. The debt list may only ever shrink.
//
// A baseline allowed to go stale is a hole that widens on its own. Two hazards:
//
//   (a) A STALE ENTRY. A path listed as debt that is now present in all seven
//       locales means the debt was paid but the exemption stayed behind,
//       leaving a pre-authorised blind spot on a key that no longer needs one.
//       If that key were later dropped from four locales, nothing would fail —
//       which is exactly how tools.accessoriesLibrary survived. Fatal.
//
//   (b) GROWTH. Enforced structurally rather than by a counter: a newly-missing
//       path is simply not in the frozen list, so it fails CHECK 1. Widening
//       the exemption requires editing this file, which is a reviewable act
//       instead of an accident.
// =============================================================================

const staleDebt = [];
for (const path of COVERAGE_DEBT) {
  const absent = REQUIRED_LOCALES.filter((c) => !shapes[c].has(path));
  if (absent.length === 0) staleDebt.push(path);
}

// =============================================================================
// CHECK 2 — declared contracts: the shape the CODE reads.
//
// Seven locales agreeing on a bare string is still broken if the component
// reads subkeys off it. This half reads the consumers and requires every
// `t('<namespace>.<sub>')` they use to exist, non-empty, in all seven.
// =============================================================================

const contractErrors = [];
const collisions = []; // case 4

for (const { namespace, consumers } of CONTRACTS) {
  const used = new Set();
  let usedAsBareString = false;
  const bareStringSites = [];

  for (const rel of consumers) {
    const file = join(SRC, rel);
    let source;
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      contractErrors.push(
        `contract consumer "${rel}" does not exist under app/frontend/src. ` +
          `A contract pointing at a missing file checks nothing: fix the path or ` +
          `drop the entry from CONTRACTS.`,
      );
      continue;
    }

    source.split('\n').forEach((line, i) => {
      // Subkey uses: t('tools.accessoriesLibrary.searchPlaceholder', …)
      // and nameKey/descKey string literals in the tool registry.
      for (const m of line.matchAll(
        new RegExp(`['"\`]${namespace.replace(/\./g, '\\.')}\\.([A-Za-z0-9_]+)['"\`]`, 'g'),
      )) {
        used.add(m[1]);
      }
      // Bare uses of the namespace itself as a translatable value.
      for (const m of line.matchAll(
        new RegExp(`['"\`]${namespace.replace(/\./g, '\\.')}['"\`]`, 'g'),
      )) {
        void m;
        usedAsBareString = true;
        bareStringSites.push(`${rel}:${i + 1}: ${line.trim()}`);
      }
    });
  }

  // Case 4 — the collision. Both uses cannot be satisfied by one JSON value.
  if (usedAsBareString && used.size > 0) {
    collisions.push({ namespace, sites: bareStringSites, subkeys: [...used].sort() });
  }

  for (const sub of [...used].sort()) {
    const path = `${namespace}.${sub}`;
    for (const code of REQUIRED_LOCALES) {
      const value = resolve(locales[code], path);
      if (value === undefined) {
        contractErrors.push(
          `${code}.json is missing "${path}", which is read by the code. ` +
            `It will render the English defaultValue instead.`,
        );
      } else if (typeof value !== 'string') {
        contractErrors.push(
          `${code}.json has "${path}" as ${
            Array.isArray(value) ? 'an array' : typeof value
          }; the code reads it as a string.`,
        );
      } else if (value.trim() === '') {
        contractErrors.push(`${code}.json has "${path}" empty; it will render nothing.`);
      }
    }
  }

  // The namespace itself must be an object in every locale, since the code
  // reads subkeys off it. A string here is the original defect exactly.
  for (const code of REQUIRED_LOCALES) {
    const value = resolve(locales[code], namespace);
    if (value === undefined) {
      contractErrors.push(
        `${code}.json has no "${namespace}" namespace at all; every subkey the code ` +
          `reads falls back to English.`,
      );
    } else if (typeof value === 'string') {
      contractErrors.push(
        `${code}.json has "${namespace}" as a STRING, but the code reads ` +
          `${used.size} subkey(s) underneath it. i18next cannot walk into a string, so ` +
          `every one of them silently falls back to the English defaultValue. ` +
          `If a bare title is needed, use "${namespace}.title".`,
      );
    } else if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
      contractErrors.push(
        `${code}.json has "${namespace}" as an EMPTY object. The key resolves and ` +
          `renders nothing — the quietest possible failure.`,
      );
    }
  }
}

// ─── report ──────────────────────────────────────────────────────────────────

const failed =
  missing.length > 0 ||
  typeDrift.length > 0 ||
  empties.length > 0 ||
  contractErrors.length > 0 ||
  collisions.length > 0 ||
  staleDebt.length > 0;

if (asJson) {
  console.log(
    JSON.stringify(
      {
        locales: REQUIRED_LOCALES,
        paths: allPaths.size,
        missing,
        typeDrift,
        empties,
        collisions,
        contractErrors,
        staleDebt,
        ok: !failed,
      },
      null,
      2,
    ),
  );
  process.exit(failed ? 1 : 0);
}

if (!failed) {
  console.log(
    `i18n structural guard — ${REQUIRED_LOCALES.length} locales ` +
      `(${REQUIRED_LOCALES.join(', ')}), ${allPaths.size} paths.\n`,
  );
  console.log('  ✓ same key set in every locale');
  console.log('  ✓ same type for every key (no string-vs-object drift)');
  console.log('  ✓ no empty object / blank string where others have content');
  console.log(
    `  ✓ coverage-debt baseline clean — ${COVERAGE_DEBT.size} known gap(s), none stale`,
  );
  for (const { namespace } of CONTRACTS) {
    const subkeys = Object.keys(resolve(locales.en, namespace) ?? {}).length;
    console.log(`  ✓ contract "${namespace}" — ${subkeys} subkeys present in all locales`);
  }
  console.log('\n✓ i18n schema is consistent across all locales.');
  process.exit(0);
}

console.error('\ni18n structural divergence detected:\n');

if (typeDrift.length > 0) {
  console.error(`  TYPE DRIFT — same key, different shape (${typeDrift.length}):`);
  for (const { path, families } of typeDrift.slice(0, 40)) {
    console.error(`    ${path}`);
    for (const [fam, codes] of families) {
      console.error(`      ${fam.padEnd(8)} → ${codes.join(', ')}`);
    }
  }
  if (typeDrift.length > 40) console.error(`    … and ${typeDrift.length - 40} more`);
  console.error(
    `\n    i18next resolves "a.b.c" by walking into "a.b". If "a.b" is a string in\n` +
      `    one locale and an object in another, every subkey silently falls back to\n` +
      `    the English defaultValue in the first — with nothing failing.\n`,
  );
}

if (missing.length > 0) {
  console.error(`  MISSING — key absent from some locales (${missing.length}):`);
  for (const { path, absent } of missing.slice(0, 40)) {
    console.error(`    ${path}  → absent in: ${absent.join(', ')}`);
  }
  if (missing.length > 40) console.error(`    … and ${missing.length - 40} more`);
  console.error('');
}

if (empties.length > 0) {
  console.error(`  EMPTY — hollow value where others have content (${empties.length}):`);
  for (const { path, hollow, filled } of empties.slice(0, 40)) {
    console.error(`    ${path}`);
    console.error(`      hollow in: ${hollow.join(', ')}`);
    console.error(`      filled in: ${filled.join(', ')}`);
  }
  if (empties.length > 40) console.error(`    … and ${empties.length - 40} more`);
  console.error('');
}

if (collisions.length > 0) {
  console.error(`  STRING/OBJECT COLLISION (${collisions.length}):`);
  for (const { namespace, sites, subkeys } of collisions) {
    console.error(
      `    "${namespace}" is read BOTH as a bare value and as a parent of ` +
        `${subkeys.length} subkey(s).`,
    );
    for (const site of sites) console.error(`      ${site}`);
    console.error(
      `      One JSON value cannot be both. Introduce "${namespace}.title" and\n` +
        `      update the bare call site.`,
    );
  }
  console.error('');
}

if (contractErrors.length > 0) {
  console.error(`  CONTRACT — shape the code actually reads (${contractErrors.length}):`);
  for (const e of contractErrors.slice(0, 60)) console.error(`    - ${e}`);
  if (contractErrors.length > 60) {
    console.error(`    … and ${contractErrors.length - 60} more`);
  }
  console.error('');
}

if (staleDebt.length > 0) {
  console.error(`  STALE BASELINE — debt paid but exemption left behind (${staleDebt.length}):`);
  for (const path of staleDebt.slice(0, 40)) console.error(`    ${path}`);
  if (staleDebt.length > 40) console.error(`    … and ${staleDebt.length - 40} more`);
  console.error(
    `\n    These paths are now present in all ${REQUIRED_LOCALES.length} locales, so their\n` +
      `    entry in BASELINE_MISSING_PATHS is a blind spot on a key that no longer\n` +
      `    needs one: if it were dropped from some locales later, nothing would fail.\n` +
      `    Delete them from BASELINE_MISSING_PATHS in this file.\n`,
  );
}

const total =
  missing.length +
  typeDrift.length +
  empties.length +
  collisions.length +
  contractErrors.length +
  staleDebt.length;

console.error(`${total} problem(s). See PB-I18N-SCHEMA-001.\n`);
process.exit(1);
