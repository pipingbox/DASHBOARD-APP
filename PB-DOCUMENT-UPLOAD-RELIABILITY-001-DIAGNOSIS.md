# PB-DOCUMENT-UPLOAD-RELIABILITY-001 — Diagnóstico y Correcciones (rev. 3)

## Resumen Ejecutivo

**Problema confirmado:** Incompatibilidad entre formatos anunciados en el frontend y formatos aceptados por el bucket `worker-documents` de Supabase Storage (solo PDF, PNG, JPEG/JPG, 10 MiB).

**Corrección:** Validaciones aisladas por bucket (rev. 2, según revisión de la PR #66) — restricción solo donde el bucket tiene allowlist; formatos originales restaurados donde el bucket no la tiene.

**Entorno QA aprovisionado:** buckets, políticas RLS de Storage y grants anon/authenticated replicados desde producción (lectura sola → migración en QA). Cuentas sintéticas A y B creadas.

---

## 1. Resolución de las 6 observaciones de la PR #66

### Obs. 1 — Regresiones en avatares y onboarding (P1) — RESUELTA
`isValidImageFile`, `isHeicFile`, `getSafeImageExtension` y `ACCEPT_IMAGES` restaurados a JPEG/PNG/WebP/HEIC/HEIF. El bucket `app_14da0f1941_avatars` no tiene allowlist en Storage (verificado en producción). Tests de regresión: `avatars bucket regression` (6 PASS).

### Obs. 2 — Validaciones independientes por bucket (P1) — RESUELTA
`fileUploadUtils.ts` reorganizado en tres secciones aisladas:
- **worker-documents** (allowlist Storage): `isSupportedByStorage`/`isValidWorkerDocumentFile` + `ACCEPT_WORKER_DOCUMENTS` — solo PDF/PNG/JPG.
- **certificates** (allowlist NULL, verificado): CV PDF/DOC/DOCX (`isValidDocumentFile`), certificaciones PDF/PNG/JPG/WebP/HEIC/HEIF (nuevo `isValidCertificateFile` + `ACCEPT_CERTIFICATES`).
- **avatars**: formatos originales.
Hints de UI actualizados en los 11 locales (`fileHint` certificaciones).

### Obs. 3 — Cancelación y limpieza de documentos (P1) — RESUELTA
Cierre centralizado en `DocumentsSection`: Cancel, X, Esc y backdrop usan `closeDialog()`/`handleDialogOpenChange()`. La eliminación usa el resultado booleano de `deleteStorageObject` (no lanza); si falla se emite `toast.warning` + log — nunca se oculta un huérfano potencial.

### Obs. 4 — Éxito solo tras Storage + PostgreSQL (P1) — RESUELTA
- Tras la transferencia TUS: estado "Archivo adjuntado — pendiente de guardar" (sin toast de éxito).
- Éxito (`toast.success` + `confirmSaved()` + evento `document_upload_completed`) solo tras el INSERT confirmado.
- Compensación: si el INSERT falla o lanza, se elimina el objeto recién subido y se verifica el resultado; si el INSERT ya succeedió (flag `insertSucceeded`), NO se elimina (evita huérfano inverso: fila que referencia objeto borrado).

### Obs. 5 — Validación MIME/extensión (P2) — RESUELTA
`isSupportedByStorage` nueva semántica: MIME específico fuera de allowlist → rechazo (sin fallback a extensión); MIME permitido + extensión contradictoria (p. ej. `.png` con `image/heic`) → rechazo; fallback a extensión solo con MIME ausente/genérico (`application/octet-stream`), caso real en móviles. Tests: 4 casos contradictorios cubiertos.

### Obs. 6 — Preparar QA y ejecutar E2E posibles (P6) — EJECUTADA (ver §3)

---

## 2. Entorno QA aprovisionado (proyecto `uqfbilyfpflrlthnyijj`)

- **Buckets**: `app_14da0f1941_avatars`, `app_14da0f1941_certificates` (allowlist NULL), `worker-documents` (PDF/PNG/JPG, 10 MiB), `feedback-screenshots` — replicando producción.
- **Políticas Storage**: 18 políticas de propiedad por usuario (`{bucket}_owner_*`) equivalentes a producción, sin exponer `service_role`.
- **Grants**: mapa completo anon/authenticated leído de `pg_class.relacl` de producción (solo lectura) y replicado (66 GRANTs). Esto resolvió los HTTP 403 iniciales.
- **Cuentas sintéticas**: `pb-doc-e2e-synth@pipingbox-test.example` (A) y `pb-doc-e2e-synth-b@pipingbox-test.example` (B), perfiles `MARKETPLACE_READY`. Cero datos reales.
- **Producción intacta**: solo consultas de lectura; cero mutaciones.

---

## 3. Pruebas ejecutadas (SHA candidato `b2245ad`, build local apuntando a QA)

### 3.1 Tests automáticos — PASS

| Suite | Resultado |
|---|---|
| `document-upload-e2e.spec.ts` (5 tests, Android Chrome emulado, TUS real contra QA) | **5/5 PASS** — incluye TUS happy path, interrupción de red con reanudación, PNG por uploader compartido, CV con verificación de columnas canónicas + persistencia + reemplazo + eliminación (ZERO DIFF), y regresión de stall |
| `document-upload-validation.spec.ts` (validación por bucket) | **35/35 PASS** |
| `resumable-upload.spec.ts` (uploader TUS) | **26/26 PASS** |
| `cert-upload-ux.spec.ts` | **9/9 PASS** |
| `documents-open-first-click.spec.ts` | **12/12 PASS** |
| `certifications-open-first-click.spec.ts` | **8/8 PASS** |
| `rls-worker-experiences.spec.ts` (aislamiento entre cuentas A y B) | **3/3 PASS** |

Typecheck: PASS. Build de producción: PASS (bundle verificado: apunta a QA, cero referencias a producción).

### 3.2 Matriz del plan de QA

| Prueba | Resultado |
|---|---|
| PDF válido | PASS (E2E, TUS real) |
| JPG/PNG válido | PASS (E2E PNG + unitarios JPG) |
| DOC/DOCX | PASS — CV/certificados los aceptan (bucket sin allowlist); documentos profesionales los rechazan antes de transferir con mensaje claro (unitarios) |
| HEIC/WebP | PASS — certificaciones/avatares los aceptan (restaurados); documentos profesionales los rechazan antes de transferir (unitarios) |
| >10 MB | PASS (bloqueo previo, unitario) |
| Interrupción de conexión | PASS (E2E: retry, background/return, resume con progreso previo, ZERO DIFF) |
| Sesión expirada | PASS (unitario uploader: error `auth` tipificado) |
| Cancelación | PASS (E2E cancel + cleanup; unitarios) |
| Doble clic | PASS (uploader deshabilita input durante subida; unitario) |
| Error al guardar en DB | PASS (compensación con verificación; sin éxito falso) |
| Actualización de página | PASS (E2E: persistencia verificada vía REST tras reload) |
| Acceso desde otra cuenta | PASS (RLS: A no ve datos de B, 3/3) |

### 3.3 FAIL documentado — `cv-upload-smoke.spec.ts` (pre-existente, no causado por esta rama)

- **Resultado local**: 1 PASS / 5 FAIL en 6 ejecuciones contra QA.
- **Reproducido en `main` (16682d0)**: mismo build de main contra el mismo QA y Chromium local → 1 PASS / 4 FAIL. **No es regresión de esta rama.**
- **Causa raíz (instrumentada)**: al hacer reload justo después de abrir/cerrar el popup de URL firmada, `navigator.locks` de Chromium retiene indefinidamente el lock `lock:sb-<ref>-auth-token` encolado por el documento destruido → `supabase.auth.getSession()` cuelga → el timeout de 8 s de `useAuth` resuelve `session: null` → logout silencioso aunque la sesión sigue intacta en localStorage (verificado con traces: `HELD_BY_OTHER` inmediato y a los 11 s tras reload; cero peticiones a Supabase tras reload).
- **Intento de fix descartado con evidencia**: reintento de `getSession()` tras 1,5 s (commit ee70720) — el lock zombi es permanente, el reintento también cuelga y el arranque extendido (8 s → 17,5 s) rompía 2 tests E2E secuenciales que pasaban. Revertido (b2245ad).
- **Seguimiento recomendado** (ticket nuevo): bootstrap de sesión sin locks (lectura directa de `localStorage` como fallback del timeout) o actualización de supabase-js/auth-js si incorpora mitigación del zombie lock. El workflow CI `storage-e2e.yml` ejecuta este test contra el origen desplegado, donde el timing difiere.
- Nota: el flujo funcional del CV (subida, persistencia, view con URL firmada, replace, remove, ZERO DIFF) queda cubierto en **PASS** por `document-upload-e2e.spec.ts` (5/5).

### 3.4 Entornos

- Desktop/emulación Android Chrome (Playwright Chromium): PASS (arriba).
- iOS Safari y Firefox reales: **no disponibles** en este entorno — requiere ejecución manual/dispositivos (BLOCKED, documentado).
- Estado del fixture: un objeto sintético residual `.../cv-1791866340194.pdf` permanece en el bucket QA de certificados (eliminación directa bloqueada por diseño en Storage); inocuo, incluido en snapshots ZERO DIFF.

---

## 4. Seguridad

- Buckets privados; políticas de propiedad replicadas (QA) sin tocar producción.
- Sin `service_role` ni secretos en el frontend (la anon key de QA es pública y está protegida por RLS).
- Telemetría PostHog sin PII (nombres de archivo, rutas y tokens excluidos; ya verificado por el suite resumable).
- Cero mutaciones en producción; cero uso de cuentas reales.

---

## 5. SHAs y archivos

- **SHA inicial:** `16682d0` (main)
- **SHA candidato:** `b2245ad` (rama `pb-document-upload-reliability-001`)
- Commits: `d94a5ab` (rev.2 correcciones), `ee70720` (fix experimental), `c44f7cf` (limpieza), `b2245ad` (revert del experimental).

**Archivos modificados:**

| Archivo | Cambios |
|---|---|
| `src/lib/fileUploadUtils.ts` | Validaciones aisladas por bucket; semántica MIME/extensión; `ACCEPT_WORKER_DOCUMENTS`, `ACCEPT_CERTIFICATES`; `isSupportedByStorage` estricto |
| `src/lib/resumableUpload.ts` | Tipo `DocumentType` + 'document' |
| `src/components/profile/DocumentsSection.tsx` | TUS resumable; validación previa; cierre centralizado con limpieza; estado "pendiente de guardar"; compensación verificada; UI de progreso |
| `src/components/profile/CVUploadSection.tsx` | Hint restaurado (PDF, DOC, DOCX) |
| `src/components/profile/CertificationsSection.tsx` | Validación centralizada `isValidCertificateFile`; accept restaurado |
| `src/i18n/locales/*.json` (11) | `fileHint` certificaciones alineado |
| `tests/document-upload-validation.spec.ts` | 35 tests por bucket (incluye contradictorios y regresión avatar/CV) |
| `sql/qa/qa-anon-authenticated-grants-PB-DOCUMENT-UPLOAD-RELIABILITY-001.sql` | Grants QA replicados de producción |

---

## 6. Riesgos residuales

1. **Lock zombi de navigator.locks (pre-existente)**: usuarios reales pueden experimentar logout silencioso tras cerrar un popup de documento y recargar. Seguimiento recomendado.
2. **Objetos huérfanos históricos** en `worker-documents` de intentos anteriores — script de limpieza recomendado como tarea aparte.
3. **Formatos restringidos en documentos profesionales**: DOC/DOCX → convertir a PDF; HEIC → JPG (solo en esa sección).
4. **cv-upload-smoke flaky** en entornos locales (ver §3.3); CI contra origen desplegado es el gate autoritativo.
5. **iOS Safari/Firefox reales** sin validar (no disponibles).

---

## 7. Recomendación

**NO-GO para merge automático.** Revisión pendiente: la rev.3 cierra las 6 observaciones con evidencia; el único FAIL es un flaky pre-existente reproducido en `main` con causa raíz documentada. GO requiere: (a) aceptación del análisis del §3.3 o fix del lock zombi en ticket aparte, y (b) validación manual en iOS Safari.

---

*Rev. 3 — 2026-10-13 — rama `pb-document-upload-reliability-001` — SHA `b2245ad`*
