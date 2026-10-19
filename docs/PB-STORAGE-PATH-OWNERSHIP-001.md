# PB-STORAGE-PATH-OWNERSHIP-001 — diseño, snapshot, QA y rollback

Estado: DESARROLLO + QA (GO PO 2026-10-18). **NO aplicar en producción sin
GO explícito.** QA y producción comparten el proyecto Supabase
`mwdauubztjxkbrefirbg`: cualquier cambio de policies allí afecta a ambos.

## 1. RCA (corregido por el PO, verificado el 2026-10-18)

No existe ninguna policy `storage_authenticated_all`. El riesgo procede de
policies owner-only que no restringen el path:

- `certificates_owner_insert` / `certificates_owner_update`
  (bucket `app_14da0f1941_certificates`)
- `worker_documents_owner_insert` / `worker_documents_owner_update`
  (bucket `worker-documents`)

Con `with_check (owner = auth.uid())`, un usuario autenticado B puede CREAR
un objeto nuevo dentro de la carpeta de A: el objeto se inserta con
`owner = B`, por lo que el chequeo pasa aunque el path sea ajeno. Probado en
QA el 2026-10-18 (probe `upsert-probe.pdf` creado por B en carpeta de A;
eliminado y limpieza verificada).

En el bucket de certificados solapaban además DOS familias permisivas
duplicadas path-only (`cert_user_upload/update` y
`app_14da0f1941_certs_user_insert/update`): al combinarse por OR, la familia
owner-only actuaba de bypass del chequeo de carpeta.

Alcance del defecto: INSERT/UPDATE únicamente. Lectura, listado, firma y
borrado cross-user están DENIED (matriz A–J de la auditoría 72h: C/E/F/G/I
PASS). `service_role` no se ve afectado.

## 2. Snapshot ANTES (pg_policy sobre storage.objects, 2026-10-18, 28 policies, todas PERMISSIVE)

| policy | cmd | roles | using (qual) | with_check |
|---|---|---|---|---|
| app_14da0f1941_avatars_public_read | SELECT | PUBLIC | bucket_id = 'app_14da0f1941_avatars' | — |
| app_14da0f1941_avatars_user_delete | DELETE | authenticated | bucket + foldername[1]=auth.uid() | — |
| app_14da0f1941_avatars_user_insert | INSERT | authenticated | — | bucket + foldername[1]=auth.uid() |
| app_14da0f1941_avatars_user_update | UPDATE | authenticated | bucket + foldername[1]=auth.uid() | — |
| app_14da0f1941_certs_user_delete | DELETE | authenticated | bucket(cert) + foldername[1]=auth.uid() | — |
| app_14da0f1941_certs_user_insert | INSERT | authenticated | — | bucket(cert) + foldername[1]=auth.uid() |
| app_14da0f1941_certs_user_update | UPDATE | authenticated | bucket(cert) + foldername[1]=auth.uid() | — |
| avatar_public_read | SELECT | PUBLIC | bucket avatars | — |
| avatar_user_delete | DELETE | authenticated | bucket + foldername[1]=auth.uid() | — |
| avatar_user_update | UPDATE | authenticated | bucket + foldername[1]=auth.uid() | — |
| avatar_user_upload | INSERT | authenticated | — | bucket + foldername[1]=auth.uid() |
| cert_user_delete | DELETE | authenticated | bucket(cert) + foldername[1]=auth.uid() | — |
| cert_user_update | UPDATE | authenticated | bucket(cert) + foldername[1]=auth.uid() | — |
| cert_user_upload | INSERT | authenticated | — | bucket(cert) + foldername[1]=auth.uid() |
| certificates_owner_delete | DELETE | authenticated | bucket(cert) + owner = auth.uid() | — |
| certificates_owner_insert | INSERT | authenticated | — | bucket(cert) + owner = auth.uid() **(AGUJERO)** |
| certificates_owner_select | SELECT | authenticated | bucket(cert) + owner = auth.uid() | — |
| certificates_owner_update | UPDATE | authenticated | bucket(cert) + owner = auth.uid() **(AGUJERO)** | bucket(cert) + owner = auth.uid() |
| certificates_service_role_all | ALL | service_role | bucket(cert) | bucket(cert) |
| feedback_screenshots_delete_admin | DELETE | authenticated | bucket(feedback) + is_admin_user() | — |
| feedback_screenshots_read_admin | SELECT | authenticated | bucket(feedback) + is_admin_user() | — |
| feedback_screenshots_update_admin | UPDATE | authenticated | bucket(feedback) + is_admin_user() | bucket(feedback) + is_admin_user() |
| feedback_screenshots_upload_authenticated | INSERT | authenticated | — | bucket(feedback) |
| worker_documents_owner_delete | DELETE | authenticated | bucket(worker-docs) + owner = auth.uid() | — |
| worker_documents_owner_insert | INSERT | authenticated | — | bucket(worker-docs) + owner = auth.uid() **(AGUJERO)** |
| worker_documents_owner_select | SELECT | authenticated | bucket(worker-docs) + owner = auth.uid() | — |
| worker_documents_owner_update | UPDATE | authenticated | bucket(worker-docs) + owner = auth.uid() **(AGUJERO)** | bucket(worker-docs) + owner = auth.uid() |
| worker_documents_service_role_all | ALL | service_role | bucket(worker-docs) | bucket(worker-docs) |

