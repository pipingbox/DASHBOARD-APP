// PB-CV-EXPERIENCE-DERIVATION-001 — Tests deterministas del cálculo de
// experiencia derivada (ticket FASE 7, casos 1-9) y del wiring del motor
// (provenance, confianza, discrepancia, idempotencia — casos 12).
//
// Ejecutar: deno test --allow-read supabase/functions/_shared/cv-extraction/
//
// `now` siempre inyectado → determinismo total.

import { assertEquals } from 'jsr:@std/assert@1';
import {
  classifyExplicitDerived,
  deriveExperienceMonths,
  EXPLICIT_DERIVED_DISCREPANCY_YEARS,
} from './experienceDerivation.ts';
import { extractCv } from './engine.ts';
import type { ProposedExperience } from './types.ts';

const NOW = '2026-10-16T12:00:00.000Z'; // now absoluto = 2026*12 + 9
const DOC_ID = '00000000-0000-0000-0000-000000000001';

function exp(
  start: string | null,
  end: string | null,
  currently = false,
): ProposedExperience {
  return {
    local_id: 'exp-t',
    company_name: 'ACME',
    position: 'Pipefitter',
    project_name: null,
    city_region: null,
    country: null,
    start_date: start,
    end_date: end,
    currently_working: currently,
    description_original: null,
    confidence: 'medium',
  };
}

function years(experiences: ProposedExperience[]): number | null {
  return deriveExperienceMonths(experiences, NOW)?.derivedYears ?? null;
}

// ─── FASE 7.1 — una experiencia: 2015-01 → 2020-01 = 5 años ────────────────
Deno.test('derivation.1.single_experience_5_years', () => {
  const d = deriveExperienceMonths([exp('2015-01', '2020-01')], NOW);
  assertEquals(d?.totalMonths, 61); // inclusivo ambos extremos
  assertEquals(d?.derivedYears, 5);
  assertEquals(d?.fullPrecision, true);
});

// ─── FASE 7.2 — dos consecutivas: 2010-01→2015-01 + 2015-01→2020-01 = 10 ───
Deno.test('derivation.2.consecutive_10_years', () => {
  const d = deriveExperienceMonths(
    [exp('2010-01', '2015-01'), exp('2015-01', '2020-01')],
    NOW,
  );
  assertEquals(d?.derivedYears, 10);
});

// ─── FASE 7.3 — solapadas: 2010→2015 + 2013→2018 = 8, NO 10 ────────────────
Deno.test('derivation.3.overlapping_no_double_count', () => {
  assertEquals(
    years([exp('2010-01', '2015-01'), exp('2013-01', '2018-01')]),
    8,
  );
});

// ─── FASE 7.4 — contenida: 2010→2020 + 2015→2017 = 10 ──────────────────────
Deno.test('derivation.4.contained_no_artificial_increment', () => {
  assertEquals(
    years([exp('2010-01', '2020-01'), exp('2015-01', '2017-01')]),
    10,
  );
});

// ─── FASE 7.5 — trabajo actual: 2020-01 → present (now inyectado) ──────────
Deno.test('derivation.5.current_job_uses_injected_now', () => {
  // 2020-01 → 2026-10 inclusive = 82 meses = 6 años
  const d = deriveExperienceMonths([exp('2020-01', null, true)], NOW);
  assertEquals(d?.totalMonths, 82);
  assertEquals(d?.derivedYears, 6);
});

// ─── FASE 7.6 — solo años: 2010 → 2015 (punto medio documentado) ────────────
Deno.test('derivation.6.year_only_midpoint_policy', () => {
  // 2010(=jul 2010) → 2015(=jul 2015) = 61 meses = 5 años; precisión parcial
  const d = deriveExperienceMonths([exp('2010', '2015')], NOW);
  assertEquals(d?.derivedYears, 5);
  assertEquals(d?.fullPrecision, false);
});

// ─── FASE 7.7 — fechas inválidas: no inventar, no romper ────────────────────
Deno.test('derivation.7.invalid_dates_ignored', () => {
  assertEquals(deriveExperienceMonths([exp(null, null)], NOW), null);
  assertEquals(deriveExperienceMonths([exp('2015-13', '2020-01')], NOW), null);
  assertEquals(deriveExperienceMonths([exp('bogus', '2020-01')], NOW), null);
  // Fin anterior al inicio: intervalo inutilizable, no negativo.
  assertEquals(deriveExperienceMonths([exp('2020-01', '2015-01')], NOW), null);
  // Mezcla: un intervalo malo no impide usar el bueno.
  const d = deriveExperienceMonths(
    [exp('bogus', '2020-01'), exp('2015-01', '2020-01')],
    NOW,
  );
  assertEquals(d?.derivedYears, 5);
  assertEquals(d?.intervalsUsed, 1);
  assertEquals(d?.intervalsTotal, 2);
});

// ─── FASE 7.7b — YYYY-MM-DD se trunca a mes (formato soportado FASE 2A) ─────
Deno.test('derivation.7b.iso_full_date_truncated_to_month', () => {
  const d = deriveExperienceMonths([exp('2015-01-15', '2020-01-10')], NOW);
  assertEquals(d?.derivedYears, 5);
});

