-- ══════════════════════════════════════════════════════════════════════════════
-- PB-ENT-E0B-BASELINE-DDL-001 — EXTRACTOR READ-ONLY DE DDL LEGACY (BASELINE)
--
-- Propósito: capturar el DDL factual de las tablas legacy de las que depende
-- Enterprise (E1+), desde la base de datos real (producción o QA), para
-- versionarlo bajo docs/baseline/artifacts/ como REFERENCE ONLY.
--
-- GARANTÍAS:
--   * READ-ONLY: se ejecuta dentro de una transacción READ ONLY y solo consulta
--     catálogos (pg_catalog / information_schema). NO lee filas de datos de
--     usuario, NO escribe nada, NO crea objetos permanentes.
--   * SIN PII: no vuelca contenido de tablas; solo metadatos de esquema.
--   * DETERMINISTA: todas las colecciones van ordenadas; no se incluyen OIDs
--     crudos (no estables entre entornos) para que el diff entre capturas sea
--     semántico.
--
-- CÓMO EJECUTAR (ventana autorizada; ver docs/baseline/README.md):
--   Supabase SQL Editor (rol con acceso a catálogos) o psql:
--     1. Descomentar y ajustar los dos SET de abajo (environment / commit).
--     2. Ejecutar el archivo completo.
--     3. Guardar la columna `e0b_baseline` (un único JSON) como
--        docs/baseline/artifacts/legacy-ddl-<env>-<yyyymmdd>.json
--        y registrar sha256 + provenance en docs/baseline/MANIFEST.md.
--
-- NUNCA ejecutar esto como migración: vive en docs/, fuera de sql/ y de
-- cualquier runner. Verificación en docs/baseline/README.md §Seguridad.
-- ══════════════════════════════════════════════════════════════════════════════

-- Parámetros de provenance (opcionales; quedan NULL si no se fijan):
-- SET e0b.environment = 'production';   -- 'production' | 'qa' | 'harness'
-- SET e0b.commit      = '<sha>';        -- commit HEAD del repo en la captura

-- NOTA: PostgreSQL no permite CREATE (ni de objetos temporales) dentro de una
-- transacción READ ONLY, así que los objetos pg_temp se crean fuera y solo la
-- extracción (SELECT sobre catálogos) corre en la transacción read-only.

-- ── Lista de objetivos ────────────────────────────────────────────────────────
-- El harness de tests (sql/test-fixtures/TESTFIXTURE-run-e0b-extractor.sh)
-- sustituye el bloque entre marcadores por sus tablas sintéticas. NO mover los
-- marcadores sin actualizar el harness.
CREATE TEMP TABLE e0b_target_tables(relname text PRIMARY KEY);

-- >>> E0B TARGET LIST >>>
INSERT INTO e0b_target_tables(relname) VALUES
  ('app_14da0f1941_profiles'),
  ('app_14da0f1941_jobs'),
  ('app_14da0f1941_job_applications'),
  ('app_14da0f1941_work_day_logs'),
  ('app_14da0f1941_salary_rate_presets'),
  ('app_worker_certifications'),
  ('app_worker_experiences'),
  ('app_worker_documents'),
  ('app_academy_courses');
-- <<< E0B TARGET LIST <<<

