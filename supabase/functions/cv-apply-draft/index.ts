// Edge Function: cv-apply-draft
// PB-CV-AUTO-PROFILE-001 — Aplica el draft SOLO con confirmación explícita.
//
// DRAFT FIRST (ticket §3-§4): esta función es el único camino de
// draft → perfil confirmado. Nada se aplica sin la decisión explícita del
// usuario (accept/edit por campo, experiencia y certificación).
//
// PROTECCIÓN ESTRUCTURAL CONTRA SOBRESCRITURA SILENCIOSA (ticket §4):
//   Si el perfil ya tiene un valor confirmado (no vacío) distinto del valor
//   del CV, el backend EXIGE overwrite:true en la decisión de ese campo; sin
//   eso responde 409 con la lista de conflictos para que la UI los muestre.
//   El conflicto no se resuelve solo: lo decide el usuario.
//
// PRIORIDAD DE FUENTES respetada:
//   1. dato confirmado → se conserva salvo overwrite explícito del usuario;
//   2. dato del CV → rellena huecos (campos vacíos);
//   nunca se escriben datos derivados.
//
// CERTIFICACIONES (ticket §6): las aceptadas se insertan como filas
// declared/unverified (is_verified=false, verified_at=null, sin Storage).
// Si ya existe una certificación con el mismo nombre NO se toca — mucho menos
// su estado de verificación.
//
// EXPERIENCIAS (ticket §5): antes de insertar se comparan employer/role/
// fechas contra las existentes; las coincidentes se omiten (merge) para no
// duplicar jamás.
//
// MARKETPLACE READY (ticket §7): tras aplicar, se invoca EXCLUSIVAMENTE el
// RPC canónico pb_recalculate_profile_state (mantiene o degrada; nunca
// promueve). Ningún flag derivado se escribe manualmente aquí.
//
// AUTH-ONLY (ticket §10): si no existe fila de perfil, no se crea aquí
// (ensureProfile lo hace al entrar el usuario): se responde
// profile_not_ready y la UI lo trata de forma graceful.
//
// IDEMPOTENCIA (ticket §15): un draft ya review_confirmed responde
// already_confirmed sin reescribir nada.
//
// PRIVACIDAD (ticket §12): logs solo con estados/contadores. Sin PII.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DRAFTS_TABLE = 'app_cv_extraction_drafts';
const EVENTS_TABLE = 'app_cv_extraction_events';
const PROFILES_TABLE = 'app_14da0f1941_profiles';
const EXPERIENCES_TABLE = 'app_worker_experiences';
const CERTIFICATIONS_TABLE = 'app_worker_certifications';

function json(obj: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function log(fields: Record<string, unknown>): void {
  const allowed = [
    'fn', 'event', 'status', 'draft_id', 'correlation_id',
    'fields_applied', 'fields_confirmed_count', 'experiences_applied_count',
    'experiences_merged_count', 'certifications_applied_count',
    'conflicts_count', 'time_to_confirmation_ms',
    'marketplace_ready_after_confirmation',
  ];
  const safe = Object.fromEntries(
    allowed.filter((k) => fields[k] !== undefined).map((k) => [k, fields[k]]),
  );
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...safe }));
}

// ─── Contrato de entrada ─────────────────────────────────────────────────────

interface FieldDecision {
  field: string;
  action: 'accept' | 'edit';
  value?: string | number | boolean | string[];
  /** Obligatorio (true) cuando el campo choca con un valor ya confirmado. */
  overwrite?: boolean;
}

interface ExperienceDecision {
  local_id: string;
  action: 'accept' | 'edit';
  patch?: {
    company_name?: string;
    position?: string;
    project_name?: string | null;
    city_region?: string | null;
    country?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    currently_working?: boolean;
    description_original?: string | null;
  };
}

interface CertificationDecision {
  local_id: string;
  action: 'accept';
}

interface ApplyBody {
  draft_id?: string;
  fields?: FieldDecision[];
  experiences?: ExperienceDecision[];
  certifications?: CertificationDecision[];
}

interface DraftField {
  field: string;
  value: string | number | boolean | string[] | null;
  confidence: string;
}

interface DraftExperience {
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
  confidence: string;
}

