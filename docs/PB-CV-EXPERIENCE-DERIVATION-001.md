# PB-CV-EXPERIENCE-DERIVATION-001 — Diseño y QA

**Ticket**: CV → Auto Profile — `years_experience` derivado del historial
laboral + visibilidad del estado de extracción para Recruitment.
**Autorización**: GO auditoría + desarrollo + QA + PR. NO-GO merge, deploy,
migraciones en producción, modificar al candidato real ni emails reales.
**Estado**: IMPLEMENTADO + QA PASS. Pendiente de GO del PO para merge y
producción.

---

## 1. Causa raíz confirmada (FASE 1)

### Auditoría del motor actual

- `cv-extract` (`supabase/functions/cv-extract/index.ts`) llama al motor
  determinista local `extractCv` (`_shared/cv-extraction/engine.ts`).
- `extractYearsExperience()` **solo** reconoce frases literales
  (`15 años de experiencia`, `15 years experience`, …). Si el CV no contiene
  la frase, no se emite el campo.
- `extractExperiences()` **sí** detecta experiencias individuales con fechas
  (`start_date`/`end_date`/`currently_working`) y las guarda en
  `proposed_experiences`, pero **esas fechas nunca se usaban para derivar
  `years_experience`**. Esa es la causa raíz.
- `cv-apply-draft` aplica `years_experience` con el contrato ya correcto
  (FASE 6 verificada): `0` = DEFAULT/no confirmado (se rellena sin
  conflicto), `>0` distinto exige `overwrite` explícito o genera conflicto;
  tras el parche ejecuta el recálculo canónico `pb_recalculate_profile_state`.
  No requiere cambios: el campo derivado fluye por el mismo camino que el
  explícito.

### Caso real en producción (READ-ONLY, sin modificar nada)

Candidato `012f3094-a91d-495f-bc01-7648fbb9f8df`, aplicó a
**"2 Soldadores TIG + Electrodo — Suecia"** (job `8c1d4f6a-…`):

- Draft CV: `extraction_status = pending_review` (NO confirmado).
- Campos extraídos: `certifications_declared, disciplines, email, languages,
  phone, skills, summary, welding_processes` — **sin `years_experience`**.
- `proposed_experiences`: presentes (experiencias con fechas detectadas).
- Perfil: `years_experience = 0` (DEFAULT).

Conclusión: el motor no emitió años porque el CV no contenía la frase
literal, aunque sí tenía historial fechado. Además el draft sigue
`pending_review`: el candidato subió el CV, aplicó y no completó la revisión
(motiva la FASE 4). Dato agregado de producción: de los drafts
`pending_review`/`review_confirmed`, **ninguno** contiene
`years_experience` explícito — el caso no es aislado.

## 2. Diseño (FASES 2-3)

### Cálculo canónico — `_shared/cv-extraction/experienceDerivation.ts`

- Cada experiencia válida → intervalo en meses absolutos.
  Formatos: `YYYY-MM-DD` (trunca a mes), `YYYY-MM`, `YYYY` (punto medio
  documentado: 1 de julio, ±6 meses → baja precisión global a *medium*);
  `currently_working` → fin = mes actual **inyectable** (tests deterministas).
- Sin inicio, o sin fin y no actual, o fin < inicio, o fecha no
  interpretable → intervalo **ignorado** (nunca inventado).
- **Anti-doble-conteo (FASE 2B)**: fusión de intervalos solapados/tangentes
  antes de sumar. Dos empleos simultáneos de 2 años = 2. Un contrato
  contenido no suma.
- **Conversión (FASE 2C)**: `years_experience = floor(total_months / 12)`,
  conservando `total_months` en metadata. Sin redondeo al alza. No se emite
  propuesta < 1 año (el campo es entero).
