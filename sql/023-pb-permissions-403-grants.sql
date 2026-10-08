-- sql/023-pb-permissions-403-grants.sql
-- PB-GROWTH-GATE-PERMISSIONS-403-001 — GRANTs mínimos a nivel Data API para
-- recursos de usuario leídos legítimamente desde el navegador.
--
-- ROOT CAUSE (reproducido en producción con usuario QA fresco g030, journey
-- signup→callback→onboarding postpone→dashboard→profile→tools→academy,
-- SHA productivo 25dc81c):
--   RLS habilitado + políticas owner-scope CORRECTAS ya existían, pero las
--   tablas se crearon sin GRANT al rol `authenticated` a nivel Data API
--   (SQLSTATE 42501 → PostgREST HTTP 403). PostgREST requiere AMBAS capas:
--   privilegio de tabla (GRANT) Y política RLS. El GRANT por sí solo no es
--   autorización; la RLS por sí sola no basta si el rol no tiene privilegio.
--   403s observados: notifications ×4/visit, tool_usage ×2/visit,
--   cert_alert_prefs ×1/visit, academy courses/lessons ×3/visit.
--
-- POR QUÉ GRANT Y NO OTRA COSA:
--   * Las peticiones son VÁLIDAS (categoría A): la campana de notificaciones
--     (AppShell → useNotifications → fetchNotifications), el historial de
--     herramientas del Dashboard (requireRecentTools), el log de uso de cada
--     tool (logToolUsage), el modal de alertas de certificación
--     (CertAlertPreferences) y el catálogo público de Academy las necesitan.
--   * Los consumers YA están guardados (if (!user?.id) return) — no es un
--     problema de timing de sesión (no categoría D).
--   * Las políticas RLS owner-scope YA existen y son correctas; no se tocan
--     (no categoría B). Solo falta la capa de privilegio de tabla.
--
-- PRIVILEGIOS CONCEDIDOS (mínimos, por operación y consumer):
--
--   app_14da0f1941_notifications  → authenticated: SELECT, UPDATE, DELETE
--     SELECT: campana + badge de no leídas (useNotifications).
--     UPDATE: "marcar como leída" (NotificationList). Las políticas
--       users_read_own/users_update_own_notifications restringen a
--       auth.uid() = user_id.
--     DELETE: `deleteNotification()` (NotificationsBell) borra las propias.
--     NOTA (corregido en sql/026): en el momento de este 023 se documentó
--       erróneamente que INSERT no era necesario y que ya existía política
--       DELETE. La regresión completa (referrals.spec T4/T5) probó que
--       `createNotification()` inserta DESDE EL NAVEGADOR (flujo referral
--       cross-recipient, política authenticated_insert_notifications
--       preexistente) y que faltaba la política DELETE owner-scope.
--       sql/026 concede INSERT y crea users_delete_own_notifications.
--
--   app_14da0f1941_tool_usage → authenticated: SELECT, INSERT
--     SELECT: historial "Herramientas recientes" del Dashboard (solo sus
--       filas vía tool_usage_select_own).
--     INSERT: logToolUsage() al guardar cálculos en las tools
--       (tool_usage_insert_own exige user_id = auth.uid()).
--     NO UPDATE/DELETE: la UI no edita ni borra historial. El dato ES visible
--     para su dueño en el Dashboard — no es telemetría interna oculta.
--
--   app_14da0f1941_cert_alert_prefs → authenticated: SELECT, INSERT, UPDATE
--     SELECT: estado inicial del toggle de alertas (cero filas = estado válido,
--       .maybeSingle() → null, no error).
--     INSERT/UPDATE: upsert de la preferencia (cert_alert_prefs_insert_own /
--       update_own con USING + WITH CHECK auth.uid() = user_id).
--     NO DELETE: la UI no ofrece borrado.
--
--   app_academy_courses / app_academy_lessons → anon, authenticated: SELECT
--     Catálogo PÚBLICO de Academy: la landing /academy renderiza cursos sin
--     sesión (los visitantes de Growth ven el catálogo antes de registrarse).
--     Las políticas existentes restringen a content PUBLISHED
--     (is_published = true) y las lessons a cursos publicados; el contenido
--     premium sigue protegido por entitlement a nivel de datos/RLS.
--     NO escritura para ningún rol API.
--
-- NO SE CONCEDE (legítimos 403 observados, categoría C/E):
--   app_14da0f1941_matching_preferences: la tabla NO EXISTE en el esquema;
--     consumer legacy (ProfileMatchingPreferencesSection) no renderizado.
--     Se deja sin acceso (denegación correcta); su fix es de código y fuera
--     de este gate (riesgo documentado).
--   app_academy_lesson_progress / app_academy_enrollments: las lecciones
--     renderizan desde data local (academy-content); consumers legacy sin
--     superficie visible en el journey. Denegación correcta, sin GRANT.
--
-- SEGURIDAD: sin GRANT ALL, sin acceso amplio a anon (solo catálogo publicado),
-- sin desactivar RLS, sin USING(true), sin SECURITY DEFINER, sin service_role
-- en frontend, sin tocar privilegios de service_role.

BEGIN;

GRANT SELECT, UPDATE, DELETE ON TABLE public.app_14da0f1941_notifications TO authenticated;
GRANT SELECT, INSERT ON TABLE public.app_14da0f1941_tool_usage TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.app_14da0f1941_cert_alert_prefs TO authenticated;
GRANT SELECT ON TABLE public.app_academy_courses TO anon, authenticated;
GRANT SELECT ON TABLE public.app_academy_lessons TO anon, authenticated;

COMMIT;

-- Verificación (read-only) — esperado: authenticated {SELECT,INSERT,UPDATE,DELETE}
-- en notifications; {SELECT,INSERT} en tool_usage; {SELECT,INSERT,UPDATE} en
-- cert_alert_prefs; anon+authenticated {SELECT} en academy courses/lessons:
--   SELECT grantee, table_name, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_schema = 'public'
--     AND table_name IN ('app_14da0f1941_notifications','app_14da0f1941_tool_usage',
--                        'app_14da0f1941_cert_alert_prefs','app_academy_courses','app_academy_lessons')
--   ORDER BY table_name, grantee, privilege_type;