interface DraftCertification {
  local_id: string;
  name: string;
  confidence: string;
}

interface DraftRow {
  id: string;
  user_id: string;
  extraction_status: string;
  extracted_fields: DraftField[];
  proposed_experiences: DraftExperience[];
  proposed_certifications: DraftCertification[];
  created_at: string;
}

// ─── Mapeo campo del CV → columna de perfil ─────────────────────────────────
// Los campos sin columna canónica (email: auth es canónico; phone: flujo de
// verificación propio) no se aplican: la UI los muestra como informativos.

type Scalar = string | number | boolean | string[] | null;

const FIELD_TO_COLUMN: Readonly<Record<string, string>> = {
  full_name: 'full_name',
  title: 'title',
  location: 'location',
  summary: 'bio',
  years_experience: 'years_experience',
  skills: 'skills',
  welding_processes: 'skills',      // sin columna propia: merge en skills
  disciplines: 'skills',            // sin columna propia: merge en skills
  availability: 'availability_status',
  willing_to_travel: 'willing_to_travel',
  willing_to_relocate: 'willing_to_relocate',
};

/** Campos que la UI muestra pero el apply no escribe. */
const INFO_ONLY_FIELDS = new Set(['email', 'phone', 'languages', 'education', 'certifications_declared']);

const TEXT_COLUMNS = new Set(['full_name', 'title', 'location', 'bio']);

function isEmptyProfileValue(v: Scalar | undefined): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/**
 * Fechas del CV con precisión mes/año ("2019-03") o año ("2019") → DATE.
 * Las columnas start_date/end_date son DATE: sin normalizar, un CV con
 * "03/2019 - Actualmente" rompería el INSERT.
 */
function toDbDate(v?: string | null): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  return null;
}

