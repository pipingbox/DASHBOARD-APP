#!/usr/bin/env node
/**
 * PB-ENT-E0B-BASELINE-DDL-001 — STATIC CONTRACT CI para docs/baseline/.
 *
 * Sin credenciales de producción (decisión PO §7-A): valida la integridad y el
 * formato de los artefactos versionados en docs/baseline/artifacts/.
 *
 *  - Sin artefactos: SKIP limpio (exit 0). La primera captura live está
 *    pendiente de regeneración de credenciales (gate PO §8.3).
 *  - Con artefactos: por cada uno exige JSON parseable, baseline_format_version
 *    "1.0", secciones obligatorias, provenance completo, contains_data_rows
 *    === false, las 9 tablas objetivo presentes o en missing_tables (cuyo
 *    contenido no vacío es drift crítico y falla el check) y sha256 conciliado
 *    con docs/baseline/MANIFEST.md.
 *
 * El LIVE DRIFT CHECK (extracción + diff contra producción) es manual /
 * programado / gate de release — ver docs/baseline/README.md §7.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const BASELINE_DIR = join(process.cwd(), 'docs', 'baseline');
const ARTIFACTS_DIR = join(BASELINE_DIR, 'artifacts');
const MANIFEST_PATH = join(BASELINE_DIR, 'MANIFEST.md');

const EXPECTED_TARGETS = [
  'app_14da0f1941_profiles',
  'app_14da0f1941_jobs',
  'app_14da0f1941_job_applications',
  'app_14da0f1941_work_day_logs',
  'app_14da0f1941_salary_rate_presets',
  'app_worker_certifications',
  'app_worker_experiences',
  'app_worker_documents',
  'app_academy_courses',
];

const REQUIRED_TOP_LEVEL = [
  'baseline_format_version',
  'provenance',
  'target_tables',
  'missing_tables',
  'tables',
  'dependent_functions',
  'dependent_types',
  'candidate_tables',
  'extensions',
];

const REQUIRED_TABLE_KEYS = [
  'name',
  'rls_enabled',
  'rls_forced',
  'acl_default',
  'columns',
  'constraints',
  'indexes',
  'triggers',
  'policies',
  'grants',
];

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.error(`FAIL ${msg}`);
};
const ok = (msg) => console.log(`PASS ${msg}`);

const files = existsSync(ARTIFACTS_DIR)
  ? readdirSync(ARTIFACTS_DIR).filter((f) => f.endsWith('.json')).sort()
  : [];

if (files.length === 0) {
  console.log(
    'SKIP baseline-contract: sin artefactos en docs/baseline/artifacts/ ' +
      '(primera captura live pendiente de regeneración de credenciales — gate PO §8.3).'
  );
  process.exit(0);
}

const manifest = existsSync(MANIFEST_PATH) ? readFileSync(MANIFEST_PATH, 'utf8') : '';
if (!manifest) fail('docs/baseline/MANIFEST.md ausente o vacío habiendo artefactos');

for (const file of files) {
  const full = join(ARTIFACTS_DIR, file);
  console.log(`\n--- ${file} ---`);

  let doc;
  try {
    doc = JSON.parse(readFileSync(full, 'utf8'));
    ok('JSON parseable');
  } catch (e) {
    fail(`JSON no parseable: ${e.message}`);
    continue;
  }

  if (doc.baseline_format_version === '1.0') ok('format_version=1.0');
  else fail(`baseline_format_version inesperada: ${doc.baseline_format_version}`);

  for (const key of REQUIRED_TOP_LEVEL) {
    if (key in doc) ok(`sección ${key}`);
    else fail(`falta sección obligatoria: ${key}`);
  }

  const prov = doc.provenance ?? {};
  for (const key of ['captured_at_utc', 'database', 'server_version', 'environment', 'repo_commit']) {
    if (prov[key]) ok(`provenance.${key}`);
    else fail(`provenance.${key} ausente o vacío`);
  }
  if (prov.read_only === true && prov.contains_data_rows === false)
    ok('provenance read_only/contains_data_rows');
  else fail('provenance read_only!==true o contains_data_rows!==false');

  const targets = doc.target_tables ?? [];
  if (JSON.stringify([...targets].sort()) === JSON.stringify([...EXPECTED_TARGETS].sort()))
    ok('target_tables = 9 objetivos del manifiesto');
  else fail(`target_tables difiere del OBJECT-MANIFEST: ${JSON.stringify(targets)}`);

  const missing = doc.missing_tables ?? [];
  if (missing.length === 0) ok('missing_tables vacío');
  else fail(`DRIFT CRÍTICO — tablas objetivo ausentes en el entorno: ${missing.join(', ')}`);

  const tableNames = new Set((doc.tables ?? []).map((t) => t.name));
  for (const name of EXPECTED_TARGETS) {
    if (missing.includes(name)) continue; // ya reportado arriba
    if (tableNames.has(name)) ok(`tabla ${name} presente`);
    else fail(`tabla ${name} ni en tables[] ni en missing_tables[]`);
  }

  for (const t of doc.tables ?? []) {
    const missingKeys = REQUIRED_TABLE_KEYS.filter((k) => !(k in t));
    if (missingKeys.length === 0) ok(`tabla ${t.name}: claves completas`);
    else fail(`tabla ${t.name}: faltan claves ${missingKeys.join(', ')}`);
  }

  // Conciliación sha256 con MANIFEST.md
  const sha = createHash('sha256').update(readFileSync(full)).digest('hex');
  if (manifest.includes(file) && manifest.includes(sha)) ok('sha256 conciliado con MANIFEST.md');
  else fail(`MANIFEST.md no registra ${file} con su sha256 (${sha})`);
}

console.log();
if (failures > 0) {
  console.error(`RESULTADO: FAIL (${failures} problemas)`);
  process.exit(1);
}
console.log(`RESULTADO: PASS (${files.length} artefacto(s) validados)`);
