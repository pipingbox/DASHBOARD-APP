// _shared/email-provider.ts
// Adapter para envio de email via SMTP one.com.
// PB-MATCHING-NOTIFICATIONS-001

import nodemailer from "npm:nodemailer";

export interface EmailMessage {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<{ messageId?: string; provider: string }>;
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

  async send(message: EmailMessage): Promise<{ messageId?: string; provider: string }> {
    const result = await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { messageId: result.messageId, provider: this.providerName };
  }
}

class NoopEmailProvider implements EmailProvider {
  isConfigured(): boolean {
    return false;
  }

  async send(): Promise<{ messageId?: string; provider: string }> {
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
