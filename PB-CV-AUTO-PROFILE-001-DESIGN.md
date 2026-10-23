# PB-CV-AUTO-PROFILE-001 — CV → AUTO PROFILE

**Estado:** GO IMPLEMENTATION (desarrollo + QA + PR). **NO PROD DEPLOY todavía.**
**Rama:** `feat/pb-cv-auto-profile-001`

## 1. Objetivo

PIPINGBOX extrae automáticamente los datos profesionales de un CV y prepara un
borrador del perfil del candidato. El usuario revisa y confirma en 1-2 minutos.
Diseñado para usuarios con poca familiaridad tecnológica. No inventa
información. Ninguna certificación queda verificada por aparecer en un CV.

## 2. Principios no negociables

| Principio | Implementación |
|---|---|
| **DRAFT FIRST** (§3) | Toda extracción vive en `app_cv_extraction_drafts` con estado `pending_review`. El perfil NO se toca hasta la confirmación del usuario vía `cv-apply-draft`. |
| **No sobrescribir confirmados** (§4) | Prioridad: confirmado usuario > sistema > CV > derivado. Conflicto (perfil ≠ CV) → el backend EXIGE `overwrite:true` explícito por campo; si no, responde 409 con la lista de conflictos y NO aplica nada. La UI muestra perfil vs CV sin marcar. |
| **Certificaciones** (§6) | CV → filas `app_worker_certifications` con `is_verified=false`, `verified_at=null`, sin Storage: **declared/unverified**. Si ya existe una con el mismo nombre, no se toca (mucho menos su verificación). |
| **Marketplace Ready** (§7) | Tras confirmar, se invoca EXCLUSIVAMENTE `pb_recalculate_profile_state` (mantiene o degrada; nunca promueve). La promoción solo existe por `pb_complete_onboarding` (wizard). La extracción NO garantiza Marketplace Ready. |
| **No inventar / no sensibles** (§2) | El motor no tiene extractores para nacionalidad, permiso de trabajo, situación migratoria, estado civil, edad, salud, religión ni etnia: no se filtran, no existen en el enum cerrado `CV_FIELD_NAMES`. |
| **Idempotencia** (§15) | `UNIQUE (user_id, cv_sha256)` (SHA-256 del binario). Mismo CV → `already_processed` o actualización controlada de la misma fila. Retry de `extraction_failed` incrementa `attempt_count` sin crear filas. |
| **Fallos** (§14) | `extraction_failed` con `error_code` cerrado; el objeto Storage se conserva; el usuario puede completar el perfil manualmente; retry seguro sin duplicados. |
| **Confianza** (§13) | `high/medium/low` por campo. `low` NUNCA se autoacepta: la UI lo muestra deshabilitado con distintivo "verifica este dato". |
| **Privacidad** (§12) | Motor determinista local (sin LLM externo): el texto del CV no sale de la infraestructura. Logs solo con enums/códigos/contadores. El email de recuperación no contiene datos extraídos. |

## 3. Arquitectura

```
CV (PDF/DOCX)                     Edge Function cv-extract            UI /profile/cv-review
     │                                    │                                │
     ├─ usuario sube (CVUploadSection) ───┤ modo USER (JWT)                │
     ├─ soporte recibe (support@) ────────┤ modo SUPPORT (service_role)    │
     │                                    │   └─ match email inequívoco   │
     │                                    │      ambiguo → manual_review  │
     │                                    │      (NO WRITE)               │
     │                                    ▼                                │
     │                    textExtract (PDF nativo / DOCX XML;              │
     │                    sin texto útil → extraction_failed)              │
     │                                    ▼                                │
     │                    engine.extractCv (reglas multilingües ES/EN/     │
     │                    PT/NL/FR/DE/IT/RO/PL/UK/BG)                      │
     │                                    ▼                                │
     │                    app_cv_extraction_drafts (pending_review) ───────┤ banner + email
     │                                    │                                ▼
     │                                    │              revisión 1-2 min (aceptar/editar/rechazar)
     │                                    │                                │
     │                                    ▼                                ▼
     │                    Edge Function cv-apply-draft ◄── confirmación explícita
     │                        ├─ perfiles: solo huecos o overwrite explícito
     │                        ├─ experiencias: dedupe employer/role/fechas
     │                        ├─ certificaciones: declared/unverified
     │                        └─ pb_recalculate_profile_state (RPC canónico)
     │                                    ▼
     │                    app_cv_extraction_events (métricas sin PII)
```

### Componentes

| Pieza | Ruta |
|---|---|
| Migración (tablas + RLS + trigger guard) | `sql/041-pb-cv-auto-profile.sql` |
| Tipos del motor | `supabase/functions/_shared/cv-extraction/types.ts` |
| Diccionarios multilingües | `supabase/functions/_shared/cv-extraction/dictionaries.ts` |
| Motor de extracción (puro, determinista) | `supabase/functions/_shared/cv-extraction/engine.ts` |
| Extracción de texto (PDF nativo / DOCX) | `supabase/functions/_shared/cv-extraction/textExtract.ts` |
| Tests del motor (Deno) | `supabase/functions/_shared/cv-extraction/engine_test.ts` |
| Edge Function extracción | `supabase/functions/cv-extract/index.ts` |
| Edge Function confirmación | `supabase/functions/cv-apply-draft/index.ts` |
| Cliente frontend | `app/frontend/src/lib/cvDrafts.ts` |
| Página de revisión | `app/frontend/src/pages/CVReview.tsx` |
| Banner perfil | `app/frontend/src/components/profile/CVReviewBanner.tsx` |
| Trigger post-subida | `app/frontend/src/components/profile/CVUploadSection.tsx` |
| Ruta SPA | `/profile/cv-review` (`App.tsx` + `SPA_ROUTE_CONTRACT.ts`) |
| i18n (11 locales) | `app/frontend/src/i18n/locales/*.json` (clave `cvReview`) |
| Email recuperación (11 locales) | `supabase/functions/_shared/email-i18n/` (plantilla `cv_review_pending`) |
| RLS/security QA | `tests/cv-auto-profile-rls.spec.ts` |
| Fixtures sintéticos | `tests/fixtures/cv-*.txt` |

