// _shared/email-i18n/render.ts
// PB-I18N-EMAIL-001 — Renderizado de correos localizados (HTML + text/plain).
//
// Seguridad:
//   * TODAS las variables se escapan con escapeHtml() antes de insertarse en el
//     HTML. Las URLs se validan (solo http/https) y se escapan como atributo.
//   * El texto de los locales es contenido de confianza (fuente del repo), pero
//     los marcadores {x} solo se sustituyen por valores suministrados; un
//     marcador sin valor se deja vacío y se registra en `missing`.
//   * Nunca se incluyen tokens en claro fuera del enlace/código destinado.
//
// Diseño: identidad PIPINGBOX (negro #0B0B0B / naranja #E8611A), tabla única
// de 600 px, botón "bulletproof" con texto oscuro #18181B sobre naranja
// (contraste AA 5.19:1; corregido en revisión del PO, 2026-10-11 — el texto
// blanco previo daba solo 3.41:1), `lang`/`charset=utf-8` en <html>.

import { DEFAULT_EMAIL_LANGUAGE, type EmailLanguage } from "./languages.ts";
import { getLocale } from "./locales.ts";
import type {
  ActionTemplateId,
  ActionTemplateStrings,
  EmailLocale,
  NoticeTemplateId,
  NoticeTemplateStrings,
  TemplateId,
} from "./types.ts";

export const BRAND = {
  name: "PIPINGBOX",
  orange: "#E8611A",
  black: "#0B0B0B",
  text: "#1F2937",
  muted: "#6B7280",
  border: "#E5E7EB",
  bg: "#F3F4F6",
  support: "support@pipingbox.com",
  site: "https://pipingbox.com",
  /**
   * PB-I18N-EMAIL-001 — corrección de accesibilidad (revisión del PO,
   * 2026-10-11): el botón usaba texto blanco (#FFFFFF) sobre el naranja
   * corporativo (#E8611A), con un contraste de ~3.41:1 — por debajo del
   * mínimo WCAG AA para texto normal (4.5:1). Texto oscuro (#18181B) sobre el
   * mismo naranja da ~5.19:1, que sí cumple AA. Ver test de regresión en
   * `email-i18n_test.ts` ("contraste del botón cumple WCAG AA").
   */
  buttonText: "#18181B",
} as const;

export type Vars = Record<string, string | number | null | undefined>;

export interface RenderedEmail {
  lang: EmailLanguage;
  template: TemplateId;
  subject: string;
  html: string;
  text: string;
  /** Marcadores referenciados por el locale sin valor suministrado. */
  missing: string[];
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Acepta solo URLs absolutas http(s); cualquier otra cosa se rechaza. */
export function safeUrl(value: unknown): string {
  const raw = String(value ?? "").trim();
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("scheme");
    return u.toString();
  } catch {
    throw new Error("email-i18n: unsafe or invalid URL");
  }
}

const PLACEHOLDER = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g;

function interpolate(
  template: string,
  vars: Vars,
  mode: "html" | "text",
  missing: Set<string>,
): string {
  return template.replace(PLACEHOLDER, (_m, key: string) => {
    const v = vars[key];
    if (v === undefined || v === null || v === "") {
      missing.add(key);
      return "";
    }
    return mode === "html" ? escapeHtml(v) : String(v);
  });
}

