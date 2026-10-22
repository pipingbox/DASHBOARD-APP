# PB-CERT-AUTO-PROFILE-001 — CERTIFICADO → AUTO PROFILE

**Estado:** desarrollo + QA + PR autorizados. **Merge y despliegue a producción requieren aprobación posterior.**
**Rama:** `feat/pb-cert-auto-profile-001`
**Base:** `origin/main` @ `2eb8282` (incluye PB-CV-AUTO-PROFILE-001 ya desplegado en producción).

## 1. Objetivo

Al adjuntar un certificado (PDF o imagen), PIPINGBOX prepara sus datos para que
el usuario solo tenga que revisarlos, corregirlos y confirmarlos. Se acabó el
formulario en blanco: el documento propone, el usuario dispone.

Extraer, exclusivamente cuando consten en el documento:

- nombre de la certificación;
- entidad emisora;
- número de credencial;
- fecha de emisión;
- fecha de caducidad.

No inventar fechas, entidades ni credenciales. Los datos dudosos (confianza
baja) requieren revisión explícita.

## 2. Principios no negociables

| Principio | Implementación |
|---|---|
| **DRAFT FIRST** | La extracción NUNCA escribe directamente en `app_worker_certifications`. Todo lo extraído vive en `app_cert_extraction_drafts` (`pending_review`) hasta la confirmación del usuario vía `cert-apply-draft`. |
| **No sobrescribir confirmados** | Si el registro canónico ya tiene un campo con valor, el apply solo lo reemplaza con `overwrite:true` explícito por campo; si no, 409 con la lista de conflictos y NO aplica nada (mismo contrato que `cv-apply-draft`). |
| **Declared/unverified SIEMPRE** | Toda certificación creada o completada por este flujo queda `is_verified=false`, `verified_at=null`. La extracción no acredita autenticidad ni concede Marketplace Ready. |
| **Circuito canónico intacto** | Los registros existentes con verificación en curso o completada NO cambian de estado al reemplazar el documento o aplicar un draft. El apply NUNCA toca `is_verified`/`verified_at` (ni siquiera para ponerlos a false en updates: eso es decisión del circuito de verificación, no de esta feature). |
| **Vinculación sin duplicados** | Completar una certificación ya declarada (p. ej. desde el CV) actualiza ESA fila; nunca crea una segunda. El matching es por `certification_name` normalizado del propio usuario; si hay 2+ candidatas o ninguna clara, el usuario elige explícitamente o se crea nueva. Jamás se fusionan registros ambiguos automáticamente. |
| **Idempotencia** | `UNIQUE (user_id, doc_sha256)` (SHA-256 del binario). Mismo documento → `already_processed` o actualización controlada de la misma fila de draft. Retry de `extraction_failed` incrementa `attempt_count` sin crear filas. |
| **Fallos sin pérdida** | `extraction_failed` con `error_code` cerrado; el objeto Storage se conserva; el usuario completa los datos manualmente (fallback manual honesto, NO presentado como extracción completada). |
| **Confianza** | `high/medium/low` por campo. `low` NUNCA se autoacepta: se muestra al usuario con distintivo de verificación. |
| **Privacidad** | Motor determinista local (sin LLM/OCR externo): el contenido del documento no sale de la infraestructura. Logs solo con enums/códigos/contadores. |

## 3. Formatos soportados (declaración precisa)

| Formato | Fase 1 (este PR) | Notas |
|---|---|---|
| PDF con texto nativo | SÍ | `extractText` compartido (pdfjs). |
| DOCX | NO aplica | Los certificados no llegan en DOCX; el flujo de subida ya restringe a PDF/imagen. |
| Imagen (JPG/PNG) | NO — fallback manual | Sin OCR autorizado (ver §8). La subida se conserva y el usuario rellena el formulario; la UI lo comunica como "completa los datos manualmente", nunca como extracción fallida parcial. |
| PDF escaneado (sin capa de texto) | NO — fallback manual | `extractText` devuelve `no_extractable_text`; mismo tratamiento que imagen. |

## 4. Arquitectura

