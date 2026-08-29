#!/usr/bin/env node
/**
 * build-catalog.mjs — PIDM catalog generator
 * Ticket: PB-TOOLS-CATALOG-001
 *
 * WHY THIS RUNS LOCALLY AND NOT IN CI
 * -----------------------------------
 * The source of truth is `brain/08-CATALOG`, which lives in the PIPINGBOX-BRAIN
 * repository. DASHBOARD-APP is a submodule and is deployed on its own from
 * `pipingbox/DASHBOARD-APP`, where `../brain` does not exist. A build-time
 * generator would therefore work locally and fail in CI, which is the worst
 * possible split.
 *
 * So: run this by hand after editing the catalog, and COMMIT its output. The
 * production build consumes only the committed JSON. `check-catalog.mjs` runs
 * in CI and fails if the committed JSON references an asset that is not in the
 * repository — that is where the integrity gate lives.
 *
 * USAGE
 *   node scripts/build-catalog.mjs           # generate
 *   node scripts/build-catalog.mjs --check   # verify committed output is current
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, '..');

// `yaml` is a frontend dependency and is not installed at the repository root.
// Resolving through the frontend package keeps this script dependency-free
// rather than duplicating the package in a second manifest.
const require = createRequire(join(APP_ROOT, 'app', 'frontend', 'package.json'));
const { parse: parseYaml } = require('yaml');
const BRAIN_ROOT = resolve(APP_ROOT, '..');
const CATALOG_SRC = join(BRAIN_ROOT, 'brain', '08-CATALOG');
const ASSET_SRC = join(BRAIN_ROOT, 'brain', '07-DESIGN', '02-ASSETS', 'APPROVED', 'BIBLIOTECA_V1');
const OUT_DIR = join(APP_ROOT, 'app', 'frontend', 'src', 'tools', 'catalog');
const OUT_JSON = join(OUT_DIR, 'catalog.generated.json');

const checkOnly = process.argv.includes('--check');

/* ── helpers ─────────────────────────────────────────────────────────────── */

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function loadYaml(file) {
  try {
    return parseYaml(readFileSync(file, 'utf8'));
  } catch (err) {
    fail(`YAML no parseable: ${file}\n  ${err.message}`);
    return null;
  }
}

const problems = [];
const warnings = [];
function fail(msg) { problems.push(msg); }
function warn(msg) { warnings.push(msg); }

/**
 * The catalog uses literal placeholders like `pending` where an asset has not
 * been produced yet. That is an honest statement of absence, not a broken
 * reference, so it must not fail the build — otherwise authors are pushed to
 * invent a path just to make the gate green, which is the opposite of what the
 * gate is for. A genuinely wrong path still fails.
 */
const PLACEHOLDERS = new Set(['pending', 'tbd', 'todo', 'none', 'n/a', '-']);
function declaredAsset(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || PLACEHOLDERS.has(s.toLowerCase())) return null;
  return basename(s);
}

/* ── 1. load sources ─────────────────────────────────────────────────────── */

if (!existsSync(CATALOG_SRC)) {
  console.error(
    `\nNo encuentro el catalogo del Brain en:\n  ${CATALOG_SRC}\n\n` +
    `Este script solo funciona con el repositorio PIPINGBOX-BRAIN presente como\n` +
    `directorio padre. En CI no se ejecuta: alli se usa el JSON ya commiteado.\n`,
  );
  process.exit(2);
}

const allYaml = walk(CATALOG_SRC).filter((f) => f.endsWith('.yaml'));

const componentFiles = allYaml.filter((f) => basename(f).startsWith('PB-COMP-') && f.includes('COMPONENTS'));
const standardFiles = allYaml.filter((f) => basename(f).startsWith('PB-STD-'));
const dimensionFiles = allYaml.filter((f) => basename(f).startsWith('PB-DIM-'));

/* ── 2. standards ────────────────────────────────────────────────────────── */

const standards = {};
for (const file of standardFiles) {
  const y = loadYaml(file);
  if (!y?.id) continue;
  standards[y.id] = {
    id: y.id,
    organization: y.organization ?? null,
    code: y.code ?? null,
    title: y.title ?? null,
    edition: y.edition != null ? String(y.edition) : null,
    status: y.status ?? null,
    scope: typeof y.scope === 'string' ? y.scope.trim() : null,
    roles: Array.isArray(y.roles) ? y.roles : [],
    applicableFamilies: Array.isArray(y.applicable_families) ? y.applicable_families : [],
  };
}