-- ── Extractor ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.e0b_extract() RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $func$
BEGIN
  RETURN (
    WITH tgt AS (
      SELECT c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity, c.relacl
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname IN (SELECT relname FROM e0b_target_tables)
    ),
    -- Columnas: tipo completo, UDT, nullability, default, identity, generated
    cols AS (
      SELECT t.relname AS table_name,
             a.attnum,
             jsonb_build_object(
               'name', a.attname,
               'position', a.attnum,
               'type', format_type(a.atttypid, a.atttypmod),
               'udt_schema', tn.nspname,
               'udt_name', ty.typname,
               'not_null', a.attnotnull,
               'default', pg_get_expr(ad.adbin, ad.adrelid),
               'identity', a.attidentity,      -- '' no, 'a' always, 'd' by default
               'generated', a.attgenerated,    -- '' no, 's' stored
               'sequence', pg_get_serial_sequence(format('%I.%I', 'public', t.relname), a.attname)
             ) AS doc
      FROM tgt t
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
      JOIN pg_type ty ON ty.oid = a.atttypid
      JOIN pg_namespace tn ON tn.oid = ty.typnamespace
      LEFT JOIN pg_attrdef ad ON ad.adrelid = t.oid AND ad.adnum = a.attnum
    ),
    columns_agg AS (
      SELECT table_name, jsonb_agg(doc ORDER BY attnum) AS docs
      FROM cols GROUP BY table_name
    ),
    -- Constraints: PK / FK / UNIQUE / CHECK (+ FK acciones y referencia)
    constraints_agg AS (
      SELECT t.relname AS table_name,
             jsonb_agg(jsonb_build_object(
               'name', con.conname,
               'type', con.contype,            -- p|f|u|c
               'definition', pg_get_constraintdef(con.oid),
               'fk_referenced_table', CASE WHEN con.contype = 'f' THEN con.confrelid::regclass::text END,
               'fk_on_update', CASE WHEN con.contype = 'f' THEN con.confupdtype END,
               'fk_on_delete', CASE WHEN con.contype = 'f' THEN con.confdeltype END
             ) ORDER BY con.conname) AS docs
      FROM pg_constraint con
      JOIN tgt t ON t.oid = con.conrelid
      GROUP BY t.relname
    ),
    -- Índices (incluye parciales y validez)
    indexes_agg AS (
      SELECT t.relname AS table_name,
             jsonb_agg(jsonb_build_object(
               'name', ic.relname,
               'definition', pg_get_indexdef(i.indexrelid),
               'unique', i.indisunique,
               'primary', i.indisprimary,
               'partial', i.indpred IS NOT NULL,
               'valid', i.indisvalid,
               'ready', i.indisready
             ) ORDER BY ic.relname) AS docs
      FROM pg_index i
      JOIN pg_class ic ON ic.oid = i.indexrelid
      JOIN tgt t ON t.oid = i.indrelid
      GROUP BY t.relname
    ),
    -- Triggers de usuario (no internos de constraints) + estado
    triggers_agg AS (
      SELECT t.relname AS table_name,
             jsonb_agg(jsonb_build_object(
               'name', tr.tgname,
               'enabled', tr.tgenabled,        -- O enabled | D disabled | R replica | A always
               'function', tr.tgfoid::regprocedure::text,
               'definition', pg_get_triggerdef(tr.oid)
             ) ORDER BY tr.tgname) AS docs
      FROM pg_trigger tr
      JOIN tgt t ON t.oid = tr.tgrelid
      WHERE NOT tr.tgisinternal
      GROUP BY t.relname
    ),
    -- Policies RLS
    policies_agg AS (
      SELECT p.tablename AS table_name,
             jsonb_agg(jsonb_build_object(
               'name', p.policyname,
               'cmd', p.cmd,
               'permissive', p.permissive,
               'roles', p.roles,
               'qual', p.qual,
               'with_check', p.with_check
             ) ORDER BY p.policyname) AS docs
      FROM pg_policies p
      JOIN tgt t ON t.relname = p.tablename AND p.schemaname = 'public'
      GROUP BY p.tablename
    ),
    -- Grants (acl NULL = privilegios por defecto; grantee 0 = PUBLIC)
    grants_agg AS (
      SELECT t.relname AS table_name,
             jsonb_agg(jsonb_build_object(
               'grantee', CASE WHEN g.grantee = 0 THEN 'PUBLIC' ELSE r.rolname END,
               'privilege', g.privilege_type,
               'grantable', g.is_grantable
             ) ORDER BY CASE WHEN g.grantee = 0 THEN 'PUBLIC' ELSE r.rolname END, g.privilege_type) AS docs
      FROM tgt t
      CROSS JOIN LATERAL aclexplode(t.relacl) g
      LEFT JOIN pg_roles r ON r.oid = g.grantee
      GROUP BY t.relname
    ),
    -- Funciones de las que dependen policies / triggers / constraints / defaults
    dep_functions AS (
      SELECT DISTINCT p.oid, pn.nspname AS schema_name, p.proname,
             p.oid::regprocedure::text AS signature,
             p.prosecdef, p.proconfig
      FROM pg_depend d
      JOIN pg_proc p ON p.oid = d.refobjid
      JOIN pg_namespace pn ON pn.oid = p.pronamespace
      WHERE d.refclassid = 'pg_proc'::regclass
        AND (
          (d.classid = 'pg_policy'::regclass AND d.objid IN (
             SELECT pol.oid FROM pg_policy pol JOIN tgt t ON t.oid = pol.polrelid))
          OR (d.classid = 'pg_trigger'::regclass AND d.objid IN (
             SELECT tr.oid FROM pg_trigger tr JOIN tgt t ON t.oid = tr.tgrelid WHERE NOT tr.tgisinternal))
          OR (d.classid = 'pg_constraint'::regclass AND d.objid IN (
             SELECT con.oid FROM pg_constraint con JOIN tgt t ON t.oid = con.conrelid))
          OR (d.classid = 'pg_attrdef'::regclass AND d.objid IN (
             SELECT ad.oid FROM pg_attrdef ad JOIN tgt t ON t.oid = ad.adrelid))
        )
    ),
    functions_agg AS (
      SELECT jsonb_agg(jsonb_build_object(
               'schema', schema_name,
               'name', proname,
               'signature', signature,
               'security_definer', prosecdef,
               'config', proconfig,
               'external', schema_name <> 'public',
               'definition', CASE WHEN schema_name = 'public' THEN pg_get_functiondef(oid) END
             ) ORDER BY schema_name, proname, signature) AS docs
      FROM dep_functions
    ),
    -- Tipos no built-in (enum / composite / domain) usados por columnas objetivo
    col_type_oids AS (
      SELECT DISTINCT CASE WHEN ty.typcategory = 'A' THEN ty.typelem ELSE ty.oid END AS typoid
      FROM tgt t
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
      JOIN pg_type ty ON ty.oid = a.atttypid
    ),
    types_agg AS (
      SELECT jsonb_agg(jsonb_build_object(
               'schema', bn.nspname,
               'name', bt.typname,
               'kind', bt.typtype,             -- e enum | c composite | d domain
               'enum_labels', CASE WHEN bt.typtype = 'e' THEN (
                  SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
                  FROM pg_enum e WHERE e.enumtypid = bt.oid) END,
               'domain_base_type', CASE WHEN bt.typtype = 'd' THEN bt.typbasetype::regtype::text END,
               'domain_not_null', CASE WHEN bt.typtype = 'd' THEN bt.typnotnull END,
               'domain_default', CASE WHEN bt.typtype = 'd' THEN bt.typdefault END,
               'composite_attrs', CASE WHEN bt.typtype = 'c' THEN (
                  SELECT jsonb_agg(jsonb_build_object(
                           'name', ca.attname,
                           'type', format_type(ca.atttypid, ca.atttypmod))
                         ORDER BY ca.attnum)
                  FROM pg_attribute ca
                  WHERE ca.attrelid = bt.typrelid AND ca.attnum > 0 AND NOT ca.attisdropped) END
             ) ORDER BY bn.nspname, bt.typname) AS docs
      FROM pg_type bt
      JOIN pg_namespace bn ON bn.oid = bt.typnamespace
      WHERE bt.oid IN (SELECT typoid FROM col_type_oids)
        AND bt.typtype IN ('e', 'c', 'd')
        AND bn.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    )
    SELECT jsonb_build_object(
      'baseline_format_version', '1.0',
      'provenance', jsonb_build_object(
        'captured_at_utc', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'database', current_database(),
        'server_version', current_setting('server_version'),
        'current_user', session_user,
        'environment', current_setting('e0b.environment', true),
        'repo_commit', current_setting('e0b.commit', true),
        'extractor', 'docs/baseline/extract-ddl-baseline.sql',
        'extractor_sha256', 'REGISTRAR-EN-MANIFEST-AL-CAPTURAR',
        'read_only', true,
        'contains_data_rows', false
      ),
      'target_tables', (SELECT jsonb_agg(relname ORDER BY relname) FROM e0b_target_tables),
      'missing_tables', (
        SELECT coalesce(jsonb_agg(relname ORDER BY relname), '[]'::jsonb)
        FROM e0b_target_tables
        WHERE relname NOT IN (SELECT relname FROM tgt)
      ),
      'tables', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'name', t.relname,
          'rls_enabled', t.relrowsecurity,
          'rls_forced', t.relforcerowsecurity,
          'acl_default', t.relacl IS NULL,
          'columns', coalesce(ca.docs, '[]'::jsonb),
          'constraints', coalesce(coa.docs, '[]'::jsonb),
          'indexes', coalesce(ia.docs, '[]'::jsonb),
          'triggers', coalesce(ta.docs, '[]'::jsonb),
          'policies', coalesce(pa.docs, '[]'::jsonb),
          'grants', coalesce(ga.docs, '[]'::jsonb)
        ) ORDER BY t.relname), '[]'::jsonb)
        FROM tgt t
        LEFT JOIN columns_agg ca ON ca.table_name = t.relname
        LEFT JOIN constraints_agg coa ON coa.table_name = t.relname
        LEFT JOIN indexes_agg ia ON ia.table_name = t.relname
        LEFT JOIN triggers_agg ta ON ta.table_name = t.relname
        LEFT JOIN policies_agg pa ON pa.table_name = t.relname
        LEFT JOIN grants_agg ga ON ga.table_name = t.relname
      ),
      'dependent_functions', coalesce((SELECT docs FROM functions_agg), '[]'::jsonb),
      'dependent_types', coalesce((SELECT docs FROM types_agg), '[]'::jsonb),
      -- Descubrimiento factual: qué otras tablas public con nombres afines
      -- existen realmente (resuelve ambigüedades de prefijo en la captura).
      'candidate_tables', (
        SELECT coalesce(jsonb_agg(c.relname ORDER BY c.relname), '[]'::jsonb)
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND (c.relname LIKE '%academy%' OR c.relname LIKE '%cert%'
               OR c.relname LIKE '%worker%' OR c.relname LIKE '%job%'
               OR c.relname LIKE '%profile%' OR c.relname LIKE '%salary%'
               OR c.relname LIKE '%day_log%' OR c.relname LIKE '%workforce%'
               OR c.relname LIKE '%application%')
      ),
      'extensions', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('name', e.extname, 'version', e.extversion)
                        ORDER BY e.extname), '[]'::jsonb)
        FROM pg_extension e
      )
    )
  );
END;
$func$;

-- ── Extracción (única parte que toca catálogos): transacción READ ONLY ───────
BEGIN;
SET TRANSACTION READ ONLY;

SELECT jsonb_pretty(pg_temp.e0b_extract()) AS e0b_baseline;

COMMIT;
