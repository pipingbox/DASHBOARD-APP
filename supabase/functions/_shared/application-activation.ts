// _shared/application-activation.ts
// PB-JOBS-MARKETPLACE-READY-ACTIVATION-001
//
// Lógica compartida del flujo de candidaturas con perfil no Marketplace Ready:
//
//   EMAIL 1 (application_pending_profile): "Candidatura recibida — completa tu
//     perfil para activarla." Se envía una única vez por candidatura (claim
//     table con PK = application_id, patrón sql/030e/030f).
//
//   EMAIL 2 (marketplace_ready): "Perfil validado — tus candidaturas ya pueden
//     revisarse". Se drena el outbox app_14da0f1941_marketplace_ready_activations
//     (una fila por transición efectiva false -> true, creada por el trigger de
//     la migración sql/034). Nunca pasa candidaturas a sent_to_client.
//
// Idioma: resuelto EN TIEMPO DE ENVÍO con el resolver canónico de
// PB-I18N-EMAIL-001 (user_metadata.lang → profiles.preferred_language → fallback
// 'en'). No se introduce ninguna fuente nueva de idioma.
//
// Seguridad: todo se ejecuta con cliente service_role desde Edge Functions
// backend; los cambios de estado usan las RPCs SECURITY DEFINER de sql/034
// (EXECUTE solo para service_role). El módulo nunca confía en datos del cliente
// para decidir marketplace_ready ni autorización.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createEmailProvider, type EmailProvider } from "./email-provider.ts";
import { resolveRecipientLanguage, type ResolvedLanguage } from "./email-i18n/languages.ts";
import {
  renderApplicationPendingProfileEmail,
  renderMarketplaceReadyEmail,
} from "./email-i18n/render.ts";
import type { PendingProfileItemKey } from "./email-i18n/types.ts";

export const PROFILES_TABLE = "app_14da0f1941_profiles";
export const JOB_APPLICATIONS_TABLE = "app_14da0f1941_job_applications";
export const MARKETPLACE_READY_ACTIVATIONS_TABLE = "app_14da0f1941_marketplace_ready_activations";

/** Ventana de frescura del EMAIL 1 (igual que el emisor admin v13). */
export const PENDING_EMAIL_FRESHNESS_MS = 15 * 60 * 1000;
export const MAX_ACTIVATION_ATTEMPTS = 3;
export const ACTIVATION_LEASE_SECONDS = 120;
/** Máx. títulos de ofertas listados en el EMAIL 2. */
export const MAX_JOB_TITLES_IN_EMAIL = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Elementos pendientes del perfil (espejo de recalculate-profiles)
// ─────────────────────────────────────────────────────────────────────────────

export interface ProfileForItems {
  full_name?: string | null;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  years_experience?: number | null;
  skills?: string[] | null;
  bio?: string | null;
  avatar_url?: string | null;
  cv_storage_bucket?: string | null;
  cv_storage_path?: string | null;
  cv_file_url?: string | null;
  cv_url?: string | null;
}

export interface ProfileCounts {
  experiences: number;
  certifications: number;
  documents: number;
}

function hasCv(p: ProfileForItems): boolean {
  const canonical = Boolean(p.cv_storage_bucket && p.cv_storage_path);
  return canonical || Boolean(p.cv_file_url) || Boolean(p.cv_url);
}

/**
 * Claves de elementos pendientes, espejo exacto de calculateCompletion()
 * (recalculate-profiles). name/title agrupadas en basic_details; los pesos
 * originales (10/5/5/5/5/5/10/10/15/15/10/5) se conservan en el cálculo
 * canónico; aquí solo se lista qué falta.
 */
