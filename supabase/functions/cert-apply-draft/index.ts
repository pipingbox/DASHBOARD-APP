// Edge Function: cert-apply-draft
// PB-CERT-AUTO-PROFILE-001 — Aplica el draft SOLO con confirmación explícita.
//
// DRAFT FIRST: esta función es el único camino de draft → certificación
//   canónica. Nada se aplica sin la decisión explícita del usuario
//   (accept/edit por campo).
//
// PROTECCIÓN ESTRUCTURAL CONTRA SOBRESCRITURA SILENCIOSA:
//   Si el registro destino ya tiene un valor (no vacío) distinto del
//   propuesto, el backend EXIGE overwrite:true en la decisión de ese campo;
//   sin eso responde 409 con la lista de conflictos y NO aplica NADA
//   (transacción única, sin escritura parcial).
//
// DECLARED/UNVERIFIED SIEMPRE:
//   - INSERT nuevo → is_verified=false, verified_at=null.
//   - UPDATE de existente → is_verified/verified_at JAMÁS en el payload: el
//     circuito canónico de verificación conserva su estado intacto, incluso
//     cuando el documento se vincula o reemplaza. La extracción no acredita
//     autenticidad ni concede Marketplace Ready.
//
// VINCULACIÓN SIN DUPLICADOS:
//   - target_certification_id dado → debe ser fila del propio usuario
//     (si no, 403). UPDATE de esa fila.
//   - draft.linked_certification_id (propuesta inequívoca del backend) →
//     UPDATE de esa fila salvo que el usuario la rechace.
//   - Sin destino → INSERT nuevo con storage_bucket/storage_path del draft
//     (documento vinculado canónicamente).
//
// IDEMPOTENCIA: un draft ya review_confirmed responde already_confirmed sin
//   reescribir nada.
//
// PRIVACIDAD: logs solo con estados/contadores. Sin PII.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DRAFTS_TABLE = 'app_cert_extraction_drafts';
const EVENTS_TABLE = 'app_cert_extraction_events';
const CERTS_TABLE = 'app_worker_certifications';

function json(obj: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function log(fields: Record<string, unknown>): void {
  const allowed = [
    'fn', 'event', 'status', 'draft_id', 'correlation_id',
    'fields_confirmed_count', 'conflicts_count', 'linked_existing',
  ];
  const safe = Object.fromEntries(
    allowed.filter((k) => fields[k] !== undefined).map((k) => [k, fields[k]]),
  );
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...safe }));
}

// ─── Contrato de entrada ─────────────────────────────────────────────────────

interface FieldDecision {
  field: 'certification_name' | 'issuing_organization' | 'credential_id' | 'issue_date' | 'expiry_date';
  action: 'accept' | 'edit';
  value?: string;
  /** Obligatorio (true) cuando el campo choca con un valor ya existente. */
  overwrite?: boolean;
}

interface ApplyBody {
  draft_id?: string;
  fields?: FieldDecision[];
  /** Destino explícito elegido por el usuario (vinculación a existente). */
  target_certification_id?: string | null;
  /** true si el usuario rechaza el vínculo propuesto por el backend. */
  reject_linked?: boolean;
}

interface DraftField {
  field: string;
  value: string;
  confidence: string;
}

interface DraftRow {
  id: string;
  user_id: string;
  extraction_status: string;
  extracted_fields: DraftField[];
  storage_bucket: string;
  storage_path: string;
  linked_certification_id: string | null;
  created_at: string;
}

interface CertRow {
  id: string;
  user_id: string;
  certification_name: string | null;
  issuing_organization: string | null;
  credential_id: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
}

/** Mapeo campo del draft → columna canónica. */
const FIELD_TO_COLUMN: Readonly<Record<string, string>> = {
  certification_name: 'certification_name',
  issuing_organization: 'issuing_organization',
  credential_id: 'credential_id',
  issue_date: 'issue_date',
  expiry_date: 'expiry_date',
};

const DATE_FIELDS = new Set(['issue_date', 'expiry_date']);
const MAX_TEXT = 160;

function isEmptyValue(v: string | null | undefined): boolean {
  return v === null || v === undefined || v.trim() === '';
}

/** Solo fechas ISO completas (el motor ya las normaliza; defensa en profundidad). */
function toDbDate(v: string | null | undefined): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const s = v.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

