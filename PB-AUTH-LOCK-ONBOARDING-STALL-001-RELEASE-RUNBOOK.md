# PB-AUTH-LOCK-ONBOARDING-STALL-001 — Runbook de despliegue controlado (PR #68)

**Fecha:** 13/10/2026 (rev.3 GO para preparar release)
**Estado: EJECUTADO — RELEASE COMPLETADO (13/10/2026 15:47–16:10 UTC, con GO explícito del propietario).**

> **Resultado del despliegue:** workflow "Deploy Cloudflare Workers Production",
> run [38425102681](https://github.com/pipingbox/DASHBOARD-APP/actions/runs/38425102681),
> `commit_sha = eff26f8274403cea86bf1c05306f74cd8c72f4f8` (main) → **SUCCESS**.
> Gates integrados del workflow: Auth E2E production 7/7 PASS, RLS contract
> PASS, public-route smoke PASS. Versión pública verificada:
> `https://app.pipingbox.com/version.json` → `eff26f8…`.
> Smoke post-deploy (Fase 6, cuentas sintéticas desechables): **8/8 PASS**
> (login + sesión tras reload, onboarding completo → MARKETPLACE_READY con
> edge 200, persistencia onboarding, CV TUS + persistencia, certificado +
> persistencia, RLS A↔B + anon, postpone + reanudación, `profile_write_seq`
> activo con seq=1). Cuentas y storage de smoke limpiados (0 filas).
> Monitorización inicial: todos los servicios ACTIVE_HEALTHY; sondas Auth
> 200/0,46 s · PostgREST 200/0,19–0,86 s · Storage 200/0,17 s · app 200/0,27 s.
> Incidencia de plataforma: la API de logs de Supabase (Management API)
> devolvía 502 durante el chequeo — usar el dashboard para la revisión 2 h/24 h.
> Rollback NO ejecutado (ningún gate crítico falló); `sql/029` se conserva.

**Artefactos:**
- PR #68 (`pb-auth-lock-onboarding-stall-001`), head **`d69fa4a`** (código: `25955aa`), incluye main.
- PR #66 (`pb-document-upload-reliability-001`, head `98c4a32`) — **ancestro completo de `d69fa4a`** (verificado): todos sus commits entran con la #68.
- Informe: `PB-AUTH-LOCK-ONBOARDING-STALL-001-DIAGNOSIS.md` (rev.3).
- Gate TypeScript oficial: **PASS en `d69fa4a`** (run 38417142228) y en `10f3733` (13:11Z).

---

## 0. Hechos verificados (base del runbook, solo lectura)

| Verificación | Resultado |
|---|---|
| Gate TypeScript en head final `d69fa4a` | **PASS** (run 38417142228) |
| PR #68 mergeable | MERGEABLE / CLEAN |
| PR #66 contenida en #68 | Sí — `98c4a32` es ancestro de `d69fa4a` (fast-forward de integración) |
| `origin/main` (`4e42f08e`) ancestro de `d69fa4a` | Sí → el merge de #68 es **fast-forward**; main pasaría a ser exactamente `d69fa4a` |
| Producción Supabase (`mwdauubztjxkbrefirbg`, eu-west-1): RPC `pb_complete_onboarding` | Presente |
| Columna `onboarding_postponed_at` | Presente |
| Columnas `cv_*` (PR #66) | Presentes |
| Columna `profile_write_seq` | **Ausente** — `sql/029` es la ÚNICA pieza nueva de BD que requiere el frontend |
| Backups producción | WAL-G físicos diarios (~04:55–05:01 UTC), 8 retenidos, COMPLETED; **PITR desactivado** |
| Mecanismo de deploy | Exclusivamente `.github/workflows/deploy-production.yml` — `workflow_dispatch` manual con SHA en main, environment `production` (nunca por push) |
| Rollback del Worker | Redeploy del SHA anterior vía el mismo workflow; el Worker usa routes de zona (rollback instantáneo documentado en `wrangler.toml`) |

Matriz de pruebas rev.3: **778 PASS efectivos / 26 FAIL ambientales verificados / 0 atribuibles a la rama**, incluyendo integración 2/2 contra PostgreSQL QA real para la guardia CAS y E2E multi-tab 2/2 con pestaña congelada.

---

## Fase 1 — Validación manual Safari iOS (GATE obligatorio, antes de cualquier acción)

> **Estado 13/10/2026 15:22 UTC: BLOCKED — ejecución solicitada, entorno sin dispositivo.**
> Verificado en el turno de ejecución: el entorno del agente es Linux aarch64
> (gVisor) con Playwright 1.64.0 (Chromium únicamente); sin macOS/Xcode
> (`/Applications` y `xcodebuild` inexistentes) y sin acceso a ninguna
> plataforma de dispositivos reales (BrowserStack/Sauce/AWS Device Farm/LambdaTest:
> ninguna credencial presente). Por instrucción explícita del propietario, la
> prueba **no puede sustituirse** por Chromium ni por WebKit emulado (el motor
> real de Safari/iOS, incluido su comportamiento de `navigator.locks` y freeze
> de pestañas, solo existe en dispositivo Apple). Queda pendiente de ejecutor
> humano con iPhone físico o acceso a una plataforma de dispositivos iOS.

Única prueba BLOCKED pendiente. Requisito: iPhone real con iOS actualizado + Safari (o un servicio de dispositivos iOS si el equipo lo prefiere). Duración estimada: 45–60 min.

**Cuenta:** sintética dedicada (`pb-ios-safari-*@pipingbox-test.example`), creada en QA o en la URL de preview del candidato — no en producción, y nunca la cuenta real del Issue #65.

Checklist (cada punto: PASS / FAIL + observaciones, capturas si es posible):

1. **Web Locks reales:** login → dashboard sin spinner >10 s; abrir una segunda pestaña con `/profile` y confirmar que la segunda autentica sin quedar en espera indefinida.
2. **Get Latest PIN / reincidencia de lock:** recargar `/profile` con una pestaña background congelada (background >30 s y volver) — la pestaña activa debe autenticar; al reactivar la background, debe reusar la sesión sin logout.
3. **Onboarding completo:** registro → wizard 8 pasos → Finalizar; persiste tras reload.
4. **Omitir onboarding:** cuenta nueva → Omitir → persiste; el wizard reanuda al volver.
5. **CV (TUS):** subir PDF (~1–9 MB) → 100 % → confirmación; reemplazar; recargar → persiste; eliminar.
6. **Certificados:** subir PNG/PDF → persiste tras reload.
7. **Sesión expirada:** dejar la pestaña >1 h (o forzar expiración) → al volver, refresh transparente o pantalla auth-unavailable con Reintentar — **jamás logout silencioso con pérdida del formulario**.
8. **Freeze en background:** subir un CV, mandar la app a background durante la subida, volver — reanudación o error controlado, sin stuck en 0 %.

**Criterio de salida:** 8/8 PASS → habilita Fase 2+. Cualquier FAIL → NO-GO, documentar en Issue #67 con device/OS/pasos.

---

## Fase 2 — Backup y estrategia de rollback de Supabase

**Estado real (verificado 13/10/2026):** backups físicos WAL-G diarios a las ~04:55–05:01 UTC (8 retenidos, último COMPLETED 13/10 04:55 UTC). **PITR desactivado.**

**Implicación:** una restauración completa de BD solo puede volver al último backup diario (pérdida potencial de hasta ~24 h de datos) y sobrescribe todo el proyecto. Por eso el diseño de esta release hace que la BD sea la última capa a tocar:

**Jerarquía de rollback (de primera a última opción):**
1. **Frontend (caso esperado, >95 % de los problemas):** redeploy del SHA anterior (`4e42f08e`, main actual) vía `deploy-production.yml` con `commit_sha=4e42f08e...`. Minutos, sin tocar BD. `sql/029` es inocua para el frontend viejo (columna `DEFAULT 0`, sin lectores).
2. **`sql/029` sola (solo si se exige):** `ALTER TABLE public.app_14da0f1941_profiles DROP COLUMN IF EXISTS profile_write_seq;` — aditiva, sin datos propios. NO necesaria para rollback del frontend.
3. **BD completa (ÚLTIMO recurso, requiere GO explícito y aviso de pérdida de datos):** restore del backup físico desde el dashboard de Supabase (overwrite total del proyecto). Sin PITR no hay punto de recuperación intra-diario.

**Recomendaciones previas al release (decisión del propietario, no bloqueantes):**
- **Habilitar PITR** (add-on de pago) en `mwdauubztjxkbrefirbg` antes del deploy: reduce la granularidad de recuperación de ~24 h a minutos. Si se activa, hacerlo ≥24 h antes para que exista historia completa.
- Si no se activa PITR: **aplicar `sql/029` inmediatamente después del backup diario** (después de ~05:01 UTC) minimiza la ventana ciega de un hipotético restore.

**Punto de restauración del día del deploy:** anotar el ID/timestamp del último backup COMPLETED antes de empezar (consultable en Dashboard → Database → Backups o vía API `list_backups`).

---

## Fase 3 — Aplicación y verificación de `sql/029` ANTES del frontend

**Orden obligatorio: migración primero, frontend después.** La guardia degrada a modo legacy si la columna no existe (no rompe el guardado), pero el orden correcto da protección CAS completa desde el primer usuario post-deploy.

**Pasos:**
1. Confirmar último backup COMPLETED (Fase 2).
2. Aplicar a producción (`mwdauubztjxkbrefirbg`) el fuente EXACTO de `sql/029-pb-profile-write-seq.sql` del repo, como migración trackeada (Management API) o desde el SQL editor. Es una sola sentencia DDL aditiva + COMMENT.
3. **Verificación (las 3 queries del propio archivo):**
   - `information_schema.columns` → exactamente 1 fila: `bigint` / `NO` nullable / default `0`.
   - El trigger `pb_profiles_privilege_guard` NO protege la columna (su lista sigue siendo solo columnas de privilegio/estado) y `authenticated` tiene grant UPDATE sobre ella.
   - Smoke CAS (service_role): `UPDATE ... SET profile_write_seq = 0 WHERE profile_write_seq < 0` → 0 filas.
4. **Criterio PASS: 3/3.** Cualquier desviación → rollback de la fase (DROP COLUMN) y NO proseguir.

**Ventana estimada:** <5 min. Sin downtime (DDL aditivo, sin reescritura de tabla — columna con DEFAULT constante en PG11+).

---

## Fase 4 — Merge exclusivo de la PR #68 (solo tras GO explícito)

**Precondiciones (todas):** GO escrito del propietario · Fase 1 PASS (iOS Safari) · Fase 3 verificada en producción.

**Acción:** merge de la PR #68 en GitHub. Al ser `origin/main` (`4e42f08e`) ancestro de `d69fa4a`, es un **fast-forward**: main pasa a ser exactamente `d69fa4a`, el SHA ya verificado por el gate. Si la configuración del repo fuerza un merge commit, el árbol resultante es idéntimo; en ese caso desplegar el SHA del merge commit y, si el equipo lo exige, re-disparar el gate sobre él (~1 min).

**Regla de la fase:** merge de la #68 **únicamente**. Ningún otro cambio en main en la misma ventana (el workflow de deploy exige SHA en main ya verificado).

---

## Fase 5 — Cierre de la PR #66 como integrada, sin segundo merge

**Evidencia (verificada):** el head de la #66 (`98c4a32`) es ancestro completo de `d69fa4a` — el merge de la #68 introduce el 100 % de sus commits. No hay nada que fusionar dos veces y ningún riesgo de perder cambios.

**Acción (tras el merge de #68):** comentario en la #66 —"Integrada vía PR #68 (commits contenidos en `d69fa4a`); ver informe rev.3"— y **close as completed**. No rebase, no merge adicional.

---

## Fase 6 — Despliegue y smoke tests

**Deploy:** `workflow_dispatch` de `deploy-production.yml` con `commit_sha = d69fa4a...` (o el SHA del merge commit si aplicó). Ventana recomendada: baja carga (mañana temprano UTC, tras el backup diario). Duración estimada: 5–10 min.

**Verificación inmediata post-deploy (automática/manual):**
- `https://app.pipingbox.com` responde 200; `/version.json` (o equivalente) muestra el SHA desplegado.
- Worker sirviendo la build nueva (asset hash distinto al anterior).

**Smoke tests EN PRODUCCIÓN — ⚠️ requiere autorización explícita para crear 1–2 cuentas sintéticas desechables** (`pb-release-smoke-*@pipingbox-test.example`, creadas vía admin API y borradas al terminar + sus filas de perfil). Sin esa autorización, esta fase se limita a los checks read-only (versión, rutas públicas) y la monitorización de usuarios reales (Fase 7) con umbral de rollback más sensible.

| # | Smoke | Criterio PASS |
|---|---|---|
| 1 | Onboarding finish (cuenta nueva, wizard completo) | Transición canónica; persiste tras reload |
| 2 | Onboarding postpone + reanudación | Omitir persiste; wizard reanuda |
| 3 | CV: subir PDF → reemplazar → recargar → eliminar | Confirmación, persistencia, ZERO DIFF |
| 4 | Certificado: subir PNG/PDF → recargar | Persiste y visible |
| 5 | Sesión: login 2 pestañas → reload en ambas → background >1 min y volver | Sin wipe, sin doble refresh, sin logout inesperado |
| 6 | (`profile_write_seq` activo) | Consulta read-only: seq > 0 en la fila de la cuenta smoke tras escribir el wizard |

**Criterio de salida de fase:** 6/6 PASS + 30 min de monitorización limpia (Fase 7).

---

## Fase 7 — Monitorización posterior y criterios concretos de rollback

**Fuentes:** PostHog (eventos tipificados de la rama), logs de Supabase (PostgREST/Auth/Storage), GitHub Actions (deploy). Correlation IDs ya instrumentados.

**Ventanas:** vigilancia activa las primeras **2 h**; revisión a **24 h** y **72 h**.

| Métrica | Umbral de investigación | Umbral de ROLLBACK |
|---|---|---|
| Pantalla auth-unavailable (`auth_session_resolution_timeout` + `auth_lock_bypass_denied_uncoordinated` + `auth_lock_bypassed` en PostHog) | >2 % de sesiones en 1 h | **>5 % de sesiones en 1 h, o cualquier tendencia sostenida 30 min** |
| Subidas: `document_upload_failed` / (`failed`+`completed`) | >10 % en 1 h | **>20 % en 1 h** |
| PostgREST 5xx (logs API Supabase) | >0,5 % sostenido 15 min | **>1 % sostenido 15 min** |
| `onboarding_save_timeout` | >1 % de intentos de guardado en 1 h | **>3 % en 1 h** |
| `PGRST204` mencionando `profile_write_seq` | Cualquier ocurrencia (frontend en legacy = migración perdida) | 0 esperado; ocurrencias → investigar, no rollback |
| Quejas/incidencias de usuarios (onboarding o subidas) | 1 caso reproducible | **≥2 casos independientes con el mismo síntoma** |

**Procedimiento de rollback (ejecutar en orden):**
1. `deploy-production.yml` con `commit_sha = 4e42f08e...` (main pre-merge) — el frontend vuelve al estado actual conocido.
2. Comentario en Issue #67 con métrica disparadora, ventana temporal y correlation IDs.
3. BD **no se toca** (`sql/029` es inocua para el frontend anterior). DROP COLUMN solo si el propietario lo pide explícitamente.
4. Restore completo de BD: solo con GO explícito, tras evaluar pérdida de datos (sin PITR: hasta ~24 h).

**H1 (timeouts PostgREST):** sigue siendo hipótesis monitorizada. Los eventos de timeout tipificados de esta release la harán visible en producción; si aparecen picos correlacionados con PostgREST 5xx, escalar a investigación de plataforma (statement_timeout / logs del gateway) antes que a rollback.

---

## 8. Evidencias disponibles para la autorización definitiva

1. **Gate TypeScript oficial PASS** en `10f3733` (run 13:11Z) y en `d69fa4a` (run 38417142228).
2. **Matriz de regresión rev.3:** 778 PASS efectivos / 26 FAIL ambientales (desglose verificado uno a uno) / 0 atribuibles; build `25955aa` contra Supabase QA real (`PB-AUTH-LOCK-ONBOARDING-STALL-001-DIAGNOSIS.md` §R3.6).
3. **Integración de la observación 4:** 2/2 contra PostgreSQL QA real con proxy de reordenación — el write obsoleto abortado, entregado tarde, es rechazado por CAS; demostración previa de la vulnerabilidad incluida en el informe (§R3.4).
4. **E2E multi-tab 2/2** incluida pestaña congelada real vía CDP (§R3.3).
5. **Integridad post-reconciliación:** onboarding Finish/Postpone, CV PASS 2× (ZERO DIFF), certificados y PNG (§R3.6).
6. **Estado de producción verificado en solo lectura** (13/10/2026): dependencias de BD presentes salvo `profile_write_seq`; backups diarios COMPLETED; PITR off (§0 de este runbook).
7. **Desvío de QA corregido y verificado:** `REVOKE EXECUTE` de sql/027 restaurado; anon → 401; suite 11/11 (§R3.6).
8. Comentarios públicos: [PR #68 (rev.3)](https://github.com/pipingbox/DASHBOARD-APP/pull/68#issuecomment-6148379457) · [Issue #67 (rev.3)](https://github.com/pipingbox/DASHBOARD-APP/issues/67#issuecomment-6148385497).

**Pendiente para el GO definitivo:** (a) Fase 1 iOS Safari PASS, (b) decisión sobre PITR, (c) autorización para cuentas smoke en producción (o aceptar smoke read-only + monitorización reforzada), (d) confirmación de ventana horaria.

---

## 9. Restricciones vigentes

**NO MERGE / NO DEPLOY / NO MIGRACIÓN EN PRODUCCIÓN** hasta GO explícito del propietario. Este runbook es preparación: no se ha modificado producción ni cuentas reales; todas las verificaciones de este documento son de solo lectura.