export function computePendingProfileItems(
  profile: ProfileForItems,
  counts: ProfileCounts,
): PendingProfileItemKey[] {
  const items: PendingProfileItemKey[] = [];
  if (!profile.avatar_url || profile.avatar_url.trim().length === 0) items.push("photo");
  if (
    !(profile.full_name && profile.full_name.trim().length > 0) ||
    !(profile.title && profile.title.trim().length > 0)
  ) items.push("basic_details");
  if (!profile.location || profile.location.trim().length === 0) items.push("location");
  if (!(profile.years_experience && profile.years_experience > 0)) items.push("years_experience");
  if (!Array.isArray(profile.skills) || profile.skills.length === 0) items.push("skills");
  if (!profile.bio || profile.bio.trim().length <= 10) items.push("bio");
  if (!hasCv(profile)) items.push("cv");
  if (!(counts.experiences > 0)) items.push("experience");
  if (!(counts.certifications > 0)) items.push("certifications");
  if (!(counts.documents > 0)) items.push("documents");
  return items;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de resultado
// ─────────────────────────────────────────────────────────────────────────────

export type PendingEmailOutcome =
  | { kind: "sent"; applicationId: string; lang: string; langSource: string; messageId?: string }
  | { kind: "skipped"; applicationId: string; reason: string }
  | { kind: "failed"; applicationId: string; reason: string };

export type ActivationEmailOutcome =
  | { kind: "sent"; activationId: string; lang: string; langSource: string; activatedCount: number; messageId?: string }
  | { kind: "skipped"; activationId: string; reason: string }
  | { kind: "failed"; activationId: string; reason: string };

export interface ActivationDependencies {
  supabase: SupabaseClient;
  emailProvider?: EmailProvider;
  appBaseUrl?: string;
}

function appBaseUrl(d: ActivationDependencies): string {
  return (d.appBaseUrl ?? Deno.env.get("APP_BASE_URL") ?? "https://pipingbox.com").replace(/\/$/, "");
}

function classifyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, 200);
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL 1 — Candidatura recibida, perfil incompleto
// ─────────────────────────────────────────────────────────────────────────────

