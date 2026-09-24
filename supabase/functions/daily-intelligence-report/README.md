# daily-intelligence-report

Edge Function que genera y envía el informe **PipingBox Daily Intelligence** a
`support@pipingbox.com` cada día, analizando el día natural anterior completo en
**Europe/Brussels** (CET/CEST correcto).

**Ticket:** PB-PDI-004

## Qué hace

1. Calcula la ventana `[ayer 00:00, hoy 00:00)` en Europe/Brussels → UTC.
2. Consulta PostHog (HogQL, `environment='production'`), Supabase (perfiles,
   auth) y Stripe (tablas canónicas `app_marketplace_revenue_events`,
   `app_orders`, `app_subscriptions`).
3. Genera 5 recomendaciones deterministas (sin LLM).
4. Renderiza un correo HTML + texto plano con las 9 secciones.
5. Envía vía el provider SMTP compartido (`_shared/email-provider.ts`).
6. Registra la ejecución en `app_daily_intelligence_runs` (idempotencia por
   `report_date`, estados PENDING/GENERATING/SENT/PARTIAL/FAILED).

## Programación y gate horario (Europe/Brussels)

- pg_cron ejecuta el job `daily-intelligence-report` con schedule
  **`5 * * * *`** (tick horario; UTC y Brussels comparten offsets en horas
  exactas).
- La función **solo envía el informe productivo cuando la hora local de
  Bruselas es 00:05** (ventana de tolerancia 00:00–00:59). El resto de ticks
  horarios se saltan sin efecto, sin claim y sin correo. El cálculo es vía
  `Intl` con la zona `Europe/Brussels`, por lo que CET/CEST (incluidos los
  cambios de horario) siempre es correcto sin tocar el cron.
- Además, **todo envío productivo exige el secreto `DAILY_REPORT_ENABLED="true"`**
  (activación explícita del PO tras aprobar el correo de prueba). Hasta que se
  active, cada tick se salta con `production_disabled`.
- El path admin (`Bearer SERVICE_ROLE_KEY`) permite reintentos manuales de un
  día fallido una vez activado el flag (claim idempotente protege duplicados).

## Autenticación (Supabase Vault, sin claves en SQL)

`verify_jwt = false` (el cron no porta JWT). La función autentica cada
petición por sí misma:

| Caller | Credencial | Validación |
|---|---|---|
| pg_cron | Cabecera `X-Cron-Key` | RPC `app_verify_daily_report_cron_key` (SECURITY DEFINER) compara contra el secreto de Vault `daily-intelligence-cron-key` |
| Manual/admin | `Authorization: Bearer <SERVICE_ROLE_KEY>` | Comparación directa en el handler |

El valor de la cron key se genera **dentro de la base de datos**
(`gen_random_bytes`) al aplicar `sql/013-daily-report-cron-vault.sql` y nunca
se escribe en SQL, código, logs ni respuestas; solo viaja DB → función en la
cabecera en tiempo de ejecución.

## Idempotencia y fail-closed

- `UNIQUE(report_date)` impide dos informes del mismo día.
- Si ya existe `SENT` para el día, la función responde `already_sent` y no
  reenvía.
- Si el correo no sale, el estado nunca es `SENT` (fail-closed).
- Si una fuente cae, el informe es `PARTIAL` y se marca claramente en el correo.
- **La prueba `{"test":true}` NO escribe en `app_daily_intelligence_runs`**:
  no consume ni bloquea el `report_date` productivo del día.

## Secretos (solo por nombre)

| Variable | Requerida | Descripción |
|---|---|---|
| `SUPABASE_URL` | Sí (auto) | URL del proyecto |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí (auto) | Auth admin + acceso BD |
| `POSTHOG_PERSONAL_API_KEY` | **Sí — la creó el PO** | Personal API Key, alcance `Query: Read`, proyecto 271316 |
| `SMTP_HOST/PORT/SECURE/USER/PASSWORD/FROM` | Sí (ya existen) | Provider SMTP one.com |
| `POSTHOG_PROJECT_ID` | No (default `271316`) | ID del proyecto |
| `POSTHOG_HOST` | No (default `https://eu.i.posthog.com`) | Host EU |
| `DAILY_REPORT_RECIPIENT` | No (default `support@pipingbox.com`) | Destinatario |
| `DAILY_REPORT_ENABLED` | **Sí para el envío productivo** | `"true"` = activación por el PO |

## Despliegue (Management API, single-body)

`create/update function` solo admite un body de un fichero, así que los
módulos `_shared` se inlinean con esbuild de forma determinista:

```bash
node scripts/build-daily-report-bundle.mjs /tmp/daily-intelligence-report.bundle.ts
# Desplegar el contenido de ese fichero como body de la función
# daily-intelligence-report con verify_jwt=false (composio/Management API).
```

## Invocaciones

```bash
# Preflight (presencia de secretos por NOMBRE, sin valores)
curl -X POST <url> -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -d '{"preflight": true}'

# Prueba marcada [TEST] a support@pipingbox.com (no consume report_date)
curl -X POST <url> -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -d '{"test": true}'
```

## Respuesta (prueba)

```json
{ "ok": true, "status": "SENT_TEST", "report_date": "2026-09-23",
  "test": true, "correlation_id": "…",
  "sources": { "posthog": true, "supabase": true, "stripe": true, "email": true },
  "verification": { "sections": 9, "recommendations": 5, "pii_clean": true, "…" : "…" } }
```

## Activación del envío diario definitivo (ACCIÓN MANUAL DEL PO)

1. Confirmar recepción y contenido del correo `[TEST]`.
2. En Supabase Dashboard → Edge Functions → `daily-intelligence-report` →
   Secrets: añadir `DAILY_REPORT_ENABLED` = `true`.
3. A partir del siguiente tick de las 00:05 Brussels, el informe productivo se
   envía y queda registrado en `app_daily_intelligence_runs` (idempotente).
