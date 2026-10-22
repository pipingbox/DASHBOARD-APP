# PB-NOTIFICATIONS-RPC-RELATION-HARDENING-001 — Runbook de despliegue controlado

**SHA candidato:** `eb8aa8d86bfbe3411407a743f17fb7e272442d3e` (revisión 5)
**PR:** https://github.com/pipingbox/DASHBOARD-APP/pull/63
**Estado:** PREPARACIÓN. **NO MERGE / NO DEPLOY / NO MIGRACIÓN EN PRODUCCIÓN hasta GO explícito del propietario.**

**Artefactos del release:**
- Migraciones: `sql/031` (relaciones Jobs/Community), `sql/032` (referrals INSERT service-only + RPC referrals derivada + idempotencia), `sql/032a` (reconciliación idempotente de la RPC referrals), `sql/033` (UPDATE referrals service-only + RPC verificación), `sql/033a` (reconciliación idempotente de la RPC verificación).
- Edge Functions: `referrals-apply`, `referrals-bootstrap` (devuelven `referral_id`).
- Frontend: `notifications.ts` (telemetría fail-open), `referrals.ts` (emisores con referral.id + getReferralStats canónico), `premium.ts` (recompensas solo verified/completed), `useAuth.tsx`, `InviteToJobModal.tsx`, `CommunityChannel.tsx`, `CommunityPost.tsx`.

**Entornos:**
- Producción Supabase: `mwdauubztjxkbrefirbg` (eu-west-1).
- QA Supabase: `uqfbilyfpflrlthnyijj`.
- Frontend producción: Cloudflare Workers (`app.pipingbox.com` → `pipingbox.com`), deploy solo vía `deploy-production.yml` (`workflow_dispatch`, SHA en main, environment `production`).

---

## Fase 0 — Preflight y backup (SOLO LECTURA en producción)

1. **Confirmar SHA y CI:** `gh pr checks 63` → TypeScript Regression Gate PASS sobre `eb8aa8d`.
2. **Backup / punto de restauración:**
   - Producción usa backups **WAL-G diarios** (8 retenidos, COMPLETED); **PITR desactivado** (granularidad de recuperación ~24 h).
   - Confirmar que el último backup diario está COMPLETED antes de empezar.
   - Recomendación (decisión del propietario): activar PITR antes del release para granularidad de minutos.
3. **Preflight read-only en producción:**
   - Confirmar que NO existen las migraciones 031/032/032a/033/033a en `supabase_migrations.schema_migrations`.
   - Confirmar ausencia de filas duplicadas por las claves compuestas de notificaciones (`job_invitation/like/comment/REFERRAL_JOINED/REFERRAL_VERIFIED` con actor y related_entity presentes) — la auditoría ya lo verificó en read-only; **repetir justo antes del deploy**.
   - Registrar hashes de funciones actuales en producción (baseline): `md5(pg_get_functiondef(oid))` de `pb_create_client_notification` y (si existe) `pb_verify_referral_if_eligible`.
   - Registrar policies actuales de `app_14da0f1941_referrals` en producción (baseline para rollback).

**Gate 0 → 1:** backup COMPLETED + preflight sin duplicados + baseline registrado.

---

## Fase 1 — Aplicación secuencial de SQL (producción)

Aplicar en este orden exacto, cada una como migración trackeada y verificada antes de la siguiente:

| Orden | Migración | Efecto | Verificación tras aplicar |
|---|---|---|---|
| 1 | `sql/031` | índice único Jobs/Community + RPC `pb_create_client_notification` base | RPC presente SECURITY DEFINER; anon EXECUTE=false |
| 2 | `sql/032` | policy INSERT referrals service-only | `allow_insert_referrals_service` presente; INSERT autenticado → 403 |
| 3 | `sql/032a` | reconciliación idempotente RPC referrals (CREATE OR REPLACE) | RPC con rama referrals; hash registrado |
| 4 | `sql/033` | DROP policy UPDATE referrals + REVOKE UPDATE + RPC `pb_verify_referral_if_eligible` | UPDATE autenticado denegado; RPC presente |
| 5 | `sql/033a` | reconciliación idempotente RPC verificación | RPC con `cardinality(skills)`; grants anon=false/auth=true |

**Regla de bloqueo:** si cualquier verificación falla, **detener** y ejecutar rollback de la fase (§Fase 6). No continuar con el frontend.

**Gate 1 → 2:** las 5 migraciones aplicadas y verificadas; RPCs y RLS en estado endurecido.

---

## Fase 2 — Despliegue de Edge Functions

Desplegar `referrals-apply` y `referrals-bootstrap` (devuelven `referral_id`).

**Verificación:** invocar cada función con una cuenta sintética y confirmar que la respuesta incluye `referral_id` (y que el INSERT de referrals sigue funcionando vía service_role).

**Gate 2 → 3:** ambas funciones devuelven `referral_id`.

---

## Fase 3 — Merge de PR #63 y despliegue del frontend

1. Merge exclusivo de PR #63 (tras GO explícito).
2. Deploy del frontend vía `deploy-production.yml` con el SHA resultante en `main`.