/* ── 3. dimension sets ───────────────────────────────────────────────────── */

const dimensionSets = {};
for (const file of dimensionFiles) {
  const y = loadYaml(file);
  if (!y?.id) continue;
  const rows = Array.isArray(y.rows) ? y.rows : [];
  dimensionSets[y.id] = {
    id: y.id,
    componentId: y.component_id ?? null,
    standardId: y.standard_id ?? null,
    system: y.system ?? null,
    selectors: (y.selectors ?? []).map((s) => ({
      key: s.key, label: s.label ?? s.key, unit: s.unit ?? null, type: s.type ?? 'string',
    })),
    // fabrication_priority orders the columns the way a fabricator reads them.
    // Non-dimensional sentinels are normalised to null here rather than in the
    // UI, so a header never reads "Num Bolts (count)".
    fields: (y.fields ?? [])
      .map((f) => {
        const u = f.unit == null ? null : String(f.unit).trim();
        const meaningful = u && !['dimensionless', 'count', 'none', 'n/a', '-'].includes(u.toLowerCase());
        return {
          key: f.key,
          label: f.label ?? f.key,
          unit: meaningful ? u : null,
          type: f.type ?? 'string',
          priority: f.fabrication_priority ?? 999,
        };
      })
      .sort((a, b) => a.priority - b.priority),
    rows,
  };
  if (rows.length === 0) warn(`Conjunto dimensional sin filas: ${y.id}`);
}

/* ── 4. asset index ──────────────────────────────────────────────────────── */

/**
 * A component YAML declares ONE representative 2D drawing, e.g.
 * `PB-DIM-WELDOLET-NPS-4x2_2d.svg`. In reality the approved set contains one
 * drawing per size for that stem. We use the declared file only as a seed to
 * discover the whole family, so the catalog exposes every size that was drawn
 * instead of a single arbitrary one.
 */
const drawingIndex = new Map(); // stem -> [{ size, file }]
const detailDir = join(ASSET_SRC, 'detail');
if (existsSync(detailDir)) {
  for (const file of readdirSync(detailDir)) {
    if (!file.endsWith('_2d.svg')) continue;
    const m = file.match(/^(PB-DIM-.+?)-NPS-(.+)_2d\.svg$/);
    if (!m) continue;
    const [, stem, size] = m;
    if (!drawingIndex.has(stem)) drawingIndex.set(stem, []);
    drawingIndex.get(stem).push({ size, file });
  }
}

