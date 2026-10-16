// Edge Function: cv-extract
// PB-CV-AUTO-PROFILE-001 — Extracción DRAFT FIRST de datos profesionales de CV.
//
// ARQUITECTURA
//   Dos modos cerrados:
//     * USER (JWT de usuario): procesa el CV canónico del perfil
//       (cv_storage_bucket/cv_storage_path) o uno explícito dentro del
//       namespace del propietario. Nunca escribe el perfil: solo crea el
//       draft pendiente de revisión.
//     * SUPPORT (service_role): CV recibido por soporte. Exige match
//       INEQUÍVOCO por email con una cuenta auth.users. Identidad ambigua o
//       ausente → manual_review, SIN escritura (ticket §1C).
//
// IDEMPOTENCIA (ticket §15): hash SHA-256 del binario + user_id es UNIQUE.
//   Mismo CV → already_processed (o retry controlado si extraction_failed).
//   Nunca se crean drafts/experiencias duplicadas por reprocesado.
//
// DRAFT FIRST (ticket §3-§4): el resultado es SIEMPRE un draft
// 'pending_review'. Ningún dato confirmado se toca en esta función.
//
// CERTIFICACIONES (ticket §6): las detectadas se guardan como propuestas
// declared/unverified. Ninguna certificación queda verificada por texto.
//
// AUTH-ONLY (ticket §10): si no existe fila de perfil, el draft se crea igual
// (user_id de auth.users); el perfil canónico lo crea ensureProfile al
// entrar el usuario. Nada se declara Marketplace Ready aquí.
//
// EMAIL (ticket §11): solo el flujo SUPPORT envía el correo cv_review_pending
// localizado (preferred_language / user_metadata.lang, fallback en). El flujo
// USER notifica in-app (banner); un email por cada subida sería ruido.
//
// PRIVACIDAD (ticket §12): logs estructurados SOLO con estados, códigos y
// contadores. Jamás teléfonos, emails, nombres, contenido o fragmentos del
// CV. El texto extraído no sale de la infraestructura de PipingBox (motor
// determinista local, sin LLM externo).
//
// FALLOS (ticket §14): una extracción fallida conserva el CV (objeto Storage
// intacto) y marca el draft extraction_failed con error_code cerrado; el
// usuario puede completar su perfil manualmente y reintentar con seguridad.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractCv } from '../_shared/cv-extraction/engine.ts';
import { CV_EXTRACTION_ERROR_CODES, type CvExtractionErrorCode } from '../_shared/cv-extraction/types.ts';
import { extractText, sha256Hex } from '../_shared/cv-extraction/textExtract.ts';
import { createEmailProvider } from '../_shared/email-provider.ts';
import { renderActionEmail, resolveRecipientLanguage } from '../_shared/email-i18n/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DRAFTS_TABLE = 'app_cv_extraction_drafts';
const EVENTS_TABLE = 'app_cv_extraction_events';
const PROFILES_TABLE = 'app_14da0f1941_profiles';

/** Buckets válidos para un CV (espejo del allowlist de secure-file-access). */
const ALLOWED_CV_BUCKETS = ['app_14da0f1941_certificates'];

/** Límite del escaneo de auth.users por email en modo SUPPORT. */
const USER_SCAN_PAGE_SIZE = 500;
const USER_SCAN_MAX_PAGES = 20; // 10.000 usuarios; más allá → manual_review.

type DraftRow = {
  id: string;
  user_id: string;
  extraction_status: string;
  attempt_count: number;
  cv_language: string | null;
  file_name: string;
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
    'fn', 'mode', 'event', 'status', 'error_code', 'draft_id', 'correlation_id',
    'fields_count', 'experiences_count', 'certifications_count', 'attempt',
    'email_sent', 'lang',
  ];
  const safe = Object.fromEntries(
    allowed.filter((k) => fields[k] !== undefined).map((k) => [k, fields[k]]),
  );
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...safe }));
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  const n = Math.max(va.length, vb.length);
  let diff = va.length === vb.length ? 0 : 1;
  for (let i = 0; i < n; i++) diff |= (va[i] ?? 0) ^ (vb[i] ?? 0);
  return diff === 0;
}

