-- ══════════════════════════════════════════════════════════════════════════════
-- PB-GROWTH-GATE-ONBOARDING-001 — "Completar después" / onboarding postponement.
--
-- ROOT CAUSE que resuelve: OnboardingGate muestra el wizard a todo usuario con
-- onboarding no completado y perfil sin datos básicos. "Completar después"
-- (skipOnboarding) no dejaba NINGÚN rastro persistente de la decisión del
-- usuario, así que el gate volvía a atraparle en el wizard tras refreshProfile():
-- sin app shell, sin sign-out por UI, sin forma de posponer. Reproducido en
-- producción durante PB-GROWTH-GATE-AUTH-E2E-001.
--
-- POR QUÉ UNA COLUMNA NUEVA Y NO UN NUEVO onboarding_status:
--   * `profiles_privilege_guard` prohíbe al cliente escribir onboarding_status
--     ("Columna protegida"): un status ONBOARDING_POSTPONED no podría ser
--     escrito por el wizard desde el navegador.
--   * `pb_complete_onboarding` (RPC) y `recalculate-profiles` RECALCULAN
--     onboarding_status a partir de los datos: cualquier valor de posposición
--     guardado en esa columna sería sobrescrito y el usuario quedaría
--     re-atrapado silenciosamente.
--   Esta columna NO la toca ningún backend: es una señal exclusiva del
--   usuario ("decidí posponer"), escrita y borrada solo por el wizard.
--
-- SEMÁNTICA:
--   * NULL  → el usuario nunca pospuso (o ya completó): comportamiento actual.
--   * NOT NULL → el usuario eligió "Completar después": OnboardingGate NO le
--     atrapa; hasCompletedOnboarding() NO cambia (pospuesto ≠ completado) y
--     marketplace_ready NO se ve afectado. El wizard la limpia (NULL) al
--     completar canónicamente y la renueva en cada posposición.
--
-- SEGURIDAD:
--   * Migración aditiva y no destructiva (nullable, sin default, sin backfill).
--   * Sin cambios de RLS: la policy de UPDATE propia del perfil ya permite al
--     usuario escribir columnas no protegidas; `profiles_privilege_guard` no
--     la lista como protegida (es una preferencia del usuario, no un
--     privilegio). No confiere marketplace_ready ni completion.
--   * Usuarios PROFILE_STARTED/AUTH_ONLY atrapados antes de este fix NO se
--     migran masivamente: al ver el wizard pulsarán "Completar después", que
--     ahora sí funciona y los libera de forma self-serve y auditable.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.app_14da0f1941_profiles
  ADD COLUMN IF NOT EXISTS onboarding_postponed_at timestamptz;

COMMENT ON COLUMN public.app_14da0f1941_profiles.onboarding_postponed_at IS
  'PB-GROWTH-GATE-ONBOARDING-001: timestamp de la última vez que el usuario eligió "Completar después" en el wizard. NOT NULL => OnboardingGate no atrapa; NO implica onboarding completado ni marketplace_ready. Solo la escribe/limpia el wizard.';

-- ── Verificación post-aplicación ─────────────────────────────────────────────
-- 1) SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_name = 'app_14da0f1941_profiles'
--      AND column_name = 'onboarding_postponed_at';
--    -> 1 fila: timestamp with time zone / YES
-- 2) El guard NO debe listarla como protegida: un UPDATE propio desde cliente
--    autenticado debe poder fijarla y limpiarla (verificación E2E del gate).
