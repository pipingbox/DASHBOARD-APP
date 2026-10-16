-- ══════════════════════════════════════════════════════════════════════════════
-- PB-CV-AUTO-PROFILE-001 — CV → AUTO PROFILE (DRAFT FIRST)
--
-- Modelo de datos para la extracción de datos profesionales a partir de un CV.
--
-- PRINCIPIOS DEL TICKET (no renegociables):
--   1. DRAFT FIRST: la extracción NUNCA sobrescribe datos confirmados por el
--      usuario. Todo lo extraído vive en un draft que el usuario acepta,
--      edita o rechaza campo a campo.
--   2. La extracción de un CV NO garantiza Marketplace Ready ni promueve
--      estados: el único camino canónico de promoción sigue siendo
--      pb_complete_onboarding (wizard). El apply del draft llama
--      pb_recalculate_profile_state, que mantiene/degrada pero NUNCA promueve.
--   3. Certificaciones de CV = declared/unverified. Nunca is_verified=true
--      por aparecer escritas en un CV. La verificación exige documento real
--      (Storage + fila canónica) y su proceso propio.
--   4. Idempotencia: mismo CV (sha256 del binario + usuario) ⇒ un solo draft.
--      UNIQUE (user_id, cv_sha256). El reprocesado actualiza la fila existente
--      o responde already_processed; jamás crea duplicados.
--   5. Sin PII en logs: esta migración no toca logging. Los eventos de
--      métricas (app_cv_extraction_events) solo almacenan contadores,
--      booleanos y enums cerrados — nunca teléfonos, emails, nombres ni
--      contenido del CV.
--
-- MODELO DE AMENAZAS / SEGURIDAD:
--   * RLS en ambas tablas (DEC-07). Nunca se desactiva.
--   * app_cv_extraction_drafts:
--       - SELECT  → solo el propietario (user_id = auth.uid()).
--       - UPDATE  → solo el propietario Y SOLO las columnas de revisión
--                   (extraction_status, reviewed_at, updated_at), con
--                   transiciones válidas, impuestas por el trigger
--                   pb_cv_draft_owner_update_guard (patrón de
--                   pb_profiles_privilege_guard). El resto de columnas
--                   (datos extraídos, referencias al documento) son de solo
--                   escritura service_role.
--       - INSERT/DELETE → sin policy para authenticated/anon: solo
--                   service_role (edge functions) puede crear o purgar drafts.
--   * app_cv_extraction_events: SELECT solo propietario; INSERT/DELETE/UPDATE
--                   sin policy para clientes: apéndice service_role.
--   * Las funciones nuevas son SECURITY INVOKER con search_path fijado.
--   * Grants mínimos: sin EXECUTE público; sin GRANT ALL.
--   * La autorización no deriva nunca de user_metadata.
--
-- ROLLBACK (documentado en docs/PB-CV-AUTO-PROFILE-001-DESIGN.md):
--   DROP TRIGGER IF EXISTS pb_cv_draft_owner_update_guard ON app_cv_extraction_drafts;
--   DROP FUNCTION IF EXISTS public.pb_cv_draft_owner_update_guard();
--   DROP TABLE IF EXISTS app_cv_extraction_events;
--   DROP TABLE IF EXISTS app_cv_extraction_drafts;
--   (Sin datos canónicos dependen de estas tablas: el perfil, las
--   experiencias, las certificaciones y los documentos viven en sus tablas
--   históricas. El rollback no pierde CVs: los binarios siguen en Storage y
--   las referencias canónicas en app_14da0f1941_profiles.cv_storage_*.)
--
-- APLICACIÓN: conforme al protocolo SQL. Idempotente (IF NOT EXISTS +
-- CREATE OR REPLACE + DROP IF EXISTS antes de CREATE para el trigger).
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── 1. app_cv_extraction_drafts ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.app_cv_extraction_drafts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Propietario del draft. Siempre un auth.users con match inequívoco; la
  -- identidad ambigua (caso soporte sin correspondencia clara) NO escribe
  -- aquí (manual review, sin draft).
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Idempotencia: hash SHA-256 del binario del CV. Mismo binario + mismo
  -- usuario ⇒ única fila (ver §15 del ticket).
  cv_sha256            text NOT NULL CHECK (length(cv_sha256) = 64),
  -- Canal de entrada: subida del propio usuario o CV recibido por soporte.
  source_channel       text NOT NULL CHECK (source_channel IN ('user_upload', 'support_inbound')),
  -- Documento fuente (source_document_id del contrato de cada campo extraído
  -- = id de esta fila; bucket+path son la referencia física).
  storage_bucket       text NOT NULL,
  storage_path         text NOT NULL,
  file_name            text NOT NULL,
  mime_type            text,
  file_size            bigint,
  -- Idioma detectado del CV (independiente del idioma preferido del usuario).
  cv_language          text CHECK (cv_language IS NULL OR cv_language IN
                       ('en','es','nl','fr','de','pt','it','ro','uk','pl','bg')),
  -- Método de extracción: texto nativo (PDF/DOCX) o fallback no disponible
  -- (fase 1: los archivos sin texto útil quedan extraction_failed, sin OCR).
  extraction_method    text CHECK (extraction_method IN
                       ('native_text', 'docx_xml', 'unavailable')),
  -- Ciclo de vida:
  --   pending_review    → extraído, esperando revisión del usuario;
  --   review_confirmed  → el usuario revisó y confirmó (total o parcialmente;
  --                       el detalle de qué aceptó vive en los eventos);
  --   dismissed         → el usuario lo descartó;
  --   extraction_failed → no se pudo extraer (CV conservado; retry seguro);
  --   superseded        → un CV posterior del mismo usuario lo reemplaza como
  --                       draft activo (histórico, no se borra).
  extraction_status    text NOT NULL DEFAULT 'pending_review'
                       CHECK (extraction_status IN
                       ('pending_review','review_confirmed','dismissed','extraction_failed','superseded')),
  -- Cada elemento: { field, value, source: 'cv', confidence, extracted_at,
  -- source_document_id }. Solo campos presentes explícitamente en el CV.
  extracted_fields     jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Experiencias estructuradas propuestas (solo con datos suficientes).
  proposed_experiences jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Certificaciones DECLARED/unverified detectadas en el texto del CV.
  -- Jamás cuentan como certificado documental (§6 del ticket).
  proposed_certifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Código de error cerrado cuando extraction_status = 'extraction_failed'.
  error_code           text CHECK (error_code IS NULL OR error_code IN
                       ('no_extractable_text','unsupported_legacy_doc',
                        'unsupported_mime','text_extraction_error',
                        'engine_error','storage_read_error')),
  attempt_count        integer NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  reviewed_at          timestamptz,
  -- Un solo draft pendiente/confirmado por (usuario, hash). Un hash reprocesado
  -- actualiza la fila existente; nunca crea una segunda.
  CONSTRAINT cv_extraction_drafts_user_hash_unique UNIQUE (user_id, cv_sha256)
);

