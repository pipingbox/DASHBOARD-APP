# PB-WHATSAPP-FOUNDATION-001 — Entrega: PHONE + OTP + CONSENT FOUNDATION

**Estado: MERGED A MAIN (`6f7f5ba`) + INFRA DESPLEGADA EN PRODUCCIÓN (2026-10-16 ~21:05 UTC) — smoke prod 10/10 PASS — feature OFF, provider vacío, SIN envíos reales. Pendiente: provider real (ticket aparte) y verificación de la 1ª ventana del job (03:17 UTC).**

Rama: `feat/pb-whatsapp-foundation-001` (mergeada, PR #80, merge commit `6f7f5bad762aee9e8104fd7636b2293bf6e00b0d`)
SHA candidato: `ebec9591c152afbc2f7329b71434ced6fdcecd0a` (superseded; candidato final = merge commit)
Proyecto QA: `uqfbilyfpflrlthnyijj` (PipingBox (QA)) — PRODUCCIÓN `mwdauubztjxkbrefirbg`: **infra desplegada 2026-10-16 (ver §12)**.

---

## 1. Arquitectura

```
UI (PhoneVerificationSection, /profile)
   │  SOLO Edge Functions (JWT de usuario); las columnas phone_*/whatsapp_*
   │  son backend-controlled (guard de BD las protege de escrituras directas)
   ▼
phone-send-otp ──────────────┐
phone-verify-otp             │  service_role
phone-update-consent         ▼
phone-withdraw-consent   public.app_14da0f1941_profiles      ← fuente canónica
                         public.app_14da0f1941_phone_verifications (OTP hash)
                         public.app_14da0f1941_phone_events  (audit append-only)
                         public.app_14da0f1941_phone_provider_outbox (mock QA)
                         public.app_14da0f1941_phone_provider_config (1 fila)
                                  ▲
              PhoneVerificationProvider (abstracción)
                · mock (QA): captura en outbox
                · real (Twilio/Vonage/WhatsApp Cloud): entrega futura
```

**Regla fundamental implementada:** `phone_present` (columna GENERATED: `phone_e164 IS NOT NULL`) ≠ `phone_verified` (solo tras OTP válido) ≠ opt-ins WhatsApp (solo tras verificado, por finalidad, revocables).

## 2. Modelo DB (`sql/042-pb-whatsapp-foundation-001.sql`)

**`profiles` (autoridad única, 13 columnas nuevas):** `phone_number_raw`, `phone_country_code`, `phone_e164` (canónico, con `+`, CHECK E.164), `phone_present` (GENERATED), `phone_verified`, `phone_verified_at`, `phone_verification_method`, `whatsapp_service_opt_in`, `whatsapp_job_alerts_opt_in`, `whatsapp_marketing_opt_in`, `whatsapp_consent_at`, `whatsapp_consent_version`, `whatsapp_opted_out_at`. Constraints: consistencia verificación (`verified ⇒ verified_at + e164`), opt-in requiere teléfono presente.

**`phone_verifications`:** challenges OTP — hash bcrypt (nunca en claro), `expires_at` (TTL 10 min), `attempts/max_attempts` (5), `verified_at`. SELECT solo owner; escritura solo service_role.

**`phone_events` (auditoría append-only):** `phone_added`, `phone_changed`, `verification_started`, `verification_failed`, `phone_verified`, `whatsapp_opt_in_changed` + `phone_masked` (`+34******678`) + metadata no sensible. Sin UPDATE/DELETE para nadie.

**`phone_provider_outbox`:** transporte simulado del mock (el código viaja en el "SMS" porque ES el canal). service_role-only; **prohibido en producción**.

**`phone_provider_config`:** selección del provider (1 fila; el secret de entorno tiene prioridad). Semilla `mock` solo en QA.

**Guard:** `pb_profiles_privilege_guard` extendido — en INSERT normaliza las 13 columnas a defaults seguros; en UPDATE las rechaza para no privilegiados. La lógica de Marketplace Ready quedó byte a byte intacta (mismo texto, secciones añadidas). Sin SECURITY DEFINER nuevo.

## 3. OTP — seguridad

- Código de 6 dígitos con **CSPRNG** (`crypto.getRandomValues`); hash **bcrypt sync** (el edge runtime no tiene Web Worker — fix aplicado tras detectarlo en QA).
- TTL 10 min, 5 intentos máx., rate limit 3 envíos/hora/usuario, **cooldown de reenvío 60 s**, reenvío invalida el OTP anterior (expira todos los pendientes).
- El OTP jamás se persiste en claro en `phone_verifications`, jamás en logs, jamás en la respuesta.
- Config por env `PHONE_OTP_TTL_MINUTES` / `PHONE_OTP_MAX_PER_HOUR` / `PHONE_OTP_RESEND_COOLDOWN_SECONDS` (defaults 10/3/60).

## 4. Cambio de número (decisión, ticket §7)

Nuevo `phone_e164` ⇒ `phone_verified=false`, `phone_verified_at=NULL`, método NULL, **todos los opt-ins a false** y `whatsapp_opted_out_at=now()`. Justificación: el consentimiento se otorgó para una identidad alcanzable (persona+número); un número nuevo no hereda consentimiento y exige opt-in explícito tras re-verificar. Reenviar con el MISMO número no invalida nada. Histórico preservado en `phone_events`.

## 5. Auth-only users

`phone-send-otp` hace **upsert** del perfil (`onConflict: user_id`): funciona con `auth.users` sin perfil completo. El guard garantiza que el perfil nace en `AUTH_ONLY`, `marketplace_ready=false`, `profile_completion=0`. QA Caso B lo confirma.

## 6. RLS / permisos (verificado por SQL en QA)

- 4 tablas nuevas con `ENABLE ROW LEVEL SECURITY`.
- `phone_verifications` / `phone_events`: policy SELECT `user_id = auth.uid()`; sin policies de escritura → denied.
- `phone_provider_outbox` / `phone_provider_config`: 0 policies → denied para authenticated/anon.
- Grants explícitos: `REVOKE ALL FROM PUBLIC, anon, authenticated`; `GRANT SELECT` a authenticated donde aplica; `ALL` a service_role. Sin EXECUTE nuevos. Sin SECURITY DEFINER nuevo. Nada en `user_metadata`.
- Casos QA I/J: cross-user denied (SELECT sin filas, PATCH sin efecto), anon denied (401/403), y el propio usuario no puede escribir `phone_verified` ni opt-ins por PostgREST (guard 400).

## 7. Auditoría y analytics

- `phone_events` (QA): los 6 tipos presentes, todos enmascarados (`^\+d{2,3}\*{6}d{3}$`), sin OTP, sin número completo (9 checks PASS).
- PostHog (closed taxonomy en `observability.ts`): `phone_added`, `phone_verification_started`, `phone_verification_completed`, `phone_verification_failed` (`error_category` enum cerrado), `whatsapp_jobs_opt_in`, `whatsapp_marketing_opt_in` (`value` booleano validado), `whatsapp_opt_out`. Tests garantizan que `phone_e164`/`code` se descartan aunque el caller los pase.

## 8. UX / i18n

3 estados (add / pending con CTA "Verify phone" / verified), cooldown visible, 3 toggles separados (Job alerts / Service / Marketing) solo tras verificación, copy "WhatsApp notifications will be available soon.", baja completa con withdraw. 14 claves nuevas × 11 idiomas (fallback inglés); `check-i18n-coverage` y `check-i18n-schema` PASS.

## 9. Compatibilidad Marketplace Ready

No se tocan: `pb_marketplace_missing_requirements`, contrato v2, `marketplace_ready`, `onboarding_status`, Jobs states, EMAIL 1/2. QA Caso K: tras añadir+verificar teléfono, `marketplace_ready`, `onboarding_status`, `profile_completion` y `marketplace_contract_version` quedan idénticos. Teléfono: OPTIONAL/RECOMMENDED, no hard gate.

## 10. Tests

- `supabase/functions/_shared/phone_test.ts`: **16 PASS** (normalización `+`, mask, CSPRNG, display + 5 nuevos de la barrera anti-mock M2) — ejecutados con node strip-types + shim de Deno.
- `tests/phone-whatsapp-foundation.spec.ts` + `tests/observability.spec.ts`: 76 PASS (taxonomía, anti-PII, normalización frontend).
- `tsc --noEmit` PASS; `vite build` PASS (876 archivos, paridad con baseline).
- **E2E QA (`scripts/qa-phone-e2e.mjs`): 87/87 PASS** — casos A–M completos + regresiones N (M1, M2, L1 con concurrencia, L2 con carrera, L3, L4) contra el proyecto QA real. Evidencia: `docs/qa-phone-e2e-results.txt`.

> **Nota "17 vs 11 tests":** en la entrega inicial se citaron "17 unit tests" sumando los 11 de `phone_test.ts` + los 6 tests unitarios del spec Playwright `phone-whatsapp-foundation.spec.ts`. La revisión citó "11" (solo `phone_test.ts`) y contó esos 6 dentro de los 76 Playwright (70 observability + 6 phone). Misma evidencia, dos cortes de clasificación. Tras FIX1 son 16 (`phone_test.ts`) + 76 Playwright.

## 10bis. FIX PACK 1 — correcciones de la revisión (migración `sql/043-pb-whatsapp-foundation-001-fixpack1.sql`)

| Hallazgo | Corrección | Evidencia |
|---|---|---|
| **M1** verify repetido (incluido expirado) escribía auditoría ilimitada | Gate `pb_phone_verify_gate` (FOR UPDATE, 15/hora) que **rechaza con 429** al agotar la ventana — no solo cuenta; la ruta de OTP expirado también consume `attempts` | E2E M1-1..3 (429 + 0 eventos nuevos), E3 (attempts=1 tras expirado) |
| **M2** una fila `provider='mock'` bastaba para activar el mock | Triple barrera fail-safe: `provider='mock'` **y** `mock_enabled=true` (columna nueva, default `false`) **y** project ref en allowlist del código (`_shared/phone-mock-guard.ts`, solo QA). En producción el ref nunca coincide ⇒ mock imposible | 5 unit nuevos + E2E M2-1/2 (503 controlado sin `mock_enabled`; mock restaurado en QA) |
| **L1** rate limit/cooldown TOCTOU | Gate `pb_phone_send_gate` con `SELECT ... FOR UPDATE` (tabla `phone_rate_limits`): ventana + cooldown atómicos | E2E L1-1/2 con `Promise.all` concurrente: exactamente 1 éxito por hueco, resto 429 |
| **L2** `verified:true` sin comprobar persistencia | Verify en 2 pasos condicionales: claim del challenge `WHERE verified_at IS NULL` (409 `verification_already_consumed` si otro ganó) y update del perfil `WHERE phone_e164 = <del challenge>` (409 `verification_superseded` si un cambio de número ganó la carrera; upsert solo si el perfil no existe) | E2E L2-1..3 (carrera simulada: 409 y número NO verificado) |
| **L3** re-opt-in borraba `whatsapp_opted_out_at` | Se conserva la fecha de la última retirada al reactivar. Semántica documentada: `opted_out_at` es histórico (última revocación efectiva); el estado actual lo dan siempre los 3 flags | E2E L3-1/2 (timestamp idéntico tras re-opt-in) |
| **L4** sin retención | `phone_ops_config` (service_role-only) + RPC `pb_phone_purge_retention()`: challenges 30 días (ciclo real de minutos; trazabilidad razonable sin acumular hashes), capturas QA 7 días (contienen el OTP efímero; solo existen con mock). **Nunca** purga `phone_events` ni consentimiento. **Job periódico activo en QA** (`sql/044`, pg_cron — ver §12); producción pendiente (plan §13) | E2E L4-1..5 (borra antiguos, conserva recientes, auditoría intacta) + job pg_cron verificado (§12) |

Seguridad de FIX1 verificada por SQL en QA: RLS ON en `phone_rate_limits` y `phone_ops_config` (sin policies ni grants para clientes, como `phone_provider_outbox/config`), `EXECUTE` de las 3 RPCs revocado de PUBLIC/anon/authenticated (grant solo a `service_role`), sin `SECURITY DEFINER` nuevo.

## 11. Rollback (ticket §16)

1. **UI:** retirar `PhoneVerificationSection` de `/profile` (o `VITE_PHONE_VERIFICATION_ENABLED` distinto de `true`).
2. **Endpoints:** borrar las 4 Edge Functions (`phone-send-otp`, `phone-verify-otp`, `phone-update-consent`, `phone-withdraw-consent`).
3. **Datos:** **conservar** columnas phone/whatsapp y tablas de eventos/verifications (histórico de consentimiento). No se borra consentimiento de forma destructiva.
4. Marketplace Ready y Jobs no se ven afectados en ningún paso.
5. Rollback de FIX1 si fuera necesario (sin tocar datos): revertir el despliegue de las 3 Edge Functions a la versión previa del bundle; las tablas/RPCs de 043 son aditivas e inertes sin las funciones nuevas.
6. Job de retención: `SELECT cron.unschedule('pb-phone-purge-retention');` (no toca datos).
7. Si se quisiera retirar el schema (NO recomendado ni parte del rollback estándar): migración de DROP separada con aprobación explícita del PO.

## 12. Notas de despliegue (QA ya aplicado)

- Migraciones 042 (partes idempotentes) y 043 aplicadas a QA; funciones desplegadas desde bundles (`scripts/bundle-edge-function.mjs`) commitados en `dist/edge-functions/`, por URL raw con SHA inmutable, con `verify_jwt`.
- Provider QA = `mock` con `mock_enabled=true` (fila sembrada en `phone_provider_config`; solo QA, no está en el repo).
- Build frontend requiere `.env.local` con `VITE_SUPABASE_*` dummy para el prerender (patrón ya existente en el worktree main; el archivo está gitignored).
- Hallazgo de QA corregido: `deno.land/x/bcrypt` usa Web Worker → pin `@v0.2.4` + API sync.
- **Job de retención ACTIVO en QA** (`sql/044-pb-whatsapp-foundation-001-retention-cron.sql`, aplicado por Management API): pg_cron habilitado y `pb-phone-purge-retention` programado **diario 03:17 UTC** (`17 3 * * *`), `active=true`, comando `SELECT public.pb_phone_purge_retention();`. Verificado en `cron.job` (jobid 1) y con ejecución manual del comando exacto del job: `{phone_verifications_deleted: 0, phone_provider_outbox_deleted: 0, retention 30d/7d}` (0 borrados esperado: los datos QA son recientes). El job corre como `postgres` (superusuario), por lo que ejecuta la función SECURITY INVOKER pese al REVOKE de PUBLIC. Rollback: `cron.unschedule('pb-phone-purge-retention')`.

## 12a. Despliegue PRODUCCIÓN ejecutado (2026-10-16, GO del PO sobre SHA `6f7f5ba`)

**Preflight revalidado inmediatamente antes de escribir** (solo lectura): guard prod `md5=8e091376…` (versión previa al ticket, sin drift), 0 tablas/columnas/migraciones phone, pg_cron 1.6.4 instalado, sin job `pb-phone-purge-retention`, 21 funciones existentes sin phone-*, secretos sin `PHONE_VERIFICATION_MOCK_ALLOW_REFS` ni `PHONE_VERIFICATION_PROVIDER` (allowlist mock NO ampliable por env; allowlist hardcodeada solo-QA), SHA-256 completos de los 7 artefactos verificados contra `git show 6f7f5ba`.

**Migraciones registradas en `supabase_migrations.schema_migrations` (prod)**: `pb_whatsapp_foundation_001_042_part1_columns`, `…_part2_constraints`, `…_part3_comments`, `…_part4_tables`, `…_part5_guard`, `…_part7_provider_config` (042 en 6 partes, mismo patrón que QA; el contenido agregado es byte-equivalente al archivo `sql/042` salvo comentarios inertes), `043-pb-whatsapp-foundation-001-fixpack1`, `044_pb_whatsapp_foundation_001_retention_cron`. (+3 entradas de evidencia del smoke: creación/comprobación/limpieza del usuario desechable.)

**Edge Functions desplegadas desde URL raw del SHA candidato** (`verify_jwt=true`, todas `ACTIVE`, versión 1; `ezbr_sha256` = hash del bundle servido por la plataforma):

| slug | versión | ezbr_sha256 (16) |
|---|---|---|
| `phone-send-otp` | 1 | `7bf193a9…` |
| `phone-verify-otp` | 1 | `69fc6c7c…` |
| `phone-update-consent` | 1 | `d36bc0dd…` |
| `phone-withdraw-consent` | 1 | `c98557c1…` |

**Job de retención**: `pb-phone-purge-retention` **PROGRAMADO** (jobid 2, `17 3 * * *`, active=true) — **ejecución automática PENDIENTE**: la primera ventana es 2026-10-17 03:17 UTC; verificar entonces en `cron.job_run_details` (status `succeeded`).

**Smoke producción — 10/10 PASS** (usuario desechable `pb-phone-prod-smoke@pipingbox-qa.test`, script `/tmp/phone-prod-smoke.mjs`):
- S1 `phone-send-otp` con anon key → **401** (verify_jwt).
- S2 con JWT usuario → **503 `sms_provider_not_configured`**; cero escrituras (provider comprobado antes del gate y del INSERT; `phone_provider_config` sigue **vacía**). Mock/capture bloqueado: sin fila + allowlist solo-QA + sin env de ampliación.
- S2b aislamiento REST `phone_verifications` → 200 con **0 filas** (sin policies para cliente).
- S3 `phone-verify-otp` sin challenge → **400 `no_pending_verification`** (corrección documentada del preflight: el gate de verify SÍ consume cuota aunque no exista challenge — por diseño M1; la fila de rate limit se eliminó en la limpieza).
- S4 `phone-update-consent` sin teléfono verificado → **400 `phone_required`** (variante válida del gate: exige teléfono y verificación).
- S4b `phone-withdraw-consent` → **200 `{removed:true}`**.
- S6a perfil del smoke: privilegiadas normalizadas (`phone_verified=false`, opt-ins false, `phone_e164=NULL`, `marketplace_ready=false`) — el trigger INSERT normaliza.
- S6b UPDATE `full_name` (permitida) → **200**; S6d revertido → **200**.
- S6c UPDATE `phone_verified=true` → **400 P0001 "Columna protegida: phone_verified."** (guard extendido activo).
- Marketplace: guard prod **byte-idéntico a QA** (comparación `pg_get_functiondef` completa; el md5 difiere del estado previo solo por las secciones phone añadidas); `pb_marketplace_missing_requirements` ejecutada como postgres → `['cv','certificate','availability','consent','completion']` (correcto para el usuario vacío). Nota: la RPC es **service_role-only por diseño preexistente** (paridad QA/prod verificada; un smoke anterior asumió erróneamente que era llamable por el cliente).
- Advisors: sin lints nuevos sobre objetos phone/whatsapp — las 4 tablas sin policies (outbox/provider_config/rate_limits/ops_config) siguen el patrón deny-by-default ya presente en el proyecto (mismo caso que el lint preexistente de `job_application_notifications`); ninguna función phone es SECURITY DEFINER ejecutable por `authenticated` (verificado por SQL).

**Desviaciones respecto al preflight** (todas de expectativas del smoke, no del sistema): (1) `phone-verify-otp` sin challenge consume cuota del gate (M1 by design); (2) `pb_marketplace_missing_requirements` no es llamable por clientes (preexistente, paridad QA); (3) DELETE de profiles por REST denegado por RLS (sin policy DELETE, by design) — la limpieza se hizo por SQL; (4) el contrato de request usa `phone`/`service_opt_in|job_alerts_opt_in|marketing_opt_in` (no `phone_number_raw`/`whatsapp_*`).

**Limpieza**: usuario desechable + perfil + phone_events + rate_limits eliminados (verificado: 0 filas residuales en las 5 tablas; `ops_config` conserva sus 2 semillas). Signup por API no dejó filas reales (respuesta ofuscada anti-enumeración).

## 13. Pendiente tras el despliegue de infra

1. ~~Migraciones 042 + 043 + 044 a producción~~ — **HECHO (§12a)**.
2. NO sembrar `phone_provider_config` en producción — **cumplido** (vacía, verificado).
3. Ticket separado: provider real (WhatsApp Cloud API / Twilio / Vonage) implementando `PhoneVerificationProvider`.
4. Secret `PHONE_VERIFICATION_PROVIDER` cuando la plataforma lo permita.
5. ~~Verificar `cron.job`~~ — HECHO (programado). **Pendiente**: confirmar primera ejecución automática en `cron.job_run_details` tras 2026-10-17 03:17 UTC.
6. Activación del flag `VITE_PHONE_VERIFICATION_ENABLED` en frontend: pendiente del provider real y de GO explícito del PO.
7. Criterios de validación post-deploy: (a) 503 controlado — **verificado (S2)**; (b) advisors sin lints nuevos — **verificado**; (c) auth/Marketplace intactos — **verificado (S6, RPC exec)**; (d) rollback = §11 (vigente).

## 14. GO/NO-GO

**GO para merge a main (desarrollo/QA)** — ejecutado (PR #80, merge `6f7f5ba`). **GO de infra producción ejecutado** (§12a) con NO-GO mantenido para provider real y activación de la feature en frontend, pendientes de ticket aparte. Evidencia completa en secciones 10/10bis/12a y `docs/qa-phone-e2e-results.txt`. Los 6 hallazgos de la revisión (M1, M2, L1–L4) quedan corregidos y verificados en QA con pruebas de regresión específicas.
