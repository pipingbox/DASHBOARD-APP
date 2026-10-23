// PB-CERT-AUTO-PROFILE-001 — Motor de extracción de datos de certificados.
//
// REGLA FUNDAMENTAL: solo se extrae lo que aparece EXPLICITAMENTE en el
// documento. No se inventan fechas, entidades ni credenciales. Los campos
// dudosos (low confidence) NUNCA se autoaceptan: requieren revisión
// explícita del usuario.
//
// El motor es determinista y basado en reglas (sin LLM ni OCR externo): el
// contenido del documento nunca sale de la infraestructura de PipingBox.
//
// REUTILIZACIÓN (no copia): importa normalizeForMatch de dictionaries.ts y
// parseCvDate + detectLanguage de engine.ts (motor de CV compartido).
//
// Módulo puro: sin APIs de Deno ni de navegador.

import { normalizeForMatch } from './dictionaries.ts';
import { detectLanguage, parseCvDate } from './engine.ts';
import type { Confidence, CvLanguage } from './types.ts';

// ─── Tipos públicos ──────────────────────────────────────────────────────────

export const CERT_FIELD_NAMES = [
  'certification_name',
  'issuing_organization',
  'credential_id',
  'issue_date',
  'expiry_date',
] as const;
export type CertFieldName = (typeof CERT_FIELD_NAMES)[number];

export interface CertExtractedField {
  field: CertFieldName;
  value: string;
  /** Siempre 'certificate_document' en la extracción. */
  source: 'certificate_document';
  confidence: Confidence;
  extracted_at: string;
  /** Id del draft/documento fuente; lo asigna el llamador. */
  source_document_id: string;
}

export interface CertExtractionResult {
  language: CvLanguage | null;
  fields: CertExtractedField[];
}

// ─── Diccionarios ────────────────────────────────────────────────────────────
// Certificaciones conocidas del dominio piping/mechanical/welding, con
// sinónimos multilingües. El match de catálogo da confianza high.

const KNOWN_CERTIFICATIONS: Readonly<Record<string, readonly string[]>> = {
  'VCA Basis': ['vca basis', 'vca bas', 'vca basic', 'vca básico', 'vca b'],
  'VCA VOL': ['vca vol', 'vca full'],
  'VCA VIL': ['vca vil'],
  'SCC': ['scc', 'scc p', 'scc pta'],
  'ISO 9606-1': ['iso 9606-1', 'iso 9606', 'une en iso 9606'],
  'EN 287-1': ['en 287-1', 'en 287'],
  'ASME IX': ['asme ix', 'asme section ix'],
  'TIG Welding (141)': ['tig 141', '141 tig', 'gtaw 141'],
  'MIG/MAG Welding (135/136)': ['mig 135', 'mag 135', 'mig 136', 'mag 136', 'gmaw 135', 'gmaw 136', 'mig/mag'],
  'MMA Welding (111)': ['mma 111', '111 mma', 'smaw 111', 'electrode welding 111'],
  'Flange Fitting': ['flange', 'flange fitting', 'flange assembly', 'bridas', 'flens', 'flansch'],
  'Confined Space Entry': ['confined space', 'espacio confinado', 'espacios confinados', 'besloten ruimte', 'engen räumen', 'espace confiné'],
  'Working at Height': ['working at height', 'trabajos en altura', 'werken op hoogte', 'arbeiten in der höhe', 'travail en hauteur'],
  'Forklift Operator': ['forklift', 'carretilla elevadora', 'heftruck', 'gabelstapler', 'chariot élévateur'],
  'NDT VT Level 2': ['vt level 2', 'visual testing level 2', 'vt-2'],
  'NDT PT Level 2': ['pt level 2', 'penetrant testing level 2', 'pt-2'],
  'NDT MT Level 2': ['mt level 2', 'magnetic particle level 2', 'mt-2'],
  'NDT RT Level 2': ['rt level 2', 'radiographic testing level 2', 'rt-2'],
  'First Aid': ['first aid', 'primeros auxilios', 'ehbo', 'erste hilfe', 'premiers secours'],
  'Fire Watch': ['fire watch', 'vigilante de incendios', 'brandwacht', 'feuerwache'],
};

