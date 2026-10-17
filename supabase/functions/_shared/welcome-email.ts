// _shared/welcome-email.ts
// PB-WELCOME-EMAIL-001 — Drenador del correo de bienvenida.
//
// Envía UN único correo de bienvenida por usuario tras la confirmación REAL de
// su dirección de email. El outbox y el claim los crea sql/046; este módulo
// sólo drena: reclama -> resuelve -> renderiza -> envía -> finaliza.
//
// AISLAMIENTO: no lee ni escribe nada de Marketplace Ready (EMAIL 1 / EMAIL 2)
// ni de las colas de recovery. Tabla, estados y RPCs son exclusivos de este
// flujo, por lo que un incidente aquí no puede contaminar las candidaturas.
//
// PROVEEDOR: reutiliza createEmailProvider() (notify.pipingbox.com), el mismo
// que el resto de correos de producto. No se añade ningún proveedor nuevo ni
// un segundo outbox. Reply-To se fija a support@pipingbox.com porque este
// correo invita explícitamente a responder con errores y sugerencias.
//
// IDIOMA y TIPO DE CUENTA se resuelven EN TIEMPO DE ENVÍO:
//   - idioma: resolver canónico de PB-I18N-EMAIL-001
//             (user_metadata.lang -> profiles.preferred_language -> 'en').
//   - tipo de cuenta: perfil canónico -> user_metadata -> 'worker'.
// Así, si el usuario corrigió su tipo de cuenta o su idioma entre la
// confirmación y el envío, recibe la variante correcta.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createEmailProvider, type EmailProvider } from "./email-provider.ts";
import { resolveRecipientLanguage } from "./email-i18n/languages.ts";
import { BRAND, renderWelcomeEmail, type WelcomeVariant } from "./email-i18n/render.ts";

export const WELCOME_EMAILS_TABLE = "app_14da0f1941_welcome_emails";
export const PROFILES_TABLE = "app_14da0f1941_profiles";

export const WELCOME_MAX_ATTEMPTS = 3;
export const WELCOME_LEASE_SECONDS = 120;
export const WELCOME_DEFAULT_DRAIN_LIMIT = 20;

/** Remitente y Reply-To corporativos. */
export const WELCOME_FROM_NAME = "PIPINGBOX";
export const WELCOME_REPLY_TO = BRAND.support;

export interface WelcomeDependencies {
  supabase: SupabaseClient;
  emailProvider?: EmailProvider;
  appBaseUrl?: string;
}

export interface WelcomeDrainOutcome {
  userId: string;
  /** sent | already_sent | skipped | failed | ambiguous | not_claimable | not_enqueued */
  outcome: string;
  reason?: string;
  variant?: WelcomeVariant;
  lang?: string;
  langSource?: string;
  attempts?: number;
  messageId?: string;
  provider?: string;
}

export function createServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function appBase(d: WelcomeDependencies): string {
  return (d.appBaseUrl ?? Deno.env.get("APP_BASE_URL") ?? "https://pipingbox.com")
    .replace(/\/$/, "");
}

/** Normaliza el tipo de cuenta: cualquier valor distinto de 'company' es 'worker'. */
function normalizeVariant(value: unknown): WelcomeVariant {
  return String(value ?? "").trim().toLowerCase() === "company" ? "company" : "worker";
}

/** Códigos de error normalizados: nunca se persiste el texto crudo del
 *  proveedor, que puede contener la dirección del destinatario. */
function normalizeSendError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "unknown");
  const lower = raw.toLowerCase();
  if (lower.includes("timeout") || lower.includes("etimedout")) return "smtp_timeout";
  if (lower.includes("econnrefused") || lower.includes("econnreset")) return "smtp_connection_refused";
  if (lower.includes("enotfound") || lower.includes("dns")) return "smtp_host_unresolved";
  if (lower.includes("auth") || lower.includes("535") || lower.includes("534")) return "smtp_auth_failed";
  if (lower.includes("rate") || lower.includes("429")) return "provider_rate_limited";
  if (lower.includes("invalid") && lower.includes("recipient")) return "invalid_recipient";
  if (lower.includes("not configured") || lower.includes("noop")) return "provider_not_configured";
  return `send_error_${lower.replace(/[^a-z0-9]+/g, "_").slice(0, 40)}`;
}

interface ClaimResult {
  claimed: boolean;
  state: string | null;
  attempts: number;
  reason: string;
  claim_id: string | null;
  delivery_phase: string | null;
  account_type: string | null;
  lang: string | null;
}

/**
 * Drena UNA fila del outbox de bienvenida.
 *
 * Secuencia a prueba de duplicados (patrón sql/030e/030f/034):
 *   1. claim atómico  -> si no se concede, no se envía nada.
 *   2. fase pre_send  -> un lease caducado aquí es recuperable.
 *   3. fase send_started ANTES de tocar el proveedor.
 *   4. envío.
 *   5. finalize sent/failed con el claim_id.
 * Si el proceso muere entre 3 y 5, la fila queda en 'claimed'/'send_started' y
 * el siguiente claim la marca 'ambiguous': se revisa a mano y NO se reenvía.
 */
