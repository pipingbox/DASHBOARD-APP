-- ══════════════════════════════════════════════════════════════════════════════
-- PB-MARKETPLACE-READY-CONSISTENCY-001 — P1 HOTFIX
-- Cierre del bypass de columnas privilegiadas en el INSERT inicial de perfil
-- + unificación de la regla canónica de Marketplace Ready.
--
-- ─── RCA DEL BYPASS (investigación read-only aprobada, 2026-10-16) ───────────
-- `pb_profiles_privilege_guard` (migración pb_profile_role_guard_001,
-- 20260904180857) protege el trío canónico (profile_completion,
-- onboarding_status, marketplace_ready) y los flags de empresa
-- (company_verified, company_status) ÚNICAMENTE en la rama UPDATE. En la rama
-- INSERT solo valida `role` y `account_type`.
--
-- Esa asimetría es explotable porque:
--   * `auth.users` NO tiene ningún trigger que precree el perfil: la primera
--     fila la crea SIEMPRE el cliente (useAuth.ensureProfile).
--   * La policy `profiles_insert_own` autoriza a `authenticated` a insertar su
--     propia fila y el GRANT de INSERT es de tabla completa
--     (`authenticated=arwm`), sin privilegios por columna.
--   * El gate de candidaturas `app_14da0f1941_set_application_initial_status()`
--     lee EXCLUSIVAMENTE `profiles.marketplace_ready`.
-- Un usuario recién registrado podía por tanto enviar en ese único INSERT
-- `marketplace_ready=true, profile_completion=100,
-- onboarding_status='MARKETPLACE_READY'`, quedar ready de forma permanente (el
-- guard ya le impide CAMBIARLO después) y saltarse
-- `pending_profile_validation` al aplicar a una oferta.
--
-- Vector secundario cerrado: `profile_visibility` enviada en el INSERT. No es
-- una columna privilegiada (la visibilidad es una elección legítima del
-- usuario y sigue siendo editable por UPDATE), pero declararla 'public' en la
-- creación equivalía a dejar un consentimiento preparado para que un recálculo
-- posterior lo convirtiera en publicación sin que el wizard hubiera confirmado
-- nada. Es exactamente lo que ocurrió en el caso analizado en la RCA.
--
-- ─── CONTRATO CANÓNICO (NO SE MODIFICA EL UMBRAL EN ESTE TICKET) ─────────────
--   marketplace_ready = consentimiento_declarado
--                       AND consentimiento_en_columnas
--                       AND profile_completion >= 30
--
--   * Umbral 30 y los 12 pesos: INTACTOS. Cualquier cambio exige GO de producto
--     y ticket propio (queda abierta la decisión sobre exigir CV/experiencia).
--   * PROMOCIÓN (false -> true): SOLO `pb_complete_onboarding`, que recibe el
--     consentimiento declarado por el wizard (p_marketplace_ready). Ningún otro
--     camino puede promover.
--   * MANTENIMIENTO/DEGRADACIÓN: cualquier recálculo conserva `true` solo si
--     sigue habiendo consentimiento en columnas y completion >= 30; en otro caso
--     degrada a `false`. Nunca promueve.
--   Esto resuelve la divergencia detectada en la RCA: la edge function
--   `recalculate-profiles` derivaba el consentimiento SOLO de
--   profile_visibility/cv_visible y podía promover sin declaración del wizard,
--   mientras el RPC exigía ambas cosas. A partir de esta migración existe UNA
--   sola implementación de la fórmula (SQL) y la edge function delega en ella.
--
-- ─── MODELO DE AMENAZAS / SEGURIDAD ─────────────────────────────────────────
--   * Todas las funciones nuevas son SECURITY INVOKER. No se introduce ningún
--     SECURITY DEFINER nuevo en `public`.
--   * `search_path` fijado a `public` en todas (previene hijacking).
--   * Grants mínimos: REVOKE ALL a PUBLIC/anon/authenticated y EXECUTE solo a
--     service_role. Sin GRANT ALL. No se abre nada a la API pública.
--   * La autorización NO se deriva nunca de `user_metadata` ni de ningún campo
--     controlado por el cliente: el guard usa `current_user` y el claim `role`
--     del JWT verificado, igual que la versión anterior.
--   * El guard normaliza en silencio en lugar de abortar el INSERT: la creación
--     del perfil está en el camino crítico del registro y `ensureProfile` tiene
--     tres reintentos en cascada; un RAISE convertiría un intento de abuso en
--     una denegación de servicio sobre el alta legítima. Se emite WARNING sin
--     PII para que el intento quede en los logs de Postgres.
--   * No se tocan RLS, policies, grants de tabla, triggers de Jobs, outbox,
--     claims ni datos de usuarios. Cero DML sobre filas existentes: esta
--     migración NO reconcilia nada (la reconciliación de las <=7 filas
--     históricas es P2 y requiere su propio GO).
--
-- NOTA DE PARIDAD: los comentarios dentro de los cuerpos de función y los
-- COMMENT ON van sin acentos a propósito, para que el texto aplicado en QA y en
-- producción sea byte a byte idéntico a este archivo y `md5(pg_get_functiondef(...))`
-- sirva como prueba de paridad entre entornos.
--
-- IDEMPOTENTE: solo CREATE OR REPLACE FUNCTION + grants. Reejecutable.
-- ══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. FÓRMULA CANÓNICA — definición única
-- ─────────────────────────────────────────────────────────────────────────────

