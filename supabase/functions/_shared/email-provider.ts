// _shared/email-provider.ts
// Adapter para envio de email via SMTP.
// PB-MATCHING-NOTIFICATIONS-001
// PB-EDGE-RESEND-MIGRATION-001 — NOTIFY_SMTP_* (Resend, notify.pipingbox.com)
// tiene prioridad; SMTP_* (one.com) queda intacto como rollback. El corte a
// Resend solo se produce cuando el trio NOTIFY_SMTP_HOST/USER/PASSWORD esta
// completo; una configuracion parcial NUNCA se usa a medias.
//
// PB-I18N-EMAIL-001 — Modos de entrega (EMAIL_DELIVERY_MODE):
//   smtp       (por defecto; comportamiento idéntico al anterior)
//   capture    QA/CLI local: NO envía; inserta el correo renderizado en
//              public.app_14da0f1941_email_capture (service role) con el
//              destinatario hasheado y tokens/enlaces redactados.
//   resend_api Envío HTTP directo a Resend. Lo usa el Send Email Auth Hook
//              (remitente no-reply@auth.pipingbox.com, secreto RESEND_AUTH_API_KEY).
// Un modo desconocido se trata como `smtp` para no romper funciones existentes.

import nodemailer from "npm:nodemailer";

export const RESEND_PROVIDER_NAME = "resend_smtp";
export const ONECOM_PROVIDER_NAME = "smtp_onecom";
export const RESEND_API_PROVIDER_NAME = "resend_api";
export const CAPTURE_PROVIDER_NAME = "capture";

export const NOTIFY_DEFAULT_FROM = "notifications@notify.pipingbox.com";
export const AUTH_DEFAULT_FROM = "no-reply@auth.pipingbox.com";
const LEGACY_DEFAULT_FROM = "noreply@pipingbox.com";

export type EmailDeliveryMode = "smtp" | "capture" | "resend_api";

export interface EmailMessage {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  /** Display name del From (la dirección sigue siendo SMTP_FROM). */
  fromName?: string;
  /** Cabecera Reply-To. */
  replyTo?: string;
  /**
   * Copia oculta (auditoría). Nodemailer la incluye en el ENVELOPE SMTP de la
   * MISMA transacción y NO emite cabecera Bcc en el mensaje visible.
   */
  bcc?: string;
  /**
   * PB-I18N-EMAIL-001: metadatos para el modo `capture` (no se envían).
   */
  capture?: {
    source: string;
    template: string;
    lang: string;
    langSource: string;
    meta?: Record<string, unknown>;
  };
}

export interface EmailSendResult {
  messageId?: string;
  provider: string;
  /** Nº de destinatarios aceptados por el proveedor (To + BCC). Sin direcciones. */
  accepted?: number;
  /** Nº de destinatarios rechazados por el proveedor. Sin direcciones. */
  rejected?: number;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<EmailSendResult>;
  isConfigured(): boolean;
}

interface ResolvedSmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  providerName: string;
}

export function resolveDeliveryMode(): EmailDeliveryMode {
  const raw = (Deno.env.get("EMAIL_DELIVERY_MODE") || "").trim().toLowerCase();
  // Sin configurar: comportamiento histórico, sin cambios (modo smtp por defecto).
  if (raw === "") return "smtp";
  if (raw === "smtp" || raw === "capture" || raw === "resend_api") return raw;
  // PB-I18N-EMAIL-001 (revisión del PO, 2026-10-11): un valor presente pero
  // mal escrito ("captrue", "Capture ", …) NUNCA debe caer en silencio al modo
  // `smtp` real. Se lanza un error explícito para que el despliegue/la
  // invocación fallen de forma visible en vez de arriesgar un envío SMTP real
  // durante pruebas de QA.
  throw new Error(`email_delivery_mode_invalid: "${raw}"`);
}

/**
 * Resuelve el transporte SMTP efectivo.
 * Prioridad: NOTIFY_SMTP_* (Resend) > SMTP_* (one.com, rollback).
 * NOTIFY_SMTP_* solo se considera con el trio HOST/USER/PASSWORD completo.
 */