// ─── FASE 7.8 — explícito coherente: "15 years experience" + cronología ~15 ─
Deno.test('derivation.8.engine_explicit_coherent_stays_high', () => {
  const cv = `Ana López
Soldador

Resumen profesional
Soldador TIG con 15 years experience en plantas industriales y refinerías
de toda Europa.

Experiencia laboral
Soldador TIG — ACME Industrial
01/2011 - 01/2026
Montaje y soldadura de tuberías.
`;
  const r = extractCv({ text: cv, sourceDocumentId: DOC_ID, now: NOW });
  const f = r.fields.find((x) => x.field === 'years_experience');
  assertEquals(f?.value, 15);
  assertEquals(f?.confidence, 'high');
  assertEquals(f?.provenance, 'cv_text');
  assertEquals(f?.derivation?.consistency, 'coherent');
});

// ─── FASE 7.9 — explícito muy discrepante: "20 years" + cronología 7 ────────
Deno.test('derivation.9.engine_explicit_discrepant_forces_review', () => {
  const cv = `Ana López
Soldador

Resumen profesional
Profesional con 20 years experience en montaje industrial.

Experiencia laboral
Soldador — ACME Industrial
06/2019 - 06/2026
Montaje y soldadura.
`;
  const r = extractCv({ text: cv, sourceDocumentId: DOC_ID, now: NOW });
  const f = r.fields.find((x) => x.field === 'years_experience');
  assertEquals(f?.value, 20); // el explícito NO se sobrescribe
  assertEquals(f?.confidence, 'low'); // exige revisión explícita
  assertEquals(f?.derivation?.consistency, 'discrepant');
  assertEquals(f?.derivation?.derived_years, 7);
});

// ─── FASE 2 — sin explícito: propone el derivado con provenance ─────────────
Deno.test('derivation.10.engine_derived_when_no_explicit', () => {
  const cv = `Ana López
Soldador TIG

Experiencia laboral
Soldador TIG — ACME Industrial
03/2016 - 03/2026
Montaje de tuberías industriales.
`;
  const r = extractCv({ text: cv, sourceDocumentId: DOC_ID, now: NOW });
  const f = r.fields.find((x) => x.field === 'years_experience');
  assertEquals(f?.value, 10);
  assertEquals(f?.provenance, 'derived_from_experience_dates');
  assertEquals(f?.confidence, 'high'); // precisión completa, 1/1 intervalos
  assertEquals(f?.derivation?.total_months, 121);
});

Deno.test('derivation.10b.engine_derived_medium_with_year_only_dates', () => {
  const cv = `Ana López
Soldador TIG

Experiencia laboral
Soldador — ACME Industrial
2010 - 2020
Trabajos varios de soldadura en planta.
`;
  const r = extractCv({ text: cv, sourceDocumentId: DOC_ID, now: NOW });
  const f = r.fields.find((x) => x.field === 'years_experience');
  assertEquals(f?.value, 10);
  assertEquals(f?.provenance, 'derived_from_experience_dates');
  assertEquals(f?.confidence, 'medium'); // fechas solo-año → medium
});

// ─── FASE 7.12 — idempotencia: reprocesar no altera el cálculo ──────────────
Deno.test('derivation.12.idempotent_reprocessing', () => {
  const cv = `Ana López
Soldador

Experiencia laboral
Soldador — ACME A
01/2010 - 01/2015
Trabajo en planta química.
Soldador — ACME B
01/2013 - 01/2018
Trabajo simultáneo en refinería.
`;
  const r1 = extractCv({ text: cv, sourceDocumentId: DOC_ID, now: NOW });
  const r2 = extractCv({ text: cv, sourceDocumentId: DOC_ID, now: NOW });
  const f1 = r1.fields.find((x) => x.field === 'years_experience');
  const f2 = r2.fields.find((x) => x.field === 'years_experience');
  assertEquals(f1, f2);
  assertEquals(f1?.value, 8); // solapadas: NO 10
  assertEquals(r1.experiences.length, r2.experiences.length);
});

// ─── Menos de 1 año: no se emite propuesta (campo entero, no inventar) ──────
Deno.test('derivation.13.less_than_one_year_not_emitted', () => {
  const cv = `Ana López
Soldador

Experiencia laboral
Soldador — ACME
06/2026 - 09/2026
Contrato corto de verano.
`;
  const r = extractCv({ text: cv, sourceDocumentId: DOC_ID, now: NOW });
  assertEquals(r.fields.find((x) => x.field === 'years_experience'), undefined);
});

// ─── Clasificador: umbrales deterministas ────────────────────────────────────
Deno.test('derivation.classifier_thresholds', () => {
  assertEquals(classifyExplicitDerived(15, 15), 'coherent');
  assertEquals(classifyExplicitDerived(15, 16), 'coherent');
  assertEquals(classifyExplicitDerived(15, 13), 'uncertain');
  assertEquals(classifyExplicitDerived(15, 12), 'discrepant');
  assertEquals(EXPLICIT_DERIVED_DISCREPANCY_YEARS, 3);
});

// ─── Dos empleos simultáneos de 2 años = 2, no 4 (regla FASE 2B) ────────────
Deno.test('derivation.simultaneous_jobs_count_once', () => {
  assertEquals(
    years([exp('2020-01', '2022-01'), exp('2020-01', '2022-01')]),
    2,
  );
});
