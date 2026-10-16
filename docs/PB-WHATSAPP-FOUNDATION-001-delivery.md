# PB-WHATSAPP-FOUNDATION-001 — Entrega: PHONE + OTP + CONSENT FOUNDATION

**Estado: IMPLEMENTADO + QA PASS — NO PROD DEPLOY — NO WHATSAPP REAL**

Rama: `feat/pb-whatsapp-foundation-001`
SHA candidato: `ebec9591c152afbc2f7329b71434ced6fdcecd0a`
Proyecto QA: `uqfbilyfpflrlthnyijj` (PipingBox (QA)) — PRODUCCIÓN `mwdauubztjxkbrefirbg` **sin tocar**.

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

- `supabase/functions/_shared/phone_test.ts`: 11 PASS (normalización `+`, mask, CSPRNG, display) — ejecutados con node strip-types + shim de Deno.
- `tests/phone-whatsapp-foundation.spec.ts` + `tests/observability.spec.ts`: 76 PASS (taxonomía, anti-PII, normalización frontend).
- `tsc --noEmit` PASS; `vite build` PASS (876 archivos, paridad con baseline).
- **E2E QA (`scripts/qa-phone-e2e.mjs`): 69/69 PASS** — casos A–M completos contra el proyecto QA real. Evidencia: `docs/qa-phone-e2e-results.txt`.

## 11. Rollback (ticket §16)

1. **UI:** retirar `PhoneVerificationSection` de `/profile` (o `VITE_PHONE_VERIFICATION_ENABLED` distinto de `true`).
2. **Endpoints:** borrar las 4 Edge Functions (`phone-send-otp`, `phone-verify-otp`, `phone-update-consent`, `phone-withdraw-consent`).
3. **Datos:** **conservar** columnas phone/whatsapp y tablas de eventos/verifications (histórico de consentimiento). No se borra consentimiento de forma destructiva.
4. Marketplace Ready y Jobs no se ven afectados en ningún paso.
5. Si se quisiera retirar el schema (NO recomendado ni parte del rollback estándar): migración de DROP separada con aprobación explícita del PO.

## 12. Notas de despliegue (QA ya aplicado)

- Migración 042 aplicada a QA en partes idempotentes; funciones desplegadas desde bundles (`scripts/bundle-edge-function.mjs`) con `verify_jwt`.
- Provider QA = `mock` (fila sembrada en `phone_provider_config`).
- Build frontend requiere `.env.local` con `VITE_SUPABASE_*` dummy para el prerender (patrón ya existente en el worktree main; el archivo está gitignored).
- Hallazgo de QA corregido: `deno.land/x/bcrypt` usa Web Worker → pin `@v0.2.4` + API sync.

## 13. Para GO producción (pendiente, fuera de este ticket)

1. Merge del PR y migración 042 a producción (`mwdauubztjxkbrefirbg`).
2. NO sembrar `phone_provider_config` en producción (tabla vacía ⇒ provider no configurado ⇒ 503 controlado hasta el ticket del provider real).
3. Ticket separado: provider real (WhatsApp Cloud API / Twilio / Vonage) implementando `PhoneVerificationProvider`.
4. Secret `PHONE_VERIFICATION_PROVIDER` cuando la plataforma lo permita (hoy el fallback DB es el camino auditable).

## 14. GO/NO-GO

**GO para merge a main (desarrollo/QA).** NO-GO para deploy a producción y para conectar WhatsApp real, conforme a la autorización del PO. Evidencia completa en secciones 10 y `docs/qa-phone-e2e-results.txt`.
