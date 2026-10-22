-- ══════════════════════════════════════════════════════════════════════════════
-- PB-STORAGE-PATH-OWNERSHIP-001 — ARNÉS SQL AUTOMATIZADO (BEFORE/AFTER)
--
-- Objetivo: reproducir el defecto (fase BEFORE), aplicar el espejo exacto de
-- sql/053 y verificar la matriz completa de ownership (fase AFTER) contra un
-- proyecto Supabase DE DESARROLLO con esquema storage real (PostgreSQL 15+).
--
-- ⚠️ DESTINO VÁLIDO: proyecto Supabase de desarrollo/desechable con esquema
--    storage real (p. ej. un database branch efímero o un proyecto dev).
-- ⚠️ NO EJECUTAR contra mwdauubztjxkbrefirbg (QA y producción COMPARTEN ese
--    proyecto; aplicar políticas ahí requiere GO explícito del PO).
--
-- Requisitos del destino: roles anon/authenticated/service_role (estándar
-- Supabase), storage.objects sin policies previas del test (el arnés las
-- limpia por nombre al final), buckets ausentes o desechables.
--
-- Autocontenido y autolimpieza: crea sus buckets, objetos, policies y un
-- schema qa_po001 de resultados; al final elimina TODO lo creado y verifica
-- cero residuos. Si cualquier caso falla, el DO final lanza excepción con el
-- recuento (el resumen se imprime antes).
--
-- Historial:
--   2026-10-18 — QA original (matriz manual sobre database branch efímera
--     pb-storage-path-ownership-qa, ref zyfylkkzybnadgzrjlgs): 100% PASS.
--   2026-10-19 — este arnés automatiza la misma matriz a nivel SQL para
--     re-acreditar tras integrar origin/main (PR #85: sql/046/048 no tocan
--     policies de storage.objects; verificación de compatibilidad).
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 0. Preparación del entorno de prueba ─────────────────────────────────────

DROP SCHEMA IF EXISTS qa_po001 CASCADE;
CREATE SCHEMA qa_po001;

CREATE TABLE qa_po001.results (
  phase       text NOT NULL,
  test_id     text NOT NULL,
  description text NOT NULL,
  expected    text NOT NULL,
  got         text NOT NULL,
  pass        boolean NOT NULL
);

-- Usuarios sintéticos A (propietario) y B (atacante). No se crean en auth.users:
-- auth.uid() se dirige con request.jwt.claims (igual que hace PostgREST).
-- '11111111-1111-1111-1111-111111111111' = A · '22222222-2222-2222-2222-222222222222' = B

-- Buckets (idénticos a producción; el destino dev no debe tenerlos con datos).
DELETE FROM storage.objects WHERE bucket_id IN ('app_14da0f1941_certificates', 'worker-documents');
DELETE FROM storage.buckets WHERE id IN ('app_14da0f1941_certificates', 'worker-documents');
INSERT INTO storage.buckets (id, name, public) VALUES
  ('app_14da0f1941_certificates', 'app_14da0f1941_certificates', false),
  ('worker-documents', 'worker-documents', false);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Políticas previas de otros entornos de prueba (idempotente).
DO $$
DECLARE p text;
BEGIN
  FOREACH p IN ARRAY ARRAY[
    'certificates_authenticated_insert','certificates_authenticated_update',
    'worker_documents_authenticated_insert','worker_documents_authenticated_update',
    'certificates_owner_insert','certificates_owner_update','certificates_owner_select',
    'certificates_owner_delete','certificates_service_role_all',
    'cert_user_upload','cert_user_update','cert_user_delete',
    'app_14da0f1941_certs_user_insert','app_14da0f1941_certs_user_update','app_14da0f1941_certs_user_delete',
    'worker_documents_owner_insert','worker_documents_owner_update','worker_documents_owner_select',
    'worker_documents_owner_delete','worker_documents_service_role_all'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p);
  END LOOP;
END $$;

-- ── 1. Fase BEFORE: recrear el estado exacto de producción (snapshot §2 doc) ──

CREATE POLICY certificates_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'app_14da0f1941_certificates'::text) AND (owner = auth.uid()));
CREATE POLICY certificates_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING ((bucket_id = 'app_14da0f1941_certificates'::text) AND (owner = auth.uid()))
  WITH CHECK ((bucket_id = 'app_14da0f1941_certificates'::text) AND (owner = auth.uid()));
