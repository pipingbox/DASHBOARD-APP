-- ══════════════════════════════════════════════════════════════════════════════
-- PB-CERT-AUTO-PROFILE-001 — CERTIFICADO → AUTO PROFILE (DRAFT FIRST)
--
-- Modelo de datos para la extracción de datos a partir del documento de un
-- certificado (PDF con texto nativo en fase 1; imagen/scan = fallback manual
-- honesto, sin OCR todavía — propuesta separada sujeta a aprobación).
--
-- PRINCIPIOS DEL TICKET (no renegociables):
--   1. DRAFT FIRST: la extracción NUNCA escribe directamente en
--      app_worker_certifications. Todo lo extraído vive en
--      app_cert_extraction_drafts (pending_review) hasta la confirmación del
--      usuario vía la Edge Function cert-apply-draft.
--   2. Declared/unverified SIEMPRE: esta feature jamás escribe is_verified ni
--      verified_at. La extracción no acredita autenticidad ni concede
--      Marketplace Ready. El circuito canónico de verificación queda intacto:
--      aplicar un draft a un registro existente NO altera su estado de
--      verificación en ningún sentido.
--   3. Vinculación sin duplicados: completar una certificación ya declarada
--      (p. ej. desde el CV) actualiza ESA fila; el matching ambiguo jamás se
--      resuelve fusionando automáticamente — el usuario elige.
--   4. Idempotencia: mismo documento (sha256 del binario + usuario) ⇒ un solo
--      draft. UNIQUE (user_id, doc_sha256). Retry de extraction_failed
--      incrementa attempt_count sin crear filas.
--   5. Sin PII en logs: app_cert_extraction_events solo almacena contadores,
--      booleanos y enums cerrados — nunca contenido del documento.
--
-- MODELO DE AMENAZAS / SEGURIDAD (patrón sql/041):
--   * RLS en ambas tablas. Nunca se desactiva.
--   * app_cert_extraction_drafts:
--       - SELECT  → solo el propietario.
--       - UPDATE  → solo el propietario Y SOLO las columnas de revisión
--                   (extraction_status, reviewed_at, updated_at,
--                   linked_certification_id), con transiciones válidas,
--                   impuestas por el trigger pb_cert_draft_owner_update_guard.
--       - INSERT/DELETE → sin policy para clientes: solo service_role.
--   * app_cert_extraction_events: SELECT solo propietario; append service_role.
--   * Función guard SECURITY INVOKER con search_path fijado; sin EXECUTE
--     público; grants mínimos; autorización nunca deriva de user_metadata.
--
-- IMPACTO EN ENTORNO COMPARTIDO (QA y producción comparten proyecto):
--   Esta migración SOLO crea objetos nuevos. No modifica tablas, políticas,
--   funciones ni datos existentes. Nada invoca las nuevas Edge Functions
--   hasta que el frontend correspondiente se despliegue.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS pb_cert_draft_owner_update_guard ON app_cert_extraction_drafts;
--   DROP FUNCTION IF EXISTS public.pb_cert_draft_owner_update_guard();
--   DROP TABLE IF EXISTS app_cert_extraction_events;
--   DROP TABLE IF EXISTS app_cert_extraction_drafts;
--   (Ningún dato canónico depende de estas tablas: las certificaciones viven
--   en app_worker_certifications y los binarios en Storage. El rollback no
--   pierde documentos.)
--
-- APLICACIÓN: conforme al protocolo SQL. Idempotente (IF NOT EXISTS +
-- CREATE OR REPLACE + DROP IF EXISTS antes de CREATE para el trigger).
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── 1. app_cert_extraction_drafts ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.app_cert_extraction_drafts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Propietario del draft (el documento vive en SU namespace de Storage).
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Idempotencia: hash SHA-256 del binario del documento.
  doc_sha256           text NOT NULL CHECK (length(doc_sha256) = 64),
  -- Documento fuente ya subido por el flujo existente de CertificationDialog
  -- (bucket app_14da0f1941_certificates, namespace {user_id}/).
  storage_bucket       text NOT NULL,
  storage_path         text NOT NULL,
  file_name            text NOT NULL,
  mime_type            text,
  -- Método de extracción: texto nativo PDF o no disponible (imagen/scan →
  -- fallback manual honesto; fase 1 sin OCR).
  extraction_method    text CHECK (extraction_method IN
                       ('native_text', 'unavailable')),
  -- Ciclo de vida (mismo contrato que los drafts de CV):
  --   pending_review / review_confirmed / dismissed /
  --   extraction_failed (documento conservado; retry seguro) / superseded.
  extraction_status    text NOT NULL DEFAULT 'pending_review'
                       CHECK (extraction_status IN
                       ('pending_review','review_confirmed','dismissed','extraction_failed','superseded')),
  -- Cada elemento: { field: 'certification_name'|'issuing_organization'|
  -- 'credential_id'|'issue_date'|'expiry_date', value,
  -- source: 'certificate_document', confidence: 'high'|'medium'|'low',
  -- extracted_at, source_document_id }. Solo campos presentes explícitamente.
  extracted_fields     jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Vínculo a una certificación ya existente del propio usuario (declarada
  -- desde el CV o creada manualmente sin documento). Lo propone el backend
  -- solo cuando el match es inequívoco (una única candidata por nombre
  -- normalizado); la confirmación final siempre es del usuario.
  linked_certification_id uuid REFERENCES public.app_worker_certifications(id)
                       ON DELETE SET NULL,
  -- Código de error cerrado cuando extraction_status = 'extraction_failed'.
  error_code           text CHECK (error_code IS NULL OR error_code IN
                       ('no_extractable_text','unsupported_mime',
                        'text_extraction_error','engine_error','storage_read_error')),
  attempt_count        integer NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  reviewed_at          timestamptz,
  -- Un solo draft por (usuario, hash de documento).
  CONSTRAINT cert_extraction_drafts_user_hash_unique UNIQUE (user_id, doc_sha256)
);

