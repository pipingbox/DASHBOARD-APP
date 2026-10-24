# PB-ENT-E0B-BASELINE-DDL-001 — Baseline factual del DDL legacy

**Estado: EXTRACTOR LISTO Y PROBADO (62/62 aserciones). PRIMERA CAPTURA LIVE
PENDIENTE** — bloqueada por regeneración de credenciales (gate PO §8.3).

## 1. Propósito

Baseline factual y versionado del DDL de las tablas legacy de las que dependerá
Enterprise (E1 Candidate Handoff en adelante). **CERO cambios funcionales**:
este directorio no modifica ninguna base de datos; solo documenta el estado real.

Responde a la necesidad de conocer exactamente —sin asumir— columnas, tipos,
constraints, índices, triggers, RLS, policies y grants de las tablas sobre las
que E1+ construirá, antes de escribir nuevas migraciones.

## 2. Contenido

| Archivo | Qué es |
|---|---|
| `extract-ddl-baseline.sql` | Extractor **read-only** (transacción `READ ONLY`, solo catálogos `pg_catalog`/`information_schema`). Emite un único JSON determinista. Probado por `sql/test-fixtures/TESTFIXTURE-run-e0b-extractor.sh`. |
| `OBJECT-MANIFEST.md` | Inventario de los 9 objetos objetivo: nombre lógico → nombre físico exacto, evidencia (código de producción + migraciones), ambigüedades a resolver en la captura. |
| `MANIFEST.md` | Registro de capturas: artefacto, entorno, fecha UTC, commit, extractor y sha256. |
| `artifacts/` | Capturas live (`legacy-ddl-<env>-<yyyymmdd>.json`). **Vacío hasta la primera captura live.** |

## 3. Seguridad — por qué esto NO puede ejecutarse como migración

El PO exigió verificar que ningún mecanismo pueda ejecutar estos archivos como
migración (2026-10-23, decisión §6). Verificación realizada sobre
`main@5ab08ea`:

1. **Ningún workflow aplica migraciones**: los 9 workflows de
   `.github/workflows/` no contienen `db push`, `supabase migration` ni ningún
   glob `*.sql`; las migraciones se aplican **manualmente** por runbook
   (patrón histórico: SQL Editor de Supabase en ventana autorizada, p.ej.
   `PB-JOBS-COMPANY-WITHDRAWN-SEMANTICS-001/RUNBOOK-PRODUCCION-SQL055.md`).
2. **Ningún script npm toca SQL**: `package.json` y `app/frontend/package.json`
   no tienen scripts que referencien `sql/` ni `*.sql`.
3. **Ningún script del repo itera sobre `*.sql`**: búsqueda global de
   `for f in ... *.sql` / `ls sql/` / globs equivalentes fuera de `sql/` y
   `docs/` → 0 resultados.
4. **Ubicación inequívocamente documental**: `docs/baseline/` está fuera de
   `sql/` (directorio de migraciones aplicables) por decisión explícita del PO;
   un comentario "DO NOT APPLY" no se considera protección suficiente.
5. El extractor además es **estructuralmente inofensivo**: transacción
   `READ ONLY` + objetos exclusivamente `pg_temp` + solo lecturas de catálogo.

## 4. Qué captura el extractor (por tabla objetivo)

Columnas (tipo completo vía `format_type`, UDT, nullability, default, identity,
generated, secuencia), PK, FK (tabla referenciada + acciones ON UPDATE/DELETE),
UNIQUE, CHECK, índices (incl. parciales, expresión, validez), triggers de usuario
(+ estado enabled/disabled/replica/always), RLS `ENABLE`/`FORCE`, policies
(cmd/roles/qual/with_check), grants (grantee/privilege/grantable, PUBLIC
explícito, `acl_default` cuando no hay ACL explícita), funciones de las que
dependen policies/triggers/defaults/constraints (vía `pg_depend`, con
`security_definer`, `proconfig` y definición para las de schema `public`;
firma sola para las externas, p.ej. `auth.uid()`), tipos no built-in usados por
las columnas (enum con labels ordenados, domain con base/check, composite con
atributos) y extensiones instaladas. Además:

