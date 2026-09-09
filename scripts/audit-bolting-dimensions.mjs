/**
 * Dimensional audit script for ASME B16.5 stud bolt data.
 *
 * Compares the legacy BOLT_DATA embedded in BoltsNutsTool.tsx (HEAD)
 * against the new canonical dataset generated from Brain YAML.
 *
 * Outputs a structured markdown report to stdout and to:
 *   /workspace/DASHBOARD-APP/audit-bolting-dimensions.md
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve new dataset via its public entry point (re-export).
const newDatasetModule = await import(
  join(__dirname, '../app/frontend/src/lib/bolting/asme-b16-5-stud-bolts.ts')
);
const { ASME_B16_5_STUD_BOLTS, ASME_B16_5_NPS_ORDER, ASME_B16_5_PRESSURE_CLASSES } =
  newDatasetModule;

function extractLegacyBoltData() {
  const oldSrc = execSync(
    'git show HEAD:app/frontend/src/components/tools/BoltsNutsTool.tsx',
    { cwd: join(__dirname, '..'), encoding: 'utf8' }
  );
  const match = oldSrc.match(/const BOLT_DATA: BoltSpec\[\] = ([\s\S]*?);\s*\nconst CLASSES/);
  if (!match) throw new Error('Could not locate legacy BOLT_DATA in HEAD');
  let jsonLike = match[1].trim();
  // Remove TypeScript type annotations that would break eval
  jsonLike = jsonLike.replace(/as const/g, '');
  // Evaluate safely; the source is from this repository.
  return eval('(' + jsonLike + ')');
}

const legacyData = extractLegacyBoltData();

function fracToDecimal(s) {
  const str = String(s).replace(/"/g, '').trim();
  if (!str) return null;
  const parts = str.split('-');
  let whole = 0;
  let frac = str;
  if (parts.length === 2) {
    whole = parseInt(parts[0], 10);
    frac = parts[1];
  }
  const [num, den] = frac.split('/').map((x) => parseInt(x, 10));
  if (!den) return parseFloat(str);
  return whole + num / den;
}

const legacyByClassNps = {};
for (const entry of legacyData) {
  for (const cls of [150, 300, 600, 900, 1500, 2500]) {
    const key = `class${cls}`;
    const row = entry[key];
    if (row) {
      legacyByClassNps[`${cls}|${entry.nps}`] = {
        nps: entry.nps,
        class: cls,
        qty: row.qty,
        diaIn: fracToDecimal(row.dia),
        lengthMm: row.length,
      };
    }
  }
}

const discrepancies = [];
const newOnly = [];
const legacyOnly = [];
const matches = [];

for (const cls of ASME_B16_5_PRESSURE_CLASSES) {
  const classData = ASME_B16_5_STUD_BOLTS[cls];
  if (!classData) continue;
  for (const nps of ASME_B16_5_NPS_ORDER) {
    const newRow = classData.rows[nps];
    const legacyKey = `${cls}|${nps}`;
    const legacyRow = legacyByClassNps[legacyKey];

    if (!newRow && !legacyRow) continue;

    if (newRow && !legacyRow) {
      newOnly.push({ cls, nps, newRow });
      continue;
    }
    if (!newRow && legacyRow) {
      legacyOnly.push({ cls, nps, legacyRow });
      continue;
    }

    const diff = [];
    if (newRow.qty !== legacyRow.qty) diff.push(`qty ${legacyRow.qty} -> ${newRow.qty}`);
    if (Math.abs(newRow.diaIn - legacyRow.diaIn) > 0.001)
      diff.push(`dia ${legacyRow.diaIn}" -> ${newRow.diaIn}"`);
    if (Math.abs(newRow.lengthRfMm - legacyRow.lengthMm) > 1)
      diff.push(`L_RF ${legacyRow.lengthMm} mm -> ${newRow.lengthRfMm} mm`);

    if (diff.length) {
      discrepancies.push({ cls, nps, legacy: legacyRow, new: newRow, diff });
    } else {
      matches.push({ cls, nps });
    }
  }
}

function fmtRow(r) {
  const len = r.lengthMm ?? r.lengthRfMm;
  return `qty=${r.qty}, d=${r.diaIn}" (${(r.diaIn * 25.4).toFixed(1)} mm), L_RF=${len} mm`;
}

const lines = [];
lines.push('# Audit dimensional — Stud Bolts ASME B16.5');
lines.push('');
lines.push(`**Fecha:** ${new Date().toISOString()}`);
lines.push(`**Baseline objetivo:** ASME B16.5-2025 (texto primario no disponible en este entorno)`);
lines.push(`**Fuente canónica:** PIPINGBOX-BRAIN/brain/08-CATALOG/ASME/BOLTING/PB-DIM-ASME-B16-5-STUD-BOLT.yaml`);
lines.push(`**Estado de verificación:** cross_reference_only (pending primary source)`);
lines.push('');
lines.push('## Resumen');
lines.push('');
lines.push(`- Combinaciones revisadas: ${ASME_B16_5_PRESSURE_CLASSES.length} clases × ${ASME_B16_5_NPS_ORDER.length} NPS = ${ASME_B16_5_PRESSURE_CLASSES.length * ASME_B16_5_NPS_ORDER.length}`);
lines.push(`- Coincidencias legacy vs nuevo: ${matches.length}`);
lines.push(`- Discrepancias encontradas: ${discrepancies.length}`);
lines.push(`- Combinaciones añadidas (no existían en legacy): ${newOnly.length}`);
lines.push(`- Combinaciones eliminadas (existían en legacy, no en nuevo): ${legacyOnly.length}`);
lines.push('');

if (discrepancies.length) {
  lines.push('## Discrepancias legacy → nuevo');
  lines.push('');
  for (const d of discrepancies) {
    lines.push(`### Class ${d.cls} / NPS ${d.nps}`);
    lines.push(`- Legacy:  ${fmtRow(d.legacy)}`);
    lines.push(`- Nuevo:   qty=${d.new.qty}, d=${d.new.diaIn}" (${(d.new.diaIn * 25.4).toFixed(1)} mm), L_RF=${d.new.lengthRfMm} mm`);
    lines.push(`- Cambios: ${d.diff.join('; ')}`);
    lines.push('');
  }
}

if (newOnly.length) {
  lines.push('## Combinaciones añadidas en nuevo dataset');
  lines.push('');
  for (const d of newOnly) {
    lines.push(`- Class ${d.cls} / NPS ${d.nps}: ${fmtRow(d.newRow)}`);
  }
  lines.push('');
}

if (legacyOnly.length) {
  lines.push('## Combinaciones presentes en legacy pero no en nuevo');
  lines.push('');
  for (const d of legacyOnly) {
    lines.push(`- Class ${d.cls} / NPS ${d.nps}: ${fmtRow(d.legacyRow)}`);
  }
  lines.push('');
}

// Highlight requested cases
lines.push('## Casos solicitados en GATE');
lines.push('');
const gateCases = [
  { cls: 150, nps: '2"', facing: 'RF' },
  { cls: 150, nps: '2"', facing: 'RTJ' },
  { cls: 400, nps: '2"', facing: 'RF' },
  { cls: 400, nps: '6"', facing: 'RF' },
  { cls: 150, nps: '3-1/2"', facing: 'RF' },
  { cls: 150, nps: '5"', facing: 'RF' },
  { cls: 300, nps: '22"', facing: 'RF' },
];
for (const { cls, nps, facing } of gateCases) {
  const row = ASME_B16_5_STUD_BOLTS[cls]?.rows[nps];
  lines.push(`### Class ${cls} / NPS ${nps} / ${facing}`);
  if (!row) {
    lines.push(`- **NO DEFINIDO** en dataset canónico.`);
  } else {
    const len = facing === 'RTJ' ? row.lengthRtjMm : row.lengthRfMm;
    lines.push(`- Cantidad: ${row.qty}`);
    lines.push(`- Diámetro: ${row.diaIn}" (${(row.diaIn * 25.4).toFixed(3)} mm)`);
    lines.push(`- Rosca: ${row.threadDesignation}, TPI=${row.tpi}, pitch=${row.pitchMm} mm`);
    lines.push(`- Longitud ${facing}: ${len === null ? 'N/A' : `${len} mm`}`);
    lines.push(`- Tuerca: AF=${row.nutAfMm} mm, H=${row.nutHeightMm} mm`);
    lines.push(`- Estado: ${row.verificationStatus}`);
  }
  lines.push('');
}

lines.push('## Notas y limitaciones');
lines.push('');
lines.push('- Todos los valores del dataset canónico están marcados como `cross_reference_only` porque el texto primario ASME B16.5-2025 no está disponible en este entorno.');
lines.push('- Las longitudes legacy eran sistemáticamente más cortas que las tabuladas por referencias cruzadas industriales (Texas Flange, etc.).');
lines.push('- NPS 22" aparece solo en Class 300 en el dataset actual; su inclusión en otras clases requiere validación primaria.');
lines.push('- Class 400 fue añadida completa pero permanece como `cross_reference_only` hasta validación contra ASME B16.5-2025.');
lines.push('- RF y RTJ se resuelven por campos separados; cuando la fuente no proporciona RTJ, el valor es `null`.');
lines.push('');

const report = lines.join('\n');
console.log(report);
writeFileSync(join(__dirname, '../audit-bolting-dimensions.md'), report, 'utf8');
console.log('\nReport written to audit-bolting-dimensions.md');
