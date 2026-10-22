// PB-CV-AUTO-PROFILE-001 — Motor de extracción de datos de CV.
//
// REGLA FUNDAMENTAL (ticket §2): solo se extrae lo que aparece EXPLICITAMENTE.
// El motor no tiene extractores para atributos sensibles (nacionalidad,
// permiso de trabajo, situación migratoria, estado civil, edad, salud,
// religión, etnia): no se filtran, directamente no existen.
//
// El motor es determinista y basado en reglas (sin LLM externo): el texto del
// CV nunca sale de la infraestructura de PipingBox (ticket §12 — la
// extracción puede contener PII profesional).
//
// Modelo de confianza (ticket §13):
//   high   — etiqueta explícita o patrón inequívoco;
//   medium — patrón fuerte contextual (diccionario técnico, bloque fechado);
//   low    — heurística posicional. Low NUNCA se autoacepta; siempre se
//            muestra al usuario para revisión.
//
// Módulo puro: sin APIs de Deno ni de navegador.

import {
  AVAILABILITY_PATTERNS,
  CERTIFICATION_DICTIONARY,
  CERTIFICATION_SUPPRESS_WHEN,
  CURRENT_JOB_ALT,
  DATE_RANGE_PATTERN,
  DISCIPLINE_DICTIONARY,
  EDUCATION_HEADINGS,
  EMAIL_PATTERN,
  EMPLOYER_LABELS,
  EXPERIENCE_HEADINGS,
  FULL_NAME_LABELS,
  LANGUAGE_LEVEL_PATTERN,
  LANGUAGE_MARKERS,
  LANGUAGES_HEADINGS,
  LOCATION_LABELS,
  normalizeForMatch,
  PHONE_DATE_REJECT,
  PHONE_PATTERN,
  POSITION_LABELS,
  SKILL_DICTIONARY,
  SPOKEN_LANGUAGE_DICTIONARY,
  SUMMARY_HEADINGS,
  TITLE_LABELS,
  WILLING_TO_RELOCATE_PATTERNS,
  WILLING_TO_TRAVEL_PATTERNS,
  WELDING_PROCESS_DICTIONARY,
} from './dictionaries.ts';
import {
  CV_LANGUAGES,
  type Confidence,
  type CvLanguage,
  type ExtractedField,
  type ExtractionInput,
  type ExtractionResult,
  type ProposedCertification,
  type ProposedExperience,
} from './types.ts';
import {
  classifyExplicitDerived,
  deriveExperienceMonths,
} from './experienceDerivation.ts';

// ─── Normalización del texto de entrada ──────────────────────────────────────

interface Lines {
  raw: string[];
  normalized: string[];
}

function prepareLines(text: string): Lines {
  const raw = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim());
  return { raw, normalized: raw.map(normalizeForMatch) };
}

// ─── Detección de idioma ─────────────────────────────────────────────────────