- **Provenance (FASE 2D)**: `ExtractedField` se extiende de forma
  retrocompatible con `provenance?: 'cv_text' | 'derived_from_experience_dates'`
  y `derivation?: { total_months, derived_years, intervals_used,
  intervals_total, explicit_years?, consistency? }`. Los consumidores
  existentes solo leen `field`/`value` — nada se rompe.
- **Confianza**: derivado = high solo con precisión de mes completa y todos
  los intervalos utilizables; si no, medium. Nunca low.
- **Explícito vs derivado (FASE 2E)**: umbral centralizado
  `EXPLICIT_DERIVED_DISCREPANCY_YEARS = 3`:
  - |diff| ≤ 1 → explícito se mantiene `high` + `consistency: 'coherent'`;
  - diff = 2 → explícito baja a `medium` (`uncertain`);
  - diff ≥ 3 → explícito baja a `low` + `consistency: 'discrepant'`
    (revisión explícita obligatoria; el valor explícito **no** se
    sobrescribe).
- Sin explícito → se propone el derivado (si ≥ 1 año).

### DRAFT FIRST intacto (FASE 3)

El flujo no cambia: extracción → draft `pending_review` → revisión del
usuario → `cv-apply-draft` → perfil canónico → recálculo canónico. El valor
derivado es una propuesta más del draft; nada se autoescribe.

## 3. UX candidato (FASE 4)

1. **CTA post-extracción** (`CVUploadSection`): cuando `cv-extract` termina
   sobre el CV recién subido aparece un bloque prominente
   (`data-testid="cv-extraction-ready-cta"`): “Hemos encontrado información
   profesional en tu CV. Revísala para completar tu perfil.” + CTA
   **“Revisar mi perfil”** → `/profile/cv-review`.
2. **Aviso tras aplicar** (`JobDetail`): tras una candidatura correcta se
   muestra `CVReviewBanner` (ya existente) si hay draft pendiente — paso
   inmediato hacia la revisión. No bloquea la candidatura; no cambia
   Marketplace Ready ni Recruitment V3.

## 4. Visibilidad Recruitment (FASE 5)

- Migración `sql/057`: RPC `pb_cv_extraction_status_for_candidate(uuid)`
  SECURITY DEFINER con `search_path` fijo, gate `app_is_admin()` (mismo
  mecanismo que las policies admin existentes), EXECUTE solo para
  `authenticated` + `service_role` (revocado de PUBLIC/anon).
  Devuelve **exclusivamente metadatos agregados**: estado, fechas,
  contadores, `years_experience` (valor + provenance + confidence +
  consistency). Jamás campos extraídos, experiencias, texto del CV ni rutas
  de storage.
- Ficha de candidato (`pages/company/CandidateProfile.tsx`): bloque
  compacto “CV Extraction” visible solo para admin/recruitment, fail-open
  (si el RPC no existe todavía o deniega, la ficha no se rompe).

## 5. Métricas (FASE 8)

Columnas nuevas en `app_cv_extraction_events` (sin PII):
`years_experience_source` (`explicit|derived|none`, con CHECK),
`experience_intervals_count`, `experience_total_months_derived`,
`experience_explicit_derived_conflict`. `cv-extract` las emite en
`cv_extraction_completed` y en el log estructurado (allowlist ampliada).

## 6. i18n

Claves nuevas en los 11 locales (en, es, pt, nl, fr, de, it, ro, pl, uk,
bg): `cvReview.extractionFoundTitle/Desc` y
`candidateProfile.cvExtraction.*` (estados, contadores, derivado/explícito,
fechas, discrepancia).

## 7. Archivos modificados

