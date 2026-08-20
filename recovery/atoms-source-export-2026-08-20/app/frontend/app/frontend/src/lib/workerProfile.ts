/**
 * WorkExperience interface matching the actual DB schema: public.app_worker_experiences
 *
 * DB columns:
 * - id, user_id, position, company_name, project_name, city_region, country,
 *   start_date, end_date, currently_working, description_original, description_en,
 *   description_es, description_fr, description_nl, description_de,
 *   language_original, responsibilities, visible_to_companies, created_at
 */
export interface WorkExperience {
  id: string;
  user_id: string;
  position: string;
  company_name: string;
  project_name: string | null;
  city_region: string | null;
  country: string | null;
  start_date: string | null;
  end_date: string | null;
  currently_working: boolean;
  description_original: string | null;
  description_en: string | null;
  description_es: string | null;
  description_fr: string | null;
  description_nl: string | null;
  description_de: string | null;
  language_original: string | null;
  responsibilities: string | null;
  visible_to_companies: boolean;
  created_at: string;
}

export interface WorkExperienceInput {
  position: string;
  company_name: string;
  project_name?: string | null;
  city_region?: string | null;
  country?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  currently_working?: boolean;
  description_original?: string | null;
  description_en?: string | null;
  description_es?: string | null;
  description_fr?: string | null;
  description_nl?: string | null;
  description_de?: string | null;
  language_original?: string | null;
  responsibilities?: string | null;
  visible_to_companies?: boolean;
}

/** Supported translation language codes */
export type TranslationLanguage = 'en' | 'es' | 'fr' | 'nl' | 'de';

/** All translation field keys */
export const TRANSLATION_FIELDS: Record<TranslationLanguage, keyof WorkExperience> = {
  en: 'description_en',
  es: 'description_es',
  fr: 'description_fr',
  nl: 'description_nl',
  de: 'description_de',
};

/** Language display names */
export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  nl: 'Dutch',
  de: 'German',
  pt: 'Portuguese',
};

/**
 * Get the best description for a work experience based on the viewer's current UI language.
 *
 * Fallback chain:
 * - If language is EN → description_en → description_original
 * - If language is ES → description_es → description_original
 * - If language is FR → description_fr → description_en → description_original
 * - If language is NL → description_nl → description_en → description_original
 * - If language is DE → description_de → description_en → description_original
 * - Otherwise → description_en → description_original
 *
 * Returns { text, isTranslated, originalLanguage }
 */
export function getExperienceDescriptionByLanguage(
  experience: WorkExperience,
  currentLanguage: string
): { text: string | null; isTranslated: boolean; originalLanguage: string | null } {
  const lang = currentLanguage.toLowerCase().slice(0, 2);
  const original = experience.description_original;
  const originalLang = experience.language_original;

  // If the viewer's language matches the original language, show original directly
  if (lang === originalLang?.toLowerCase()) {
    return { text: original, isTranslated: false, originalLanguage: null };
  }

  let text: string | null = null;
  let isTranslated = false;

  switch (lang) {
    case 'en':
      text = experience.description_en || original;
      isTranslated = !!experience.description_en && experience.description_en !== original;
      break;
    case 'es':
      text = experience.description_es || original;
      isTranslated = !!experience.description_es && experience.description_es !== original;
      break;
    case 'fr':
      text = experience.description_fr || experience.description_en || original;
      isTranslated = !!(experience.description_fr || experience.description_en);
      break;
    case 'nl':
      text = experience.description_nl || experience.description_en || original;
      isTranslated = !!(experience.description_nl || experience.description_en);
      break;
    case 'de':
      text = experience.description_de || experience.description_en || original;
      isTranslated = !!(experience.description_de || experience.description_en);
      break;
    default:
      text = experience.description_en || original;
      isTranslated = !!experience.description_en && experience.description_en !== original;
      break;
  }

  // If text ended up being the original, it's not really translated
  if (text === original) {
    isTranslated = false;
  }

  return {
    text,
    isTranslated,
    originalLanguage: isTranslated ? (originalLang || null) : null,
  };
}