export function resolveSmtpConfig(): ResolvedSmtpConfig | null {
  const notifyHost = Deno.env.get("NOTIFY_SMTP_HOST");
  const notifyUser = Deno.env.get("NOTIFY_SMTP_USER");
  const notifyPass = Deno.env.get("NOTIFY_SMTP_PASSWORD");
  if (notifyHost && notifyUser && notifyPass) {
    return {
      host: notifyHost,
      port: parseInt(Deno.env.get("NOTIFY_SMTP_PORT") || "465", 10),
      secure: Deno.env.get("NOTIFY_SMTP_SECURE") !== "false",
      user: notifyUser,
      pass: notifyPass,
      from: Deno.env.get("NOTIFY_SMTP_FROM") || NOTIFY_DEFAULT_FROM,
      providerName: RESEND_PROVIDER_NAME,
    };
  }

  const host = Deno.env.get("SMTP_HOST");
  const user = Deno.env.get("SMTP_USER");
  const pass = Deno.env.get("SMTP_PASSWORD");
  if (!host || !user || !pass) {
    return null;
  }
  return {
    host,
    port: parseInt(Deno.env.get("SMTP_PORT") || "587", 10),
    secure: Deno.env.get("SMTP_SECURE") !== "false",
    user,
    pass,
    from: Deno.env.get("SMTP_FROM") || LEGACY_DEFAULT_FROM,
    providerName: ONECOM_PROVIDER_NAME,
  };
}

class SmtpEmailProvider implements EmailProvider {
  private transporter;
  private from: string;
  private providerName: string;