| Archivo | Cambio |
| --- | --- |
| `supabase/functions/_shared/cv-extraction/experienceDerivation.ts` | **Nuevo**: cálculo canónico (parseo, fusión, floor, clasificador, umbral) |
| `supabase/functions/_shared/cv-extraction/experienceDerivation_test.ts` | **Nuevo**: 16 tests deterministas |
| `supabase/functions/_shared/cv-extraction/types.ts` | `ExtractedField`: `provenance` + `derivation` (retrocompatible) |
| `supabase/functions/_shared/cv-extraction/engine.ts` | Wiring: explícito + derivado + discrepancia |
| `supabase/functions/cv-extract/index.ts` | Métricas agregadas (evento + log allowlist) |
| `supabase/functions/cv-apply-draft/index.ts` | Sin cambios (verificado FASE 6) |
| `sql/057-pb-cv-experience-derivation-001.sql` | **Nueva**: columnas eventos + RPC admin-only |
| `app/frontend/src/components/profile/CVUploadSection.tsx` | CTA post-extracción (FASE 4.1) |
| `app/frontend/src/pages/JobDetail.tsx` | Banner draft tras aplicar (FASE 4.2) |
| `app/frontend/src/pages/company/CandidateProfile.tsx` | Bloque CV Extraction (FASE 5) |
| `app/frontend/src/i18n/locales/*.json` (×11) | Claves nuevas |
| `docs/PB-CV-EXPERIENCE-DERIVATION-001.md` | Este documento |

## 8. Tests y resultado (FASE 7)

**Deno** (`deno test supabase/functions/_shared/cv-extraction/`): **44/44**
(28 existentes intactos + 16 nuevos). Cobertura de los casos del ticket:

1. Una experiencia 2015-01→2020-01 = 5 ✅
2. Consecutivas 2010→2015→2020 = 10 ✅
3. Solapadas 2010→2015 + 2013→2018 = 8 (no 10) ✅
4. Contenida 2010→2020 + 2015→2017 = 10 ✅
5. Trabajo actual con `now` inyectado ✅
6. Solo años 2010→2015 (punto medio documentado) = 5, precisión medium ✅
7. Fechas inválidas ignoradas; un intervalo malo no impide el bueno ✅
7b. `YYYY-MM-DD` trunca a mes ✅
8. Explícito coherente ("15 years" + cronología ~15) → high/coherent ✅
9. Explícito discrepante ("20 years" + cronología 7) → low/discrepant,
   valor explícito intacto ✅
10. Sin explícito → derivado con provenance (high con precisión completa,
    medium con solo-años) ✅
11. (cubierto por el contrato existente de `cv-apply-draft`, verificado en
    FASE 6: `0` rellena sin conflicto; `>0` distinto exige overwrite)
12. Idempotencia: reprocesar no altera cálculo ni duplica ✅
13. < 1 año: no se emite propuesta ✅
14. Simultáneos idénticos cuentan una vez ✅
15. Clasificador: umbrales deterministas ✅

**Frontend**: `npm run typecheck` ✅ · `npm run lint` ✅ ·
`npm run build` ✅ (build completo con salida correcta).

**QA SQL en branch aislada** `pb-cv-experience-derivation-qa`
(`qgxevpfxzmzpyeikxsyl`, `with_data=false`, sin datos reales ni PII;
producción intacta), esquema fiel: `app_14da0f1941_profiles` mínima +
`app_is_admin()` copiado verbatim de producción + **sql/041 real** +
sql/057:

| Caso | Resultado |
| --- | --- |
| Caller sin JWT (auth.uid() NULL) → RPC | **42501 denied** ✅ |
| Admin + candidato sin draft | `not_processed` ✅ |
| Admin + draft pending_review derivado | estado + 10 años + provenance `derived_from_experience_dates` + high ✅ |
| Admin + draft review_confirmed discrepante | `review_confirmed` + reviewed_at + `discrepant` + valor explícito 20 intacto ✅ |
| Authenticated NO admin → RPC | **42501 denied** ✅ |
| Insert evento con nuevas columnas | OK ✅ |
| CHECK enum `years_experience_source` | rechaza valor inválido ✅ |
| Grants RPC | EXECUTE solo authenticated/service_role/postgres; **sin anon/PUBLIC** ✅ |
| Rollback documentado | función y columnas eliminadas limpias; re-aplicación OK ✅ |