// Emisores conocidos (certificadores y organismos del sector).
const KNOWN_ISSUERS: readonly string[] = [
  'tüv', 'tuv', 'tüv rheinland', 'tüv nord', 'tüv süd',
  'bureau veritas', "lloyd's register", 'lloyds register', 'dnv', 'dnv gl',
  'sgs', 'applus', 'applus+', 'dekra', 'abs', 'classnk',
  'vca infra', 'vca.nl', 'nil', 'hobart', 'twi', 'kiwa',
  'stoomwezen', 'aboma', 'pbna', 'arvabode',
];

// Etiquetas multilingües para "entidad emisora".
const ISSUER_LABELS: readonly string[] = [
  'issued by', 'issuing organization', 'issuing authority', 'certified by', 'awarded by', 'accredited by',
  'emitido por', 'expedido por', 'otorgado por', 'emisor', 'entidad emisora', 'organismo emisor',
  'uitgegeven door', 'afgegeven door', 'uitreikende instantie',
  'ausgestellt von', 'aussteller', 'zertifiziert durch', 'prüfstelle',
  'émis par', 'délivré par', 'organisme émetteur', 'attesté par',
  'emitido por', 'emitente', 'organismo emissor',
  'rilasciato da', 'ente emittente', 'organismo di certificazione',
  'emis de', 'eliberat de', 'organism emitent',
  'wydane przez', 'wystawione przez', 'jednostka certyfikująca',
  'видано', 'сертифіковано',
  'издаден от', 'сертифициращ орган',
];

// Etiquetas para número de credencial/certificado.
const CREDENTIAL_LABELS: readonly string[] = [
  'certificate no', 'certificate number', 'cert. no', 'cert no', 'credential id', 'credential number',
  'registration no', 'registration number', 'reg. no', 'reg no', 'licence no', 'license no', 'diploma no',
  'nº de certificado', 'número de certificado', 'num. certificado', 'nº certificado', 'numero de registro',
  'certificaatnummer', 'certificaat nr', 'registratienummer', 'diplomanummer',
  'zertifikatsnummer', 'zertifikat-nr', 'urkundennummer', 'registriernummer', 'prüfungsnummer',
  'numéro de certificat', 'n° de certificat', 'numéro d\'enregistrement', 'référence',
  'número do certificado', 'certificado nº', 'registo nº',
  'numero del certificato', 'certificato n', 'numero di registrazione',
  'număr certificat', 'nr. certificat', 'număr de înregistrare',
  'numer certyfikatu', 'nr certyfikatu', 'numer rejestracyjny',
  'сертифікат №', 'номер сертифіката',
  'сертификат №', 'номер на сертификат',
];

// Etiquetas para fecha de emisión.
const ISSUE_DATE_LABELS: readonly string[] = [
  'issue date', 'date of issue', 'issued on', 'issued', 'date issued', 'certification date', 'examination date',
  'fecha de emisión', 'fecha emisión', 'emitido el', 'expedido el', 'fecha de expedición', 'fecha del examen',
  'uitgiftedatum', 'datum van uitgifte', 'afgegeven op', 'behaald op',
  'ausstellungsdatum', 'ausgestellt am', 'ausgegeben am', 'prüfungsdatum',
  'date d\'émission', 'date de délivrance', 'émis le', 'délivré le', 'date d\'examen',
  'data de emissão', 'emitido em', 'data do exame',
  'data di rilascio', 'rilasciato il', 'data dell\'esame',
  'data emiterii', 'emis la', 'eliberat la',
  'data wydania', 'wydany dnia', 'data egzaminu',
  'дата на издаване', 'издаден на',
];

