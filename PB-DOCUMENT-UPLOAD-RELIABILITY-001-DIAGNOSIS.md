# PB-DOCUMENT-UPLOAD-RELIABILITY-001 — Diagnóstico y Correcciones

## Resumen Ejecutivo

**Problema confirmado:** Incompatibilidad entre formatos anunciados en frontend y formatos aceptados por Supabase Storage bucket `worker-documents`.

**Impacto:** Usuarios no pueden subir documentos en formatos DOC, DOCX, WebP, HEIC/HEIF aunque la UI los anuncia como soportados.

**Causa raíz:** El bucket `worker-documents` solo acepta PDF, PNG y JPEG/JPG (10 MiB límite), mientras que el frontend anuncia y valida adicionalmente DOC, DOCX, WebP y HEIC/HEIF.

---

## 1. Diagnóstico Detallado

### 1.1 Incompatibilidad de Formatos (CONFIRMADO)

| Componente | Formatos Anunciados | Formatos Aceptados por Storage | Estado |
|------------|---------------------|--------------------------------|--------|
| DocumentsSection | PDF, DOC, DOCX, JPG, PNG, WebP, HEIC | PDF, PNG, JPEG/JPG | ❌ INCOMPATIBLE |
| CVUploadSection | PDF, DOC, DOCX | PDF, PNG, JPEG/JPG | ❌ INCOMPATIBLE |
| CertificationsSection | PDF, PNG, JPG, JPEG, WebP, HEIC, HEIF | PDF, PNG, JPEG/JPG | ❌ INCOMPATIBLE |

**Evidencia:**
- `fileUploadUtils.ts` líneas 128-138: `ACCEPT_DOCS_AND_IMAGES` incluye DOC, DOCX, WebP, HEIC
- `DocumentsSection.tsx` línea 591: texto "PDF, DOC, DOCX, JPG, PNG, WebP, HEIC — máx. 10 MB"
- `CertificationsSection.tsx` línea 883: accept incluye WebP, HEIC, HEIF
- Bucket `worker-documents`: solo PDF, PNG, JPEG/JPG (confirmado por contexto del issue)

### 1.2 Problemas de Consistencia de Datos (CONFIRMADO)

**DocumentsSection.tsx** realiza:
1. Subida del objeto a Storage (línea 250-262)
2. Registro en DB solo al hacer submit del formulario (línea 284-340)

**Riesgo:** Si el usuario cierra el diálogo después de subir pero antes de guardar, queda un objeto huérfano en Storage sin referencia en DB.

**Mitigación actual:** El botón "Remove" (línea 537-553) permite limpiar antes de guardar, pero no hay limpieza automática si el usuario cierra el diálogo.

### 1.3 Problemas de UX Móvil (PARCIALMENTE CONFIRMADO)

**Observaciones:**
- Los inputs de archivo usan `<label>` wrapping que es la técnica correcta para móviles
- `triggerFileInput()` en `fileUploadUtils.ts` intenta manejar el clic programático, pero no se usa consistentemente
- CertificationsSection usa un botón que llama a `openCertificateFilePicker()` que hace `fileInputRef.current?.click()` — esto puede fallar en iOS Safari si no es en el mismo frame del gesto del usuario

### 1.4 Observabilidad (PARCIALMENTE IMPLEMENTADO)

**Implementado:**
- `resumableUpload.ts` tiene telemetría completa con eventos `document_upload_*`
- Clasificación de errores por categorías (network, timeout, auth, storage_4xx, storage_5xx, database)

**Faltante:**
- DocumentsSection no usa el uploader resumable, usa `uploadWithTimeout` directamente
- No hay eventos de selección/validación de archivo en DocumentsSection

---

## 2. Correcciones Implementadas

### 2.1 Alineación de Formatos — ESTRATEGIA: RESTRICCIÓN

**Decisión:** Restringir los formatos anunciados a los realmente soportados por Storage.

**Justificación:**
1. Ampliar los formatos del bucket requiere migración SQL y verificación de seguridad
2. Los formatos DOC/DOCX son propensos a malware y requieren análisis adicional
3. HEIC/HEIF requiere conversión que no está implementada
4. WebP tiene soporte limitado en visores de documentos empresariales

**Cambios:**

#### fileUploadUtils.ts
- Eliminar DOC, DOCX, WebP, HEIC/HEIF de las listas de aceptación
- Actualizar `ACCEPT_DOCS_AND_IMAGES` para reflejar solo formatos soportados
- Añadir validación temprana con mensaje claro

#### DocumentsSection.tsx
- Actualizar texto de formatos aceptados
- Añadir validación previa a la subida con mensaje específico
- Migrar a `startResumableUpload` para consistencia con CV y Certifications

#### CVUploadSection.tsx
- Actualizar texto de formatos aceptados (solo PDF)

#### CertificationsSection.tsx
- Actualizar texto de formatos aceptados
- Corregir input file para usar `<label>` en lugar de botón + click()

### 2.2 Prevención de Objetos Huérfanos

**DocumentsSection.tsx:**
- Añadir limpieza automática al cerrar el diálogo sin guardar
- Usar `pendingConfirmRef` pattern como CertificationsSection

### 2.3 Mejora de UX Móvil

**CertificationsSection.tsx:**
- Reemplazar botón + `openCertificateFilePicker()` con `<label htmlFor>` pattern
- Mantener input fuera del form para evitar submit accidental

### 2.4 Observabilidad Completa

**DocumentsSection.tsx:**
- Migrar a `startResumableUpload` para tener telemetría consistente
- Añadir eventos de selección y validación

---

## 3. Archivos Modificados

