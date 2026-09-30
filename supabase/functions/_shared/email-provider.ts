// _shared/email-provider.ts
// Adapter para envio de email via SMTP one.com.
// PB-MATCHING-NOTIFICATIONS-001

import nodemailer from "npm:nodemailer";

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

class SmtpEmailProvider implements EmailProvider {
  private transporter;
  private from: string;
  private providerName = "smtp_onecom";

  constructor(host: string, port: number, secure: boolean, user: string, pass: string, from: string) {
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
    this.from = from;
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
  const host = Deno.env.get("SMTP_HOST");
  const port = parseInt(Deno.env.get("SMTP_PORT") || "587", 10);
  const secure = Deno.env.get("SMTP_SECURE") !== "false";
  const user = Deno.env.get("SMTP_USER");
  const pass = Deno.env.get("SMTP_PASSWORD");
  const from = Deno.env.get("SMTP_FROM") || "noreply@pipingbox.com";

  if (!host || !user || !pass) {
    return new NoopEmailProvider();
  }

  return new SmtpEmailProvider(host, port, secure, user, pass, from);
}