Deno.serve(async (req: Request) => {
  const correlationId = crypto.randomUUID();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceKey) return json({ error: 'missing_env' }, 500);

  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Autenticación: SOLO JWT de usuario ──────────────────────────────────
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
  const { data: { user }, error: userError } = await serviceClient.auth.getUser(authHeader.slice('Bearer '.length));
  if (userError || !user) return json({ error: 'unauthorized' }, 401);
  const userId = user.id;

  let body: ApplyBody;
  try {
    body = (await req.json()) as ApplyBody;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (!body?.draft_id) return json({ error: 'invalid_request', reason: 'draft_id required' }, 400);

  // ── Draft: SOLO del propietario (cross-user = 404) ──────────────────────
  const { data: draft, error: draftError } = await serviceClient
    .from(DRAFTS_TABLE)
    .select('id, user_id, extraction_status, extracted_fields, storage_bucket, storage_path, linked_certification_id, created_at')
    .eq('id', body.draft_id)
    .eq('user_id', userId)
    .maybeSingle() as { data: DraftRow | null; error: { message: string } | null };
  if (draftError) return json({ error: 'draft_read_failed' }, 500);
  if (!draft) return json({ error: 'not_found' }, 404);

  if (draft.extraction_status === 'review_confirmed') {
    return json({ status: 'already_confirmed', draft_id: draft.id });
  }
  if (draft.extraction_status !== 'pending_review') {
    return json({ error: 'invalid_state', reason: `draft is ${draft.extraction_status}` }, 409);
  }

  // ── Destino: UPDATE de existente o INSERT nuevo ──────────────────────────
  let targetId: string | null = null;
  if (typeof body.target_certification_id === 'string' && body.target_certification_id) {
    targetId = body.target_certification_id;
  } else if (draft.linked_certification_id && body.reject_linked !== true) {
    targetId = draft.linked_certification_id;
  }

  let existing: CertRow | null = null;
  if (targetId) {
    const { data: cert, error: certError } = await serviceClient
      .from(CERTS_TABLE)
      .select('id, user_id, certification_name, issuing_organization, credential_id, issue_date, expiry_date, storage_bucket, storage_path')
      .eq('id', targetId)
      .maybeSingle() as { data: CertRow | null; error: { message: string } | null };
    if (certError) return json({ error: 'cert_read_failed' }, 500);
    if (!cert) return json({ error: 'not_found', reason: 'target certification does not exist' }, 404);
    // Cross-user: jamás se toca una fila de otro usuario.
    if (cert.user_id !== userId) return json({ error: 'forbidden' }, 403);
    existing = cert;
  }

  // ─── Resolución campo a campo ─────────────────────────────────────────────
  const draftFields = new Map(draft.extracted_fields.map((f) => [f.field, f]));
  const decisions = new Map((body.fields ?? []).map((d) => [d.field, d]));

  const patch: Record<string, string | null> = {};
  const conflicts: { field: string; existing_value: string | null; proposed_value: string }[] = [];
  let fieldsConfirmed = 0;

  for (const [fieldName, column] of Object.entries(FIELD_TO_COLUMN)) {
    const decision = decisions.get(fieldName as FieldDecision['field']);
    if (!decision) continue;
    const draftField = draftFields.get(fieldName);
    if (!draftField && decision.action !== 'edit') continue;

    let value: string | null;
    if (decision.action === 'edit') {
      value = typeof decision.value === 'string' ? decision.value.trim() : null;
    } else {
      value = draftField?.value?.trim() ?? null;
    }
    if (!value) continue;

    if (DATE_FIELDS.has(fieldName)) {
      const dbDate = toDbDate(value);
      if (!dbDate) continue; // fecha no ISO completa: no se aplica (nunca se inventa)
      value = dbDate;
    } else {
      value = value.slice(0, MAX_TEXT);
    }

    if (existing) {
      const current = existing[column as keyof CertRow] as string | null;
      if (isEmptyValue(current)) {
        patch[column] = value;
        fieldsConfirmed++;
      } else if (current !== value) {
        if (decision.overwrite === true) {
          patch[column] = value;
          fieldsConfirmed++;
        } else {
          conflicts.push({ field: fieldName, existing_value: current, proposed_value: value });
        }
      }
      // current === value → ya estaba; no cuenta como confirmado.
    } else {
      patch[column] = value;
      fieldsConfirmed++;
    }
  }

  // Conflicto sin overwrite: NO se aplica NADA (transacción única del usuario).
  if (conflicts.length > 0) {
    log({ fn: 'cert-apply-draft', event: 'conflict', draft_id: draft.id, conflicts_count: conflicts.length, correlation_id: correlationId });
    return json({ error: 'conflict', conflicts }, 409);
  }

  // Un INSERT nuevo exige al menos el nombre (coherente con el alta manual).
  if (!existing && isEmptyValue(patch['certification_name'] ?? null)) {
    return json({ error: 'invalid_request', reason: 'certification_name is required for a new certification' }, 400);
  }

  // ─── Escritura (service_role, ownership verificado) ──────────────────────
  let certificationId: string;
  if (existing) {
    // UPDATE: solo los campos decididos + documento vinculado si la fila no
    // tenía referencia de Storage. is_verified/verified_at JAMÁS se tocan:
    // el circuito canónico de verificación conserva su estado intacto.
    const updatePayload: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
    if (isEmptyValue(existing.storage_path)) {
      updatePayload.storage_bucket = draft.storage_bucket;
      updatePayload.storage_path = draft.storage_path;
    }
    const { error: updateError } = await serviceClient
      .from(CERTS_TABLE)
      .update(updatePayload)
      .eq('id', existing.id)
      .eq('user_id', userId);
    if (updateError) {
      log({ fn: 'cert-apply-draft', event: 'cert_update_failed', draft_id: draft.id, correlation_id: correlationId });
      return json({ error: 'cert_update_failed' }, 500);
    }
    certificationId = existing.id;
  } else {
    // INSERT nuevo: DECLARED / UNVERIFIED siempre.
    const insertPayload: Record<string, unknown> = {
      user_id: userId,
      certification_name: patch['certification_name'],
      issuing_organization: patch['issuing_organization'] ?? null,
      credential_id: patch['credential_id'] ?? null,
      issue_date: patch['issue_date'] ?? null,
      expiry_date: patch['expiry_date'] ?? null,
      expiration_date: patch['expiry_date'] ?? null,
      storage_bucket: draft.storage_bucket,
      storage_path: draft.storage_path,
      is_verified: false,
      verified_at: null,
      is_visible: true,
      visible_to_companies: true,
    };
    const { data: inserted, error: insertError } = await serviceClient
      .from(CERTS_TABLE)
      .insert(insertPayload)
      .select('id')
      .single() as { data: { id: string } | null; error: { message: string } | null };
    if (insertError || !inserted) {
      log({ fn: 'cert-apply-draft', event: 'cert_insert_failed', draft_id: draft.id, correlation_id: correlationId });
      return json({ error: 'cert_insert_failed' }, 500);
    }
    certificationId = inserted.id;
  }

  // ─── Draft → review_confirmed ────────────────────────────────────────────
  const { error: draftUpdateError } = await serviceClient
    .from(DRAFTS_TABLE)
    .update({
      extraction_status: 'review_confirmed',
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      linked_certification_id: certificationId,
    })
    .eq('id', draft.id)
    .eq('user_id', userId);
  if (draftUpdateError) {
    log({ fn: 'cert-apply-draft', event: 'draft_close_failed', draft_id: draft.id, correlation_id: correlationId });
    return json({ error: 'draft_close_failed' }, 500);
  }

  // ─── Métricas (sin PII) ──────────────────────────────────────────────────
  try {
    await serviceClient.from(EVENTS_TABLE).insert({
      user_id: userId,
      draft_id: draft.id,
      event_type: 'cert_review_confirmed',
      fields_confirmed_count: fieldsConfirmed,
      linked_existing: existing !== null,
    });
  } catch { /* métrica fail-open */ }

  log({
    fn: 'cert-apply-draft', event: 'confirmed', draft_id: draft.id,
    fields_confirmed_count: fieldsConfirmed, linked_existing: existing !== null,
    correlation_id: correlationId,
  });

  return json({
    status: 'confirmed',
    draft_id: draft.id,
    certification_id: certificationId,
    linked_existing: existing !== null,
    fields_confirmed_count: fieldsConfirmed,
  });
});