`bucket(cert)` = `bucket_id = 'app_14da0f1941_certificates'::text`;
`bucket(worker-docs)` = `bucket_id = 'worker-documents'::text`.

## 3. Migración (sql/053)

Para `authenticated`, INSERT y UPDATE exigen simultáneamente:
1. `bucket_id` correcto;
2. `owner_id = auth.uid()::text` (columna canónica; `owner` está deprecado
   y no se usa en las nuevas policies). NOTA de tipos verificada en el
   proyecto: `storage.objects.owner` es uuid, `storage.objects.owner_id` es
   text — de ahí el cast `::text`;
3. `(storage.foldername(name))[1] = auth.uid()::text` (carpeta propia).

El API de Storage establece `owner` y `owner_id` desde el `sub` del JWT en
upload y copy de usuario (verificado en QA a nivel de fila); con
service_role (sin `sub`) quedan NULL, pero service_role hace bypass de RLS
y no se ve afectado.

UPDATE con USING y WITH CHECK idénticos: impide actualizar objetos ajenos y
mover/renombrar objetos propios a carpetas ajenas (el move/copy interno del
API es un UPDATE de name).

Policies ELIMINADAS (8): `certificates_owner_insert`,
`certificates_owner_update`, `cert_user_upload`, `cert_user_update`,
`app_14da0f1941_certs_user_insert`, `app_14da0f1941_certs_user_update`,
`worker_documents_owner_insert`, `worker_documents_owner_update`.

Policies CREADAS (4): `certificates_authenticated_insert`,
`certificates_authenticated_update`, `worker_documents_authenticated_insert`,
`worker_documents_authenticated_update`.

Intactas: SELECT/DELETE de ambos buckets, service_role, avatars,
feedback-screenshots. No se añade policy RESTRICTIVE: la consolidación
elimina la rama OR amplia, que es la causa del bypass.

## 4. Compatibilidad de datos existentes (verificado 2026-10-18, READ-ONLY)

- `app_14da0f1941_certificates`: 202 objetos, 0 con owner_id NULL,
  0 con foldername ≠ owner_id, 0 con owner ≠ owner_id.
- `worker-documents`: 48 objetos, ídem (0/0/0).

**0 objetos incompatibles**: ningún objeto existente pierde acceso con las
nuevas policies de INSERT/UPDATE (y estas no afectan a SELECT/DELETE).

## 5. QA (branch Supabase aislada; ningún cambio en policies productivas)

Matriz con usuarios sintéticos A/B sobre una database branch efímera del
proyecto (copia aislada; producción intacta). Resultados en §7.

1. upload propio → ALLOWED
2. read/list/sign/update/delete propio → ALLOWED
3. INSERT nuevo en carpeta ajena → DENIED
4. upsert de objeto existente ajeno → DENIED
5. move/copy hacia carpeta ajena → DENIED
6. read/list/sign/delete cross-user → DENIED
7. anon → DENIED
8. service_role → ALLOWED
9. flujo completo CV (upload CV → extracción → draft → confirmación) → PASS
10. flujo completo certificados (upload → draft → confirmación declared) → PASS
11. cero residuos DB/Storage al final

## 6. Rollback (exacto, a partir del snapshot §2)

```sql
BEGIN;
-- Revertir consolidación
DROP POLICY IF EXISTS certificates_authenticated_insert ON storage.objects;
DROP POLICY IF EXISTS certificates_authenticated_update ON storage.objects;
DROP POLICY IF EXISTS worker_documents_authenticated_insert ON storage.objects;
DROP POLICY IF EXISTS worker_documents_authenticated_update ON storage.objects;

-- Restaurar certificates (owner-only + duplicadas path-only)
CREATE POLICY certificates_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'app_14da0f1941_certificates'::text) AND (owner = auth.uid()));
CREATE POLICY certificates_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING ((bucket_id = 'app_14da0f1941_certificates'::text) AND (owner = auth.uid()))
  WITH CHECK ((bucket_id = 'app_14da0f1941_certificates'::text) AND (owner = auth.uid()));
CREATE POLICY cert_user_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'app_14da0f1941_certificates'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));
CREATE POLICY cert_user_update ON storage.objects
  FOR UPDATE TO authenticated
  USING ((bucket_id = 'app_14da0f1941_certificates'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));
CREATE POLICY app_14da0f1941_certs_user_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'app_14da0f1941_certificates'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));
CREATE POLICY app_14da0f1941_certs_user_update ON storage.objects
  FOR UPDATE TO authenticated
  USING ((bucket_id = 'app_14da0f1941_certificates'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));

-- Restaurar worker-documents (owner-only)
CREATE POLICY worker_documents_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'worker-documents'::text) AND (owner = auth.uid()));
CREATE POLICY worker_documents_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING ((bucket_id = 'worker-documents'::text) AND (owner = auth.uid()))
  WITH CHECK ((bucket_id = 'worker-documents'::text) AND (owner = auth.uid()));
COMMIT;
```

