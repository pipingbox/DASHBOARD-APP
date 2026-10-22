// PB-CV-AUTO-PROFILE-001 — Tests del motor de extracción (QA §17).
// Ejecutar: deno test --allow-read supabase/functions/_shared/cv-extraction/
//
// Fixtures sintéticos: CV completo (ES), CV incompleto, CV EN, CV PT,
// cobertura estructural del resto de idiomas, y casos negativos (no invención
// de campos, atributos sensibles jamás extraídos).

import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1';
import { extractCv, detectLanguage, parseCvDate } from './engine.ts';
import { CV_FIELD_NAMES, type ExtractedField } from './types.ts';

const NOW = '2026-10-16T12:00:00.000Z';
const DOC_ID = '00000000-0000-0000-0000-000000000001';

function run(text: string) {
  return extractCv({ text, sourceDocumentId: DOC_ID, now: NOW });
}

function getField(fields: ExtractedField[], name: string): ExtractedField | undefined {
  return fields.find((f) => f.field === name);
}

// ─── QA §17: CV completo (ES) ────────────────────────────────────────────────

const COMPLETE_CV_ES = `Juan Carlos Ramírez Solano
Pipefitter / Soldador TIG
Ubicación: Bilbao, España
Email: juan.ramirez@example.com
Teléfono: +34 612 345 678

Resumen profesional
Pipefitter y soldador TIG con 12 años de experiencia en montaje de tuberías
industriales en plantas químicas y refinerías. Experiencia en paradas de planta,
lectura de isométricos y pruebas de presión.

Experiencia laboral
Soldador TIG 141 — Trabind Upstream Services
03/2019 - Actualmente
Montaje de tuberías de acero inoxidable en planta química. Soldadura TIG 141
en spools de 2" a 12". Pruebas de presión y flanges.

Pipefitter — Norwind Industrial
06/2013 - 02/2019
Fabricación de tuberías en taller y montaje en obra. Lectura de isométricos
y planos P&ID.

Formación
FP Soldadura y Calderería — IES La Custodia (2009-2012)

Idiomas
Español: nativo
Inglés: B2
Portugués: básico

Certificaciones
VCA VOL
TIG 141 ISO 9606-1
Flange training EN 1591

Disponible inmediatamente
Disponible para viajar`;

Deno.test('CV completo ES: extrae los datos explícitos', () => {
  const result = run(COMPLETE_CV_ES);

  assertEquals(result.language, 'es');

  const name = getField(result.fields, 'full_name');
  assert(name, 'full_name extraído');
  assertEquals(name?.value, 'Juan Carlos Ramírez Solano');
  assertEquals(name?.source, 'cv');
  assertEquals(name?.source_document_id, DOC_ID);
  assertEquals(name?.extracted_at, NOW);

  const title = getField(result.fields, 'title');
  assertEquals(title?.value, 'Pipefitter / Soldador TIG');
  // Sin etiqueta "Título:": la línea 2 con roles del diccionario → medium.
  assertEquals(title?.confidence, 'medium');

  const location = getField(result.fields, 'location');
  assertEquals(location?.value, 'Bilbao, España');
  assertEquals(location?.confidence, 'high');

  const email = getField(result.fields, 'email');
  assertEquals(email?.value, 'juan.ramirez@example.com');

  const phone = getField(result.fields, 'phone');
  assert(phone, 'phone extraído');
  assertEquals(phone?.confidence, 'high');

  const years = getField(result.fields, 'years_experience');
  assertEquals(years?.value, 12);
  assertEquals(years?.confidence, 'high');

  const summary = getField(result.fields, 'summary');
  assert(String(summary?.value).includes('paradas de planta'));
  assertEquals(summary?.confidence, 'high');

  const skills = getField(result.fields, 'skills') as ExtractedField | undefined;
  const skillList = (skills?.value as string[]) ?? [];
  assert(skillList.includes('Pipefitting'), 'skills incluye Pipefitting');
  assert(skillList.includes('Welding'), 'skills incluye Welding');
  assert(skillList.includes('Pressure testing'), 'skills incluye Pressure testing');

  const processes = getField(result.fields, 'welding_processes');
  assert(((processes?.value as string[]) ?? []).includes('141 (GTAW/TIG)'));

  const langs = getField(result.fields, 'languages');
  const langList = (langs?.value as string[]) ?? [];
  assert(langList.includes('English'), 'inglés detectado como English');
  assert(langs?.confidence === 'high', 'idiomas con confianza high por sección');

  const education = getField(result.fields, 'education');
  assert(String(education?.value).includes('Soldadura'));

  const availability = getField(result.fields, 'availability');
  assertEquals(availability?.value, 'immediately');

  const travel = getField(result.fields, 'willing_to_travel');
  assertEquals(travel?.value, true);
});

