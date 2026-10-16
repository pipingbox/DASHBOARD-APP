// PB-CERT-AUTO-PROFILE-001 — Cliente del flujo certificado → draft → registro
// canónico confirmado.
//
// DRAFT FIRST: todo lo que ve el usuario viene del draft
// (app_cert_extraction_drafts, RLS: solo el propietario). Nada se escribe en
// app_worker_certifications hasta que el usuario confirma vía cert-apply-draft.
//
// DECLARED/UNVERIFIED: este cliente jamás envía is_verified/verified_at; el
// backend tampoco los acepta. La extracción no acredita autenticidad.
//
// PRIVACIDAD: los errores de red no arrastran contenido del documento ni PII
// a logs/telemetría.

import { supabase } from '@/lib/supabase';

export const CERT_DRAFTS_TABLE = 'app_cert_extraction_drafts';

export type CertDraftStatus =
  | 'pending_review'
  | 'review_confirmed'
  | 'dismissed'
  | 'extraction_failed'
  | 'superseded';

export type CertFieldName =
  | 'certification_name'
  | 'issuing_organization'
  | 'credential_id'
  | 'issue_date'
  | 'expiry_date';

export interface CertExtractedField {
  field: CertFieldName;
  value: string;
  source: 'certificate_document';
  confidence: 'high' | 'medium' | 'low';
  extracted_at: string;
  source_document_id: string;
}

export interface CertDraft {
  id: string;
  user_id: string;
  extraction_status: CertDraftStatus;
  file_name: string;
  error_code: string | null;
  created_at: string;
  reviewed_at: string | null;
  extracted_fields: CertExtractedField[];
  linked_certification_id: string | null;
}

export interface CertExtractResponse {
  status: 'completed' | 'retried' | 'already_processed' | 'extraction_failed';
  draft_id?: string;
  extraction_status?: CertDraftStatus;
  language?: string | null;
  fields_count?: number;
  linked_certification_id?: string | null;
  error_code?: string;
}

/**
 * Dispara la extracción del documento ya subido (modo usuario; JWT propio).
 * El documento debe vivir en el namespace del propio usuario.
 */
export async function requestCertExtraction(
  bucket: string,
  path: string,
): Promise<CertExtractResponse | null> {
  const { data, error } = await supabase.functions.invoke('cert-extract', {
    body: { storage_bucket: bucket, storage_path: path },
  });
  if (error) return null;
  return (data as CertExtractResponse) ?? null;
}

/** Draft pendiente asociado a un documento concreto (por su path). */
export async function getDraftByStoragePath(storagePath: string): Promise<CertDraft | null> {
  const { data, error } = await supabase
    .from(CERT_DRAFTS_TABLE)
    .select(
      'id, user_id, extraction_status, file_name, error_code, created_at, reviewed_at, extracted_fields, linked_certification_id',
    )
    .eq('storage_path', storagePath)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as CertDraft) ?? null;
}

export interface CertFieldDecision {
  field: CertFieldName;
  action: 'accept' | 'edit';
  value?: string;
  overwrite?: boolean;
}

export interface ApplyCertDraftInput {
  draftId: string;
  fields: CertFieldDecision[];
  targetCertificationId?: string | null;
  rejectLinked?: boolean;
}

export interface ApplyCertDraftResult {
  ok: boolean;
  status?: string;
  certification_id?: string;
  linked_existing?: boolean;
  fields_confirmed_count?: number;
  conflicts?: { field: string; existing_value: string | null; proposed_value: string }[];
  error?: string;
}

/** Confirma el draft: única vía draft → certificación canónica. */
export async function applyCertDraft(input: ApplyCertDraftInput): Promise<ApplyCertDraftResult> {
  const { data, error } = await supabase.functions.invoke('cert-apply-draft', {
    body: {
      draft_id: input.draftId,
      fields: input.fields,
      target_certification_id: input.targetCertificationId ?? null,
      reject_linked: input.rejectLinked === true,
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
  return { ok: true, ...(data as object) } as ApplyCertDraftResult;
}

/** Descarta el draft (el usuario no quiere aplicarlo). */
export async function dismissCertDraft(draftId: string): Promise<boolean> {
  const { error } = await supabase
    .from(CERT_DRAFTS_TABLE)
    .update({ extraction_status: 'dismissed' })
    .eq('id', draftId);
  return !error;
}
