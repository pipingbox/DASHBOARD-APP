# OBJECT-MANIFEST — PB-ENT-E0B-BASELINE-DDL-001

Inventario de los objetos legacy que el extractor captura. Los nombres físicos
NO se asumen: proceden del código que producción ejecuta hoy
(`app/frontend/src/lib/supabase.ts`, constante `TABLES`, usada por el frontend
en producción contra la base real) y de las migraciones versionadas que los
referencian. La primera captura live los confirmará vía `missing_tables`
(cualquier nombre que no exista físicamente quedará listado allí).

## Tablas objetivo (9)

| # | Nombre lógico (PO §4) | Nombre físico | Evidencia código | Migraciones que la referencian |
|---|---|---|---|---|
| 1 | `profiles` | `app_14da0f1941_profiles` | `TABLES.profiles` (supabase.ts:34) | 002, 008, 009, 010, 011, 012, 033, 033a, 036, 037, 039, 041, 042, 043, 044, 045, 047, 049, 050, 051, 052, 054, 055, 056, 058 |
| 2 | `jobs` | `app_14da0f1941_jobs` | `TABLES.jobs` (supabase.ts:35) | 007, 016, 017, 018, 019, 020, 031, 032, 032a, 040, 045, 054, 055 |
| 3 | `job_applications` | `app_14da0f1941_job_applications` | `TABLES.jobApplications` (supabase.ts:37) | 019, 020, 030, 030a–f, 034, 039, 040, 045, 047, 049, 050, 052, 054, 055 |
| 4 | `work_day_logs` | `app_14da0f1941_work_day_logs` | `TABLES.workDayLogs` (supabase.ts:40) | **ninguna** (ver riesgo R1) |
| 5 | `salary_rate_presets` | `app_14da0f1941_salary_rate_presets` | `TABLES.ratePresets` (supabase.ts:41) | **ninguna** (ver riesgo R1) |
| 6 | `worker_certifications` | `app_worker_certifications` | `TABLES.certifications` / `TABLES.workerCertifications` (supabase.ts:48,59) | 004-cert, 008, 009, 010, 011, 033, 033a, 036, 037, 043, 044, 056 |
| 7 | `worker_experiences` | `app_worker_experiences` | `TABLES.workerExperiences` (supabase.ts:58) | 002, 008, 009, 010, 011, 012, 036, 042-grants, 056 |
| 8 | `worker_documents` | `app_worker_documents` | `TABLES.workerDocuments` (supabase.ts:62) | 002, 010, 011, 036, 037, 056 |
| 9 | `academy_courses` | `app_academy_courses` | `TABLES.academyCourses` (supabase.ts:80) | 004-marketplace, 005-revenue, 008-pricing, 014-ncr, 023 |

## Objetos dependientes (captura automática)

El extractor incluye, vía `pg_depend`, las funciones de las que dependan
policies, triggers, constraints o defaults de las 9 tablas (definición completa
para schema `public`; firma para externas como `auth.uid()`), y los tipos no
built-in (enum/composite/domain) usados por sus columnas. No se enumeran aquí
a priori: los determina la base real en la captura.

## Objetos excluidos (explícito)

- **Tablas Company Core** (`app_companies`, `app_company_memberships`,
  `app_company_invitations`): DDL propio versionado en `sql/058` y
  `sql/059` (E0/E0a); no son legacy.
- **Storage** (buckets, policies de `storage.objects`): dominio aparte, ya
  auditado en PB-STORAGE-PATH-OWNERSHIP-001 (sql/053 + preflight live).
- **Schema `auth`** y extensiones: solo se capturan firmas/funciones cuando una
  policy/trigger/default objetivo dependa de ellas; listado de extensiones
  instaladas incluido como contexto.
- **Datos**: ninguna fila de ninguna tabla. Sin PII, sin secretos.
- Edge Functions: fuera del alcance DDL de base de datos.

## Riesgos / ambigüedades a resolver en la primera captura

- **R1 — `work_day_logs` y `salary_rate_presets` sin cobertura en migraciones**:
  ninguna migración versionada las referencia; su DDL completo vive solo en la
  base real. El código frontend las usa con esos nombres, así que deberían
  existir; `missing_tables` lo confirmará. Todo su DDL (columnas, RLS,
  policies, grants) es desconocido para el repo hasta la captura.
- **R2 — doble nomenclatura academy**: coexisten `app_academy_*`
  (courses/lessons/progress/certificates, constante `TABLES`) y
  `app_14da0f1941_academy_*` (mock_exams, exam_answers, y usos directos de
  `academy_progress` en código). La sección `candidate_tables` de la captura
  mostrará qué existe físicamente de cada familia.
- **R3 — drift no versionado**: cualquier cambio aplicado a mano en producción
  fuera de la serie `sql/*.sql` solo aparecerá en la captura live. Es
  exactamente lo que este baseline existe para detectar.
