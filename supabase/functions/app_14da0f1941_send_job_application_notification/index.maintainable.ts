// ═══════════════════════════════════════════════════════════════════════════════
// app_14da0f1941_send_job_application_notification — FUENTE MANTENIBLE
//
// ⚠️  NO DESPLEGADA. Requiere GO del PO y `sql/030` aplicado previamente.
//
// Qué es este archivo
//   La fuente mantenible del emisor administrativo de candidaturas. Sustituye a
//   la reconstrucción anterior, que se hizo sin acceso al código desplegado.
//
//   El fuente realmente desplegado (v13, `ezbr_sha256` a1b49c9c…) está
//   archivado como snapshot de **solo lectura** en PIPINGBOX-BRAIN@4e19d0ed
//   (`growth/PB-I18N-EMAIL-001/audit/…v13.deployed-snapshot.ts`). Ese snapshot
//   es salida transpilada por esbuild, sin tipos, y por decisión del PO no se
//   considera fuente mantenible ni se despliega.
//
//   Contraste completo entre ambos:
//   `brain/growth/PB-I18N-EMAIL-001/EMISOR-JOBS-CONTRASTE-V13.md`.
//
// Por qué el directorio no tiene `index.ts`
//   Deliberado. Sin entrypoint, `supabase functions deploy` no puede desplegar
//   este directorio. Protección estructural, no una advertencia en un
//   comentario. Se renombrará a `index.ts` en el mismo cambio que traiga el GO
//   de despliegue, y nunca antes de aplicar `sql/030`.
//
// Comportamiento idéntico a v13 (verificado línea a línea contra el snapshot)
//   · `Bearer` obligatorio → 401, por encima de `verify_jwt=true`.
//   · `auth.getUser(jwt)` con cliente anon; `service_role` solo después.
//   · Candidatura filtrada por `user_id` del token **y** `job_id`.
//   · Ventana de frescura de 15 min; candidatura obsoleta → 200 con
//     `reason:"stale_application"` (no es un error del cliente).
//   · Prioridad `NOTIFY_SMTP_*` sobre `SMTP_*` solo con el trío
//     HOST/USER/PASSWORD completo; puertos 465/587; `secure` salvo "false".
//   · SMTP sin configurar → 200 con `emailsSent:false`. Nunca bloquea la
//     candidatura: el cliente ya la tiene persistida.
//   · Mismas dos formas de log que v13 (`{requestId,method,url}` y
//     `{action:"application_alert_email",smtpAccepted,messageId,provider}`),
//     para no romper ninguna consulta de observabilidad existente.
//   · Mismo contenido del aviso: oferta, empresa, país, candidato, correo,
//     oficio, experiencia, disponibilidad, VCA, % de perfil, estado y enlace a
//     la ficha (ruta `/candidate/:userId`, restringida a admin /
//     jobs_moderator / company).
//
// Diferencias respecto a v13, todas deliberadas y aprobadas
//   1. ANTI-REPLAY (aprobado para desarrollo y QA). v13 solo comprueba la
//      antigüedad de la candidatura, así que N invocaciones en 15 min producen
//      N correos. Aquí el envío se reclama de forma atómica en
//      `app_14da0f1941_job_application_notifications` (`sql/030`) antes de
//      tocar SMTP. Desde `sql/030c` el reclamo lleva un fencing token
//      (`claim_id`): `finalize` solo cierra el intento vigente, de modo que un
//      proceso lento no puede cerrar un reclamo que otro proceso retomó tras
//      vencer su lease.
//   2. RESULTADO AMBIGUO DEL PROVEEDOR. v13 devuelve 500 si `sendMail` lanza,
//      sin dejar constancia de si el correo salió. Aquí se clasifica el fallo
//      y el estado ambiguo es terminal: no se reintenta nunca en automático.
//   3. DESTINATARIOS. v13 acepta `JOB_ALERT_TO` y `JOB_ALERT_BCC` sin validar,
//      lo que permite redirigir o copiar en oculto datos personales de
//      candidatos cambiando solo configuración. Aquí ambos se validan contra
//      dominios de PIPINGBOX y el uso de un override se registra.
//   4. Escape con guarda de tipo y recorte de longitudes.
//   5. Naranja corporativo `#E8611A` en lugar del ámbar `#f59e0b` de v13.
//
// Internacionalización: EXCEPCIÓN PERMANENTE confirmada por el PO. Este aviso
//   es administrativo e interno (buzón `jobs@pipingbox.com` del equipo de
//   PIPINGBOX), no va a un usuario final. Localizarlo al idioma del candidato
//   sería imponer el idioma del actor al destinatario, justo lo que prohíbe
//   PB-I18N-EMAIL-001. Se mantiene en inglés de forma permanente. Si algún día
//   este emisor envía un acuse al candidato, ese acuse SÍ entra en el alcance y
//   debe usar `_shared/email-i18n` con el idioma del destinatario.
// ═══════════════════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Buzón administrativo canónico. No se cambia sin autorización del PO. */
export const CANONICAL_JOBS_MAILBOX = "jobs@pipingbox.com";