```
Certificado (PDF/imagen)          Edge Function cert-extract          UI CertificationDialog
        │                                │                             (modo revisión)
        ├─ usuario sube ─────────────────┤ modo USER (JWT)
        │   (CertificationDialog,        │
        │    bucket certificates,        │
        │    namespace {user_id}/)       ▼
        │                    extractText (PDF nativo; imagen/scan
        │                    → no_extractable_text → extraction_failed)
        │                                ▼
        │                    cert-engine.extractCert (reglas multilingües,
        │                    reutiliza parseCvDate + detectLanguage)
        │                                ▼
        │                    app_cert_extraction_drafts (pending_review)
        │                    + vínculo opcional a certificación existente
        │                                │
        │                                ▼
        │                    Edge Function cert-apply-draft ◄── confirmación
        │                        ├─ match explícito a fila existente → UPDATE
        │                        │   (solo huecos, o overwrite explícito)
        │                        ├─ sin match → INSERT declared/unverified
        │                        │   con storage_bucket/storage_path ya
        │                        │   vinculados (documento canónico)
        │                        └─ NUNCA toca is_verified/verified_at
        │                                ▼
        │                    app_cert_extraction_events (métricas sin PII)
```

### Reutilización (no copia)

| Pieza compartida | Uso |
|---|---|
| `_shared/cv-extraction/textExtract.ts` | `extractText` + `sha256Hex` tal cual (PDF nativo; sin OCR). |
| `_shared/cv-extraction/engine.ts` | `parseCvDate` (fechas mes/año multilingües → `YYYY-MM-DD`) y `detectLanguage` exportados ya; el motor de cert los importa. |
| `_shared/cv-extraction/types.ts` | `Confidence` reutilizado. |
| Patrones de `cv-extract`/`cv-apply-draft` | hash idempotente, draft pending_review, 409 sin escritura parcial, grants service_role explícitos, eventos sin PII. |
| Subida segura existente | `CertificationDialog.handleFileUpload` (bucket `app_14da0f1941_certificates`, `{user_id}/cert-{ts}.{ext}`, ≤10 MB, PDF/imagen) — NO se duplica. |

### Componentes nuevos

| Pieza | Ruta |
|---|---|
| Migración (tabla drafts + eventos + RLS + guard) | `sql/043-pb-cert-auto-profile.sql` |
| Motor de extracción de certificados (puro) | `supabase/functions/_shared/cv-extraction/certEngine.ts` |
| Tests del motor (Deno) | `supabase/functions/_shared/cv-extraction/certEngine_test.ts` |
| Edge Function extracción | `supabase/functions/cert-extract/index.ts` |
| Edge Function confirmación | `supabase/functions/cert-apply-draft/index.ts` |
| Cliente frontend | `app/frontend/src/lib/certDrafts.ts` |
| UI revisión (integrada en el diálogo existente) | `app/frontend/src/components/certifications/CertificationDialog.tsx` |
| i18n (11 locales) | `app/frontend/src/i18n/locales/*.json` (clave `certExtract`) |
| RLS/security QA | `tests/cert-auto-profile-rls.spec.ts` |
| Fixtures sintéticos | `tests/fixtures/cert-*.txt` |

## 5. Modelo de datos (sql/043)

### `app_cert_extraction_drafts`

```
id                  uuid PK
user_id             uuid NOT NULL → auth.users(id) ON DELETE CASCADE
doc_sha256          text NOT NULL CHECK (length = 64)
storage_bucket      text NOT NULL
storage_path        text NOT NULL          -- documento ya subido (canónico)
file_name           text NOT NULL
mime_type           text
extraction_method   text CHECK IN ('native_text','unavailable')
extraction_status   text NOT NULL DEFAULT 'pending_review'
                    CHECK IN ('pending_review','review_confirmed','dismissed',
                              'extraction_failed','superseded')
extracted_fields    jsonb NOT NULL DEFAULT '[]'
                    -- [{field: 'certification_name'|'issuing_organization'|
                    --   'credential_id'|'issue_date'|'expiry_date',
                    --   value, source:'certificate_document', confidence,
                    --   extracted_at, source_document_id}]
linked_certification_id uuid NULL → app_worker_certifications(id)
                    -- vínculo propuesto/confirmado a fila existente (declarada
                    -- desde CV o creada manualmente sin documento)
error_code          text CHECK IN ('no_extractable_text','unsupported_mime',
                    'text_extraction_error','engine_error','storage_read_error')
attempt_count       integer NOT NULL DEFAULT 1
created_at / updated_at / reviewed_at  timestamptz
UNIQUE (user_id, doc_sha256)
```

### `app_cert_extraction_events`

Apéndice de métricas sin PII: `cert_extraction_started`,
`cert_extraction_completed`, `cert_extraction_failed`,
`cert_review_confirmed`, `fields_extracted_count`,
`fields_confirmed_count`, `linked_existing` (bool).

### RLS (mismo patrón que 041)

