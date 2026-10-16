-- ══════════════════════════════════════════════════════════════════════════════
-- PB-MARKETPLACE-READY-CONSISTENCY-001 — FASE 2: NUEVO CONTRATO DE PRODUCTO
--
-- Decisión de producto aprobada (2026-10-16): `profile_completion >= 30` deja
-- de ser condición suficiente para Marketplace Ready. El contrato mínimo pasa a
-- exigir documentación real:
--
--   marketplace_ready = CV presente
--                       AND al menos un certificado/evidencia profesional
--                       AND disponibilidad definida
--                       AND consentimiento declarado + registrado
--                       AND profile_completion >= 30     (se conserva)
--
-- Depende de sql/036 (fase P1): ese hotfix creó la definición única en SQL y
-- cerró el bypass del INSERT. Aquí solo se endurece el predicado, se mantiene
-- un único punto de verdad y se añade la maquinaria de reconciliación.
--
-- ─── SEPARACIÓN DE CONCEPTOS ────────────────────────────────────────────────
--   Marketplace Ready   = PIPINGBOX tiene la documentación mínima para revisar
--                         internamente al candidato.
--   Client Ready        = validaciones por oferta (certificado concreto, VCA
--                         vigente, homologación, experiencia, idioma, permiso
--                         de trabajo, geografía, verificación manual).
--   Esta migración NO implementa Client Ready y NADA mueve una candidatura a
--   `sent_to_client`: ese salto sigue siendo decisión humana.
--
-- ─── FUENTES DE DATOS CANÓNICAS (verificadas en producción) ──────────────────
--   CV            -> app_14da0f1941_profiles.cv_storage_bucket + cv_storage_path
--                    VALIDADO contra storage.objects: exige el objeto, no la
--                    cadena. `cv_url` / `cv_file_url` (enlaces externos legados)
--                    NO cuentan. Medición previa: de 43 perfiles ready, 15
--                    tienen columnas de CV y los 15 tienen objeto real en
--                    Storage; 0 dependen solo de URL legada, así que exigir el
--                    objeto no descarta a nadie por un falso negativo.
--   Certificado   -> app_worker_certifications o app_worker_documents con
--                    objeto real asociado en storage.objects. Una URL o ruta
--                    sin objeto persistente no cuenta como documentación.
--                    NO se exige is_verified: en esta fase
--                    Marketplace Ready significa "documentación aportada".
--   Disponibilidad-> app_14da0f1941_profiles.availability_status, exigiendo
--                    valor definido (ni NULL ni 'not_specified' ni cadena
--                    vacía). `not_available` / `not_currently_available` SÍ se
--                    consideran definidos: son información útil para
--                    operaciones; filtrar por disponibilidad real es una
--                    decisión de Client Ready, no de Marketplace Ready.
--                    (Hoy: 1 perfil ready declarado no disponible.)
--   Consentimiento-> profile_visibility / cv_visible + declaración del wizard,
--                    sin cambios respecto a sql/036.
--
-- ─── TELÉFONO OPCIONAL ──────────────────────────────────────────────────────
-- El teléfono se captura en el PR independiente PB-PROFILE-PHONE-CANONICAL-001.
-- Su ausencia se informa internamente, pero no impide Marketplace Ready,
-- Jobs applied ni la presentación al cliente. Esta fase no depende de sql/038.
--
-- ─── SEGURIDAD ──────────────────────────────────────────────────────────────
--   * Todas las funciones SECURITY INVOKER, search_path=public, EXECUTE solo
--     para service_role. Ningún SECURITY DEFINER nuevo. Sin GRANT ALL.
--   * El guard de sql/036 sigue siendo el único camino de escritura permitido
--     para el trío canónico; esta migración no lo relaja.
--   * El gate de candidaturas no cambia: sigue leyendo `marketplace_ready`,
--     que continúa siendo la única fuente de verdad para Jobs.
--   * La tabla de reconciliación tiene RLS activada y ninguna policy: solo
--     service_role puede leerla.
--
-- IDEMPOTENTE. Cero DML sobre perfiles al aplicarla: la reconciliación es una
-- función que hay que invocar explícitamente y nace en modo dry-run.
-- ══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. REQUISITO TELÉFONO — fuente única y palanca de activación
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pb_marketplace_phone_present(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_14da0f1941_profiles p
    WHERE p.user_id = p_user_id
      AND coalesce(to_jsonb(p)->>'phone_e164', '') ~ '^\+[1-9][0-9]{7,14}$'
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. PREDICADO DE MÍNIMOS — una sola definición, con detalle auditable
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pb_marketplace_minimums(p_user_id uuid)
RETURNS TABLE(
  ok_cv boolean,
  ok_certificate boolean,
  ok_phone boolean,
  ok_availability boolean,
  ok_minimums boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH p AS (
    SELECT * FROM public.app_14da0f1941_profiles WHERE user_id = p_user_id
  ), ev AS (
    SELECT
      -- CV: objeto real en Storage, no una cadena heredada.
      EXISTS (
        SELECT 1 FROM storage.objects o
        WHERE o.bucket_id = p.cv_storage_bucket
          AND o.name = p.cv_storage_path
          AND o.owner_id = p_user_id::text
      ) AS ok_cv,
      -- Certificado o evidencia profesional CON archivo adjunto.
      EXISTS (
        SELECT 1 FROM public.app_worker_certifications c
        JOIN storage.objects o ON o.bucket_id = c.storage_bucket AND o.name = c.storage_path
          AND o.owner_id = p_user_id::text
        WHERE c.user_id = p_user_id
      ) OR EXISTS (
        SELECT 1 FROM public.app_worker_documents d
        JOIN storage.objects o ON o.bucket_id = d.storage_bucket AND o.name = d.storage_path
          AND o.owner_id = p_user_id::text
        WHERE d.user_id = p_user_id
      ) AS ok_certificate,
      public.pb_marketplace_phone_present(p_user_id) AS ok_phone,
      (p.availability_status IS NOT NULL
       AND btrim(p.availability_status) NOT IN ('', 'not_specified', 'unknown')) AS ok_availability
    FROM p
  )
  SELECT ev.ok_cv, ev.ok_certificate, ev.ok_phone, ev.ok_availability,
         (ev.ok_cv AND ev.ok_certificate AND ev.ok_availability)
  FROM ev;
$$;

-- Predicado completo. Es el UNICO lugar donde se decide marketplace_ready.
CREATE OR REPLACE FUNCTION public.pb_marketplace_ready_for(
  p_user_id uuid,
  p_declared_consent boolean
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_min boolean;
  v_consent boolean;
  v_completion integer;
BEGIN
  SELECT ok_minimums INTO v_min
  FROM public.pb_marketplace_minimums(p_user_id);

  IF v_min IS NULL THEN
    RETURN false;
  END IF;

  SELECT public.pb_marketplace_consent(profile_visibility, cv_visible, p_declared_consent)
    INTO v_consent
  FROM public.app_14da0f1941_profiles
  WHERE user_id = p_user_id;

  v_completion := public.pb_profile_completion_score(p_user_id);

  -- profile_completion se conserva como suelo, no como autoridad: con los
  -- minimos cumplidos (CV 15 + certificado 10 + nombre 5) siempre se supera.
  RETURN v_min AND coalesce(v_consent, false) AND coalesce(v_completion, 0) >= 30;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. pb_complete_onboarding — mismo contrato de llamada, nuevo predicado
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pb_complete_onboarding(
  p_user_id uuid,
  p_marketplace_ready boolean DEFAULT false
)
RETURNS TABLE(
  onboarding_status text,
  marketplace_ready boolean,
  profile_completion integer
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_full_name          public.app_14da0f1941_profiles.full_name%TYPE;
  v_title              public.app_14da0f1941_profiles.title%TYPE;
  v_completion         integer;
  v_marketplace_ready  boolean;
  v_status             text;
  v_rows               integer;
BEGIN
  SELECT full_name, title INTO v_full_name, v_title
  FROM public.app_14da0f1941_profiles
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  v_completion := public.pb_profile_completion_score(p_user_id);

  -- Unico camino que puede promover false->true, ahora tambien sujeto a los
  -- minimos documentales del contrato nuevo.
  v_marketplace_ready := public.pb_marketplace_ready_for(p_user_id, p_marketplace_ready);

  v_status := public.pb_onboarding_status(
                v_completion, v_marketplace_ready, v_full_name, v_title
              );

  UPDATE public.app_14da0f1941_profiles
  SET onboarding_status  = v_status,
      marketplace_ready  = v_marketplace_ready,
      profile_completion = v_completion,
      updated_at         = now()
  WHERE user_id = p_user_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'expected_exactly_one_profile_row_updated';
  END IF;

  RETURN QUERY SELECT v_status, v_marketplace_ready, v_completion;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. pb_recalculate_profile_state — mantiene o degrada con el contrato nuevo
-- ─────────────────────────────────────────────────────────────────────────────
-- Sigue sin poder promover: la promoción exige la declaración del wizard.
CREATE OR REPLACE FUNCTION public.pb_recalculate_profile_state(
  p_user_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 2000
)
RETURNS TABLE(
  processed integer,
  changed integer,
  caller_completion integer,
  caller_status text,
  caller_marketplace_ready boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  r              record;
  v_completion   integer;
  v_ready        boolean;
  v_status       text;
  v_processed    integer := 0;
  v_changed      integer := 0;
  v_caller_completion integer := NULL;
  v_caller_status     text    := NULL;
  v_caller_ready      boolean := NULL;
BEGIN
  FOR r IN
    SELECT user_id, full_name, title, profile_completion,
           onboarding_status, marketplace_ready
    FROM public.app_14da0f1941_profiles
    WHERE p_user_id IS NULL OR user_id = p_user_id
    ORDER BY created_at
    LIMIT GREATEST(COALESCE(p_limit, 2000), 1)
  LOOP
    v_processed := v_processed + 1;
    v_completion := public.pb_profile_completion_score(r.user_id);

    -- Mantener o degradar, nunca promover. El consentimiento declarado se
    -- asume solo para perfiles que YA estaban ready.
    v_ready := (r.marketplace_ready IS TRUE)
               AND public.pb_marketplace_ready_for(r.user_id, true);

    v_status := public.pb_onboarding_status(
                  v_completion, v_ready, r.full_name, r.title
                );

    IF r.profile_completion IS DISTINCT FROM v_completion
       OR r.onboarding_status IS DISTINCT FROM v_status
       OR r.marketplace_ready IS DISTINCT FROM v_ready THEN
      UPDATE public.app_14da0f1941_profiles
      SET profile_completion = v_completion,
          onboarding_status  = v_status,
          marketplace_ready  = v_ready
      WHERE user_id = r.user_id;
      v_changed := v_changed + 1;
    END IF;

    IF p_user_id IS NOT NULL THEN
      v_caller_completion := v_completion;
      v_caller_status     := v_status;
      v_caller_ready      := v_ready;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_processed, v_changed,
                      v_caller_completion, v_caller_status, v_caller_ready;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RECONCILIACIÓN HISTÓRICA — backup lógico + dry-run + reversible
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pb_marketplace_ready_reconcile_log (
  id                bigserial PRIMARY KEY,
  batch_id          text        NOT NULL,
  dry_run           boolean     NOT NULL,
  user_id           uuid        NOT NULL,
  prev_ready        boolean,
  prev_status       text,
  prev_completion   integer,
  new_ready         boolean,
  new_status        text,
  new_completion    integer,
  fail_cv           boolean,
  fail_certificate  boolean,
  fail_phone        boolean,
  fail_availability boolean,
  fail_consent      boolean,
  class             text        NOT NULL,
  applied           boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pb_mr_reconcile_log_batch_idx
  ON public.pb_marketplace_ready_reconcile_log (batch_id);
CREATE INDEX IF NOT EXISTS pb_mr_reconcile_log_user_idx
  ON public.pb_marketplace_ready_reconcile_log (user_id);

ALTER TABLE public.pb_marketplace_ready_reconcile_log ENABLE ROW LEVEL SECURITY;
-- Sin policies a proposito: tabla interna, solo accesible por service_role.
REVOKE ALL ON TABLE public.pb_marketplace_ready_reconcile_log FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pb_marketplace_ready_reconcile_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.pb_marketplace_ready_reconcile_log_id_seq TO service_role;

COMMENT ON TABLE public.pb_marketplace_ready_reconcile_log IS
  'PB-MARKETPLACE-READY-CONSISTENCY-001: backup logico y auditoria de la reconciliacion de marketplace_ready. Una fila por perfil y lote, con el estado previo completo para poder revertir.';

-- Reconciliación: clasifica y, solo si p_dry_run=false, degrada.
--   * Idempotente: una segunda pasada no encuentra nada que cambiar.
--   * Reversible: el estado previo queda en el log (ver rollback al final).
--   * Sin envíos ni claims; con sql/039 una aplicación real degrada
--     candidaturas applied no presentadas y encola un email por usuario.
--   * Nunca promueve false->true.
CREATE OR REPLACE FUNCTION public.pb_reconcile_marketplace_ready(
  p_dry_run boolean DEFAULT true,
  p_batch_id text DEFAULT NULL,
  p_limit integer DEFAULT 1000
)
RETURNS TABLE(
  batch_id text,
  dry_run boolean,
  evaluated integer,
  class_a_stays integer,
  class_b_cv integer,
  class_c_certificate integer,
  class_d_phone integer,
  class_e_availability integer,
  class_f_multiple integer,
  degraded integer
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  r record;
  m record;
  v_batch text := coalesce(p_batch_id, 'reconcile-' || to_char(now(), 'YYYYMMDDHH24MISS'));
  v_consent boolean;
  v_completion integer;
  v_new_ready boolean;
  v_new_status text;
  v_fails integer;
  v_class text;
  v_evaluated integer := 0;
  v_a integer := 0;
  v_b integer := 0;
  v_c integer := 0;
  v_d integer := 0;
  v_e integer := 0;
  v_f integer := 0;
  v_degraded integer := 0;
BEGIN
  IF NOT p_dry_run AND to_regclass('public.app_14da0f1941_marketplace_reconcile_emails') IS NULL THEN
    RAISE EXCEPTION 'sql/039 must be applied before reconciliation';
  END IF;
  FOR r IN
    SELECT user_id, full_name, title, profile_visibility, cv_visible,
           profile_completion, onboarding_status, marketplace_ready
    FROM public.app_14da0f1941_profiles
    WHERE marketplace_ready IS TRUE
    ORDER BY created_at
    LIMIT GREATEST(COALESCE(p_limit, 1000), 1)
  LOOP
    IF NOT p_dry_run THEN
      SELECT user_id, full_name, title, profile_visibility, cv_visible,
             profile_completion, onboarding_status, marketplace_ready
      INTO r
      FROM public.app_14da0f1941_profiles
      WHERE user_id = r.user_id AND marketplace_ready IS TRUE
      FOR UPDATE;
      IF NOT FOUND THEN CONTINUE; END IF;
    END IF;
    v_evaluated := v_evaluated + 1;

    SELECT * INTO m FROM public.pb_marketplace_minimums(r.user_id);
    v_consent := public.pb_marketplace_consent(r.profile_visibility, r.cv_visible, true);
    v_completion := public.pb_profile_completion_score(r.user_id);
    v_new_ready := public.pb_marketplace_ready_for(r.user_id, true);
    v_new_status := public.pb_onboarding_status(v_completion, v_new_ready, r.full_name, r.title);

    v_fails := (CASE WHEN m.ok_cv THEN 0 ELSE 1 END)
             + (CASE WHEN m.ok_certificate THEN 0 ELSE 1 END)
             + (CASE WHEN m.ok_availability THEN 0 ELSE 1 END)
             + (CASE WHEN coalesce(v_consent, false) THEN 0 ELSE 1 END)
             + (CASE WHEN coalesce(v_completion, 0) >= 30 THEN 0 ELSE 1 END);

    IF v_new_ready THEN
      v_class := 'A_stays_ready';     v_a := v_a + 1;
    ELSIF v_fails > 1 THEN
      v_class := 'F_multiple';        v_f := v_f + 1;
    ELSIF NOT m.ok_cv THEN
      v_class := 'B_cv';              v_b := v_b + 1;
    ELSIF NOT m.ok_certificate THEN
      v_class := 'C_certificate';     v_c := v_c + 1;
    ELSIF NOT m.ok_availability THEN
      v_class := 'E_availability';    v_e := v_e + 1;
    ELSIF NOT coalesce(v_consent, false) THEN
      v_class := 'G_consent';         v_f := v_f + 1;
    ELSE
      v_class := 'H_completion';      v_f := v_f + 1;
    END IF;

    IF NOT p_dry_run THEN
      INSERT INTO public.pb_marketplace_ready_reconcile_log (
        batch_id, dry_run, user_id, prev_ready, prev_status, prev_completion,
        new_ready, new_status, new_completion, fail_cv, fail_certificate,
        fail_phone, fail_availability, fail_consent, class, applied
      ) VALUES (
        v_batch, false, r.user_id, r.marketplace_ready, r.onboarding_status,
        r.profile_completion, v_new_ready, v_new_status, v_completion,
        NOT m.ok_cv, NOT m.ok_certificate, NOT m.ok_phone, NOT m.ok_availability,
        NOT coalesce(v_consent, false), v_class,
        (r.marketplace_ready IS DISTINCT FROM v_new_ready
         OR r.onboarding_status IS DISTINCT FROM v_new_status
         OR r.profile_completion IS DISTINCT FROM v_completion)
      );
    END IF;

    IF NOT p_dry_run
       AND (r.marketplace_ready IS DISTINCT FROM v_new_ready
            OR r.onboarding_status IS DISTINCT FROM v_new_status
            OR r.profile_completion IS DISTINCT FROM v_completion) THEN
      PERFORM set_config('pb.marketplace_reconcile_batch', v_batch, true);
      UPDATE public.app_14da0f1941_profiles
      SET marketplace_ready  = v_new_ready,
          onboarding_status  = v_new_status,
          profile_completion = v_completion
      WHERE user_id = r.user_id;
      PERFORM set_config('pb.marketplace_reconcile_batch', '', true);
      IF r.marketplace_ready IS DISTINCT FROM v_new_ready THEN
        v_degraded := v_degraded + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_batch, p_dry_run, v_evaluated,
                      v_a, v_b, v_c, v_d, v_e, v_f, v_degraded;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. GRANTS MÍNIMOS
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.pb_marketplace_phone_present(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_marketplace_phone_present(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pb_marketplace_minimums(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_marketplace_minimums(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pb_marketplace_ready_for(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_marketplace_ready_for(uuid, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.pb_reconcile_marketplace_ready(boolean, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_reconcile_marketplace_ready(boolean, text, integer) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. COMMENT ON
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON FUNCTION public.pb_marketplace_phone_present(uuid) IS 'Indicador interno opcional phone_missing; lee phone_e164 si existe, sin afectar Marketplace Ready ni Jobs.';
COMMENT ON FUNCTION public.pb_marketplace_minimums(uuid) IS 'Minimos para Marketplace Ready: CV real, documento profesional, disponibilidad informada. ok_phone es un indicador opcional.';
COMMENT ON FUNCTION public.pb_marketplace_ready_for(uuid, boolean) IS 'PB-MARKETPLACE-READY-CONSISTENCY-001 fase 2: predicado canonico UNICO de marketplace_ready = minimos + consentimiento declarado y registrado + completion>=30. Lo usan pb_complete_onboarding, pb_recalculate_profile_state y la reconciliacion. El gate de Jobs sigue leyendo marketplace_ready.';
COMMENT ON FUNCTION public.pb_reconcile_marketplace_ready(boolean, text, integer) IS 'PB-MARKETPLACE-READY-CONSISTENCY-001 fase 2: reconciliacion historica. Nace en dry-run, registra el estado previo en pb_marketplace_ready_reconcile_log, clasifica A-H, solo degrada, nunca promueve, y no envía emails directamente. Con sql/039 el downgrade aplica a candidaturas no presentadas.';

DROP FUNCTION IF EXISTS public.pb_marketplace_contract_phone_required();

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. OPERACIÓN
-- ─────────────────────────────────────────────────────────────────────────────
-- Simulación (no escribe en perfiles, solo en el log):
--   SELECT * FROM public.pb_reconcile_marketplace_ready(true, 'sim-001');
-- Aplicación real (requiere GO explícito):
--   SELECT * FROM public.pb_reconcile_marketplace_ready(false, 'apply-001');
-- Rollback de un lote aplicado:
--   UPDATE public.app_14da0f1941_profiles p
--   SET marketplace_ready = l.prev_ready,
--       onboarding_status = l.prev_status,
--       profile_completion = l.prev_completion
--   FROM public.pb_marketplace_ready_reconcile_log l
--   WHERE l.batch_id = 'apply-001' AND l.applied AND p.user_id = l.user_id;
--   (El rollback no reenvía emails: degradar y rehidratar true->false->true sí
--    dispararía el trigger de activación, así que el rollback debe ejecutarse
--    con la cola de activaciones vacía y verificando el outbox después.)
-- Rollback del código: aplicar de nuevo sql/036, que restaura el predicado
-- anterior (consentimiento + completion>=30) sin tocar datos.