/** Igual que v13: una candidatura más antigua no genera aviso. */
export const REPLAY_WINDOW_MS = 15 * 60 * 1000;

export const APP_BASE_URL = "https://pipingbox.com";

/** Intentos totales por candidatura, incluido el primero. */
export const MAX_NOTIFICATION_ATTEMPTS = 3;

/**
 * Duración del reclamo. Tiene que cubrir con holgura un envío SMTP lento
 * (el observado tardó 2,5 s) sin dejar la candidatura bloqueada mucho tiempo
 * si el proceso muere con el reclamo tomado.
 */
export const CLAIM_LEASE_SECONDS = 120;

/**
 * Dominios a los que se permite dirigir el aviso. v13 aceptaba cualquier
 * dirección en `JOB_ALERT_TO`/`JOB_ALERT_BCC`, de modo que un cambio de
 * configuración —sin desplegar código— podía desviar o copiar en oculto el
 * perfil completo de un candidato (nombre, correo, oficio, experiencia, VCA).
 */
export const ALLOWED_ALERT_DOMAINS = ["pipingbox.com", "notify.pipingbox.com"];

/**
 * Todo valor interpolado procede de datos editables por usuarios (título de la
 * oferta, nombre de empresa, nombre del candidato). Sin escape se podría
 * inyectar marcado y enlaces arbitrarios en un mensaje que sale de un dominio
 * nuestro. A diferencia de v13, tolera valores no-string en lugar de lanzar.
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

/** Evita que un campo desmesurado reviente el tamaño del mensaje. */
export function clamp(value: unknown, max: number): string {
  const s = escapeHtml(value);
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

/** Valida un destinatario override contra la lista de dominios permitidos. */
export function isAllowedAlertRecipient(address: string | undefined | null): boolean {
  if (!address) return false;
  const trimmed = address.trim().toLowerCase();
  // Una sola dirección: nada de listas separadas por comas, que permitirían
  // colar un dominio ajeno detrás de uno permitido.
  if (!/^[^\s,;<>@]+@[^\s,;<>@]+$/.test(trimmed)) return false;
  const domain = trimmed.slice(trimmed.indexOf("@") + 1);
  return ALLOWED_ALERT_DOMAINS.includes(domain);
}

export interface AlertRecipients {
  to: string;
  bcc?: string;
  overrides: string[];
  rejected: string[];
}

/**
 * Resuelve destinatarios aplicando la lista blanca. Un override inválido se
 * descarta y se registra: nunca hace fallar el aviso, pero nunca se usa.
 */
export function resolveAlertRecipients(env: (n: string) => string | undefined): AlertRecipients {
  const overrides: string[] = [];
  const rejected: string[] = [];

  const rawTo = env("JOB_ALERT_TO");
  let to = CANONICAL_JOBS_MAILBOX;
  if (rawTo) {
    if (isAllowedAlertRecipient(rawTo)) {
      to = rawTo.trim();
      overrides.push("JOB_ALERT_TO");
    } else {
      rejected.push("JOB_ALERT_TO");
    }
  }

  const rawBcc = env("JOB_ALERT_BCC");
  let bcc: string | undefined;
  if (rawBcc) {
    if (isAllowedAlertRecipient(rawBcc)) {
      bcc = rawBcc.trim();
      overrides.push("JOB_ALERT_BCC");
    } else {
      rejected.push("JOB_ALERT_BCC");
    }
  }

  return { to, bcc, overrides, rejected };
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

/** Idéntico a v13 (snapshot líneas 77-85), incluida la técnica del prefijo. */
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

// ─────────────────────────────────────────────────────────────────────────────
// Clasificación del resultado del proveedor
// ─────────────────────────────────────────────────────────────────────────────

export type DeliveryOutcome = "sent" | "failed" | "ambiguous";

/**
 * Un fallo de SMTP no dice por sí mismo si el mensaje salió. La diferencia
 * importa: reintentar un envío que sí salió duplica el aviso.
 *
 *   · Fallo **antes** de transmitir el mensaje (DNS, conexión, autenticación,
 *     sobre rechazado) → `failed`. Es seguro reintentar.
 *   · Timeout o socket cortado → `ambiguous`. El servidor pudo haber aceptado
 *     el mensaje antes de perderse la confirmación. No se reintenta.
 *   · Error desconocido → `ambiguous`, por prudencia. Preferimos un aviso
 *     perdido y visible en el registro a un duplicado silencioso.
 */
export function classifySendError(error: unknown): DeliveryOutcome {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string") {
    switch (code) {
      case "EDNS":
      case "ECONNECTION":
      case "EAUTH":
      case "EENVELOPE":
      case "EMESSAGE":
        return "failed";
      case "ETIMEDOUT":
      case "ESOCKET":
      case "ESTREAM":
        return "ambiguous";
    }
  }
  return "ambiguous";
}

/** `info.rejected` no vacío = el proveedor rechazó destinatarios. */
export function classifySendInfo(info: { rejected?: unknown } | null | undefined): DeliveryOutcome {
  const rejected = info?.rejected;
  if (Array.isArray(rejected) && rejected.length > 0) return "failed";
  return "sent";
}

// ─────────────────────────────────────────────────────────────────────────────
// Reclamo atómico (sql/030)
// ─────────────────────────────────────────────────────────────────────────────

export interface ClaimResult {
  claimed: boolean;
  state: string | null;
  attempts: number;
  reason: string;
  /**
   * Fencing token del intento (030c). Solo lo recibe quien gana el reclamo;
   * sin él, `finalize` no puede cerrar el reclamo. Un finalize con un token
   * caducado (lease vencido y retomado por otro proceso) devuelve
   * `fenced_out` sin tocar la fila.
   */
  claimId: string | null;
  /**
   * Fase de entrega (030d): 'pre_send' (SMTP aún no contactado) o
   * 'send_started' (SMTP posiblemente contactado). Si el lease vence en
   * 'send_started', el reclamo NO se retoma: pasa a 'ambiguous' terminal.
   */
  deliveryPhase: string | null;
}

/**
 * Reclama el derecho exclusivo a enviar el aviso de esta candidatura.
 *
 * La atomicidad y la protección frente a concurrencia viven en SQL: una sola
 * sentencia `INSERT … ON CONFLICT DO UPDATE … WHERE` serializada por la clave
 * primaria. Aquí solo se interpreta el resultado.
 *
 * Si la RPC no existe (migración no aplicada) **se deniega el envío**: antes un
 * aviso no enviado que volver al comportamiento duplicable de v13.
 */
export async function claimNotification(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<ClaimResult> {
  const { data, error } = await supabase.rpc(
    "app_14da0f1941_claim_job_application_notification",
    {
      p_application_id: applicationId,
      p_max_attempts: MAX_NOTIFICATION_ATTEMPTS,
      p_lease_seconds: CLAIM_LEASE_SECONDS,
    },
  );
  if (error) {
    return {
      claimed: false,
      state: null,
      attempts: 0,
      reason: `claim_unavailable:${error.code ?? "unknown"}`,
      claimId: null,
      deliveryPhase: null,
    };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { claimed: false, state: null, attempts: 0, reason: "claim_empty_response", claimId: null, deliveryPhase: null };
  return {
    claimed: row.claimed === true,
    state: row.state ?? null,
    attempts: typeof row.attempts === "number" ? row.attempts : 0,
    reason: row.reason ?? "unknown",
    claimId: typeof row.claim_id === "string" ? row.claim_id : null,
    deliveryPhase: typeof row.delivery_phase === "string" ? row.delivery_phase : null,
  };
}

export interface MarkPhaseResult {
  marked: boolean;
  deliveryPhase: string | null;
  reason: string;
}

/**
 * Punto de no retorno (030d): persiste la fase 'send_started' JUSTO ANTES de
 * contactar con SMTP. A partir de aquí, si este proceso muere con el lease
 * tomado, el reclamo NO se retoma (pasa a 'ambiguous'): la transmisión es
 * posible pero no demostrada, y no se envía un duplicado. La fase es monótona
 * y solo avanza si este proceso posee el intento vigente (fencing).
 *
 * Si la marca falla o es rechazada, el proceso NO debe contactar SMTP: sin la
 * marca persistida, el vencimiento del lease permitiría retomar el reclamo y
 * enviar un duplicado.
 */
export async function markSendStarted(
  supabase: SupabaseClient,
  applicationId: string,
  claimId: string | null,
): Promise<MarkPhaseResult> {
  const { data, error } = await supabase.rpc(
    "app_14da0f1941_marc_job_application_notification_phase",
    {
      p_application_id: applicationId,
      p_claim_id: claimId,
      p_phase: "send_started",
    },
  );
  if (error) {
    return { marked: false, deliveryPhase: null, reason: `mark_unavailable:${error.code ?? "unknown"}` };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { marked: false, deliveryPhase: null, reason: "mark_empty_response" };
  return {
    marked: row.marked === true,
    deliveryPhase: typeof row.delivery_phase === "string" ? row.delivery_phase : null,
    reason: row.reason ?? "unknown",
  };
}

/**
 * Cierra el reclamo con el fencing token correspondiente. Sin el token del
 * intento vigente la RPC rechaza el cierre (`fenced_out`): un proceso lento no
 * puede cerrar un reclamo que otro proceso retomó tras vencer su lease.
 */
export async function finalizeNotification(
  supabase: SupabaseClient,
  applicationId: string,
  claimId: string | null,
  state: DeliveryOutcome,
  messageId: string | null,
  lastError: string | null,
): Promise<void> {
  const { data, error } = await supabase.rpc(
    "app_14da0f1941_finalize_job_application_notification",
    {
      p_application_id: applicationId,
      p_claim_id: claimId,
      p_state: state,
      p_message_id: messageId,
      p_last_error: lastError,
    },
  );
  if (error) {
    // El correo ya salió (o no): no se puede deshacer. Se registra para que el
    // reclamo huérfano sea visible; el lease vencerá y quedará trazado.
    console.error(JSON.stringify({ error: "finalize_failed", code: error.code ?? null }));
    return;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (row && row.finalized === false) {
    // Cierre rechazado: lo más probable es que nuestro lease venciera y otro
    // proceso retomara el envío. Queda trazado; nada más que hacer aquí (el
    // estado lo posee el reclamo vigente, no este proceso).
    console.log(JSON.stringify({ action: "finalize_rejected", reason: row.reason ?? "unknown" }));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Contenido del aviso (inglés: excepción permanente)
// ─────────────────────────────────────────────────────────────────────────────

export interface JobRow {
  id: string;
  title: string;
  company: string;
  country: string | null;
  location: string | null;
}

export interface ProfileRow {
  full_name: string | null;
  title: string | null;
  years_experience: number | null;
  availability_status: string | null;
  profile_completion: number | null;
}

export function buildSubject(job: Pick<JobRow, "title">, candidateName: string | null): string {
  return candidateName
    ? `New application \u2014 ${candidateName} \u2014 ${job.title}`
    : `New application \u2014 ${job.title}`;
}

/** Igual que v13: "Valid until …" / "Expired …" / "On record (no expiry date)". */
export function describeVcaStatus(
  cert: { expiry_date: string | null } | null | undefined,
  nowMs: number,
): string | null {
  if (!cert) return null;
  if (!cert.expiry_date) return "On record (no expiry date)";
  const expiry = new Date(cert.expiry_date).getTime();
  const day = new Date(cert.expiry_date).toISOString().split("T")[0];
  return expiry >= nowMs ? `Valid until ${day}` : `Expired ${day}`;
}

export function buildAdminHtml(params: {
  job: JobRow;
  profile: ProfileRow | null;
  candidateEmail: string;
  userId: string;
  vcaStatus: string | null;
  applicationStatus: string | null;
}): string {
  const { job, profile, candidateEmail, userId, vcaStatus, applicationStatus } = params;
  const candidateName = profile?.full_name?.trim() || null;
  const rows: Array<[string, string]> = [
    ["Job", clamp(job.title, 200)],
    ["Company / Project", clamp(job.company, 200)],
    ["Country", clamp(job.country ?? job.location ?? "\u2014", 120)],
    ["Candidate", clamp(candidateName ?? "(profile incomplete)", 200)],
    ["Candidate email", clamp(candidateEmail, 200)],
  ];
  if (profile?.title) rows.push(["Profession / Trade", clamp(profile.title, 160)]);
  if (profile?.years_experience != null) {
    rows.push(["Experience", `${clamp(profile.years_experience, 10)} years`]);
  }
  if (profile?.availability_status) {
    rows.push(["Availability", clamp(profile.availability_status, 80)]);
  }
  rows.push(["VCA", vcaStatus ? clamp(vcaStatus, 80) : "Not on record"]);
  rows.push(["Profile completion", `${clamp(profile?.profile_completion ?? 0, 10)}%`]);
  rows.push(["Application status", clamp(applicationStatus ?? "applied", 40)]);

  const tableRows = rows
    .map(([label, value], i) =>
      `<tr><td style="padding: 8px 0; color: #71717a; width: 170px; vertical-align: top;">${label}</td><td style="padding: 8px 0; color: #fafafa;${i === 3 ? " font-weight: 600;" : ""}">${value}</td></tr>`
    )
    .join("");

  const candidateUrl = `${APP_BASE_URL}/candidate/${encodeURIComponent(userId)}`;

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0a0a0a; color: #e4e4e7; border: 1px solid #27272a;">
      <div style="border-bottom: 1px solid #27272a; padding-bottom: 16px; margin-bottom: 24px;">
        <h1 style="margin: 0; font-size: 20px; color: #E8611A;">New Job Application</h1>
        <p style="margin: 4px 0 0; font-size: 12px; color: #71717a; text-transform: uppercase; letter-spacing: 0.1em;">PIPINGBOX Jobs Pipeline</p>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        ${tableRows}
      </table>
      <div style="margin-top: 28px; text-align: center;">
        <a href="${escapeHtml(candidateUrl)}" style="display: inline-block; background: #E8611A; color: #18181B; font-size: 14px; font-weight: 700; text-decoration: none; padding: 12px 32px; border-radius: 4px;">View candidate</a>
      </div>
      <p style="margin-top: 20px; font-size: 12px; color: #52525b; text-align: center;">
        Requires a PIPINGBOX admin/recruitment sign-in. Candidate id <code style="color:#71717a;">${escapeHtml(userId)}</code>
      </p>
      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #27272a; font-size: 11px; color: #52525b;">
        PIPINGBOX Jobs Pipeline \u00B7 ${new Date().toISOString().split("T")[0]}
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────

export const handler = async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();
  // Misma forma de log que v13 (snapshot línea 18).
  console.log(JSON.stringify({ requestId, method: req.method, url: req.url }));

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const json = (status: number, payload: Record<string, unknown>) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json(401, { error: "Missing authorization" });
    }
    const jwt = authHeader.slice("Bearer ".length);

    let body: { job_id?: string };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid request body" });
    }
    if (!body.job_id) {
      return json(400, { error: "Missing job_id" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // El JWT se verifica contra GoTrue con el cliente anon; `service_role` solo
    // se usa después, para lecturas ya acotadas a este usuario.
    const authClient = createClient(supabaseUrl, anonKey);
    const { data: userData, error: userError } = await authClient.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return json(401, { error: "Invalid authorization" });
    }
    const userId = userData.user.id;
    const supabase = createClient(supabaseUrl, serviceKey);

    // La fila de candidatura del propio usuario es la fuente de verdad.
    const { data: applications } = await supabase
      .from("app_14da0f1941_job_applications")
      .select("id, created_at, status")
      .eq("user_id", userId)
      .eq("job_id", body.job_id)
      .order("created_at", { ascending: false })
      .limit(1);

    const application = applications?.[0];
    if (!application) {
      return json(404, { error: "no_matching_application" });
    }

    if (Date.now() - new Date(application.created_at).getTime() > REPLAY_WINDOW_MS) {
      console.log(JSON.stringify({ requestId, action: "stale_application_not_notified" }));
      return json(200, { success: true, emailsSent: false, reason: "stale_application" });
    }

    // Reclamo atómico ANTES de tocar SMTP: es lo que impide que varias
    // invocaciones de la misma candidatura envíen varios correos.
    const claim = await claimNotification(supabase, application.id);
    if (!claim.claimed) {
      console.log(JSON.stringify({
        requestId,
        action: "notification_not_claimed",
        reason: claim.reason,
        state: claim.state,
        attempts: claim.attempts,
      }));
      return json(200, { success: true, emailsSent: false, reason: claim.reason });
    }

    let outcome: DeliveryOutcome = "failed";
    let messageId: string | null = null;
    let lastError: string | null = null;

    try {
      const { data: job } = await supabase
        .from("app_14da0f1941_jobs")
        .select("id, title, company, country, location")
        .eq("id", body.job_id)
        .maybeSingle();
      if (!job) {
        await finalizeNotification(supabase, application.id, claim.claimId, "failed", null, "no_matching_job");
        return json(404, { error: "no_matching_job" });
      }

      const { data: profile, error: profileError } = await supabase
        .from("app_14da0f1941_profiles")
        .select("full_name, title, years_experience, availability_status, profile_completion")
        .eq("user_id", userId)
        .maybeSingle();
      if (profileError) {
        console.log(JSON.stringify({ requestId, warning: "profile_query_failed", code: profileError.code }));
      }

      const { data: vcaCerts } = await supabase
        .from("app_worker_certifications")
        .select("certification_name, expiry_date")
        .eq("user_id", userId)
        .ilike("certification_name", "%vca%")
        .order("expiry_date", { ascending: false, nullsFirst: false })
        .limit(1);

      const smtp = resolveSmtp((n) => Deno.env.get(n));
      if (!smtp.configured) {
        console.log(JSON.stringify({ requestId, warning: "SMTP not configured, skipping email" }));
        // Fallo limpio: el mensaje no salió, así que es reintentable.
        await finalizeNotification(supabase, application.id, claim.claimId, "failed", null, "smtp_not_configured");
        return json(200, { success: true, emailsSent: false, reason: "SMTP not configured" });
      }

      const recipients = resolveAlertRecipients((n) => Deno.env.get(n));
      if (recipients.overrides.length > 0 || recipients.rejected.length > 0) {
        // Un override de destinatario desvía datos personales de candidatos:
        // nunca debe pasar en silencio.
        console.log(JSON.stringify({
          requestId,
          action: "alert_recipients_overridden",
          applied: recipients.overrides,
          rejected: recipients.rejected,
        }));
      }

      const html = buildAdminHtml({
        job: job as JobRow,
        profile: (profile as ProfileRow | null) ?? null,
        candidateEmail: userData.user.email ?? "(no email on record)",
        userId,
        vcaStatus: describeVcaStatus(vcaCerts?.[0], Date.now()),
        applicationStatus: application.status ?? null,
      });

      const transporter = nodemailer.createTransport({
        host: smtp.host!,
        port: smtp.port,
        secure: smtp.secure,
        auth: { user: smtp.user!, pass: smtp.password! },
      });

      // ── Punto de no retorno (030d) ─────────────────────────────────────────
      // Persistimos 'send_started' ANTES de la primera llamada a SMTP. Si esta
      // marca falla o es rechazada, NO contactamos SMTP: sin ella, el
      // vencimiento del lease permitiría retomar el reclamo y enviar un
      // duplicado. Una vez marcada, si este proceso muere con el correo
      // posiblemente transmitido, el reclamo pasa a 'ambiguous' y jamás se
      // reintenta automáticamente.
      const phase = await markSendStarted(supabase, application.id, claim.claimId);
      if (!phase.marked) {
        console.error(JSON.stringify({
          requestId,
          action: "send_start_mark_failed",
          reason: phase.reason,
        }));
        // No cerramos el reclamo ni tocamos SMTP. El lease vencerá; como la
        // fase quedó en 'pre_send', el reclamo podrá retomarse con seguridad.
        return json(200, { success: true, emailsSent: false, reason: `send_start_mark_failed:${phase.reason}` });
      }

      const info = await transporter.sendMail({
        from: smtp.provider === "resend_smtp"
          ? { name: "PipingBox Notifications", address: smtp.from }
          : smtp.from,
        to: recipients.to,
        ...(recipients.bcc ? { bcc: recipients.bcc } : {}),
        replyTo: CANONICAL_JOBS_MAILBOX,
        subject: buildSubject(job as JobRow, (profile as ProfileRow | null)?.full_name?.trim() || null),
        html,
      });

      outcome = classifySendInfo(info);
      messageId = info?.messageId ?? null;
      if (outcome !== "sent") lastError = "smtp_rejected";

      // Misma forma de log que v13 (snapshot líneas 154-162).
      console.log(JSON.stringify({
        requestId,
        action: "application_alert_email",
        smtpAccepted: outcome === "sent",
        messageId,
        provider: smtp.provider,
      }));
    } catch (sendError: unknown) {
      outcome = classifySendError(sendError);
      lastError = sendError instanceof Error ? sendError.message : String(sendError);
      console.error(JSON.stringify({
        requestId,
        action: "application_alert_email_failed",
        outcome,
        code: (sendError as { code?: unknown } | null)?.code ?? null,
      }));
    }

    await finalizeNotification(supabase, application.id, claim.claimId, outcome, messageId, lastError);

    if (outcome === "sent") {
      return json(200, { success: true, emailsSent: true });
    }
    // El cliente nunca debe ver un error por esto: la candidatura está guardada.
    return json(200, { success: true, emailsSent: false, reason: outcome });
  } catch (error: unknown) {
    console.error(JSON.stringify({
      requestId,
      error: error instanceof Error ? error.message : String(error),
    }));
    return json(500, { error: "Internal server error" });
  }
};

// El servidor solo arranca cuando el módulo es el entrypoint real, para que las
// pruebas puedan importar los helpers sin abrir un puerto.
if (import.meta.main) {
  serve(handler);
}
