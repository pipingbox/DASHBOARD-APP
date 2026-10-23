// Edge Function: cert-apply-draft (v2 — aplicación atómica transaccional)
// PB-CERT-AUTO-PROFILE-001 — Corrección de la revisión PO del PR #83.
//
// CAMBIO v2: toda la lógica de aplicación vive ahora en la función
//   PostgreSQL pb_cert_apply_draft (sql/044), ejecutada como UNA transacción
//   con SELECT ... FOR UPDATE sobre el draft y sobre la certificación
//   destino. Esta función es un wrapper fino: autentica, valida entrada,
//   invoca el RPC y mapea el resultado.
//
//   * CONCURRENCIA: dos confirmaciones simultáneas del mismo draft se
//     serializan en la base de datos; una confirma y la otra recibe
//     already_confirmed. Imposible crear dos certificaciones del mismo draft
//     o producir escrituras parciales.
//   * CERTIFICACIONES VERIFICADAS: los 5 campos extraíbles son parte de la
//     acreditación; un registro is_verified=true no se modifica por esta vía
//     (respuesta verified_cert_protected). El circuito canónico de
//     verificación es el único escritor de is_verified/verified_at.
//   * DECLARED/UNVERIFIED: INSERT nuevo → is_verified=false, verified_at=null
//     (garantizado por el RPC; el UPDATE jamás toca esos campos).
//   * Conflicto → 409 con conflicts[] y cero escrituras.
//   * Cross-user: draft ajeno → 404 (sin fuga de existencia); target ajeno → 403.
//
// PRIVACIDAD: logs solo con estados/contadores. Sin PII.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
    'protected_count',
  ];
  const safe = Object.fromEntries(
    allowed.filter((k) => fields[k] !== undefined).map((k) => [k, fields[k]]),
  );
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...safe }));
}

// ─── Contrato de entrada (idéntico a v1) ─────────────────────────────────────

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

interface RpcResult {
  status?: string;
  certification_id?: string;
  linked_existing?: boolean;
  fields_confirmed_count?: number;
  conflicts?: { field: string; existing_value: string | null; proposed_value: string }[];
  protected_fields?: string[];
  reason?: string;
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
  // p_user_id se deriva del JWT verificado; nunca se acepta del body.
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
  const { data: { user }, error: userError } = await serviceClient.auth.getUser(
    authHeader.slice('Bearer '.length),
  );
  if (userError || !user) return json({ error: 'unauthorized' }, 401);
  const userId = user.id;

  let body: ApplyBody;
  try {
    body = (await req.json()) as ApplyBody;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (!body?.draft_id) return json({ error: 'invalid_request', reason: 'draft_id required' }, 400);

  // ── Invocación del RPC atómico ────────────────────────────────────────────
  const { data, error } = await serviceClient.rpc('pb_cert_apply_draft', {
    p_draft_id: body.draft_id,
    p_user_id: userId,
    p_fields: body.fields ?? [],
    p_target_certification_id: body.target_certification_id ?? null,
    p_reject_linked: body.reject_linked === true,
  });

  if (error) {
    // Excepciones de PL/pgSQL: mapeo a códigos HTTP del contrato v1.
    const msg: string = error.message ?? '';
    if (msg.includes('draft_not_found')) {
      return json({ error: 'not_found' }, 404);
    }
    if (msg.includes('target_not_found')) {
      return json({ error: 'not_found', reason: 'target certification does not exist' }, 404);
    }
    if (msg.includes('target_not_owned')) {
      return json({ error: 'forbidden' }, 403);
    }
    if (msg.includes('invalid_draft_state')) {
      return json({ error: 'invalid_state', reason: msg.slice(0, 120) }, 409);
    }
    log({ fn: 'cert-apply-draft', event: 'rpc_error', draft_id: body.draft_id, correlation_id: correlationId });
    return json({ error: 'apply_failed' }, 500);
  }

  const result = (data ?? {}) as RpcResult;

  switch (result.status) {
    case 'confirmed':
      log({
        fn: 'cert-apply-draft', event: 'confirmed', draft_id: body.draft_id,
        fields_confirmed_count: result.fields_confirmed_count,
        linked_existing: result.linked_existing, correlation_id: correlationId,
      });
      return json({
        status: 'confirmed',
        draft_id: body.draft_id,
        certification_id: result.certification_id,
        linked_existing: result.linked_existing,
        fields_confirmed_count: result.fields_confirmed_count,
      });

    case 'already_confirmed':
      // Idempotencia: reintento tras confirmación; no se reescribe nada.
      log({ fn: 'cert-apply-draft', event: 'already_confirmed', draft_id: body.draft_id, correlation_id: correlationId });
      return json({ status: 'already_confirmed', draft_id: body.draft_id });

    case 'conflict':
      log({
        fn: 'cert-apply-draft', event: 'conflict', draft_id: body.draft_id,
        conflicts_count: result.conflicts?.length, correlation_id: correlationId,
      });
      return json({ error: 'conflict', conflicts: result.conflicts ?? [] }, 409);

    case 'verified_cert_protected':
      // Certificación verificada: campos de acreditación inmutables por esta
      // vía; los cambios requieren el circuito canónico (renovación).
      log({
        fn: 'cert-apply-draft', event: 'verified_cert_protected', draft_id: body.draft_id,
        protected_count: result.protected_fields?.length, correlation_id: correlationId,
      });
      return json({
        error: 'verified_cert_protected',
        certification_id: result.certification_id,
        protected_fields: result.protected_fields ?? [],
      }, 409);

    case 'error':
      return json({ error: 'invalid_request', reason: result.reason ?? 'invalid' }, 400);

    default:
      log({ fn: 'cert-apply-draft', event: 'unexpected_status', draft_id: body.draft_id, correlation_id: correlationId });
      return json({ error: 'apply_failed' }, 500);
  }
});
