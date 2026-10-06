/**
 * PB-DOCUMENT-INTAKE-001 — Entrega B: cliente del canal documental por correo
 * (Vía B). La funcionalidad está tras el flag VITE_DOCUMENT_EMAIL_INTAKE
 * (activa SOLO en preview mientras dure la fase TEST).
 *
 * Flujo: la app solicita una referencia temporal al backend
 * (document-email-reference), y abre el cliente de correo del usuario con
 * destinatario, asunto con la referencia e instrucciones. El token NUNCA se
 * almacena en la app ni se registra en telemetría (el backend solo guarda su
 * hash).
 */

import { supabase } from '@/lib/supabase';
import { buildDocumentMailto } from '@/lib/documentMailto';

export { buildDocumentMailto };

/** Activo solo cuando el build lo habilita explícitamente (preview/TEST). */
export const DOCUMENT_EMAIL_INTAKE_ENABLED = import.meta.env.VITE_DOCUMENT_EMAIL_INTAKE === 'true';

export interface EmailIntakeReference {
  address: string;
  subject: string;
  expiresAt: string;
  /** Instrucciones renderizadas por la UI en el idioma del usuario. */
}

export async function requestDocumentEmailReference(
  documentType: 'certificate' | 'cv',
): Promise<EmailIntakeReference> {
  const { data, error } = await supabase.functions.invoke('document-email-reference', {
    body: { document_type: documentType },
  });
  if (error) throw new Error(error.message);
  if (!data?.address || !data?.subject) throw new Error('invalid_reference_response');
  return {
    address: String(data.address),
    subject: String(data.subject),
    expiresAt: String(data.expires_at ?? ''),
  };
}