  constructor(config: ResolvedSmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
    });
    this.from = config.from;
    this.providerName = config.providerName;
  }

  isConfigured(): boolean {
    return true;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const result = await this.transporter.sendMail({
      from: message.fromName ? { name: message.fromName, address: this.from } : this.from,
      to: message.to,
      bcc: message.bcc,
      replyTo: message.replyTo,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return {
      messageId: result.messageId,
      provider: this.providerName,
      accepted: Array.isArray(result.accepted) ? result.accepted.length : undefined,
      rejected: Array.isArray(result.rejected) ? result.rejected.length : undefined,
    };
  }
}

class NoopEmailProvider implements EmailProvider {
  isConfigured(): boolean {
    return false;
  }

  async send(): Promise<EmailSendResult> {
    throw new Error("email_provider_not_configured");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PB-I18N-EMAIL-001 — Resend HTTP API (Auth hook)
// ─────────────────────────────────────────────────────────────────────────────

interface ResendApiConfig {
  apiKey: string;
  from: string;
}

export function resolveResendApiConfig(kind: "auth" | "notify"): ResendApiConfig | null {
  if (kind === "auth") {
    const apiKey = Deno.env.get("RESEND_AUTH_API_KEY");
    if (!apiKey) return null;
    return { apiKey, from: Deno.env.get("RESEND_AUTH_FROM") || AUTH_DEFAULT_FROM };
  }
  const apiKey = Deno.env.get("RESEND_NOTIFY_API_KEY");
  if (!apiKey) return null;
  return { apiKey, from: Deno.env.get("NOTIFY_SMTP_FROM") || NOTIFY_DEFAULT_FROM };
}

class ResendApiEmailProvider implements EmailProvider {
  constructor(private config: ResendApiConfig) {}

  isConfigured(): boolean {
    return true;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const from = message.fromName
      ? `${message.fromName.replace(/["<>]/g, "")} <${this.config.from}>`
      : this.config.from;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        bcc: message.bcc ? [message.bcc] : undefined,
        reply_to: message.replyTo,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });
    if (!res.ok) {
      // Nunca registrar cuerpo con direcciones; solo estado.
      throw new Error(`resend_api_error_${res.status}`);
    }
    const data = (await res.json()) as { id?: string };
    return { messageId: data.id, provider: RESEND_API_PROVIDER_NAME, accepted: 1, rejected: 0 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PB-I18N-EMAIL-001 — Captura QA (sin envío)
// ─────────────────────────────────────────────────────────────────────────────

export const CAPTURE_TABLE = "app_14da0f1941_email_capture";

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Redacta, antes de persistir en la tabla de captura QA, todo lo que no debe
 * quedar almacenado: tokens de verificación, códigos OTP (la longitud real la
 * fija `mailer_otp_length`, 8 en PIPINGBOX) y direcciones de correo reales.
 * Lo que se conserva (idioma, asunto, estructura, textos traducidos) es lo
 * único necesario para validar la localización.
 */
export function redactSensitive(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/([?&](?:token|token_hash|code|access_token|refresh_token)=)[^&\s"'<]+/gi, "$1[REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]")
    .replace(/\b\d{6,8}\b/g, "[OTP]");
}

class CaptureEmailProvider implements EmailProvider {
  private url: string;
  private key: string;

  constructor() {
    this.url = Deno.env.get("SUPABASE_URL") || "";
    this.key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  }

  isConfigured(): boolean {
    return Boolean(this.url && this.key);
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (!this.isConfigured()) throw new Error("email_capture_not_configured");
    const email = message.to.trim().toLowerCase();
    const at = email.lastIndexOf("@");
    const row = {
      source: message.capture?.source ?? "unknown",
      template: message.capture?.template ?? "unknown",
      lang: message.capture?.lang ?? "en",
      lang_source: message.capture?.langSource ?? "fallback",
      recipient_hash: await sha256Hex(email),
      recipient_domain: at > 0 ? email.slice(at + 1) : null,
      subject: redactSensitive(message.subject),
      html: redactSensitive(message.html),
      text_body: redactSensitive(message.text),
      meta: message.capture?.meta ?? {},
    };
    const res = await fetch(`${this.url}/rest/v1/${CAPTURE_TABLE}`, {
      method: "POST",
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(row),
    });
    if (!res.ok) throw new Error(`email_capture_insert_failed_${res.status}`);
    const data = (await res.json()) as Array<{ id: string }>;
    return { messageId: `capture:${data[0]?.id ?? "unknown"}`, provider: CAPTURE_PROVIDER_NAME, accepted: 1, rejected: 0 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fábricas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Proveedor para notificaciones (notify.pipingbox.com). Comportamiento
 * inalterado en modo `smtp` (por defecto).
 */
export function createEmailProvider(): EmailProvider {
  const mode = resolveDeliveryMode();
  if (mode === "capture") return new CaptureEmailProvider();
  if (mode === "resend_api") {
    const cfg = resolveResendApiConfig("notify");
    return cfg ? new ResendApiEmailProvider(cfg) : new NoopEmailProvider();
  }
  const config = resolveSmtpConfig();
  if (!config) {
    return new NoopEmailProvider();
  }
  return new SmtpEmailProvider(config);
}

/**
 * Proveedor para correos de autenticación (auth.pipingbox.com), usado por el
 * Send Email Auth Hook. Nunca reutiliza las credenciales de Notify.
 *   capture    → tabla de captura (QA / CLI local)
 *   resend_api → RESEND_AUTH_API_KEY (secreto que crea y configura el PO)
 *   smtp       → AUTH_SMTP_* si existen (opción documentada, no por defecto)
 */
export function createAuthEmailProvider(): EmailProvider {
  const mode = resolveDeliveryMode();
  if (mode === "capture") return new CaptureEmailProvider();
  if (mode === "resend_api") {
    const cfg = resolveResendApiConfig("auth");
    return cfg ? new ResendApiEmailProvider(cfg) : new NoopEmailProvider();
  }
  const host = Deno.env.get("AUTH_SMTP_HOST");
  const user = Deno.env.get("AUTH_SMTP_USER");
  const pass = Deno.env.get("AUTH_SMTP_PASSWORD");
  if (!host || !user || !pass) return new NoopEmailProvider();
  return new SmtpEmailProvider({
    host,
    port: parseInt(Deno.env.get("AUTH_SMTP_PORT") || "465", 10),
    secure: Deno.env.get("AUTH_SMTP_SECURE") !== "false",
    user,
    pass,
    from: Deno.env.get("AUTH_SMTP_FROM") || AUTH_DEFAULT_FROM,
    providerName: "resend_smtp_auth",
  });
}
