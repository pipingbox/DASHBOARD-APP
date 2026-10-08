-- ══════════════════════════════════════════════════════════════════════════════
-- PB-GROWTH-GATE-PERMISSIONS-403-001 — notifications: capa de escritura completa.
--
-- Complementa sql/023 (que otorgó SELECT/UPDATE/DELETE a nivel Data API).
-- Dos defectos de clase distinta descubiertos al validar la regresión completa:
--
-- 1) CLASE A — falta GRANT INSERT (mismo patrón que el resto de sql/023):
--    * Consumer: `createNotification()` (app/frontend/src/lib/notifications.ts)
--      inserta DESDE EL NAVEGADOR con la sesión del usuario.
--    * `notifyReferralJoined()` (useAuth.tsx:118, referrals.ts:478) notifica al
--      REFERRER — un usuario DISTINTO del actor — al completarse un referral.
--    * La política RLS `authenticated_insert_notifications`
--      (INSERT TO authenticated WITH CHECK (true)) ya existía precisamente para
--      ese flujo cross-recipient (así lo exige referrals.spec.ts T4/T5, que
--      esperan 201).
--    * Sin el privilegio de tabla, TODAS las notificaciones creadas desde el
--      cliente fallaban 403 y `createNotification` lo tragaba silenciosamente
--      ("notification failure must not break core UX") — el referrer nunca
--      recibía su notificación (el bug exacto que PB-REFERRALS-001 decía haber
--      cerrado).
--
-- 2) CLASE B — falta política DELETE (el GRANT de sql/023 quedó inerte):
--    * Consumer: `deleteNotification()` (notifications.ts:399) →
--      useNotifications.handleDelete → NotificationsBell (UI de borrado).
--    * Sin política DELETE, RLS filtra TODAS las filas → el borrado del
--      usuario afecta a 0 filas (no-op silencioso).
--    * Fix: política owner-scope `(select auth.uid()) = user_id`, el mismo
--      patrón canónico de SELECT/UPDATE.
--
-- SEGURIDAD / ALCANCE:
--   * WITH CHECK (true) de INSERT es PREEXISTENTE y necesario (referral
--     cross-recipient). Endurecerla (p.ej. EXISTS sobre app_..._referrals)
--     podría romper otros dispatchers y queda como follow-up documentado,
--     fuera del alcance mínimo de este gate.
--   * DELETE queda owner-scope: un usuario solo puede borrar SUS notificaciones.
--
-- ROLLBACK:
--   REVOKE INSERT ON public.app_14da0f1941_notifications FROM authenticated;
--   DROP POLICY IF EXISTS users_delete_own_notifications
--     ON public.app_14da0f1941_notifications;
-- ══════════════════════════════════════════════════════════════════════════════

GRANT INSERT ON public.app_14da0f1941_notifications TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_14da0f1941_notifications'
      AND policyname = 'users_delete_own_notifications'
  ) THEN
    CREATE POLICY users_delete_own_notifications
      ON public.app_14da0f1941_notifications
      FOR DELETE
      TO authenticated
      USING ((select auth.uid()) = user_id);
  END IF;
END
$$;

-- ── Verificación post-aplicación ─────────────────────────────────────────────
-- 1) has_table_privilege('authenticated','...notifications','INSERT')          -> true
-- 2) INSERT con JWT propio (type/title de test)                               -> 201
-- 3) DELETE ?title=eq.<test> con JWT propio                                    -> 204 + fila borrada
-- 4) DELETE sobre fila de OTRO usuario                                         -> 0 filas