Nota: el rollback reintroduce el defecto P2 documentado; usar solo ante
regresión funcional bloqueante y con GO del PO.

## 7. Resultados QA (ejecutados 2026-10-18 sobre la branch aislada)

Entorno: database branch efímera `pb-storage-path-ownership-qa`
(ref `zyfylkkzybnadgzrjlgs`, sin datos reales ni PII) del proyecto
`mwdauubztjxkbrefirbg`. Estado ANTES recreado exactamente desde el snapshot
§2 (16 policies de los 2 buckets + buckets). sql/053 aplicado después.

### Fase BEFORE (reproducción del defecto, 4/4)

- upload propio ALLOWED;
- **B crea objeto en carpeta de A: ALLOWED en certificates** (defecto
  presente);
- **B crea objeto en carpeta de A: ALLOWED en worker-documents** (defecto
  presente).

La branch replica fielmente el defecto de producción.

### Fase AFTER (matriz completa, todas PASS)

| # | Caso | Resultado | Evidencia |
|---|---|---|---|
| 1 | upload propio (certs + worker-docs) | ALLOWED | 200 |
| 2 | read/list/sign/update(PUT) propio | ALLOWED | 200; list devuelve nombre relativo al prefix |
| 3 | INSERT nuevo en carpeta ajena (certs) | **DENIED** | 403 "new row violates row-level security policy" |
| 3b | INSERT nuevo en carpeta ajena (worker-docs) | **DENIED** | 403 RLS |
| 4 | upsert de objeto existente ajeno (ambos buckets) | **DENIED** | 403 RLS |
| 5 | move hacia carpeta ajena | **DENIED** | 403 RLS |
| 5b | copy hacia carpeta ajena | **DENIED** | 403 RLS (route `POST /object/copy`, body `{bucketId, sourceKey, destinationKey}`) |
| 5c | move propio dentro de carpeta propia | ALLOWED | 200 + objeto legible por el owner |
| 5d | copy propio dentro de carpeta propia | ALLOWED | 200; fila resultante con owner=owner_id=auth.uid() |
| 6 | read/list/sign/delete cross-user | **DENIED** | 403/404/0 items; objeto intacto tras delete de B |
| 7 | anon (read/list/upload) | **DENIED** | 403/404/0 items |
| 8 | service_role (upload/read/delete) | ALLOWED | 200/200/200; borrado verificado en BD |
| 9 | flujo CV: upload CV a carpeta propia + signed URL 200 | PASS | 200 |
| 10 | flujo certificados: upload + signed URL 200 | PASS | 200 |
| 10b | flujo worker-documents: upload + signed URL 200 | PASS | 200 |
| 11 | cero residuos DB/Storage | PASS | SQL: 0 filas con id en ambos buckets; usuarios sintéticos eliminados |

Notas de evidencia:
- Todas las denegaciones críticas (3/3b/4/5/5b) devuelven 403 con mensaje
  explícito "new row violates row-level security policy" (RLS, no error de
  validación).
- B intentando copiar el objeto de A recibe 404 (no ve el origen): no hay
  vector de copy cross-user.
- Los objetos subidos por service_role quedan con owner/owner_id NULL (sin
  `sub` en el JWT) — irrelevante para RLS (bypass) y coherente con
  producción (los 202+48 objetos existentes los subieron usuarios).
- scoping: la extracción (cv-extract/cert-apply-draft) se ejecuta con
  service_role (bypass RLS, sin cambio con esta migración); la superficie
  de storage de usuario del flujo (upload/read/sign/delete en carpeta
  propia) queda íntegramente cubierta por la matriz.

### Advisors (ejecutados sobre mwdauubztjxkbrefirbg, 2026-10-18)

- Buckets: `app_14da0f1941_certificates`, `worker-documents` y
  `feedback-screenshots` privados; `app_14da0f1941_avatars` público por
  diseño (avatares públicos con policy de carpeta por uid). Sin hallazgos
  de advisor aplicables a esta migración.
