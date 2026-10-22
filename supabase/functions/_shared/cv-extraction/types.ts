// PB-CV-AUTO-PROFILE-001 — Contrato de tipos del motor de extracción de CV.
//
// Módulo PURO: sin APIs de Deno ni de navegador, para que sea ejecutable por
// la Edge Function (Deno), por los specs de Playwright (Node) y por los tests
// de Deno sin adaptadores.
//
// PRINCIPIOS (ticket §2-§3):
//   * Solo se extraen campos presentes EXPLICITAMENTE en el CV. El motor no
//     tiene extractores para atributos sensibles (nacionalidad, permiso de
//     trabajo, situación migratoria, estado civil, edad, salud, religión,
//     etnia): no es que los filtre, es que no existen.
//   * Cada campo lleva source='cv', confidence y extracted_at. Low confidence
//     NUNCA se autoacepta (lo garantiza la UI y la edge function de apply).
//   * Las certificaciones extraídas son SIEMPRE declared/unverified: la
//     verificación exige documento real + proceso propio (ticket §6).

export type Confidence = 'high' | 'medium' | 'low';

/** Idiomas soportados por la extracción (ticket §8). */
export const CV_LANGUAGES = [
  'en', 'es', 'pt', 'nl', 'fr', 'de', 'it', 'ro', 'pl', 'uk', 'bg',
] as const;
export type CvLanguage = (typeof CV_LANGUAGES)[number];

/** Campos extraíbles. `field` es un enum cerrado. */
export const CV_FIELD_NAMES = [
  'full_name',
  'title',
  'location',
  'summary',
  'years_experience',
  'skills',
  'welding_processes',
  'disciplines',
  'languages',
  'education',
  'certifications_declared',
  'availability',
  'willing_to_travel',
  'willing_to_relocate',
  'phone',
  'email',
] as const;
export type CvFieldName = (typeof CV_FIELD_NAMES)[number];

export type CvFieldValue =
  | string
  | number
  | string[]
  | boolean
  | null;

export interface ExtractedField {
  field: CvFieldName;
  value: CvFieldValue;
  /** Siempre 'cv' en la extracción. */
  source: 'cv';
  confidence: Confidence;
  extracted_at: string;
  /** Id del draft/documento fuente; lo asigna el llamador (fila del draft). */
  source_document_id: string;
  /** PB-CV-EXPERIENCE-DERIVATION-001 — procedencia fina dentro de 'cv':
   *  ausencia o 'cv_text' = valor textual del documento;
   *  'derived_from_experience_dates' = calculado a partir de las fechas de
   *  las experiencias (nunca se presenta como dato textual del CV). */
  provenance?: 'cv_text' | 'derived_from_experience_dates';
  /** PB-CV-EXPERIENCE-DERIVATION-001 — metadata del cálculo derivado de
   *  years_experience (agregados, sin PII de las experiencias). */
  derivation?: {
    total_months: number;
    derived_years: number;
    intervals_used: number;
    intervals_total: number;
    /** Relación con el valor explícito del CV cuando ambos existen. */
    explicit_years?: number;
    consistency?: 'coherent' | 'uncertain' | 'discrepant';
  };
}

export interface ProposedExperience {
  local_id: string;
  company_name: string;
  position: string;
  project_name: string | null;
  city_region: string | null;
  country: string | null;
  /** ISO YYYY-MM cuando se pudo derivar, si no null. */
  start_date: string | null;
  end_date: string | null;
  currently_working: boolean;
  description_original: string | null;
  confidence: Confidence;
}

/** Certificación mencionada en el CV. SIEMPRE declared/unverified. */
export interface ProposedCertification {
  local_id: string;
  name: string;
  confidence: Confidence;
}

export interface ExtractionResult {
  /** Idioma detectado del CV (independiente del idioma del usuario). */
  language: CvLanguage | null;
  fields: ExtractedField[];
  experiences: ProposedExperience[];
  certifications: ProposedCertification[];
}

export interface ExtractionInput {
  /** Texto plano del CV (PDF nativo o DOCX ya convertidos). */
  text: string;
  /** Id del draft que actuará como source_document_id. */
  sourceDocumentId: string;
  /** Timestamp ISO para extracted_at (inyectado para tests deterministas). */
  now?: string;
}

/** Códigos de error cerrados (espejo del CHECK de la migración 041). */
export const CV_EXTRACTION_ERROR_CODES = [
  'no_extractable_text',
  'unsupported_legacy_doc',
  'unsupported_mime',
  'text_extraction_error',
  'engine_error',
  'storage_read_error',
] as const;
export type CvExtractionErrorCode = (typeof CV_EXTRACTION_ERROR_CODES)[number];