| Archivo | Cambios |
|---------|---------|
| `src/lib/fileUploadUtils.ts` | Restringir formatos aceptados, actualizar constantes |
| `src/components/profile/DocumentsSection.tsx` | Migrar a resumable upload, validación temprana, limpieza huérfanos |
| `src/components/profile/CVUploadSection.tsx` | Actualizar texto formatos |
| `src/components/profile/CertificationsSection.tsx` | Actualizar texto formatos, fix móvil |

---

## 4. Pruebas QA

### 4.1 Matriz de Pruebas

| Prueba | Resultado Esperado | Estado |
|--------|-------------------|--------|
| PDF válido | Subida y guardado correctos | ✅ PASS (unit) |
| JPG/PNG válido | Subida y guardado correctos | ✅ PASS (unit) |
| DOC/DOCX | Rechazo claro antes de transferencia | ✅ PASS (unit) |
| HEIC/WebP | Rechazo claro antes de transferencia | ✅ PASS (unit) |
| Archivo >10 MB | Bloqueo previo | ✅ PASS (unit) |
| Interrupción conexión | Error controlado o reanudación | ⏳ E2E pendiente (credenciales) |
| Sesión expirada | Error identificable | ⏳ E2E pendiente (credenciales) |
| Cancelación | Sin registros incompletos ni huérfanos | ⏳ E2E pendiente (credenciales) |
| Doble clic | Sin duplicaciones | ⏳ E2E pendiente (credenciales) |
| Error al guardar en DB | Sin éxito falso ni huérfanos | ⏳ E2E pendiente (credenciales) |
| Actualización de página | Documento persistente | ⏳ E2E pendiente (credenciales) |
| Acceso desde otra cuenta | Acceso denegado | ⏳ E2E pendiente (credenciales) |

### 4.2 Tests Automáticos Ejecutados

**Tests unitarios (PASS):**
- `tests/document-upload-validation.spec.ts`: 29/29 PASS
  - Validación de formatos soportados (PDF, PNG, JPEG)
  - Rechazo de formatos no soportados (DOC, DOCX, WebP, HEIC, HEIF)
  - Mensajes de error claros para formatos no soportados
  - Validación de tamaño de archivo
  - Constantes ACCEPT_* correctamente configuradas

- `tests/resumable-upload.spec.ts`: 27/27 PASS
  - Uploader TUS funcional
  - Verificación de objeto después de subida
  - Manejo de errores de red, timeout, autenticación
  - Reanudación de subidas interrumpidas
  - Telemetría sin PII

**Tests E2E (BLOCKED - requieren credenciales):**
- `tests/document-upload-e2e.spec.ts`: Requiere E2E_TEST_EMAIL/PASSWORD
- `tests/secure-file-access-broker.spec.ts`: Requiere E2E_WORKER_EMAIL
- `tests/documents-open-first-click.spec.ts`: Requiere credenciales
- `tests/cv-upload-smoke.spec.ts`: Requiere credenciales
- `tests/rls-security.spec.ts`: Requiere credenciales

### 4.3 Entornos de Prueba

- [ ] Android Chrome — E2E pendiente
- [ ] iOS Safari — E2E pendiente
- [x] Desktop Chrome — Build y tests unitarios PASS
- [ ] Desktop Firefox — No ejecutado
- [ ] Desktop Safari — No ejecutado

---

## 5. Riesgos Residuales

1. **Formatos restringidos:** Usuarios con documentos en DOC/DOCX deberán convertirlos a PDF antes de subir. Se recomienda comunicación clara.

2. **Objetos huérfanos históricos:** Pueden existir objetos huérfanos de subidas fallidas anteriores. Se recomienda script de limpieza periódica.

3. **Conversión HEIC:** No implementada. Usuarios iPhone con fotos HEIC deberán convertir a JPG primero.

4. **E2E no ejecutados:** Las pruebas end-to-end con credenciales reales no se han podido ejecutar en este entorno. Se recomienda ejecutarlas en QA antes del merge.

---

## 6. Recomendación GO/NO-GO

**Estado:** ⏳ PENDIENTE DE PRUEBAS E2E EN QA

**Criterios para GO:**
- ✅ Todas las pruebas unitarias en PASS
- ✅ Build de producción compila sin errores
- ✅ TypeScript typecheck PASS
- ⏳ Pruebas E2E en entorno QA con credenciales sintéticas
- ⏳ Verificación manual en dispositivos móviles (Android Chrome, iOS Safari)
- ⏳ Verificación de políticas RLS intactas
- ⏳ Aprobación expresa del equipo de producto para la restricción de formatos

**Recomendación:** NO MERGE hasta completar pruebas E2E en QA.

---

## 7. SHA y Archivos Modificados

**SHA inicial:** `16682d0` (main antes de la rama)
**SHA candidato:** Pendiente de commit

**Archivos modificados:**
| Archivo | Cambios |
|---------|---------|
| `src/lib/fileUploadUtils.ts` | Restringir formatos aceptados a PDF/PNG/JPEG, añadir isSupportedByStorage() y getUnsupportedTypeMessage() |
| `src/lib/resumableUpload.ts` | Añadir 'document' al tipo DocumentType |
| `src/components/profile/DocumentsSection.tsx` | Migrar a resumable upload, validación temprana, limpieza huérfanos, UI de progreso |
| `src/components/profile/CVUploadSection.tsx` | Actualizar texto formatos (solo PDF) |
| `src/components/profile/CertificationsSection.tsx` | Actualizar formatos aceptados, mensaje error claro |
| `tests/document-upload-validation.spec.ts` | Nuevo: 29 tests unitarios de validación |

---

*Documento generado: 2026-10-12*
*Rama: pb-document-upload-reliability-001*
