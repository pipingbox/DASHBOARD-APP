/**
 * PB-DOCUMENT-INTAKE-001 — Entrega B: document-email-admin.
 *
 * Backend de la bandeja «Documentos recibidos». Autenticación: JWT de usuario
 * + rol admin en app_14da0f1941_profiles (nunca user_metadata). Acciones:
 *   - list: mensajes con filtros (sin exposición innecesaria: sin remitente,
 *     asunto ni contenido — no se persisten por diseño).
 *   - detail: mensaje + adjuntos + borradores de extracción + URL firmada de
 *     cuarentena de CORTA duración (<= 60 s) para revisión.
 *   - send_for_confirmation: EXTRACTION_PENDING → AWAITING_USER_CONFIRMATION
 *     (estado máximo de la fase TEST).
 *   - reject: → REJECTED.
 *   - correct_extraction: corrección admin de un campo de extracción.
 *   - promote: SIEMPRE 403 — la promoción está desactivada en esta fase.
 */

import {
  createServiceClient,
  createSupabaseDbAdapter,
  createSupabaseStorageAdapter,
} from '../_shared/document-intake/adapters.ts';
import { runAdminAction, type AdminAction } from '../_shared/document-intake/pipeline.ts';
import type { MessageStatus } from '../_shared/document-intake/states.ts';
import type { TelemetryConfig } from '../_shared/document-intake/telemetry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function telemetryConfig(): TelemetryConfig {
  return {
    posthogKey: Deno.env.get('POSTHOG_KEY'),
    posthogHost: Deno.env.get('POSTHOG_HOST'),
    environment: Deno.env.get('DOCUMENT_INTAKE_ENV') ?? 'production',
    appVersion: Deno.env.get('APP_VERSION'),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'missing_authorization' });

  const supabase = createServiceClient();
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (error || !user) return json(401, { error: 'invalid_token' });

  // Autorización: rol admin desde la tabla de perfiles (RLS-backed), nunca
  // user_metadata.
  const { data: profile } = await supabase
    .from('app_14da0f1941_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.role !== 'admin') return json(403, { error: 'forbidden' });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: 'invalid_payload' });
  }

  const db = createSupabaseDbAdapter(supabase);
  const op = String(body.op ?? '');

  if (op === 'list') {
    const messages = await db.listMessages({
      status: typeof body.status === 'string' ? (body.status as MessageStatus) : undefined,
      limit: Math.min(Number(body.limit ?? 50), 100),
    });
    return json(200, { messages });
  }

  if (op === 'detail') {
    const messageId = String(body.message_id ?? '');
    const message = await db.getMessage(messageId);
    if (!message) return json(404, { error: 'not_found' });
    const attachments = await db.listAttachments(messageId);
    const storage = createSupabaseStorageAdapter(supabase);
    const withUrls = await Promise.all(
      attachments.map(async (a) => ({
        ...a,
        review_url: a.quarantine_object_key
          ? await storage.createSignedQuarantineUrl(a.quarantine_object_key, 60).catch(() => null)
          : null,
      })),
    );
    const { data: extraction } = await supabase
      .from('app_14da0f1941_document_extraction_fields')
      .select('*')
      .in('attachment_id', attachments.map((a) => a.id));
    return json(200, { message, attachments: withUrls, extraction_fields: extraction ?? [] });
  }

  const action: AdminAction | null =
    op === 'send_for_confirmation'
      ? { action: 'send_for_confirmation', messageId: String(body.message_id ?? '') }
      : op === 'reject'
        ? { action: 'reject', messageId: String(body.message_id ?? '') }
        : op === 'correct_extraction'
          ? { action: 'correct_extraction', extractionFieldId: String(body.field_id ?? ''), correctedValue: String(body.corrected_value ?? '') }
          : op === 'promote'
            ? { action: 'promote', messageId: String(body.message_id ?? '') }
            : null;
  if (!action) return json(400, { error: 'invalid_op' });

  const result = await runAdminAction(
    { db, telemetry: telemetryConfig(), now: () => new Date() },
    action,
  );
  return json(result.httpStatus, result.body);
});