// Etiquetas para fecha de caducidad.
const EXPIRY_DATE_LABELS: readonly string[] = [
  'expiry date', 'expiration date', 'valid until', 'valid thru', 'valid through', 'expires', 'expiration', 'date of expiry',
  'fecha de caducidad', 'caduca el', 'válido hasta', 'vigente hasta', 'fecha de vencimiento', 'vence el',
  'vervaldatum', 'geldig tot', 'verloopt op', 'geldigheid tot',
  'gültig bis', 'ablaufdatum', 'verfällt am', 'gültigkeit bis',
  'date d\'expiration', 'valable jusqu\'au', 'expire le', 'date de validité',
  'data de validade', 'válido até', 'expira em', 'data de expiração',
  'data di scadenza', 'valido fino al', 'scade il',
  'data expirării', 'valabil până la', 'expiră la',
  'data ważności', 'ważny do', 'wygasa',
  'дата на изтичане', 'валиден до',
];

// Patrones de "sin caducidad": NO se propone fecha (ausencia honesta).
const NO_EXPIRY_RE = /(?:no expiry|no expiration|unlimited validity|does not expire|sin caducidad|sin vencimiento|no caduca|onbeperkt geldig|geen vervaldatum|unbegrenzt gültig|kein ablaufdatum|sans expiration|validité illimitée|sem validade|sem data de expiração|senza scadenza|fără expirare|bezterminowo|без срок на валидност)/i;

// ─── Utilidades internas ─────────────────────────────────────────────────────

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const WORD_CHAR = 'a-zà-ÿ\\u0100-\\u017f\\u0400-\\u04ff';

/** Match de variante con fronteras de palabra sobre texto normalizado. */
function hasVariant(normalizedText: string, variant: string): boolean {
  const nv = normalizeForMatch(variant);
  if (!nv) return false;
  const pattern = /^\d/.test(nv)
    ? '(?:^|[^0-9])' + escapeRe(nv) + '(?![0-9])'
    : '(?:^|[^' + WORD_CHAR + '])' + escapeRe(nv) + 's?(?![' + WORD_CHAR + '])';
  return new RegExp(pattern).test(normalizedText);
}

interface LabeledValue {
  value: string;
  /** Distancia en caracteres entre etiqueta y valor (para desambiguar). */
  distance: number;
}

/**
 * Busca "etiqueta: valor" o "etiqueta\nvalor". Las etiquetas se comparan
 * sobre el texto NORMALIZADO (sin acentos, minúsculas) para que "Fecha de
 * emisión" y "fecha de emision" matcheen igual; el valor se recorta del
 * TEXTO CRUDO usando la posición del match (la normalización NFD→sin marcas
 * preserva la longitud para los idiomas soportados: quita codepoints de
 * marca combinante y los caracteres base se mantienen).
 */
function findLabeledValue(
  rawText: string,
  labels: readonly string[],
  valuePattern: RegExp,
  maxValueLength: number,
): LabeledValue | null {
  const normalized = normalizeForMatch(rawText);
  let best: LabeledValue | null = null;
  for (const label of labels) {
    const nl = escapeRe(normalizeForMatch(label));
    if (!nl) continue;
    // Etiqueta seguida de separador (: - — salto de línea o espacios) y valor.
    const re = new RegExp(
      nl + '\\s*[:\\-—–]?\\s*\\n?\\s*(' + valuePattern.source + ')',
      'gi',
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(normalized)) !== null) {
      // Recorta el valor del texto crudo en la misma posición (ver docstring).
      const valueStart = m.index + m[0].length - m[1].length;
      const raw = rawText
        .slice(valueStart, valueStart + m[1].length)
        .trim()
        .replace(/\s+/g, ' ');
      if (!raw || raw.length > maxValueLength) continue;
      if (!best) best = { value: raw, distance: 0 };
    }
  }
  return best;
}