function isKnownErrorCode(code: string): code is CvExtractionErrorCode {
  return (CV_EXTRACTION_ERROR_CODES as readonly string[]).includes(code);
}

async function emitEvent(
  supabase: ReturnType<typeof createClient>,
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

/** Busca el auth user con ese email (case-insensitive). 0/1 resultado. */
async function findUserByEmail(
  supabase: ReturnType<typeof createClient>,
  email: string,
): Promise<'ambiguous' | { id: string; lang: string | null; profileLang: string | null } | null> {
  const target = email.trim().toLowerCase();
  if (!target || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target)) return null;
  for (let page = 1; page <= USER_SCAN_MAX_PAGES; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: USER_SCAN_PAGE_SIZE,
    });
    if (error || !data) return null;
    const matches = data.users.filter((u) => (u.email ?? '').toLowerCase() === target);
    if (matches.length > 1) return 'ambiguous';
    if (matches.length === 1) {
      const u = matches[0];
      const metaLang = typeof u.user_metadata?.['lang'] === 'string' ? u.user_metadata['lang'] : null;
      let profileLang: string | null = null;
      const { data: profile } = await supabase
        .from(PROFILES_TABLE)
        .select('preferred_language')
        .eq('user_id', u.id)
        .maybeSingle();
      if (profile?.preferred_language) profileLang = profile.preferred_language;
      return { id: u.id, lang: metaLang, profileLang };
    }
    if (data.users.length < USER_SCAN_PAGE_SIZE) return null;
  }
  // Fuera del límite de escaneo: sin afirmar identidad → manual review.
  return 'ambiguous';
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

  // ── Autenticación: service_role (soporte) o JWT de usuario ──────────────
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
  const bearer = authHeader.slice('Bearer '.length);

  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await req.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch { /* body vacío válido en modo USER */ }

  // Modo SUPPORT: el Bearer ES la service_role key (comparación timing-safe).
  const isServiceRole = await timingSafeEqual(bearer, serviceKey);

  let userId: string;
  let channel: 'user_upload' | 'support_inbound';
  let cvBucket: string | null = null;
  let cvPath: string | null = null;
  let supportEmail: string | null = null;
  let supportLang: string | null = null;

  if (isServiceRole) {
    // ── Modo SUPPORT (ticket §1C) ──────────────────────────────────────────
    channel = 'support_inbound';
    cvBucket = typeof body.storage_bucket === 'string' ? body.storage_bucket : null;
    cvPath = typeof body.storage_path === 'string' ? body.storage_path : null;
    supportEmail = typeof body.candidate_email === 'string' ? body.candidate_email : null;
    if (!cvBucket || !cvPath || !supportEmail) {
      return json({ error: 'invalid_request', reason: 'storage_bucket, storage_path and candidate_email are required in support mode' }, 400);
    }

    const match = await findUserByEmail(serviceClient, supportEmail);
    if (!match || match === 'ambiguous') {
      // NO WRITE / MANUAL REVIEW (ticket §1C). Sin user_id inequívoco no hay
      // FK posible: se registra solo en el log estructurado (sin PII).
      log({ fn: 'cv-extract', mode: 'support', event: 'manual_review', correlation_id: correlationId });
      return json({
        status: 'manual_review',
        reason: match === 'ambiguous' ? 'ambiguous_or_beyond_scale_identity' : 'no_unequivocal_match',
      });
    }
    userId = match.id;

    // Ownership estricto (ticket §12): el objeto debe vivir dentro del
    // namespace del candidato. El operador de soporte lo sube allí.
    if (!cvPath.startsWith(`${userId}/`)) {
      return json({ error: 'invalid_request', reason: 'storage_path must be inside the candidate namespace' }, 400);
    }
    supportLang = match.profileLang ?? match.lang ?? 'en';
  } else {
    // ── Modo USER (JWT) ────────────────────────────────────────────────────
    channel = 'user_upload';
    const { data: { user }, error: userError } = await serviceClient.auth.getUser(bearer);
    if (userError || !user) return json({ error: 'unauthorized' }, 401);
    userId = user.id;

    const explicitBucket = typeof body.bucket === 'string' ? body.bucket : null;
    const explicitPath = typeof body.path === 'string' ? body.path : null;
    if (explicitBucket && explicitPath) {
      // Solo dentro del namespace del propio usuario.
      if (!ALLOWED_CV_BUCKETS.includes(explicitBucket) || !explicitPath.startsWith(`${userId}/`)) {
        return json({ error: 'invalid_request', reason: 'bucket or path outside the user namespace' }, 400);
      }
      cvBucket = explicitBucket;
      cvPath = explicitPath;
    } else {
      // CV canónico del perfil.
      const { data: profile, error: profileError } = await serviceClient
        .from(PROFILES_TABLE)
        .select('cv_storage_bucket, cv_storage_path')
        .eq('user_id', userId)
        .maybeSingle();
      if (profileError) return json({ error: 'profile_read_failed' }, 500);
      if (profile?.cv_storage_bucket && profile?.cv_storage_path) {
        cvBucket = profile.cv_storage_bucket;
        cvPath = profile.cv_storage_path;
      }
    }
  }

  if (!cvBucket || !cvPath) {
    return json({ error: 'no_cv', reason: 'no canonical CV found for this user' }, 400);
  }
  if (!ALLOWED_CV_BUCKETS.includes(cvBucket)) {
    return json({ error: 'invalid_request', reason: 'cv bucket not in allowlist' }, 400);
  }

  // ── Descarga del binario (service_role; nunca expone URLs firmadas) ─────
  const { data: fileData, error: downloadError } = await serviceClient.storage
    .from(cvBucket)
    .download(cvPath);
  if (downloadError || !fileData) {
    log({ fn: 'cv-extract', mode: channel, event: 'storage_read_failed', correlation_id: correlationId });
    return json({ error: 'storage_read_error' }, 502);
  }
  const bytes = new Uint8Array(await fileData.arrayBuffer());
  const hash = await sha256Hex(bytes);
  const fileName = cvPath.split('/').pop() || 'cv';
  const mimeType = fileData.type || null;

  // ── Idempotencia (ticket §15) ────────────────────────────────────────────
  const { data: existing } = await serviceClient
    .from(DRAFTS_TABLE)
    .select('id, extraction_status, attempt_count')
    .eq('user_id', userId)
    .eq('cv_sha256', hash)
    .maybeSingle() as { data: DraftRow | null };

  let draftId: string;
  let attempt: number;
  let isRetry = false;

  if (existing && (existing.extraction_status === 'pending_review' || existing.extraction_status === 'review_confirmed' || existing.extraction_status === 'dismissed')) {
    await emitEvent(serviceClient, userId, 'cv_already_processed', { draft_id: existing.id });
    log({ fn: 'cv-extract', mode: channel, event: 'already_processed', draft_id: existing.id, correlation_id: correlationId });
    return json({ status: 'already_processed', draft_id: existing.id, extraction_status: existing.extraction_status });
  }

  await emitEvent(serviceClient, userId, 'cv_extraction_started', {});

  if (existing && existing.extraction_status === 'extraction_failed') {
    // Retry seguro sobre la MISMA fila: sin duplicados (ticket §14-§15).
    draftId = existing.id;
    attempt = existing.attempt_count + 1;
    isRetry = true;
    await emitEvent(serviceClient, userId, 'cv_extraction_retried', { draft_id: draftId, attempt });
  } else if (existing) {
    draftId = existing.id;
    attempt = existing.attempt_count + 1;
  } else {
    draftId = crypto.randomUUID();
    attempt = 1;
  }

  // ── Extracción de texto + motor ──────────────────────────────────────────
  const textResult = await extractText(bytes, mimeType, fileName);

  const draftPayload = (status: string, extra: Record<string, unknown>) => ({
    id: draftId,
    user_id: userId,
    cv_sha256: hash,
    source_channel: channel,
    storage_bucket: cvBucket,
    storage_path: cvPath,
    file_name: fileName,
    mime_type: mimeType,
    file_size: bytes.byteLength,
    attempt_count: attempt,
    extraction_status: status,
    ...extra,
  });

  const upsertDraft = async (payload: Record<string, unknown>) => {
    const { error } = await serviceClient
      .from(DRAFTS_TABLE)
      .upsert(payload, { onConflict: 'user_id,cv_sha256' });
    if (error) {
      log({ fn: 'cv-extract', mode: channel, event: 'draft_write_failed', correlation_id: correlationId });
      throw new Error('draft_write_failed');
    }
  };

  if (!textResult.ok) {
    const errorCode = isKnownErrorCode(textResult.error) ? textResult.error : 'text_extraction_error';
    await upsertDraft(
      draftPayload('extraction_failed', {
        error_code: errorCode,
        extraction_method: 'unavailable',
        cv_language: null,
        extracted_fields: [],
        proposed_experiences: [],
        proposed_certifications: [],
      }),
    );
    await emitEvent(serviceClient, userId, 'cv_extraction_failed', { draft_id: draftId });
    log({ fn: 'cv-extract', mode: channel, event: 'extraction_failed', error_code: errorCode, draft_id: draftId, correlation_id: correlationId });
    // El CV NO se pierde: el objeto Storage sigue intacto y el usuario puede
    // completar su perfil manualmente o reintentar (§14).
    return json({
      status: 'extraction_failed',
      draft_id: draftId,
      error_code: errorCode,
      retry_supported: true,
    });
  }

  const result = extractCv({
    text: textResult.text,
    sourceDocumentId: draftId,
    now: new Date().toISOString(),
  });

  await upsertDraft(
    draftPayload('pending_review', {
      error_code: null,
      cv_language: result.language,
      extraction_method: textResult.method === 'docx_xml' ? 'docx_xml' : 'native_text',
      reviewed_at: null,
      extracted_fields: result.fields,
      proposed_experiences: result.experiences,
      proposed_certifications: result.certifications,
    }),
  );

  await emitEvent(serviceClient, userId, 'cv_extraction_completed', {
    draft_id: draftId,
    fields_extracted_count: result.fields.length,
    experiences_extracted_count: result.experiences.length,
    certifications_proposed_count: result.certifications.length,
  });

  log({
    fn: 'cv-extract', mode: channel, event: 'extraction_completed', draft_id: draftId,
    fields_count: result.fields.length, experiences_count: result.experiences.length,
    certifications_count: result.certifications.length, attempt, correlation_id: correlationId,
  });

  // ── Email de recuperación SOLO en flujo soporte (ticket §11) ─────────────
  let emailSent = false;
  if (channel === 'support_inbound') {
    const lang = (typeof supportLang === 'string' ? supportLang : 'en') || 'en';
    const appBaseUrl = (Deno.env.get('APP_BASE_URL') || 'https://pipingbox.com').replace(/\/$/, '');
    const provider = createEmailProvider();
    if (provider.isConfigured()) {
      try {
        const rendered = renderActionEmail({
          template: 'cv_review_pending',
          lang,
          actionUrl: `${appBaseUrl}/profile/cv-review`,
          vars: { name: '' },
          showExpiry: false,
        });
        const r = await provider.send({
          to: (supportEmail as string),
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          fromName: 'PipingBox',
        });
        emailSent = (r.rejected ?? 1) === 0;
      } catch {
        emailSent = false;
      }
    }
    log({ fn: 'cv-extract', mode: 'support', event: 'review_email', email_sent: emailSent, lang, correlation_id: correlationId });
  }

  return json({
    status: isRetry ? 'retried' : 'completed',
    draft_id: draftId,
    extraction_status: 'pending_review',
    language: result.language,
    fields_count: result.fields.length,
    experiences_count: result.experiences.length,
    certifications_count: result.certifications.length,
    email_sent: emailSent,
  });
});