Deno.test('CV completo ES: 2 experiencias estructuradas con fechas ISO', () => {
  const result = run(COMPLETE_CV_ES);
  assertEquals(result.experiences.length, 2);

  const current = result.experiences[0];
  assertEquals(current.company_name, 'Trabind Upstream Services');
  assertEquals(current.position, 'Soldador TIG 141');
  assertEquals(current.start_date, '2019-03');
  assertEquals(current.currently_working, true);
  assertEquals(current.end_date, null);

  const past = result.experiences[1];
  assertEquals(past.company_name, 'Norwind Industrial');
  assertEquals(past.position, 'Pipefitter');
  assertEquals(past.start_date, '2013-06');
  assertEquals(past.end_date, '2019-02');
  assertEquals(past.currently_working, false);
});

Deno.test('CV completo ES: certificaciones declaradas (nunca verificadas)', () => {
  const result = run(COMPLETE_CV_ES);
  const names = result.certifications.map((c) => c.name);
  assert(names.some((n) => n.startsWith('VCA-VOL')), 'VCA-VOL detectada');
  assert(names.some((n) => n.startsWith('TIG 141')), 'TIG 141 detectada');
  assert(names.some((n) => n.includes('Flange')), 'Flange training detectada');
  // La genérica se suprime cuando la específica ya está presente.
  assertFalse(names.some((n) => n.startsWith('VCA (Veiligheidscertificaat')), 'VCA genérica suprimida ante VCA-VOL');
  assertFalse(names.includes('ISO 9606-1 Welder qualification'), 'ISO 9606-1 genérica suprimida ante TIG 141');
  // El contrato no tiene campo "verified": declared/unverified es implícito
  // y lo refuerza la edge function de apply.
  for (const cert of result.certifications) {
    assert(!('verified' in cert), 'la propuesta jamás incluye estado de verificación');
  }
});

Deno.test('CV completo ES: el nombre posicional baja a low cuando no está etiquetado', () => {
  // En COMPLETE_CV_ES el nombre es la primera línea: low (posicional).
  const result = run(COMPLETE_CV_ES);
  assertEquals(getField(result.fields, 'full_name')?.confidence, 'low');
});

// ─── QA §17: CV incompleto — no inventar campos ──────────────────────────────

const SPARSE_CV = `Nombre: Marek Kowalczyk
Email: marek.k@example.com
Trabajé en construcción.`;

Deno.test('CV incompleto: solo extrae lo que existe', () => {
  const result = run(SPARSE_CV);
  assertEquals(getField(result.fields, 'full_name')?.value, 'Marek Kowalczyk');
  assertEquals(getField(result.fields, 'full_name')?.confidence, 'high');
  assertEquals(getField(result.fields, 'email')?.value, 'marek.k@example.com');
  // No hay años de experiencia declarados → nada.
  assertEquals(getField(result.fields, 'years_experience'), undefined);
  assertEquals(getField(result.fields, 'summary'), undefined);
  assertEquals(getField(result.fields, 'skills'), undefined);
  assertEquals(getField(result.fields, 'availability'), undefined);
  assertEquals(result.experiences.length, 0);
  assertEquals(result.certifications.length, 0);
});

Deno.test('CV vacío: cero campos, cero experiencias', () => {
  const result = run('');
  assertEquals(result.fields.length, 0);
  assertEquals(result.experiences.length, 0);
  assertEquals(result.language, null);
});

// ─── QA §17: idiomas ES/EN/PT + cobertura estructural ────────────────────────

const CV_EN = `John Smith
Mechanical Fitter
Location: Rotterdam, Netherlands
Email: j.smith@example.com
Phone: +31 6 1234 5678

Professional Summary
Mechanical fitter with 8 years of experience in petrochemical shutdowns.
Skilled in pipefitting, rigging and pressure testing. Willing to travel.

Work Experience
Mechanical Fitter - Doris Marine Contractors
01/2020 - Present
Pipe installation and flange assembly on offshore modules.

Workshop Plater - Fabricom
2015 - 12/2019
Pipe fabrication and structural welding.

Education
Level 3 NVQ Mechanical Engineering

Languages
Dutch: native
English: fluent

Available immediately`;

Deno.test('CV EN: extracción completa en inglés', () => {
  const result = run(CV_EN);
  assertEquals(result.language, 'en');
  assertEquals(getField(result.fields, 'location')?.value, 'Rotterdam, Netherlands');
  assertEquals(getField(result.fields, 'years_experience')?.value, 8);
  assertEquals(getField(result.fields, 'availability')?.value, 'immediately');
  assertEquals(getField(result.fields, 'willing_to_travel')?.value, true);
  assertEquals(result.experiences.length, 2);
  assertEquals(result.experiences[0].currently_working, true);
  const langs = (getField(result.fields, 'languages')?.value as string[]) ?? [];
  assert(langs.includes('English') && langs.includes('Dutch'));
});

const CV_PT = `Nome completo: Paulo Ferreira
Título profissional: Soldador / Montador de tubagens
Localidade: Setúbal, Portugal
Email: paulo.f@example.com

Resumo
Soldador com 15 anos de experiência em montagem de tubagens industriais.

Experiência profissional
Soldador TIG — Sopol Industria
05/2017 - Atualmente
Montagem de tubagens em refinaria. Soldadura TIG e MAG 136.

Formação
Curso de Soldadura — Escola Profissional de Setúbal

Línguas
Português: nativo
Inglês: intermédio

Disponível imediatamente`;

