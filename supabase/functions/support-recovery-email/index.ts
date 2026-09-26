// Edge Function: support-recovery-email
// PB-PDI-004 / PB-UI-DOM-INSERTBEFORE-001 — correo de recuperación para la
// cuenta afectada por los errores de renderizado del 25/09 (corregidos y
// desplegados en producción: e7141b7).
//
// ARQUITECTURA (decisión del PO, 2026-09-26)
//   - Envío vía proveedor SMTP server-side existente (one.com) reutilizando
//     _shared/email-provider.ts. Las credenciales SMTP viven SOLO como
//     secretos de Supabase (Edge Functions); nunca en GitHub.
//   - Invocación server-to-server con pg_net y la clave de Supabase Vault
//     `support-recovery-invoke-key` (generada DENTRO de la BD, nunca aparece
//     en SQL, código, logs ni respuestas) o Bearer service_role.
//
// SEGURIDAD
//   - verify_jwt = false; la función autentica CADA petición por sí misma:
//     * Authorization: Bearer <SERVICE_ROLE_KEY> — comparación timing-safe
//       (SHA-256 + comparación byte a byte en tiempo constante) contra el
//       secreto inyectado en el entorno de la función.
//     * X-Recovery-Key — validada contra Vault vía RPC SECURITY DEFINER
//       app_verify_recovery_invoke_key (EXECUTE solo para service_role).
//   - 401: sin credenciales, credencial inválida, anon o authenticated.
//   - La petición NO acepta destinatario, asunto, nombre, HTML, texto ni BCC:
//     plantilla, asunto y destinatarios son 100% server-side. Cualquier campo
//     de mensaje presente en el body → 400 (guarda explícita).
//
// COPIA DE AUDITORÍA (decisión del PO, 2026-09-26)
//   - BCC fijo y exacto: info@pipingbox.com, en la MISMA transacción SMTP
//     (envelope). Nodemailer no emite cabecera Bcc en el mensaje visible.
//   - Guardas: BCC exacto; nunca desde el body; sin destinatarios adicionales
//     (sin CC); sin BCC en HTML, texto plano o cabeceras visibles.
//   - Fail-closed: si el proveedor rechaza algún destinatario (To o BCC) o no
//     confirma los dos aceptados, el estado es PARTIAL con
//     audit_copy_sent=false — nunca se afirma una copia de auditoría no
//     confirmada.
//
// MODOS CERRADOS
//   - TEST (default): To support@pipingbox.com, nombre "Edward", asunto con
//     prefijo [TEST]. No usa ni requiere el correo real del usuario.
//   - PRODUCTION: bloqueado. Exige PO_GO=1 y PROD_SHA_VERIFIED=1 (secretos de
//     Edge Function que activa el PO con el segundo GO explícito) y el
//     destinatario resuelto server-side (secreto RECOVERY_RECIPIENT, nunca
//     parámetro libre de la petición).
//
// LOGS (sin PII ni secretos): tipo de plantilla, timestamp, estado del
// proveedor, message ID sanitizado y audit_copy_sent. Sin tokens, correos,
// nombres ni contenido del mensaje.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createEmailProvider } from "../_shared/email-provider.ts";
import {
  RECOVERY_EMAIL_TEMPLATE_ID,
  recoverySubject,
  renderRecoveryEmailHtml,
  renderRecoveryEmailText,
} from "../_shared/recovery-email-template.ts";

// ── Constantes server-side (nunca aceptadas desde la petición) ────────────
const TEST_RECIPIENT = "support@pipingbox.com";
const TEST_RECIPIENT_NAME = "Edward";
const AUDIT_BCC = "info@pipingbox.com"; // copia de auditoría obligatoria (PO)
const FROM_DISPLAY_NAME = "PipingBox";
const REPLY_TO = "support@pipingbox.com";

// Guarda: campos de mensaje que JAMÁS se aceptan desde el body.
const FORBIDDEN_BODY_FIELDS = [
  "to", "cc", "bcc", "from", "reply_to", "replyTo", "subject", "html", "text",
  "name", "recipient", "recipients", "reply_to_address",
];

function json(obj: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Log estructurado sin PII ni secretos. */
function log(fields: Record<string, unknown>): void {
  const allowed = ["template", "provider_status", "message_id", "audit_copy_sent", "status"];
  const safeFields = Object.fromEntries(
    allowed
      .filter((key) => fields[key] !== undefined)
      .map((key) => [key, fields[key]]),
  );
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...safeFields }));
}