// Natural sort so 2" < 3" < 10" rather than lexicographic 10 < 2.
function sizeRank(s) {
  const first = String(s).split('x')[0].replace(/"/g, '');
  const frac = first.match(/^(\d+)-(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) + Number(frac[2]) / Number(frac[3]);
  const simple = first.match(/^(\d+)\/(\d+)$/);
  if (simple) return Number(simple[1]) / Number(simple[2]);
  const n = Number.parseFloat(first);
  return Number.isFinite(n) ? n : 1e9;
}
for (const list of drawingIndex.values()) list.sort((a, b) => sizeRank(a.size) - sizeRank(b.size));

const heroDir = join(ASSET_SRC, 'hero');
const heroFiles = existsSync(heroDir) ? readdirSync(heroDir).filter((f) => f.endsWith('.png')) : [];

/* ── 5. components ───────────────────────────────────────────────────────── */

const components = [];

for (const file of componentFiles) {
  const y = loadYaml(file);
  if (!y?.id) continue;

  const meta = y.metadata ?? {};
  const cls = y.classification ?? {};
  const tech = y.technical ?? {};
  const rawAssets = y.assets ?? {};

  // --- standards, validated against the real standard set -------------------
  const componentStandards = [];
  for (const s of y.standards ?? []) {
    if (!s?.standard_id) continue;
    if (!standards[s.standard_id]) {
      fail(`${y.id} referencia la norma inexistente ${s.standard_id}`);
      continue;
    }
    componentStandards.push({
      standardId: s.standard_id,
      role: s.role ?? null,
      note: s.applicability_note ?? null,
    });
  }

  // --- 2D drawings: expand the declared seed into the full size family ------
  let drawings = [];
  let drawingStem = null;
  const declared2d = declaredAsset(rawAssets.drawing_2d);
  if (!declared2d) {
    warn(`${y.id} sin plano 2D declarado`);
  } else {
    const onDisk = join(detailDir, declared2d);
    if (!existsSync(onDisk)) {
      fail(`${y.id} declara drawing_2d inexistente: ${declared2d}`);
    } else {
      const m = declared2d.match(/^(PB-DIM-.+?)-NPS-(.+)_2d\.svg$/);
      if (m) {
        drawingStem = m[1];
        drawings = (drawingIndex.get(drawingStem) ?? []).map((d) => ({
          size: d.size,
          src: `/catalog/2d/${d.file}`,
        }));
      } else {
        // Non-conforming name (e.g. the legacy PB-ASSET-0001 elbow): keep the
        // single declared file rather than dropping it.
        drawings = [{ size: null, src: `/catalog/2d/${declared2d}` }];
      }
    }
  }

  // --- 3D render ------------------------------------------------------------
  let render = null;
  const declared3d = declaredAsset(rawAssets.render_3d);
  if (!declared3d) {
    warn(`${y.id} sin render 3D declarado`);
  } else if (!heroFiles.includes(declared3d)) {
    fail(`${y.id} declara render_3d inexistente: ${declared3d}`);
  } else {
    // Optimised to WebP by sync-catalog-assets.mjs.
    render = `/catalog/3d/${declared3d.replace(/\.png$/, '.webp')}`;
  }

  // --- dimensions -----------------------------------------------------------
  const dims = [];
  for (const id of y.dimension_sets ?? []) {
    if (dimensionSets[id]) dims.push(id);
    else warn(`${y.id} referencia el conjunto dimensional ausente ${id}`);
  }

  // How the component is rated. Not every component is designated by pressure
  // class: ASME B16.9 butt-weld fittings and MSS SP-97 butt-weld olets derive
  // their capacity from wall thickness and material, so an empty class list is
  // the CORRECT answer for them, not a data gap. Only warn when the basis says
  // a class list should exist but none does.
  const RATING_BASES = new Set([
    'pressure_class',
    'wall_thickness',
    'working_pressure',
    'not_applicable',
  ]);
  const pressureRatings = Array.isArray(tech.pressure_ratings)
    ? tech.pressure_ratings.map((r) => String(r))
    : [];
  let ratingBasis = tech.rating_basis ?? null;
  if (ratingBasis && !RATING_BASES.has(ratingBasis)) {
    warn(`${y.id} rating_basis desconocido: ${ratingBasis}`);
    ratingBasis = null;
  }
  if (!ratingBasis) warn(`${y.id} sin rating_basis`);
  else if (ratingBasis === 'pressure_class' && pressureRatings.length === 0) {
    warn(`${y.id} declara rating_basis pressure_class pero no lista clases`);
  }
  const ratingNote = tech.rating_note ?? null;

  // --- Level 1 REFERENTIAL brand mentions (PB-PARTNER-CATALOG-001) ----------
  // Trademark names cited under art. 14(1)(c) EUTMR to indicate intended
  // purpose. This block carries NO manufacturer technical data by design, so
  // the generator only lets through names, the standard that defines the
  // interface, and prose. Any other key in the YAML is dropped here rather
  // than reaching the UI: that keeps a future author from smuggling a vendor
  // dimension into the published JSON through a field nobody reviewed.
  let referenceCompatibility = null;
  const rc = y.reference_compatibility;
  if (rc && typeof rc === 'object') {
    const brands = (Array.isArray(rc.brands) ? rc.brands : [])
      .map((b) => String(b).trim())
      .filter(Boolean);
    const basisStandardId = rc.basis?.standard_id ?? null;
    if (basisStandardId && !standards[basisStandardId]) {
      fail(`${y.id} reference_compatibility referencia la norma inexistente ${basisStandardId}`);
    }
    if (brands.length === 0) {
      warn(`${y.id} declara reference_compatibility sin marcas`);
    } else if (!basisStandardId && !rc.basis?.label) {
      // A brand mention with no standard behind it is exactly the claim we are
      // not allowed to make, so it must not be publishable as-is.
      fail(`${y.id} reference_compatibility cita marcas sin norma que defina la interfaz`);
    } else {
      referenceCompatibility = {
        level: rc.level ?? 'referential',
        legalBasis: rc.legal_basis ?? null,
        basisStandardId,
        basisLabel: rc.basis?.label ?? null,
        brands,
        note: typeof rc.note === 'string' ? rc.note.trim() : null,
      };
    }
  }

  components.push({
    id: y.id,
    slug: meta.slug ?? y.id.toLowerCase(),
    name: meta.display_name ?? meta.short_name ?? y.id,
    shortName: meta.short_name ?? null,
    description: meta.description ?? null,
    status: meta.status ?? 'draft',
    version: meta.version != null ? String(meta.version) : null,
    category: cls.category ?? null,
    family: cls.family ?? null,
    type: cls.type ?? null,
    tags: Array.isArray(cls.tags) ? cls.tags : [],
    connectionTypes: Array.isArray(tech.connection_types) ? tech.connection_types : [],
    materials: Array.isArray(tech.materials) ? tech.materials : [],
    pressureRatings,
    ratingBasis,
    ratingNote,
    standards: componentStandards,
    dimensionSets: dims,
    drawings,
    drawingStem,
    render,
    fabricationNotes: y.manufacturing?.fabrication_notes ?? [],
    compatibleWith: (y.compatibility?.compatible_with ?? []).map((c) => ({
      target: c.target ?? null,
      relation: c.relation ?? null,
      conditions: c.conditions ?? null,
    })),
    referenceCompatibility,
    // Publishable requires a resolved 2D drawing. The drawing is the load-
    // bearing asset for an engineering library; the 3D render is presentation.
    // Requiring both would exclude correctly documented components whose render
    // has not been produced yet, which is a worse outcome than a card without a
    // thumbnail. Checking the raw YAML field instead of the resolved value
    // would count a `pending` placeholder as an asset.
    publishable: drawings.length > 0,
  });
}

components.sort((a, b) => a.name.localeCompare(b.name));

/* ── 6. emit ─────────────────────────────────────────────────────────────── */

if (problems.length) {
  console.error('\nERRORES DE INTEGRIDAD DEL CATALOGO:\n');
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('\nNo se genera nada. Corrige el catalogo del Brain.\n');
  process.exit(1);
}

const publishable = components.filter((c) => c.publishable);
const usedStandards = new Set(publishable.flatMap((c) => c.standards.map((s) => s.standardId)));

const payload = {
  // Provenance, so a reader of the JSON can tell where it came from and that
  // it is generated rather than hand-edited.
  _generator: 'scripts/build-catalog.mjs',
  _source: 'PIPINGBOX-BRAIN/brain/08-CATALOG',
  _warning: 'FICHERO GENERADO. No editar a mano: se sobrescribe.',
  stats: {
    components: components.length,
    publishable: publishable.length,
    standards: Object.keys(standards).length,
    standardsInUse: usedStandards.size,
    dimensionSets: Object.keys(dimensionSets).length,
    dimensionRows: Object.values(dimensionSets).reduce((n, d) => n + d.rows.length, 0),
    drawings: components.reduce((n, c) => n + c.drawings.length, 0),
    renders: components.filter((c) => c.render).length,
  },
  components,
  standards,
  dimensionSets,
};

const json = JSON.stringify(payload, null, 2) + '\n';

if (checkOnly) {
  const current = existsSync(OUT_JSON) ? readFileSync(OUT_JSON, 'utf8') : '';
  if (current !== json) {
    console.error('\n✗ catalog.generated.json esta desactualizado.');
    console.error('  Ejecuta: node scripts/build-catalog.mjs\n');
    process.exit(1);
  }
  console.log('✓ catalog.generated.json al dia');
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_JSON, json);

console.log('\nCATALOGO GENERADO');
console.log(`  componentes        ${payload.stats.components} (${payload.stats.publishable} publicables)`);
console.log(`  normativas         ${payload.stats.standards} (${payload.stats.standardsInUse} en uso)`);
console.log(`  conj. dimensional  ${payload.stats.dimensionSets} / ${payload.stats.dimensionRows} filas`);
console.log(`  planos 2D          ${payload.stats.drawings}`);
console.log(`  renders 3D         ${payload.stats.renders}`);
console.log(`  -> ${OUT_JSON.replace(APP_ROOT + '/', '')}`);

if (warnings.length) {
  console.log(`\nAVISOS (${warnings.length}) — no bloquean, son huecos de dato:`);
  const shown = warnings.slice(0, 12);
  for (const w of shown) console.log(`  · ${w}`);
  if (warnings.length > shown.length) console.log(`  · … y ${warnings.length - shown.length} mas`);
}
console.log('');
