// _shared/email-i18n/types.ts
// PB-I18N-EMAIL-001 — Contrato de las plantillas de correo localizadas.
//
// `en.ts` define la forma; el resto de locales deben satisfacer `EmailLocale`
// (una clave ausente es error de compilación con `deno check`). Los textos usan
// marcadores `{nombre}`; `render.ts` los sustituye con escape HTML obligatorio.

/** Plantilla con botón de acción (enlace). */
export interface ActionTemplateStrings {
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  button: string;
  /** Aviso específico "si no has sido tú / si no lo esperabas". */
  note: string;
  /** Motivo del envío (pie). */
  footer_reason: string;
}

/** Plantilla informativa sin botón (notificaciones de seguridad, código OTP, acuses). */
export interface NoticeTemplateStrings {
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  footer_reason: string;
}

export interface JobMatchStrings extends ActionTemplateStrings {
  /** Variante del cuerpo cuando la oferta no indica empresa. */
  body_no_company: string;
}

export interface EmailCommonStrings {
  brand_tagline: string;
  /** "Si el botón no funciona, copia esta dirección en tu navegador:" */
  button_fallback: string;
  security_title: string;
  /** Usa {minutes}. */
  expires: string;
  never_share: string;
  /** Usa {support}. */
  support_prompt: string;
  /** Notificaciones de seguridad: "si no has sido tú...". Usa {support}. */
  not_you: string;
  /** Pie común. Usa {support}. */
  footer_no_reply: string;
  code_label: string;
}

export interface EmailTemplates {
  // ── Supabase Auth (email_action_type) ─────────────────────────────────
  confirmation: ActionTemplateStrings;          // signup       {email}
  recovery: ActionTemplateStrings;              // recovery     {email}
  magic_link: ActionTemplateStrings;            // magiclink    {email}
  invite: ActionTemplateStrings;                // invite       {email}
  email_change_current: ActionTemplateStrings;  // email_change → dirección ACTUAL {email} {newEmail}
  email_change_new: ActionTemplateStrings;      // email_change → dirección NUEVA  {newEmail}
  reauthentication: NoticeTemplateStrings;      // reauthentication {minutes} (+ código)
  password_changed_notification: NoticeTemplateStrings;     // {email}
  email_changed_notification: NoticeTemplateStrings;        // {oldEmail} {email}
  phone_changed_notification: NoticeTemplateStrings;        // {oldPhone} {phone}
  identity_linked_notification: NoticeTemplateStrings;      // {provider} {email}
  identity_unlinked_notification: NoticeTemplateStrings;    // {provider} {email}
  mfa_factor_enrolled_notification: NoticeTemplateStrings;  // {factorType}
  mfa_factor_unenrolled_notification: NoticeTemplateStrings;// {factorType}
  // ── Transaccionales PIPINGBOX ─────────────────────────────────────────
  job_match: JobMatchStrings;                   // {score} {jobTitle} {company}
  workforce_match: ActionTemplateStrings;       // {score} {workerType} {country}
  cert_expiry: ActionTemplateStrings;           // {certName} {expiresOn}
  lead_receipt: NoticeTemplateStrings;          // {name}
}

export type TemplateId = keyof EmailTemplates;

export interface EmailLocale {
  code: string;
  common: EmailCommonStrings;
  templates: EmailTemplates;
}

export const ACTION_TEMPLATES = [
  "confirmation", "recovery", "magic_link", "invite",
  "email_change_current", "email_change_new",
  "job_match", "workforce_match", "cert_expiry",
] as const satisfies readonly TemplateId[];

export const NOTICE_TEMPLATES = [
  "reauthentication",
  "password_changed_notification", "email_changed_notification", "phone_changed_notification",
  "identity_linked_notification", "identity_unlinked_notification",
  "mfa_factor_enrolled_notification", "mfa_factor_unenrolled_notification",
  "lead_receipt",
] as const satisfies readonly TemplateId[];

export type ActionTemplateId = (typeof ACTION_TEMPLATES)[number];
export type NoticeTemplateId = (typeof NOTICE_TEMPLATES)[number];
