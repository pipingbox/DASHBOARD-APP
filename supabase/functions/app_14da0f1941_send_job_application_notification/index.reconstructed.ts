// ═══════════════════════════════════════════════════════════════════════════════
// app_14da0f1941_send_job_application_notification — RECONSTRUCCIÓN
//
// ⚠️  ESTE ARCHIVO NO ES EL BUNDLE DESPLEGADO. NO DESPLEGAR SIN GO EXPRESO.
//
// Contexto (PB-I18N-EMAIL-001 — desbloqueo del emisor Jobs):
//   En producción (`mwdauubztjxkbrefirbg`) existe la Edge Function
//   `app_14da0f1941_send_job_application_notification` v13 ACTIVE,
//   `verify_jwt=true`, `ezbr_sha256`
//   a1b49c9cdb35a46488dbd3235accf7f20936301a3dffc5ee10ba7a3590f14a94,
//   entrypoint de un ÚNICO archivo y SIN import map. Su código nunca estuvo en
//   este repositorio.
//
//   Este archivo es una **reconstrucción mantenible** basada en evidencia
//   verificable (metadatos de despliegue, logs de ejecución reales, los dos
//   puntos de llamada del frontend y el esquema de la tabla), NO una copia
//   byte-a-byte del bundle. El contraste byte-a-byte sigue PENDIENTE: la vía de
//   lectura del cuerpo de la función falla en esta integración.
//   Ver `brain/growth/PB-I18N-EMAIL-001/EMISOR-JOBS-AUDITORIA.md`.
//
//   Mientras ese contraste no se complete, desplegar este archivo sobrescribiría
//   v13 con código no verificado. El despliegue requiere GO explícito del PO.
//
// Evidencia que sustenta cada decisión (no inferencias libres):
//   · Log de entrada real: {"requestId","method","url"} — misma forma que
//     `app_14da0f1941_send_lead_notification` (plantilla endurecida común).
//   · Log de salida real: {"requestId","action":"application_alert_email",
//     "smtpAccepted":true,"messageId":"<…@notify.pipingbox.com>",
//     "provider":"resend_smtp"} → NOTIFY_SMTP_* (Resend) con fallback SMTP_*,
//     y UN solo correo administrativo por invocación.
//   · Llamadas del frontend (`Jobs.tsx`, `JobDetail.tsx`): POST con
//     `{ job_id }`, tras insertar la candidatura; el contrato de respuesta que
//     consume el cliente es `{ emailsSent: boolean, reason?: string }` y el
//     fallo NUNCA bloquea la candidatura.
//   · Correlación temporal verificada: candidatura insertada 2026-10-10
//     12:29:54.139Z → invocación 12:29:56.389Z → SMTP aceptado 12:29:58.917Z.
//   · `app_14da0f1941_job_applications` NO tiene columna `notified_at`, así que
//     el patrón de "claim" del emisor de leads NO puede existir aquí: la única
//     defensa contra repetición es la ventana de frescura. Riesgo documentado.
//
// Internacionalización (excepción aprobada a evaluar): este aviso es
//   **administrativo e interno**, dirigido al buzón jobs@pipingbox.com del
//   equipo de PIPINGBOX, no a un usuario final. Se mantiene en inglés y queda
//   FUERA del alcance de PB-I18N-EMAIL-001, que localiza los correos dirigidos
//   a usuarios. Por eso este archivo no importa `_shared/email-i18n`, lo que
//   además preserva el carácter autocontenido del bundle desplegado.
// ═══════════════════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Buzón administrativo interno. No se cambia sin autorización del PO. */
export const ADMIN_RECIPIENT = "jobs@pipingbox.com";

/**
 * Ventana en la que una candidatura recién insertada puede aún notificarse.
 * El frontend inserta la fila y llama inmediatamente después, así que unos
 * minutos sobran. Cualquier cosa más antigua es un intento de repetición.
 * Mismo criterio que el emisor de leads (15 min).
 */
export const APPLICATION_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * Todo lo que llega aquí es controlado por el usuario: el título del puesto y
 * el nombre de la empresa se copian en la fila de candidatura desde datos de
 * la oferta, y el nombre del candidato viene de su perfil. Interpolar
 * cualquiera de esos valores en crudo dentro de un HTML enviado desde
 * notifications@notify.pipingbox.com permitiría inyectar marcado y enlaces
 * arbitrarios en un mensaje que parece nuestro.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Campos largos reventarían el límite de tamaño SMTP y romperían el envío. */
