// supabase/functions/support-recovery-email/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// supabase/functions/_shared/email-provider.ts
import nodemailer from "npm:nodemailer";
var RESEND_PROVIDER_NAME = "resend_smtp";
var ONECOM_PROVIDER_NAME = "smtp_onecom";
var NOTIFY_DEFAULT_FROM = "notifications@notify.pipingbox.com";
var LEGACY_DEFAULT_FROM = "noreply@pipingbox.com";
function resolveSmtpConfig() {
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
      providerName: RESEND_PROVIDER_NAME
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
    providerName: ONECOM_PROVIDER_NAME
  };
}
var SmtpEmailProvider = class {
  transporter;
  from;
  providerName;
  constructor(config) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass }
    });
    this.from = config.from;
    this.providerName = config.providerName;
  }
  isConfigured() {
    return true;
  }
  async send(message) {
    const result = await this.transporter.sendMail({
      from: message.fromName ? { name: message.fromName, address: this.from } : this.from,
      to: message.to,
      bcc: message.bcc,
      replyTo: message.replyTo,
      subject: message.subject,
      text: message.text,
      html: message.html
    });
    return {
      messageId: result.messageId,
      provider: this.providerName,
      accepted: Array.isArray(result.accepted) ? result.accepted.length : void 0,
      rejected: Array.isArray(result.rejected) ? result.rejected.length : void 0
    };
  }
};
var NoopEmailProvider = class {
  isConfigured() {
    return false;
  }
  async send() {
    throw new Error("email_provider_not_configured");
  }
};
function createEmailProvider() {
  const config = resolveSmtpConfig();
  if (!config) {
    return new NoopEmailProvider();
  }
  return new SmtpEmailProvider(config);
}

