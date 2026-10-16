# PB-CV-AUTO-PROFILE-001 — Runbook de release (CV → AUTO PROFILE)

**Fecha:** 16/10/2026 (creado tras QA PASS + GO merge del PO, 19:16 UTC)
**Estado: MERGED a main (`e9dd23c`) · QA/preview desplegado · PRODUCCIÓN SIN DESPLEGAR (pendiente de GO explícito).**

> **Hecho clave:** PR #79 merged en `0089d07` (merge commit `e9dd23c`, mensaje
> con GO del PO). Migraciones `sql/041` + `sql/042` y Edge Functions
> `cv-extract` / `cv-apply-draft` YA aplicadas al proyecto Supabase compartido
> `mwdauubztjxkbrefirbg` (verificado 16/10, Management API, tracked). El Worker
> de **producción** (`app.pipingbox.com`) NO tiene la UI nueva; el frontend de
> producción sigue sirviendo la versión anterior hasta el deploy autorizado.

**Artefactos:**
- PR #79 (`feat/pb-cv-auto-profile-001`), head `0089d07`, base main.
- Migraciones: `sql/041-pb-cv-auto-profile.sql` (tablas `app_cv_extraction_drafts`,
  `app_cv_extraction_events`, RLS, trigger guard) + `sql/042-pb-cv-auto-profile-grants.sql`.
- Edge Functions desplegadas: `cv-extract` (v1, bundle de `3a6db20`) y
  `cv-apply-draft` (v5, bundle de `eefeca4`, esbuild → `docs/deploy-candidates/`).
- Preview Worker: `pipingbox-app.pipingbox.workers.dev` sirviendo `eefeca461…` con
  la UI de revisión (`/profile/cv-review`).
- Informe QA completo: comentario del PR #79 (2026-10-16,
  `https://github.com/pipingbox/DASHBOARD-APP/pull/79#issuecomment-6222861285`).

---

## 1. Requisito operativo: `sb_secret_` para el modo SUPPORT

El modo SUPPORT de `cv-extract` (procesar CV recibido por soporte) autentica al
operador comparando el Bearer token con `SUPABASE_SERVICE_ROLE_KEY` del runtime.
En este proyecto **la key vigente es el formato nuevo `sb_secret_…`**, no el JWT
legacy `service_role`:

| Key usada como Bearer | Resultado |
|---|---|
| `sb_secret_…` (actual) | **200** — flujo SUPPORT operativo |
| JWT legacy `eyJ…` service_role | **401 unauthorized** (fail-closed, correcto) |

**Regla del runbook:** si la key de servicio se rota o el proyecto cambia de
formato, verificar con una llamada SUPPORT de smoke tras el despliegue. No usar
NUNCA la key legacy para integraciones nuevas; y la Storage API REST (subida/
listado/borrado de objetos) rechaza `sb_secret_` ("Invalid Compact JWS"): para
operaciones Storage programáticas usar el JWT legacy mientras la plataforma lo
mantenga, o el JWT del propio usuario dueño del objeto (RLS-scoped).

## 2. Migración 042 — alcance sobre tabla EXISTENTE (desviación del alcance inicial)

`sql/042` NO crea tablas: **modifica permisos de una tabla preexistente**:

```sql
GRANT SELECT, INSERT ON public.app_worker_experiences TO service_role;
```

Motivo: hasta este ticket, `app_worker_experiences` solo era escrita por el
propietario vía RLS. `cv-apply-draft` es el primer writer `service_role` de la
tabla; sin el GRANT, PostgREST devolvía 403 → `experience_insert_failed` (500).
Descubierto en QA real, no en specs (el spec RLS usa anon/authenticated).

**Implicación:** cualquier auditoría de permisos debe registrar que desde el
16/10/2026 `service_role` tiene INSERT en `app_worker_experiences`. El permiso
NO elude RLS-relevante (service_role ya es bypassrls por diseño de Supabase);
el cambio solo habilita el path de escritura de la Edge Function.

**Rollback:** `REVOKE INSERT ON public.app_worker_experiences FROM service_role;`
(dejará `cv-apply-draft` con `experience_insert_failed` — solo ejecutar junto a
un rollback completo del feature).

## 3. Limitación de cobertura documentada — SUPPORT con múltiples coincidencias

El caso de uso §1.C (CV a soporte con email que coincide con **más de una**
cuenta auth) NO está cubierto por prueba end-to-end: no es reproducible sin
duplicar emails en el proyecto real. Estado de la cobertura:

| Escenario SUPPORT | Probado E2E | Comportamiento verificado |
|---|---|---|
| Email sin match | Sí | `manual_review`, **cero escrituras** (drafts/events delta = 0) |
| Path fuera del namespace del candidato | Sí | 400 `invalid_request` |
| Match inequívoco | Sí | Extracción completa (lang=en) + email de recuperación |
| **>1 match (ambiguo)** | **No (limitación)** | Path de código idéntico al sin-match: `manual_review` sin escrituras |

**Deuda de cobertura:** cuando exista un entorno de staging con datos
duplicables, añadir fixture con dos cuentas auth del mismo email (o
auto-registro + confirmación admin repetida) y verificar el branch ambiguo.

## 4. QA ejecutado (resumen; detalle en el comentario del PR #79)

- RLS/security spec 4/4 PASS (Playwright contra proyecto real, con datos vivos).
- Fase 1 auth-only 18/18 · Fase 2 perfil confirmado 20/20 (conflicto 409 sin
  escritura parcial, overwrite explícito, low-confidence nunca autoaceptada,
  certs siempre declared/unverified, idempotencia, marketplace_ready no promovido).
- Fase 3 SUPPORT 8/8 · Fase 4 cross-user 6/6.
- Suite Deno 116/116 (local Deno 2.9.7 + CI). CI en `0089d07`: PASS.
- 7 bugs encontrados y corregidos por el QA (grants service_role ×2, defaults
  de columna tratados como confirmados ×2, fechas mes/año → DATE, merge
  acumulativo de skills, ReferenceError latente en spec).

## 5. Limpieza de datos sintéticos de QA (ejecutada, verificada)

Cuentas `cv-qa-001@pipingbox.com` / `cv-qa-002@pipingbox.com` eliminadas el
16/10/2026 con doble condición (id AND email) y reconciliación exacta de
totales globales: auth_users 246→244, profiles 207→206, drafts 7→0, events
23→0, experiences 75→72, certs 50→47, objetos Storage del bucket
`app_14da0f1941_certificates` 176→169 (7 CVs borrados vía JWT del propietario,
RLS-scoped). **0 filas residuales; 0 datos ajenos afectados** (verificado por
delta exacta de contadores globales).

## 6. Pasos pendientes para producción (NO ejecutar sin GO explícito del PO)

1. Confirmar CI verde en main tras el merge (email-i18n + typecheck-regression).
2. `workflow_dispatch` de `deploy-production.yml` con SHA de main aprobado.
3. Smoke post-deploy mínimo: upload CV → draft pending_review → revisar →
   confirmar (con cuenta sintética desechable, y limpieza verificada igual que §5).
4. Monitorizar `cv_extraction_*` events (sin PII) 2h/24h.

**Rollback frontend:** redeploy del SHA anterior vía el mismo workflow.
**Rollback DB:** tablas nuevas → DROP (041 es aditivo); 042 → ver REVOKE en §2.