- SELECT: solo propietario.
- UPDATE: solo propietario y SOLO columnas de revisión
  (`extraction_status`, `reviewed_at`, `updated_at`,
  `linked_certification_id`) vía trigger guard
  `pb_cert_draft_owner_update_guard` (patrón `pb_cv_draft_owner_update_guard`).
- INSERT/DELETE: sin policy para authenticated/anon (solo service_role).
- Grants service_role EXPLÍCITOS en la migración (lección de sql/042: los
  default privileges no aplican vía Management API).

## 6. Motor de extracción de certificados

Reglas deterministas multilingües (ES/EN/PT/NL/FR/DE/IT/RO/PL/UK/BG, mismos
idiomas que el CV). Sin LLM. Estrategia por campo:

| Campo | Estrategia | Confianza |
|---|---|---|
| `certification_name` | Catálogo de certificaciones conocidas del dominio (VCA, SCC, ISO 9606, EN 287, TIG 141/142, MIG/MAG 135/136, flange, NDT/VT/PT/MT/RT, confined space, working at height, forklift…) con sinónimos multilingües; match exacto de catálogo → high; etiqueta "certificate of …" → medium; heurística de titular → low. |
| `issuing_organization` | Etiquetas multilingües ("issued by", "ausgestellt von", "uitgegeven door", "émis par", "wydane przez"…) + línea siguiente; catálogo de emisores conocidos (TÜV, Bureau Veritas, Lloyd's, DNV, SGS, Applus, VCA Infra, NIL, Hobart…). |
| `credential_id` | Etiquetas ("certificate no.", "credential id", "reg. nr", "certificaatnummer", "nº de certificado"…) + patrón alfanumérico con dígitos. |
| `issue_date` | Etiquetas ("issue date", "datum", "fecha de emisión", "ausstellungsdatum"…) + `parseCvDate` reutilizado (mes/año multilingüe) + formatos ISO/DD-MM-YYYY. Fechas ambiguas (solo año, o DD/MM vs MM/DD irresoluble) → low o ausente, NUNCA inventadas. |
| `expiry_date` | Igual con etiquetas de caducidad ("valid until", "gültig bis", "geldig tot", "caduca", "vervaldatum"…). "No expiry"/"unlimited" → ausente (no fecha). |

Reglas duras:

- Solo se extrae lo que consta explícitamente; ausencia de etiqueta + valor
  claro ⇒ campo ausente (no se propone).
- `issue_date > expiry_date` ⇒ ambas low (revisión obligatoria).
- Fecha futura de emisión ⇒ low.
- El motor NO tiene extractores de datos personales sensibles.

## 7. Flujo de aplicación (cert-apply-draft v2 — atómico transaccional)

**Corrección de la revisión PO (PR #83):** toda la lógica de aplicación vive
en la función PostgreSQL `pb_cert_apply_draft` (sql/044), ejecutada como UNA
transacción. La Edge Function es un wrapper fino (autenticación + RPC).

**Concurrencia e idempotencia (en base de datos):**

- `SELECT ... FOR UPDATE` sobre el draft: dos confirmaciones simultáneas del
  mismo draft se serializan; la primera confirma, la segunda ve
  `review_confirmed` y recibe `already_confirmed` sin reescribir nada.
  Imposible crear dos certificaciones del mismo draft.
- `SELECT ... FOR UPDATE` sobre la certificación destino: updates
  concurrentes al mismo registro (p. ej. dos drafts vinculados a la misma
  certificación) se serializan; nunca hay escritura parcial entrelazada.
- Cierre del draft + métrica en la misma transacción.

**Protección de certificaciones verificadas:** los cinco campos extraíbles
(`certification_name`, `issuing_organization`, `credential_id`,
`issue_date`, `expiry_date`) forman parte de la acreditación. Un registro con
`is_verified=true` NO puede modificarlos por esta vía — ni rellenando huecos
ni con `overwrite` explícito — porque conservaría una verificación que nunca
cubrió los datos nuevos. Solo se admite el no-op (valor idéntico). Los
cambios sobre una certificación verificada requieren el circuito canónico
(renovación / re-verificación). El vínculo del documento
(`storage_bucket`/`storage_path`) sí puede completarse si falta: es un
metadato, no un dato de acreditación.

Entrada: `draft_id` + decisiones del usuario por campo
(`accept` / valor editado / `reject`) + `target_certification_id` opcional
+ `overwrite` por campo.

1. Valida autenticación (JWT) → `p_user_id` derivado del token, nunca del body.
2. RPC atómico:
   - bloquea el draft; verifica propiedad (cross-user = 404) y estado
     `pending_review` (o `already_confirmed` idempotente);
   - resuelve destino (explícito > vínculo propuesto salvo rechazo); target
     ajeno = 403; bloquea el destino;
   - resuelve campo a campo SIN escribir: hueco → fill; igual → no-op;
     distinto → exige `overwrite` (si no, conflicto); verificado + cambio →
     `verified_cert_protected`; fechas solo ISO completas;
   - conflicto o protección → respuesta con la lista y CERO escrituras
     (el patch se calcula completo antes de escribir nada);
   - INSERT nuevo: `is_verified=false`, `verified_at=null`,
     `storage_bucket`/`storage_path` del draft. UPDATE: solo campos
     decididos + documento si falta; `is_verified`/`verified_at` JAMÁS en
     ningún SET;
   - cierra el draft (`review_confirmed`) + evento de métrica.
3. Respuesta: `{ certification_id, applied_fields, conflicts?, protected_fields? }`.

El apply NO llama a `pb_recalculate_profile_state`: las certificaciones no
alimentan ese RPC (verificado: el RPC canónico no lee
`app_worker_certifications` para el flag; la verificación documental es un
circuito aparte). Si una revisión futura del RPC lo requiere, se añadirá en su
propio ticket.

## 8. Propuesta OCR (SEPARADA — sujeta a aprobación)

**Problema:** fotos y PDFs escaneados no tienen capa de texto; fase 1 los
deja en fallback manual. El brain ya contempla `cert-verification-ocr` como
futuro (TECH_STACK.md "Future", SUPABASE_ARCHITECTURE.md P2) sin proveedor
autorizado.

**Restricción del ticket:** los documentos (PII profesional) NO pueden salir a
servicios externos de IA/OCR sin autorización específica.

**Opciones evaluadas:**

| Opción | Privacidad | Viabilidad en Edge Functions | Coste | Recomendación |
|---|---|---|---|---|
| Tesseract.js (WASM) en la Edge Function | Documento NO sale de infra | Deno-compatible vía npm; límite de CPU/memoria de Edge Functions (50 MB bundle, CPU compartida) — riesgo de timeout en imágenes grandes | 0 | **Candidata preferida** si pasa spike de rendimiento |
| OCR en cliente (Tesseract.js en el navegador) | Documento NO sale del dispositivo | Sin límites de Edge; bundle +~2 MB; móviles antiguos lentos | 0 | Alternativa sólida |
| Proveedor externo (Google Vision / AWS Textract / LLM visión) | **Requiere autorización explícita de datos** | Sin problema técnico | Por llamada | Solo con GO explícito del PO |

**Propuesta concreta (cuando se apruebe la fase OCR):** spike de Tesseract.js
WASM en `cert-extract` con límite de tamaño (≤ 5 MP, timeout 20 s), idiomas
`eng+spa+nld+deu+fra+por`; si el spike falla por límites de runtime, OCR en
cliente con el mismo motor de reglas posterior. Ninguna de las dos envía datos
fuera. Mientras tanto, fase 1 declara imagen/scan como fallback manual honesto.

**No se implementa OCR en este PR.**

## 9. UX (integrada en CertificationDialog existente)

1. Usuario sube PDF → se dispara `cert-extract` (mismo punto que hoy guarda
   `storage_bucket`/`storage_path`).
2. Mientras extrae: estado de carga "Analizando el documento…".
3. Con draft: el formulario aparece **pre-rellenado** con los valores
   propuestos; cada campo muestra distintivo de confianza; los `low` llevan
   aviso "verifica este dato". El usuario corrige y guarda (CTA existente).
   Guardar = `cert-apply-draft` con las decisiones.
4. Sin texto (imagen/scan): mensaje honesto "No hemos podido leer los datos
   automáticamente. Complétalos manualmente." + formulario en blanco. NO se
   presenta como extracción.
5. Si el nombre extraído coincide con una certificación ya declarada del
   usuario (p. ej. desde el CV), la UI ofrece "Completar «VCA Básico»
   existente" en lugar de crear duplicado; la elección es explícita.
6. Móvil: el diálogo existente ya es responsive; los distintivos de confianza
   son iconos + color, sin tablas nuevas.

## 10. Métricas (sin PII)

`cert_extraction_started`, `cert_extraction_completed`,
`cert_extraction_failed`, `cert_review_confirmed`,
`fields_extracted_count`, `fields_confirmed_count`, `linked_existing`.

## 11. QA plan

Fixtures sintéticos (generador PDF minimal reutilizado de
`/tmp/make-qa-pdfs.mjs`):

1. Certificado completo (VCA, emisor, nº, emisión, caducidad) → 5 campos.
2. Certificado sin fechas → no inventa.
3. Fechas ambiguas → low, sin autoaceptar.
4. PDF escaneado (sin texto) → `extraction_failed` honesto, doc conservado.
5. Imagen JPG → `unsupported_mime` para extracción, fallback manual.
6. Mismo PDF dos veces → 0 duplicados (`already_processed`).
7. Vinculación a declared-from-CV → UPDATE de la misma fila, 0 duplicados.
8. Conflicto (nombre existente distinto) → 409 sin escritura parcial;
   overwrite explícito → aplica.
9. Registro verificado existente → apply NO toca `is_verified`/`verified_at`.
10. Cross-user: A no lee/aplica draft de B (spec RLS).
11. Idiomas: ES/EN/DE funcionales + cobertura estructural del resto.
12. `deno check` (funciones) + `npm run typecheck` (frontend) + build completo.

### 11b. QA de las correcciones de la revisión PO (SHA 704af20)

Pruebas reales en base de datos contra la función desplegada (v2, RPC
`pb_cert_apply_draft`), cuentas sintéticas y limpieza verificada:

Suite de concurrencia y protección (30/30 PASS):

- Dos confirmaciones simultáneas del MISMO draft (`Promise.all`):
  exactamente una `confirmed` + una `already_confirmed`; UNA certificación;
  UN evento `cert_review_confirmed`; draft cerrado y vinculado.
- Reintento secuencial tras confirmación → `already_confirmed`, sin nueva
  certificación.
- Conflicto sin `overwrite` → 409 con `conflicts[]` y cero escrituras
  parciales (dato intacto); con `overwrite` explícito → aplica.
- Dos drafts distintos aplicando en paralelo sobre el MISMO registro
  destino: ambos confirman, misma fila, estado final coherente (uno de los
  dos valores, nunca mezclado), una sola fila.
- Certificación verificada (`is_verified=true`): cambio de campo de
  acreditación CON `overwrite` → bloqueado (`verified_cert_protected` 409);
  datos y verificación intactos; no-op (valores idénticos) → permitido con
  0 campos escritos.
- Cross-user: B no puede aplicar el draft de A (404, draft intacto).

Suite de contrato v2 (15/15 PASS):

- INSERT nuevo → `is_verified=false`, `verified_at=null`, documento vinculado.
- Fechas no-ISO (`03/2023`, basura) → descartadas, nunca escritas.
- `reject_linked:true` → cert NUEVA pese al vínculo propuesto.
- Target cross-user → 403, cert y draft intactos.

Specs RLS Playwright ejecutados con entorno real (4/4 PASS cada uno, sin
skips): `cert-auto-profile-rls.spec.ts` y `cv-auto-profile-rls.spec.ts`
(regresión CV intacta). Los tests requieren `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, `E2E_TEST_EMAIL/PASSWORD`; sin entorno se
auto-skipan y NO cuentan como PASS.

## 12. Impacto en entorno compartido

QA y producción comparten el proyecto Supabase `mwdauubztjxkbrefirbg`.
sql/043 crea tablas NUEVAS (`app_cert_extraction_drafts`,
`app_cert_extraction_events`) y NO modifica tablas ni políticas existentes:
impacto cero sobre el flujo actual de certificados hasta que el frontend se
despliegue. Las Edge Functions nuevas (`cert-extract`, `cert-apply-draft`) son
aditivas; nada las invoca hasta el deploy del frontend. Rollback: DROP de las
dos tablas + borrar las dos funciones (documentado en la migración).

sql/044 (corrección PO) añade SOLO la función `pb_cert_apply_draft`
(CREATE OR REPLACE, aditiva) y no toca tablas/políticas. `cert-apply-draft`
v2 ya está desplegada en el entorno compartido (QA); producción no la sirve
hasta el deploy del frontend. Rollback de 044: `DROP FUNCTION
public.pb_cert_apply_draft(uuid, uuid, jsonb, uuid, boolean);` + redeploy del
bundle v1 (`docs/deploy-candidates/cert-apply-draft.36f3f92.ts`). El formato
de datos no cambia entre v1 y v2: el rollback es seguro y sin pérdida.

## 13. Entrega

- PR `feat/pb-cert-auto-profile-001` con: diseño (este doc), migración,
  funciones, UI, i18n 11 locales, métricas, QA, spec RLS, rollback, SHA
  candidato.
- **Sin merge ni deploy de producción**: requieren aprobación posterior.
- Tests auto-skipados se reportan como pendientes, nunca como PASS.
