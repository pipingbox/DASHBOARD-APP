-- =============================================================================
-- PB-PROFILE-COMPLETION-RECONCILIATION-001 — FASE 4: DRY-RUN READ-ONLY
-- =============================================================================
-- 100% SELECT. NADA de DML. Ejecutar con supabase_read_only_user o service_role
-- en sesión de solo lectura. Produce el preview que debe aprobar el PO antes
-- de la reconciliación histórica (que se ejecutará, tras GO, como
--   SELECT public.pb_recalculate_profile_state(NULL, 500)
-- en bucle por lotes con service_role, previo backup lógico:
--   SELECT user_id, profile_completion, onboarding_status, marketplace_ready
--   FROM public.app_14da0f1941_profiles ORDER BY user_id;
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PREVIEW POR PERFIL — réplica exacta de la fórmula canónica (12 pesos).
--    Nota: pb_profile_completion_score tiene EXECUTE solo para service_role;
--    esta réplica permite el dry-run con el rol read-only. Si el rol lo
--    permite, puede sustituirse por la llamada directa a la función.
-- ─────────────────────────────────────────────────────────────────────────────
WITH audit AS (
  SELECT
    p.user_id,
    p.full_name,
    p.profile_completion AS stored_score,
    (
      (CASE WHEN p.avatar_url IS NOT NULL AND btrim(p.avatar_url) <> '' THEN 10 ELSE 0 END) +
      (CASE WHEN p.full_name  IS NOT NULL AND btrim(p.full_name)  <> '' THEN 5  ELSE 0 END) +
      (CASE WHEN p.title      IS NOT NULL AND btrim(p.title)      <> '' THEN 5  ELSE 0 END) +
      (CASE WHEN p.company    IS NOT NULL AND btrim(p.company)    <> '' THEN 5  ELSE 0 END) +
      (CASE WHEN p.location   IS NOT NULL AND btrim(p.location)   <> '' THEN 5  ELSE 0 END) +
      (CASE WHEN p.years_experience IS NOT NULL AND p.years_experience > 0 THEN 5 ELSE 0 END) +
      (CASE WHEN p.skills IS NOT NULL AND array_length(p.skills, 1) > 0 THEN 10 ELSE 0 END) +
      (CASE WHEN p.bio IS NOT NULL AND length(btrim(p.bio)) > 10 THEN 10 ELSE 0 END) +
      (CASE WHEN (p.cv_storage_bucket IS NOT NULL AND p.cv_storage_path IS NOT NULL)
              OR p.cv_file_url IS NOT NULL
              OR p.cv_url IS NOT NULL THEN 15 ELSE 0 END) +
      (CASE WHEN EXISTS (SELECT 1 FROM public.app_worker_experiences    e WHERE e.user_id = p.user_id) THEN 15 ELSE 0 END) +
      (CASE WHEN EXISTS (SELECT 1 FROM public.app_worker_certifications c WHERE c.user_id = p.user_id) THEN 10 ELSE 0 END) +
      (CASE WHEN EXISTS (SELECT 1 FROM public.app_worker_documents      d WHERE d.user_id = p.user_id) THEN 5  ELSE 0 END)
    ) AS computed_score,
    p.onboarding_status AS old_status,
    p.marketplace_ready AS old_ready,
    -- Semántica del RPC: mantiene o degrada; NUNCA promueve.
    (p.marketplace_ready IS TRUE
      AND p.profile_visibility = 'public'
      AND p.cv_visible IS TRUE) AS consent_columns_ok
  FROM public.app_14da0f1941_profiles p
)
SELECT
  user_id,
  full_name,
  stored_score  AS old_completion,
  computed_score AS new_completion,
  computed_score - stored_score AS delta,
  old_status,
  CASE
    WHEN (old_ready AND consent_columns_ok AND computed_score >= 30) THEN 'MARKETPLACE_READY'
    WHEN computed_score >= 30 AND full_name IS NOT NULL AND btrim(COALESCE(full_name,'')) <> '' THEN 'PROFILE_COMPLETED'
    WHEN computed_score > 0 THEN 'PROFILE_STARTED'
    ELSE 'AUTH_ONLY'
  END AS new_status_replica,
  old_ready,
  (old_ready AND consent_columns_ok AND computed_score >= 30) AS new_ready,
  CASE
    WHEN old_ready IS TRUE AND NOT (old_ready AND consent_columns_ok AND computed_score >= 30)
      THEN 'DEGRADE_READY'
    WHEN computed_score - stored_score > 0 THEN 'SCORE_UP'
    WHEN computed_score - stored_score < 0 THEN 'SCORE_DOWN'
    ELSE 'STATUS_ONLY_OR_NONE'
  END AS change_class
FROM audit
WHERE stored_score IS DISTINCT FROM computed_score
ORDER BY ABS(computed_score - stored_score) DESC, user_id;
-- PO CHECK: la columna change_class NO debe contener 'DEGRADE_READY' (0 filas)
-- y new_ready debe ser FALSE siempre que old_ready sea FALSE (0 promociones).

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CONTEOS RESUMEN DEL DRY-RUN
-- ─────────────────────────────────────────────────────────────────────────────
WITH audit AS (
  SELECT
    p.user_id,
    p.profile_completion AS s,
    (
      (CASE WHEN p.avatar_url IS NOT NULL AND btrim(p.avatar_url) <> '' THEN 10 ELSE 0 END) +
      (CASE WHEN p.full_name  IS NOT NULL AND btrim(p.full_name)  <> '' THEN 5  ELSE 0 END) +
      (CASE WHEN p.title      IS NOT NULL AND btrim(p.title)      <> '' THEN 5  ELSE 0 END) +
      (CASE WHEN p.company    IS NOT NULL AND btrim(p.company)    <> '' THEN 5  ELSE 0 END) +
      (CASE WHEN p.location   IS NOT NULL AND btrim(p.location)   <> '' THEN 5  ELSE 0 END) +
      (CASE WHEN p.years_experience IS NOT NULL AND p.years_experience > 0 THEN 5 ELSE 0 END) +
      (CASE WHEN p.skills IS NOT NULL AND array_length(p.skills, 1) > 0 THEN 10 ELSE 0 END) +
      (CASE WHEN p.bio IS NOT NULL AND length(btrim(p.bio)) > 10 THEN 10 ELSE 0 END) +
      (CASE WHEN (p.cv_storage_bucket IS NOT NULL AND p.cv_storage_path IS NOT NULL)
              OR p.cv_file_url IS NOT NULL
              OR p.cv_url IS NOT NULL THEN 15 ELSE 0 END) +
      (CASE WHEN EXISTS (SELECT 1 FROM public.app_worker_experiences    e WHERE e.user_id = p.user_id) THEN 15 ELSE 0 END) +
      (CASE WHEN EXISTS (SELECT 1 FROM public.app_worker_certifications c WHERE c.user_id = p.user_id) THEN 10 ELSE 0 END) +
      (CASE WHEN EXISTS (SELECT 1 FROM public.app_worker_documents      d WHERE d.user_id = p.user_id) THEN 5  ELSE 0 END)
    ) AS c,
    p.marketplace_ready AS r,
    p.profile_visibility, p.cv_visible
  FROM public.app_14da0f1941_profiles p
)
SELECT
  count(*)                                                        AS total_profiles,
  count(*) FILTER (WHERE s IS DISTINCT FROM c)                    AS rows_touched,
  count(*) FILTER (WHERE c > s)                                   AS score_up,
  count(*) FILTER (WHERE c < s)                                   AS score_down,
  count(*) FILTER (WHERE s < 30 AND c >= 30)                      AS cross_threshold_up,
  count(*) FILTER (WHERE r IS TRUE AND NOT (r AND profile_visibility = 'public' AND cv_visible IS TRUE AND c >= 30))
                                                                  AS ready_degraded,
  count(*) FILTER (WHERE r IS NOT TRUE AND (r AND profile_visibility = 'public' AND cv_visible IS TRUE AND c >= 30))
                                                                  AS ready_promoted  -- exigir 0
FROM audit;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CV HUÉRFANOS — objetos cv-* en storage no referenciados por ningún perfil
--    (candidatos al adaptador puntual; NO migrar automáticamente).
-- ─────────────────────────────────────────────────────────────────────────────
SELECT o.bucket_id, o.name, o.owner_id, o.created_at
FROM storage.objects o
WHERE o.name LIKE '%/cv-%'
  AND NOT EXISTS (
    SELECT 1 FROM public.app_14da0f1941_profiles p
    WHERE p.cv_storage_bucket = o.bucket_id AND p.cv_storage_path = o.name
  )
ORDER BY o.created_at DESC;