export async function drainWelcomeEmail(
  d: WelcomeDependencies,
  userId: string,
): Promise<WelcomeDrainOutcome> {
  const { supabase } = d;

  const { data: claimData, error: claimError } = await supabase.rpc(
    "app_14da0f1941_claim_welcome_email",
    {
      p_user_id: userId,
      p_max_attempts: WELCOME_MAX_ATTEMPTS,
      p_lease_seconds: WELCOME_LEASE_SECONDS,
    },
  );
  if (claimError) {
    return { userId, outcome: "failed", reason: `claim_rpc_error:${claimError.code ?? "unknown"}` };
  }

  const claim = (Array.isArray(claimData) ? claimData[0] : claimData) as ClaimResult | undefined;
  if (!claim?.claimed || !claim.claim_id) {
    return {
      userId,
      outcome: claim?.reason === "already_sent" ? "already_sent" : "not_claimable",
      reason: claim?.reason ?? "claim_unavailable",
      attempts: claim?.attempts,
    };
  }
  const claimId = claim.claim_id;

  const finalize = async (
    outcome: "sent" | "failed" | "ambiguous" | "skipped",
    extra: { messageId?: string; error?: string; variant?: WelcomeVariant; lang?: string },
  ) => {
    const { error } = await supabase.rpc("app_14da0f1941_finalize_welcome_email", {
      p_user_id: userId,
      p_claim_id: claimId,
      p_outcome: outcome,
      p_message_id: extra.messageId ?? null,
      p_last_error: extra.error ?? null,
      p_account_type: extra.variant ?? null,
      p_lang: extra.lang ?? null,
    });
    if (error) console.error("[welcome-email] finalize failed", { outcome, code: error.code });
  };

  try {
    // ── Resolución del destinatario (Admin API: nunca datos del cliente) ────
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);
    const user = authUser?.user;
    if (authError || !user) {
      await finalize("failed", { error: "auth_user_not_found" });
      return { userId, outcome: "failed", reason: "auth_user_not_found", attempts: claim.attempts };
    }

    // Defensa en profundidad: la RPC ya exige confirmación real, pero se
    // vuelve a comprobar aquí para no enviar nunca a un email sin confirmar.
    if (!user.email_confirmed_at) {
      await finalize("skipped", { error: "email_not_confirmed" });
      return { userId, outcome: "skipped", reason: "email_not_confirmed" };
    }
    if (!user.email) {
      await finalize("skipped", { error: "missing_recipient_email" });
      return { userId, outcome: "skipped", reason: "missing_recipient_email" };
    }

    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;

    const { data: profile } = await supabase
      .from(PROFILES_TABLE)
      .select("account_type, preferred_language")
      .eq("user_id", userId)
      .maybeSingle();

    // Tipo de cuenta: el perfil canónico manda sobre el metadato de alta.
    const variant = normalizeVariant(
      profile?.account_type ?? metadata.account_type ?? claim.account_type,
    );

    const resolved = resolveRecipientLanguage({
      userMetadata: metadata,
      profileLanguage: profile?.preferred_language ?? claim.lang ?? null,
    });

    const rendered = renderWelcomeEmail({
      variant,
      lang: resolved.lang,
      appBaseUrl: appBase(d),
    });
    if (rendered.missing.length > 0) {
      console.warn("[welcome-email] placeholders sin resolver", {
        template: rendered.template,
        missing: rendered.missing,
      });
    }

    // ── Punto de no retorno: se marca send_started ANTES de enviar ──────────
    const { error: phaseError } = await supabase.rpc("app_14da0f1941_mark_welcome_email_phase", {
      p_user_id: userId,
      p_claim_id: claimId,
      p_phase: "send_started",
    });
    if (phaseError) {
      await finalize("failed", { error: "phase_rpc_error", variant, lang: resolved.lang });
      return { userId, outcome: "failed", reason: "phase_rpc_error", variant, lang: resolved.lang };
    }

    const provider = d.emailProvider ?? createEmailProvider();
    try {
      const result = await provider.send({
        to: user.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        fromName: WELCOME_FROM_NAME,
        replyTo: WELCOME_REPLY_TO,
        capture: {
          source: "welcome-email",
          template: rendered.template,
          lang: rendered.lang,
          langSource: resolved.source,
          meta: { variant, attempts: claim.attempts },
        },
      });

      await finalize("sent", { messageId: result.messageId, variant, lang: resolved.lang });
      return {
        userId,
        outcome: "sent",
        variant,
        lang: rendered.lang,
        langSource: resolved.source,
        attempts: claim.attempts,
        messageId: result.messageId,
        provider: result.provider,
      };
    } catch (sendErr) {
      const code = normalizeSendError(sendErr);
      await finalize("failed", { error: code, variant, lang: resolved.lang });
      return {
        userId,
        outcome: "failed",
        reason: code,
        variant,
        lang: rendered.lang,
        attempts: claim.attempts,
      };
    }
  } catch (err) {
    const code = normalizeSendError(err);
    await finalize("failed", { error: code });
    return { userId, outcome: "failed", reason: code, attempts: claim.attempts };
  }
}

/**
 * Drena un lote del outbox. Secuencial a propósito: el volumen esperado es muy
 * bajo (altas confirmadas) y así no se presiona al proveedor SMTP.
 */
export async function drainWelcomeEmails(
  d: WelcomeDependencies,
  opts: { userId?: string; limit?: number } = {},
): Promise<{ processed: number; sent: number; results: WelcomeDrainOutcome[] }> {
  const results: WelcomeDrainOutcome[] = [];

  if (opts.userId) {
    results.push(await drainWelcomeEmail(d, opts.userId));
  } else {
    const limit = Math.min(Math.max(opts.limit ?? WELCOME_DEFAULT_DRAIN_LIMIT, 1), 200);
    const { data, error } = await d.supabase.rpc("app_14da0f1941_list_pending_welcome_emails", {
      p_limit: limit,
      p_max_attempts: WELCOME_MAX_ATTEMPTS,
    });
    if (error) {
      console.error("[welcome-email] list_pending failed", { code: error.code });
      return { processed: 0, sent: 0, results };
    }
    for (const row of (data ?? []) as Array<{ user_id: string }>) {
      results.push(await drainWelcomeEmail(d, row.user_id));
    }
  }

  return {
    processed: results.length,
    sent: results.filter((r) => r.outcome === "sent").length,
    results,
  };
}
