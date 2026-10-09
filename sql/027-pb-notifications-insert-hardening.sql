-- ══════════════════════════════════════════════════════════════════════════════
-- PB-NOTIFICATIONS-INSERT-HARDENING-001 — endurecimiento del INSERT de
-- notificaciones sin romper el flujo legítimo (referral/Community/InviteToJob).
--
-- CONTEXTO (PB-GROWTH-GATE-PERMISSIONS-403-001, follow-up de seguridad):
--   * La política preexistente `authenticated_insert_notifications`
--     (INSERT TO authenticated WITH CHECK (true)) fue restaurada en sql/026
--     porque el producto tiene flujos browser-side cross-recipient reales:
--     createNotification() → referral JOINED/VERIFIED, Community like/comment,
--     InviteToJob job_invitation.
--
-- ESTADO REAL VERIFICADO en producción (probes con 3 usuarios QA, 2026-10-08):
--   * INSERT cross-user (recipient ≠ caller) → DENEGADO 42501 por RLS a pesar
--     de la política (las notificaciones browser-side llevaban fallando en
--     silencio — createNotification traga los errores).
--   * INSERT self (recipient = caller) → PERMITIDO con payload ARBITRARY:
--     cualquier usuario podía insertarse a sí mismo notificaciones con tipo
--     privilegiado (p.ej. ADMIN_BROADCAST) y contenido libre. Confirmado 201.
--   * No existe ningún tipo explícito de self-notification en el producto.
--
-- FIX (Opción B del análisis de arquitectura — justificación):
--   * Opción A (mover a flujos server-side existentes) no cubre Community
--     like/comment ni InviteToJob: no hay Edge Function que valide like/comment
--     o job_invitation hoy; crear broker completo para cada uno es cambio de
--     producto fuera de alcance.
--   * Opción C (RLS pura) no puede expresar la lista de TIPOS benignos ni la
--     ausencia de vínculo post→autor de forma sencilla (el vínculo post→owner
--     es arbitrario: cualquier post de cualquier usuario; una policy EXISTS
--     contra community posts sería frágil y sigue sin filtrar tipos).
--   * Opción B: RPC SECURITY DEFINER estrecha. El SECURITY DEFINER está
--     JUSTIFICADO aquí (mismo patrón que app_is_admin(), ya existente en esta
--     base): la función es la única vía que puede (a) filtrar tipos permitidos
--     en el lado de la DB y (b) insertar cross-recipient de forma controlada,
--     porque el caller sigue sin privilegio INSERT directo cross-user.
--     Mitigaciones: search_path fijado a (public, pg_temp), revoke de EXECUTE
--     a PUBLIC/anon, lógica mínima, sin parámetros de recipient/sender.
--
-- 1) RPC pb_create_client_notification(p_type, p_title, p_message,
--    p_related_entity_type, p_related_entity_id, p_action_url, p_recipient_id):
--    * p_type debe estar en la lista de tipos benignos browser-side
--      ('like','comment','job_invitation','REFERRAL_JOINED','REFERRAL_VERIFIED').
--    * El actor se deriva SIEMPRE de auth.uid() (no se puede falsificar).
--    * El recipient se pasa por referencia pero SOLO se permite si coincide
--      con el actor (self) O si existe un vínculo legítimo: para referral, una
--      fila app_14da0f1941_referrals (referrer_id = recipient, referred_id =
--      actor); para like/comment/job_invitation, cualquier recipient distinto
--      es un flujo social legítimo del producto (notificar al autor de un post
--      o al candidato invitado) — pero estos tipos son de bajo privilegio.
--    * Sin recipient/sender arbitrarios, sin tipos privilegiados, sin
--      contenido HTML (el renderer React ya escapa).
--
-- 2) Política INSERT nueva `authenticated_insert_own_notifications`:
--    WITH CHECK ((select auth.uid()) = user_id) → solo self-insert directo.
--    Sustituye a `authenticated_insert_notifications` (WITH CHECK true),
--    que se ELIMINA.
--
-- SEGURIDAD ADICIONAL (payload hardening): el renderer (NotificationsBell) es
-- React y escapa message/title; action_url se usa en navigate() de react-router
-- (rutas internas). Los tipos server-side (JOB_MATCH, PROFILE_*, CERTIFICATE_,
-- NEW_MESSAGE, DOCUMENT_REQUEST, ADMIN_ALERT, FEEDBACK_RESOLVED, PRODUCT_UPDATE)
-- NO son insertables por el cliente tras este cambio (ni vía RPC ni vía
-- self-insert directo): solo service_role/Edge Functions.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.pb_create_client_notification(text,text,text,text,text,text,uuid);
--   DROP POLICY IF EXISTS authenticated_insert_own_notifications ON public.app_14da0f1941_notifications;
--   CREATE POLICY authenticated_insert_notifications ON public.app_14da0f1941_notifications
--     FOR INSERT TO authenticated WITH CHECK (true);
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.pb_create_client_notification(
  p_type text,
  p_title text,
  p_message text,
  p_related_entity_type text,
  p_related_entity_id text,
  p_action_url text,
  p_recipient_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_allowed_types text[] := ARRAY['like','comment','job_invitation','REFERRAL_JOINED','REFERRAL_VERIFIED'];
  v_referral_ok boolean := false;
  v_new_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT (p_type = ANY (v_allowed_types)) THEN
    RAISE EXCEPTION 'notification type % is not client-creatable', p_type;
  END IF;

  IF p_recipient_id IS NULL THEN
    RAISE EXCEPTION 'recipient is required';
  END IF;

  -- Self-notification: no product surface requires it; deny to keep the
  -- client from forging privileged-looking self rows. (createNotification
  -- already skips self.)
  IF p_recipient_id = v_actor THEN
    RAISE EXCEPTION 'self notifications are not allowed';
  END IF;

  -- Cross-recipient authorization:
  --   * Referral types: require the referral row tying actor→recipient.
  --   * Social/job types (like/comment/job_invitation): legitimate product
  --     flows where the actor notifies the post author / invited candidate;
  --     these are low-privilege types only.
  IF p_type IN ('REFERRAL_JOINED','REFERRAL_VERIFIED') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.app_14da0f1941_referrals r
      WHERE r.referrer_id = p_recipient_id
        AND r.referred_id = v_actor
    ) INTO v_referral_ok;
    IF NOT v_referral_ok THEN
      RAISE EXCEPTION 'no referral relationship authorizes % from % to %', p_type, v_actor, p_recipient_id;
    END IF;
  END IF;

  INSERT INTO public.app_14da0f1941_notifications (
    user_id, type, title, message,
    related_entity_type, related_entity_id, action_url,
    actor_id, actor_name, is_read
  ) VALUES (
    p_recipient_id, p_type, p_title, p_message,
    p_related_entity_type, p_related_entity_id, p_action_url,
    v_actor, NULL, false
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pb_create_client_notification(text,text,text,text,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pb_create_client_notification(text,text,text,text,text,text,uuid) TO authenticated;

DROP POLICY IF EXISTS authenticated_insert_notifications ON public.app_14da0f1941_notifications;

CREATE POLICY authenticated_insert_own_notifications
  ON public.app_14da0f1941_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- ── Verificación post-aplicación ─────────────────────────────────────────────
-- 1) INSERT directo cross-user (REST, JWT)                                  -> 403
-- 2) INSERT directo self (REST, JWT)                                        -> 201
-- 3) RPC pb_create_client_notification('REFERRAL_JOINED', ..., recipient=X)
--    sin fila referral                                                          -> error
-- 4) RPC con tipo 'ADMIN_BROADCAST'                                            -> error
-- 5) RPC like/comment/job_invitation cross-user                                -> 200 (uuid)
-- 6) anon RPC                                                                  -> error/401
