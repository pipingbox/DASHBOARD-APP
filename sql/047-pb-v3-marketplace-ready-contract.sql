-- ══════════════════════════════════════════════════════════════════════════════
-- PR-V3-01 / PB-MARKETPLACE-V3-RECRUITMENT-001 TRACK C — Marketplace Ready
-- contrato versionado v3 (ADR-001, aprobado PO 17/10/2026).
--
-- Decisiones del ADR (no renegociar aquí):
--   * v3 es una NUEVA versión de contrato. v1 y v2 NO se modifican: los
--     perfiles legacy siguen evaluándose con su contrato hasta que acepten
--     v3 por la vía del consentimiento protegido (wizard, PR-V3-02).
--   * Requisitos v3: cv, profession, location, availability, consent.
--     Los certificados dejan de ser bloqueo (pasan a calidad/ranking con
--     estados de evidencia, Doc. J §4) y la completitud deja de ser un
--     bloqueo independiente (sigue calculándose para visibilidad/ranking).
--   * Única autoridad: backend. Nuevas funciones *_v3 + despacho por
--     marketplace_contract_version. Frontend/triggers/EFs NUNCA
--     reimplementan la fórmula.
--   * Sin reescritura de historiales: migración aditiva y reversible
--     (rollback = revert; ningún dato se toca).
--
-- Contenido:
--   1. pb_marketplace_minimums_v3 / pb_marketplace_missing_requirements_v3 /
--      pb_marketplace_ready_for_v3 — predicado canónico v3.
--   2. pb_marketplace_missing_requirements_for — despacho por versión del
--      perfil (v2 → función v2, v3 → función v3, resto → v2 histórico).
--      Es el punto de entrada que consumen las Edge Functions de email.
--   3. CHECK marketplace_contract_version: [1,2] → [1,2,3].
--   4. pb_sync_marketplace_ready_state — generalizado: la promoción exige
--      contrato 2 o 3 declarado + consentimiento, y evalúa CADA perfil con
--      el predicado de SU versión. v1 sigue legacy_protected; cualquier
--      otra versión sigue contract_version_required. Auditoría idéntica.
--   5. pb_sync_stale_marketplace_ready — el barrido evalúa v2 con el
--      predicado v2 y v3 con el predicado v3 (sigue sin auto-ejecutarse).
--
-- Seguridad: misma matriz que sql/045 (INVOKER + service_role para sync y
-- sweep; wrapper DEFINER con guard actor=perfil intacto en sql/045).
-- Cero cambios de RLS. Cero DML sobre datos.
-- ══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Predicado canónico v3
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pb_marketplace_minimums_v3(p_user_id uuid)
RETURNS TABLE(
  ok_cv boolean,
  ok_profession boolean,
  ok_location boolean,
  ok_phone boolean,
  ok_availability boolean,
  ok_minimums boolean
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH p AS (
  SELECT * FROM public.app_14da0f1941_profiles WHERE user_id = p_user_id
), ev AS (
  SELECT
    -- CV real y accesible para el propietario (misma verificación que v2:
    -- objeto Storage con owner correcto).
    EXISTS (
      SELECT 1 FROM storage.objects o
      WHERE o.bucket_id = p.cv_storage_bucket
        AND o.name = p.cv_storage_path
        AND o.owner_id = p_user_id::text
    ) AS ok_cv,
    (p.title IS NOT NULL AND btrim(p.title) <> '') AS ok_profession,
    (p.location IS NOT NULL AND btrim(p.location) <> '') AS ok_location,
    public.pb_marketplace_phone_present(p_user_id) AS ok_phone,
    (p.availability_status IS NOT NULL
     AND btrim(p.availability_status) NOT IN ('', 'not_specified', 'unknown')) AS ok_availability
  FROM p
)
SELECT ev.ok_cv, ev.ok_profession, ev.ok_location, ev.ok_phone, ev.ok_availability,
       (ev.ok_cv AND ev.ok_profession AND ev.ok_location AND ev.ok_availability)
FROM ev;
$$;

COMMENT ON FUNCTION public.pb_marketplace_minimums_v3(uuid) IS
  'PR-V3-01: minimos del contrato Marketplace Ready v3 (cv, profession, location, availability). Certificados y completitud NO son bloqueo en v3; phone sigue recomendado.';

CREATE OR REPLACE FUNCTION public.pb_marketplace_missing_requirements_v3(
  p_user_id uuid,
  p_declared_consent boolean
)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_min record;
  v_profile record;
  v_missing text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO v_profile FROM public.app_14da0f1941_profiles WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN ARRAY['profile']::text[];
  END IF;

  SELECT * INTO v_min FROM public.pb_marketplace_minimums_v3(p_user_id);

  IF v_min.ok_cv IS NOT TRUE THEN
    v_missing := array_append(v_missing, 'cv');
  END IF;
  IF v_min.ok_profession IS NOT TRUE THEN
    v_missing := array_append(v_missing, 'profession');
  END IF;
  IF v_min.ok_location IS NOT TRUE THEN
    v_missing := array_append(v_missing, 'location');
  END IF;
  IF v_min.ok_availability IS NOT TRUE THEN
    v_missing := array_append(v_missing, 'availability');
  END IF;
  IF public.pb_marketplace_consent(
    v_profile.profile_visibility, v_profile.cv_visible, p_declared_consent
  ) IS NOT TRUE THEN
    v_missing := array_append(v_missing, 'consent');
  END IF;

  RETURN v_missing;
END $$;

COMMENT ON FUNCTION public.pb_marketplace_missing_requirements_v3(uuid, boolean) IS
  'PR-V3-01: requisitos faltantes del contrato v3 (cv, profession, location, availability, consent).';

CREATE OR REPLACE FUNCTION public.pb_marketplace_ready_for_v3(
  p_user_id uuid,
  p_declared_consent boolean
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT cardinality(public.pb_marketplace_missing_requirements_v3(p_user_id, p_declared_consent)) = 0;
$$;

COMMENT ON FUNCTION public.pb_marketplace_ready_for_v3(uuid, boolean) IS
  'PR-V3-01: predicado booleano del contrato v3.';

-- Misma matriz de permisos que el predicado v2: solo service_role (los
-- consumidores son Edge Functions y el sync canonico; no se exponen al
-- cliente). Las funciones recien creadas heredan EXECUTE a PUBLIC por
-- defecto de PostgreSQL y hay que cerrarlo explicitamente.
REVOKE ALL ON FUNCTION public.pb_marketplace_minimums_v3(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_marketplace_minimums_v3(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pb_marketplace_missing_requirements_v3(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_marketplace_missing_requirements_v3(uuid, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.pb_marketplace_ready_for_v3(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_marketplace_ready_for_v3(uuid, boolean) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Despacho por versión del perfil (punto de entrada de las Edge Functions)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pb_marketplace_missing_requirements_for(
  p_user_id uuid,
  p_declared_consent boolean
)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_version integer;
BEGIN
  SELECT marketplace_contract_version INTO v_version
  FROM public.app_14da0f1941_profiles
  WHERE user_id = p_user_id;

  IF v_version = 3 THEN
    RETURN public.pb_marketplace_missing_requirements_v3(p_user_id, p_declared_consent);
  END IF;

  -- v2, v1 (histórico) y NULL: predicado v2, comportamiento previo a v3.
  RETURN public.pb_marketplace_missing_requirements(p_user_id, p_declared_consent);
END $$;

COMMENT ON FUNCTION public.pb_marketplace_missing_requirements_for(uuid, boolean) IS
  'PR-V3-01: despacha los requisitos faltantes al predicado de la version de contrato declarada por el perfil (v3 -> v3, resto -> v2 historico). Punto de entrada canonico de las Edge Functions de email.';

REVOKE ALL ON FUNCTION public.pb_marketplace_missing_requirements_for(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_marketplace_missing_requirements_for(uuid, boolean) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Contrato versionado: CHECK [1,2] → [1,2,3]
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.app_14da0f1941_profiles
  DROP CONSTRAINT IF EXISTS pb_profiles_contract_version_check;
ALTER TABLE public.app_14da0f1941_profiles
  ADD CONSTRAINT pb_profiles_contract_version_check
  CHECK (marketplace_contract_version = ANY (ARRAY[1, 2, 3]));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Sincronización canónica generalizada (promoción consent-gated por versión)
--
-- PB-RELEASE-002: esta redefinición PRESERVA el gate interno de sql/045. La
-- tabla se reasegura aquí de forma idempotente para que el archivo sea
-- auto-contenido dentro del orden obligatorio 045 → 047.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pb_marketplace_sync_gate (
  gate_key    text PRIMARY KEY,
  gate_value  text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text
);
ALTER TABLE public.pb_marketplace_sync_gate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pb_marketplace_sync_gate FROM anon, authenticated;
INSERT INTO public.pb_marketplace_sync_gate (gate_key, gate_value, updated_by)
VALUES ('sync_mode', 'off', 'pb-release-002-seed')
ON CONFLICT (gate_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.pb_sync_marketplace_ready_state(
  p_user_id  uuid,
  p_batch_id text DEFAULT NULL
)
RETURNS TABLE(out_status text, out_marketplace_ready boolean, out_activated_count integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_profile    record;
  v_completion integer;
  v_pending    integer := 0;
  v_eligible   boolean;
  v_batch      text := coalesce(p_batch_id, 'sync-' || to_char(now(), 'YYYYMMDDHH24MISS'));
BEGIN
  IF p_user_id IS NULL THEN
    RETURN QUERY SELECT 'missing_user_id'::text, NULL::boolean, 0;
    RETURN;
  END IF;

  -- PB-RELEASE-002: gate interno (idéntico a sql/045). Con sync_mode <> 'on'
  -- ningún actor promociona: trigger, wrapper, sweep ni Edge Functions
  -- service_role. Sin locks ni efectos secundarios.
  IF (SELECT gate_value FROM public.pb_marketplace_sync_gate
       WHERE gate_key = 'sync_mode') IS DISTINCT FROM 'on' THEN
    RETURN QUERY SELECT 'sync_gate_closed'::text, FALSE, 0;
    RETURN;
  END IF;

  SELECT user_id, full_name, title, marketplace_ready, onboarding_status,
         profile_completion, marketplace_contract_version, marketplace_consent_declared
    INTO v_profile
  FROM public.app_14da0f1941_profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'profile_not_found'::text, NULL::boolean, 0;
    RETURN;
  END IF;

  IF v_profile.marketplace_ready IS TRUE THEN
    RETURN QUERY SELECT 'already_ready'::text, TRUE, 0;
    RETURN;
  END IF;

  -- Legacy v1: protegido hasta la reconciliación autorizada (sql/037).
  IF v_profile.marketplace_contract_version = 1 THEN
    RETURN QUERY SELECT 'legacy_protected'::text, FALSE, 0;
    RETURN;
  END IF;

  -- PR-V3-01: la promoción exige contrato RECONOCIDO (2 o 3) declarado.
  -- NULL u otra versión bloquean sin efectos secundarios (misma conducta
  -- que el outcome contract_version_required de la revisión P1).
  IF v_profile.marketplace_contract_version NOT IN (2, 3) THEN
    RETURN QUERY SELECT 'contract_version_required'::text, FALSE, 0;
    RETURN;
  END IF;

  -- Consentimiento DECLARADO por el wizard (columna protegida), igual que 045.
  IF v_profile.marketplace_consent_declared IS NOT TRUE THEN
    RETURN QUERY SELECT 'consent_required'::text, FALSE, 0;
    RETURN;
  END IF;

  -- PR-V3-01: cada perfil se evalúa con el predicado de SU contrato.
  IF v_profile.marketplace_contract_version = 3 THEN
    v_eligible := public.pb_marketplace_ready_for_v3(p_user_id, TRUE);
  ELSE
    v_eligible := public.pb_marketplace_ready_for(p_user_id, TRUE);
  END IF;

  IF NOT v_eligible THEN
    RETURN QUERY SELECT 'not_eligible'::text, FALSE, 0;
    RETURN;
  END IF;

  v_completion := public.pb_profile_completion_score(p_user_id);

  SELECT count(*) INTO v_pending
  FROM public.app_14da0f1941_job_applications
  WHERE user_id = p_user_id
    AND status = 'pending_profile_validation';

  UPDATE public.app_14da0f1941_profiles
  SET marketplace_ready  = TRUE,
      onboarding_status  = public.pb_onboarding_status(
                             v_completion, TRUE, v_profile.full_name, v_profile.title
                           ),
      profile_completion = v_completion,
      updated_at         = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.pb_marketplace_ready_reconcile_log (
    batch_id, dry_run, user_id, prev_ready, prev_status, prev_completion,
    prev_contract_version, prev_consent_declared,
    new_ready, new_status, new_completion, class, applied
  ) VALUES (
    v_batch, FALSE, p_user_id, v_profile.marketplace_ready, v_profile.onboarding_status,
    v_profile.profile_completion, v_profile.marketplace_contract_version,
    v_profile.marketplace_consent_declared,
    TRUE,
    public.pb_onboarding_status(v_completion, TRUE, v_profile.full_name, v_profile.title),
    v_completion,
    'stale_sync_promoted', TRUE
  );

  RETURN QUERY SELECT 'promoted'::text, TRUE, v_pending;
END $$;

REVOKE ALL ON FUNCTION public.pb_sync_marketplace_ready_state(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_sync_marketplace_ready_state(uuid, text) TO service_role;

COMMENT ON FUNCTION public.pb_sync_marketplace_ready_state(uuid, text) IS
  'PB-JOBS-MARKETPLACE-READY-RECOVERY-001 + PR-V3-01: promocion canonica consent-gated. Contratos reconocidos 2/3; cada perfil se evalua con el predicado de SU version (v2 -> v2, v3 -> v3). v1 legacy_protected; otras versiones contract_version_required. Nunca degrada.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Barrido idempotente por versión
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pb_sync_stale_marketplace_ready(
  p_batch_id text,
  p_limit    integer DEFAULT 500
)
RETURNS TABLE(
  evaluated        integer,
  promoted         integer,
  already_ready    integer,
  not_eligible     integer,
  legacy_protected integer,
  errors           integer
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  r       record;
  v_res   record;
  v_evaluated integer := 0;
  v_promoted  integer := 0;
  v_already   integer := 0;
  v_not       integer := 0;
  v_legacy    integer := 0;
  v_err       integer := 0;
BEGIN
  IF p_batch_id IS NULL OR p_batch_id !~ '^[a-zA-Z0-9_-]{1,80}$' THEN
    RAISE EXCEPTION 'batch_id explicito requerido';
  END IF;

  -- PR-V3-01: perfiles stale elegibles con CUALQUIER contrato reconocido,
  -- cada uno evaluado con SU predicado. v1 queda fuera (legacy_protected).
  FOR r IN
    SELECT p.user_id
    FROM public.app_14da0f1941_profiles p
    WHERE p.marketplace_ready IS NOT TRUE
      AND p.marketplace_contract_version IN (2, 3)
      AND p.marketplace_consent_declared IS TRUE
      AND (
        (p.marketplace_contract_version = 2 AND public.pb_marketplace_ready_for(p.user_id, TRUE))
        OR
        (p.marketplace_contract_version = 3 AND public.pb_marketplace_ready_for_v3(p.user_id, TRUE))
      )
    ORDER BY p.created_at
    LIMIT GREATEST(COALESCE(p_limit, 500), 1)
  LOOP
    v_evaluated := v_evaluated + 1;
    BEGIN
      SELECT * INTO v_res FROM public.pb_sync_marketplace_ready_state(r.user_id, p_batch_id);
      IF v_res.out_status = 'promoted' THEN        v_promoted := v_promoted + 1;
      ELSIF v_res.out_status = 'already_ready' THEN v_already  := v_already + 1;
      ELSIF v_res.out_status = 'legacy_protected' THEN v_legacy := v_legacy + 1;
      ELSE                                      v_not      := v_not + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_err := v_err + 1;
    END;
  END LOOP;

  RETURN QUERY SELECT v_evaluated, v_promoted, v_already, v_not, v_legacy, v_err;
END $$;

REVOKE ALL ON FUNCTION public.pb_sync_stale_marketplace_ready(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_sync_stale_marketplace_ready(text, integer) TO service_role;

COMMENT ON FUNCTION public.pb_sync_stale_marketplace_ready(text, integer) IS
  'PB-JOBS-MARKETPLACE-READY-RECOVERY-001 + PR-V3-01: barrido idempotente de perfiles stale por contrato (v2 con predicado v2, v3 con predicado v3). Requiere invocacion service_role con batch explicito. No envia emails.';
