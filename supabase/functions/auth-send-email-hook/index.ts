// auth-send-email-hook/index.ts
// PB-I18N-EMAIL-001 — Send Email Auth Hook de Supabase.
//
// Sustituye el envío nativo de GoTrue para que ASUNTO y CUERPO salgan en el
// idioma del destinatario (user_metadata.lang → 'en'). Las plantillas nativas
// solo permiten condicionales en el cuerpo; el asunto es una cadena fija, por
// eso hace falta el hook.
//
// Garantías:
//   * Firma Standard Webhooks obligatoria (SEND_EMAIL_HOOK_SECRET). Sin firma
//     válida → 401 y GoTrue NO envía nada (no hay duplicados ni fallback).
//   * El enlace de verificación es el mismo que generaría GoTrue:
//       {AUTH_PUBLIC_URL}/auth/v1/verify?token={token_hash}&type={type}&redirect_to={redirect_to}
//     AUTH_PUBLIC_URL debe ser el dominio público de Auth (prod:
//     https://auth.pipingbox.com; QA/local: SUPABASE_URL). Si no está definido
//     se usa SUPABASE_URL. No se usa email_data.site_url porque es la URL de
//     la app (redirect), no la del servicio Auth.
//   * Tokens/OTP nunca se escriben en logs. Solo se registran tipo de acción,
//     idioma, proveedor y messageId.
//   * Respuesta en < 5 s (límite del hook): una sola petición HTTP de envío.
//   * Un fallo de envío devuelve 500 con error estructurado; GoTrue lo
//     propaga al cliente y no reintenta en bucle.
//
// Modo de entrega: EMAIL_DELIVERY_MODE (capture en QA/CLI; resend_api en prod
// con RESEND_AUTH_API_KEY, secreto que crea el PO). Ver _shared/email-provider.ts.

import { verifyWebhook, WebhookVerificationError } from "../_shared/standard-webhooks.ts";
import { createAuthEmailProvider, type EmailProvider } from "../_shared/email-provider.ts";
import {
  renderActionEmail,
  renderNoticeEmail,
  resolveRecipientLanguage,
  type ActionTemplateId,
  type NoticeTemplateId,
  type RenderedEmail,
  type ResolvedLanguage,
} from "../_shared/email-i18n/mod.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos del payload (GoTrue v0hooks.SendEmailInput)
// ─────────────────────────────────────────────────────────────────────────────

export interface HookUser {
  id: string;
  email: string;
  new_email?: string | null;
  phone?: string | null;
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
}

export interface HookEmailData {
  token: string;
  token_hash: string;
  redirect_to: string;
  email_action_type: string;
  site_url: string;
  token_new?: string;
  token_hash_new?: string;
  old_email?: string;
  old_phone?: string;
  provider?: string;
  factor_type?: string;
}

export interface HookPayload {
  user: HookUser;
  email_data: HookEmailData;
}

export interface PlannedEmail {
  to: string;
  rendered: RenderedEmail;
  lang: ResolvedLanguage;
}

const ACTION_MAP: Record<string, ActionTemplateId> = {
  signup: "confirmation",
  recovery: "recovery",
  magiclink: "magic_link",
  invite: "invite",
};

const NOTICE_MAP: Record<string, NoticeTemplateId> = {
  password_changed_notification: "password_changed_notification",
  email_changed_notification: "email_changed_notification",
  phone_changed_notification: "phone_changed_notification",
  identity_linked_notification: "identity_linked_notification",
  identity_unlinked_notification: "identity_unlinked_notification",
  mfa_factor_enrolled_notification: "mfa_factor_enrolled_notification",
  mfa_factor_unenrolled_notification: "mfa_factor_unenrolled_notification",
};

export interface BuildOptions {
  /** Base pública de Auth, p. ej. https://auth.pipingbox.com (sin barra final). */
  authPublicUrl: string;
  /** mailer_otp_exp en segundos (prod: 3600). */
  otpExpSeconds: number;
}

export function buildVerifyUrl(base: string, tokenHash: string, type: string, redirectTo: string): string {
  const u = new URL("/auth/v1/verify", base.endsWith("/") ? base : `${base}/`);
  u.searchParams.set("token", tokenHash);
  u.searchParams.set("type", type);
  if (redirectTo) u.searchParams.set("redirect_to", redirectTo);
  return u.toString();
}

/**
 * Traduce el payload del hook en 1..2 correos renderizados. Pura (sin I/O)
 * para poder probarla en los 11 idiomas sin enviar nada.
 */