COMMENT ON TABLE public.app_cert_extraction_drafts IS
  'PB-CERT-AUTO-PROFILE-001: borrador de extracción de certificado. DRAFT FIRST — nunca escribe app_worker_certifications directamente; el usuario revisa y confirma. Jamás toca is_verified/verified_at.';

CREATE INDEX IF NOT EXISTS cert_extraction_drafts_user_status_idx
  ON public.app_cert_extraction_drafts (user_id, extraction_status, created_at DESC);

-- ─── 2. app_cert_extraction_events (métricas sin PII) ────────────────────────

CREATE TABLE IF NOT EXISTS public.app_cert_extraction_events (
  id                bigserial PRIMARY KEY,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  draft_id          uuid REFERENCES public.app_cert_extraction_drafts(id) ON DELETE SET NULL,
  event_type        text NOT NULL CHECK (event_type IN
                    ('cert_extraction_started',
                     'cert_extraction_completed',
                     'cert_extraction_failed',
                     'cert_extraction_retried',
                     'cert_already_processed',
                     'cert_review_confirmed')),
  -- Contadores agregados, nunca contenido del documento.
  fields_extracted_count    integer,
  fields_confirmed_count    integer,
  -- true si el apply actualizó una certificación existente (vinculación);
  -- false si creó una nueva.
  linked_existing           boolean,
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_cert_extraction_events IS
  'PB-CERT-AUTO-PROFILE-001: métricas del funnel certificado → datos confirmados. Append-only, sin PII: contadores, booleanos y enums cerrados únicamente.';

CREATE INDEX IF NOT EXISTS cert_extraction_events_user_idx
  ON public.app_cert_extraction_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cert_extraction_events_type_idx
  ON public.app_cert_extraction_events (event_type, created_at DESC);

-- ─── 3. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.app_cert_extraction_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_cert_extraction_events  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cert_drafts_select_own ON public.app_cert_extraction_drafts;
CREATE POLICY cert_drafts_select_own ON public.app_cert_extraction_drafts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS cert_drafts_update_review_state_own ON public.app_cert_extraction_drafts;
CREATE POLICY cert_drafts_update_review_state_own ON public.app_cert_extraction_drafts
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Sin INSERT ni DELETE para clientes: creación y purga son service_role
-- (edge functions cert-extract / cert-apply-draft). RLS sin policy = denegado.

DROP POLICY IF EXISTS cert_extraction_events_select_own ON public.app_cert_extraction_events;
CREATE POLICY cert_extraction_events_select_own ON public.app_cert_extraction_events
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
-- Sin INSERT/UPDATE/DELETE para clientes: append-only service_role.

-- ─── 4. Trigger guard: el owner solo mueve el estado de revisión ────────────
-- Patrón pb_cv_draft_owner_update_guard (sql/041), que a su vez sigue
-- pb_profiles_privilege_guard.

CREATE OR REPLACE FUNCTION public.pb_cert_draft_owner_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_is_service boolean;
BEGIN
  v_is_service := current_user IN ('postgres', 'supabase_admin', 'service_role');
  IF NOT v_is_service THEN
    v_is_service := COALESCE(
      NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
      ''
    ) = 'service_role';
  END IF;

  -- El backend (service_role) puede mantener la fila completa: reintentos de
  -- extracción y actualización controlada.
  IF v_is_service THEN
    RETURN NEW;
  END IF;

  -- Usuario autenticado (RLS ya garantizó user_id = auth.uid()):
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.doc_sha256 IS DISTINCT FROM OLD.doc_sha256
     OR NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket
     OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
     OR NEW.file_name IS DISTINCT FROM OLD.file_name
     OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
     OR NEW.extraction_method IS DISTINCT FROM OLD.extraction_method
     OR NEW.extracted_fields IS DISTINCT FROM OLD.extracted_fields
     OR NEW.error_code IS DISTINCT FROM OLD.error_code
     OR NEW.attempt_count IS DISTINCT FROM OLD.attempt_count
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'cert_draft_columns_readonly_for_owner'
      USING HINT = 'Only review-state columns (extraction_status, reviewed_at, linked_certification_id) are user-writable';
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
    RAISE EXCEPTION 'cert_draft_invalid_status_transition: % -> %',
      OLD.extraction_status, NEW.extraction_status;
  END IF;

  NEW.updated_at := now();
  IF NEW.extraction_status IN ('review_confirmed','dismissed')
     AND NEW.extraction_status IS DISTINCT FROM OLD.extraction_status THEN
    NEW.reviewed_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pb_cert_draft_owner_update_guard ON public.app_cert_extraction_drafts;
CREATE TRIGGER pb_cert_draft_owner_update_guard
  BEFORE UPDATE ON public.app_cert_extraction_drafts
  FOR EACH ROW EXECUTE FUNCTION public.pb_cert_draft_owner_update_guard();

REVOKE ALL ON FUNCTION public.pb_cert_draft_owner_update_guard()
  FROM PUBLIC, anon, authenticated;

-- ─── 5. Grants de tabla (mínimos) ────────────────────────────────────────────
-- service_role: explícito (lección de sql/042 — los default privileges no
-- aplican vía Management API; las Edge Functions escriben vía PostgREST con
-- la service key).

REVOKE ALL ON public.app_cert_extraction_drafts FROM anon;
GRANT SELECT, UPDATE ON public.app_cert_extraction_drafts TO authenticated;
REVOKE INSERT, DELETE, TRUNCATE ON public.app_cert_extraction_drafts FROM authenticated;

REVOKE ALL ON public.app_cert_extraction_events FROM anon, authenticated;
GRANT SELECT ON public.app_cert_extraction_events TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.app_cert_extraction_drafts TO service_role;
GRANT SELECT, INSERT ON public.app_cert_extraction_events TO service_role;

REVOKE ALL ON SEQUENCE public.app_cert_extraction_events_id_seq FROM anon, authenticated;
GRANT USAGE ON SEQUENCE public.app_cert_extraction_events_id_seq TO service_role;

-- ─── 6. Verificación post-aplicación ─────────────────────────────────────────
-- Ejecutar y esperar exactamente estos resultados (cualquier desviación aborta):
--
--  1) SELECT relname, relrowsecurity FROM pg_class
--     WHERE relname IN ('app_cert_extraction_drafts','app_cert_extraction_events');
--     -> ambas relrowsecurity = true
--
--  2) SELECT polname, polcmd FROM pg_policies
--     WHERE tablename IN ('app_cert_extraction_drafts','app_cert_extraction_events')
--     ORDER BY tablename, polname;
--     -> cert_drafts_select_own (SELECT), cert_drafts_update_review_state_own (UPDATE),
--        cert_extraction_events_select_own (SELECT). Ni INSERT ni DELETE.
--
--  3) SELECT proname, prosecdef FROM pg_proc
--     WHERE proname = 'pb_cert_draft_owner_update_guard';
--     -> prosecdef = false (INVOKER)
--
--  4) Con JWT de usuario A y user_id de usuario B en el filtro:
--     GET /rest/v1/app_cert_extraction_drafts?user_id=eq.<B>
--     -> 200 con body [] (RLS cross-user denegado).
--
--  5) UPDATE de extracted_fields con JWT de usuario:
--     PATCH /rest/v1/app_cert_extraction_drafts?id=eq.<draft propio>
--     body {"extracted_fields": "[]"}
--     -> 403/500 cert_draft_columns_readonly_for_owner (guard).
--
--  6) Regresión: las tablas existentes no se tocan.
--     SELECT count(*) FROM pg_policies WHERE tablename = 'app_worker_certifications';
--     -> idéntico al valor previo a la migración.