-- Puerto exacto de recalculate-profiles.calculateCompletion(). A partir de
-- ahora esta función es la ÚNICA definición de la fórmula en el backend: el RPC
-- de onboarding y el RPC de recálculo la llaman, y la edge function delega en
-- el RPC. La copia de app/frontend/src/lib/onboarding.ts queda como
-- previsualización no autoritativa.
-- Pesos: Photo 10 · Full Name 5 · Title 5 · Company 5 · Location 5 · Years 5
--        Skills 10 · Bio 10 · CV 15 · Experience 15 · Certification 10 · Docs 5
CREATE OR REPLACE FUNCTION public.pb_profile_completion_score(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  p           public.app_14da0f1941_profiles;
  v_score     integer := 0;
  v_exp_count integer;
  v_cert_count integer;
  v_doc_count integer;
BEGIN
  SELECT * INTO p
  FROM public.app_14da0f1941_profiles
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_exp_count
  FROM public.app_worker_experiences WHERE user_id = p_user_id;
  SELECT count(*) INTO v_cert_count
  FROM public.app_worker_certifications WHERE user_id = p_user_id;
  SELECT count(*) INTO v_doc_count
  FROM public.app_worker_documents WHERE user_id = p_user_id;

  IF p.avatar_url IS NOT NULL AND btrim(p.avatar_url) <> '' THEN
    v_score := v_score + 10;
  END IF;
  IF p.full_name IS NOT NULL AND btrim(p.full_name) <> '' THEN
    v_score := v_score + 5;
  END IF;
  IF p.title IS NOT NULL AND btrim(p.title) <> '' THEN
    v_score := v_score + 5;
  END IF;
  IF p.company IS NOT NULL AND btrim(p.company) <> '' THEN
    v_score := v_score + 5;
  END IF;
  IF p.location IS NOT NULL AND btrim(p.location) <> '' THEN
    v_score := v_score + 5;
  END IF;
  IF p.years_experience IS NOT NULL AND p.years_experience > 0 THEN
    v_score := v_score + 5;
  END IF;
  IF p.skills IS NOT NULL AND array_length(p.skills, 1) > 0 THEN
    v_score := v_score + 10;
  END IF;
  IF p.bio IS NOT NULL AND length(btrim(p.bio)) > 10 THEN
    v_score := v_score + 10;
  END IF;
  -- hasCv(): canonico cv_storage_bucket+cv_storage_path, con cv_file_url y
  -- cv_url (enlace externo del usuario) como fallbacks vigentes.
  IF (p.cv_storage_bucket IS NOT NULL AND p.cv_storage_path IS NOT NULL)
     OR p.cv_file_url IS NOT NULL
     OR p.cv_url IS NOT NULL THEN
    v_score := v_score + 15;
  END IF;
  IF v_exp_count > 0 THEN
    v_score := v_score + 15;
  END IF;
  IF v_cert_count > 0 THEN
    v_score := v_score + 10;
  END IF;
  IF v_doc_count > 0 THEN
    v_score := v_score + 5;
  END IF;

  RETURN v_score;
END $$;

-- Consentimiento registrado en el perfil (elección de visibilidad del usuario).
-- Puerto exacto de consentsToMarketplace().
CREATE OR REPLACE FUNCTION public.pb_marketplace_consent_columns(
  p_profile_visibility text,
  p_cv_visible boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT (p_profile_visibility = 'public')
      OR (p_profile_visibility IS NULL AND p_cv_visible IS TRUE);
$$;

-- Consentimiento completo = declaración explícita del wizard AND consentimiento
-- registrado en el perfil. Solo el camino de onboarding puede satisfacerlo.
CREATE OR REPLACE FUNCTION public.pb_marketplace_consent(
  p_profile_visibility text,
  p_cv_visible boolean,
  p_declared boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(p_declared, false)
     AND public.pb_marketplace_consent_columns(p_profile_visibility, p_cv_visible);
$$;

-- Escalera de estados. Puerto exacto de getOnboardingStatus().
CREATE OR REPLACE FUNCTION public.pb_onboarding_status(
  p_completion integer,
  p_marketplace_ready boolean,
  p_full_name text,
  p_title text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(p_completion, 0) >= 30 THEN
      CASE WHEN p_marketplace_ready IS TRUE THEN 'MARKETPLACE_READY'
           ELSE 'PROFILE_COMPLETED' END
    WHEN p_full_name IS NOT NULL AND btrim(p_full_name) <> ''
         AND p_title IS NOT NULL AND btrim(p_title) <> '' THEN 'PROFILE_STARTED'
    ELSE 'AUTH_ONLY'
  END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. GUARD — ahora también protege INSERT
-- ─────────────────────────────────────────────────────────────────────────────
-- Diff respecto a la versión vigente (pb_profile_role_guard_001):
--   * La rama INSERT conserva íntegras las validaciones de role/account_type.
--   * La rama INSERT añade la normalización a defaults seguros del trío
--     canónico, de los flags de empresa y de profile_visibility.
--   * La rama UPDATE NO cambia ni una línea.
CREATE OR REPLACE FUNCTION public.pb_profiles_privilege_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_is_privileged boolean;
  v_tampered boolean := false;
BEGIN
  -- Direct database owners/admins are always privileged.
  v_is_privileged := current_user IN ('postgres', 'supabase_admin');

  -- Supabase service_role calls carry 'role' = 'service_role' in request.jwt.claims
  -- even when current_user is 'authenticated' (the JWT is preserved inside the
  -- postgres session via supabase-realtime/auth helpers).
  IF NOT v_is_privileged THEN
    v_is_privileged := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT v_is_privileged THEN
      IF NEW.role IN ('admin', 'jobs_moderator') THEN
        RAISE EXCEPTION 'No se permite crear perfil con role=% desde el cliente.', NEW.role;
      END IF;
      IF NEW.account_type = 'admin' THEN
        RAISE EXCEPTION 'No se permite crear perfil con account_type=admin desde el cliente.';
      END IF;

      -- PB-MARKETPLACE-READY-CONSISTENCY-001: columnas canonicas del backend.
      -- El cliente no decide su propio estado de marketplace ni su completitud:
      -- el perfil nace en el escalon mas bajo y solo pb_complete_onboarding /
      -- pb_recalculate_profile_state (service_role) pueden moverlo.
      IF NEW.profile_completion IS DISTINCT FROM 0
         OR NEW.onboarding_status IS DISTINCT FROM 'AUTH_ONLY'
         OR NEW.marketplace_ready IS DISTINCT FROM false
         OR NEW.company_verified IS DISTINCT FROM false
         OR NEW.company_status IS DISTINCT FROM 'pending'
         OR NEW.profile_visibility IS DISTINCT FROM 'private' THEN
        v_tampered := true;
      END IF;

      NEW.profile_completion := 0;
      NEW.onboarding_status  := 'AUTH_ONLY';
      NEW.marketplace_ready  := false;
      NEW.company_verified   := false;
      NEW.company_status     := 'pending';
      -- La visibilidad sigue siendo una eleccion del usuario, pero se declara
      -- DESPUES, por UPDATE del wizard: no en la creacion de la fila.
      NEW.profile_visibility := 'private';

      IF v_tampered THEN
        -- Sin PII: solo deja constancia del intento en los logs de Postgres.
        RAISE WARNING 'pb_profiles_privilege_guard: INSERT de cliente con columnas canonicas; normalizadas a defaults seguros.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE below this point.
  IF NOT v_is_privileged THEN
    -- role: never admin/jobs_moderator; only transition from NULL/'user' is allowed.
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      IF NEW.role IN ('admin', 'jobs_moderator') THEN
        RAISE EXCEPTION 'No se permite asignar role=% desde el cliente.', NEW.role;
      END IF;
      IF OLD.role IS NOT NULL AND OLD.role <> 'user' AND OLD.role <> NEW.role THEN
        RAISE EXCEPTION 'No se permite cambiar role desde % a %.', OLD.role, NEW.role;
      END IF;
      IF OLD.role IN ('admin', 'jobs_moderator') THEN
        RAISE EXCEPTION 'No se permite modificar role de administrador desde el cliente.';
      END IF;
    END IF;

    -- account_type: never admin; same transition rules as role.
    IF NEW.account_type IS DISTINCT FROM OLD.account_type THEN
      IF NEW.account_type = 'admin' THEN
        RAISE EXCEPTION 'No se permite asignar account_type=admin desde el cliente.';
      END IF;
      IF OLD.account_type IS NOT NULL AND OLD.account_type <> 'user' AND OLD.account_type <> NEW.account_type THEN
        RAISE EXCEPTION 'No se permite cambiar account_type desde % a %.', OLD.account_type, NEW.account_type;
      END IF;
    END IF;

    -- Backend-controlled columns.
    IF NEW.profile_completion IS DISTINCT FROM OLD.profile_completion THEN
      RAISE EXCEPTION 'Columna protegida: profile_completion.';
    END IF;
    IF NEW.marketplace_ready IS DISTINCT FROM OLD.marketplace_ready THEN
      RAISE EXCEPTION 'Columna protegida: marketplace_ready.';
    END IF;
    IF NEW.onboarding_status IS DISTINCT FROM OLD.onboarding_status THEN
      RAISE EXCEPTION 'Columna protegida: onboarding_status.';
    END IF;
    IF NEW.company_verified IS DISTINCT FROM OLD.company_verified THEN
      RAISE EXCEPTION 'Columna protegida: company_verified.';
    END IF;
    IF NEW.company_status IS DISTINCT FROM OLD.company_status THEN
      RAISE EXCEPTION 'Columna protegida: company_status.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. pb_complete_onboarding — mismo contrato, ahora delegando en la fórmula única
-- ─────────────────────────────────────────────────────────────────────────────
-- Firma, semántica, umbral (30) y grants IDÉNTICOS a sql/010. Lo único que
-- cambia es que la fórmula, el predicado de consentimiento y la escalera de
-- estados dejan de estar copiados aquí y pasan a invocarse. Es el ÚNICO camino
-- que puede promover marketplace_ready de false a true.
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
  v_profile_visibility public.app_14da0f1941_profiles.profile_visibility%TYPE;
  v_cv_visible         public.app_14da0f1941_profiles.cv_visible%TYPE;
  v_completion         integer;
  v_marketplace_ready  boolean;
  v_status             text;
  v_rows               integer;
BEGIN
  -- Perfil objetivo: exclusivamente el user_id recibido (el backend lo deriva
  -- del JWT verificado en la edge function).
  SELECT full_name, title, profile_visibility, cv_visible
    INTO v_full_name, v_title, v_profile_visibility, v_cv_visible
  FROM public.app_14da0f1941_profiles
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  v_completion := public.pb_profile_completion_score(p_user_id);

  -- Publicacion = consentimiento declarado por el wizard AND consentimiento
  -- registrado en el perfil AND umbral. Nunca se infiere por completion.
  v_marketplace_ready := public.pb_marketplace_consent(
                           v_profile_visibility, v_cv_visible, p_marketplace_ready
                         )
                         AND v_completion >= 30;

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
-- 4. pb_recalculate_profile_state — recálculo canónico, sin promover
-- ─────────────────────────────────────────────────────────────────────────────
-- Sustituye el cálculo en TypeScript de la edge function `recalculate-profiles`,
-- que era la segunda implementación de la fórmula y el origen de la divergencia
-- de consentimiento descrita en la RCA.
--
-- Diferencia de semántica deliberada frente a la edge function anterior:
--   ANTES: marketplace_ready = consentimiento_en_columnas AND completion >= 30
--          (podía PROMOVER a true sin declaración del wizard).
--   AHORA: marketplace_ready = valor_actual AND consentimiento_en_columnas
--          AND completion >= 30  (mantiene o degrada; nunca promueve).
--
-- ATENCIÓN OPERATIVA: invocar esta función sobre toda la base tiene efecto de
-- reconciliación (corrige profile_completion obsoletos y degrada perfiles ready
-- sin consentimiento o por debajo del umbral). Eso es exactamente el P2 de
-- PB-MARKETPLACE-READY-CONSISTENCY-001 y NO debe ejecutarse en producción sin
-- su GO, su backup lógico y la supresión de emails.
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
    SELECT user_id, full_name, title, profile_visibility, cv_visible,
           profile_completion, onboarding_status, marketplace_ready
    FROM public.app_14da0f1941_profiles
    WHERE p_user_id IS NULL OR user_id = p_user_id
    ORDER BY created_at
    LIMIT GREATEST(COALESCE(p_limit, 2000), 1)
  LOOP
    v_processed := v_processed + 1;

    v_completion := public.pb_profile_completion_score(r.user_id);

    -- Mantener o degradar, nunca promover: la promocion exige la declaracion
    -- explicita del wizard, que este camino no recibe.
    v_ready := (r.marketplace_ready IS TRUE)
               AND public.pb_marketplace_consent_columns(r.profile_visibility, r.cv_visible)
               AND v_completion >= 30;

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

  -- Solo contadores y, cuando se pidio un perfil concreto, su estado: la
  -- respuesta nunca devuelve listados de usuarios (la edge function llego a
  -- volcar hasta 50 nombres y user_ids por llamada).
  RETURN QUERY SELECT v_processed, v_changed,
                      v_caller_completion, v_caller_status, v_caller_ready;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. GRANTS MÍNIMOS — solo backend, nada expuesto a la API pública
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.pb_profile_completion_score(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_profile_completion_score(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pb_marketplace_consent_columns(text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_marketplace_consent_columns(text, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.pb_marketplace_consent(text, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_marketplace_consent(text, boolean, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.pb_onboarding_status(integer, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_onboarding_status(integer, boolean, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.pb_recalculate_profile_state(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_recalculate_profile_state(uuid, integer) TO service_role;

-- pb_complete_onboarding: grants idénticos a sql/010, reafirmados por si el
-- CREATE OR REPLACE se aplicara sobre una base sin ellos.
REVOKE ALL ON FUNCTION public.pb_complete_onboarding(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_complete_onboarding(uuid, boolean) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. COMMENT ON
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON FUNCTION public.pb_profile_completion_score(uuid) IS 'PB-MARKETPLACE-READY-CONSISTENCY-001: definicion UNICA de profile_completion (12 pesos, total 100). La llaman pb_complete_onboarding y pb_recalculate_profile_state; la edge function recalculate-profiles delega en el RPC. No duplicar la formula.';
COMMENT ON FUNCTION public.pb_marketplace_consent_columns(text, boolean) IS 'PB-MARKETPLACE-READY-CONSISTENCY-001: consentimiento registrado en el perfil (profile_visibility/cv_visible). Puerto exacto de consentsToMarketplace().';
COMMENT ON FUNCTION public.pb_marketplace_consent(text, boolean, boolean) IS 'PB-MARKETPLACE-READY-CONSISTENCY-001: consentimiento completo = declaracion explicita del wizard AND consentimiento registrado en el perfil.';
COMMENT ON FUNCTION public.pb_onboarding_status(integer, boolean, text, text) IS 'PB-MARKETPLACE-READY-CONSISTENCY-001: escalera AUTH_ONLY/PROFILE_STARTED/PROFILE_COMPLETED/MARKETPLACE_READY. Puerto exacto de getOnboardingStatus().';
COMMENT ON FUNCTION public.pb_profiles_privilege_guard() IS 'PB-MARKETPLACE-READY-CONSISTENCY-001: protege role/account_type y las columnas canonicas del backend en INSERT (normalizando a defaults seguros) y en UPDATE (rechazando el cambio). Privilegiados: postgres, supabase_admin y JWT con role=service_role.';
COMMENT ON FUNCTION public.pb_complete_onboarding(uuid, boolean) IS 'PB-MARKETPLACE-READY-CONSISTENCY-001: finalizacion canonica del onboarding. Unico camino que puede promover marketplace_ready false->true (exige p_marketplace_ready declarado por el wizard + consentimiento en columnas + completion>=30). Umbral 30 sin cambios.';
COMMENT ON FUNCTION public.pb_recalculate_profile_state(uuid, integer) IS 'PB-MARKETPLACE-READY-CONSISTENCY-001: recalculo canonico de profile_completion/onboarding_status/marketplace_ready. Mantiene o degrada marketplace_ready; NUNCA promueve (eso solo lo hace pb_complete_onboarding con el consentimiento declarado del wizard). Umbral 30 sin cambios.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. VERIFICACIÓN POST-APLICACIÓN (ejecutar y exigir exactamente esto)
-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Ninguna función nueva es SECURITY DEFINER y todas fijan search_path:
--    SELECT proname, prosecdef, proconfig FROM pg_proc
--    WHERE proname IN ('pb_profile_completion_score','pb_marketplace_consent',
--                      'pb_marketplace_consent_columns','pb_onboarding_status',
--                      'pb_recalculate_profile_state','pb_complete_onboarding',
--                      'pb_profiles_privilege_guard');
--    -> prosecdef = false en todas; proconfig = {search_path=public}
-- 2) Grants: solo service_role/EXECUTE para las funciones anteriores
--    (pb_profiles_privilege_guard es un trigger, no necesita EXECUTE público).
--    SELECT routine_name, grantee, privilege_type
--    FROM information_schema.routine_privileges
--    WHERE routine_name LIKE 'pb_%' ORDER BY routine_name, grantee;
-- 3) El trigger sigue siendo el mismo, ahora efectivo en INSERT:
--    SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
--    WHERE tgrelid = 'public.app_14da0f1941_profiles'::regclass AND NOT tgisinternal;
--    -> profiles_privilege_guard BEFORE INSERT OR UPDATE ... FOR EACH ROW
-- 4) Humo con rol authenticated (NO service_role): INSERT de perfil propio con
--    marketplace_ready=true, profile_completion=100,
--    onboarding_status='MARKETPLACE_READY' -> fila creada con 0/AUTH_ONLY/false
--    y profile_visibility='private'.
-- 5) UPDATE con rol authenticated sobre cualquiera de las columnas protegidas ->
--    sigue fallando con 'Columna protegida: ...'.
-- 6) pb_recalculate_profile_state ejecutada dos veces seguidas sobre el mismo
--    perfil -> la segunda devuelve changed = 0 (idempotencia).
-- 7) Paridad entre entornos:
--    SELECT md5(pg_get_functiondef('public.pb_profiles_privilege_guard'::regproc));
--    -> debe coincidir en QA y producción tras aplicar esta migración.
