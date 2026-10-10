-- ══════════════════════════════════════════════════════════════════════════════
-- PB-I18N-EMAIL-001 — Preferencia de idioma del usuario (réplica) y captura de
-- correos para QA.
--
-- FUENTE DE VERDAD: auth.users.raw_user_meta_data->>'lang' (user_metadata.lang),
--   escrita por el frontend en signUp y en el selector de idioma autenticado.
--   Es lo único disponible en el payload del Send Email Auth Hook y en el
--   momento del correo de confirmación (el perfil se crea tras confirmar).
--
-- RÉPLICA: app_14da0f1941_profiles.preferred_language, para consultas SQL y
--   para los emisores transaccionales (notification-dispatcher, cert-expiry,
--   job/workforce-match). NULL = sin preferencia declarada → los emisores usan
--   'en'. SIN BACKFILL: no se infiere idioma por país, nacionalidad ni correo.
--
-- PERMISOS: `authenticated` ya tiene UPDATE a nivel de tabla sobre profiles
--   (verificado 2026-10-10 con has_table_privilege) y la política
--   profiles_update_own (user_id = auth.uid()) limita por fila; la nueva
--   columna queda cubierta sin GRANT adicional.
--
-- CAPTURA QA: app_14da0f1941_email_capture recibe los correos renderizados
--   cuando EMAIL_DELIVERY_MODE=capture (solo proyecto QA / CLI local). Nunca
--   se envía nada; el destinatario se guarda como hash SHA-256 (sin PII) y
--   los tokens/enlaces se redactan antes de insertar. Solo service_role.
--
-- ENTORNOS: aplicar en CLI local y en el proyecto QA (uqfbilyfpflrlthnyijj).
--   Producción: SOLO la sección 1 y SOLO con GO específico (la sección 2 no
--   debe existir en producción).
--
-- ROLLBACK:
--   ALTER TABLE public.app_14da0f1941_profiles DROP COLUMN IF EXISTS preferred_language;
--   DROP TABLE IF EXISTS public.app_14da0f1941_email_capture;
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Réplica de la preferencia de idioma ──────────────────────────────────
ALTER TABLE public.app_14da0f1941_profiles
  ADD COLUMN IF NOT EXISTS preferred_language text NULL;

ALTER TABLE public.app_14da0f1941_profiles
  DROP CONSTRAINT IF EXISTS profiles_preferred_language_supported;

-- Espejo de app/frontend/src/i18n/languages.json (11 códigos canónicos).
ALTER TABLE public.app_14da0f1941_profiles
  ADD CONSTRAINT profiles_preferred_language_supported
  CHECK (
    preferred_language IS NULL
    OR preferred_language IN ('en','es','nl','fr','de','pt','it','ro','uk','pl','bg')
  );

COMMENT ON COLUMN public.app_14da0f1941_profiles.preferred_language IS
  'PB-I18N-EMAIL-001: réplica de auth.users user_metadata.lang (fuente de verdad). NULL = sin preferencia → en. Sin backfill.';

-- ── 2. Captura de correos para QA (NO aplicar en producción) ────────────────
CREATE TABLE IF NOT EXISTS public.app_14da0f1941_email_capture (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  source          text NOT NULL,            -- auth-send-email-hook | notification-dispatcher | cert-expiry-alerts | lead-notification
  template        text NOT NULL,            -- confirmation | recovery | job_match | ...
  lang            text NOT NULL,            -- idioma resuelto (ya con fallback)
  lang_source     text NOT NULL,            -- user_metadata | profile | request | fallback
  recipient_hash  text NOT NULL,            -- sha256(lower(email)), sin PII
  recipient_domain text NULL,               -- solo dominio, para comprobar aislamiento
  subject         text NOT NULL,
  html            text NOT NULL,            -- tokens/enlaces redactados
  text_body       text NOT NULL,            -- tokens/enlaces redactados
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.app_14da0f1941_email_capture ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo service_role (bypass RLS) puede leer/escribir.
REVOKE ALL ON public.app_14da0f1941_email_capture FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS email_capture_created_idx
  ON public.app_14da0f1941_email_capture (created_at DESC);
CREATE INDEX IF NOT EXISTS email_capture_template_lang_idx
  ON public.app_14da0f1941_email_capture (template, lang);