### Casos de uso (§1)

- **A. Usuario con perfil:** sube CV → `cv-extract` (modo USER) → draft → banner → revisión → confirmación.
- **B. Auth sin perfil:** el draft se crea contra `auth.users` (no exige fila de perfil). Al entrar, `ensureProfile` crea el perfil canónico y la revisión lo completa. Nada se declara Marketplace Ready.
- **C. Soporte:** `cv-extract` (modo SUPPORT) con `{storage_bucket, storage_path, candidate_email}`. Match inequívoco por email (escaneo paginado de `auth.users`, tope 10.000; más allá → manual review). Ambiguo o sin match → `manual_review`, SIN escritura. Con match: draft + email `cv_review_pending` localizado.

### Formatos (§9)

- PDF → texto nativo SIEMPRE primero (pdfjs-dist legacy). Un PDF con texto jamás pasa por OCR.
- DOCX → XML `word/document.xml` (jszip).
- DOC legacy / imágenes / PDF escaneado sin texto útil → fase 1 SIN OCR (no hay proveedor de visión autorizado): `extraction_failed` con `no_extractable_text` / `unsupported_legacy_doc` / `unsupported_mime`. El CV se conserva y el usuario completa manualmente.

### Mapeo campos → perfil

| Campo CV | Destino | Nota |
|---|---|---|
| full_name / title / location / summary / years_experience | perfiles homónimas (summary→bio) | solo huecos o overwrite explícito |
| skills / welding_processes / disciplines | `skills` (merge unión) | aditivo, sin conflicto posible |
| availability | `availability_status` + `available_from` | solo declaraciones inequívocas |
| willing_to_travel / willing_to_relocate | booleanos | solo si explícitos |
| email / phone / languages / education | informativos (no se escriben) | email: auth es canónico; phone: flujo de verificación propio |
| certificaciones | `app_worker_certifications` declared | nunca verified |

## 4. Métricas (§16) — `app_cv_extraction_events`

`cv_extraction_started`, `cv_extraction_completed`, `cv_extraction_failed`,
`cv_extraction_retried`, `cv_already_processed`, `cv_profile_review_confirmed`
(+ cliente: `cv_profile_review_started` en la taxonomía PostHog cerrada).
Contadores: `fields_extracted_count`, `fields_confirmed_count`,
`experiences_extracted_count`, `experiences_applied_count`,
`certifications_proposed_count`, `marketplace_ready_after_confirmation`,
`time_to_confirmation_ms`. Funnel medible: CV recibido → perfil confirmado →
Marketplace Ready → candidatura.

## 5. QA (§17)

- **Fixtures sintéticos**: `tests/fixtures/cv-complete-{es,en,pt}.txt`,
  `cv-incomplete-es.txt`.
- **Motor (Deno, determinista)**: CV completo ES/EN/PT (3 experiencias, skills,
  idiomas, certificaciones), CV incompleto (no inventa), atributos sensibles
  (imposibles por enum), disponibilidad vaga (no extraída), determinismo,
  fechas, idiomas estructurales NL/FR/DE/IT/RO/PL/UK/BG.
  Ejecutar: `deno test --allow-read supabase/functions/_shared/cv-extraction/`
- **RLS/security (Playwright)**: `tests/cv-auto-profile-rls.spec.ts` — anon
  denegado, INSERT solo service_role, cross-user denegado, DELETE denegado.
- **Pendiente de deploy QA** (requiere edge functions desplegadas): flujo
  completo user upload → confirmación; soporte → email; PDF escaneado →
  extraction_failed; segundo usuario cross-user real (E2E_TEST_EMAIL_B).

## 6. Rollback

Las tablas nuevas NO tienen dependientes canónicos (perfil, experiencias,
certificaciones y documentos viven en sus tablas históricas). El rollback no
pierde CVs: los binarios siguen en Storage y las referencias canónicas en
`app_14da0f1941_profiles.cv_storage_*`.

```sql
DROP TRIGGER IF EXISTS pb_cv_draft_owner_update_guard ON app_cv_extraction_drafts;
DROP FUNCTION IF EXISTS public.pb_cv_draft_owner_update_guard();
DROP TABLE IF EXISTS public.app_cv_extraction_events;
DROP TABLE IF EXISTS public.app_cv_extraction_drafts;
```

Después: eliminar las dos edge functions, la ruta `/profile/cv-review`
(App.tsx + SPA_ROUTE_CONTRACT.ts), revertir Profile.tsx a `AICVExtraction` y
elminar los bloques i18n `cvReview` / `cv_review_pending`. Sin cambios de
datos productivos que revertir: todo lo escrito por el flujo pasa por las
tablas/caminos canónicos existentes.

## 7. Impacto DB

- 2 tablas nuevas (~KBs por usuario con CV; JSONB acotado: campos ≤16,
  experiencias ≤~10, certificaciones ≤16).
- 0 cambios de esquema en tablas existentes.
- 1 trigger nuevo (BEFORE UPDATE en drafts), SECURITY INVOKER.
- 0 funciones RPC nuevas: el recálculo usa `pb_recalculate_profile_state`
  (ya existente, grants service_role intactos).
- RLS activada en ambas tablas desde la creación (sin ventana sin RLS).