export function detectLanguage(text: string): CvLanguage | null {
  const normalized = normalizeForMatch(text);
  let best: CvLanguage | null = null;
  let bestScore = 0;
  for (const lang of CV_LANGUAGES) {
    let score = 0;
    for (const marker of LANGUAGE_MARKERS[lang]) {
      const count = normalized.split(normalizeForMatch(marker)).length - 1;
      if (count > 0) score += Math.min(count, 3);
    }
    if (score > bestScore) {
      bestScore = score;
      best = lang;
    }
  }
  // Umbral mínimo: con menos de 2 marcadores no afirmamos idioma.
  return bestScore >= 2 ? best : null;
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const DATE_RANGE_RE = new RegExp(DATE_RANGE_PATTERN, 'i');
const CURRENT_RE = new RegExp('^(' + CURRENT_JOB_ALT + ')$', 'i');

/** Rango de fechas al inicio de la línea (cabecera típica de experiencia). */
function dateRangeAtLineStart(line: string): boolean {
  const m = DATE_RANGE_RE.exec(line);
  return !!m && (m.index ?? 0) <= 4;
}

function isAnyHeading(normalizedLine: string): boolean {
  if (!normalizedLine || normalizedLine.length > 60) return false;
  const bare = normalizedLine.replace(/[:•\-–—|]+$/g, '').trim();
  return ALL_HEADINGS.some((h) => {
    const nh = normalizeForMatch(h);
    return bare === nh || bare === nh + 's';
  });
}

function matchesHeading(normalizedLine: string, headings: readonly string[]): boolean {
  if (!normalizedLine || normalizedLine.length > 60) return false;
  const bare = normalizedLine.replace(/[:•\-–—|]+$/g, '').trim();
  return headings.some((h) => {
    const nh = normalizeForMatch(h);
    return bare === nh || bare === nh + 's' || (bare.endsWith(':') && bare.slice(0, -1) === nh);
  });
}

const ALL_HEADINGS: readonly string[] = [
  ...SUMMARY_HEADINGS, ...EXPERIENCE_HEADINGS, ...EDUCATION_HEADINGS,
  ...LANGUAGES_HEADINGS,
];

/** Líneas de una sección: desde el encabezado hasta el siguiente encabezado
 *  conocido o una línea que EMPIEZA con un rango de fechas. */
function sectionLines(lines: Lines, headings: readonly string[], maxLines = 8): string[] | null {
  const idx = lines.normalized.findIndex((l) => matchesHeading(l, headings));
  if (idx === -1) return null;
  const out: string[] = [];
  for (let i = idx + 1; i < lines.raw.length && out.length < maxLines; i++) {
    const raw = lines.raw[i];
    if (!raw) continue;
    if (isAnyHeading(lines.normalized[i]) || dateRangeAtLineStart(raw)) break;
    out.push(raw);
  }
  return out.length ? out : null;
}

/** Extrae "Label: value" con etiquetas en cualquier idioma soportado. */
function extractLabeled(
  lines: Lines,
  labels: readonly string[],
): { value: string; lineIdx: number } | null {
  for (let i = 0; i < lines.normalized.length; i++) {
    const line = lines.normalized[i];
    for (const label of labels) {
      const nl = normalizeForMatch(label);
      const m = line.match(new RegExp('^' + escapeRe(nl) + '\\s*[:•\\-–—|]\\s*(.+)$'));
      if (m && m[1].trim().length > 0 && m[1].trim().length <= 90) {
        return { value: stripLabel(lines.raw[i]), lineIdx: i };
      }
    }
  }
  return null;
}

function stripLabel(raw: string): string {
  const m = raw.match(/^[^:•|]{1,40}[:•|]\s*(.*)$/);
  if (m && m[1].trim()) return m[1].trim();
  // Etiqueta con guion: "Ubicación - Bilbao".
  const m2 = raw.match(/^\s*[A-Za-zÀ-ÿ\u0100-\u017F\u0400-\u04FF][^\-–—]{1,30}\s+[-–—]\s+(.*)$/);
  return m2 && m2[1].trim() ? m2[1].trim() : raw.trim();
}

// ─── Constructores de campos ─────────────────────────────────────────────────

interface EngineCtx {
  sourceDocumentId: string;
  now: string;
}

function field(
  ctx: EngineCtx,
  name: ExtractedField['field'],
  value: ExtractedField['value'],
  confidence: Confidence,
): ExtractedField {
  return {
    field: name,
    value,
    source: 'cv',
    confidence,
    extracted_at: ctx.now,
    source_document_id: ctx.sourceDocumentId,
  };
}

// ─── Nombre completo ─────────────────────────────────────────────────────────

const NAME_STOPWORDS = /curriculum|vitae|resume|cv|profile|perfil|address|direccion|telefon|phone|email|correo|experiencia|experience|erfahrung/i;

function looksLikeName(candidate: string): boolean {
  const value = candidate.trim();
  if (!value || value.length > 64 || value.length < 3) return false;
  if (/\d|@|https?:|www\.|\//.test(value)) return false;
  if (NAME_STOPWORDS.test(value)) return false;
  const words = value.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  return words.every((w) => /^[A-ZÀ-ÿ\u0100-\u017F\u0400-\u04FF][a-zà-ÿ\u0100-\u017F\u0400-\u04FF'-]*$/i.test(w));
}

function extractFullName(lines: Lines): { value: string; confidence: Confidence } | null {
  // 1) Etiquetado explícito → high.
  const labeled = extractLabeled(lines, FULL_NAME_LABELS);
  if (labeled && looksLikeName(labeled.value)) {
    return { value: labeled.value, confidence: 'high' };
  }
  // 2) Primera línea con forma de nombre → low (posicional: confirmar).
  const first = lines.raw.find((l) => l.length > 0);
  if (first && looksLikeName(first)) {
    return { value: first, confidence: 'low' };
  }
  return null;
}

// ─── Contacto ────────────────────────────────────────────────────────────────

function extractEmail(text: string): string | null {
  const m = text.toLowerCase().match(new RegExp(EMAIL_PATTERN));
  return m ? m[0] : null;
}

/**
 * Teléfono: solo del bloque de contacto (primeras 15 líneas) y rechazando
 * candidatos con forma de fecha (evita "06/2013 - 02/2019" como teléfono).
 */
function extractPhone(lines: Lines): string | null {
  const head = lines.raw.slice(0, 15).join('\n');
  const re = new RegExp(PHONE_PATTERN, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(head)) !== null) {
    const candidate = m[0].trim();
    const digits = candidate.replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 15 && !PHONE_DATE_REJECT.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

// ─── Años de experiencia ─────────────────────────────────────────────────────

const YEARS_EXPERIENCE_AFTER =
  '(\\d{1,2})\\s*\\+?\\s*' +
  '(?:years?|yrs?|jaar|jaren|jahre|jahren|anos?|ans|ann[ée]es|annees|anni|ani|lat|lata|роки|років|години|г)?\\s*' +
  "(?:of\\s+|de\\s+|di\\s+|d['’]?\\s*)?" +
  '(?:experience|experiencia|ervaring|erfahrung|esperienza|experienta|doswiadczenia|doswiadczenie|dosvidu|досвіду|досвід|опит)';

const YEARS_EXPERIENCE_BEFORE =
  '(?:experience|experiencia|ervaring|erfahrung|esperienza|experienta|doswiadczenia|doswiadczenie|dosvidu|досвіду|досвід|опит)\\s*[:\-–—]?\\s*' +
  '(\\d{1,2})\\s*\\+?\\s*' +
  '(?:years?|yrs?|jaar|jaren|jahre|jahren|anos?|ans|anni|ani|lat|lata|роки|років|години|г)';

function extractYearsExperience(normalizedText: string): number | null {
  for (const pattern of [YEARS_EXPERIENCE_AFTER, YEARS_EXPERIENCE_BEFORE]) {
    const m = normalizedText.match(new RegExp(pattern));
    if (!m) continue;
    const years = parseInt(m[1] ?? '', 10);
    if (Number.isFinite(years) && years > 0 && years <= 60) return years;
  }
  return null;
}

// ─── Diccionarios técnicos ───────────────────────────────────────────────────

const WORD_CHAR = 'a-zà-ÿ\\u0100-\\u017f\\u0400-\\u04ff';

function matchDictionary(
  normalizedText: string,
  dictionary: Readonly<Record<string, readonly string[]>>,
): string[] {
  const found: string[] = [];
  for (const [canonical, variants] of Object.entries(dictionary)) {
    for (const variant of variants) {
      const nv = normalizeForMatch(variant);
      if (!nv) continue;
      // Numéricas (111, 136, 6g): frontera por no-dígito/letra.
      // Alfabéticas: frontera de palabra + "s" final tolerada (plural).
      const pattern = /^\d/.test(nv)
        ? '(?:^|[^0-9])' + escapeRe(nv) + '(?![0-9])'
        : '(?:^|[^' + WORD_CHAR + '])' + escapeRe(nv) + 's?(?![' + WORD_CHAR + '])';
      if (new RegExp(pattern).test(normalizedText)) {
        found.push(canonical);
        break;
      }
    }
  }
  return found;
}

// ─── Idiomas hablados ────────────────────────────────────────────────────────

function matchSpoken(normalizedText: string): string[] {
  const found: string[] = [];
  for (const [canonical, variants] of Object.entries(SPOKEN_LANGUAGE_DICTIONARY)) {
    for (const variant of variants) {
      const nv = normalizeForMatch(variant);
      if (new RegExp('(?:^|[^' + WORD_CHAR + '])' + escapeRe(nv) + '(?![' + WORD_CHAR + '])').test(normalizedText)) {
        found.push(canonical);
        break;
      }
    }
  }
  return found;
}

function extractSpokenLanguages(lines: Lines): { values: string[]; confidence: Confidence } | null {
  const section = sectionLines(lines, LANGUAGES_HEADINGS, 6);
  if (section) {
    const found = matchSpoken(normalizeForMatch(section.join('\n')));
    if (found.length) return { values: found, confidence: 'high' };
  }
  // Fuera de sección: patrón "idioma: nivel" en cualquier línea.
  const levelRe = new RegExp(LANGUAGE_LEVEL_PATTERN, 'i');
  for (let i = 0; i < lines.normalized.length; i++) {
    const line = lines.normalized[i];
    if (line.includes(':') && levelRe.test(line)) {
      const found = matchSpoken(line);
      if (found.length) return { values: found, confidence: 'medium' };
    }
  }
  return null;
}

// ─── Experiencia laboral ─────────────────────────────────────────────────────

interface DateRange {
  lineIdx: number;
  startRaw: string;
  endRaw: string | null;
  currently: boolean;
}

/** Convierte "03/2024", "March 2024", "2024" → "2024-03" | "2024" | null. */
export function parseCvDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = normalizeForMatch(raw.trim());
  if (CURRENT_RE.test(value)) return null;
  const MONTHS: Record<string, string> = {
    jan: '01', januar: '01', january: '01', januari: '01', janvier: '01', janeiro: '01', genn: '01', ian: '01', styc: '01', січ: '01', ян: '01',
    feb: '02', febru: '02', februar: '02', february: '02', fevrier: '02', fevereiro: '02',
    mar: '03', marzo: '03', march: '03', maart: '03', marto: '03', mars: '03', мар: '03', берез: '03',
    apr: '04', abril: '04', april: '04', avril: '04',
    may: '05', mayo: '05', mai: '05', magg: '05', maj: '05', трав: '05',
    jun: '06', junio: '06', june: '06', juni: '06', juin: '06', giugno: '06', czer: '06', черв: '06',
    jul: '07', julio: '07', july: '07', juli: '07', juillet: '07', luglio: '07', lipi: '07', лип: '07',
    aug: '08', agosto: '08', august: '08', augustus: '08', aou: '08', серп: '08',
    sep: '09', sept: '09', septiembre: '09', setiembre: '09', set: '09', setembro: '09', september: '09', settem: '09', wrzes: '09', вере: '09', септ: '09',
    oct: '10', octubre: '10', october: '10', outubro: '10', oktober: '10', octobre: '10', ottob: '10', ottobre: '10', pazio: '10', listop: '10', жовт: '10', окт: '10',
    nov: '11', noviembre: '11', november: '11', novembro: '11', novembre: '11', novemb: '11', листо: '11', ноя: '11',
    dec: '12', diciembre: '12', december: '12', dezembro: '12', décembre: '12', dezemb: '12', dezes: '12', grud: '12', груд: '12', дек: '12',
  };
  let m = value.match(/^(0?[1-9]|1[0-2])[/.-]((?:19|20)\d{2})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  m = value.match(/^((?:19|20)\d{2})$/);
  if (m) return m[1];
  m = value.match(/^([a-zà-ÿ\u0400-\u04ff]{3,10})\.?\s*((?:19|20)\d{2})$/);
  if (m) {
    const mm = MONTHS[m[1].slice(0, 5)] ?? MONTHS[m[1].slice(0, 4)] ?? MONTHS[m[1].slice(0, 3)];
    return mm ? `${m[2]}-${mm}` : m[2];
  }
  m = value.match(/^\d{1,2}\s+([a-zà-ÿ\u0400-\u04ff]{3,10})\.?\s*((?:19|20)\d{2})$/);
  if (m) {
    const mm = MONTHS[m[1].slice(0, 5)] ?? MONTHS[m[1].slice(0, 4)] ?? MONTHS[m[1].slice(0, 3)];
    return mm ? `${m[2]}-${mm}` : m[2];
  }
  return null;
}

function findSectionBounds(lines: Lines): { start: number; end: number } {
  const expIdx = lines.normalized.findIndex((l) => matchesHeading(l, EXPERIENCE_HEADINGS));
  if (expIdx === -1) return { start: 0, end: lines.raw.length - 1 };
  let end = lines.raw.length - 1;
  for (let i = expIdx + 1; i < lines.normalized.length; i++) {
    if (isAnyHeading(lines.normalized[i])) {
      end = i - 1;
      break;
    }
  }
  return { start: expIdx + 1, end };
}

function findDateRanges(lines: Lines, bounds: { start: number; end: number }): DateRange[] {
  const ranges: DateRange[] = [];
  for (let i = bounds.start; i <= bounds.end; i++) {
    const line = lines.raw[i];
    if (!line || line.length > 120) continue;
    const m = line.match(DATE_RANGE_RE);
    if (m && (m.index ?? 0) <= 4) {
      ranges.push({
        lineIdx: i,
        startRaw: m[1],
        endRaw: m[2] ?? null,
        currently: !!m[2] && CURRENT_RE.test(m[2].trim()),
      });
    }
  }
  return ranges;
}

/** Divide "Puesto — Empresa" en sus dos partes. */
function splitRoleCompany(candidate: string): { position: string; company: string } {
  const value = candidate.trim();
  if (!value) return { position: '', company: '' };
  const parts = value.split(/\s+[—–|]\s+|\s+-\s+|,\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { position: parts[0].slice(0, 100), company: parts.slice(1).join(', ').slice(0, 100) };
  }
  // Parte única: si parece un rol del diccionario → puesto; si no → empresa.
  const looksLikeRole = matchDictionary(normalizeForMatch(value), SKILL_DICTIONARY).length > 0;
  return looksLikeRole
    ? { position: value.slice(0, 100), company: '' }
    : { position: '', company: value.slice(0, 100) };
}

function extractExperiences(lines: Lines): ProposedExperience[] {
  const bounds = findSectionBounds(lines);
  const ranges = findDateRanges(lines, bounds);
  const experiences: ProposedExperience[] = [];
  let seq = 1;

  for (let r = 0; r < ranges.length; r++) {
    const range = ranges[r];
    const nextRange = ranges[r + 1];
    let position = '';
    let company = '';
    let labeled = false;

    // 1) Etiquetas Employer:/Position: en el bloque (±3 líneas de la fecha).
    const labelScanEnd = Math.min(bounds.end, range.lineIdx + 3);
    for (let i = Math.max(bounds.start, range.lineIdx - 3); i <= labelScanEnd; i++) {
      const nl = lines.normalized[i];
      for (const label of EMPLOYER_LABELS) {
        const m = nl.match(new RegExp('^' + escapeRe(normalizeForMatch(label)) + '\\s*[:•\\-–—|]\\s*(.+)$'));
        if (m && !company) {
          company = stripLabel(lines.raw[i]).slice(0, 100);
          labeled = true;
        }
      }
      for (const label of POSITION_LABELS) {
        const m = nl.match(new RegExp('^' + escapeRe(normalizeForMatch(label)) + '\\s*[:•\\-–—|]\\s*(.+)$'));
        if (m && !position) {
          position = stripLabel(lines.raw[i]).slice(0, 100);
          labeled = true;
        }
      }
    }

    // 2) La propia línea de fechas (si tiene texto extra) y la línea
    //    inmediatamente anterior con formato "Puesto — Empresa".
    const candidates: string[] = [];
    const dateLineRemainder = lines.raw[range.lineIdx].replace(new RegExp(DATE_RANGE_PATTERN, 'gi'), '').replace(/^[\s,|.\-–—]+|[\s,|.\-–—]+$/g, '');
    if (dateLineRemainder) candidates.push(dateLineRemainder);
    const aboveIdx = range.lineIdx - 1;
    if (aboveIdx >= bounds.start) {
      const above = lines.raw[aboveIdx];
      if (above && above.length <= 100 && !dateRangeAtLineStart(above) && !isAnyHeading(lines.normalized[aboveIdx])) {
        candidates.push(above);
      }
    }
    for (const cand of candidates) {
      const parts = splitRoleCompany(cand);
      if (!position && parts.position) position = parts.position;
      if (!company && parts.company) company = parts.company;
    }

    // 3) Descripción: líneas posteriores hasta la siguiente experiencia.
    const description: string[] = [];
    const descEnd = Math.min(
      bounds.end,
      range.lineIdx + 8,
      nextRange ? nextRange.lineIdx - 2 : bounds.end,
    );
    for (let i = range.lineIdx + 1; i <= descEnd; i++) {
      const raw = lines.raw[i];
      if (!raw || dateRangeAtLineStart(raw) || isAnyHeading(lines.normalized[i])) continue;
      const nr = normalizeForMatch(raw);
      if (nr === normalizeForMatch(position) || nr === normalizeForMatch(company)) continue;
      description.push(raw);
    }

    const start = parseCvDate(range.startRaw);
    const end = range.currently ? null : parseCvDate(range.endRaw);

    // Regla §5: crear experiencia SOLO con datos suficientes. Puesto o
    // empresa + al menos una fecha utilizable. Nada se fabrica.
    const hasCore = (position && position.length >= 2) || (company && company.length >= 2);
    const hasAnyDate = !!start || !!end || range.currently;
    if (!hasCore || !hasAnyDate) continue;

    const confidence: Confidence = labeled
      ? 'high'
      : (position && company && start && (end || range.currently))
        ? 'medium'
        : 'low';

    experiences.push({
      local_id: 'exp-' + seq++,
      company_name: company,
      position,
      project_name: null,
      city_region: null,
      country: null,
      start_date: start,
      end_date: end,
      currently_working: range.currently,
      description_original: description.length ? description.join('\n').slice(0, 2000) : null,
      confidence,
    });
  }
  return experiences;
}

// ─── Formación ───────────────────────────────────────────────────────────────

function extractEducation(lines: Lines): string | null {
  const section = sectionLines(lines, EDUCATION_HEADINGS, 4);
  if (!section) return null;
  const cleaned = section
    .filter((l) => !dateRangeAtLineStart(l))
    .map((l) => l.replace(/^[•\-–*]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 3);
  if (!cleaned.length) return null;
  return cleaned.join('\n').slice(0, 500);
}

// ─── Certificaciones ─────────────────────────────────────────────────────────

function extractCertifications(normalizedText: string): ProposedCertification[] {
  const out: ProposedCertification[] = [];
  let seq = 1;
  for (const entry of CERTIFICATION_DICTIONARY) {
    for (const pattern of entry.patterns) {
      const np = normalizeForMatch(pattern);
      const re = /^\d/.test(np)
        ? '(?:^|[^0-9a-z])' + escapeRe(np) + '(?![0-9])'
        : '(?:^|[^' + WORD_CHAR + '])' + escapeRe(np) + '(?![' + WORD_CHAR + '])';
      if (new RegExp(re).test(normalizedText)) {
        out.push({ local_id: 'cert-' + seq++, name: entry.canonical, confidence: entry.confidence });
        break;
      }
    }
  }
  // Supresión de genéricas cuando la específica ya está (VCA vs VCA-VOL).
  return out.filter((c) => {
    const specific = CERTIFICATION_SUPPRESS_WHEN[c.name];
    return !specific || !out.some((o) => o.name === specific);
  });
}

// ─── Disponibilidad ──────────────────────────────────────────────────────────

function extractAvailability(normalizedText: string): string | null {
  for (const { pattern, value } of AVAILABILITY_PATTERNS) {
    const m = normalizedText.match(new RegExp(pattern));
    if (m) {
      if (value === 'immediately') return 'immediately';
      return 'from ' + (m[1] ?? '').trim();
    }
  }
  return null;
}

// ─── Título profesional ──────────────────────────────────────────────────────

function extractTitle(lines: Lines): { value: string; confidence: Confidence } | null {
  // 1) Etiquetado explícito → high.
  const labeled = extractLabeled(lines, TITLE_LABELS);
  if (labeled) return { value: labeled.value.slice(0, 90), confidence: 'high' };
  // 2) Línea 2-4 con términos del diccionario de roles → medium (la línea
  //    completa es el título declarado por el candidato).
  const nonEmpty: { raw: string; idx: number }[] = [];
  for (let i = 0; i < lines.raw.length && nonEmpty.length < 6; i++) {
    if (lines.raw[i]) nonEmpty.push({ raw: lines.raw[i], idx: i });
  }
  for (const { raw, idx } of nonEmpty.slice(1, 4)) {
    if (raw.length > 80) continue;
    const matches = matchDictionary(lines.normalized[idx], SKILL_DICTIONARY);
    if (matches.length >= 1) {
      return { value: raw, confidence: 'medium' };
    }
  }
  return null;
}

// ─── Motor principal ─────────────────────────────────────────────────────────

export function extractCv(input: ExtractionInput): ExtractionResult {
  const text = (input.text || '').normalize('NFC');
  const lines = prepareLines(text);
  const ctx: EngineCtx = {
    sourceDocumentId: input.sourceDocumentId,
    now: input.now ?? new Date().toISOString(),
  };

  const fields: ExtractedField[] = [];
  const normalizedAll = lines.normalized.join('\n');

  const name = extractFullName(lines);
  if (name) fields.push(field(ctx, 'full_name', name.value, name.confidence));

  const email = extractEmail(text);
  if (email) fields.push(field(ctx, 'email', email, 'high'));
  const phone = extractPhone(lines);
  if (phone) fields.push(field(ctx, 'phone', phone, 'high'));

  const title = extractTitle(lines);
  if (title) fields.push(field(ctx, 'title', title.value, title.confidence));

  const labeledLocation = extractLabeled(lines, LOCATION_LABELS);
  if (labeledLocation) {
    fields.push(field(ctx, 'location', labeledLocation.value.slice(0, 90), 'high'));
  }

  const summarySection = sectionLines(lines, SUMMARY_HEADINGS, 10);
  if (summarySection) {
    const summary = summarySection.join('\n').slice(0, 1200);
    if (summary.trim().length >= 20) {
      fields.push(field(ctx, 'summary', summary, 'high'));
    }
  }

  // PB-CV-EXPERIENCE-DERIVATION-001 — years_experience:
  // 1. valor explícito del CV (frase literal) = referencia principal;
  // 2. valor derivado de las fechas de las experiencias (intervalos
  //    fusionados, floor(meses/12)) cuando NO hay explícito, marcado con
  //    provenance 'derived_from_experience_dates';
  // 3. discrepancia material explícito vs derivado baja el explícito a
  //    low confidence + metadata de discrepancia (revisión explícita
  //    obligatoria, jamás sobrescritura silenciosa); zona intermedia →
  //    medium. Umbral centralizado en experienceDerivation.ts.
  const experiences = extractExperiences(lines);
  const explicitYears = extractYearsExperience(normalizedAll);
  const derivation = deriveExperienceMonths(experiences, ctx.now);
  if (explicitYears !== null) {
    let confidence: Confidence = 'high';
    let consistency: 'coherent' | 'uncertain' | 'discrepant' | undefined;
    if (derivation !== null) {
      consistency = classifyExplicitDerived(explicitYears, derivation.derivedYears);
      if (consistency === 'discrepant') confidence = 'low';
      else if (consistency === 'uncertain') confidence = 'medium';
    }
    const yearsField = field(ctx, 'years_experience', explicitYears, confidence);
    yearsField.provenance = 'cv_text';
    if (derivation !== null) {
      yearsField.derivation = {
        total_months: derivation.totalMonths,
        derived_years: derivation.derivedYears,
        intervals_used: derivation.intervalsUsed,
        intervals_total: derivation.intervalsTotal,
        explicit_years: explicitYears,
        consistency,
      };
    }
    fields.push(yearsField);
  } else if (derivation !== null && derivation.derivedYears >= 1) {
    // Sin frase explícita: proponer el valor derivado de las fechas.
    // Confianza high solo con precisión de mes completa y todos los
    // intervalos utilizables; si no, medium. Nunca se emite una propuesta
    // low ni <1 año (no aporta al campo entero).
    const confidence: Confidence =
      derivation.fullPrecision && derivation.intervalsUsed === derivation.intervalsTotal
        ? 'high'
        : 'medium';
    const yearsField = field(ctx, 'years_experience', derivation.derivedYears, confidence);
    yearsField.provenance = 'derived_from_experience_dates';
    yearsField.derivation = {
      total_months: derivation.totalMonths,
      derived_years: derivation.derivedYears,
      intervals_used: derivation.intervalsUsed,
      intervals_total: derivation.intervalsTotal,
    };
    fields.push(yearsField);
  }

  const skills = matchDictionary(normalizedAll, SKILL_DICTIONARY);
  if (skills.length) fields.push(field(ctx, 'skills', skills, 'medium'));
  const processes = matchDictionary(normalizedAll, WELDING_PROCESS_DICTIONARY);
  if (processes.length) fields.push(field(ctx, 'welding_processes', processes, 'high'));
  const disciplines = matchDictionary(normalizedAll, DISCIPLINE_DICTIONARY);
  if (disciplines.length) fields.push(field(ctx, 'disciplines', disciplines, 'medium'));

  const spoken = extractSpokenLanguages(lines);
  if (spoken) fields.push(field(ctx, 'languages', spoken.values, spoken.confidence));

  const education = extractEducation(lines);
  if (education) fields.push(field(ctx, 'education', education, 'medium'));

  const certifications = extractCertifications(normalizedAll);
  if (certifications.length) {
    fields.push(field(ctx, 'certifications_declared', certifications.map((c) => c.name), 'medium'));
  }

  const availability = extractAvailability(normalizedAll);
  if (availability) fields.push(field(ctx, 'availability', availability, 'medium'));

  if (WILLING_TO_TRAVEL_PATTERNS.some((p) => normalizedAll.includes(p))) {
    fields.push(field(ctx, 'willing_to_travel', true, 'medium'));
  }
  if (WILLING_TO_RELOCATE_PATTERNS.some((p) => normalizedAll.includes(p))) {
    fields.push(field(ctx, 'willing_to_relocate', true, 'medium'));
  }

  return {
    language: detectLanguage(text),
    fields,
    experiences,
    certifications,
  };
}