function minutesFromSeconds(expSeconds: number | undefined): string {
  const s = typeof expSeconds === "number" && expSeconds > 0 ? expSeconds : 3600;
  return String(Math.max(1, Math.round(s / 60)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout
// ─────────────────────────────────────────────────────────────────────────────

interface LayoutParts {
  lang: EmailLanguage;
  preheader: string;
  heading: string;
  bodyHtml: string;        // párrafos ya escapados
  actionHtml?: string;     // botón + fallback, ya escapado
  codeHtml?: string;       // bloque de código OTP
  securityHtml: string;    // lista de avisos, ya escapada
  footerReason: string;
  footerNoReply: string;
  tagline: string;
}

function layout(p: LayoutParts): string {
  const action = p.actionHtml ?? "";
  const code = p.codeHtml ?? "";
  return `<!DOCTYPE html>
<html lang="${p.lang}" dir="ltr" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<title>${p.heading}</title>
</head>
<body style="margin:0; padding:0; background-color:${BRAND.bg}; font-family:Arial, Helvetica, sans-serif; color:${BRAND.text};">
<div style="display:none; max-height:0; overflow:hidden; opacity:0;">${p.preheader}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${BRAND.bg};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; width:100%; background-color:#FFFFFF; border-radius:8px; overflow:hidden;">
<tr><td style="background-color:${BRAND.black}; padding:20px 28px;">
  <span style="font-size:22px; font-weight:bold; letter-spacing:2px; color:#FFFFFF;">PIPING<span style="color:${BRAND.orange};">BOX</span></span>
</td></tr>
<tr><td style="padding:32px 28px 8px 28px;">
  <h1 style="margin:0 0 16px 0; font-size:22px; line-height:28px; color:${BRAND.black};">${p.heading}</h1>
  ${p.bodyHtml}
  ${code}
  ${action}
</td></tr>
<tr><td style="padding:8px 28px 24px 28px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-left:4px solid ${BRAND.orange}; background-color:#FFF7F2;">
  <tr><td style="padding:14px 16px; font-size:13px; line-height:20px; color:${BRAND.text};">
    ${p.securityHtml}
  </td></tr></table>
</td></tr>
<tr><td style="padding:16px 28px 24px 28px; border-top:1px solid ${BRAND.border}; font-size:12px; line-height:18px; color:${BRAND.muted};">
  <p style="margin:0 0 8px 0;">${p.footerReason}</p>
  <p style="margin:0 0 8px 0;">${p.footerNoReply}</p>
  <p style="margin:0;"><strong style="color:${BRAND.black};">PIPINGBOX</strong> · ${p.tagline} · <a href="${BRAND.site}" style="color:${BRAND.orange}; text-decoration:none;">pipingbox.com</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function paragraph(htmlText: string): string {
  return `<p style="margin:0 0 16px 0; font-size:16px; line-height:24px; color:${BRAND.text};">${htmlText}</p>`;
}

function button(label: string, url: string, fallbackLabel: string): string {
  const u = escapeHtml(url);
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 20px 0;">
<tr><td align="center" bgcolor="${BRAND.orange}" style="border-radius:6px;">
  <a href="${u}" target="_blank" rel="noopener" style="display:inline-block; padding:14px 28px; font-size:16px; font-weight:bold; color:${BRAND.buttonText}; text-decoration:none; border-radius:6px; background-color:${BRAND.orange};">${label}</a>
</td></tr></table>
<p style="margin:0 0 16px 0; font-size:13px; line-height:20px; color:${BRAND.muted};">${fallbackLabel}<br>
<a href="${u}" style="color:${BRAND.orange}; word-break:break-all;">${u}</a></p>`;
}

function codeBlock(label: string, code: string): string {
  return `<p style="margin:0 0 6px 0; font-size:13px; color:${BRAND.muted};">${label}</p>
<p style="margin:0 0 20px 0; font-size:28px; letter-spacing:6px; font-weight:bold; font-family:'Courier New', Courier, monospace; color:${BRAND.black};">${escapeHtml(code)}</p>`;
}

function supportLink(): string {
  return `<a href="mailto:${BRAND.support}" style="color:${BRAND.orange}; text-decoration:none;">${BRAND.support}</a>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────────────────────

export interface ActionRenderInput {
  template: ActionTemplateId;
  lang: EmailLanguage | string | null | undefined;
  /** URL del botón (ya construida; se valida http/https). */
  actionUrl: string;
  vars?: Vars;
  /** Caducidad en segundos (mailer_otp_exp). Por defecto 3600. */
  expiresInSeconds?: number;
  /** Mostrar el aviso de caducidad (false para alertas sin token). */
  showExpiry?: boolean;
}

export interface NoticeRenderInput {
  template: NoticeTemplateId;
  lang: EmailLanguage | string | null | undefined;
  vars?: Vars;
  /** Código OTP (solo reauthentication). */
  code?: string;
  expiresInSeconds?: number;
  /** Mostrar "si no has sido tú" (true para notificaciones de seguridad). */
  showNotYou?: boolean;
}

function pickLocale(lang: unknown): { locale: EmailLocale; lang: EmailLanguage } {
  const l = getLocale(lang);
  return { locale: l, lang: l.code as EmailLanguage };
}

function commonVars(vars: Vars | undefined, expiresInSeconds?: number): Vars {
  return { support: BRAND.support, minutes: minutesFromSeconds(expiresInSeconds), ...(vars ?? {}) };
}

export function renderActionEmail(input: ActionRenderInput): RenderedEmail {
  const { locale, lang } = pickLocale(input.lang);
  const t = locale.templates[input.template] as ActionTemplateStrings & { body_no_company?: string };
  const c = locale.common;
  const vars = commonVars(input.vars, input.expiresInSeconds);
  const missing = new Set<string>();
  const url = safeUrl(input.actionUrl);
  const showExpiry = input.showExpiry ?? true;

  // job_match: cuerpo alternativo si no hay empresa.
  const bodyTpl = input.template === "job_match" && !vars.company && t.body_no_company
    ? t.body_no_company
    : t.body;

  const H = (s: string) => interpolate(s, vars, "html", missing);
  const T = (s: string) => interpolate(s, vars, "text", missing);

  const securityItems = [
    showExpiry ? H(c.expires) : null,
    H(c.never_share),
    H(c.support_prompt).replace(escapeHtml(BRAND.support), supportLink()),
  ].filter(Boolean) as string[];

  const html = layout({
    lang,
    preheader: H(t.preheader),
    heading: H(t.heading),
    bodyHtml: paragraph(H(bodyTpl)) + paragraph(H(t.note).replace(escapeHtml(BRAND.support), supportLink())),
    actionHtml: button(H(t.button), url, H(c.button_fallback)),
    securityHtml: `<p style="margin:0 0 8px 0;"><strong>${H(c.security_title)}</strong></p>` +
      securityItems.map((s) => `<p style="margin:0 0 6px 0;">${s}</p>`).join(""),
    footerReason: H(t.footer_reason),
    footerNoReply: H(c.footer_no_reply).replace(escapeHtml(BRAND.support), supportLink()),
    tagline: H(c.brand_tagline),
  });

  const textLines = [
    `PIPINGBOX — ${T(t.heading)}`,
    "",
    T(bodyTpl),
    "",
    `${T(t.button)}: ${url}`,
    "",
    T(t.note),
    "",
    `${T(c.security_title).toUpperCase()}`,
    ...(showExpiry ? [`- ${T(c.expires)}`] : []),
    `- ${T(c.never_share)}`,
    `- ${T(c.support_prompt)}`,
    "",
    T(t.footer_reason),
    T(c.footer_no_reply),
    `PIPINGBOX · ${T(c.brand_tagline)} · ${BRAND.site}`,
  ];

  return {
    lang,
    template: input.template,
    subject: T(t.subject),
    html,
    text: textLines.join("\n"),
    missing: [...missing],
  };
}

export function renderNoticeEmail(input: NoticeRenderInput): RenderedEmail {
  const { locale, lang } = pickLocale(input.lang);
  const t = locale.templates[input.template] as NoticeTemplateStrings;
  const c = locale.common;
  const vars = commonVars(input.vars, input.expiresInSeconds);
  const missing = new Set<string>();
  const H = (s: string) => interpolate(s, vars, "html", missing);
  const T = (s: string) => interpolate(s, vars, "text", missing);
  const showNotYou = input.showNotYou ?? input.template.endsWith("_notification");

  const securityItems = [
    showNotYou ? H(c.not_you).replace(escapeHtml(BRAND.support), supportLink()) : null,
    H(c.never_share),
  ].filter(Boolean) as string[];

  const html = layout({
    lang,
    preheader: H(t.preheader),
    heading: H(t.heading),
    bodyHtml: paragraph(H(t.body)),
    codeHtml: input.code ? codeBlock(H(c.code_label), input.code) : undefined,
    securityHtml: `<p style="margin:0 0 8px 0;"><strong>${H(c.security_title)}</strong></p>` +
      securityItems.map((s) => `<p style="margin:0 0 6px 0;">${s}</p>`).join(""),
    footerReason: H(t.footer_reason),
    footerNoReply: H(c.footer_no_reply).replace(escapeHtml(BRAND.support), supportLink()),
    tagline: H(c.brand_tagline),
  });

  const textLines = [
    `PIPINGBOX — ${T(t.heading)}`,
    "",
    T(t.body),
    ...(input.code ? ["", `${T(c.code_label)}: ${input.code}`] : []),
    "",
    `${T(c.security_title).toUpperCase()}`,
    ...(showNotYou ? [`- ${T(c.not_you)}`] : []),
    `- ${T(c.never_share)}`,
    "",
    T(t.footer_reason),
    T(c.footer_no_reply),
    `PIPINGBOX · ${T(c.brand_tagline)} · ${BRAND.site}`,
  ];

  return {
    lang,
    template: input.template,
    subject: T(t.subject),
    html,
    text: textLines.join("\n"),
    missing: [...missing],
  };
}

export { DEFAULT_EMAIL_LANGUAGE };