export function clamp(value: unknown, max: number): string {
  const s = escapeHtml(value);
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

export interface SmtpResolution {
  host: string | null;
  port: number;
  secure: boolean;
  user: string | null;
  password: string | null;
  from: string;
  provider: "resend_smtp" | "smtp_onecom";
  configured: boolean;
}

/**
 * NOTIFY_SMTP_* (Resend, notify.pipingbox.com) tiene prioridad; SMTP_*
 * (one.com) queda como rollback. El corte solo se produce con el trío
 * HOST/USER/PASSWORD completo: una configuración parcial nunca se usa a
 * medias. Idéntico al emisor de leads, y coherente con el log real
 * `provider":"resend_smtp"`.
 */
export function resolveSmtp(env: (name: string) => string | undefined): SmtpResolution {
  const notifyConfigured = !!(
    env("NOTIFY_SMTP_HOST") && env("NOTIFY_SMTP_USER") && env("NOTIFY_SMTP_PASSWORD")
  );
  const pick = (name: string) => env(`${notifyConfigured ? "NOTIFY_" : ""}${name}`);
  const host = pick("SMTP_HOST") || null;
  const user = pick("SMTP_USER") || null;
  const password = pick("SMTP_PASSWORD") || null;
  return {
    host,
    port: parseInt(pick("SMTP_PORT") || (notifyConfigured ? "465" : "587"), 10),
    secure: pick("SMTP_SECURE") !== "false",
    user,
    password,
    from:
      pick("SMTP_FROM") ||
      (notifyConfigured ? "notifications@notify.pipingbox.com" : "noreply@pipingbox.com"),
    provider: notifyConfigured ? "resend_smtp" : "smtp_onecom",
    configured: !!(host && user && password),
  };
}

export interface ApplicationRow {
  id: string;
  created_at: string;
  user_id: string;
  job_title: string;
  company_name: string;
  location: string | null;
  contract_type: string | null;
  status: string | null;
  job_id: string | null;
}

/** Asunto del aviso administrativo (inglés: excepción documentada). */
export function buildSubject(row: Pick<ApplicationRow, "job_title" | "company_name">): string {
  return `New Job Application - ${row.job_title} @ ${row.company_name}`;
}

/**
 * Cuerpo del aviso administrativo. Solo datos operativos mínimos necesarios
 * para gestionar la candidatura; nada de tokens, enlaces de autenticación ni
 * datos personales más allá del nombre declarado y el identificador interno.
 */
export function buildAdminHtml(row: ApplicationRow, candidateName: string | null): string {
  const safe = {
    job_title: clamp(row.job_title, 200),
    company_name: clamp(row.company_name, 200),
    location: clamp(row.location, 200),
    contract_type: clamp(row.contract_type, 100),
    candidate: clamp(candidateName, 200),
    status: clamp(row.status, 40),
  };
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0a0a0a; color: #e4e4e7; border: 1px solid #27272a;">
      <div style="border-bottom: 1px solid #27272a; padding-bottom: 16px; margin-bottom: 24px;">
        <h1 style="margin: 0; font-size: 20px; color: #E8611A;">New Job Application</h1>
        <p style="margin: 4px 0 0; font-size: 12px; color: #71717a; text-transform: uppercase; letter-spacing: 0.1em;">PIPINGBOX Recruitment Pipeline</p>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 8px 0; color: #71717a; width: 140px;">Position</td><td style="padding: 8px 0; color: #fafafa; font-weight: 600;">${safe.job_title}</td></tr>
        <tr><td style="padding: 8px 0; color: #71717a;">Company</td><td style="padding: 8px 0; color: #fafafa;">${safe.company_name}</td></tr>
        ${safe.candidate ? `<tr><td style="padding: 8px 0; color: #71717a;">Candidate</td><td style="padding: 8px 0; color: #fafafa;">${safe.candidate}</td></tr>` : ""}
        ${safe.location ? `<tr><td style="padding: 8px 0; color: #71717a;">Location</td><td style="padding: 8px 0; color: #fafafa;">${safe.location}</td></tr>` : ""}
        ${safe.contract_type ? `<tr><td style="padding: 8px 0; color: #71717a;">Contract</td><td style="padding: 8px 0; color: #fafafa;">${safe.contract_type}</td></tr>` : ""}
        ${safe.status ? `<tr><td style="padding: 8px 0; color: #71717a;">Status</td><td style="padding: 8px 0; color: #fafafa;">${safe.status}</td></tr>` : ""}
      </table>
      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #27272a; font-size: 11px; color: #52525b;">
        PIPINGBOX Recruitment Pipeline · ${new Date().toISOString().split("T")[0]} · application ${escapeHtml(row.id)}
      </div>
    </div>
  `;
}

export type GateResult =
  | { ok: true }
  | { ok: false; status: number; body: Record<string, unknown>; logged: string };

/**
 * Comprobaciones previas al envío, aisladas para poder probarlas.
 *
 * `callerUserId` procede del JWT verificado por la plataforma
 * (`verify_jwt=true`). Exigir que la candidatura pertenezca al llamante evita
 * que un usuario autenticado dispare avisos sobre candidaturas de terceros.
 */
export function evaluateGates(
  row: ApplicationRow | null,
  callerUserId: string | null,
  nowMs: number,
): GateResult {
  if (!row) {
    return {
      ok: false,
      status: 404,
      body: { error: "No matching application", emailsSent: false, reason: "No matching application" },
      logged: "no_matching_application",
    };
  }
  if (callerUserId && row.user_id !== callerUserId) {
    return {
      ok: false,
      status: 403,
      body: { error: "Forbidden", emailsSent: false, reason: "Application does not belong to caller" },
      logged: "application_owner_mismatch",
    };
  }
  const ageMs = nowMs - new Date(row.created_at).getTime();
  if (ageMs > APPLICATION_MAX_AGE_MS) {
    return {
      ok: false,
      status: 409,
      body: { error: "Application too old to notify", emailsSent: false, reason: "Application too old" },
      logged: "application_too_old",
    };
  }
  return { ok: true };
}

/** Extrae el `sub` del JWT ya verificado por la plataforma. Nunca lo registra. */
export function callerFromAuthHeader(header: string | null): string | null {
  if (!header) return null;
  const token = header.replace(/^Bearer\s+/i, "").trim();
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const pad = parts[1].length % 4 === 0 ? "" : "=".repeat(4 - (parts[1].length % 4));
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/") + pad);
    const sub = JSON.parse(json)?.sub;
    return typeof sub === "string" && sub.length > 0 ? sub : null;
  } catch {
    return null;
  }
}

export const handler = async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();
  // Misma forma de log que el bundle desplegado (verificada en logs reales).
  console.log(JSON.stringify({ requestId, method: req.method, url: req.url }));

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    let body: { job_id?: string };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid request body" });
    }

    const jobId = typeof body.job_id === "string" ? body.job_id : "";
    if (!jobId) {
      return json(400, { error: "Missing required fields" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const callerUserId = callerFromAuthHeader(req.headers.get("Authorization"));

    // La fila de candidatura — no el cuerpo de la petición — es la fuente de
    // verdad de todo lo que llega al correo.
    const { data: rows, error: lookupError } = await supabase
      .from("app_14da0f1941_job_applications")
      .select("id, created_at, user_id, job_title, company_name, location, contract_type, status, job_id")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (lookupError) {
      console.error(JSON.stringify({ requestId, error: "application_lookup_failed", details: lookupError.message }));
      return json(500, { error: "Internal server error" });
    }

    const row = (rows?.[0] as ApplicationRow | undefined) ?? null;
    const gate = evaluateGates(row, callerUserId, Date.now());
    if (!gate.ok) {
      console.log(JSON.stringify({ requestId, rejected: gate.logged }));
      return json(gate.status, gate.body);
    }
    const application = row as ApplicationRow;

    const smtp = resolveSmtp((n) => Deno.env.get(n));
    if (!smtp.configured) {
      const missing = [
        !smtp.host && "SMTP_HOST",
        !smtp.user && "SMTP_USER",
        !smtp.password && "SMTP_PASSWORD",
      ].filter(Boolean);
      console.error(JSON.stringify({ requestId, error: "smtp_not_configured", missing }));
      // Nunca bloquea la candidatura: el cliente ya la tiene persistida.
      return json(200, { success: true, emailsSent: false, reason: "SMTP not configured" });
    }

    // Nombre declarado del candidato, solo para que el equipo pueda gestionar
    // la candidatura. Si no hay perfil, el aviso sale igual sin ese dato.
    let candidateName: string | null = null;
    const { data: profile } = await supabase
      .from("app_14da0f1941_profiles")
      .select("full_name")
      .eq("user_id", application.user_id)
      .maybeSingle();
    if (profile && typeof profile.full_name === "string") candidateName = profile.full_name;

    const transporter = nodemailer.createTransport({
      host: smtp.host!,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user!, pass: smtp.password! },
    });

    const info = await transporter.sendMail({
      from: smtp.provider === "resend_smtp"
        ? { name: "PipingBox Notifications", address: smtp.from }
        : smtp.from,
      to: ADMIN_RECIPIENT,
      replyTo: ADMIN_RECIPIENT,
      subject: buildSubject(application),
      html: buildAdminHtml(application, candidateName),
    });

    // Misma forma de log que el bundle desplegado (verificada en logs reales).
    console.log(JSON.stringify({
      requestId,
      action: "application_alert_email",
      smtpAccepted: true,
      messageId: info?.messageId ?? null,
      provider: smtp.provider,
    }));

    return json(200, { success: true, emailsSent: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ requestId, error: message }));
    return json(500, { error: "Internal server error" });
  }
};

// El servidor solo arranca cuando el módulo es el entrypoint real, para que las
// pruebas puedan importar los helpers sin abrir un puerto.
if (import.meta.main) {
  serve(handler);
}

