// Edge Function: cert-extract
// PB-CERT-AUTO-PROFILE-001 — Extracción DRAFT FIRST de datos de certificados.
//
// ARQUITECTURA
//   Un único modo: USER (JWT de usuario). El documento debe vivir dentro del
//   namespace del propio usuario en el bucket de certificados (lo sube el
//   flujo existente de CertificationDialog). Nunca escribe
//   app_worker_certifications: solo crea/actualiza el draft pendiente de
//   revisión.
//
// DRAFT FIRST: el resultado es SIEMPRE un draft 'pending_review' (o
//   'extraction_failed' conservando el documento). Ningún dato confirmado se
//   toca en esta función. La confirmación es cert-apply-draft.
//
// DECLARED/UNVERIFIED SIEMPRE: esta función jamás toca is_verified ni
//   verified_at. La extracción no acredita autenticidad ni concede
//   Marketplace Ready.
//
// IDEMPOTENCIA: hash SHA-256 del binario + user_id es UNIQUE. Mismo
//   documento → already_processed (o retry controlado si extraction_failed).
//
// VINCULACIÓN SIN DUPLICADOS: si el nombre extraído coincide INEQUÍVOCAMENTE
//   con una única certificación existente del usuario (match por nombre
//   normalizado), el draft la propone en linked_certification_id. Si hay 0 o
//   2+ candidatas, no se propone vínculo: el usuario decide en la revisión.
//   Jamás se fusionan registros ambiguos automáticamente.
//
// FORMATOS (fase 1): PDF con texto nativo. Imagen/scan → extraction_failed
//   con error_code cerrado y documento conservado (fallback manual honesto;
//   sin OCR todavía — propuesta separada sujeta a aprobación).
//
// PRIVACIDAD: logs estructurados SOLO con estados, códigos y contadores.
//   Jamás contenido del documento. El texto no sale de la infraestructura
//   (motor determinista local, sin LLM/OCR externo).

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractCert } from '../_shared/cv-extraction/certEngine.ts';
import { extractText, sha256Hex } from '../_shared/cv-extraction/textExtract.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DRAFTS_TABLE = 'app_cert_extraction_drafts';
const EVENTS_TABLE = 'app_cert_extraction_events';
const CERTS_TABLE = 'app_worker_certifications';

/** Bucket canónico de certificados (mismo que CertificationDialog). */
const ALLOWED_CERT_BUCKETS = ['app_14da0f1941_certificates'];

const CERT_ERROR_CODES = [
  'no_extractable_text', 'unsupported_mime', 'text_extraction_error',
  'engine_error', 'storage_read_error',
] as const;

type DraftRow = {
  id: string;
  extraction_status: string;
  attempt_count: number;
};

function json(obj: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Log estructurado sin PII ni secretos: solo enums, códigos y contadores. */
function log(fields: Record<string, unknown>): void {
  const allowed = [
    'fn', 'event', 'status', 'error_code', 'draft_id', 'correlation_id',
    'fields_count', 'linked_existing', 'attempt',
  ];
  const safe = Object.fromEntries(
    allowed.filter((k) => fields[k] !== undefined).map((k) => [k, fields[k]]),
  );
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...safe }));
}

async function emitEvent(
  supabase: SupabaseClient,
  userId: string,
  eventType: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  // Fail-open: una métrica fallida jamás rompe la extracción.
  try {
    await supabase.from(EVENTS_TABLE).insert({ user_id: userId, event_type: eventType, ...extra });
  } catch (e) {
    log({ event: 'metric_insert_error', error_code: String(e).slice(0, 60) });
  }
}

function isKnownErrorCode(code: string): boolean {
  return (CERT_ERROR_CODES as readonly string[]).includes(code);
}

/**
 * Vínculo propuesto a certificación existente del usuario, SOLO cuando el
 * match por nombre normalizado es inequívoco (exactamente 1 candidata).
 * 0 o 2+ → null (el usuario decide en la revisión; nunca se fusiona).
 */
async function findUnequivocalCertMatch(
  supabase: SupabaseClient,
  userId: string,
  certName: string,
): Promise<string | null> {
  const target = certName.trim().toLowerCase();
  if (!target) return null;
  const { data, error } = await supabase
    .from(CERTS_TABLE)
    .select('id, certification_name')
    .eq('user_id', userId);
  if (error || !data) return null;
  const matches = data.filter(
    (c) => (c.certification_name ?? '').trim().toLowerCase() === target,
  );
  return matches.length === 1 ? matches[0].id : null;
}