- Observaciones preexistentes fuera de alcance (no tocadas):
  advisor "RLS enabled sin policies" sobre
  `app_14da0f1941_job_application_notifications` y advisor de funciones
  SECURITY DEFINER ejecutables por authenticated. Se registran como
  observaciones; requieren análisis separado.

### Regresión

- Specs RLS de tablas de aplicación (cert+CV 8/8 PASS reales, 0 skips,
  2026-10-18 sobre producción): sin cambio — sql/053 no toca policies de
  tablas de aplicación.
- Producción no se modifica en este PR (QA y prod comparten proyecto;
  aplicar 053 requiere GO explícito del PO; ver §8).

## 7bis. QA ronda 2 (2026-10-19) — arnés automatizado + re-acreditación

Contexto: re-acreditación tras integrar `origin/main` (PR #85 ya merged:
`sql/046`/`sql/048` + hardening de `secure-file-access`) en la rama de este
PR. Merge limpio sin conflictos.

### Re-verificación del estado real (READ-ONLY sobre mwdauubztjxkbrefirbg)

- `pg_policies` sobre `storage.objects`: **28 policies, idénticas al
  snapshot §2** (los 8 agujeros/duplicados siguen presentes; nadie ha
  cambiado policies desde 2026-10-18). La migración sigue siendo válida
  contra el estado vivo.
- Compatibilidad de datos existentes re-verificada:
  `app_14da0f1941_certificates` **213 objetos** (eran 202; +11 desde el QA
  original) y `worker-documents` **54** (eran 48; +6), con **0** owner_id
  NULL, **0** foldername ≠ owner_id y **0** owner ≠ owner_id. Todo objeto
  nuevo subido desde el QA original también cumple el contrato de 053.
- `sql/046` (audit log) y `sql/048` (`pb_get_storage_object_meta`,
  `pb_verify_storage_object_ownership`) **no crean ni modifican policies de
  `storage.objects`**: operan como SECURITY DEFINER service_role (bypass
  RLS). Sin interacción con 053.

### Arnés automatizado (nuevo artefacto del PR)

`sql/qa/qa-storage-path-ownership-PB-STORAGE-PATH-OWNERSHIP-001.sql`:
matriz BEFORE/AFTER autocontenida y autolimpiable, ejecutable contra
cualquier proyecto Supabase de desarrollo con esquema `storage` real (NO
ejecutar contra mwdauubztjxkbrefirbg). Recrea el estado ANTES exacto (16
policies de los 2 buckets), reproduce el defecto, aplica el espejo exacto de
sql/053 y verifica la matriz a nivel SQL con usuarios sintéticos A/B
(`auth.uid()` dirigido por `request.jwt.claims`, igual que PostgREST),
incluyendo verificación de cero residuos al final.

Ejecutado el 2026-10-19 sobre un proyecto Supabase de desarrollo aislado
del workspace (PostgreSQL 15.18, esquema storage real): **22/22 PASS**
(4 BEFORE + 18 AFTER), 0 residuos verificados.

| Fase | Casos | Resultado |
|---|---|---|
| BEFORE | B1-B4 (controles positivos + defecto reproducido en ambos buckets) | 4/4 PASS |
| AFTER | A1-A18 (upload propio ambos buckets; INSERT/upsert/rename/move cross-user DENIED 42501; escape de namespace propio DENIED; spoof de owner_id DENIED; SELECT/DELETE cross-user 0 filas; anon DENIED; service_role ALLOWED; rename/metadata propios ALLOWED) | 18/18 PASS |

### Hallazgo de la ronda 2 (fuera de alcance, documentado)

- **A18**: las policies DELETE preexistentes son owner-only sin restricción
  de path (`certificates_owner_delete`: `owner = auth.uid()`). El atacante B
  **puede borrar su propio objeto huérfano** en carpeta ajena (auto-limpieza
  del ataque), mientras que **A no puede verlo ni borrarlo** (owner-only
  SELECT/DELETE). Comportamiento preexistente, fuera del alcance de 053
  (INSERT/UPDATE); en producción hay 0 objetos huérfanos verificados (§4).
  Se registra como riesgo residual menor: la limpieza de un objeto huérfano
  futuro requeriría service_role/admin.
- **A17**: tras 053, un objeto huérfano (owner=B, carpeta=A) deja de ser
  actualizable incluso por su propio owner (el WITH CHECK exige carpeta
  propia): el defecto no permite persistir modificaciones.

## 8. Despliegue y aplicación

1. Merge del PR (requiere GO).
2. Aplicación de sql/053 sobre `mwdauubztjxkbrefirbg` (compartido QA+prod)
   — requiere GO explícito del PO; registrar como tracked migration.
3. Verificación post-aplicación: re-ejecutar la matriz A–J completa contra
   producción con cuentas sintéticas + advisors + smoke CV/certs.