Deno.test('CV PT: extracción completa en portugués', () => {
  const result = run(CV_PT);
  assertEquals(result.language, 'pt');
  assertEquals(getField(result.fields, 'full_name')?.value, 'Paulo Ferreira');
  assertEquals(getField(result.fields, 'full_name')?.confidence, 'high');
  assertEquals(getField(result.fields, 'title')?.value, 'Soldador / Montador de tubagens');
  assertEquals(getField(result.fields, 'years_experience')?.value, 15);
  assertEquals(getField(result.fields, 'availability')?.value, 'immediately');
  assert(result.experiences.length >= 1);
  assertEquals(result.experiences[0].company_name, 'Sopol Industria');
  assert(((getField(result.fields, 'skills')?.value as string[]) ?? []).includes('Pipefitting'));
});

Deno.test('Cobertura estructural: NL/FR/DE/IT/RO/PL/UK/BG detectan idioma y años', () => {
  const samples: [string, string, number][] = [
    ['Pijpfitter met 9 jaar ervaring in de petrochemie.\nWerkervaring\nOpleiding', 'nl', 9],
    ['Tuyauteur avec 7 ans d\'expérience.\nFormation\nLangues', 'fr', 7],
    ['Rohrleitungsbauer mit 11 Jahren Erfahrung.\nAusbildung\nSprachen', 'de', 11],
    ['Tubista con 6 anni di esperienza.\nFormazione\nLingue', 'it', 6],
    ['Sudor cu 10 ani de experiență.\nFormare\nLimbi', 'ro', 10],
    ['Spawacz z 14 lat doświadczenia.\nWykształcenie\nJęzyki', 'pl', 14],
    ['Зварювальник з 8 років досвіду.\nОсвіта\nМови', 'uk', 8],
    ['Заварчик с 12 години опит.\nОбразование\nЕзици', 'bg', 12],
  ];
  for (const [text, expectedLang, expectedYears] of samples) {
    const result = run(text);
    assertEquals(result.language, expectedLang, `idioma detectado para ${expectedLang}`);
    assertEquals(getField(result.fields, 'years_experience')?.value, expectedYears, `años para ${expectedLang}`);
  }
});

// ─── QA §17: no invención de atributos ──────────────────────────────────────

Deno.test('Atributos sensibles: el motor no tiene extractores para ellos', () => {
  const cvWithNoise = `Nombre: Ana García
Email: ana@example.com
Nacionalidad: española, 34 años, casada, permiso de trabajo C1.
Experiencia: 5 años.`;
  const result = run(cvWithNoise);
  // Ningún campo fuera del enum cerrado puede existir.
  for (const f of result.fields) {
    assert((CV_FIELD_NAMES as readonly string[]).includes(f.field));
  }
  const names = result.fields.map((f) => f.field);
  assertFalse(names.includes('nationality' as never));
  assertFalse(names.includes('age' as never));
  assertFalse(names.includes('marital_status' as never));
  assertFalse(names.includes('work_permit' as never));
  // El enum cerrado es la garantía estructural: no hay campo sensible posible.
  assertEquals(names.includes('full_name'), true);
});

Deno.test('Disponibilidad vaga no se extrae', () => {
  const result = run(`Nombre: Jan de Vries\nFlexibel en inzetbaar.\nErvaring: 5 jaar`);
  assertEquals(getField(result.fields, 'availability'), undefined);
  assertEquals(getField(result.fields, 'willing_to_travel'), undefined);
});

// ─── Idempotencia del motor: misma entrada → misma salida ───────────────────

Deno.test('Determinismo: la misma entrada produce la misma salida', () => {
  const a = run(COMPLETE_CV_ES);
  const b = run(COMPLETE_CV_ES);
  assertEquals(a, b);
});

// ─── Utilidades de fecha ─────────────────────────────────────────────────────

Deno.test('parseCvDate: formatos habituales', () => {
  assertEquals(parseCvDate('03/2019'), '2019-03');
  assertEquals(parseCvDate('12-2019'), '2019-12');
  assertEquals(parseCvDate('2019'), '2019');
  assertEquals(parseCvDate('March 2024'), '2024-03');
  assertEquals(parseCvDate('marzo 2024'), '2024-03');
  assertEquals(parseCvDate('Actualmente'), null);
  assertEquals(parseCvDate(''), null);
  assertEquals(parseCvDate('present'), null);
});

Deno.test('detectLanguage: umbral mínimo', () => {
  assertEquals(detectLanguage('hello world'), null);
});

// ─── QA §17: experiencia con datos insuficientes no se crea ─────────────────

Deno.test('Experiencia sin fechas ni empresa no se fabrica', () => {
  const result = run(`Nombre: Piet Jansen
Email: piet@example.com
Trabajé en varios proyectos de tubería hace años.`);
  assertEquals(result.experiences.length, 0);
});