CREATE POLICY certificates_owner_select ON storage.objects
  FOR SELECT TO authenticated
  USING ((bucket_id = 'app_14da0f1941_certificates'::text) AND (owner = auth.uid()));
CREATE POLICY certificates_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING ((bucket_id = 'app_14da0f1941_certificates'::text) AND (owner = auth.uid()));
CREATE POLICY cert_user_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'app_14da0f1941_certificates'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));
CREATE POLICY cert_user_update ON storage.objects
  FOR UPDATE TO authenticated
  USING ((bucket_id = 'app_14da0f1941_certificates'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));
CREATE POLICY cert_user_delete ON storage.objects
  FOR DELETE TO authenticated
  USING ((bucket_id = 'app_14da0f1941_certificates'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));
CREATE POLICY app_14da0f1941_certs_user_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'app_14da0f1941_certificates'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));
CREATE POLICY app_14da0f1941_certs_user_update ON storage.objects
  FOR UPDATE TO authenticated
  USING ((bucket_id = 'app_14da0f1941_certificates'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));
CREATE POLICY app_14da0f1941_certs_user_delete ON storage.objects
  FOR DELETE TO authenticated
  USING ((bucket_id = 'app_14da0f1941_certificates'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));
CREATE POLICY certificates_service_role_all ON storage.objects
  FOR ALL TO service_role
  USING ((bucket_id = 'app_14da0f1941_certificates'::text))
  WITH CHECK ((bucket_id = 'app_14da0f1941_certificates'::text));

CREATE POLICY worker_documents_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'worker-documents'::text) AND (owner = auth.uid()));
CREATE POLICY worker_documents_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING ((bucket_id = 'worker-documents'::text) AND (owner = auth.uid()))
  WITH CHECK ((bucket_id = 'worker-documents'::text) AND (owner = auth.uid()));
CREATE POLICY worker_documents_owner_select ON storage.objects
  FOR SELECT TO authenticated
  USING ((bucket_id = 'worker-documents'::text) AND (owner = auth.uid()));
CREATE POLICY worker_documents_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING ((bucket_id = 'worker-documents'::text) AND (owner = auth.uid()));
CREATE POLICY worker_documents_service_role_all ON storage.objects
  FOR ALL TO service_role
  USING ((bucket_id = 'worker-documents'::text))
  WITH CHECK ((bucket_id = 'worker-documents'::text));

DO $$
DECLARE
  v_a constant uuid := '11111111-1111-1111-1111-111111111111';
  v_b constant uuid := '22222222-2222-2222-2222-222222222222';
  v_rows int;
  v_got text;
BEGIN
  -- B1: A sube a su propia carpeta (certificates) → ALLOWED (control positivo)
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_a::text)::text, true);
  v_got := null;
  BEGIN
    EXECUTE format(
      'INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata) VALUES (%L, %L, %L, %L, %L, %L)',
      '11111111-1111-1111-1111-11111111aa01', 'app_14da0f1941_certificates',
      v_a::text || '/qa-po001-cert.pdf', v_a, v_a::text, '{"mimetype":"application/pdf"}');
    v_got := 'allowed';
  EXCEPTION WHEN insufficient_privilege THEN v_got := 'denied_42501';
  WHEN OTHERS THEN v_got := 'error_' || sqlstate;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO qa_po001.results VALUES ('BEFORE','B1','A sube a su carpeta (certificates)','allowed',v_got, v_got = 'allowed');

  -- B2: A sube a su propia carpeta (worker-documents) → ALLOWED (control positivo)
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_a::text)::text, true);
  v_got := null;
  BEGIN
    EXECUTE format(
      'INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata) VALUES (%L, %L, %L, %L, %L, %L)',
      '11111111-1111-1111-1111-11111111aa02', 'worker-documents',
      v_a::text || '/qa-po001-cv.pdf', v_a, v_a::text, '{"mimetype":"application/pdf"}');
    v_got := 'allowed';
  EXCEPTION WHEN insufficient_privilege THEN v_got := 'denied_42501';
  WHEN OTHERS THEN v_got := 'error_' || sqlstate;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO qa_po001.results VALUES ('BEFORE','B2','A sube a su carpeta (worker-documents)','allowed',v_got, v_got = 'allowed');

  -- B3: B crea objeto NUEVO en la carpeta de A (certificates) → ALLOWED = DEFECTO
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_b::text)::text, true);
  v_got := null;
  BEGIN
    EXECUTE format(
      'INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata) VALUES (%L, %L, %L, %L, %L, %L)',
      '22222222-2222-2222-2222-22222222bb01', 'app_14da0f1941_certificates',
      v_a::text || '/qa-po001-evil-b.pdf', v_b, v_b::text, '{"mimetype":"application/pdf"}');
    v_got := 'allowed';
  EXCEPTION WHEN insufficient_privilege THEN v_got := 'denied_42501';
  WHEN OTHERS THEN v_got := 'error_' || sqlstate;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO qa_po001.results VALUES ('BEFORE','B3','B crea objeto en carpeta de A (certificates) — defecto','allowed',v_got, v_got = 'allowed');

  -- B4: B crea objeto NUEVO en la carpeta de A (worker-documents) → ALLOWED = DEFECTO
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_b::text)::text, true);
  v_got := null;
  BEGIN
    EXECUTE format(
      'INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata) VALUES (%L, %L, %L, %L, %L, %L)',
      '22222222-2222-2222-2222-22222222bb02', 'worker-documents',
      v_a::text || '/qa-po001-evil-b.pdf', v_b, v_b::text, '{"mimetype":"application/pdf"}');
    v_got := 'allowed';
  EXCEPTION WHEN insufficient_privilege THEN v_got := 'denied_42501';
  WHEN OTHERS THEN v_got := 'error_' || sqlstate;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO qa_po001.results VALUES ('BEFORE','B4','B crea objeto en carpeta de A (worker-documents) — defecto','allowed',v_got, v_got = 'allowed');