// Patrón de fecha explícita completa: ISO, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY,
// "15 March 2023", "March 15, 2023", "15 de marzo de 2023".
const FULL_DATE_PATTERN =
  /(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|\d{1,2}\s+(?:de\s+)?[a-zà-ÿ]{3,10}\.?\s+(?:de\s+)?\d{4}|[a-zà-ÿ]{3,10}\.?\s+\d{1,2},?\s+\d{4})/i;

// Patrón de credencial: alfanumérico con al menos un dígito, 4-30 chars,
// admite separadores - / . y espacios internos cortos.
const CREDENTIAL_VALUE_PATTERN = /[A-Za-z0-9][A-Za-z0-9\-/. ]{2,28}[A-Za-z0-9]/;

/**
 * Convierte una fecha cruda a ISO YYYY-MM-DD.
 * - ISO y DD/MM/YYYY inequívocos (día > 12) → high.
 * - DD/MM/YYYY ambiguo (día ≤ 12) → se interpreta DD/MM (convención europea
 *   del sector) pero con confianza low (revisión obligatoria).
 * - Mes/año o solo año → delega en parseCvDate (YYYY-MM o YYYY) y devuelve
 *   null para el día: el llamador decide si lo acepta (el campo DATE exige
 *   día; mes/año sin día NO se propone como fecha completa, ver reglas duras).
 * Devuelve null si no se puede derivar una fecha completa.
 */
function toIsoDate(raw: string): { iso: string; ambiguous: boolean } | null {
  const value = raw.trim();
  // ISO: YYYY-MM-DD o YYYY/MM/DD
  let m = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    if (+mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31) {
      return { iso: `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`, ambiguous: false };
    }
    return null;
  }
  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  m = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null;
    // Ambigüedad DD/MM vs MM/DD: irresoluble cuando día ≤ 12. Convención
    // europea (DD/MM) pero marcada como ambigua → low confidence.
    const ambiguous = +d <= 12;
    return { iso: `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`, ambiguous };
  }
  // "15 March 2023" / "15 de marzo de 2023" / "March 15, 2023":
  // parseCvDate devuelve YYYY-MM; si el texto incluye día explícito lo
  // recuperamos del propio texto.
  const monthYear = parseCvDate(value.replace(/\bde\b/gi, ' ').replace(/,/g, ' ').replace(/\s+/g, ' ').trim());
  if (monthYear && /^\d{4}-\d{2}$/.test(monthYear)) {
    const dayMatch = value.match(/\b(\d{1,2})\b/);
    if (dayMatch && +dayMatch[1] >= 1 && +dayMatch[1] <= 31) {
      return { iso: `${monthYear}-${dayMatch[1].padStart(2, '0')}`, ambiguous: false };
    }
    // Mes/año sin día: NO se inventa el día → sin fecha completa.
    return null;
  }
  return null;
}

// ─── Extractores por campo ───────────────────────────────────────────────────