/** Normalize raw DB row to WorkExperience (handles possible legacy column names) */
export function normalizeExperience(raw: Record<string, unknown>): WorkExperience {
  return {
    id: (raw.id as string) || '',
    user_id: (raw.user_id as string) || '',
    position: (raw.position as string) || (raw.job_title as string) || '',
    company_name: (raw.company_name as string) || (raw.company as string) || '',
    project_name: (raw.project_name as string | null) || null,
    city_region: (raw.city_region as string | null) || (raw.location as string | null) || null,
    country: (raw.country as string | null) || null,
    start_date: (raw.start_date as string | null) || null,
    end_date: (raw.end_date as string | null) || null,
    currently_working: (raw.currently_working as boolean) ?? (raw.is_current as boolean) ?? false,
    description_original: (raw.description_original as string | null) || (raw.description as string | null) || null,
    description_en: (raw.description_en as string | null) || null,
    description_es: (raw.description_es as string | null) || null,
    description_fr: (raw.description_fr as string | null) || null,
    description_nl: (raw.description_nl as string | null) || null,
    description_de: (raw.description_de as string | null) || null,
    language_original: (raw.language_original as string | null) || null,
    responsibilities: (raw.responsibilities as string | null) || null,
    visible_to_companies: (raw.visible_to_companies as boolean) ?? (raw.is_visible as boolean) ?? true,
    created_at: (raw.created_at as string) || '',
  };
}

export interface WorkerCertification {
  id: string;
  user_id: string;
  certification_name: string;
  issuing_organization: string;
  issue_date: string | null;
  expiry_date: string | null;
  expiration_date?: string | null;
  credential_id: string | null;
  verification_url?: string | null;
  file_url: string | null;
  certificate_file_url?: string | null;
  file_name: string | null;
  notes: string | null;
  is_visible: boolean;
  created_at: string;
}

/** Helper to normalize certification data from DB (handles column name variations) */
export function normalizeCertification(raw: Record<string, unknown>): WorkerCertification {
  return {
    id: (raw.id as string) || '',
    user_id: (raw.user_id as string) || '',
    certification_name: (raw.certification_name as string) || '',
    issuing_organization: (raw.issuing_organization as string) || '',
    issue_date: (raw.issue_date as string | null) || null,
    expiry_date: (raw.expiry_date as string | null) || (raw.expiration_date as string | null) || null,
    expiration_date: (raw.expiration_date as string | null) || (raw.expiry_date as string | null) || null,
    credential_id: (raw.credential_id as string | null) || null,
    verification_url: (raw.verification_url as string | null) || null,
    file_url: (raw.file_url as string | null) || (raw.certificate_file_url as string | null) || null,
    certificate_file_url: (raw.certificate_file_url as string | null) || (raw.file_url as string | null) || null,
    file_name: (raw.file_name as string | null) || null,
    notes: (raw.notes as string | null) || null,
    is_visible: raw.is_visible !== false,
    created_at: (raw.created_at as string) || '',
  };
}

export interface WorkerCertificationInput {
  certification_name: string;
  issuing_organization: string;
  issue_date?: string | null;
  expiry_date?: string | null;
  credential_id?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  notes?: string | null;
  is_visible?: boolean;
}

/**
 * WorkerDocument interface matching the actual DB schema: public.app_worker_documents
 *
 * DB columns:
 * - id, user_id, document_type, file_name, file_url, file_size, mime_type,
 *   notes, document_category, expires_at, verified, is_visible, created_at
 */
export interface WorkerDocument {
  id: string;
  user_id: string;
  document_type: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  notes: string | null;
  document_category: string | null;
  expires_at: string | null;
  verified: boolean;
  is_visible: boolean;
  created_at: string;
}

export interface WorkerDocumentInput {
  document_type: string;
  file_name: string;
  file_url: string;
  file_size?: number | null;
  mime_type?: string | null;
  notes?: string | null;
  document_category?: string | null;
  expires_at?: string | null;
  is_visible?: boolean;
}

/** Normalize raw DB row to WorkerDocument (handles possible missing fields gracefully) */
export function normalizeDocument(raw: Record<string, unknown>): WorkerDocument {
  return {
    id: (raw.id as string) || '',
    user_id: (raw.user_id as string) || '',
    document_type: (raw.document_type as string) || 'other',
    file_name: (raw.file_name as string) || 'document',
    file_url: (raw.file_url as string) || '',
    file_size: (raw.file_size as number | null) ?? null,
    mime_type: (raw.mime_type as string | null) ?? null,
    notes: (raw.notes as string | null) ?? null,
    document_category: (raw.document_category as string | null) ?? null,
    expires_at: (raw.expires_at as string | null) ?? null,
    verified: (raw.verified as boolean) ?? false,
    is_visible: raw.is_visible !== false,
    created_at: (raw.created_at as string) || '',
  };
}