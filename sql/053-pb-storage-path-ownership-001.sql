-- ══════════════════════════════════════════════════════════════════════════════
-- PB-STORAGE-PATH-OWNERSHIP-001 — PATH + OWNER_ID OWNERSHIP EN STORAGE OBJECTS
--
-- MOTIVO (hallazgo P2 de la monitorización 72h de PB-PROFILE-STABILITY-001,
-- RCA corregido por el PO el 2026-10-18):
--   Las policies owner-only sin restricción de path permitían a cualquier
--   usuario autenticado CREAR objetos nuevos dentro de la carpeta de otro
--   usuario (el owner del objeto pasa a ser quien lo sube, por lo que el
--   chequeo owner = auth.uid() se satisface aunque el path sea ajeno):
--     - certificates_owner_insert / certificates_owner_update
--       (bucket app_14da0f1941_certificates)
--     - worker_documents_owner_insert / worker_documents_owner_update
--       (bucket worker-documents)
--   Probado en QA el 2026-10-18: usuario B creó un objeto en la carpeta de A
--   (probe eliminado; limpieza verificada). Lectura/firma/borrado cross-user
--   siguen DENIED; el defecto se limita a INSERT/UPDATE.
--
--   En el bucket de certificados existían además DOS familias permisivas
--   duplicadas de INSERT/UPDATE restringidas por path
--   (cert_user_upload/update y app_14da0f1941_certs_user_insert/update):
--   al combinarse por OR con las owner-only, las owner-only hacían de
--   bypass del chequeo de carpeta.
--
-- DISEÑO:
--   Para authenticated, INSERT y UPDATE exigen SIMULTÁNEAMENTE:
--     1. bucket_id correcto;
--     2. owner_id = auth.uid()  (owner_id es la columna canónica; la columna
--        `owner` está DEPRECADA y no se usa en las nuevas policies);
--     3. el primer segmento de name = auth.uid()::text (carpeta propia).
--   UPDATE incluye USING y WITH CHECK (misma condición): impide tanto
--   actualizar objetos ajenos como MOVER/COPIAR objetos propios a carpetas
--   ajenas (el rename/move Interno es un UPDATE de name).
--
--   CONSOLIDACIÓN (las policies permisivas se combinan por OR, por lo que
--   añadir otra policy PERMISSIVA no cierra nada): se ELIMINAN las policies
--   amplias y duplicadas y se crean UNA policy canónica por bucket+cmd.
--   No se añade ninguna policy RESTRICTIVE (la consolidación elimina la
--   fuente de la OR amplia; una RESTRICTIVE añadiría complejidad sin
--   beneficio).
--
--   NO TOCAR:
--     - certificates_service_role_all / worker_documents_service_role_all
--       (service_role): intactas.
--     - SELECT/DELETE de ambos buckets (owner-only o path-only, auto-
--       contenidas, sin agujero): intactas. El cambio es mínimo y centrado
--       en el defecto real.
--     - Buckets avatars y feedback-screenshots: intactos (sin defecto
--       auditado).
--
-- COMPATIBILIDAD VERIFICADA (2026-10-18, producción READ-ONLY):
--   0 objetos incompatibles en ambos buckets — 202 objetos en
--   app_14da0f1941_certificates y 48 en worker-documents cumplen
--   foldername(name)[1] = owner_id = owner. Ningún objeto existente pierde
--   acceso.
--
-- ROLLBACK: docs/PB-STORAGE-PATH-OWNERSHIP-001.md §Rollback (snapshot exacto
-- de las policies previas, incluidas las eliminadas).
--
-- APLICACIÓN: NO aplicar sin GO explícito del PO (QA y producción comparten
-- el proyecto Supabase mwdauubztjxkbrefirbg).
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Bucket app_14da0f1941_certificates ───────────────────────────────────────

-- INSERT: eliminar las 3 permisivas solapadas (1 owner-only con agujero +
-- 2 duplicadas path-only) y crear la canónica.
DROP POLICY IF EXISTS certificates_owner_insert ON storage.objects;        -- owner-only (AGUJERO)
DROP POLICY IF EXISTS cert_user_upload ON storage.objects;                  -- path-only (duplicada)
DROP POLICY IF EXISTS app_14da0f1941_certs_user_insert ON storage.objects;  -- path-only (duplicada)

CREATE POLICY certificates_authenticated_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'app_14da0f1941_certificates'
    AND owner_id = auth.uid()::text
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE: eliminar las 3 permisivas solapadas y crear la canónica con
-- USING + WITH CHECK.
DROP POLICY IF EXISTS certificates_owner_update ON storage.objects;        -- owner-only (AGUJERO)
DROP POLICY IF EXISTS cert_user_update ON storage.objects;                  -- path-only (duplicada)
DROP POLICY IF EXISTS app_14da0f1941_certs_user_update ON storage.objects;  -- path-only (duplicada, sin WITH CHECK)

CREATE POLICY certificates_authenticated_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'app_14da0f1941_certificates'
    AND owner_id = auth.uid()::text
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'app_14da0f1941_certificates'
    AND owner_id = auth.uid()::text
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── Bucket worker-documents ──────────────────────────────────────────────────

DROP POLICY IF EXISTS worker_documents_owner_insert ON storage.objects;    -- owner-only (AGUJERO)
DROP POLICY IF EXISTS worker_documents_owner_update ON storage.objects;    -- owner-only (AGUJERO)

CREATE POLICY worker_documents_authenticated_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'worker-documents'
    AND owner_id = auth.uid()::text
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY worker_documents_authenticated_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'worker-documents'
    AND owner_id = auth.uid()::text
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'worker-documents'
    AND owner_id = auth.uid()::text
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;
