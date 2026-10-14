-- ══════════════════════════════════════════════════════════════════════════════
-- PB-I18N-EMAIL-001 — Preferencia de idioma del usuario (réplica).
--
-- APLICABLE A: QA (uqfbilyfpflrlthnyijj), CLI local y, con GO específico
--   posterior, PRODUCCIÓN. Este archivo no contiene nada exclusivo de QA.
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
-- PERMISOS: en producción, `authenticated` ya tiene UPDATE a nivel de tabla
--   sobre profiles (verificado 2026-10-10 con has_table_privilege) y la
--   política profiles_update_own (user_id = auth.uid()) limita por fila; la
--   columna nueva queda cubierta sin GRANT adicional. En QA el ACL de
--   `profiles` es más restrictivo (ver PB-I18N-EMAIL-001/PR-Y-PREPARACION-QA.md
--   §2.6.2) — por decisión del PO, NO se otorgan GRANTs nuevos en QA para
--   igualarlo a producción; la réplica queda documentada como limitación de
--   QA y se valida en CLI local con permisos equivalentes a los de
--   producción.
--
-- ROLLBACK:
--   ALTER TABLE public.app_14da0f1941_profiles DROP COLUMN IF EXISTS preferred_language;
-- ══════════════════════════════════════════════════════════════════════════════

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
