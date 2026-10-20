-- ═══════════════════════════════════════════════════════════════════════════════
-- PB-JOBS-COMPANY-WITHDRAWN-SEMANTICS-001 — `withdrawn` reservado al Worker (P1).
--
-- RCA (matriz post-deploy PB-JOBS-APPLICATION-STATUS-AUTH-001, hallazgo C8):
--   * La RPC canónica app_update_application_status (sql/034, commit 2fbf1a0,
--     PB-JOBS-ATS-001 2026-09-28) autoriza a la empresa propietaria con un
--     permiso genérico sobre TODOS los estados permitidos: solo excluye
--     'pending_profile_validation' (staff-only). 'withdrawn' NO estaba
--     excluido → company → withdrawn devolvía ok=true/changed=true.
--   * El guard de sql/054 SÍ prohíbe company → withdrawn en el UPDATE
--     directo, pero la RPC es SECURITY DEFINER (postgres) y está exenta.
--   * El trigger 054 ya documenta la intención ("empresa: pipeline sin
--     estados internos: pending_profile_validation, withdrawn"); esta
--     migración alinea la RPC con ese contrato.
--   * Frontend que puede invocarla: CompanyCandidates.tsx exponía
--     'withdrawn' en el <select> de estado empresarial (corregido en este
--     mismo PR). CandidateProfile.tsx no ofrece withdraw. Applications.tsx
--     (worker) es el único flujo legítimo.
--   * Usos históricos (producción, read-only 20/10/2026): 0 transiciones
--     actor_role=company → withdrawn (0 eventos de company en total). Los
--     únicos 2 'withdrawn' existentes son smoke fixtures del worker
--     (42000000-...-011/-013). Sin candidaturas reales afectadas. El único
--     evento company→withdrawn fue el probe C8 de QA (fixture, eliminado en
--     el cleanup F4).
--
-- Decisión de producto:
--   'withdrawn' representa una retirada iniciada por el CANDIDATO. Queda
--   reservado al Worker propietario de la candidatura. Una empresa que no
--   continúa con un candidato debe usar el estado empresarial canónico ya
--   autorizado ('rejected'), nunca atribuirle una retirada.
--
-- Máquina de estados resultante (autoridad funcional = esta RPC):
--   * Worker propietario   → withdrawn: ALLOWED (contrato actual intacto).
--   * Company (propia)     → withdrawn: FORBIDDEN (nuevo). El resto del
--     pipeline empresarial (reviewed/shortlisted/sent_to_client/interview/
--     hired/rejected) sin cambios.
--   * Company (cross/ajena): FORBIDDEN (ya bloqueado por autorización).
--   * Worker ajeno          → withdrawn: FORBIDDEN (ya bloqueado).
--   * Admin/jobs_moderator → withdrawn: ALLOWED (capacidad explícita y
--     auditada del contrato vigente, con nota al reabrir estados
--     terminales; NO se usa como bypass silencioso).
--   * System (triggers 034/039, sync 045): NUNCA usa withdrawn (Marketplace
--     Ready = pending↔applied). Intactos y exentos (SECURITY DEFINER
--     postgres).
--
-- Alcance estricto:
--   * Solo modifica la lógica de la RPC canónica (nuevo check por-estado,
--     mismo patrón fail-closed que 'pending_profile_validation').
--   * Firma idéntica (uuid, text, text) → jsonb. SECURITY DEFINER.
--     search_path = public. Grants re-afirmados: PUBLIC sin EXECUTE,
--     EXECUTE solo authenticated (estado actual exacto).
--   * NO toca: ACL de tabla, RLS/policies, triggers, Marketplace Ready,
--     SQL 045, emails, Storage (053), Stripe.
--
-- Rollback exacto: sección final comentada (restaura el cuerpo previo de
-- sql/034 verificado en QA/producción el 20/10/2026). No destructivo: no
-- reescribe filas ni eventos.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. RPC canónica: 'withdrawn' reservado al Worker propietario
-- ─────────────────────────────────────────────────────────────────────────────
-- Cuerpo idéntico al vigente (sql/034 + fix 50aa54a) con UNA adición: el
-- check PB-JOBS-COMPANY-WITHDRAWN-SEMANTICS-001, inmediatamente después del
-- check staff-only de 'pending_profile_validation' y ANTES de la
-- idempotencia (una empresa no debe poder ni confirmar ni fijar withdrawn,
-- ni siquiera con changed=false). Se evalúa tras la autorización general,
-- así que un worker ajeno ya fue rechazado; el check solo elimina la vía
-- restante: empresa propietaria de la candidatura.
CREATE OR REPLACE FUNCTION public.app_update_application_status(
  p_application_id uuid,
  p_new_status text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_app app_14da0f1941_job_applications%ROWTYPE;
  v_allowed text[] := ARRAY[
    'applied','reviewed','shortlisted','sent_to_client','interview',
    'hired','rejected','withdrawn','pending_profile_validation'
  ];
  v_terminal text[] := ARRAY['hired','rejected','withdrawn'];
  v_applicant_ready boolean;
  -- Comparaciones NULL-safe (fail-closed): con company_user_id NULL o perfil
  -- inexistente la OR de sql/018 evaluaba a NULL y saltaba el forbidden.
  v_is_admin boolean;
  v_is_primary_admin boolean;
  v_is_company boolean;
  v_is_owner_withdraw boolean;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF NOT (p_new_status = ANY (v_allowed)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  SELECT role INTO v_role
  FROM app_14da0f1941_profiles
  WHERE user_id = v_actor;

  SELECT * INTO v_app
  FROM app_14da0f1941_job_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- Authorization: admin (role or primary admin email), jobs_moderator,
  -- or the company that owns the application. Workers can only withdraw
  -- their own application. Cada condición es un booleano estricto.
  v_is_admin := coalesce(v_role IN ('admin', 'jobs_moderator'), false);
  v_is_primary_admin := coalesce(
    (auth.jwt() ->> 'email') = 'gaspardelhierromata@gmail.com', false);
  v_is_company := v_app.company_user_id IS NOT NULL
                  AND v_app.company_user_id = v_actor;
  v_is_owner_withdraw := v_app.user_id = v_actor
                         AND p_new_status = 'withdrawn';

  IF NOT (v_is_admin OR v_is_primary_admin OR v_is_company OR v_is_owner_withdraw) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- PB-JOBS-MARKETPLACE-READY-ACTIVATION-001:
  -- 'pending_profile_validation' es un estado interno del sistema; solo
  -- admin/jobs_moderator puede fijarlo manualmente (correcciones).
  IF p_new_status = 'pending_profile_validation'
     AND NOT (v_is_admin OR v_is_primary_admin) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- PB-JOBS-COMPANY-WITHDRAWN-SEMANTICS-001:
  -- 'withdrawn' es una retirada iniciada por el candidato: reservado al
  -- Worker propietario de la candidatura (y a correcciones explícitas de
  -- admin/jobs_moderator, siempre auditadas). Una empresa que no continúa
  -- debe usar el estado empresarial canónico (p. ej. 'rejected'), nunca
  -- atribuir una retirada al candidato. Cierra la vía indirecta que el
  -- guard de sql/054 no cubre (esta RPC corre como postgres y está exenta).
  -- No confía en el frontend: la restricción vive en el backend canónico.
  IF p_new_status = 'withdrawn'
     AND NOT (v_is_admin OR v_is_primary_admin)
     AND v_app.user_id IS DISTINCT FROM v_actor THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Idempotency: already in target status → success, no duplicate event.
  IF v_app.status = p_new_status THEN
    RETURN jsonb_build_object('ok', true, 'changed', false, 'status', p_new_status);
  END IF;

  -- Reopening from a terminal state requires an explicit reason.
  IF v_app.status = ANY (v_terminal) AND (p_note IS NULL OR btrim(p_note) = '') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'note_required_for_reopen');
  END IF;

  -- Presentar al cliente exige perfil validado (fuente canónica backend).
  IF p_new_status = 'sent_to_client' THEN
    SELECT marketplace_ready INTO v_applicant_ready
    FROM app_14da0f1941_profiles
    WHERE user_id = v_app.user_id;

    IF v_applicant_ready IS NOT TRUE THEN
      RETURN jsonb_build_object('ok', false, 'error', 'profile_not_marketplace_ready');
    END IF;
  END IF;

  UPDATE app_14da0f1941_job_applications
  SET status = p_new_status
  WHERE id = p_application_id;

  INSERT INTO app_14da0f1941_job_application_events
    (application_id, from_status, to_status, actor_user_id, actor_role, note)
  VALUES
    (p_application_id, v_app.status, p_new_status, v_actor, v_role, p_note);

  RETURN jsonb_build_object('ok', true, 'changed', true, 'status', p_new_status);
END;
$$;

COMMENT ON FUNCTION public.app_update_application_status(uuid, text, text) IS
  'PB-JOBS-ATS-001 + PB-JOBS-MARKETPLACE-READY-ACTIVATION-001 + PB-JOBS-COMPANY-WITHDRAWN-SEMANTICS-001: transacción de estado; sent_to_client exige marketplace_ready; pending_profile_validation solo staff; withdrawn reservado al worker propietario (staff solo correcciones auditadas).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Grants re-afirmados (estado actual exacto — idempotente)
-- ─────────────────────────────────────────────────────────────────────────────
-- CREATE OR REPLACE preserva el ACL de la función; se re-afirma por si el
-- estado hubiera derivado. PUBLIC sigue SIN EXECUTE; EXECUTE solo
-- authenticated (sin anon, sin service_role nuevo).
REVOKE ALL ON FUNCTION public.app_update_application_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_update_application_status(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK EXACTO (manual — NO ejecutar salvo incidente/inciso del PO):
-- Restaura íntegro el cuerpo previo de la RPC (sql/034 @ 50aa54a, verificado
-- vivo en QA y producción el 20/10/2026). No destructivo: no reescribe filas
-- ni eventos; las candidaturas 'withdrawn' existentes (retiradas legítimas
-- del worker) quedan intactas. Reabre ÚNICAMENTE la vía company→withdrawn
-- por RPC (hallazgo C8); el guard sql/054 sigue cerrando el UPDATE directo.
--   BEGIN;
--   CREATE OR REPLACE FUNCTION public.app_update_application_status(
--     p_application_id uuid,
--     p_new_status text,
--     p_note text DEFAULT NULL
--   )
--   RETURNS jsonb
--   LANGUAGE plpgsql
--   SECURITY DEFINER
--   SET search_path = public
--   AS $$
--   DECLARE
--     v_actor uuid := auth.uid();
--     v_role text;
--     v_app app_14da0f1941_job_applications%ROWTYPE;
--     v_allowed text[] := ARRAY[
--       'applied','reviewed','shortlisted','sent_to_client','interview',
--       'hired','rejected','withdrawn','pending_profile_validation'
--     ];
--     v_terminal text[] := ARRAY['hired','rejected','withdrawn'];
--     v_applicant_ready boolean;
--     v_is_admin boolean;
--     v_is_primary_admin boolean;
--     v_is_company boolean;
--     v_is_owner_withdraw boolean;
--   BEGIN
--     IF v_actor IS NULL THEN
--       RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
--     END IF;
--     IF NOT (p_new_status = ANY (v_allowed)) THEN
--       RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
--     END IF;
--     SELECT role INTO v_role
--     FROM app_14da0f1941_profiles
--     WHERE user_id = v_actor;
--     SELECT * INTO v_app
--     FROM app_14da0f1941_job_applications
--     WHERE id = p_application_id
--     FOR UPDATE;
--     IF NOT FOUND THEN
--       RETURN jsonb_build_object('ok', false, 'error', 'not_found');
--     END IF;
--     v_is_admin := coalesce(v_role IN ('admin', 'jobs_moderator'), false);
--     v_is_primary_admin := coalesce(
--       (auth.jwt() ->> 'email') = 'gaspardelhierromata@gmail.com', false);
--     v_is_company := v_app.company_user_id IS NOT NULL
--                     AND v_app.company_user_id = v_actor;
--     v_is_owner_withdraw := v_app.user_id = v_actor
--                            AND p_new_status = 'withdrawn';
--     IF NOT (v_is_admin OR v_is_primary_admin OR v_is_company OR v_is_owner_withdraw) THEN
--       RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
--     END IF;
--     IF p_new_status = 'pending_profile_validation'
--        AND NOT (v_is_admin OR v_is_primary_admin) THEN
--       RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
--     END IF;
--     IF v_app.status = p_new_status THEN
--       RETURN jsonb_build_object('ok', true, 'changed', false, 'status', p_new_status);
--     END IF;
--     IF v_app.status = ANY (v_terminal) AND (p_note IS NULL OR btrim(p_note) = '') THEN
--       RETURN jsonb_build_object('ok', false, 'error', 'note_required_for_reopen');
--     END IF;
--     IF p_new_status = 'sent_to_client' THEN
--       SELECT marketplace_ready INTO v_applicant_ready
--       FROM app_14da0f1941_profiles
--       WHERE user_id = v_app.user_id;
--       IF v_applicant_ready IS NOT TRUE THEN
--         RETURN jsonb_build_object('ok', false, 'error', 'profile_not_marketplace_ready');
--       END IF;
--     END IF;
--     UPDATE app_14da0f1941_job_applications
--     SET status = p_new_status
--     WHERE id = p_application_id;
--     INSERT INTO app_14da0f1941_job_application_events
--       (application_id, from_status, to_status, actor_user_id, actor_role, note)
--     VALUES
--       (p_application_id, v_app.status, p_new_status, v_actor, v_role, p_note);
--     RETURN jsonb_build_object('ok', true, 'changed', true, 'status', p_new_status);
--   END;
--   $$;
--   COMMENT ON FUNCTION public.app_update_application_status(uuid, text, text) IS
--     'PB-JOBS-ATS-001 + PB-JOBS-MARKETPLACE-READY-ACTIVATION-001: transacción de estado; sent_to_client exige marketplace_ready; pending_profile_validation solo staff.';
--   REVOKE ALL ON FUNCTION public.app_update_application_status(uuid, text, text) FROM PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.app_update_application_status(uuid, text, text) TO authenticated;
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────
