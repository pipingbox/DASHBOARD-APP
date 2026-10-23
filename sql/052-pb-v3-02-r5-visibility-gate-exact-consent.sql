-- ══════════════════════════════════════════════════════════════════════════════
-- PR-V3-02 RONDA 5 (PO review 18/10/2026) — Cierre de seguridad y release gates.
--
-- Contenido:
--   1. P1 — Separación entre participación protegida y acceso al CV original.
--      HALLAZGO DE AUDITORÍA (consumidores de profile_visibility/cv_visible):
--        - Edge secure-file-access (main y PR #85): entrega el CV ORIGINAL a
--          una empresa cuando cv_visible=true AND isCompanyAuthorized (relación
--          laboral activa o candidatura). PR #85 endurece relación y auditoría
--          pero conserva ese gate de visibilidad.
--        - La aceptación v3 (sql/051) activaba profile_visibility='public' +
--          cv_visible=TRUE: otorgaba acceso empresarial al CV original como
--          efecto colateral. CORREGIDO: la aceptación v3 habilita
--          EXCLUSIVAMENTE la participación consentida en el Marketplace
--          protegido (estado = el propio acto de consentimiento v3:
--          contract_version=3 + consent_version=3 + consent_declared).
--          profile_visibility y cv_visible vuelven a ser exclusivamente
--          elección del usuario (privilege guard las trata como preferencia
--          no privilegiada) y NO los toca ni la aceptación ni la retirada.
--        - Predicado v3: el requisito 'consent' pasa a ser el consentimiento
--          declarado v3; la visibilidad pública deja de ser requisito.
--        - La retirada limpia el consentimiento pero NO toca la visibilidad
--          del usuario (era su elección, no un efecto del contrato).
--      Consumidores auditados: sql/011 RLS empleos (sin visibilidad), sql/018
--      (sin visibilidad), sql/036/037 (consentimiento canónico v1/v2 — sin
--      cambios), sql/047/049/051 (v3 — corregidos aquí), EF secure-file-access
--      (gate cv_visible — sin cambios: el acceso documental sigue siendo
--      elección del usuario + relación, jamás efecto de la aceptación v3),
--      EF upload-cv-file/recalculate-profiles/complete-onboarding (no leen
--      visibilidad para decidir), frontend (wizard no la muestra como
--      requisito; búsqueda/perfiles usan la visibilidad como elección del
--      usuario). Storage: políticas por owner; signed URLs solo vía broker.
--
--   2. P1 — Gate jurídico en TODAS las rutas con efectos v3:
--        a) Dispatcher pb_sync_marketplace_ready_state: la rama v3 exige
--           gate abierta para el text_version consentido (último evento
--           accept). Con acceptance_mode='off' → 'contract_not_active' sin
--           efectos, INCLUSO llamado por service_role, por el sweep
--           pb_sync_stale_marketplace_ready, por las Edge Functions
--           (recalculate-profiles, complete-onboarding) o por el trigger de
--           auto-resync. La rama v2 NO se toca (PR #84: autorización
--           independiente, sigue congelada).
--        b) Trigger de activación/outbox (sql/034): una transición v3
--           false→true con gate cerrada se RECHAZA con excepción — es
--           imposible producir promociones v3 ni outbox/EMAIL 2 derivados
--           incluso escribiendo marketplace_ready directamente con
--           service_role. v2 sin cambios.
--        c) RPC de aceptación: ya gateado (sql/051) + endurecido en §3.
--
--   3. P1 — Consentimiento exacto (texto mostrado = texto aceptado):
--        - NUEVA FIRMA: pb_accept_marketplace_contract_v3(p_lang,
--          p_text_version, p_hash). El cliente declara la versión y el hash
--          SHA-256 COMPLETO del texto que se le mostró (servidos por
--          pb_marketplace_v3_requirements). El backend valida:
--            · existencia del texto (versión+idioma, no retirado);
--            · hash completo idéntico al preservado (cualquier modificación
--              entre visualización y aceptación → error);
--            · la versión sigue siendo la vigente (si existe una más reciente
--              no retirada → error: el usuario debe revisar el nuevo texto);
--            · estado jurídico/comercial vía gate.
--          Discrepancia → 'contract_changed_review_required' SIN efectos:
--          el usuario vuelve a revisar el contrato.
--        - La firma anterior (solo p_lang) se ELIMINA: ya no es posible
--          aceptar sin declarar versión+hash.
--        - Re-aceptación de una versión distinta a la consentida: registra
--          un NUEVO acto (nuevo evento) vinculado al nuevo texto.
--        - Activación comercial ('active'): exige los 11 idiomas presentes
--          en esa versión (pb_marketplace_contract_text_set_status).
--
--   4. P1 — Incompatibilidades sql/050 ↔ sql/051 corregidas (en sql/050):
--        - seed 'ON CONFLICT (lang) DO UPDATE' → incompat. con la PK
--          (text_version, lang) de 051 → ahora ON CONFLICT DO NOTHING.
--        - CREATE POLICY sin DROP → fallaba al reejecutar 050 tras 051 →
--          ahora DROP POLICY IF EXISTS + CREATE (ver sql/050).
--
-- IDEMPOTENT: SÍ (create or replace, drop if exists, on conflict do nothing).
-- STATUS: QA primero; producción solo con GO expreso del PO.
-- ══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Predicado v3: consentimiento = participación protegida (sin visibilidad)
-- ─────────────────────────────────────────────────────────────────────────────
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
  -- Ronda 5: el requisito de consentimiento v3 es EXCLUSIVAMENTE el acto de
  -- aceptación (participación protegida). profile_visibility y cv_visible
  -- son elección del usuario y controlan descubribilidad pública y acceso
  -- documental; NO son requisito ni efecto del contrato v3.
  IF p_declared_consent IS NOT TRUE THEN
    v_missing := array_append(v_missing, 'consent');
  END IF;

  RETURN v_missing;
