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
2. `owner_id = auth.uid()` (columna canónica; `owner` está deprecado y no se
   usa en las nuevas policies);
3. `(storage.foldername(name))[1] = auth.uid()::text` (carpeta propia).

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

## 7. Resultados QA

(pendiente de ejecución sobre la branch aislada — se completa antes del
merge)

## 8. Despliegue y aplicación

1. Merge del PR (requiere GO).
2. Aplicación de sql/053 sobre `mwdauubztjxkbrefirbg` (compartido QA+prod)
   — requiere GO explícito del PO; registrar como tracked migration.
3. Verificación post-aplicación: re-ejecutar la matriz A–J completa contra
   producción con cuentas sintéticas + advisors + smoke CV/certs.
