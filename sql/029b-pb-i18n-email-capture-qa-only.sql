-- ══════════════════════════════════════════════════════════════════════════════
-- PB-I18N-EMAIL-001 — Captura de correos para QA.
--
-- APLICABLE EXCLUSIVAMENTE A: QA (uqfbilyfpflrlthnyijj) y CLI local.
-- **NUNCA aplicar en producción.** Esta tabla no tiene ninguna razón de ser
-- fuera de un entorno de pruebas: existe para que EMAIL_DELIVERY_MODE=capture
-- pueda registrar el correo renderizado sin enviarlo nunca.
--
-- Requiere haber aplicado antes 029a-pb-i18n-preferred-language.sql (no por
-- dependencia de esquema, sino porque forman parte de la misma fase y deben
-- aplicarse en ese orden).
--
-- PRIVACIDAD: el destinatario se guarda como hash SHA-256 (sin PII) + dominio;
--   asunto/html/text_body pasan por redactSensitive() antes de insertar, que
--   elimina tokens de verificación, códigos OTP (6-8 dígitos) y cualquier
--   dirección de correo que aparezca en el cuerpo. Ver
--   supabase/functions/_shared/email-provider.ts.
--
-- ACCESO: RLS habilitada SIN ninguna política (deny-all) + REVOKE explícito
--   sobre anon/authenticated. Solo `service_role` (que hace bypass de RLS)
--   puede leer o escribir. Verificado en PB-I18N-EMAIL-001/PR-Y-PREPARACION-QA.md.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.app_14da0f1941_email_capture;
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.app_14da0f1941_email_capture (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  source          text NOT NULL,            -- auth-send-email-hook | notification-dispatcher | cert-expiry-alerts | lead-notification
  template        text NOT NULL,            -- confirmation | recovery | job_match | ...
  lang            text NOT NULL,            -- idioma resuelto (ya con fallback)
  lang_source     text NOT NULL,            -- user_metadata | profile | request | fallback
  recipient_hash  text NOT NULL,            -- sha256(lower(email)), sin PII
  recipient_domain text NULL,               -- solo dominio, para comprobar aislamiento
  subject         text NOT NULL,            -- redactado (redactSensitive)
  html            text NOT NULL,            -- redactado: tokens/OTP/direcciones fuera
  text_body       text NOT NULL,            -- redactado: tokens/OTP/direcciones fuera
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.app_14da0f1941_email_capture ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo service_role (bypass RLS) puede leer/escribir.
REVOKE ALL ON public.app_14da0f1941_email_capture FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS email_capture_created_idx
  ON public.app_14da0f1941_email_capture (created_at DESC);
CREATE INDEX IF NOT EXISTS email_capture_template_lang_idx
  ON public.app_14da0f1941_email_capture (template, lang);
