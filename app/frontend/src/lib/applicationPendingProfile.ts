// lib/applicationPendingProfile.ts
// PB-JOBS-MARKETPLACE-READY-ACTIVATION-001
//
// Flujo post-apply para candidaturas creadas con perfil NO Marketplace Ready.
// El estado real lo decide el backend (trigger BEFORE INSERT de sql/034
// leyendo profiles.marketplace_ready): el frontend solo LEE el status
// devuelto por el INSERT y reacciona. Nunca decide ni falsifica estados.
//
// Responsabilidades:
//   1. Emitir application_pending_profile_validation (candidatura retenida).
//   2. Invocar la Edge Function que envía el EMAIL 1 en el idioma del usuario
//      (idempotente en backend vía claim; un reintento aquí no duplica).
//   3. Emitir email_profile_completion_requested (status sent|not_sent).
//
// Fail-open: si la función falla, la candidatura YA está guardada; el error
// solo se registra (seco) y se devuelve el estado para decidir el toast.

import { supabase } from '@/lib/supabase';
import { trackEvent } from '@/lib/observability';

export const PENDING_PROFILE_STATUS = 'pending_profile_validation' as const;

export interface InsertedApplication {
  id: string;
  status: string;
}

/**
 * Tras un insert exitoso: si la candidatura nació pendiente por perfil,
 * emite los eventos y dispara el email de completar perfil.
 * Devuelve true cuando la candidatura está pendiente por perfil.
 */
export async function handlePendingProfileAfterApply(
  inserted: InsertedApplication | null | undefined,
  jobId: string,
): Promise<boolean> {
  if (!inserted || inserted.status !== PENDING_PROFILE_STATUS) return false;

  trackEvent('application_pending_profile_validation', { job_id: jobId });

  let emailStatus: 'sent' | 'not_sent' = 'not_sent';
  try {
    const { data, error } = await supabase.functions.invoke(
      'job-application-profile-pending-email',
      { body: { application_id: inserted.id } },
    );
    if (!error && data?.result === 'sent') emailStatus = 'sent';
    if (error || data?.result === 'failed') {
      console.error(
        '[applicationPendingProfile] profile-pending email failed — application stored:',
        error?.message ?? data?.reason ?? 'unknown',
      );
    }
  } catch (err) {
    console.error(
      '[applicationPendingProfile] profile-pending email invoke error (fail-open):',
      err instanceof Error ? err.message : String(err),
    );
  }

  trackEvent('email_profile_completion_requested', { job_id: jobId, status: emailStatus });
  return true;
}