function normalizeAvailability(value: Scalar): { availability_status: string; available_from: string | null } | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const v = value.trim().toLowerCase();
  if (v === 'immediately') return { availability_status: 'available_immediately', available_from: null };
  const m = v.match(/^from\s+(.+)$/);
  if (m) {
    const raw = m[1].trim().replace(/[/.]/g, '-');
    // MM-YYYY → YYYY-MM-01 (available_from es date).
    const mm = raw.match(/^(\d{1,2})-(\d{4})$/);
    if (mm) return { availability_status: 'available_from_date', available_from: `${mm[2]}-${mm[1].padStart(2, '0')}-01` };
    const yyyy = raw.match(/^(\d{4})$/);
    if (yyyy) return { availability_status: 'available_from_date', available_from: `${yyyy[1]}-01-01` };
    return { availability_status: 'available_from_date', available_from: null };
  }
  return null;
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
    .select('id, user_id, extraction_status, extracted_fields, proposed_experiences, proposed_certifications, created_at')
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

  // ── Perfil canónico (si no existe: ensureProfile pendiente, sin write) ──
  const { data: profile } = await serviceClient
    .from(PROFILES_TABLE)
    .select('full_name, title, location, bio, years_experience, skills, availability_status, available_from, willing_to_travel, willing_to_relocate')
    .eq('user_id', userId)
    .maybeSingle() as { data: Record<string, Scalar> | null };
  if (!profile) {
    // Ticket §10: NO fabricar perfil aquí. La UI asegura el perfil antes de
    // la revisión (ensureProfile al entrar); si aún no existe, reintentará.
    return json({ error: 'profile_not_ready', reason: 'canonical profile does not exist yet' }, 409);
  }

  // ─── Campos ───────────────────────────────────────────────────────────────
  const draftFields = new Map(draft.extracted_fields.map((f) => [f.field, f]));
  const decisions = new Map((body.fields ?? []).map((d) => [d.field, d]));

  const patch: Record<string, Scalar> = {};
  const conflicts: { field: string; profile_value: Scalar; cv_value: Scalar }[] = [];
  let fieldsConfirmed = 0;
  const skippedInfoOnly: string[] = [];
  const unavailable: string[] = [];

  const availability = decisions.get('availability');
  if (availability) {
    const draftField = draftFields.get('availability');
    if (draftField) {
      const value = availability.action === 'edit' && typeof availability.value === 'string'
        ? availability.value
        : draftField.value;
      const norm = normalizeAvailability(value);
      if (norm) {
        if (isEmptyProfileValue(profile['availability_status'])) {
          patch['availability_status'] = norm.availability_status;
          if (norm.available_from) patch['available_from'] = norm.available_from;
          fieldsConfirmed++;
        } else if (profile['availability_status'] !== norm.availability_status) {
          if (availability.overwrite === true) {
            patch['availability_status'] = norm.availability_status;
            if (norm.available_from) patch['available_from'] = norm.available_from;
            fieldsConfirmed++;
          } else {
            conflicts.push({ field: 'availability', profile_value: profile['availability_status'], cv_value: norm.availability_status });
          }
        }
      }
    }
  }

  for (const [fieldName, column] of Object.entries(FIELD_TO_COLUMN)) {
    if (fieldName === 'availability') continue; // tratado arriba (doble columna)
    const decision = decisions.get(fieldName);
    if (!decision) continue;
    const draftField = draftFields.get(fieldName);
    if (!draftField) {
      unavailable.push(fieldName);
      continue;
    }
    let value: Scalar;
    if (decision.action === 'edit') {
      value = decision.value ?? null;
    } else {
      value = draftField.value;
    }
    if (value === null || value === undefined) continue;

    if (column === 'skills') {
      // Merge (unión) de skills: del perfil + del CV, sin duplicados.
      const incoming = Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : [];
      if (!incoming.length) continue;
      const existing = Array.isArray(profile['skills']) ? (profile['skills'] as string[]) : [];
      const merged = [...new Set([...existing, ...incoming.map((s) => s.trim())])];
      if (merged.length !== existing.length) {
        patch['skills'] = merged;
        fieldsConfirmed++;
      }
      continue;
    }

    if (column === 'years_experience') {
      const n = typeof value === 'number' ? value : parseInt(String(value), 10);
      if (!Number.isFinite(n) || n < 0 || n > 60) continue;
      // 0 es el DEFAULT de la columna, no un dato confirmado por el usuario:
      // un perfil nuevo no debe chocar con los años extraídos del CV (§4).
      if (isEmptyProfileValue(profile[column]) || profile[column] === 0) {
        patch[column] = n;
        fieldsConfirmed++;
      } else if (profile[column] !== n) {
        if (decision.overwrite === true) {
          patch[column] = n;
          fieldsConfirmed++;
        } else {
          conflicts.push({ field: fieldName, profile_value: profile[column], cv_value: n });
        }
      }
      continue;
    }

    if (column === 'willing_to_travel' || column === 'willing_to_relocate') {
      if (value !== true) continue; // solo afirmaciones explícitas
      // willing_to_relocate: DEFAULT false de la columna = dato NO confirmado
      // por el usuario (§4); una afirmación explícita del CV lo añade sin
      // conflicto. willing_to_travel: DEFAULT true — un false en el perfil
      // SÍ es una decisión explícita del usuario y debe pedir overwrite.
      const defaultFalse = column === 'willing_to_relocate';
      if (isEmptyProfileValue(profile[column]) || (defaultFalse && profile[column] === false)) {
        patch[column] = true;
        fieldsConfirmed++;
      } else if (profile[column] !== true) {
        if (decision.overwrite === true) {
          patch[column] = true;
          fieldsConfirmed++;
        } else {
          conflicts.push({ field: fieldName, profile_value: profile[column], cv_value: true });
        }
      }
      continue;
    }

    // Columnas de texto.
    const s = typeof value === 'string' ? value.trim() : '';
    if (!s || !TEXT_COLUMNS.has(column)) continue;
    const clipped = s.slice(0, column === 'bio' ? 2000 : 120);
    if (isEmptyProfileValue(profile[column])) {
      patch[column] = clipped;
      fieldsConfirmed++;
    } else if ((profile[column] as string).trim() !== clipped) {
      if (decision.overwrite === true) {
        patch[column] = clipped;
        fieldsConfirmed++;
      } else {
        conflicts.push({ field: fieldName, profile_value: profile[column], cv_value: clipped });
      }
    }
  }

  for (const f of decisions.keys()) {
    if (INFO_ONLY_FIELDS.has(f)) skippedInfoOnly.push(f);
  }

  // Conflicto sin overwrite: NO se aplica NADA (transacción única del usuario).
  if (conflicts.length > 0) {
    log({ fn: 'cv-apply-draft', event: 'conflict', draft_id: draft.id, conflicts_count: conflicts.length, correlation_id: correlationId });
    return json({ error: 'conflict', conflicts }, 409);
  }

  // ─── Experiencias (dedupe antes de insertar — ticket §5) ──────────────────
  const { data: existingExperiences } = await serviceClient
    .from(EXPERIENCES_TABLE)
    .select('company_name, position, start_date, end_date')
    .eq('user_id', userId);
  const existing = existingExperiences ?? [];

  const isSameExperience = (
    a: { company_name?: string | null; position?: string | null; start_date?: string | null; end_date?: string | null },
    b: { company_name?: string | null; position?: string | null; start_date?: string | null; end_date?: string | null },
  ): boolean => {
    const norm = (v?: string | null) => (v ?? '').trim().toLowerCase();
    const company = norm(a.company_name) !== '' && norm(a.company_name) === norm(b.company_name);
    const role = norm(a.position) !== '' && norm(a.position) === norm(b.position);
    const dates = (a.start_date ?? null) === (b.start_date ?? null) && (a.end_date ?? null) === (b.end_date ?? null);
    return (company || role) && dates;
  };

  const experiencesToInsert: Record<string, unknown>[] = [];
  let experiencesMerged = 0;
  for (const decision of body.experiences ?? []) {
    const proposal = draft.proposed_experiences.find((e) => e.local_id === decision.local_id);
    if (!proposal) continue;
    const merged: DraftExperience = decision.action === 'edit' && decision.patch
      ? { ...proposal, ...decision.patch }
      : proposal;
    // §5: solo con datos suficientes.
    if (!merged.position?.trim() && !merged.company_name?.trim()) continue;
    const candidate = {
      // company_name es NOT NULL en la tabla: cadena vacía cuando el CV no
      // la declara explícitamente (el guard de arriba exige position).
      company_name: merged.company_name?.trim() || '',
      position: merged.position?.trim() || '',
      start_date: toDbDate(merged.start_date),
      end_date: merged.currently_working === true ? null : toDbDate(merged.end_date),
    };
    if (existing.some((e) => isSameExperience(e, candidate)) ||
        experiencesToInsert.some((e) => isSameExperience(e as typeof candidate, candidate))) {
      experiencesMerged++;
      continue;
    }
    experiencesToInsert.push({
      user_id: userId,
      ...candidate,
      position: candidate.position,
      project_name: merged.project_name ?? null,
      city_region: merged.city_region ?? null,
      country: merged.country ?? null,
      currently_working: merged.currently_working === true,
      description_original: merged.description_original?.slice(0, 2000) ?? null,
      visible_to_companies: true,
    });
  }

  // ─── Certificaciones (declared/unverified SIEMPRE — ticket §6) ────────────
  const { data: existingCerts } = await serviceClient
    .from(CERTIFICATIONS_TABLE)
    .select('certification_name')
    .eq('user_id', userId);
  const existingCertNames = new Set(
    (existingCerts ?? [])
      .map((c: { certification_name?: string | null }) => (c.certification_name ?? '').trim().toLowerCase())
      .filter(Boolean),
  );

  const certsToInsert: Record<string, unknown>[] = [];
  for (const decision of body.certifications ?? []) {
    if (decision.action !== 'accept') continue;
    const proposal = draft.proposed_certifications.find((c) => c.local_id === decision.local_id);
    if (!proposal?.name?.trim()) continue;
    const name = proposal.name.trim().slice(0, 160);
    // Duplicada (por nombre) → no se toca la existente ni su verificación.
    if (existingCertNames.has(name.toLowerCase())) continue;
    existingCertNames.add(name.toLowerCase());
    certsToInsert.push({
      user_id: userId,
      certification_name: name,
      issuing_organization: null,
      // DECLARED / UNVERIFIED — jamás verified por texto del CV.
      is_verified: false,
      verified_at: null,
      storage_bucket: null,
      storage_path: null,
      certificate_file_url: null,
      file_url: null,
      is_visible: true,
      visible_to_companies: true,
      notes: 'Declared in CV (unverified)',
    });
  }

  // ─── Escrituras (todas service_role, ownership verificado) ───────────────
  if (Object.keys(patch).length > 0) {
    const { error: updateError } = await serviceClient
      .from(PROFILES_TABLE)
      .update(patch)
      .eq('user_id', userId);
    if (updateError) {
      log({ fn: 'cv-apply-draft', event: 'profile_update_failed', draft_id: draft.id, correlation_id: correlationId });
      return json({ error: 'profile_update_failed' }, 500);
    }
  }

  if (experiencesToInsert.length > 0) {
    const { error: expError } = await serviceClient.from(EXPERIENCES_TABLE).insert(experiencesToInsert);
    if (expError) {
      log({ fn: 'cv-apply-draft', event: 'experience_insert_failed', draft_id: draft.id, correlation_id: correlationId });
      return json({ error: 'experience_insert_failed' }, 500);
    }
  }

  if (certsToInsert.length > 0) {
    const { error: certError } = await serviceClient.from(CERTIFICATIONS_TABLE).insert(certsToInsert);
    if (certError) {
      log({ fn: 'cv-apply-draft', event: 'certification_insert_failed', draft_id: draft.id, correlation_id: correlationId });
      return json({ error: 'certification_insert_failed' }, 500);
    }
  }

  // ─── Draft → review_confirmed (service_role puede tocar la fila) ─────────
  const { error: draftUpdateError } = await serviceClient
    .from(DRAFTS_TABLE)
    .update({ extraction_status: 'review_confirmed', reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', draft.id)
    .eq('user_id', userId);
  if (draftUpdateError) {
    log({ fn: 'cv-apply-draft', event: 'draft_close_failed', draft_id: draft.id, correlation_id: correlationId });
    return json({ error: 'draft_close_failed' }, 500);
  }

  // ─── Recálculo EXCLUSIVAMENTE canónico (ticket §7) ───────────────────────
  // pb_recalculate_profile_state mantiene o degrada marketplace_ready; nunca
  // promueve. La promoción solo existe por pb_complete_onboarding (wizard).
  let marketplaceReadyAfter = false;
  try {
    const { data: recalc, error: recalcError } = await serviceClient.rpc('pb_recalculate_profile_state', {
      p_user_id: userId,
      p_limit: 1,
    });
    if (!recalcError && Array.isArray(recalc) && recalc.length > 0) {
      marketplaceReadyAfter = recalc[0].caller_marketplace_ready === true;
    }
  } catch {
    // Fail-open del recálculo: no deshace la confirmación del usuario; el
    // recálculo canónico también corre en otros puntos del sistema.
  }

  // ─── Métricas (ticket §16, sin PII) ──────────────────────────────────────
  const timeToConfirmationMs = Date.now() - new Date(draft.created_at).getTime();
  try {
    await serviceClient.from(EVENTS_TABLE).insert({
      user_id: userId,
      draft_id: draft.id,
      event_type: 'cv_profile_review_confirmed',
      fields_confirmed_count: fieldsConfirmed,
      experiences_extracted_count: draft.proposed_experiences.length,
      experiences_applied_count: experiencesToInsert.length,
      certifications_proposed_count: draft.proposed_certifications.length,
      marketplace_ready_after_confirmation: marketplaceReadyAfter,
      time_to_confirmation_ms: timeToConfirmationMs,
    });
  } catch { /* métrica fail-open */ }

  log({
    fn: 'cv-apply-draft', event: 'confirmed', draft_id: draft.id,
    fields_confirmed_count: fieldsConfirmed,
    experiences_applied_count: experiencesToInsert.length,
    experiences_merged_count: experiencesMerged,
    marketplace_ready_after_confirmation: marketplaceReadyAfter,
    time_to_confirmation_ms: timeToConfirmationMs,
    correlation_id: correlationId,
  });

  return json({
    status: 'confirmed',
    draft_id: draft.id,
    fields_confirmed_count: fieldsConfirmed,
    experiences_applied_count: experiencesToInsert.length,
    experiences_merged_count: experiencesMerged,
    certifications_applied_count: certsToInsert.length,
    skipped_info_only: skippedInfoOnly,
    unavailable,
    marketplace_ready_after_confirmation: marketplaceReadyAfter,
  });
});