function extractCertificationName(
  rawText: string,
  normalized: string,
): { value: string; confidence: Confidence } | null {
  // 1. Catálogo conocido → high.
  for (const [canonical, variants] of Object.entries(KNOWN_CERTIFICATIONS)) {
    for (const variant of variants) {
      if (hasVariant(normalized, variant)) return { value: canonical, confidence: 'high' };
    }
  }
  // 2. "Certificate of X" / "Certificado de X" → medium.
  const ofMatch = rawText.match(
    /(?:certificate of|certificado de|certificaat(?: van)?|zertifikat (?:über|für)|certificat(?: de| d')|certificado de|certificato di|certificat de|certyfikat)\s+([A-Za-z0-9][A-Za-z0-9 ()/+.,-]{2,60})/i,
  );
  if (ofMatch) {
    const value = ofMatch[1].trim().replace(/[.,;]+$/, '');
    if (value.length >= 3) return { value, confidence: 'medium' };
  }
  return null;
}

function extractIssuer(
  rawText: string,
  normalized: string,
): { value: string; confidence: Confidence } | null {
  // 1. Etiqueta explícita → high.
  const labeled = findLabeledValue(rawText, ISSUER_LABELS, /[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 &+.,()/-]{1,60}/, 60);
  if (labeled) return { value: labeled.value.replace(/[.,;]+$/, ''), confidence: 'high' };
  // 2. Emisor conocido presente en el texto → medium.
  for (const issuer of KNOWN_ISSUERS) {
    if (hasVariant(normalized, issuer)) {
      // Devuelve la forma tal como aparece (primera coincidencia cruda).
      const re = new RegExp('(' + escapeRe(issuer).replace(/\\ /g, '\\s+') + ')', 'i');
      const m = rawText.match(re);
      if (m) return { value: m[1].trim(), confidence: 'medium' };
    }
  }
  return null;
}

function extractCredentialId(
  rawText: string,
): { value: string; confidence: Confidence } | null {
  const labeled = findLabeledValue(rawText, CREDENTIAL_LABELS, CREDENTIAL_VALUE_PATTERN, 30);
  if (!labeled) return null;
  const value = labeled.value.trim();
  // Debe contener al menos un dígito (evita capturar palabras sueltas).
  if (!/\d/.test(value)) return null;
  return { value, confidence: 'high' };
}

function extractDate(
  rawText: string,
  labels: readonly string[],
): { value: string; confidence: Confidence } | null {
  const labeled = findLabeledValue(rawText, labels, FULL_DATE_PATTERN, 40);
  if (!labeled) return null;
  const parsed = toIsoDate(labeled.value);
  if (!parsed) return null;
  return { value: parsed.iso, confidence: parsed.ambiguous ? 'low' : 'high' };
}

// ─── Punto de entrada ────────────────────────────────────────────────────────

/**
 * Extrae los campos del certificado a partir de su texto (capa nativa PDF).
 * Solo propone campos explícitos. Reglas duras:
 *   - issue_date > expiry_date → ambas low (revisión obligatoria);
 *   - issue_date futura → low;
 *   - "sin caducidad" → expiry_date ausente (nunca inventada);
 *   - mes/año sin día → fecha ausente (el campo DATE exige día completo).
 */
export function extractCert(input: {
  text: string;
  sourceDocumentId: string;
  extractedAt?: string;
}): CertExtractionResult {
  const { text, sourceDocumentId } = input;
  const extractedAt = input.extractedAt ?? new Date().toISOString();
  const normalized = normalizeForMatch(text);
  const language = detectLanguage(text);

  const fields: CertExtractedField[] = [];
  const push = (field: CertFieldName, value: string, confidence: Confidence) => {
    fields.push({
      field,
      value,
      source: 'certificate_document',
      confidence,
      extracted_at: extractedAt,
      source_document_id: sourceDocumentId,
    });
  };

  const name = extractCertificationName(text, normalized);
  if (name) push('certification_name', name.value, name.confidence);

  const issuer = extractIssuer(text, normalized);
  if (issuer) push('issuing_organization', issuer.value, issuer.confidence);

  const credential = extractCredentialId(text);
  if (credential) push('credential_id', credential.value, credential.confidence);

  const issueDate = extractDate(text, ISSUE_DATE_LABELS);
  let expiryDate: { value: string; confidence: Confidence } | null = null;
  // "Sin caducidad" declarado → expiry ausente (honesto), no se busca fecha.
  if (!NO_EXPIRY_RE.test(text)) {
    expiryDate = extractDate(text, EXPIRY_DATE_LABELS);
  }

  // Reglas duras de coherencia.
  if (issueDate) {
    const today = new Date().toISOString().slice(0, 10);
    if (issueDate.value > today) issueDate.confidence = 'low';
  }
  if (issueDate && expiryDate && issueDate.value > expiryDate.value) {
    issueDate.confidence = 'low';
    expiryDate.confidence = 'low';
  }

  if (issueDate) push('issue_date', issueDate.value, issueDate.confidence);
  if (expiryDate) push('expiry_date', expiryDate.value, expiryDate.confidence);

  return { language, fields };
}