**Bug detectado y corregido por este QA**: la primera versión del RPC leía
`d.processed_at`, columna inexistente (PL/pgSQL no valida en CREATE; habría
fallado en runtime en producción). Corregido a `d.created_at AS
processed_at` antes del PR.

## 9. Impacto DB / seguridad / RLS

- **DB**: 4 columnas nuevas (aditivas, NULL por defecto) + 1 CHECK NOT
  VALID + 1 RPC nuevo. Sin cambios en tablas canónicas ni datos existentes.
  Sin tocar policies de drafts/events (RLS owner-only de sql/041 intacta).
- **RLS/acceso**: el RPC es la única vía nueva de lectura; gate
  `app_is_admin()`, SECURITY DEFINER con `search_path` fijo, grants mínimos
  verificados (QA-4). La UI solo lo invoca para viewers admin.
- **Privacidad**: métricas y bloque recruitment = agregados; nunca texto del
  CV, empresas, puestos, fechas individuales ni PII. Sin LLM externo
  (motor determinista local, inalterado en ese aspecto).
- **Scope (FASE 9)**: no se tocan Marketplace Ready, candidatura,
  certificados verificados, storage ownership, RLS existentes, emails ni
  permisos recruitment.

## 10. Rollback

- **Frontend**: redeploy del SHA anterior (procedimiento estándar del
  runbook). Los bloques nuevos son fail-open; retirarlos no afecta al resto.
- **DB** (sql/057):
  ```sql
  DROP FUNCTION IF EXISTS public.pb_cv_extraction_status_for_candidate(uuid);
  ALTER TABLE public.app_cv_extraction_events
    DROP COLUMN IF EXISTS years_experience_source,
    DROP COLUMN IF EXISTS experience_intervals_count,
    DROP COLUMN IF EXISTS experience_total_months_derived,
    DROP COLUMN IF EXISTS experience_explicit_derived_conflict;
  ```
  Probado en QA (QA-5): limpio y reversible.
- **Edge functions**: `cv-extract` se redespliega a la versión anterior
  (sin métricas nuevas); las columnas quedan NULL, sin impacto. El motor
  anterior se restaura con el deploy de funciones del SHA previo.
- Los drafts ya extraídos con el motor nuevo conservan sus campos
  (retrocompatibles: `provenance`/`derivation` son opcionales).

## 11. Evidencia del caso real (FASE 10.12)

Antes (producción, READ-ONLY, 2026-10-19): draft `pending_review` **sin**
`years_experience`, perfil `0`. El caso quedará resuelto cuando el candidato
confirme el draft tras el deploy: el motor propondrá el valor derivado de
sus experiencias fechadas. **No se ha modificado al candidato** (NO-GO del
ticket); la corrección opera sobre futuras extracciones y sobre el retry
controlado del draft existente si el candidato o soporte lo reprocesa.

## 12. Limitaciones conocidas

- Fechas solo-año usan punto medio (±6 meses) → confianza medium; nunca se
  inventa precisión.
- Sin OCR (fuera de scope): un CV escaneado sin texto sigue
  `extraction_failed` con fallback manual, como hasta ahora.
- `processed_at` del RPC = `created_at` del draft (primera extracción de ese
  hash); en retries refleja la primera, no la última — documentado.
- La visibilidad recruitment requiere rol admin (`app_is_admin()`); viewers
  `jobs_moderator`/company no ven el bloque (decisión conservadora; se puede
  ampliar con un gate dedicado en un ticket futuro).

## 13. Recomendación

**GO para merge** (CI verde sobre el SHA candidato) y, tras GO de
producción: aplicar sql/057, desplegar `cv-extract` (motor + métricas) y el
frontend, y re-ejecutar la matriz SQL QA-1…QA-5 contra producción con
cuentas sintéticas + smoke del flujo CV completo. `cv-apply-draft` no
cambia; puede no redesplegarse.
