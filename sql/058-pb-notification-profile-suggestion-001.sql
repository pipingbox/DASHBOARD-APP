-- ══════════════════════════════════════════════════════════════════════════════
-- PB-NOTIFICATION-PROFILE-INCOMPLETE-FIX-001 — camino backend estrecho y
-- dedicado para las sugerencias de mejora de perfil (PROFILE_INCOMPLETE).
--
-- CONTEXTO (incidencia confirmada 23/10/2026, PostHog):
--   * notifyProfileSuggestions() (PB-NOTIF-001 Fase 3) enviaba notificaciones
--     PROFILE_INCOMPLETE al propio usuario a través de createNotification()
--     → RPC pb_create_client_notification.
--   * Esa RPC es el boundary de seguridad para notificaciones cross-user:
--     allowlist {like, comment, job_invitation, REFERRAL_JOINED,
--     REFERRAL_VERIFIED} + prohibición explícita de self-recipient.
--   * PROFILE_INCOMPLETE fallaba por dos razones: (1) tipo no client-creatable
--     → P0001; (2) destinatario = propio actor → prohibido.
--   * Resultado: 21 × notification_rpc_error (6 usuarios, todos
--     "PROFILE_INCOMPLETE: P0001") y CERO sugerencias reales entregadas
--     (verificado: 0 filas PROFILE_INCOMPLETE en producción, ventana 7 días).
--
-- DECISIÓN DE ARQUITECTURA (RPC dedicada vs Edge Function):
--   * La operación es pura de base de datos (leer perfil canónico + insertar
--     notificación) y no requiere secrets, colas ni I/O externo.
--   * Reutiliza el patrón de seguridad ya establecido en esta base
--     (pb_create_client_notification, app_update_application_status):
--     SECURITY DEFINER + search_path fijado + REVOKE a PUBLIC/anon.
--   * Una Edge Function añadiría infraestructura (deploy, secrets,
--     service_role) sin ganancia de seguridad. Se descarta.
--
-- CONTRATO DE SEGURIDAD DE pb_create_profile_suggestions():
--   * CERO parámetros: el navegador no controla tipo, actor, destinatario,
--     contenido, action_url ni related_entity_id. Nada falsificable.
--   * Usuario derivado SIEMPRE de auth.uid().
--   * Tipo FIJO 'PROFILE_INCOMPLETE' (literal en el cuerpo, no inyectable).
--   * Gaps derivados del estado canónico del perfil (SELECT sobre
--     app_14da0f1941_profiles): la sugerencia solo se crea si el campo está
--     realmente vacío según la base. El cliente no puede pedir sugerencias
--     para campos completados.
--   * Campos evaluados: title, skills, location, years_experience,
--     availability_status (todos con columna canónica real).
--     NOTA: 'languages' se ELIMINA del set — no existe columna ni input de
--     formulario (sugerencia fantasma inalcanzable que solo generaba ruido).
--   * Cooldown de 30 días por campo (related_entity_id = 'field:<key>'),
--     deduplicación server-side (antes era una raza client-side).
--   * Máximo 3 sugerencias CREADAS por llamada. Los gaps restantes se
--     ofrecen en llamadas posteriores (cada campo, como máximo, una vez
--     por ventana de 30 días — verificado en QA).
--   * Fail-open: sin fila de perfil → RETURN 0, sin excepción. El guardado
--     del perfil jamás se ve afectado por este camino.
--
-- NO TOCA (boundary intacto):
--   * pb_create_client_notification: definición, allowlist, grants y
--     self-notification ban SIN CAMBIOS.
--   * RLS/grants de app_14da0f1941_notifications: SIN CAMBIOS.
--   * Jobs, referrals, Community, Marketplace Ready, email transaccional.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.pb_create_profile_suggestions();
--   (El frontend hace fail-open: las sugerencias dejan de crearse pero el
--   guardado del perfil no se ve afectado en ningún caso.)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.pb_create_profile_suggestions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_title text;
  v_skills text[];
  v_location text;
  v_years integer;
  v_availability text;
  v_fields text[] := ARRAY['title', 'skills', 'location', 'years_experience', 'availability_status'];
  v_field text;
  v_missing boolean;
  v_message text;
  v_created integer := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Estado canónico del perfil: única fuente de verdad para los gaps.
  SELECT p.title, p.skills, p.location, p.years_experience, p.availability_status
    INTO v_title, v_skills, v_location, v_years, v_availability
    FROM public.app_14da0f1941_profiles AS p
   WHERE p.user_id = v_user;

  -- Sin fila de perfil no hay nada que sugerir: fail-open, sin error.
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  FOREACH v_field IN ARRAY v_fields LOOP
    -- Límite de 3 sugerencias por llamada (paridad con el contrato anterior).
    IF v_created >= 3 THEN
      EXIT;
    END IF;

    CASE v_field
      WHEN 'title' THEN
        v_missing := (v_title IS NULL OR btrim(v_title) = '');
      WHEN 'skills' THEN
        v_missing := (v_skills IS NULL OR cardinality(v_skills) = 0);
      WHEN 'location' THEN
        v_missing := (v_location IS NULL OR btrim(v_location) = '');
      WHEN 'years_experience' THEN
        v_missing := (v_years IS NULL OR v_years = 0);
      WHEN 'availability_status' THEN
        v_missing := (v_availability IS NULL);
      ELSE
        v_missing := false;
    END CASE;

    IF NOT v_missing THEN
      CONTINUE;
    END IF;

    -- Cooldown de 30 días por campo: la misma sugerencia no se repite.
    IF EXISTS (
      SELECT 1
        FROM public.app_14da0f1941_notifications AS n
       WHERE n.user_id = v_user
         AND n.type = 'PROFILE_INCOMPLETE'
         AND n.related_entity_id = 'field:' || v_field
         AND n.created_at > now() - interval '30 days'
    ) THEN
      CONTINUE;
    END IF;

    v_message := CASE v_field
      WHEN 'title' THEN 'Añade tu especialización (ej. Piping Designer, Welder) para aparecer en búsquedas relevantes.'
      WHEN 'skills' THEN 'Añade tus habilidades técnicas para mejorar tu compatibilidad con ofertas.'
      WHEN 'location' THEN 'Añade tu ubicación para recibir ofertas locales y proyectos cercanos.'
      WHEN 'years_experience' THEN 'Añade tus años de experiencia para que las empresas puedan evaluar tu perfil correctamente.'
      WHEN 'availability_status' THEN 'Indica tu disponibilidad actual para recibir invitaciones de empresas.'
    END;

    INSERT INTO public.app_14da0f1941_notifications (
      user_id, type, title, message, related_entity_type, related_entity_id,
      action_url, actor_id, actor_name, is_read
    ) VALUES (
      v_user, 'PROFILE_INCOMPLETE', 'Completa tu perfil', v_message, 'profile',
      'field:' || v_field, '/profile', v_user, NULL, false
    );

    v_created := v_created + 1;
  END LOOP;

  RETURN v_created;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pb_create_profile_suggestions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pb_create_profile_suggestions() TO authenticated;

-- ── Verificación post-aplicación (QA) ────────────────────────────────────────
-- 1) RPC como authenticated con perfil incompleto            -> integer >= 1
--    y filas PROFILE_INCOMPLETE con related_entity_id='field:<key>'
-- 2) RPC inmediata de nuevo                                   -> 0 nuevas
--    (cooldown 30 días deduplica por campo)
-- 3) RPC anon                                                 -> error/401
-- 4) Sin parámetro de recipient: imposible falsificar destino
-- 5) pb_create_client_notification sin cambios (allowlist, grants, self-ban)