END $$;

-- ── 2. Aplicar sql/053 (espejo EXACTO de la migración) ───────────────────────

DROP POLICY IF EXISTS certificates_owner_insert ON storage.objects;
DROP POLICY IF EXISTS cert_user_upload ON storage.objects;
DROP POLICY IF EXISTS app_14da0f1941_certs_user_insert ON storage.objects;

CREATE POLICY certificates_authenticated_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'app_14da0f1941_certificates'
    AND owner_id = auth.uid()::text
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS certificates_owner_update ON storage.objects;
DROP POLICY IF EXISTS cert_user_update ON storage.objects;
DROP POLICY IF EXISTS app_14da0f1941_certs_user_update ON storage.objects;

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

DROP POLICY IF EXISTS worker_documents_owner_insert ON storage.objects;
DROP POLICY IF EXISTS worker_documents_owner_update ON storage.objects;

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

-- ── 3. Fase AFTER: matriz completa ────────────────────────────────────────────

DO $$
DECLARE
  v_a constant uuid := '11111111-1111-1111-1111-111111111111';
  v_b constant uuid := '22222222-2222-2222-2222-222222222222';
  v_rows int;
  v_got text;
BEGIN
  -- A1: A sube a su carpeta (certificates) → ALLOWED
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_a::text)::text, true);
  v_got := null;
  BEGIN
    EXECUTE format(
      'INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata) VALUES (%L, %L, %L, %L, %L, %L)',
      '11111111-1111-1111-1111-11111111aa03', 'app_14da0f1941_certificates',
      v_a::text || '/qa-po001-cert-2.pdf', v_a, v_a::text, '{"mimetype":"application/pdf"}');
    v_got := 'allowed';
  EXCEPTION WHEN insufficient_privilege THEN v_got := 'denied_42501';
  WHEN OTHERS THEN v_got := 'error_' || sqlstate;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO qa_po001.results VALUES ('AFTER','A1','A sube a su carpeta (certificates)','allowed',v_got, v_got = 'allowed');

  -- A2: A sube a su carpeta (worker-documents) → ALLOWED
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_a::text)::text, true);
  v_got := null;
  BEGIN
    EXECUTE format(
      'INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata) VALUES (%L, %L, %L, %L, %L, %L)',
      '11111111-1111-1111-1111-11111111aa04', 'worker-documents',
      v_a::text || '/qa-po001-cv-2.pdf', v_a, v_a::text, '{"mimetype":"application/pdf"}');
    v_got := 'allowed';
  EXCEPTION WHEN insufficient_privilege THEN v_got := 'denied_42501';
  WHEN OTHERS THEN v_got := 'error_' || sqlstate;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO qa_po001.results VALUES ('AFTER','A2','A sube a su carpeta (worker-documents)','allowed',v_got, v_got = 'allowed');

  -- A3: B crea objeto NUEVO en carpeta de A (certificates) → DENIED
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_b::text)::text, true);
  v_got := null;
  BEGIN
    EXECUTE format(
      'INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata) VALUES (%L, %L, %L, %L, %L, %L)',
      '22222222-2222-2222-2222-22222222bb03', 'app_14da0f1941_certificates',
      v_a::text || '/qa-po001-evil-b2.pdf', v_b, v_b::text, '{"mimetype":"application/pdf"}');
    v_got := 'allowed';
  EXCEPTION WHEN insufficient_privilege THEN v_got := 'denied_42501';
  WHEN OTHERS THEN v_got := 'error_' || sqlstate;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO qa_po001.results VALUES ('AFTER','A3','B crea objeto en carpeta de A (certificates)','denied_42501',v_got, v_got = 'denied_42501');

  -- A4: B crea objeto NUEVO en carpeta de A (worker-documents) → DENIED
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_b::text)::text, true);
  v_got := null;
  BEGIN
    EXECUTE format(
      'INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata) VALUES (%L, %L, %L, %L, %L, %L)',
      '22222222-2222-2222-2222-22222222bb04', 'worker-documents',
      v_a::text || '/qa-po001-evil-b2.pdf', v_b, v_b::text, '{"mimetype":"application/pdf"}');
    v_got := 'allowed';
  EXCEPTION WHEN insufficient_privilege THEN v_got := 'denied_42501';
  WHEN OTHERS THEN v_got := 'error_' || sqlstate;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO qa_po001.results VALUES ('AFTER','A4','B crea objeto en carpeta de A (worker-documents)','denied_42501',v_got, v_got = 'denied_42501');

  -- A5: B hace UPSERT (ON CONFLICT (id) DO UPDATE) sobre objeto EXISTENTE de A,
  --     con path propuesto en carpeta de B → DENIED (la parte UPDATE no ve la fila)
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_b::text)::text, true);
  v_got := null;
  BEGIN
    EXECUTE format(
      'INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata) VALUES (%L, %L, %L, %L, %L, %L)
       ON CONFLICT (id) DO UPDATE SET metadata = %L',
      '11111111-1111-1111-1111-11111111aa01', 'app_14da0f1941_certificates',
      v_b::text || '/qa-po001-upsert.pdf', v_b, v_b::text, '{"mimetype":"application/pdf"}',
      '{"mimetype":"application/pdf","evil":true}');
    v_got := 'allowed';
  EXCEPTION WHEN insufficient_privilege THEN v_got := 'denied_42501';
  WHEN OTHERS THEN v_got := 'error_' || sqlstate;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO qa_po001.results VALUES ('AFTER','A5','B upsert sobre objeto existente de A (ON CONFLICT DO UPDATE)','denied_42501',v_got, v_got = 'denied_42501');

  -- A6: B UPDATE (rename/move) del objeto de A → 0 filas (USING filtra)
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_b::text)::text, true);
  v_got := null;
  BEGIN
    EXECUTE format(
      'UPDATE storage.objects SET name = %L WHERE id = %L',
      v_b::text || '/qa-po001-stolen.pdf', '11111111-1111-1111-1111-11111111aa01');
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_got := case when v_rows > 0 then 'allowed' else 'no_rows' end;
  EXCEPTION WHEN insufficient_privilege THEN v_got := 'denied_42501';
  WHEN OTHERS THEN v_got := 'error_' || sqlstate;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO qa_po001.results VALUES ('AFTER','A6','B renombra/mueve el objeto de A','no_rows',v_got, v_got = 'no_rows');

  -- A7: A MUEVE su propio objeto a la carpeta de B → DENIED (WITH CHECK)
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_a::text)::text, true);
  v_got := null;
  BEGIN
    EXECUTE format(
      'UPDATE storage.objects SET name = %L WHERE id = %L',
      v_b::text || '/qa-po001-escape.pdf', '11111111-1111-1111-1111-11111111aa01');
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_got := case when v_rows > 0 then 'allowed' else 'no_rows' end;
  EXCEPTION WHEN insufficient_privilege THEN v_got := 'denied_42501';
  WHEN OTHERS THEN v_got := 'error_' || sqlstate;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO qa_po001.results VALUES ('AFTER','A7','A mueve objeto propio a carpeta de B (escape de namespace)','denied_42501',v_got, v_got = 'denied_42501');

  -- A8: A renombra su objeto DENTRO de su carpeta → ALLOWED
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_a::text)::text, true);
  v_got := null;
  BEGIN
    EXECUTE format(
      'UPDATE storage.objects SET name = %L WHERE id = %L',
      v_a::text || '/qa-po001-cert-renamed.pdf', '11111111-1111-1111-1111-11111111aa01');
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_got := case when v_rows > 0 then 'allowed' else 'no_rows' end;
  EXCEPTION WHEN insufficient_privilege THEN v_got := 'denied_42501';
  WHEN OTHERS THEN v_got := 'error_' || sqlstate;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO qa_po001.results VALUES ('AFTER','A8','A renombra objeto propio dentro de su carpeta','allowed',v_got, v_got = 'allowed');

  -- A9: A actualiza metadata de su objeto (sin mover) → ALLOWED
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_a::text)::text, true);
  v_got := null;
  BEGIN
    EXECUTE format(
      'UPDATE storage.objects SET metadata = metadata || %L WHERE id = %L',
      '{"qa":"a9"}', '11111111-1111-1111-1111-11111111aa01');
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_got := case when v_rows > 0 then 'allowed' else 'no_rows' end;
  EXCEPTION WHEN insufficient_privilege THEN v_got := 'denied_42501';
  WHEN OTHERS THEN v_got := 'error_' || sqlstate;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO qa_po001.results VALUES ('AFTER','A9','A actualiza metadata de su objeto','allowed',v_got, v_got = 'allowed');

  -- A10: B SELECT del objeto de A → 0 filas
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_b::text)::text, true);
  v_got := null;
  BEGIN
    EXECUTE format(
      'SELECT id FROM storage.objects WHERE id = %L',
      '11111111-1111-1111-1111-11111111aa01');
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_got := case when v_rows > 0 then 'visible' else 'no_rows' end;
  EXCEPTION WHEN OTHERS THEN v_got := 'error_' || sqlstate;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO qa_po001.results VALUES ('AFTER','A10','B lee (SELECT) el objeto de A','no_rows',v_got, v_got = 'no_rows');

  -- A11: B DELETE del objeto de A → 0 filas
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_b::text)::text, true);
  v_got := null;
  BEGIN
    EXECUTE format(
      'DELETE FROM storage.objects WHERE id = %L',
      '11111111-1111-1111-1111-11111111aa01');
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_got := case when v_rows > 0 then 'allowed' else 'no_rows' end;
  EXCEPTION WHEN OTHERS THEN v_got := 'error_' || sqlstate;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO qa_po001.results VALUES ('AFTER','A11','B elimina (DELETE) el objeto de A','no_rows',v_got, v_got = 'no_rows');

  -- A12: anon intenta subir a "su" carpeta (sin uid) → DENIED
  EXECUTE 'SET LOCAL ROLE anon';
  v_got := null;
  BEGIN
    EXECUTE format(
      'INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata) VALUES (%L, %L, %L, %L, %L, %L)',
      '33333333-3333-3333-3333-33333333cc01', 'app_14da0f1941_certificates',
      'anon/qa-po001.pdf', null, null, '{"mimetype":"application/pdf"}');
    v_got := 'allowed';
  EXCEPTION WHEN insufficient_privilege THEN v_got := 'denied_42501';
  WHEN OTHERS THEN v_got := 'error_' || sqlstate;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO qa_po001.results VALUES ('AFTER','A12','anon intenta INSERT','denied_42501',v_got, v_got = 'denied_42501');

  -- A13: service_role crea objeto en carpeta de A (sin sub en JWT) → ALLOWED (bypass RLS)
  EXECUTE 'SET LOCAL ROLE service_role';
  v_got := null;
  BEGIN
    EXECUTE format(
      'INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata) VALUES (%L, %L, %L, %L, %L, %L)',
      '44444444-4444-4444-4444-44444444dd01', 'app_14da0f1941_certificates',
      v_a::text || '/qa-po001-service.pdf', null, null, '{"mimetype":"application/pdf"}');
    v_got := 'allowed';
  EXCEPTION WHEN insufficient_privilege THEN v_got := 'denied_42501';
  WHEN OTHERS THEN v_got := 'error_' || sqlstate;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO qa_po001.results VALUES ('AFTER','A13','service_role crea objeto en carpeta de A (owner_id NULL)','allowed',v_got, v_got = 'allowed');

  -- A14: A inserta en SU carpeta pero declarando owner_id = B → DENIED (chequeo owner_id)
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_a::text)::text, true);
  v_got := null;
  BEGIN
    EXECUTE format(
      'INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata) VALUES (%L, %L, %L, %L, %L, %L)',
      '11111111-1111-1111-1111-11111111aa05', 'app_14da0f1941_certificates',
      v_a::text || '/qa-po001-spoof-owner.pdf', v_b, v_b::text, '{"mimetype":"application/pdf"}');
    v_got := 'allowed';
  EXCEPTION WHEN insufficient_privilege THEN v_got := 'denied_42501';
  WHEN OTHERS THEN v_got := 'error_' || sqlstate;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO qa_po001.results VALUES ('AFTER','A14','A inserta en su carpeta con owner_id ajeno (spoof)','denied_42501',v_got, v_got = 'denied_42501');

  -- A15: A inserta en carpeta de B con owner_id = A → DENIED (chequeo de carpeta)
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_a::text)::text, true);
  v_got := null;
  BEGIN
    EXECUTE format(
      'INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata) VALUES (%L, %L, %L, %L, %L, %L)',
      '11111111-1111-1111-1111-11111111aa06', 'app_14da0f1941_certificates',
      v_b::text || '/qa-po001-into-b.pdf', v_a, v_a::text, '{"mimetype":"application/pdf"}');
    v_got := 'allowed';
  EXCEPTION WHEN insufficient_privilege THEN v_got := 'denied_42501';
  WHEN OTHERS THEN v_got := 'error_' || sqlstate;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO qa_po001.results VALUES ('AFTER','A15','A inserta en carpeta de B con owner_id propio','denied_42501',v_got, v_got = 'denied_42501');

  -- A16: B sube a SU propia carpeta (certificates) → ALLOWED (control positivo)
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_b::text)::text, true);
  v_got := null;
  BEGIN
    EXECUTE format(
      'INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata) VALUES (%L, %L, %L, %L, %L, %L)',
      '22222222-2222-2222-2222-22222222bb05', 'app_14da0f1941_certificates',
      v_b::text || '/qa-po001-b-own.pdf', v_b, v_b::text, '{"mimetype":"application/pdf"}');
    v_got := 'allowed';
  EXCEPTION WHEN insufficient_privilege THEN v_got := 'denied_42501';
  WHEN OTHERS THEN v_got := 'error_' || sqlstate;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO qa_po001.results VALUES ('AFTER','A16','B sube a su propia carpeta (certificates)','allowed',v_got, v_got = 'allowed');

  -- A17: B UPDATE de su propio objeto creado en la fase BEFORE dentro de la
  --      carpeta de A (bb01, owner_id=B, path=A) → 0 filas (path ajeno ahora
  --      bloquea también a su "propietario" en UPDATE) — el objeto queda
  --      huérfano para B: solo service_role/admin puede eliminarlo.
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_b::text)::text, true);
  v_got := null;
  BEGIN
    EXECUTE format(
      'UPDATE storage.objects SET metadata = metadata || %L WHERE id = %L',
      '{"qa":"a17"}', '22222222-2222-2222-2222-22222222bb01');
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_got := case when v_rows > 0 then 'allowed' else 'no_rows' end;
  EXCEPTION WHEN insufficient_privilege THEN v_got := 'denied_42501';
  WHEN OTHERS THEN v_got := 'error_' || sqlstate;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO qa_po001.results VALUES ('AFTER','A17','B ya no puede actualizar su objeto huérfano en carpeta ajena','no_rows',v_got, v_got = 'no_rows');

  -- A18: B DELETE de su objeto huérfano en carpeta de A → ALLOWED.
  --      Las policies DELETE preexistentes son owner-only (certificates_owner_delete:
  --      owner = auth.uid()) y NO restringen path (fuera del alcance de 053, que
  --      solo consolida INSERT/UPDATE). B, como owner de la fila, puede borrar su
  --      propio objeto aunque esté en carpeta ajena: el ataque es auto-limpiable
  --      por el atacante, y A no puede verlo ni borrarlo (owner-only).
  --      Nota: A no puede borrarlo (owner=B) ni verlo (owner-only SELECT); la
  --      limpieza residual la cubre service_role/admin.
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_b::text)::text, true);
  v_got := null;
  BEGIN
    EXECUTE format(
      'DELETE FROM storage.objects WHERE id = %L',
      '22222222-2222-2222-2222-22222222bb01');
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_got := case when v_rows > 0 then 'allowed' else 'no_rows' end;
  EXCEPTION WHEN OTHERS THEN v_got := 'error_' || sqlstate;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO qa_po001.results VALUES ('AFTER','A18','B borra su objeto huérfano via policy DELETE owner-only preexistente (fuera de alcance 053)','allowed',v_got, v_got = 'allowed');
