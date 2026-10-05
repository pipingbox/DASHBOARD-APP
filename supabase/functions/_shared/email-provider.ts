// _shared/email-provider.ts
// Adapter para envio de email via SMTP.
// PB-MATCHING-NOTIFICATIONS-001
// PB-EDGE-RESEND-MIGRATION-001 — NOTIFY_SMTP_* (Resend, notify.pipingbox.com)
// tiene prioridad; SMTP_* (one.com) queda intacto como rollback. El corte a
// Resend solo se produce cuando el trio NOTIFY_SMTP_HOST/USER/PASSWORD esta
// completo; una configuracion parcial NUNCA se usa a medias.

import nodemailer from "npm:nodemailer";

export const RESEND_PROVIDER_NAME = "resend_smtp";
export const ONECOM_PROVIDER_NAME = "smtp_onecom";

export const NOTIFY_DEFAULT_FROM = "notifications@notify.pipingbox.com";
const LEGACY_DEFAULT_FROM = "noreply@pipingbox.com";

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

export function createEmailProvider(): EmailProvider {
  const config = resolveSmtpConfig();

  if (!config) {
    return new NoopEmailProvider();
  }

  return new SmtpEmailProvider(config);
}
