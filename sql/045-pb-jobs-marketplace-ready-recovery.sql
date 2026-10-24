-- ══════════════════════════════════════════════════════════════════════════════
-- PB-JOBS-MARKETPLACE-READY-RECOVERY-001 — Marketplace Ready SYNC + EMAIL 1 recovery
--
-- Problema (RCA producción, 2026-10-17):
--   * La promoción de marketplace_ready false→true es exclusiva de
--     pb_complete_onboarding (sql/036/037, decisión del proyecto de
--     consistencia tras el incidente 2026-09-11). Es un cálculo ONE-SHOT al
--     final del wizard: si en ese instante faltaban requisitos, el flag queda
--     false. Quien completa CV/certificado/disponibilidad DESPUÉS del wizard
--     satisface el predicado canónico (pb_marketplace_ready_for = true) pero
--     nada vuelve a promoverlo: pb_recalculate_profile_state mantiene o
--     degrada, nunca promueve.
--   * El gate de candidaturas (sql/034) lee el FLAG, no el predicado →
--     candidaturas de perfiles elegibles caen en pending_profile_validation.
--   * EMAIL 1 trataba "RPC canónico OK con lista vacía" como error
--     (canonical_requirements_unavailable) en lugar de detectar el estado
--     obsoleto. 5 fallos reales en producción = 5 candidaturas de 2 usuarios
--     elegibles.
--
-- Fix (diseño FASE 4, autoridad única = familia pb_marketplace_* de SQL):
--   1. pb_sync_marketplace_ready_state — promoción canónica REUTILIZABLE,
--      consent-gated (exige marketplace_contract_version = 2 AND
--      marketplace_consent_declared, columnas protegidas que solo el wizard
--      puede fijar). No duplica ninguna fórmula: delega en
--      pb_marketplace_ready_for / pb_profile_completion_score /
--      pb_onboarding_status. NUNCA degrada (degradar sigue siendo exclusivo
--      de pb_recalculate_profile_state / reconciliación). La promoción
--      dispara el trigger existente de sql/034: candidaturas pending →
--      applied + outbox EMAIL 2 (nunca sent_to_client).
--   2. app_14da0f1941_sync_ready_for_application — envoltorio SECURITY
--      DEFINER estrecho para el gate de candidaturas. Autorización
--      EXPLÍCITA (PO review P1): un usuario autenticado solo puede
--      sincronizar/consultar su propio perfil (p_user_id = auth.uid(),
--      rechazo 28000/42501 sin efectos secundarios). Exentos: service_role
--      y acceso directo sin JWT (postgres/admin). Además, el INSERT de una
--      candidatura exige user_id = auth.uid() (RLS applications_worker_
--      insert_own), así que en el gate el actor y el destinatario son por
--      construcción el mismo usuario. Fail-closed: cualquier error del sync
--      deja el flag persistido intacto y el gate decide como antes de 045.
--   3. Gate BEFORE INSERT (sql/034) actualizado: sincroniza por el camino
--      canónico ANTES de decidir el estado inicial de la candidatura.
--   4. pb_sync_stale_marketplace_ready — recovery DIRIGIDO por lote
--      explícito de user_ids (PO FASE 2, 2026-10-20: el barrido global
--      anterior fue RECHAZADO). No se auto-ejecuta: requiere invocación
--      service_role con batch_id + lista explícita derivada del dry-run
--      aprobado. Exige >=1 candidatura pending real por usuario en el
--      momento de ejecutar (skipped en otro caso) y revalida todos los
--      requisitos canónicos. Cada promoción queda auditada en
--      pb_marketplace_ready_reconcile_log (class 'stale_sync_promoted',
--      sin PII) y el EMAIL 2 sale por el outbox/drain existente, no por
--      esta función.
--
-- Seguridad:
--   * pb_sync_marketplace_ready_state / pb_sync_stale_marketplace_ready:
--     SECURITY INVOKER, search_path = public, EXECUTE SOLO service_role
--     (REVOKE de PUBLIC/anon/authenticated).
--   * app_14da0f1941_sync_ready_for_application: SECURITY DEFINER,
--     search_path fijado, sin SQL dinámico, EXECUTE solo authenticated
--     (anon revocado), con verificación explícita actor = p_user_id
--     (PO review P1). El guard pb_profiles_privilege_guard (sql/036)
--     sigue siendo el único camino de escritura del trío canónico: la
--     promoción se ejecuta como propietario de la función (supabase_admin),
--     igual que pb_complete_onboarding desde el service_role.
--   * Cero cambios de RLS. Cero grants nuevos a anon. Ningún flujo nuevo
--     puede alcanzar sent_to_client (el trigger de sql/034 nunca lo hace).
--
-- Idempotencia:
--   * sync: already_ready es no-op; la promoción dispara el outbox UNA vez
--     por transición efectiva false→true (trigger existente); EMAIL 2 tiene
--     claim por activation_id; EMAIL 1 tiene claim por application_id.
--   * barrido: re-ejecutar no encuentra filas stale que promover.
--
-- IDEMPOTENTE. Cero DML sobre datos al aplicarse (solo CREATE OR REPLACE
-- FUNCTION + trigger swap atómico).
-- ══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Gate interno de sincronización (PB-RELEASE-002 / PO RELEASE DECISION 002)
--
--    Instalación INERTE por defecto ('off'): bloquea promociones para TODOS
--    los actores — trigger de candidaturas, wrapper authenticated, sweep y
--    Edge Functions con service_role. REVOKE a authenticated por sí solo NO
--    bastaba: las Edge Functions activas (application-activation.ts) ya
--    invocan pb_sync_marketplace_ready_state con service_role.
--
--    RLS cerrado sin policies: inaccesible vía API para anon/authenticated;
--    service_role y el owner la leen para evaluar el gate.
--    ON CONFLICT DO NOTHING: la re-ejecución NUNCA resetea un gate activado.
--
--    Activación (fase 2, GO independiente y auditado):
--      UPDATE public.pb_marketplace_sync_gate
--         SET gate_value = 'on', updated_by = '<operador>'
--       WHERE gate_key = 'sync_mode';
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Núcleo: sincronización canónica de un perfil (promoción consent-gated)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pb_sync_marketplace_ready_state(
  p_user_id  uuid,
  p_batch_id text DEFAULT NULL
)
-- Nombres OUT prefijados (out_*): evita la colisión 42702 entre parámetros
-- de RETURNS TABLE y columnas homónimas de app_14da0f1941_profiles.
RETURNS TABLE(out_status text, out_marketplace_ready boolean, out_activated_count integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_profile    record;
  v_completion integer;
  v_pending    integer := 0;
  v_batch      text := coalesce(p_batch_id, 'sync-' || to_char(now(), 'YYYYMMDDHH24MISS'));
BEGIN
  IF p_user_id IS NULL THEN
    RETURN QUERY SELECT 'missing_user_id'::text, NULL::boolean, 0;
    RETURN;
  END IF;

  -- PB-RELEASE-002: gate interno. Con sync_mode <> 'on' NINGÚN actor
  -- promociona (ni trigger, ni wrapper, ni sweep, ni Edge Functions
  -- service_role). Se evalúa antes del SELECT FOR UPDATE: cero locks, cero
  -- efectos secundarios, outcome explícito y manejable por las Edge
  -- Functions activas (equivalente a "no promovido", jamás excepción).
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

  -- Idempotencia: ya ready no re-promociona (y por tanto no re-dispara
  -- outbox ni EMAIL 2: el trigger solo actúa en false→true efectivo).
  IF v_profile.marketplace_ready IS TRUE THEN
    RETURN QUERY SELECT 'already_ready'::text, TRUE, 0;
    RETURN;
  END IF;

  -- Legacy v1: protegido hasta la reconciliación autorizada (sql/037).
  IF v_profile.marketplace_contract_version = 1 THEN
    RETURN QUERY SELECT 'legacy_protected'::text, FALSE, 0;
    RETURN;
  END IF;

  -- PO review P1 (2026-10-17): la promoción EXIGE expresamente contrato v2
  -- declarado. No basta con excluir v1: NULL o cualquier otra versión no
  -- reconocida también bloquean la promoción (sin efectos secundarios).
  IF v_profile.marketplace_contract_version IS DISTINCT FROM 2 THEN
    RETURN QUERY SELECT 'contract_version_required'::text, FALSE, 0;
    RETURN;
  END IF;

  -- Promoción solo con consentimiento DECLARADO por el wizard (columna
  -- protegida: ni el cliente ni este flujo pueden fijarla). Es la diferencia
  -- con el incidente 2026-09-11, donde el consentimiento se INFERÍA de
  -- columnas de visibilidad.
  IF v_profile.marketplace_consent_declared IS NOT TRUE THEN
    RETURN QUERY SELECT 'consent_required'::text, FALSE, 0;
    RETURN;
  END IF;

  v_completion := public.pb_profile_completion_score(p_user_id);

  IF NOT public.pb_marketplace_ready_for(p_user_id, TRUE) THEN
    RETURN QUERY SELECT 'not_eligible'::text, FALSE, 0;
    RETURN;
  END IF;

  -- Candidaturas que esta promoción activará (misma transacción; el trigger
  -- de sql/034 las moverá pending → applied, nunca sent_to_client).
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

  -- Auditoría de la reparación (mismo patrón que la reconciliación, sin PII).
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
  'PB-JOBS-MARKETPLACE-READY-RECOVERY-001: sincroniza el flag persistido con el predicado canonico (solo promocion, consent-gated, auditada). Nunca degrada. La promocion activa candidaturas pending y encola EMAIL 2 via el trigger de sql/034.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Envoltorio del gate de candidaturas (SECURITY DEFINER estrecho)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_14da0f1941_sync_ready_for_application(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claims     text := NULLIF(current_setting('request.jwt.claims', true), '');
  v_is_service boolean;
  v_actor      uuid;
BEGIN
  IF p_user_id IS NULL THEN RETURN NULL; END IF;

  -- Autorización EXPLÍCITA (PO review P1, 2026-10-17): un usuario
  -- autenticado solo puede sincronizar/consultar SU PROPIO perfil a través
  -- de este envoltorio. Rechazo explícito ANTES de cualquier efecto
  -- secundario. Actores canónicos exentos del match 1:1:
  --   * acceso directo a la base sin JWT (postgres/admin; patrón sql/004);
  --   * service_role (actor backend canónico; patrón sql/036/042).
  v_is_service := v_claims IS NULL
                  OR COALESCE(v_claims::jsonb ->> 'role', '') = 'service_role';

  IF NOT v_is_service THEN
    v_actor := auth.uid();
    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
    END IF;
    IF v_actor IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  BEGIN
    PERFORM public.pb_sync_marketplace_ready_state(p_user_id, 'application-gate');
  EXCEPTION WHEN OTHERS THEN
    -- Fail-closed: ante cualquier fallo del sync el flag persistido decide
    -- (conducta pre-045). La candidatura NO se pierde ni se bloquea.
    RETURN (SELECT marketplace_ready FROM public.app_14da0f1941_profiles WHERE user_id = p_user_id);
  END;

  RETURN (SELECT marketplace_ready FROM public.app_14da0f1941_profiles WHERE user_id = p_user_id);
END $$;

REVOKE ALL ON FUNCTION public.app_14da0f1941_sync_ready_for_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_14da0f1941_sync_ready_for_application(uuid) TO authenticated;

COMMENT ON FUNCTION public.app_14da0f1941_sync_ready_for_application(uuid) IS
  'PB-JOBS-MARKETPLACE-READY-RECOVERY-001: sincronizacion canonica en el gate de candidaturas. Autorizacion explicita: actor autenticado = propietario (match 1:1, rechazo forbidden); exentos service_role y acceso directo sin JWT. Fail-closed al flag persistido.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Gate BEFORE INSERT: decidir el estado inicial con estado canónico
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_14da0f1941_set_application_initial_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_ready boolean;
BEGIN
  -- PB-JOBS-MARKETPLACE-READY-RECOVERY-001: antes de decidir, sincronizar el
  -- flag persistido con el predicado canonico (promocion consent-gated, solo
  -- para el propietario de la candidatura). Un perfil que ya cumple los
  -- minimos canonicos NUNCA debe nacer como pending_profile_validation.
  --
  -- Sin fila de perfil se trata como "no ready" (fail-closed): la candidatura
  -- se conserva, pero no es presentable.
  v_ready := public.app_14da0f1941_sync_ready_for_application(NEW.user_id);

  IF v_ready IS NOT TRUE THEN
    NEW.status := 'pending_profile_validation';
  ELSIF NEW.status = 'pending_profile_validation' THEN
    -- Anti-falsificación: un cliente no puede auto-marcar su candidatura
    -- como pendiente cuando su perfil ya está validado.
    NEW.status := 'applied';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_14da0f1941_job_applications_initial_status ON public.app_14da0f1941_job_applications;
CREATE TRIGGER app_14da0f1941_job_applications_initial_status
  BEFORE INSERT ON public.app_14da0f1941_job_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.app_14da0f1941_set_application_initial_status();

COMMENT ON FUNCTION public.app_14da0f1941_set_application_initial_status() IS
  'PB-JOBS-MARKETPLACE-READY-ACTIVATION-001 + RECOVERY-001: estado inicial de candidatura tras sincronizar canonically el flag (fail-closed).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Recovery DIRIGIDO por lote explícito de usuarios (PO FASE 2, 2026-10-20)
--
-- Contrato (sustituye al barrido global, rechazado por el PO):
--   * p_user_ids: lista EXPLÍCITA derivada del dry-run aprobado. Sin lista no
--     hay ejecución; jamás se recorre la tabla de perfiles.
--   * Todo usuario del lote debe tener AL MENOS UNA candidatura real en
--     pending_profile_validation EN EL MOMENTO DE EJECUTAR (revalidación
--     backend). Quien no la tenga queda skipped con outcome explícito
--     ('no_pending_applications'): este recovery de Jobs NO promueve
--     perfiles elegibles sin candidaturas pendientes.
--   * pb_sync_marketplace_ready_state revalida TODOS los requisitos
--     canónicos en el momento de ejecutar (contrato v2, consentimiento
--     declarado, predicado pb_marketplace_ready_for). Quien ya no cumpla
--     queda skipped con su outcome (not_eligible / consent_required /
--     contract_version_required / legacy_protected).
--   * Fail-closed: cualquier error por usuario se contabiliza y NO aborta
--     el lote; ningún usuario se promociona parcialmente.
--   * Idempotente: re-ejecutar el mismo lote no re-promueve
--     (already_ready), no duplica eventos, no duplica outbox, no duplica
--     EMAIL 2 (claim por activation_id en el drain existente).
--   * Auditado: cada promoción queda en pb_marketplace_ready_reconcile_log
--     (class 'stale_sync_promoted', batch_id = p_batch_id, sin PII).
--   * No envía emails: EMAIL 2 sale por el outbox/drain existente.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pb_sync_stale_marketplace_ready(
  p_batch_id text,
  p_user_ids uuid[]
)
RETURNS TABLE(
  evaluated        integer,
  promoted         integer,
  already_ready    integer,
  not_eligible     integer,
  legacy_protected integer,
  no_pending       integer,
  errors           integer
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid;
  v_res     record;
  v_pending integer;
  v_evaluated integer := 0;
  v_promoted  integer := 0;
  v_already   integer := 0;
  v_not       integer := 0;
  v_legacy    integer := 0;
  v_nopend    integer := 0;
  v_err       integer := 0;
BEGIN
  -- Batch explicito obligatorio: toda reparacion queda auditada y
  -- correlacionada en pb_marketplace_ready_reconcile_log.
  IF p_batch_id IS NULL OR p_batch_id !~ '^[a-zA-Z0-9_-]{1,80}$' THEN
    RAISE EXCEPTION 'batch_id explicito requerido';
  END IF;

  -- Lote explicito obligatorio (PO FASE 2): sin lista de usuarios no hay
  -- ejecucion. Un array vacio es un NO-OP valido (0 evaluados), no un error.
  IF p_user_ids IS NULL THEN
    RAISE EXCEPTION 'user_ids explicito requerido (lote derivado del dry-run aprobado)';
  END IF;

  FOREACH v_uid IN ARRAY p_user_ids
  LOOP
    IF v_uid IS NULL THEN
      CONTINUE;
    END IF;
    v_evaluated := v_evaluated + 1;
    BEGIN
      -- Gate de alcance Jobs: al menos una candidatura pending REAL en el
      -- momento de ejecutar. Sin ella, el usuario NO es objetivo de este
      -- recovery (aunque sea elegible): skipped explicito.
      SELECT count(*) INTO v_pending
      FROM public.app_14da0f1941_job_applications
      WHERE user_id = v_uid
        AND status = 'pending_profile_validation';

      IF v_pending = 0 THEN
        v_nopend := v_nopend + 1;
        CONTINUE;
      END IF;

      SELECT * INTO v_res FROM public.pb_sync_marketplace_ready_state(v_uid, p_batch_id);
      IF v_res.out_status = 'promoted' THEN        v_promoted := v_promoted + 1;
      ELSIF v_res.out_status = 'already_ready' THEN v_already  := v_already + 1;
      ELSIF v_res.out_status = 'legacy_protected' THEN v_legacy := v_legacy + 1;
      ELSE                                      v_not      := v_not + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_err := v_err + 1;
    END;
  END LOOP;

  RETURN QUERY SELECT v_evaluated, v_promoted, v_already, v_not, v_legacy, v_nopend, v_err;
END $$;

REVOKE ALL ON FUNCTION public.pb_sync_stale_marketplace_ready(text, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_sync_stale_marketplace_ready(text, uuid[]) TO service_role;

-- La firma anterior (text, integer) queda RETIRADA: su contrato de barrido
-- global fue rechazado por el PO y no debe quedar invocable.
DROP FUNCTION IF EXISTS public.pb_sync_stale_marketplace_ready(text, integer);

COMMENT ON FUNCTION public.pb_sync_stale_marketplace_ready(text, uuid[]) IS
  'PB-JOBS-MARKETPLACE-READY-RECOVERY-001 (PO FASE 2): recovery DIRIGIDO por lote explicito de user_ids derivado del dry-run aprobado. Exige >=1 candidatura pending real por usuario en el momento de ejecutar (skipped no_pending_applications en otro caso) y revalida todos los requisitos canonicos via pb_sync_marketplace_ready_state. Idempotente, fail-closed, auditado en reconcile_log. No envia emails: EMAIL 2 sale por el outbox/drain existente.';