END $$;

-- ── 4. Verificación post-condiciones de estado (no de comportamiento) ─────────

DO $$
BEGIN
  -- Objetos esperados al cierre de la fase AFTER: aa01 (A certs, renombrado),
  --   aa02 (A worker-docs), aa03 (A certs), aa04 (A worker-docs),
  --   bb02 (defecto BEFORE worker-docs, huérfano), dd01 (service_role certs),
  --   bb05 (B certs carpeta propia) = 7. El huérfano bb01 fue borrado por su
  --   propio owner (B) en A18 via DELETE owner-only preexistente.
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id IN ('app_14da0f1941_certificates','worker-documents')) <> 7 THEN
    RAISE EXCEPTION 'PB-STORAGE-PATH-OWNERSHIP-001: recuento inesperado de objetos de prueba';
  END IF;
  -- El objeto huérfano bb01 (creado en BEFORE, carpeta de A, owner B) fue
  -- eliminado por B en A18 (policy DELETE owner-only, fuera de alcance 053).
  IF EXISTS (SELECT 1 FROM storage.objects WHERE id = '22222222-2222-2222-2222-22222222bb01') THEN
    RAISE EXCEPTION 'PB-STORAGE-PATH-OWNERSHIP-001: bb01 debía haber sido borrado en A18';
  END IF;