interface AuthUserLike {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

interface ApplicationRow {
  id: string;
  user_id: string;
  job_title: string | null;
  company_name: string | null;
  status: string;
  created_at: string;
}

interface ProfileRow extends ProfileForItems {
  user_id: string;
  marketplace_ready?: boolean | null;
  preferred_language?: string | null;
}

/**
 * Procesa el EMAIL 1 de una candidatura. Idempotente: el claim
 * (app_14da0f1941_claim_application_profile_pending_email) garantiza que una
 * misma candidatura no genera dos emails aunque la función se reintente
 * (doble submit, webhook, reintentos de plataforma).
 *
 * p_userId debe ser el usuario autenticado QUE LLAMA (validación de
 * propiedad); el estado real se lee de fuentes backend canónicas.
 */
export async function sendApplicationPendingProfileEmail(
  d: ActivationDependencies,
  p: { applicationId: string; userId: string },
): Promise<PendingEmailOutcome> {
  const { supabase } = d;

  if (!p.applicationId) return { kind: "skipped", applicationId: p.applicationId ?? "", reason: "missing_application_id" };

  // 1. Candidatura (fuente canónica) + propiedad.
  const { data: app, error: appErr } = await supabase
    .from(JOB_APPLICATIONS_TABLE)
    .select("id, user_id, job_title, company_name, status, created_at")
    .eq("id", p.applicationId)
    .maybeSingle() as { data: ApplicationRow | null; error: unknown };

  if (appErr || !app) return { kind: "skipped", applicationId: p.applicationId, reason: "application_not_found" };
  if (app.user_id !== p.userId) return { kind: "skipped", applicationId: p.applicationId, reason: "not_owner" };

  // 2. Solo candidaturas pendientes por perfil.
  if (app.status !== "pending_profile_validation") {
    return { kind: "skipped", applicationId: p.applicationId, reason: `not_pending:${app.status}` };
  }

  // 3. Frescura: no enviar confirmaciones de candidaturas antiguas.
  if (Date.now() - Date.parse(app.created_at) > PENDING_EMAIL_FRESHNESS_MS) {
    return { kind: "skipped", applicationId: p.applicationId, reason: "stale_application" };
  }

  // 4. Perfil + idioma + email del destinatario.
  const { data: profile } = await supabase
    .from(PROFILES_TABLE)
    .select(
      "user_id, marketplace_ready, preferred_language, full_name, title, company, location, years_experience, skills, bio, avatar_url, cv_storage_bucket, cv_storage_path, cv_file_url, cv_url",
    )
    .eq("user_id", p.userId)
    .maybeSingle() as { data: ProfileRow | null; error: unknown };

  if (!profile) return { kind: "skipped", applicationId: p.applicationId, reason: "profile_not_found" };
  if (profile.marketplace_ready === true) {
    // El perfil ya está validado (p.ej. transición posterior al apply): la
    // candidatura ya no está pendiente por perfil.
    return { kind: "skipped", applicationId: p.applicationId, reason: "already_marketplace_ready" };
  }

  const { data: authUser, error: authErr } = await supabase.auth.admin.getUserById(p.userId) as
    { data: { user: AuthUserLike | null }; error: unknown };
  const user = authUser?.user;
  if (authErr || !user?.email) return { kind: "skipped", applicationId: p.applicationId, reason: "user_email_unavailable" };

  // 5. Claim atómico (idempotencia anti-reintentos).
  const { data: claim, error: claimErr } = await supabase.rpc(
    "app_14da0f1941_claim_application_profile_pending_email",
    { p_application_id: p.applicationId, p_max_attempts: MAX_ACTIVATION_ATTEMPTS, p_lease_seconds: ACTIVATION_LEASE_SECONDS },
  ) as { data: { claimed: boolean; state: string; attempts: number; reason: string; claim_id: string | null; delivery_phase: string | null } | null; error: unknown };

  if (claimErr || !claim) return { kind: "failed", applicationId: p.applicationId, reason: "claim_error" };
  if (!claim.claimed || !claim.claim_id) {
    return { kind: "skipped", applicationId: p.applicationId, reason: `claim:${claim.reason ?? claim.state}` };
  }
  const claimId = claim.claim_id;

  try {
    // 6. Elementos pendientes (espejo de recalculate-profiles).
    const [{ count: expCount }, { count: certCount }, { count: docCount }] = await Promise.all([
      supabase.from("app_worker_experiences").select("id", { count: "exact", head: true }).eq("user_id", p.userId),
      supabase.from("app_worker_certifications").select("id", { count: "exact", head: true }).eq("user_id", p.userId),
      supabase.from("app_worker_documents").select("id", { count: "exact", head: true }).eq("user_id", p.userId),
    ]);
    const pendingItems = computePendingProfileItems(profile, {
      experiences: expCount ?? 0,
      certifications: certCount ?? 0,
      documents: docCount ?? 0,
    });

    // 7. Idioma en tiempo de envío (resolver canónico I18N).
    const lang: ResolvedLanguage = resolveRecipientLanguage({
      userMetadata: user.user_metadata ?? null,
      profileLanguage: profile.preferred_language ?? null,
    });

    // 8. Render + envío con marca de fase (patrón 030f).
    const rendered = renderApplicationPendingProfileEmail({
      lang: lang.lang,
      actionUrl: `${appBaseUrl(d)}/profile`,
      vars: { jobTitle: app.job_title ?? "", company: app.company_name ?? "" },
      pendingItems,
    });

    const provider = d.emailProvider ?? createEmailProvider();
    await supabase.rpc("app_14da0f1941_marc_application_profile_pending_email_phase", {
      p_application_id: p.applicationId,
      p_claim_id: claimId,
      p_phase: "send_started",
    });

    const result = await provider.send({
      to: user.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      capture: {
        source: "job-application-profile-pending-email",
        template: "application_pending_profile",
        lang: rendered.lang,
        langSource: lang.source,
        meta: { application_id: p.applicationId, pending_items: pendingItems },
      },
    });

    const { data: fin } = await supabase.rpc(
      "app_14da0f1941_finalize_application_profile_pending_email",
      { p_application_id: p.applicationId, p_claim_id: claimId, p_outcome: "sent", p_message_id: result.messageId ?? null },
    ) as { data: { finalized: boolean } | null };

    if (!fin?.finalized) {
      return { kind: "failed", applicationId: p.applicationId, reason: "finalize_rejected" };
    }
    return {
      kind: "sent",
      applicationId: p.applicationId,
      lang: rendered.lang,
      langSource: lang.source,
      messageId: result.messageId,
    };
  } catch (err) {
    const reason = classifyError(err);
    await supabase.rpc("app_14da0f1941_finalize_application_profile_pending_email", {
      p_application_id: p.applicationId,
      p_claim_id: claimId,
      p_outcome: "failed",
      p_last_error: reason,
    }).then(undefined, undefined);
    return { kind: "failed", applicationId: p.applicationId, reason };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL 2 — Marketplace Ready alcanzado (drenaje del outbox)
// ─────────────────────────────────────────────────────────────────────────────

interface ActivationRow {
  id: string;
  user_id: string;
  activated_count: number;
  activated_job_titles: string[] | null;
  state: string;
}

/**
 * Drena el outbox de activaciones Marketplace Ready. Procesa filas
 * 'pending' (y 'failed' con intentos disponibles, para reintentos de ops).
 * Una fila = una transición efectiva false -> true = como máximo UN email.
 *
 * Filas con activated_count = 0 se marcan 'skipped' (transición auditada,
 * sin candidaturas que activar, sin email).
 */
export async function drainMarketplaceReadyActivations(
  d: ActivationDependencies,
  opts: { userId?: string; limit?: number } = {},
): Promise<ActivationEmailOutcome[]> {
  const { supabase } = d;
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);

  let query = supabase
    .from(MARKETPLACE_READY_ACTIVATIONS_TABLE)
    .select("id, user_id, activated_count, activated_job_titles, state")
    .in("state", ["pending", "failed"])
    .order("created_at", { ascending: true })
    .limit(limit);
  if (opts.userId) query = query.eq("user_id", opts.userId);

  const { data: rows, error } = await query as { data: ActivationRow[] | null; error: unknown };
  if (error || !rows) return [];

  const results: ActivationEmailOutcome[] = [];
  for (const row of rows) {
    results.push(await processActivationRow(d, row));
  }
  return results;
}

async function processActivationRow(
  d: ActivationDependencies,
  row: ActivationRow,
): Promise<ActivationEmailOutcome> {
  const { supabase } = d;

  const { data: claim, error: claimErr } = await supabase.rpc(
    "app_14da0f1941_claim_marketplace_ready_activation",
    { p_activation_id: row.id, p_max_attempts: MAX_ACTIVATION_ATTEMPTS, p_lease_seconds: ACTIVATION_LEASE_SECONDS },
  ) as { data: { claimed: boolean; state: string; attempts: number; reason: string; claim_id: string | null; delivery_phase: string | null } | null; error: unknown };

  if (claimErr || !claim) return { kind: "failed", activationId: row.id, reason: "claim_error" };
  if (!claim.claimed || !claim.claim_id) {
    return { kind: "skipped", activationId: row.id, reason: `claim:${claim.reason ?? claim.state}` };
  }
  const claimId = claim.claim_id;

  // Transición sin candidaturas que activar: auditada, sin email.
  if (!(row.activated_count > 0)) {
    await supabase.rpc("app_14da0f1941_finalize_marketplace_ready_activation", {
      p_activation_id: row.id, p_claim_id: claimId, p_outcome: "skipped",
    }).then(undefined, undefined);
    return { kind: "skipped", activationId: row.id, reason: "no_pending_applications" };
  }

  try {
    const { data: authUser } = await supabase.auth.admin.getUserById(row.user_id) as
      { data: { user: AuthUserLike | null }; error: unknown };
    const user = authUser?.user;
    if (!user?.email) throw new Error("user_email_unavailable");

    const { data: profile } = await supabase
      .from(PROFILES_TABLE)
      .select("preferred_language")
      .eq("user_id", row.user_id)
      .maybeSingle() as { data: { preferred_language: string | null } | null; error: unknown };

    // Idioma ACTUAL en el momento del envío (requisito de producto).
    const lang: ResolvedLanguage = resolveRecipientLanguage({
      userMetadata: user.user_metadata ?? null,
      profileLanguage: profile?.preferred_language ?? null,
    });

    const titles = (row.activated_job_titles ?? [])
      .map((t) => (t ?? "").trim())
      .filter((t) => t.length > 0)
      .slice(0, MAX_JOB_TITLES_IN_EMAIL);
    const count = row.activated_count;

    const rendered = renderMarketplaceReadyEmail({
      lang: lang.lang,
      actionUrl: `${appBaseUrl(d)}/applications`,
      vars: { count, jobTitle: titles[0] ?? "" },
      jobTitles: titles,
    });

    const provider = d.emailProvider ?? createEmailProvider();
    await supabase.rpc("app_14da0f1941_marc_marketplace_ready_activation_phase", {
      p_activation_id: row.id,
      p_claim_id: claimId,
      p_phase: "send_started",
    });

    const result = await provider.send({
      to: user.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      capture: {
        source: "marketplace-ready-activation-email",
        template: "marketplace_ready",
        lang: rendered.lang,
        langSource: lang.source,
        meta: { activation_id: row.id, activated_count: count },
      },
    });

    const { data: fin } = await supabase.rpc(
      "app_14da0f1941_finalize_marketplace_ready_activation",
      { p_activation_id: row.id, p_claim_id: claimId, p_outcome: "sent", p_message_id: result.messageId ?? null },
    ) as { data: { finalized: boolean } | null };

    if (!fin?.finalized) {
      return { kind: "failed", activationId: row.id, reason: "finalize_rejected" };
    }
    return {
      kind: "sent",
      activationId: row.id,
      lang: rendered.lang,
      langSource: lang.source,
      activatedCount: count,
      messageId: result.messageId,
    };
  } catch (err) {
    const reason = classifyError(err);
    await supabase.rpc("app_14da0f1941_finalize_marketplace_ready_activation", {
      p_activation_id: row.id, p_claim_id: claimId, p_outcome: "failed", p_last_error: reason,
    }).then(undefined, undefined);
    return { kind: "failed", activationId: row.id, reason };
  }
}

/** Cliente service_role para las Edge Functions de este flujo. */
export function createServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