COMMENT ON TABLE public.app_cv_extraction_drafts IS
  'PB-CV-AUTO-PROFILE-001: borrador de extracción de CV. DRAFT FIRST — nunca sobrescribe datos confirmados; el usuario acepta/edita/rechaza cada campo antes de aplicar.';

CREATE INDEX IF NOT EXISTS cv_extraction_drafts_user_status_idx
  ON public.app_cv_extraction_drafts (user_id, extraction_status, created_at DESC);

-- ─── 2. app_cv_extraction_events (métricas sin PII, §16 del ticket) ─────────

CREATE TABLE IF NOT EXISTS public.app_cv_extraction_events (
  id                bigserial PRIMARY KEY,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  draft_id          uuid REFERENCES public.app_cv_extraction_drafts(id) ON DELETE SET NULL,
  -- Enums cerrados (semejante a la taxonomía cerrada de observability.ts):
  event_type        text NOT NULL CHECK (event_type IN
                    ('cv_extraction_started',
                     'cv_extraction_completed',
                     'cv_extraction_failed',
                     'cv_extraction_retried',
                     'cv_already_processed',
                     'cv_support_manual_review',
                     'cv_profile_review_confirmed')),
  -- Contadores agregados, nunca contenido del CV.
  fields_extracted_count    integer,
  fields_confirmed_count    integer,
  experiences_extracted_count integer,
  experiences_applied_count integer,
  certifications_proposed_count integer,
  -- true solo si el recálculo canónico dejó marketplace_ready = true tras la
  -- confirmación (nunca promovido por la extracción: lo decide el RPC).
  marketplace_ready_after_confirmation boolean,
  -- Tiempo CV recibido → confirmación (ms). Permite medir el objetivo de
  -- 1-2 minutos de revisión.
  time_to_confirmation_ms   bigint,
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_cv_extraction_events IS
  'PB-CV-AUTO-PROFILE-001 §16: métricas del funnel CV → perfil confirmado → Marketplace Ready. Append-only, sin PII: contadores, booleanos y enums cerrados únicamente.';

CREATE INDEX IF NOT EXISTS cv_extraction_events_user_idx
  ON public.app_cv_extraction_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cv_extraction_events_type_idx
  ON public.app_cv_extraction_events (event_type, created_at DESC);

-- ─── 3. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.app_cv_extraction_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_cv_extraction_events  ENABLE ROW LEVEL SECURITY;

-- Drafts: el propietario lee su borrador (necesario para la UI de revisión).
DROP POLICY IF EXISTS cv_drafts_select_own ON public.app_cv_extraction_drafts;
CREATE POLICY cv_drafts_select_own ON public.app_cv_extraction_drafts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Drafts: el propietario SOLO puede mover el estado de revisión (y su
-- timestamp). Las columnas de datos quedan fuera del alcance del cliente:
-- el trigger de abajo las congela para roles no privilegiados.
DROP POLICY IF EXISTS cv_drafts_update_review_state_own ON public.app_cv_extraction_drafts;
CREATE POLICY cv_drafts_update_review_state_own ON public.app_cv_extraction_drafts
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Sin INSERT ni DELETE para clientes: creación y purga son service_role
-- (edge functions cv-extract / cv-apply-draft). RLS sin policy = denegado.

-- Eventos: el propietario puede consultar sus métricas; nadie más.
DROP POLICY IF EXISTS cv_extraction_events_select_own ON public.app_cv_extraction_events;
CREATE POLICY cv_extraction_events_select_own ON public.app_cv_extraction_events
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
-- Sin INSERT/UPDATE/DELETE para clientes: append-only service_role.

-- ─── 4. Trigger guard: el owner solo mueve el estado de revisión ────────────
-- Patrón pb_profiles_privilege_guard (migración pb_profile_role_guard_001):
-- el guard normaliza en lugar de abortar cuando el cambio es legítimo, y
-- aborta cuando alguien intenta tocar columnas ajenas a la revisión.

CREATE OR REPLACE FUNCTION public.pb_cv_draft_owner_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_is_service boolean;
BEGIN
  -- Patrón canónico de pb_profiles_privilege_guard: dueños directos de la BD
  -- siempre privilegiados; el service_role llega con claim role=service_role
  -- aunque current_user sea otro (Edge Functions vía PostgREST).
  v_is_service := current_user IN ('postgres', 'supabase_admin', 'service_role');
  IF NOT v_is_service THEN
    v_is_service := COALESCE(
      NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
      ''
    ) = 'service_role';
  END IF;

  -- El backend (service_role) puede mantener la fila completa: reintentos de
  -- extracción y actualización controlada de datos.
  IF v_is_service THEN
    RETURN NEW;
  END IF;

  -- Usuario autenticado (RLS ya garantizó user_id = auth.uid()):
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.cv_sha256 IS DISTINCT FROM OLD.cv_sha256
     OR NEW.source_channel IS DISTINCT FROM OLD.source_channel
     OR NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket
     OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
     OR NEW.file_name IS DISTINCT FROM OLD.file_name
     OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
     OR NEW.file_size IS DISTINCT FROM OLD.file_size
     OR NEW.cv_language IS DISTINCT FROM OLD.cv_language
     OR NEW.extraction_method IS DISTINCT FROM OLD.extraction_method
     OR NEW.extracted_fields IS DISTINCT FROM OLD.extracted_fields
     OR NEW.proposed_experiences IS DISTINCT FROM OLD.proposed_experiences
     OR NEW.proposed_certifications IS DISTINCT FROM OLD.proposed_certifications
     OR NEW.error_code IS DISTINCT FROM OLD.error_code
     OR NEW.attempt_count IS DISTINCT FROM OLD.attempt_count
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'cv_draft_columns_readonly_for_owner'
      USING HINT = 'Only review-state columns (extraction_status, reviewed_at) are user-writable';
  END IF;

  -- Transiciones permitidas para el owner:
  --   pending_review → review_confirmed | dismissed
  --   extraction_failed → dismissed
  -- (el retry de una extracción fallida la reinicia el backend, no el owner)
  IF NOT (
       (OLD.extraction_status = 'pending_review' AND
        NEW.extraction_status IN ('review_confirmed','dismissed'))
    OR (OLD.extraction_status = 'extraction_failed' AND
        NEW.extraction_status = 'dismissed')
    OR (OLD.extraction_status = NEW.extraction_status)
  ) THEN
    RAISE EXCEPTION 'cv_draft_invalid_status_transition: % -> %',
      OLD.extraction_status, NEW.extraction_status;
  END IF;

  NEW.updated_at := now();
  IF NEW.extraction_status IN ('review_confirmed','dismissed')
     AND NEW.extraction_status IS DISTINCT FROM OLD.extraction_status THEN
    NEW.reviewed_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pb_cv_draft_owner_update_guard ON public.app_cv_extraction_drafts;
CREATE TRIGGER pb_cv_draft_owner_update_guard
  BEFORE UPDATE ON public.app_cv_extraction_drafts
  FOR EACH ROW EXECUTE FUNCTION public.pb_cv_draft_owner_update_guard();

REVOKE ALL ON FUNCTION public.pb_cv_draft_owner_update_guard()
  FROM PUBLIC, anon, authenticated;

-- ─── 5. Grants de tabla (mínimos) ────────────────────────────────────────────
-- authenticated: SELECT (RLS filtra por propietario) + UPDATE en drafts
-- (trigger guard congela todo salvo el estado de revisión). events: solo
-- SELECT. anon: nada. service_role hereda acceso completo por bypass de RLS.

REVOKE ALL ON public.app_cv_extraction_drafts FROM anon;
GRANT SELECT, UPDATE ON public.app_cv_extraction_drafts TO authenticated;
REVOKE INSERT, DELETE, TRUNCATE ON public.app_cv_extraction_drafts FROM authenticated;

REVOKE ALL ON public.app_cv_extraction_events FROM anon, authenticated;
GRANT SELECT ON public.app_cv_extraction_events TO authenticated;

-- secuencia de events: solo lectura no la necesita; el INSERT es service_role.
REVOKE ALL ON SEQUENCE public.app_cv_extraction_events_id_seq FROM anon, authenticated;

-- ─── 6. Verificación post-aplicación ─────────────────────────────────────────
-- Ejecutar y esperar exactamente estos resultados (cualquier desviación aborta):
--
--  1) SELECT relname, relrowsecurity FROM pg_class
--     WHERE relname IN ('app_cv_extraction_drafts','app_cv_extraction_events');
--     -> ambas relrowsecurity = true
--
--  2) SELECT polname, polcmd FROM pg_policies
--     WHERE tablename IN ('app_cv_extraction_drafts','app_cv_extraction_events')
--     ORDER BY tablename, polname;
--     -> cv_drafts_select_own (SELECT), cv_drafts_update_review_state_own (UPDATE),
--        cv_extraction_events_select_own (SELECT). Ni INSERT ni DELETE.
--
--  3) SELECT proname, prosecdef FROM pg_proc
--     WHERE proname = 'pb_cv_draft_owner_update_guard';
--     -> prosecdef = false (INVOKER)
--
--  4) Con JWT de usuario A y user_id de usuario B en el filtro:
--     GET /rest/v1/app_cv_extraction_drafts?user_id=eq.<B>
--     -> 200 con body [] (RLS cross-user denegado).
--
--  5) UPDATE de extracted_fields con JWT de usuario:
--     PATCH /rest/v1/app_cv_extraction_drafts?id=eq.<draft propio>
--     body {"extracted_fields": "[]"}
--     -> 403/500 cv_draft_columns_readonly_for_owner (guard).