- `missing_tables`: objetivos que **no existen** en el entorno (drift crítico).
- `candidate_tables`: discovery factual de tablas `public` con nombres afines
  (resuelve ambigüedades de prefijo, p.ej. academy con doble nomenclatura).

**Nunca captura**: filas de datos, PII, secretos. Solo metadatos de esquema.

## 5. Provenance

Cada artefacto lleva en su propio JSON: fecha UTC de captura, base de datos,
versión de servidor, usuario ejecutor, entorno y commit (vía GUCs
`e0b.environment` / `e0b.commit`), identidad del extractor y banderas
`read_only`/`contains_data_rows`. El registro `MANIFEST.md` añade por captura:
entorno/source, fecha UTC, commit HEAD del repo, sha256 del extractor, sha256
del artefacto, objetos incluidos y excluidos.

## 6. Procedimiento de captura live (ventana autorizada)

Prerequisito: credenciales con acceso a catálogos del proyecto destino
(actualmente **bloqueado**: las credenciales QA se retiraron del workspace en
R9 y su regeneración es gate pre-producción PO §8.3).

1. `sha256sum docs/baseline/extract-ddl-baseline.sql` → anotar.
2. En el SQL Editor de Supabase del proyecto destino (o `psql`):
   descomentar y ajustar `SET e0b.environment = 'production';` y
   `SET e0b.commit = '<sha HEAD del repo>';`, ejecutar el archivo completo.
3. Guardar la columna `e0b_baseline` como
   `artifacts/legacy-ddl-<env>-<yyyymmdd>.json`.
4. `sha256sum` del artefacto → registrar fila en `MANIFEST.md` (entorno, fecha,
   commit, extractor + sha256, artefacto + sha256, incluidos/excluidos).
5. Revisar `missing_tables` y `candidate_tables`: cualquier objetivo ausente o
   nombre inesperado es drift a investigar antes de E1.
6. Commit del artefacto + MANIFEST en un PR propio (REFERENCE ONLY).

## 7. CI estático vs live drift (decisión PO §7)

- **A. STATIC CONTRACT CI** (`.github/workflows/baseline-contract.yml` +
  `scripts/check-baseline-artifacts.mjs`): corre en cada PR que toque
  `docs/baseline/**`. **No usa credenciales de producción.** Valida integridad
  y formato de los artefactos versionados: JSON parseable, formato 1.0,
  secciones obligatorias, 9 tablas objetivo presentes o listadas en
  `missing_tables` (que falla el check por drift crítico), `contains_data_rows
  = false`, provenance completo y sha256 conciliado con `MANIFEST.md`.
  Sin artefactos (estado actual) el check hace SKIP limpio.
- **B. LIVE DRIFT CHECK**: manual / programado / gate de release. Procedimiento
  §6; el diff entre capturas es `git diff` de los artefactos versionados
  (deterministas, sin OIDs). La primera captura live es el baseline de
  referencia; las siguientes se comparan contra ella.

## 8. Limitaciones conocidas

- La primera captura live está **pendiente de credenciales** (ver §6). Hasta
  entonces no existe artefacto en `artifacts/` y el CI estático hace SKIP.
- Las 9 tablas objetivo se crearon fuera de la serie de migraciones del repo
  (ninguna tiene `CREATE TABLE` en `sql/*.sql`), así que el baseline solo puede
  obtenerse por extracción live; no hay sustituto honesto en el repo.
- El contrato código-Enterprise↔baseline (que E1+ no contradiga el baseline)
  se activa cuando exista la primera captura; el sustrato de validación ya
  está en `scripts/check-baseline-artifacts.mjs`.
