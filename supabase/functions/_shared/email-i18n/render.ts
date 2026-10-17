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
import { marketplacePhoneRecommendation, marketplaceRequirementLabel, type Requirement } from "./reconciliation.ts";
import type {
  ActionTemplateId,
  ActionTemplateStrings,
  ApplicationPendingProfileStrings,
  EmailLocale,
  MarketplaceReadyStrings,
  NoticeTemplateId,
  NoticeTemplateStrings,
  PendingProfileItemKey,
  TemplateId,
  WelcomeCompanyStrings,
  WelcomeSectionStrings,
  WelcomeTemplateId,
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
  listHtml?: string;       // lista con viñetas (elementos pendientes / ofertas), ya escapada
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
  const list = p.listHtml ?? "";
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
  ${list}
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

// ─────────────────────────────────────────────────────────────────────────────
// PB-JOBS-MARKETPLACE-READY-ACTIVATION-001
// ─────────────────────────────────────────────────────────────────────────────

/** Claves canónicas de elementos pendientes del perfil (espejo de
 *  recalculate-profiles). Cualquier clave desconocida se ignora y se
 *  reporta en `missing`. */
export const PENDING_PROFILE_ITEM_KEYS: readonly PendingProfileItemKey[] = [
  "photo", "basic_details", "location", "years_experience", "skills",
  "bio", "cv", "experience", "certifications", "documents",
];

export interface ApplicationPendingProfileRenderInput {
  lang: EmailLanguage | string | null | undefined;
  /** CTA directo a completar perfil (p.ej. APP_BASE_URL + /profile). */
  actionUrl: string;
  vars?: Vars;
  /** Claves de elementos pendientes (photo, cv, …). */
  pendingItems: readonly string[];
  phoneMissing?: boolean;
}

function bulletListHtml(introHtml: string, itemsHtml: string[]): string {
  const lis = itemsHtml.map((i) =>
    `<li style="margin:0 0 6px 0; font-size:15px; line-height:22px; color:${BRAND.text};">${i}</li>`
  ).join("");
  return `${paragraph(introHtml)}<ul style="margin:0 0 16px 0; padding-left:22px;">${lis}</ul>`;
}

export function renderApplicationPendingProfileEmail(
  input: ApplicationPendingProfileRenderInput,
): RenderedEmail {
  const { locale, lang } = pickLocale(input.lang);
  const t = locale.templates.application_pending_profile as ApplicationPendingProfileStrings;
  const c = locale.common;
  const vars = commonVars(input.vars);
  const missing = new Set<string>();
  const url = safeUrl(input.actionUrl);

  const H = (s: string) => interpolate(s, vars, "html", missing);
  const T = (s: string) => interpolate(s, vars, "text", missing);

  const bodyTpl = !vars.company && t.body_no_company ? t.body_no_company : t.body;

  const required = ["cv", "certificate", "availability", "consent", "completion"] as const satisfies readonly Requirement[];
  const itemKeys = input.pendingItems.filter((key): key is Requirement =>
    (required as readonly string[]).includes(key)
  );
  for (const key of input.pendingItems) {
    if (!(required as readonly string[]).includes(key)) missing.add(`pending_item:${key}`);
  }
  const itemTexts = itemKeys.map((key) => marketplaceRequirementLabel(lang, key));
  const phone = input.phoneMissing ? marketplacePhoneRecommendation(lang) : null;
  const phoneHtml = phone ? `<h2 style="font-size:16px;">${escapeHtml(phone.heading)}</h2>${paragraph(escapeHtml(phone.body))}` : "";

  const securityItems = [
    H(c.never_share),
    H(c.support_prompt).replace(escapeHtml(BRAND.support), supportLink()),
  ];

  const html = layout({
    lang,
    preheader: H(t.preheader),
    heading: H(t.heading),
    bodyHtml: paragraph(H(bodyTpl)) + paragraph(H(t.note).replace(escapeHtml(BRAND.support), supportLink())),
    listHtml: (itemTexts.length > 0
      ? bulletListHtml(H(t.pending_intro), itemTexts.map(escapeHtml))
      : "") + phoneHtml,
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
    ...(itemTexts.length > 0 ? [T(t.pending_intro), ...itemTexts.map((i) => `- ${i}`), ""] : []),
    ...(phone ? [phone.heading, phone.body, ""] : []),
    `${T(t.button)}: ${url}`,
    "",
    T(t.note),
    "",
    `${T(c.security_title).toUpperCase()}`,
    `- ${T(c.never_share)}`,
    `- ${T(c.support_prompt)}`,
    "",
    T(t.footer_reason),
    T(c.footer_no_reply),
    `PIPINGBOX · ${T(c.brand_tagline)} · ${BRAND.site}`,
  ];

  return {
    lang,
    template: "application_pending_profile",
    subject: T(t.subject),
    html,
    text: textLines.join("\n"),
    missing: [...missing],
  };
}

export interface MarketplaceReadyRenderInput {
  lang: EmailLanguage | string | null | undefined;
  /** CTA al listado de candidaturas del usuario. */
  actionUrl: string;
  vars?: Vars;
  /** Títulos de las ofertas activadas (máx. recomendado 5; ya recortados por el llamador). */
  jobTitles: string[];
}

export function renderMarketplaceReadyEmail(
  input: MarketplaceReadyRenderInput,
): RenderedEmail {
  const { locale, lang } = pickLocale(input.lang);
  const t = locale.templates.marketplace_ready as MarketplaceReadyStrings;
  const c = locale.common;
  const vars = commonVars(input.vars);
  const missing = new Set<string>();
  const url = safeUrl(input.actionUrl);

  const H = (s: string) => interpolate(s, vars, "html", missing);
  const T = (s: string) => interpolate(s, vars, "text", missing);

  const count = input.jobTitles.length;
  // 0 títulos (o 1): cuerpo single (con {jobTitle} opcional); ≥2: multiple.
  const bodyTpl = count >= 2 ? t.body_multiple : t.body_single;

  const securityItems = [
    H(c.never_share),
    H(c.support_prompt).replace(escapeHtml(BRAND.support), supportLink()),
  ];

  const html = layout({
    lang,
    preheader: H(t.preheader),
    heading: H(t.heading),
    bodyHtml: paragraph(H(bodyTpl)) + paragraph(H(t.note).replace(escapeHtml(BRAND.support), supportLink())),
    listHtml: count >= 2
      ? bulletListHtml(H(t.activated_list_intro), input.jobTitles.map(escapeHtml))
      : undefined,
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
    ...(count >= 2
      ? ["", T(t.activated_list_intro), ...input.jobTitles.map((j) => `- ${j}`)]
      : []),
    "",
    `${T(t.button)}: ${url}`,
    "",
    T(t.note),
    "",
    `${T(c.security_title).toUpperCase()}`,
    `- ${T(c.never_share)}`,
    `- ${T(c.support_prompt)}`,
    "",
    T(t.footer_reason),
    T(c.footer_no_reply),
    `PIPINGBOX · ${T(c.brand_tagline)} · ${BRAND.site}`,
  ];

  return {
    lang,
    template: "marketplace_ready",
    subject: T(t.subject),
    html,
    text: textLines.join("\n"),
    missing: [...missing],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PB-WELCOME-EMAIL-001 — correo de bienvenida tras confirmación real
// ─────────────────────────────────────────────────────────────────────────────

export type WelcomeVariant = "worker" | "company";

/** Rutas internas REALES del SPA, verificadas contra `app/frontend/src/App.tsx`
 *  y `SPA_ROUTE_CONTRACT.ts`. No se enlaza ninguna ruta inexistente ni ninguna
 *  función todavía no publicada. */
export const WELCOME_ROUTES = {
  worker: {
    profile: "/profile",
    opportunities: "/jobs",
    tools: "/tools",
    academy: "/academy",
    community: "/community",
  },
  company: {
    profile: "/company/profile",
    opportunities: "/company/post-job",
    tools: "/tools",
    academy: "/academy",
    community: "/community",
  },
} as const;

/** Orden de secciones por variante. `beta` se maqueta aparte (bloque destacado). */
const WELCOME_SECTION_ORDER = {
  worker: ["profile", "opportunities", "comms", "tools", "academy", "community"],
  company: ["profile", "opportunities", "verification", "comms", "tools", "academy", "community"],
} as const;

/** Secciones con acceso directo; el resto son puramente informativas.
 *  `comms` y `verification` NO llevan enlace a propósito: no deben inducir
 *  ninguna activación de consentimiento ni de verificación automática. */
const WELCOME_SECTION_LINK: Partial<Record<string, keyof typeof WELCOME_ROUTES["worker"]>> = {
  profile: "profile",
  opportunities: "opportunities",
  tools: "tools",
  academy: "academy",
  community: "community",
};

export interface WelcomeRenderInput {
  variant: WelcomeVariant;
  lang: EmailLanguage | string | null | undefined;
  /** Base pública de la app (APP_BASE_URL); se valida http/https. */
  appBaseUrl: string;
  vars?: Vars;
}

/** Une una ruta interna con la base pública preservando subrutas de la base. */
function appUrl(base: string, path: string): string {
  const b = safeUrl(base);
  const root = b.endsWith("/") ? b : `${b}/`;
  return safeUrl(new URL(path.replace(/^\/+/, ""), root).toString());
}

interface WelcomeLayoutParts {
  lang: EmailLanguage;
  preheader: string;
  heading: string;
  introHtml: string;
  actionHtml: string;
  sectionsHtml: string;
  betaHtml: string;
  closingHtml: string;
  linksHtml: string;
  noticeHtml: string;
  footerReason: string;
  footerSupport: string;
  tagline: string;
}

/** Maquetación dedicada del correo de bienvenida.
 *
 *  Compatible con modo oscuro: `color-scheme` + `@media (prefers-color-scheme:
 *  dark)` con overrides explícitos por clase (`pb-*`). Los clientes que
 *  ignoran `<style>` (Gmail web con CSS recortado) siguen viendo la versión
 *  clara con colores inline, que es legible por sí misma. */
function welcomeLayout(p: WelcomeLayoutParts): string {
  return `<!DOCTYPE html>
<html lang="${p.lang}" dir="ltr" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${p.heading}</title>
<style>
:root { color-scheme: light dark; supported-color-schemes: light dark; }
@media only screen and (max-width:620px) {
  .pb-pad { padding-left:18px !important; padding-right:18px !important; }
  .pb-h1 { font-size:20px !important; line-height:26px !important; }
  .pb-btn a { display:block !important; text-align:center !important; }
}
@media (prefers-color-scheme: dark) {
  .pb-body, .pb-outer { background-color:#0B0B0B !important; }
  .pb-card { background-color:#17171A !important; }
  .pb-h1, .pb-h2 { color:#FFFFFF !important; }
  .pb-text { color:#E4E4E7 !important; }
  .pb-muted { color:#A1A1AA !important; }
  .pb-sep { border-color:#2E2E33 !important; }
  .pb-note { background-color:#1F1813 !important; }
  .pb-link { color:#FF8A4C !important; }
  .pb-badge { background-color:#2A1C12 !important; color:#FF8A4C !important; }
}
</style>
</head>
<body class="pb-body" style="margin:0; padding:0; background-color:${BRAND.bg}; font-family:'Inter','Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:${BRAND.text};">
<div style="display:none; max-height:0; overflow:hidden; opacity:0;">${p.preheader}</div>
<table role="presentation" class="pb-outer" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${BRAND.bg};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" class="pb-card" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; width:100%; background-color:#FFFFFF; border-radius:8px; overflow:hidden;">
<tr><td style="background-color:${BRAND.black}; padding:20px 28px;">
  <span style="font-size:22px; font-weight:bold; letter-spacing:2px; color:#FFFFFF;">PIPING<span style="color:${BRAND.orange};">BOX</span></span>
</td></tr>
<tr><td class="pb-pad" style="padding:32px 28px 4px 28px;">
  <h1 class="pb-h1" style="margin:0 0 16px 0; font-size:24px; line-height:30px; color:${BRAND.black};">${p.heading}</h1>
  ${p.introHtml}
  ${p.actionHtml}
</td></tr>
<tr><td class="pb-pad" style="padding:4px 28px 0 28px;">
  ${p.sectionsHtml}
</td></tr>
<tr><td class="pb-pad" style="padding:8px 28px 8px 28px;">
  ${p.betaHtml}
</td></tr>
<tr><td class="pb-pad" style="padding:8px 28px 0 28px;">
  ${p.closingHtml}
</td></tr>
<tr><td class="pb-pad" style="padding:8px 28px 20px 28px;">
  ${p.linksHtml}
</td></tr>
<tr><td class="pb-pad pb-sep" style="padding:16px 28px 24px 28px; border-top:1px solid ${BRAND.border};">
  <p class="pb-muted" style="margin:0 0 8px 0; font-size:12px; line-height:18px; color:${BRAND.muted};">${p.noticeHtml}</p>
  <p class="pb-muted" style="margin:0 0 8px 0; font-size:12px; line-height:18px; color:${BRAND.muted};">${p.footerReason}</p>
  <p class="pb-muted" style="margin:0 0 8px 0; font-size:12px; line-height:18px; color:${BRAND.muted};">${p.footerSupport}</p>
  <p class="pb-muted" style="margin:0; font-size:12px; line-height:18px; color:${BRAND.muted};"><strong class="pb-h2" style="color:${BRAND.black};">PIPINGBOX</strong> · ${p.tagline} · <a class="pb-link" href="${BRAND.site}" style="color:${BRAND.orange}; text-decoration:none;">pipingbox.com</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Sección con badge numerado naranja (iconografía industrial sin imágenes:
 *  cero dependencias externas, cero tracking, idéntico en todos los clientes). */
function welcomeSection(
  index: number,
  headingHtml: string,
  bodyHtml: string,
  link: { label: string; url: string } | null,
): string {
  const n = String(index).padStart(2, "0");
  const linkHtml = link
    ? `<p style="margin:0;"><a class="pb-link" href="${escapeHtml(link.url)}" target="_blank" rel="noopener" style="color:${BRAND.orange}; font-size:15px; font-weight:bold; text-decoration:none;">${link.label} &rarr;</a></p>`
    : "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px 0;">
<tr>
  <td width="44" valign="top" style="width:44px; padding:2px 12px 0 0;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
      <td class="pb-badge" align="center" width="32" height="32" bgcolor="#FFF1E8" style="width:32px; height:32px; border-radius:6px; background-color:#FFF1E8; font-size:13px; font-weight:bold; color:${BRAND.orange}; font-family:'Inter','Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${n}</td>
    </tr></table>
  </td>
  <td valign="top">
    <h2 class="pb-h2" style="margin:0 0 6px 0; font-size:17px; line-height:24px; color:${BRAND.black};">${headingHtml}</h2>
    <p class="pb-text" style="margin:0 0 8px 0; font-size:15px; line-height:23px; color:${BRAND.text};">${bodyHtml}</p>
    ${linkHtml}
  </td>
</tr></table>`;
}

export function renderWelcomeEmail(input: WelcomeRenderInput): RenderedEmail {
  const { locale, lang } = pickLocale(input.lang);
  const template: WelcomeTemplateId = input.variant === "company" ? "welcome_company" : "welcome_worker";
  const t = locale.templates[template] as WelcomeCompanyStrings;
  const c = locale.common;
  const vars = commonVars(input.vars);
  const missing = new Set<string>();

  const H = (s: string) => interpolate(s, vars, "html", missing);
  const T = (s: string) => interpolate(s, vars, "text", missing);
  const withSupport = (s: string) => H(s).replace(escapeHtml(BRAND.support), supportLink());

  const routes = WELCOME_ROUTES[input.variant];
  const urls = {
    profile: appUrl(input.appBaseUrl, routes.profile),
    opportunities: appUrl(input.appBaseUrl, routes.opportunities),
    tools: appUrl(input.appBaseUrl, routes.tools),
    academy: appUrl(input.appBaseUrl, routes.academy),
    community: appUrl(input.appBaseUrl, routes.community),
  };

  const order = WELCOME_SECTION_ORDER[input.variant] as readonly string[];
  const sections = order.map((key) => {
    const s = (t as unknown as Record<string, WelcomeSectionStrings>)[key];
    const linkKey = WELCOME_SECTION_LINK[key];
    const label = (t as unknown as Record<string, string>)[`link_${key}`];
    return {
      key,
      heading: s.heading,
      body: s.body,
      link: linkKey && label ? { label, url: urls[linkKey] } : null,
    };
  });

  const sectionsHtml = sections
    .map((s, i) =>
      welcomeSection(
        i + 1,
        H(s.heading),
        H(s.body),
        s.link ? { label: H(s.link.label), url: s.link.url } : null,
      )
    )
    .join("");

  const betaHtml = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="pb-note" style="border-left:4px solid ${BRAND.orange}; background-color:#FFF7F2;">
<tr><td style="padding:16px 18px;">
  <p class="pb-h2" style="margin:0 0 6px 0; font-size:16px; font-weight:bold; color:${BRAND.black};">${H(t.beta.heading)}</p>
  <p class="pb-text" style="margin:0 0 8px 0; font-size:15px; line-height:23px; color:${BRAND.text};">${H(t.beta.body)}</p>
  <p class="pb-text" style="margin:0; font-size:15px; line-height:23px; color:${BRAND.text};">${withSupport(t.beta_cta)}</p>
</td></tr></table>`;

  const closingHtml = `<p class="pb-text" style="margin:0 0 14px 0; font-size:15px; line-height:23px; color:${BRAND.text};">${H(t.closing)}</p>
<p class="pb-text" style="margin:0; font-size:15px; line-height:23px; color:${BRAND.text};"><strong>${H(t.signature)}</strong></p>`;

  const linkItems: Array<[string, string]> = [
    [H(t.link_profile), urls.profile],
    [H(t.link_opportunities), urls.opportunities],
    [H(t.link_tools), urls.tools],
    [H(t.link_academy), urls.academy],
    [H(t.link_community), urls.community],
  ];
  const linksHtml = `<p class="pb-muted" style="margin:0 0 8px 0; font-size:13px; line-height:20px; color:${BRAND.muted};">${H(t.links_intro)}</p>
<p class="pb-muted" style="margin:0; font-size:13px; line-height:22px; color:${BRAND.muted};">${
    linkItems
      .map(([label, url]) =>
        `<a class="pb-link" href="${escapeHtml(url)}" target="_blank" rel="noopener" style="color:${BRAND.orange}; text-decoration:none;">${label}</a>`
      )
      .join(" &nbsp;·&nbsp; ")
  }</p>`;

  const html = welcomeLayout({
    lang,
    preheader: H(t.preheader),
    heading: H(t.heading),
    introHtml: paragraph(H(t.intro)) + paragraph(H(t.ecosystem)),
    actionHtml: button(H(t.button), urls.profile, H(c.button_fallback)),
    sectionsHtml,
    betaHtml,
    closingHtml,
    linksHtml,
    noticeHtml: withSupport(t.account_type_notice),
    footerReason: H(t.footer_reason),
    footerSupport: withSupport(c.support_prompt),
    tagline: H(c.brand_tagline),
  });

  const textLines = [
    `PIPINGBOX — ${T(t.heading)}`,
    "",
    T(t.intro),
    "",
    T(t.ecosystem),
    "",
    `${T(t.button)}: ${urls.profile}`,
    "",
    ...sections.flatMap((s, i) => [
      `${String(i + 1).padStart(2, "0")}. ${T(s.heading)}`,
      T(s.body),
      ...(s.link ? [`${T(s.link.label)}: ${s.link.url}`] : []),
      "",
    ]),
    T(t.beta.heading).toUpperCase(),
    T(t.beta.body),
    T(t.beta_cta),
    "",
    T(t.closing),
    T(t.signature),
    "",
    T(t.links_intro),
    ...linkItems.map(([, url], i) => `- ${T([t.link_profile, t.link_opportunities, t.link_tools, t.link_academy, t.link_community][i])}: ${url}`),
    "",
    T(t.account_type_notice),
    T(t.footer_reason),
    T(c.support_prompt),
    `PIPINGBOX · ${T(c.brand_tagline)} · ${BRAND.site}`,
  ];

  return {
    lang,
    template,
    subject: T(t.subject),
    html,
    text: textLines.join("\n"),
    missing: [...missing],
  };
}

export { DEFAULT_EMAIL_LANGUAGE };