END;
$$;

REVOKE ALL ON FUNCTION public.pb_marketplace_missing_requirements_v3(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_marketplace_missing_requirements_v3(uuid, boolean) TO service_role;

COMMENT ON FUNCTION public.pb_marketplace_missing_requirements_v3(uuid, boolean) IS
  'PR-V3 ronda 5: faltantes v3. consent = acto de aceptación v3 (participación protegida); visibilidad/CV visible ya no son requisito.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Gate en el dispatcher (último punto de autorización de toda promoción v3)
--
-- PB-RELEASE-002 (PO RELEASE DECISION 002): además del gate contractual v3,
-- esta redefinición PRESERVA el gate interno global de sql/045/047. La tabla
-- se reasegura de forma idempotente (auto-contenido en el orden 045→…→052).
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
  v_text_version text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN QUERY SELECT 'missing_user_id'::text, NULL::boolean, 0;
    RETURN;
  END IF;

  -- PB-RELEASE-002: gate interno global (v2 y v3). Con sync_mode <> 'on'
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

  IF v_profile.marketplace_contract_version NOT IN (2, 3) THEN
    RETURN QUERY SELECT 'contract_version_required'::text, FALSE, 0;
    RETURN;
  END IF;

  IF v_profile.marketplace_consent_declared IS NOT TRUE THEN
    RETURN QUERY SELECT 'consent_required'::text, FALSE, 0;
    RETURN;
  END IF;

  -- Ronda 5 P1: la rama v3 exige la GATE JURÍDICA ABIERTA en el último
  -- punto de autorización. Cubre accept RPC, auto-resync, Edge Functions,
  -- sweep y llamadas service_role directas. La rama v2 NO se modifica
  -- (recovery PR #84: autorización independiente, congelada).
  IF v_profile.marketplace_contract_version = 3 THEN
    SELECT split_part(e.consent_text_version, ':', 1) INTO v_text_version
    FROM public.app_14da0f1941_marketplace_consent_events e
    WHERE e.user_id = p_user_id AND e.event_type = 'accept'
    ORDER BY e.created_at DESC
    LIMIT 1;

    IF nullif(coalesce(v_text_version, ''), '') IS NULL
       OR public.pb_v3_acceptance_gate(p_user_id, v_text_version) = 'closed' THEN
      RETURN QUERY SELECT 'contract_not_active'::text, FALSE, 0;
      RETURN;
    END IF;

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
  'PR-V3 ronda 5: promoción canónica. Rama v3 exige gate jurídica abierta (contract_not_active si off) en el último punto de autorización; rama v2 intacta (PR #84 congelada).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Gate en el trigger de activación/outbox (defensa ante escritura directa)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_14da0f1941_on_marketplace_ready_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_app record;
  v_count integer := 0;
  v_titles text[] := ARRAY[]::text[];
  v_text_version text;
BEGIN
  IF OLD.marketplace_ready IS NOT TRUE AND NEW.marketplace_ready IS TRUE THEN
    -- Ronda 5 P1: una transición v3 con gate cerrada es imposible, incluso
    -- escribiendo marketplace_ready directamente con service_role. Sin
    -- promoción, sin activación de candidaturas, sin outbox, sin EMAIL 2.
    IF NEW.marketplace_contract_version = 3 THEN
      SELECT split_part(e.consent_text_version, ':', 1) INTO v_text_version
      FROM public.app_14da0f1941_marketplace_consent_events e
      WHERE e.user_id = NEW.user_id AND e.event_type = 'accept'
      ORDER BY e.created_at DESC
      LIMIT 1;

      IF nullif(coalesce(v_text_version, ''), '') IS NULL
         OR public.pb_v3_acceptance_gate(NEW.user_id, v_text_version) = 'closed' THEN
        RAISE EXCEPTION 'v3_gate_closed: promoción Marketplace Ready v3 bloqueada (acceptance_mode off o texto no activo). Sin efectos.';
      END IF;
    END IF;

    FOR v_app IN
      SELECT a.id, a.job_title
      FROM public.app_14da0f1941_job_applications a
      WHERE a.user_id = NEW.user_id
        AND a.status = 'pending_profile_validation'
      FOR UPDATE
    LOOP
      UPDATE public.app_14da0f1941_job_applications
      SET status = 'applied'
      WHERE id = v_app.id;

      INSERT INTO public.app_14da0f1941_job_application_events
        (application_id, from_status, to_status, actor_user_id, actor_role, note)
      VALUES
        (v_app.id, 'pending_profile_validation', 'applied', NULL, 'system',
         'marketplace_ready reached: ready_for_review');

      v_count := v_count + 1;
      IF coalesce(array_length(v_titles, 1), 0) < 10 THEN
        v_titles := array_append(v_titles, coalesce(v_app.job_title, ''));
      END IF;
    END LOOP;

    INSERT INTO public.app_14da0f1941_marketplace_ready_activations
      (user_id, activated_count, activated_job_titles, state, attempts, lease_expires_at)
    VALUES
      (NEW.user_id, v_count, v_titles, 'pending', 0, now());
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.app_14da0f1941_on_marketplace_ready_transition() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.app_14da0f1941_on_marketplace_ready_transition() IS
  'PB-JOBS-MARKETPLACE-READY-ACTIVATION-001 + PR-V3 ronda 5: false->true activa candidaturas y encola EMAIL 2. Transiciones v3 con gate cerrada se rechazan (sin promoción/outbox/email). v2 intacto.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Aceptación vinculada al texto exacto mostrado (versión + hash completo)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.pb_accept_marketplace_contract_v3(text);

CREATE OR REPLACE FUNCTION public.pb_accept_marketplace_contract_v3(
  p_lang         text,
  p_text_version text,
  p_hash         text
)
RETURNS TABLE(out_status text, out_marketplace_ready boolean, out_activated_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     uuid := auth.uid();
  v_profile     record;
  v_text        record;
  v_current     text;
  v_consented   text;
  v_gate        text;
  v_lang        text := lower(coalesce(nullif(btrim(p_lang), ''), 'es'));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT user_id, account_type, role, marketplace_ready,
         marketplace_contract_version, marketplace_consent_declared,
         marketplace_consent_version
    INTO v_profile
  FROM public.app_14da0f1941_profiles
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.pb_v3_is_professional_account(v_profile.account_type, v_profile.role) THEN
    RETURN QUERY SELECT 'account_type_not_allowed'::text, FALSE, 0;
    RETURN;
  END IF;

  IF v_profile.marketplace_contract_version = 1 AND v_profile.marketplace_ready IS TRUE THEN
    RETURN QUERY SELECT 'legacy_protected'::text, TRUE, 0;
    RETURN;
  END IF;

  -- ── Consentimiento EXACTO (ronda 5): el texto aceptado debe ser
  -- idéntico al mostrado: versión + idioma + hash SHA-256 completo.
  IF nullif(btrim(coalesce(p_text_version, '')), '') IS NULL
     OR nullif(btrim(coalesce(p_hash, '')), '') IS NULL THEN
    RETURN QUERY SELECT 'contract_changed_review_required'::text, FALSE, 0;
    RETURN;
  END IF;

  -- El texto debe existir, en ese idioma, y NO estar retirado.
  SELECT t.lang, t.text_version, t.canonical_hash, t.status
    INTO v_text
  FROM public.pb_marketplace_contract_texts t
  WHERE t.contract_version = 3
    AND t.text_version = btrim(p_text_version)
    AND t.lang = v_lang
    AND t.status <> 'retired'
  LIMIT 1;

  IF NOT FOUND THEN
    -- Idioma no disponible en esa versión: fallback informativo; el usuario
    -- debe revisar el texto en el idioma resuelto por el servidor.
    RETURN QUERY SELECT 'contract_changed_review_required'::text, FALSE, 0;
    RETURN;
  END IF;

  -- Hash COMPLETO idéntico al preservado: cualquier modificación entre la
  -- visualización y la aceptación invalida el acto.
  IF lower(btrim(p_hash)) <> v_text.canonical_hash THEN
    RETURN QUERY SELECT 'contract_changed_review_required'::text, FALSE, 0;
    RETURN;
  END IF;

  -- La versión debe seguir siendo la vigente (la más reciente no retirada).
  SELECT t.text_version INTO v_current
  FROM public.pb_marketplace_contract_texts t
  WHERE t.contract_version = 3 AND t.status <> 'retired'
  ORDER BY t.created_at DESC
  LIMIT 1;

  IF v_current IS DISTINCT FROM v_text.text_version THEN
    RETURN QUERY SELECT 'contract_changed_review_required'::text, FALSE, 0;
    RETURN;
  END IF;

  -- Gate jurídico/comercial (ronda 4): DRAFT/off → sin efectos.
  v_gate := public.pb_v3_acceptance_gate(v_user_id, v_text.text_version);
  IF v_gate = 'closed' THEN
    RETURN QUERY SELECT 'contract_not_active'::text, FALSE, 0;
    RETURN;
  END IF;

  -- Ya consentido v3 para ESTA MISMA versión: re-sincroniza (no oculta un
  -- estado elegible pendiente). El dispatcher aplica la gate de nuevo.
  IF v_profile.marketplace_contract_version = 3
     AND v_profile.marketplace_consent_declared IS TRUE
     AND v_profile.marketplace_consent_version = 3 THEN
    SELECT split_part(e.consent_text_version, ':', 1) INTO v_consented
    FROM public.app_14da0f1941_marketplace_consent_events e
    WHERE e.user_id = v_user_id AND e.event_type = 'accept'
    ORDER BY e.created_at DESC
    LIMIT 1;

    IF v_consented = v_text.text_version THEN
      IF v_profile.marketplace_ready IS TRUE THEN
        RETURN QUERY SELECT 'already_accepted'::text, TRUE, 0;
        RETURN;
      END IF;
      RETURN QUERY
        SELECT s.out_status, s.out_marketplace_ready, s.out_activated_count
        FROM public.pb_sync_marketplace_ready_state(v_user_id) s;
      RETURN;
    END IF;
    -- Versión distinta a la consentida: cae a una NUEVA aceptación abajo
    -- (nuevo acto, nuevo evento vinculado al nuevo texto).
  END IF;

  -- Aceptación: columnas protegidas por vía canónica. Ronda 5: NO toca
  -- profile_visibility ni cv_visible (elección del usuario; la aceptación
  -- habilita exclusivamente la participación protegida).
  UPDATE public.app_14da0f1941_profiles
     SET marketplace_contract_version = 3,
         marketplace_consent_declared = TRUE,
         marketplace_consent_version = 3,
         marketplace_consent_at = now()
   WHERE user_id = v_user_id;

  -- Evidencia append-only: versión EXACTA + hash COMPLETO + idioma +
  -- timestamp (created_at) + identidad autenticada (user_id).
  INSERT INTO public.app_14da0f1941_marketplace_consent_events
    (user_id, contract_version, consent_text_version, source, event_type, consent_lang, consent_text_hash)
  VALUES
    (v_user_id, 3, v_text.text_version || ':' || v_lang || ':' || left(v_text.canonical_hash, 12),
     'wizard_v3', 'accept', v_lang, v_text.canonical_hash);

  RETURN QUERY
    SELECT s.out_status, s.out_marketplace_ready, s.out_activated_count
    FROM public.pb_sync_marketplace_ready_state(v_user_id) s;
END;
$$;

REVOKE ALL ON FUNCTION public.pb_accept_marketplace_contract_v3(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pb_accept_marketplace_contract_v3(text, text, text) TO authenticated;

COMMENT ON FUNCTION public.pb_accept_marketplace_contract_v3(text, text, text) IS
  'PR-V3 ronda 5: aceptación vinculada al texto exacto mostrado (p_text_version + p_hash SHA-256 completo). Discrepancia/versión obsoleta → contract_changed_review_required sin efectos. Cuenta profesional (account_type Y role) + gate. Ya no toca visibilidad.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Retirada: ya no toca la visibilidad del usuario (ronda 5)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pb_withdraw_marketplace_contract_v3()
RETURNS TABLE(out_status text, out_marketplace_ready boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_profile  record;
  v_ev       record;
  v_completion integer;
  v_batch    text := 'withdraw-v3-' || to_char(now(), 'YYYYMMDDHH24MISS');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT user_id, full_name, title, marketplace_ready, onboarding_status,
         profile_completion, marketplace_contract_version,
         marketplace_consent_declared, marketplace_consent_version
    INTO v_profile
  FROM public.app_14da0f1941_profiles
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (v_profile.marketplace_contract_version = 3
          AND v_profile.marketplace_consent_declared IS TRUE
          AND v_profile.marketplace_consent_version = 3) THEN
    RETURN QUERY SELECT 'not_consented'::text, v_profile.marketplace_ready;
    RETURN;
  END IF;

  SELECT e.consent_text_version, e.consent_lang, e.consent_text_hash
    INTO v_ev
  FROM public.app_14da0f1941_marketplace_consent_events e
  WHERE e.user_id = v_user_id AND e.event_type = 'accept'
  ORDER BY e.created_at DESC
  LIMIT 1;

  INSERT INTO public.app_14da0f1941_marketplace_consent_events
    (user_id, contract_version, consent_text_version, source, event_type, consent_lang, consent_text_hash)
  VALUES
    (v_user_id, 3,
     coalesce(v_ev.consent_text_version, 'unknown'),
     'wizard_v3_withdraw', 'withdraw', v_ev.consent_lang, v_ev.consent_text_hash);

  -- Ronda 5: la retirada limpia el consentimiento y degrada el flag, pero
  -- NO toca profile_visibility ni cv_visible: son elección del usuario y
  -- la aceptación ya no los modifica.
  v_completion := public.pb_profile_completion_score(v_user_id);

  UPDATE public.app_14da0f1941_profiles
     SET marketplace_consent_declared = FALSE,
         marketplace_consent_version  = NULL,
         marketplace_consent_at       = NULL,
         marketplace_ready            = FALSE,
         onboarding_status            = public.pb_onboarding_status(
                                          v_completion, FALSE, v_profile.full_name, v_profile.title),
         profile_completion           = v_completion,
         updated_at                   = now()
   WHERE user_id = v_user_id;

  IF v_profile.marketplace_ready IS TRUE THEN
    INSERT INTO public.pb_marketplace_ready_reconcile_log (
      batch_id, dry_run, user_id, prev_ready, prev_status, prev_completion,
      prev_contract_version, prev_consent_declared,
      new_ready, new_status, new_completion, class, applied
    ) VALUES (
      v_batch, FALSE, v_user_id, TRUE, v_profile.onboarding_status,
      v_profile.profile_completion, 3, TRUE,
      FALSE,
      public.pb_onboarding_status(v_completion, FALSE, v_profile.full_name, v_profile.title),
      v_completion,
      'consent_withdrawn_v3_demoted', TRUE
    );
  END IF;

  RETURN QUERY SELECT 'withdrawn'::text, FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.pb_withdraw_marketplace_contract_v3() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pb_withdraw_marketplace_contract_v3() TO authenticated;

COMMENT ON FUNCTION public.pb_withdraw_marketplace_contract_v3() IS
  'PR-V3 ronda 5: retirada del consentimiento v3 (actor=auth.uid()). Evento append-only + limpieza canónica + degradación auditada. Ya no toca la visibilidad del usuario. Candidaturas intactas.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Activación comercial: exige los 11 idiomas de la versión
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pb_marketplace_contract_text_set_status(
  p_text_version text,
  p_new_status   text,
  p_actor        text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current  text;
  v_rank_old int;
  v_rank_new int;
  v_rows     integer;
  v_langs    integer;
BEGIN
  IF p_actor IS NULL OR btrim(p_actor) = '' THEN
    RAISE EXCEPTION 'actor requerido (sello de la transición)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pb_marketplace_contract_texts
    WHERE contract_version = 3 AND text_version = p_text_version
  ) THEN
    RAISE EXCEPTION 'text_version % no existe', p_text_version;
  END IF;
  IF (SELECT count(DISTINCT status) FROM public.pb_marketplace_contract_texts
      WHERE contract_version = 3 AND text_version = p_text_version) > 1 THEN
    RAISE EXCEPTION 'text_version % con estados divergentes por idioma: corregir antes de transicionar', p_text_version;
  END IF;
  SELECT DISTINCT status INTO v_current FROM public.pb_marketplace_contract_texts
  WHERE contract_version = 3 AND text_version = p_text_version;

  v_rank_old := CASE v_current
    WHEN 'draft' THEN 0 WHEN 'legal_approved' THEN 1
    WHEN 'commercially_authorized' THEN 2 WHEN 'active' THEN 3
    WHEN 'retired' THEN 99 END;
  v_rank_new := CASE p_new_status
    WHEN 'legal_approved' THEN 1
    WHEN 'commercially_authorized' THEN 2
    WHEN 'active' THEN 3
    WHEN 'retired' THEN 99 END;

  IF v_rank_new IS NULL THEN
    RAISE EXCEPTION 'status destino inválido: % (válidos: legal_approved, commercially_authorized, active, retired)', p_new_status;
  END IF;
  IF v_current = 'retired' THEN
    RAISE EXCEPTION 'text_version % está retired: no admite más transiciones', p_text_version;
  END IF;
  IF p_new_status <> 'retired' AND v_rank_new <> v_rank_old + 1 THEN
    RAISE EXCEPTION 'orden de ciclo de vida: % → % no permitido (draft → legal_approved → commercially_authorized → active)', v_current, p_new_status;
  END IF;

  -- Ronda 5 P1: la activación comercial exige la disponibilidad y el estado
  -- correcto de los 11 idiomas de la versión.
  IF p_new_status = 'active' THEN
    SELECT count(*) INTO v_langs
    FROM public.pb_marketplace_contract_texts
    WHERE contract_version = 3 AND text_version = p_text_version;
    IF v_langs <> 11 THEN
      RAISE EXCEPTION 'activación bloqueada: la versión % tiene % idiomas; se exigen los 11 idiomas del contrato v3', p_text_version, v_langs;
    END IF;
  END IF;

  UPDATE public.pb_marketplace_contract_texts
     SET status = p_new_status,
         legal_approved_at        = CASE WHEN p_new_status = 'legal_approved' THEN now() ELSE legal_approved_at END,
         legal_approved_by        = CASE WHEN p_new_status = 'legal_approved' THEN p_actor ELSE legal_approved_by END,
         commercial_authorized_at = CASE WHEN p_new_status = 'commercially_authorized' THEN now() ELSE commercial_authorized_at END,
         commercial_authorized_by = CASE WHEN p_new_status = 'commercially_authorized' THEN p_actor ELSE commercial_authorized_by END,
         activated_at             = CASE WHEN p_new_status = 'active' THEN now() ELSE activated_at END,
         activated_by             = CASE WHEN p_new_status = 'active' THEN p_actor ELSE activated_by END,
         retired_at               = CASE WHEN p_new_status = 'retired' THEN now() ELSE retired_at END,
         retired_by               = CASE WHEN p_new_status = 'retired' THEN p_actor ELSE retired_by END
   WHERE contract_version = 3 AND text_version = p_text_version;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.pb_marketplace_contract_text_set_status(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_marketplace_contract_text_set_status(text, text, text) TO service_role;

COMMENT ON FUNCTION public.pb_marketplace_contract_text_set_status(text, text, text) IS
  'PR-V3 ronda 5: transiciones de ciclo de vida con orden forzado. La activación (active) exige los 11 idiomas presentes. service_role.';