END $$;

-- ── 5. Limpieza total y verificación de cero residuos ─────────────────────────

DO $$
DECLARE
  p text;
  v_objects int;
  v_policies int;
  v_buckets int;
BEGIN
  DELETE FROM storage.objects WHERE bucket_id IN ('app_14da0f1941_certificates','worker-documents');
  FOREACH p IN ARRAY ARRAY[
    'certificates_authenticated_insert','certificates_authenticated_update',
    'worker_documents_authenticated_insert','worker_documents_authenticated_update',
    'certificates_owner_insert','certificates_owner_update','certificates_owner_select',
    'certificates_owner_delete','certificates_service_role_all',
    'cert_user_upload','cert_user_update','cert_user_delete',
    'app_14da0f1941_certs_user_insert','app_14da0f1941_certs_user_update','app_14da0f1941_certs_user_delete',
    'worker_documents_owner_insert','worker_documents_owner_update','worker_documents_owner_select',
    'worker_documents_owner_delete','worker_documents_service_role_all'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p);
  END LOOP;
  DELETE FROM storage.buckets WHERE id IN ('app_14da0f1941_certificates','worker-documents');

  SELECT count(*) INTO v_objects FROM storage.objects WHERE bucket_id IN ('app_14da0f1941_certificates','worker-documents');
  SELECT count(*) INTO v_policies FROM pg_policies WHERE schemaname='storage' AND tablename='objects';
  SELECT count(*) INTO v_buckets FROM storage.buckets WHERE id IN ('app_14da0f1941_certificates','worker-documents');

  IF v_objects <> 0 OR v_buckets <> 0 THEN
    RAISE EXCEPTION 'PB-STORAGE-PATH-OWNERSHIP-001: residuos tras limpieza (objects=%, buckets=%)', v_objects, v_buckets;
  END IF;
END $$;

-- ── 6. Resumen y veredicto ────────────────────────────────────────────────────

DO $$
DECLARE v_failures int;
BEGIN
  SELECT count(*) INTO v_failures FROM qa_po001.results WHERE NOT pass;
  IF v_failures > 0 THEN
    RAISE EXCEPTION 'PB-STORAGE-PATH-OWNERSHIP-001 QA FAILED: % caso(s) FAIL (ver qa_po001.results)', v_failures;
  END IF;
END $$;

SELECT phase, test_id, description, expected, got, pass
FROM qa_po001.results
ORDER BY phase, test_id;

-- El schema qa_po001 (solo resultados de esta ejecución) puede eliminarse tras
-- revisar el resumen:  DROP SCHEMA qa_po001 CASCADE;