// supabase/functions/_shared/recovery-email-template.ts
var RECOVERY_EMAIL_SUBJECT = "Hemos corregido un problema en tu cuenta de PipingBox";
var RECOVERY_EMAIL_TEST_SUBJECT_PREFIX = "[TEST] ";
var RECOVERY_EMAIL_TEMPLATE_ID = "recovery_v1";
function recoverySubject(isTest) {
  return isTest ? RECOVERY_EMAIL_TEST_SUBJECT_PREFIX + RECOVERY_EMAIL_SUBJECT : RECOVERY_EMAIL_SUBJECT;
}
function esc(s) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function renderRecoveryEmailHtml(name) {
  const n = esc(name);
  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>PipingBox</title>
</head>
<body style="margin:0; padding:0; background-color:#09090b; -webkit-text-size-adjust:100%;">
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">
    Tu cuenta y tu informaci\xF3n guardada siguen disponibles.
  </div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#09090b;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px; max-width:100%;">

          <!-- Header: logo sobre negro -->
          <tr>
            <td align="center" style="padding:24px 24px 20px 24px; background-color:#000000; border-bottom:2px solid #f59e0b;">
              <img src="https://pipingbox.com/assets/logos/logo-horizontal.png"
                   alt="PipingBox" width="180"
                   style="display:block; width:180px; max-width:60%; height:auto; border:0;" />
            </td>
          </tr>

          <!-- Cuerpo -->
          <tr>
            <td style="background-color:#ffffff; padding:32px 28px 8px 28px;">
              <h1 style="margin:0 0 16px 0; font-family:Arial,Helvetica,sans-serif; font-size:22px; line-height:28px; color:#09090b; font-weight:bold;">
                Hola ${n}:
              </h1>
              <p style="margin:0 0 16px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">
                Hemos detectado que el 25 de septiembre se produjeron varios errores t&eacute;cnicos cuando intentaste acceder a tu panel de PipingBox.
              </p>
              <p style="margin:0 0 16px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">
                Lamentamos las molestias. Tu cuenta se cre&oacute; correctamente y la informaci&oacute;n que ya hab&iacute;as introducido contin&uacute;a guardada.
              </p>
              <p style="margin:0 0 24px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">
                Hemos corregido el problema detectado. Cuando puedas, vuelve a iniciar sesi&oacute;n y revisa tu perfil para completar los datos que falten, especialmente tu experiencia laboral, cualificaciones, certificados y disponibilidad. Esta informaci&oacute;n nos permitir&aacute; identificar mejor las oportunidades profesionales que encajen contigo.
              </p>
            </td>
          </tr>

          <!-- Bot\xF3n principal -->
          <tr>
            <td align="center" style="background-color:#ffffff; padding:0 28px 32px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="#f59e0b" style="border-radius:6px;">
                    <a href="https://pipingbox.com/profile"
                       style="display:inline-block; padding:14px 32px; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:20px; font-weight:bold; letter-spacing:0.5px; color:#000000; text-decoration:none; border-radius:6px;">
                      VOLVER A MI PERFIL
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:20px 0 0 0; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; color:#71717a;">
                Si el bot&oacute;n no funciona, copia este enlace en tu navegador:<br />
                <a href="https://pipingbox.com/profile" style="color:#b45309; text-decoration:underline; word-break:break-all;">https://pipingbox.com/profile</a>
              </p>
            </td>
          </tr>

          <!-- Cierre -->
          <tr>
            <td style="background-color:#ffffff; padding:0 28px 32px 28px;">
              <p style="margin:0 0 16px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">
                Si vuelve a aparecer alg&uacute;n error, responde directamente a este correo envi&aacute;ndonos una captura de pantalla o el c&oacute;digo de incidencia que aparezca. Lo revisaremos personalmente.
              </p>
              <p style="margin:0 0 16px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">
                Gracias por ayudarnos a mejorar PipingBox.
              </p>
              <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">
                Un saludo,
              </p>
            </td>
          </tr>

          <!-- Pie -->
          <tr>
            <td style="background-color:#000000; padding:24px 28px;">
              <p style="margin:0 0 8px 0; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:20px; color:#ffffff; font-weight:bold;">
                Equipo PipingBox
              </p>
              <p style="margin:0 0 8px 0; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; color:#a1a1aa;">
                <a href="mailto:support@pipingbox.com" style="color:#f59e0b; text-decoration:none;">support@pipingbox.com</a><br />
                <a href="https://pipingbox.com" style="color:#f59e0b; text-decoration:none;">https://pipingbox.com</a>
              </p>
              <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; color:#52525b;">
                Has recibido este correo porque tienes una cuenta en PipingBox.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
function renderRecoveryEmailText(name) {
  return `Hola ${name}:

Hemos detectado que el 25 de septiembre se produjeron varios errores t\xE9cnicos cuando intentaste acceder a tu panel de PipingBox.

Lamentamos las molestias. Tu cuenta se cre\xF3 correctamente y la informaci\xF3n que ya hab\xEDas introducido contin\xFAa guardada.

Hemos corregido el problema detectado. Cuando puedas, vuelve a iniciar sesi\xF3n y revisa tu perfil para completar los datos que falten, especialmente tu experiencia laboral, cualificaciones, certificados y disponibilidad. Esta informaci\xF3n nos permitir\xE1 identificar mejor las oportunidades profesionales que encajen contigo.

VOLVER A MI PERFIL:
https://pipingbox.com/profile

Si vuelve a aparecer alg\xFAn error, responde directamente a este correo envi\xE1ndonos una captura de pantalla o el c\xF3digo de incidencia que aparezca. Lo revisaremos personalmente.

Gracias por ayudarnos a mejorar PipingBox.

Un saludo,

Equipo PipingBox
support@pipingbox.com
https://pipingbox.com
`;
}

// supabase/functions/_shared/confirmation-email-template.ts
var CONFIRMATION_RO_TEMPLATE_ID = "confirmation_ro_v1";
var CONFIRMATION_RO_SUBJECT = "Ac\u021Biune necesar\u0103: confirm\u0103 adresa de e-mail pentru contul PipingBox";
function confirmationRoSubject() {
  return CONFIRMATION_RO_SUBJECT;
}
function esc2(s) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function renderConfirmationRoHtml(name) {
  const n = esc2(name);
  return `<!DOCTYPE html>
<html lang="ro" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>PipingBox</title>
</head>
<body style="margin:0; padding:0; background-color:#09090b; -webkit-text-size-adjust:100%;">
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">
    Contul a fost creat corect, \xEEns\u0103 adresa de e-mail nu a fost \xEEnc\u0103 confirmat\u0103.
  </div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#09090b;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px; max-width:100%;">

          <!-- Header: logo sobre negro -->
          <tr>
            <td align="center" style="padding:24px 24px 20px 24px; background-color:#000000; border-bottom:2px solid #f59e0b;">
              <img src="https://pipingbox.com/assets/logos/logo-horizontal.png"
                   alt="PipingBox" width="180"
                   style="display:block; width:180px; max-width:60%; height:auto; border:0;" />
            </td>
          </tr>

          <!-- Saludo + diagn\xF3stico -->
          <tr>
            <td style="background-color:#ffffff; padding:32px 28px 16px 28px;">
              <h1 style="margin:0 0 16px 0; font-family:Arial,Helvetica,sans-serif; font-size:22px; line-height:28px; color:#09090b; font-weight:bold;">
                Bun\u0103, ${n},
              </h1>
              <p style="margin:0 0 16px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">
                Am verificat contul t\u0103u PipingBox. Contul a fost creat corect, \xEEns\u0103 adresa de e-mail nu a fost \xEEnc\u0103 confirmat\u0103. Din acest motiv, atunci c\xE2nd \xEEncerci s\u0103 te autentifici, aplica\u021Bia te redirec\u021Bioneaz\u0103 \xEEnapoi la pagina de conectare.
              </p>
              <p style="margin:0 0 24px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">
                Pentru a finaliza \xEEnregistrarea, te rug\u0103m s\u0103 urmezi ace\u0219ti pa\u0219i:
              </p>
            </td>
          </tr>

          <!-- Pasos numerados -->
          <tr>
            <td style="background-color:#ffffff; padding:0 28px 8px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td width="36" valign="top" style="padding:0 8px 12px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#b45309; font-weight:bold;">1.</td>
                  <td valign="top" style="padding:0 0 12px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">Acceseaz\u0103 <a href="https://pipingbox.com/login" style="color:#b45309; text-decoration:underline;">https://pipingbox.com/login</a></td>
                </tr>
                <tr>
                  <td width="36" valign="top" style="padding:0 8px 12px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#b45309; font-weight:bold;">2.</td>
                  <td valign="top" style="padding:0 0 12px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">Selecteaz\u0103 op\u021Biunea \u201ERetrimite e-mailul de confirmare\u201D.</td>
                </tr>
                <tr>
                  <td width="36" valign="top" style="padding:0 8px 12px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#b45309; font-weight:bold;">3.</td>
                  <td valign="top" style="padding:0 0 12px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">Verific\u0103 mesajele primite la aceast\u0103 adres\u0103 de e-mail.</td>
                </tr>
                <tr>
                  <td width="36" valign="top" style="padding:0 8px 12px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#b45309; font-weight:bold;">4.</td>
                  <td valign="top" style="padding:0 0 12px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">Dac\u0103 nu g\u0103se\u0219ti mesajul, verific\u0103 \u0219i folderul Spam sau Mesaje nedorite.</td>
                </tr>
                <tr>
                  <td width="36" valign="top" style="padding:0 8px 12px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#b45309; font-weight:bold;">5.</td>
                  <td valign="top" style="padding:0 0 12px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">Deschide numai cel mai recent e-mail trimis de PipingBox.</td>
                </tr>
                <tr>
                  <td width="36" valign="top" style="padding:0 8px 12px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#b45309; font-weight:bold;">6.</td>
                  <td valign="top" style="padding:0 0 12px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">Apas\u0103 pe butonul sau linkul de confirmare.</td>
                </tr>
                <tr>
                  <td width="36" valign="top" style="padding:0 8px 12px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#b45309; font-weight:bold;">7.</td>
                  <td valign="top" style="padding:0 0 12px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">Revino la PipingBox \u0219i autentific\u0103-te din nou.</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Nota enlaces caducados -->
          <tr>
            <td style="background-color:#ffffff; padding:8px 28px 8px 28px;">
              <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">
                Linkurile de confirmare mai vechi pot fi expirate, de aceea este important s\u0103 folose\u0219ti ultimul mesaj primit.
              </p>
            </td>
          </tr>

          <!-- Bot\xF3n principal -->
          <tr>
            <td align="center" style="background-color:#ffffff; padding:24px 28px 32px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="#f59e0b" style="border-radius:6px;">
                    <a href="https://pipingbox.com/login"
                       style="display:inline-block; padding:14px 32px; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:20px; font-weight:bold; letter-spacing:0.5px; color:#000000; text-decoration:none; border-radius:6px;">
                      CONFIRM\u0102 CONTUL
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:20px 0 0 0; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; color:#71717a;">
                Dac\u0103 butonul nu func\u021Bioneaz\u0103, copiaz\u0103 acest link \xEEn browserul t\u0103u:<br />
                <a href="https://pipingbox.com/login" style="color:#b45309; text-decoration:underline; word-break:break-all;">https://pipingbox.com/login</a>
              </p>
            </td>
          </tr>

          <!-- Ayuda -->
          <tr>
            <td style="background-color:#ffffff; padding:0 28px 32px 28px;">
              <p style="margin:0 0 16px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">
                Dac\u0103 problema continu\u0103 dup\u0103 confirmarea adresei, r\u0103spunde direct la acest e-mail \u0219i te vom ajuta.
              </p>
              <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">
                Cu stim\u0103,
              </p>
            </td>
          </tr>

          <!-- Pie -->
          <tr>
            <td style="background-color:#000000; padding:24px 28px;">
              <p style="margin:0 0 8px 0; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:20px; color:#ffffff; font-weight:bold;">
                Echipa PipingBox
              </p>
              <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; color:#a1a1aa;">
                <a href="https://pipingbox.com" style="color:#f59e0b; text-decoration:none;">https://pipingbox.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
function renderConfirmationRoText(name) {
  return `Bun\u0103, ${name},

Am verificat contul t\u0103u PipingBox. Contul a fost creat corect, \xEEns\u0103 adresa de e-mail nu a fost \xEEnc\u0103 confirmat\u0103. Din acest motiv, atunci c\xE2nd \xEEncerci s\u0103 te autentifici, aplica\u021Bia te redirec\u021Bioneaz\u0103 \xEEnapoi la pagina de conectare.

Pentru a finaliza \xEEnregistrarea, te rug\u0103m s\u0103 urmezi ace\u0219ti pa\u0219i:

1. Acceseaz\u0103 https://pipingbox.com/login
2. Selecteaz\u0103 op\u021Biunea \u201ERetrimite e-mailul de confirmare\u201D.
3. Verific\u0103 mesajele primite la aceast\u0103 adres\u0103 de e-mail.
4. Dac\u0103 nu g\u0103se\u0219ti mesajul, verific\u0103 \u0219i folderul Spam sau Mesaje nedorite.
5. Deschide numai cel mai recent e-mail trimis de PipingBox.
6. Apas\u0103 pe butonul sau linkul de confirmare.
7. Revino la PipingBox \u0219i autentific\u0103-te din nou.

Linkurile de confirmare mai vechi pot fi expirate, de aceea este important s\u0103 folose\u0219ti ultimul mesaj primit.

CONFIRM\u0102 CONTUL:
https://pipingbox.com/login

Dac\u0103 problema continu\u0103 dup\u0103 confirmarea adresei, r\u0103spunde direct la acest e-mail \u0219i te vom ajuta.

Cu stim\u0103,

Echipa PipingBox
https://pipingbox.com
`;
}

// supabase/functions/support-recovery-email/index.ts
var TEST_RECIPIENT = "support@pipingbox.com";
var TEST_RECIPIENT_NAME = "Edward";
var AUDIT_BCC = "info@pipingbox.com";
var FROM_DISPLAY_NAME = "PipingBox";
var REPLY_TO = "support@pipingbox.com";
var KNOWN_TEMPLATES = [RECOVERY_EMAIL_TEMPLATE_ID, CONFIRMATION_RO_TEMPLATE_ID];
function resolveTemplate() {
  const raw = Deno.env.get("RECOVERY_EMAIL_TEMPLATE") || "";
  if (raw === "") return { id: RECOVERY_EMAIL_TEMPLATE_ID };
  const found = KNOWN_TEMPLATES.find((t) => t === raw);
  if (!found) return { error: "unknown_template" };
  return { id: found };
}
var FORBIDDEN_BODY_FIELDS = [
  "to",
  "cc",
  "bcc",
  "from",
  "reply_to",
  "replyTo",
  "subject",
  "html",
  "text",
  "name",
  "recipient",
  "recipients",
  "reply_to_address",
  "template",
  "template_id"
];
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
function log(fields) {
  const allowed = ["template", "provider_status", "message_id", "audit_copy_sent", "status"];
  const safeFields = Object.fromEntries(
    allowed.filter((key) => fields[key] !== void 0).map((key) => [key, fields[key]])
  );
  console.log(JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), ...safeFields }));
}
async function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b))
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
function sanitizeMessageId(id) {
  if (!id) return void 0;
  return id.replace(/[^A-Za-z0-9@.\-]/g, "").slice(0, 120) || void 0;
}
function sanitizeError(e) {
  if (e instanceof Error) return e.message.slice(0, 120).replace(/[\r\n]/g, " ");
  return "unknown_error";
}
Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }
  let authPath = null;
  const authHeader = req.headers.get("Authorization") || "";
  if (serviceKey && authHeader.startsWith("Bearer ")) {
    const candidate = authHeader.slice("Bearer ".length);
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
          p_candidate: recoveryKey
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
  let body = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed;
    }
  } catch {
  }
  const rejectedFieldCount = FORBIDDEN_BODY_FIELDS.filter((f) => body[f] !== void 0).length;
  if (rejectedFieldCount > 0) {
    return json({ error: "invalid_request", reason: "message_fields_are_server_side", rejected_field_count: rejectedFieldCount }, 400);
  }
  const isPreflight = body.preflight === true;
  const mode = body.mode === "PRODUCTION" ? "PRODUCTION" : "TEST";
  const templateSel = resolveTemplate();
  if (templateSel.error) {
    if (isPreflight) {
      return json({ ok: false, action: "preflight", error: "unknown_template", reason: "RECOVERY_EMAIL_TEMPLATE must be a known closed template id" }, 200);
    }
    log({ action: "send", template: "unknown", mode, status: "FAILED", provider_status: "template_misconfigured", audit_copy_sent: false });
    return json({ ok: false, status: "FAILED", reason: "unknown_template", mode, audit_copy_sent: false, correlation_id: correlationId }, 500);
  }
  const templateId = templateSel.id;
  if (isPreflight) {
    const has = (n) => (Deno.env.get(n) || "").length > 0;
    const notifySmtp = has("NOTIFY_SMTP_HOST") && has("NOTIFY_SMTP_USER") && has("NOTIFY_SMTP_PASSWORD");
    const legacySmtp = has("SMTP_HOST") && has("SMTP_USER") && has("SMTP_PASSWORD");
    const config = {
      SUPABASE_URL: !!supabaseUrl,
      SUPABASE_SERVICE_ROLE_KEY: !!serviceKey,
      SMTP_TRANSPORT: notifySmtp ? "resend_smtp" : legacySmtp ? "smtp_onecom" : false,
      SMTP_HOST: has("SMTP_HOST"),
      SMTP_USER: has("SMTP_USER"),
      SMTP_PASSWORD: has("SMTP_PASSWORD"),
      SMTP_PORT: has("SMTP_PORT") ? true : "587 (default)",
      SMTP_SECURE: has("SMTP_SECURE") ? true : "true (default)",
      SMTP_FROM: has("SMTP_FROM") ? true : "noreply@pipingbox.com (default)",
      NOTIFY_SMTP_HOST: has("NOTIFY_SMTP_HOST"),
      NOTIFY_SMTP_USER: has("NOTIFY_SMTP_USER"),
      NOTIFY_SMTP_PASSWORD: has("NOTIFY_SMTP_PASSWORD"),
      NOTIFY_SMTP_PORT: has("NOTIFY_SMTP_PORT") ? true : "465 (default)",
      NOTIFY_SMTP_SECURE: has("NOTIFY_SMTP_SECURE") ? true : "true (default)",
      NOTIFY_SMTP_FROM: has("NOTIFY_SMTP_FROM") ? true : "notifications@notify.pipingbox.com (default)",
      PO_GO: Deno.env.get("PO_GO") === "1",
      PROD_SHA_VERIFIED: Deno.env.get("PROD_SHA_VERIFIED") === "1",
      RECOVERY_RECIPIENT: has("RECOVERY_RECIPIENT"),
      active_template: templateId
    };
    const missing = Object.entries(config).filter(([k, v]) => v === false && !k.startsWith("NOTIFY_SMTP_") && !k.startsWith("SMTP_")).map(([k]) => k);
    if (!notifySmtp && !legacySmtp) missing.push("SMTP_TRANSPORT");
    log({ action: "preflight", correlation_id: correlationId, auth_mode: authPath, missing_required_secrets: missing });
    return json({ ok: true, action: "preflight", auth_mode: authPath, missing_required_secrets: missing, config });
  }
  let recipient;
  let recipientName;
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
  const isTest = mode === "TEST";
  const baseSubject = templateId === CONFIRMATION_RO_TEMPLATE_ID ? confirmationRoSubject() : recoverySubject(false);
  const subject = isTest ? `[TEST] ${baseSubject}` : baseSubject;
  const provider = createEmailProvider();
  if (!provider.isConfigured()) {
    log({
      action: "send",
      correlation_id: correlationId,
      template: templateId,
      mode,
      status: "FAILED",
      provider_status: "not_configured",
      audit_copy_sent: false
    });
    return json({ ok: false, status: "FAILED", reason: "email_provider_not_configured", mode, correlation_id: correlationId }, 503);
  }
  try {
    const html = templateId === CONFIRMATION_RO_TEMPLATE_ID ? renderConfirmationRoHtml(recipientName) : renderRecoveryEmailHtml(recipientName);
    const text = templateId === CONFIRMATION_RO_TEMPLATE_ID ? renderConfirmationRoText(recipientName) : renderRecoveryEmailText(recipientName);
    const r = await provider.send({
      to: recipient,
      subject,
      html,
      text,
      fromName: FROM_DISPLAY_NAME,
      replyTo: REPLY_TO,
      bcc: AUDIT_BCC
      // envelope de la MISMA transacción; sin cabecera Bcc visible
    });
    const rejectedCount = r.rejected ?? 0;
    const acceptedCount = r.accepted ?? 0;
    const auditCopySent = rejectedCount === 0 && acceptedCount >= 2;
    const status = auditCopySent ? isTest ? "SENT_TEST" : "SENT" : "PARTIAL";
    log({
      action: "send",
      correlation_id: correlationId,
      template: templateId,
      mode,
      status,
      provider: r.provider,
      provider_status: `accepted=${acceptedCount},rejected=${rejectedCount}`,
      message_id: sanitizeMessageId(r.messageId),
      audit_copy_sent: auditCopySent
    });
    return json({
      ok: status !== "PARTIAL",
      status,
      mode,
      template: templateId,
      subject_prefix: isTest ? "[TEST]" : "",
      message_id: sanitizeMessageId(r.messageId),
      accepted_recipients: acceptedCount,
      rejected_recipients: rejectedCount,
      audit_copy_sent: auditCopySent,
      audit_copy_policy: "bcc_same_smtp_transaction",
      correlation_id: correlationId,
      ...status === "PARTIAL" ? { reason: "provider_did_not_confirm_all_recipients" } : {}
    });
  } catch (e) {
    log({
      action: "send_exception",
      correlation_id: correlationId,
      template: templateId,
      mode,
      status: "FAILED",
      provider_status: "error",
      error: sanitizeError(e),
      audit_copy_sent: false
    });
    return json({ ok: false, status: "FAILED", reason: sanitizeError(e), mode, audit_copy_sent: false, correlation_id: correlationId }, 502);
  }
});