**Compatibilidad parcial (segura):** el orden SQL→Edge→frontend garantiza que el frontend nuevo nunca se despliegue contra un backend sin endurecer. Si el frontend viejo sigue activo tras las migraciones, degrada sin corrupción (las notificaciones referrals sin `referral_id` simplemente no se emiten; Jobs/Community siguen validándose server-side).

**Gate 3 → 4:** versión pública = SHA candidato en `https://app.pipingbox.com/version.json`.

---

## Fase 4 — Smoke tests con cuentas sintéticas (producción)

Con cuentas 100% sintéticas desechables (borradas al final):

1. **Jobs:** empresa invita a candidato → notificación `job_invitation` creada con título/URL derivados; candidato forjado/tercero → denegado.
2. **Community:** like/comentario legítimo → notificación; fuente inexistente/ajena → denegado.
3. **Referrals:** atribución legítima → `REFERRAL_JOINED` con contenido derivado; RPC `pb_verify_referral_if_eligible` con usuario elegible → `pending→verified` + `REFERRAL_VERIFIED`; verificación prematura → `not_eligible` sin escritura; UPDATE directo → 403.
4. **Recompensas:** `getReferralStats`/`checkPremiumStatus` solo cuentan verified/completed (3 pending no desbloquean; 3 verified sí).
5. **Regresión:** login, onboarding (completar/omitir), subida CV/certificados (TUS), aislamiento RLS.

**Gate 4 → 5:** smoke PASS; cuentas y storage limpiados.

---

## Fase 5 — Monitorización y criterios de rollback

**Ventanas:** vigilancia activa 2 h, revisión 24 h y 72 h (desde el dashboard de Supabase; la API de logs puede devolver 502 de plataforma).

**Señales a vigilar:** errores `app_error` con `error_name` `notification_rpc_error`/`notification_rpc_exception`, RPC 4xx/5xx de `pb_create_client_notification` y `pb_verify_referral_if_eligible`, INSERT/UPDATE rechazados en `referrals`, quejas de usuarios por notificaciones ausentes.

**Criterios de rollback (cualquiera):**
- >5 % de llamadas RPC de notificación en error en 1 h.
- Notificaciones Jobs/Community legítimas que dejan de emitirse (regresión funcional confirmada).
- Verificación de referidos legítima bloqueada (`not_eligible` para usuarios claramente elegibles) en >1 % de casos.
- ≥2 incidencias de usuario con el mismo síntoma.

## Fase 6 — Rollback (jerárquico, frontend primero)

1. **Frontend:** redeploy del SHA anterior (`eff26f8`) vía `deploy-production.yml`. El backend endurecido es compatible con el frontend viejo (degrada sin corrupción). Minutos, sin tocar BD.
2. **Edge Functions:** redeploy de la versión anterior si el fallo es de `referral_id`.
3. **SQL (último recurso, solo si el backend endurecido rompe el frontend viejo):**
   - Revertir `sql/033`/`033a`: restaurar policy `allow_update_own_referrals` (si se requiere) — NO recomendado salvo bloqueo.
   - Revertir `sql/032`/`032a`: restaurar `allow_insert_referrals WITH CHECK(true)` — NO recomendado salvo bloqueo.
   - Los índices únicos (`pb_client_notification_source_once`, `pb_client_notification_referral_once`) son inocuos: conservarlos.
   - **Restauración completa de BD solo como último recurso** (sin PITR: pérdida hasta ~24 h).

**La BD es la última capa a tocar**: el frontend viejo funciona contra el backend endurecido, por lo que el rollback del frontend resuelve la mayoría de los escenarios sin revertir migraciones.

---

## Verificación final

- [ ] Versión pública = SHA candidato.
- [ ] RPCs endurecidas presentes con grants correctos (anon=false, authenticated=true).
- [ ] RLS referrals: INSERT y UPDATE service-only; SELECT propio intacto.
- [ ] Smoke 4 áreas PASS con cuentas sintéticas limpiadas.
- [ ] Monitorización 2h/24h/72h sin superar umbrales.
- [ ] Preflight de duplicados re-verificado.

**Excepción documentada:** Safari iOS **BLOCKED** (no PASS) — sin dispositivo real en el entorno del agente; excepción aceptada expresamente por el propietario en el release `eff26f8`. Se mantiene el mismo riesgo para este release.

---

## Registro de ejecución del release (14/10/2025 — GO explícito del propietario)

**Resultado: RELEASE COMPLETADO — main `7695f438633042f92fac843ba4b11e9b0fb21898` en producción.**

### Fase 0 — Preflight (read-only)
- Historial: última migración `pb_profile_write_seq_cas_001` (029); 031/032/033 ausentes.
- RPC vieja `pb_create_client_notification` (md5 `a219cee3…`), policies `allow_insert_referrals` (WITH CHECK true) y `allow_update_own_referrals` activas; `pb_verify_referral_if_eligible` ausente.
- Duplicados que bloquearían los índices únicos: **0 filas**.
- Backups WAL-G diarios COMPLETED (8 retenidos); PITR desactivado (granularidad ~24 h) — documentado.