/** Compara dos strings en tiempo constante (SHA-256 + XOR byte a byte). */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  const n = Math.max(va.length, vb.length);
  let diff = va.length === vb.length ? 0 : 1;
  for (let i = 0; i < n; i++) {
    diff |= (va[i] ?? 0) ^ (vb[i] ?? 0);
  }
  return diff === 0;
}

/** Message ID sanitizado: solo caracteres seguros, longitud acotada. */
function sanitizeMessageId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  return id.replace(/[^A-Za-z0-9@.\-]/g, "").slice(0, 120) || undefined;
}

/** Error sanitizado: clase/mensaje corto, sin stack ni datos. */
function sanitizeError(e: unknown): string {
  if (e instanceof Error) return e.message.slice(0, 120).replace(/[\r\n]/g, " ");
  return "unknown_error";
}

Deno.serve(async (req: Request) => {
  const correlationId = crypto.randomUUID();

  // ── Autenticación (server-to-server, validada DENTRO de la función) ─────
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  let authPath: "service_role" | "vault_key" | null = null;
  const authHeader = req.headers.get("Authorization") || "";

  if (serviceKey && authHeader.startsWith("Bearer ")) {
    const candidate = authHeader.slice("Bearer ".length);
    // Rechazo explícito de anon (y, por no coincidencia, de cualquier JWT de
    // usuario authenticated): solo el service_role exacto pasa.
    const isAnon = anonKey ? await timingSafeEqual(candidate, anonKey) : false;
    const isServiceRole = await timingSafeEqual(candidate, serviceKey);
    if (!isAnon && isServiceRole) authPath = "service_role";
  }

  if (!authPath) {
    const recoveryKey = req.headers.get("X-Recovery-Key") || "";
    if (recoveryKey && supabaseUrl && serviceKey) {
      try {
        const supabase = createClient(supabaseUrl, serviceKey);
        const { data } = await supabase.rpc("app_verify_recovery_invoke_key", {
          p_candidate: recoveryKey,
        });
        if (data === true) authPath = "vault_key";
      } catch (e) {
        log({ action: "recovery_email", correlation_id: correlationId, event: "vault_key_verify_error", error: sanitizeError(e) });
      }
    }
  }

  if (!authPath) {
    return json({ error: "unauthorized" }, 401);
  }

  // ── Body: solo se admiten flags cerrados; ningún campo de mensaje ───────
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await req.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    // body vacío → modo TEST (default)
  }

  const rejectedFieldCount = FORBIDDEN_BODY_FIELDS.filter((f) => body[f] !== undefined).length;
  if (rejectedFieldCount > 0) {
    // Guarda: destinatario/asunto/HTML/BCC/etc. jamás vienen de la petición.
    return json({ error: "invalid_request", reason: "message_fields_are_server_side", rejected_field_count: rejectedFieldCount }, 400);
  }

  const isPreflight = body.preflight === true;
  const mode = body.mode === "PRODUCTION" ? "PRODUCTION" : "TEST";

  // ── Preflight: presencia de configuración por NOMBRE, sin valores ───────
  if (isPreflight) {
    const has = (n: string) => (Deno.env.get(n) || "").length > 0;
    const config: Record<string, boolean | string> = {
      SUPABASE_URL: !!supabaseUrl,
      SUPABASE_SERVICE_ROLE_KEY: !!serviceKey,
      SMTP_HOST: has("SMTP_HOST"),
      SMTP_USER: has("SMTP_USER"),
      SMTP_PASSWORD: has("SMTP_PASSWORD"),
      SMTP_PORT: has("SMTP_PORT") ? true : "587 (default)",
      SMTP_SECURE: has("SMTP_SECURE") ? true : "true (default)",
      SMTP_FROM: has("SMTP_FROM") ? true : "noreply@pipingbox.com (default)",
      PO_GO: Deno.env.get("PO_GO") === "1",
      PROD_SHA_VERIFIED: Deno.env.get("PROD_SHA_VERIFIED") === "1",
      RECOVERY_RECIPIENT: has("RECOVERY_RECIPIENT"),
    };
    const missing = Object.entries(config).filter(([, v]) => v === false).map(([k]) => k);
    log({ action: "preflight", correlation_id: correlationId, auth_mode: authPath, missing_required_secrets: missing });
    return json({ ok: true, action: "preflight", auth_mode: authPath, missing_required_secrets: missing, config });
  }

  // ── Resolución server-side de destinatario, nombre y asunto ─────────────
  let recipient: string;
  let recipientName: string;
  if (mode === "TEST") {
    recipient = TEST_RECIPIENT;
    recipientName = TEST_RECIPIENT_NAME;
  } else {
    const poGo = Deno.env.get("PO_GO") === "1";
    const prodShaVerified = Deno.env.get("PROD_SHA_VERIFIED") === "1";
    const productionRecipient = Deno.env.get("RECOVERY_RECIPIENT") || "";
    if (!poGo || !prodShaVerified) {
      log({ action: "production_locked", correlation_id: correlationId, reason: "requires_second_go" });
      return json({ error: "production_locked", reason: "requires PO_GO=1 and PROD_SHA_VERIFIED=1 (second explicit GO)" }, 403);
    }
    if (!productionRecipient) {
      log({ action: "production_recipient_not_configured", correlation_id: correlationId });
      return json({ error: "production_recipient_not_configured", reason: "RECOVERY_RECIPIENT secret must be set server-side" }, 501);
    }
    recipient = productionRecipient;
    recipientName = Deno.env.get("RECOVERY_RECIPIENT_NAME") || "";
  }

  const subject = recoverySubject(mode === "TEST");

  // ── Envío: misma transacción SMTP para To y BCC de auditoría ────────────
  const provider = createEmailProvider();
  if (!provider.isConfigured()) {
    log({
      action: "send", correlation_id: correlationId, template: RECOVERY_EMAIL_TEMPLATE_ID, mode,
      status: "FAILED", provider_status: "not_configured", audit_copy_sent: false,
    });
    return json({ ok: false, status: "FAILED", reason: "email_provider_not_configured", mode, correlation_id: correlationId }, 503);
  }

  try {
    const r = await provider.send({
      to: recipient,
      subject,
      html: renderRecoveryEmailHtml(recipientName),
      text: renderRecoveryEmailText(recipientName),
      fromName: FROM_DISPLAY_NAME,
      replyTo: REPLY_TO,
      bcc: AUDIT_BCC, // envelope de la MISMA transacción; sin cabecera Bcc visible
    });

    const rejectedCount = r.rejected ?? 0;
    const acceptedCount = r.accepted ?? 0;
    // Fail-closed: copia de auditoría confirmada solo con 0 rechazos y los
    // dos destinatarios (To + BCC) aceptados por el proveedor.
    const auditCopySent = rejectedCount === 0 && acceptedCount >= 2;
    const status = auditCopySent ? (mode === "TEST" ? "SENT_TEST" : "SENT") : "PARTIAL";

    log({
      action: "send", correlation_id: correlationId, template: RECOVERY_EMAIL_TEMPLATE_ID, mode,
      status, provider: r.provider, provider_status: `accepted=${acceptedCount},rejected=${rejectedCount}`,
      message_id: sanitizeMessageId(r.messageId), audit_copy_sent: auditCopySent,
    });

    return json({
      ok: status !== "PARTIAL",
      status,
      mode,
      template: RECOVERY_EMAIL_TEMPLATE_ID,
      subject_prefix: mode === "TEST" ? "[TEST]" : "",
      message_id: sanitizeMessageId(r.messageId),
      accepted_recipients: acceptedCount,
      rejected_recipients: rejectedCount,
      audit_copy_sent: auditCopySent,
      audit_copy_policy: "bcc_same_smtp_transaction",
      correlation_id: correlationId,
      ...(status === "PARTIAL" ? { reason: "provider_did_not_confirm_all_recipients" } : {}),
    });
  } catch (e) {
    log({
      action: "send_exception", correlation_id: correlationId, template: RECOVERY_EMAIL_TEMPLATE_ID, mode,
      status: "FAILED", provider_status: "error", error: sanitizeError(e), audit_copy_sent: false,
    });
    return json({ ok: false, status: "FAILED", reason: sanitizeError(e), mode, audit_copy_sent: false, correlation_id: correlationId }, 502);
  }
});
