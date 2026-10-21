-- ══════════════════════════════════════════════════════════════════════════════
-- PB-CV-EXPERIENCE-DERIVATION-001 — COLUMNAS DE MÉTRICAS + RPC DE LECTURA
-- PARA RECRUITMENT (FASES 5 y 8 del ticket)
--
-- SCOPE:
--   1. Columnas agregadas sin PII en app_cv_extraction_events (FASE 8).
--   2. RPC pb_cv_extraction_status_for_candidate(p_candidate_user_id):
--      lectura ADMIN-ONLY (mismo gate app_is_admin() que el resto de
--      policies admin) de un resumen compacto del draft de CV de un
--      candidato, para el bloque "CV Extraction" de la ficha de
--      recruitment (FASE 5). Devuelve EXCLUSIVAMENTE metadatos agregados:
--      jamás campos extraídos, experiencias, texto del CV ni rutas de
--      storage con nombre de archivo.
--
-- SEGURIDAD:
--   - Las tablas de extracción mantienen RLS con policy owner-only
--     (sql/041): no se toca ninguna policy.
--   - El RPC es SECURITY DEFINER con search_path fijo, exige app_is_admin()
--     y EXECUTE solo para authenticated + service_role (revocado de
--     PUBLIC/anon). Un usuario no-admin no puede leer nada por esta vía;
--     un admin sí, coherente con sus permisos existentes de recruitment.
--   - verify_jwt/siguiente deploy: el frontend llama al RPC con el JWT del
--     usuario autenticado.
--
-- ROLLBACK: docs/PB-CV-EXPERIENCE-DERIVATION-001.md §Rollback.
-- APLICACIÓN: NO aplicar en producción sin GO explícito del PO (QA y
-- producción comparten el proyecto mwdauubztjxkbrefirbg).
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Columnas de métricas agregadas (FASE 8) ──────────────────────────────
ALTER TABLE app_cv_extraction_events
  ADD COLUMN IF NOT EXISTS years_experience_source text,
  ADD COLUMN IF NOT EXISTS experience_intervals_count integer,
  ADD COLUMN IF NOT EXISTS experience_total_months_derived integer,
  ADD COLUMN IF NOT EXISTS experience_explicit_derived_conflict boolean;

ALTER TABLE app_cv_extraction_events
  ADD CONSTRAINT app_cv_extraction_events_years_source_check
  CHECK (years_experience_source IS NULL OR years_experience_source IN ('explicit', 'derived', 'none'))
  NOT VALID;

-- ── 2. RPC de lectura para recruitment (FASE 5) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.pb_cv_extraction_status_for_candidate(
  p_candidate_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_draft record;
  v_years jsonb;
BEGIN
  IF NOT app_is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT d.extraction_status, d.created_at AS processed_at, d.reviewed_at,
         d.error_code,
         d.attempt_count, d.extracted_fields,
         jsonb_array_length(COALESCE(d.extracted_fields, '[]'::jsonb)) AS fields_count,
         jsonb_array_length(COALESCE(d.proposed_experiences, '[]'::jsonb)) AS experiences_count
    INTO v_draft
    FROM app_cv_extraction_drafts d
   WHERE d.user_id = p_candidate_user_id
   ORDER BY d.created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('extraction_status', 'not_processed');
  END IF;

  SELECT f INTO v_years
    FROM jsonb_array_elements(COALESCE(v_draft.extracted_fields, '[]'::jsonb)) AS f
   WHERE f->>'field' = 'years_experience'
   LIMIT 1;

  RETURN jsonb_build_object(
    'extraction_status', v_draft.extraction_status,
    'processed_at', v_draft.processed_at,
    'reviewed_at', v_draft.reviewed_at,
    'error_code', v_draft.error_code,
    'attempt_count', v_draft.attempt_count,
    'fields_count', v_draft.fields_count,
    'experiences_count', v_draft.experiences_count,
    'years_experience_value', CASE WHEN v_years IS NULL THEN NULL ELSE (v_years->>'value')::int END,
    'years_experience_provenance', COALESCE(v_years->>'provenance', 'cv_text'),
    'years_experience_confidence', v_years->>'confidence',
    'years_experience_consistency', v_years->'derivation'->>'consistency'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pb_cv_extraction_status_for_candidate(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pb_cv_extraction_status_for_candidate(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.pb_cv_extraction_status_for_candidate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pb_cv_extraction_status_for_candidate(uuid) TO service_role;

COMMIT;