export function planEmails(payload: HookPayload, opts: BuildOptions): PlannedEmail[] {
  const { user, email_data: d } = payload;
  const lang = resolveRecipientLanguage({ userMetadata: user.user_metadata ?? null });
  const type = d.email_action_type;
  const out: PlannedEmail[] = [];

  const action = ACTION_MAP[type];
  if (action) {
    out.push({
      to: user.email,
      lang,
      rendered: renderActionEmail({
        template: action,
        lang: lang.lang,
        actionUrl: buildVerifyUrl(opts.authPublicUrl, d.token_hash, type, d.redirect_to),
        vars: { email: user.email },
        expiresInSeconds: opts.otpExpSeconds,
      }),
    });
    return out;
  }

  if (type === "email_change") {
    const newEmail = user.new_email ?? "";
    const secure = Boolean(d.token_hash_new);
    if (secure) {
      // Secure Email Change: dos correos. Nomenclatura invertida (ver docs):
      //   current (user.email)  → token_hash_new
      //   new     (user.new_email) → token_hash
      out.push({
        to: user.email,
        lang,
        rendered: renderActionEmail({
          template: "email_change_current",
          lang: lang.lang,
          actionUrl: buildVerifyUrl(opts.authPublicUrl, d.token_hash_new as string, "email_change", d.redirect_to),
          vars: { email: user.email, newEmail },
          expiresInSeconds: opts.otpExpSeconds,
        }),
      });
    }
    out.push({
      to: newEmail || user.email,
      lang,
      rendered: renderActionEmail({
        template: "email_change_new",
        lang: lang.lang,
        actionUrl: buildVerifyUrl(opts.authPublicUrl, d.token_hash, "email_change", d.redirect_to),
        vars: { email: user.email, newEmail: newEmail || user.email },
        expiresInSeconds: opts.otpExpSeconds,
      }),
    });
    return out;
  }

  if (type === "reauthentication") {
    out.push({
      to: user.email,
      lang,
      rendered: renderNoticeEmail({
        template: "reauthentication",
        lang: lang.lang,
        code: d.token,
        expiresInSeconds: opts.otpExpSeconds,
        showNotYou: false,
      }),
    });
    return out;
  }

  const notice = NOTICE_MAP[type];
  if (notice) {
    out.push({
      to: user.email,
      lang,
      rendered: renderNoticeEmail({
        template: notice,
        lang: lang.lang,
        vars: {
          email: user.email,
          oldEmail: d.old_email,
          phone: user.phone,
          oldPhone: d.old_phone,
          provider: d.provider,
          factorType: d.factor_type,
        },
        showNotYou: true,
      }),
    });
    return out;
  }

  throw new Error(`unsupported_email_action_type:${type}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Servidor
// ─────────────────────────────────────────────────────────────────────────────

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export async function handleRequest(
  req: Request,
  deps: { provider: EmailProvider; hookSecret: string; opts: BuildOptions },
): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: { http_code: 405, message: "method_not_allowed" } });

  const raw = await req.text();
  let payload: HookPayload;
  try {
    payload = await verifyWebhook<HookPayload>(deps.hookSecret, raw, req.headers);
  } catch (e) {
    const msg = e instanceof WebhookVerificationError ? e.message : "verification_failed";
    console.warn("[auth-send-email-hook] rejected:", msg);
    return json(401, { error: { http_code: 401, message: msg } });
  }

  if (!payload?.user?.email || !payload?.email_data?.email_action_type) {
    return json(400, { error: { http_code: 400, message: "invalid_payload" } });
  }

  if (!deps.provider.isConfigured()) {
    console.error("[auth-send-email-hook] email provider not configured");
    return json(500, { error: { http_code: 500, message: "email_provider_not_configured" } });
  }

  let planned: PlannedEmail[];
  try {
    planned = planEmails(payload, deps.opts);
  } catch (e) {
    console.error("[auth-send-email-hook] plan failed:", (e as Error).message);
    return json(500, { error: { http_code: 500, message: (e as Error).message } });
  }

  for (const p of planned) {
    if (p.rendered.missing.length) {
      console.warn("[auth-send-email-hook] missing vars", p.rendered.template, p.rendered.lang, p.rendered.missing);
    }
    try {
      const res = await deps.provider.send({
        to: p.to,
        subject: p.rendered.subject,
        html: p.rendered.html,
        text: p.rendered.text,
        fromName: "PIPINGBOX",
        capture: {
          source: "auth-send-email-hook",
          template: p.rendered.template,
          lang: p.rendered.lang,
          langSource: p.lang.source,
          meta: { email_action_type: payload.email_data.email_action_type },
        },
      });
      console.log(
        `[auth-send-email-hook] sent type=${payload.email_data.email_action_type} template=${p.rendered.template} lang=${p.rendered.lang}/${p.lang.source} provider=${res.provider} id=${res.messageId ?? "n/a"}`,
      );
    } catch (e) {
      console.error("[auth-send-email-hook] send failed:", (e as Error).message);
      return json(500, { error: { http_code: 500, message: "email_send_failed" } });
    }
  }

  return json(200, {});
}

if (import.meta.main) {
  const hookSecret = Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "";
  const authPublicUrl = Deno.env.get("AUTH_PUBLIC_URL") || Deno.env.get("SUPABASE_URL") || "";
  const otpExpSeconds = parseInt(Deno.env.get("AUTH_OTP_EXP_SECONDS") || "3600", 10);
  const provider = createAuthEmailProvider();

  if (!hookSecret) console.error("[auth-send-email-hook] SEND_EMAIL_HOOK_SECRET missing: all requests will be rejected");
  if (!authPublicUrl) console.error("[auth-send-email-hook] AUTH_PUBLIC_URL/SUPABASE_URL missing");

  Deno.serve((req) => handleRequest(req, { provider, hookSecret, opts: { authPublicUrl, otpExpSeconds } }));
}