### Fase 1 — Migraciones SQL (todas registradas y verificadas)
| Migración | Versión | Gate |
|---|---|---|
| 031 notifications-rpc-relation-hardening | 20261014055158 | RPC SECURITY DEFINER, anon EXECUTE=false, authenticated=true; índice `pb_client_notification_source_once` creado |
| 032 notifications-referral-hardening | 20261014055329 | `allow_insert_referrals` eliminada → `allow_insert_referrals_service` (service_role); índice `pb_client_notification_referral_once` creado |
| 032a reconcile | 20261014055722 | Re-aseguro idempotente; paridad semántica con QA verificada (normalización de comentarios/espacios → IDENTICAL; md5 difiere solo por formato, QA aplicó minificado) |
| 033 referral-verification-rpc | 20261014055811 | `allow_update_own_referrals` eliminada; UPDATE revocado de authenticated/anon (auth_update=false, service_update=true, auth_select intacto, paridad exacta QA); RPC `pb_verify_referral_if_eligible` SECURITY DEFINER con grants correctos |
| 033a reconcile | 20261014060148 | Re-aseguro idempotente; paridad semántica RPC verificación con QA → IDENTICAL |

### Fase 2 — Edge Functions (con incidente resuelto)
- **Incidente (resuelto en 8 min):** el primer despliegue v6 vía Management API devolvió el cuerpo sin los 4 primeros caracteres (`import` → `rt`) y ambas funciones quedaron en BOOT_ERROR (503). Detectado con sonda viva antes del merge; re-desplegado por la ruta multipart (v7) y verificado en vivo. Ventana de degradación: solo endpoints de referidos (registro/login/onboarding no afectados). Causa: manipulación del cuerpo por la ruta de actualización usada; mitigación: sonda de arranque obligatoria tras cada despliegue de función.
- `referrals-apply` v7 ACTIVE (ezbr `ab73ce33…`), `referrals-bootstrap` v7 ACTIVE (ezbr `e537acd6…`), verify_jwt=true.
- Sonda viva con cuenta sintética efímera: apply `{}` → 403 propio; bootstrap `{}` → 200 con `referral_id` en la respuesta; limpieza 0 filas residuales.

### Fase 3 — Merge exclusivo
- PR #63 marcada ready y fusionada con merge commit `7695f438633042f92fac843ba4b11e9b0fb21898` (gate `typecheck-regression` SUCCESS previo). Sin otras PR en el merge.

### Fase 4 — Deploy producción
- Workflow "Deploy Cloudflare Workers Production" run **38521323003** con `commit_sha=7695f43…` → **SUCCESS** (2m55s).
- Gates integrados: deploy OK, Production RLS security contract OK, Production Auth E2E 7/7 OK, public-route contract OK.
- Versión pública verificada: `/version.json` = `7695f438633042f92fac843ba4b11e9b0fb21898`.

### Fase 5 — Smoke post-deploy (24/24 PASS, cuentas sintéticas, producción)
Flujo real: A crea código → B se registra con código → atribución `confirmed` + `referral_id` → fila `pending`.
- JOINED con contenido falsificado → título/URL derivados en servidor ("Nuevo referido", `/dashboard`) — forja ignorada.
- Replay JOINED → mismo id (idempotente); VERIFIED en pending → rechazado ("no authorized source").
- UPDATE directo PostgREST de `status`/`verified_at` → denegado, fila sigue `pending`; INSERT directo → 42501 RLS.
- `like` con fuente inexistente → rechazado.
- B completa perfil mínimo → `pb_verify_referral_if_eligible` → ok, `verified_at` del servidor, transición pending→verified; segunda llamada `already_verified` (sin re-escritura).
- VERIFIED tras verificación → notificación "Referido verificado"; replay idempotente.
- Aislamiento RLS: tercero lee 0 referidos y 0 notificaciones ajenas. Persistencia: A lee exactamente 2 notificaciones (sin duplicados).
- Limpieza: 3 auth users, perfiles, referidos y notificaciones eliminados; verificación 0 filas residuales y 404 en auth admin (una cuenta requirió segundo intento por FK de notificaciones — resuelto).

### Fase 6 — Monitorización inicial
- Sondas: auth-health 200 (0,48 s), PostgREST tabla 200 (0,48 s), Storage 200 (0,15 s), app 200 (0,14 s), gateway EF 401 esperado sin JWT.
- API de logs de Supabase: error de plataforma intermitente (igual que en el release anterior) — usar dashboard para las revisiones 2h/24h/72h.
- Ventanas 2h/24h/72h: pendientes de revisión en dashboard por el propietario según umbrales de este runbook (errores auth, fallos de subida, timeouts PostgREST, BOOT_ERROR de funciones).

### Rollback
No ejecutado. Jerarquía vigente: (1) re-despliegue del frontend al SHA anterior `eff26f8` vía workflow_dispatch; (2) reversión SQL solo como último recurso (rollback registrado en cada migración). sql/029 (`profile_write_seq`) intacta.

**Excepción mantenida:** Safari iOS BLOCKED (sin dispositivo real); aceptada expresamente por el propietario en el release `eff26f8`.
