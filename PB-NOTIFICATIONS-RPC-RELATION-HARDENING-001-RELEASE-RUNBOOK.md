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