Deno.serve(async (req: Request) => {
  const correlationId = crypto.randomUUID();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'missing_env' }, 500);
  }

  // ── Autenticación: JWT de usuario (único modo) ──────────────────────────
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
  const bearer = authHeader.slice('Bearer '.length);

  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error: userError } = await serviceClient.auth.getUser(bearer);
  if (userError || !user) return json({ error: 'unauthorized' }, 401);
  const userId = user.id;

  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await req.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch { /* body inválido → 400 abajo */ }

  const bucket = typeof body.storage_bucket === 'string' ? body.storage_bucket : null;
  const path = typeof body.storage_path === 'string' ? body.storage_path : null;
  if (!bucket || !path) {
    return json({ error: 'invalid_request', reason: 'storage_bucket and storage_path are required' }, 400);
  }
  // Ownership estricto: el objeto debe vivir dentro del namespace del usuario.
  if (!ALLOWED_CERT_BUCKETS.includes(bucket) || !path.startsWith(`${userId}/`)) {
    return json({ error: 'invalid_request', reason: 'bucket or path outside the user namespace' }, 400);
  }

  // ── Descarga del binario (service_role; nunca expone URLs firmadas) ─────
  const { data: fileData, error: downloadError } = await serviceClient.storage
    .from(bucket)
    .download(path);
  if (downloadError || !fileData) {
    log({ fn: 'cert-extract', event: 'storage_read_failed', correlation_id: correlationId });
    return json({ error: 'storage_read_error' }, 502);
  }
  const bytes = new Uint8Array(await fileData.arrayBuffer());
  const hash = await sha256Hex(bytes);
  const fileName = path.split('/').pop() || 'certificate';
  const mimeType = fileData.type || null;

  // ── Idempotencia ─────────────────────────────────────────────────────────
  const { data: existing } = await serviceClient
    .from(DRAFTS_TABLE)
    .select('id, extraction_status, attempt_count')
    .eq('user_id', userId)
    .eq('doc_sha256', hash)
    .maybeSingle() as { data: DraftRow | null };

  if (existing && (existing.extraction_status === 'pending_review' || existing.extraction_status === 'review_confirmed' || existing.extraction_status === 'dismissed')) {
    await emitEvent(serviceClient, userId, 'cert_already_processed', { draft_id: existing.id });
    log({ fn: 'cert-extract', event: 'already_processed', draft_id: existing.id, correlation_id: correlationId });
    return json({ status: 'already_processed', draft_id: existing.id, extraction_status: existing.extraction_status });
  }

  await emitEvent(serviceClient, userId, 'cert_extraction_started', {});

  let draftId: string;
  let attempt: number;
  let isRetry = false;

  if (existing && existing.extraction_status === 'extraction_failed') {
    // Retry seguro sobre la MISMA fila: sin duplicados.
    draftId = existing.id;
    attempt = existing.attempt_count + 1;
    isRetry = true;
    await emitEvent(serviceClient, userId, 'cert_extraction_retried', { draft_id: draftId, attempt });
  } else {
    draftId = crypto.randomUUID();
    attempt = 1;
  }

  // ── Extracción de texto + motor ──────────────────────────────────────────
  const textResult = await extractText(bytes, mimeType, fileName);

  const draftPayload = (status: string, extra: Record<string, unknown>) => ({
    id: draftId,
    user_id: userId,
    doc_sha256: hash,
    storage_bucket: bucket,
    storage_path: path,
    file_name: fileName,
    mime_type: mimeType,
    attempt_count: attempt,
    extraction_status: status,
    ...extra,
  });

  const upsertDraft = async (payload: Record<string, unknown>) => {
    const { error } = await serviceClient
      .from(DRAFTS_TABLE)
      .upsert(payload, { onConflict: 'user_id,doc_sha256' });
    if (error) {
      log({ fn: 'cert-extract', event: 'draft_write_failed', correlation_id: correlationId });
      throw new Error('draft_write_failed');
    }
  };

  if (!textResult.ok) {
    const errorCode = isKnownErrorCode(textResult.error) ? textResult.error : 'text_extraction_error';
    await upsertDraft(
      draftPayload('extraction_failed', {
        error_code: errorCode,
        extraction_method: 'unavailable',
        extracted_fields: [],
        linked_certification_id: null,
      }),
    );
    await emitEvent(serviceClient, userId, 'cert_extraction_failed', { draft_id: draftId });
    log({ fn: 'cert-extract', event: 'extraction_failed', error_code: errorCode, draft_id: draftId, correlation_id: correlationId });
    // El documento NO se pierde: el objeto Storage sigue intacto y el usuario
    // completa los datos manualmente (fallback honesto) o reintenta.
    return json({
      status: 'extraction_failed',
      draft_id: draftId,
      error_code: errorCode,
      retry_supported: true,
    });
  }

  const result = extractCert({
    text: textResult.text,
    sourceDocumentId: draftId,
    extractedAt: new Date().toISOString(),
  });

  // Vínculo propuesto (solo match inequívoco por nombre normalizado).
  const extractedName = result.fields.find((f) => f.field === 'certification_name')?.value ?? null;
  const linkedId = extractedName
    ? await findUnequivocalCertMatch(serviceClient, userId, extractedName)
    : null;

  await upsertDraft(
    draftPayload('pending_review', {
      error_code: null,
      extraction_method: 'native_text',
      reviewed_at: null,
      extracted_fields: result.fields,
      linked_certification_id: linkedId,
    }),
  );

  await emitEvent(serviceClient, userId, 'cert_extraction_completed', {
    draft_id: draftId,
    fields_extracted_count: result.fields.length,
    linked_existing: linkedId !== null,
  });

  log({
    fn: 'cert-extract', event: 'extraction_completed', draft_id: draftId,
    fields_count: result.fields.length, linked_existing: linkedId !== null,
    attempt, correlation_id: correlationId,
  });

  return json({
    status: isRetry ? 'retried' : 'completed',
    draft_id: draftId,
    extraction_status: 'pending_review',
    language: result.language,
    fields_count: result.fields.length,
    linked_certification_id: linkedId,
  });
});
