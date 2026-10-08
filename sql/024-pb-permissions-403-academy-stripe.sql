-- sql/024-pb-permissions-403-academy-stripe.sql
-- PB-GROWTH-GATE-PERMISSIONS-403-001 (continuación de sql/023) — dos recursos
-- adicionales de la MISMA clase, descubiertos en la re-captura productiva
-- posterior a sql/023 (usuario QA g030, ruta /academy):
--
--   * app_academy_progress — 403 ×2 en /academy autenticado.
--     Categoría A: petición VÁLIDA. Academy.tsx muestra el progreso por curso
--     (lecciones completadas del propio usuario) y LessonView/CourseDetail
--     leen + escriben el progreso de la lección ("marcar completada").
--     RLS owner-scope YA existe y es correcta:
--       progress_owner_read   SELECT (auth.uid() = user_id OR admin)
--       progress_owner_write  INSERT WITH CHECK (auth.uid() = user_id)
--       progress_owner_update UPDATE (auth.uid() = user_id OR admin)
--     Falta SOLO el privilegio de tabla → GRANT SELECT, INSERT, UPDATE.
--     NO DELETE: la UI no borra progreso.
--
--   * app_stripe_prices — 403 ×1 en /academy.
--     Categoría A: petición VÁLIDA. lib/academy/pricing.ts carga el catálogo
--     de precios (única fuente de verdad de importes) para mostrar precios de
--     cursos premium; PricingPage hace lo mismo para visitantes anónimos.
--     La política pb_public_read_active_prices ya existe para {anon,
--     authenticated} con (is_active = true): el catálogo está DISEÑADO como
--     público-solo-lectura. Falta el privilegio → GRANT SELECT a anon y
--     authenticated, exactamente los roles de la política. Escritura solo
--     admin (stripe_prices_admin_write) — sin cambios en escrituras.
--
-- SEGURIDAD: mismas garantías que sql/023 — sin GRANT ALL, sin desactivar RLS,
-- sin USING(true), sin SECURITY DEFINER, sin service_role en frontend.

BEGIN;

GRANT SELECT, INSERT, UPDATE ON TABLE public.app_academy_progress TO authenticated;
GRANT SELECT ON TABLE public.app_stripe_prices TO anon, authenticated;

COMMIT;

-- Verificación (read-only):
--   SELECT has_table_privilege('authenticated','public.app_academy_progress','SELECT'),
--          has_table_privilege('authenticated','public.app_academy_progress','INSERT'),
--          has_table_privilege('authenticated','public.app_academy_progress','UPDATE'),
--          has_table_privilege('authenticated','public.app_academy_progress','DELETE'),
--          has_table_privilege('anon','public.app_stripe_prices','SELECT'),
--          has_table_privilege('authenticated','public.app_stripe_prices','SELECT'),
--          has_table_privilege('anon','public.app_stripe_prices','INSERT');
-- Esperado: true,true,true,false,true,true,false
