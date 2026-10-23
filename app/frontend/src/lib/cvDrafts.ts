// PB-CV-AUTO-PROFILE-001 — Cliente del flujo CV → draft → perfil confirmado.
//
// DRAFT FIRST: todo lo que ve el usuario viene del draft
// (app_cv_extraction_drafts, RLS: solo el propietario). Nada se escribe en el
// perfil hasta que el usuario confirma vía cv-apply-draft.
//
// PRIVACIDAD: los errores de red no arrastran contenido del CV ni PII a
// logs/telemetría.

import { supabase, TABLES } from '@/lib/supabase';

export const CV_DRAFTS_TABLE = 'app_cv_extraction_drafts';

export type CvDraftStatus =
  | 'pending_review'
  | 'review_confirmed'
  | 'dismissed'
  | 'extraction_failed'
  | 'superseded';

export interface CvExtractedField {
  field: string;
  value: string | number | boolean | string[] | null;
  source: 'cv';
  confidence: 'high' | 'medium' | 'low';
  extracted_at: string;
  source_document_id: string;
}

export interface CvProposedExperience {
  local_id: string;
  company_name: string;
  position: string;
  project_name: string | null;
  city_region: string | null;
  country: string | null;
  start_date: string | null;
  end_date: string | null;
  currently_working: boolean;
  description_original: string | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface CvProposedCertification {
  local_id: string;
  name: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface CvDraft {
  id: string;
  user_id: string;
  extraction_status: CvDraftStatus;
  source_channel: 'user_upload' | 'support_inbound';
  cv_language: string | null;
  file_name: string;
  error_code: string | null;
  created_at: string;
  reviewed_at: string | null;
  extracted_fields: CvExtractedField[];
  proposed_experiences: CvProposedExperience[];
  proposed_certifications: CvProposedCertification[];
}

/** Draft pendiente de revisión del usuario (el más reciente). */
export async function getPendingDraft(): Promise<CvDraft | null> {
  const { data, error } = await supabase
    .from(CV_DRAFTS_TABLE)
    .select(
      'id, user_id, extraction_status, source_channel, cv_language, file_name, error_code, created_at, reviewed_at, extracted_fields, proposed_experiences, proposed_certifications',
    )
    .eq('extraction_status', 'pending_review')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as CvDraft) ?? null;
}

export interface ExtractResponse {
  status: 'completed' | 'retried' | 'already_processed' | 'extraction_failed' | 'manual_review';
  draft_id?: string;
  extraction_status?: CvDraftStatus;
  language?: string | null;
  fields_count?: number;
  experiences_count?: number;
  certifications_count?: number;
  error_code?: string;
  reason?: string;
}

/**
 * Dispara la extracción del CV ya subido (modo usuario; JWT propio).
 * Fire-and-forget en la UI: el banner aparece cuando exista draft pendiente.
 */
export async function requestCvExtraction(bucket?: string, path?: string): Promise<ExtractResponse | null> {
  const body: Record<string, string> = {};
  if (bucket && path) {
    body.bucket = bucket;
    body.path = path;
  }
  const { data, error } = await supabase.functions.invoke('cv-extract', { body });
  if (error) return null;
  return (data as ExtractResponse) ?? null;
}

export interface FieldDecision {
  field: string;
  action: 'accept' | 'edit';
  value?: string | number | boolean | string[];
  overwrite?: boolean;
}

export interface ExperienceDecision {
  local_id: string;
  action: 'accept' | 'edit';
  patch?: Partial<CvProposedExperience>;
}

export interface ApplyDraftInput {
  draftId: string;
  fields: FieldDecision[];
  experiences: ExperienceDecision[];
  certificationIds: string[];
}

export interface ApplyDraftResult {
  ok: boolean;
  status?: string;
  conflicts?: { field: string; profile_value: unknown; cv_value: unknown }[];
  fields_confirmed_count?: number;
  experiences_applied_count?: number;
  experiences_merged_count?: number;
  certifications_applied_count?: number;
  marketplace_ready_after_confirmation?: boolean;
  error?: string;
}

/** Confirma el draft: única vía draft → perfil confirmado. */
export async function applyCvDraft(input: ApplyDraftInput): Promise<ApplyDraftResult> {
  const { data, error } = await supabase.functions.invoke('cv-apply-draft', {
    body: {
      draft_id: input.draftId,
      fields: input.fields,
      experiences: input.experiences,
      certifications: input.certificationIds.map((local_id) => ({ local_id, action: 'accept' })),
    },
  });
  if (error) {
    // El conflicto llega como 409 con cuerpo JSON.
    try {
      const payload = await error.context?.json?.();
      if (payload?.error === 'conflict') {
        return { ok: false, error: 'conflict', conflicts: payload.conflicts };
      }
    } catch { /* sin cuerpo */ }
    return { ok: false, error: 'apply_failed' };
  }
  return { ok: true, ...(data as object) } as ApplyDraftResult;
}

/** Descarta el draft (el usuario no quiere aplicarlo). */
export async function dismissDraft(draftId: string): Promise<boolean> {
  const { error } = await supabase
    .from(CV_DRAFTS_TABLE)
    .update({ extraction_status: 'dismissed' })
    .eq('id', draftId);
  return !error;
}

/** Etiqueta legible del campo extraído (para claves de i18n). */
export const CV_FIELD_LABEL_KEYS: Record<string, string> = {
  full_name: 'cvReview.fields.fullName',
  title: 'cvReview.fields.title',
  location: 'cvReview.fields.location',
  summary: 'cvReview.fields.summary',
  years_experience: 'cvReview.fields.yearsExperience',
  skills: 'cvReview.fields.skills',
  welding_processes: 'cvReview.fields.weldingProcesses',
  disciplines: 'cvReview.fields.disciplines',
  languages: 'cvReview.fields.languages',
  education: 'cvReview.fields.education',
  certifications_declared: 'cvReview.fields.certifications',
  availability: 'cvReview.fields.availability',
  willing_to_travel: 'cvReview.fields.willingToTravel',
  willing_to_relocate: 'cvReview.fields.willingToRelocate',
  phone: 'cvReview.fields.phone',
  email: 'cvReview.fields.email',
};

/** Campos que se muestran como informativos (no se escriben en el perfil). */
export const CV_INFO_ONLY_FIELDS = new Set(['email', 'phone', 'languages', 'education']);
