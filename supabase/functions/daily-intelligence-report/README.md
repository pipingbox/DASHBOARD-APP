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

## Idempotencia y fail-closed

- `UNIQUE(report_date)` impide dos informes del mismo día.
- Si ya existe `SENT` para el día, la función responde `already_sent` y no
  reenvía.
- Si el correo no sale, el estado nunca es `SENT` (fail-closed).
- Si una fuente cae, el informe es `PARTIAL` y se marca claramente en el correo.

## Secretos (solo por nombre)

| Variable | Requerida | Descripción |
|---|---|---|
| `SUPABASE_URL` | Sí (auto) | URL del proyecto |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí (auto) | Auth de la función + acceso BD |
| `POSTHOG_PERSONAL_API_KEY` | **Sí — la crea el PO** | Personal API Key, alcance `Query: Read`, proyecto 271316 |
| `POSTHOG_PROJECT_ID` | No (default `271316`) | ID del proyecto |
| `POSTHOG_HOST` | No (default `https://eu.i.posthog.com`) | Host EU |
| `DAILY_REPORT_RECIPIENT` | No (default `support@pipingbox.com`) | Destinatario |
| `SMTP_HOST/PORT/SECURE/USER/PASSWORD/FROM` | Sí (ya existen) | Provider SMTP one.com |

## Despliegue

```bash
supabase functions deploy daily-intelligence-report --no-verify-jwt
```

`verify_jwt = false` porque el caller es pg_cron (sin JWT de usuario); la
autenticación es el `Authorization: Bearer <SERVICE_ROLE_KEY>` comprobado en el
handler.

## Programación (pg_cron) — ACCIÓN MANUAL DEL PO

Ver la sección "Acciones manuales del PO" del ticket PB-PDI-004. Requiere:
1. Instalar extensiones `pg_cron` y `pg_net`.
2. Aplicar `sql/012-daily-intelligence-runs.sql`.
3. Crear el job `cron.schedule` (disparo `05 01 * * *` UTC = 02:05/03:05
   Brussels; la función calcula la ventana Brussels correcta en cualquier época
   del año, por lo que el cambio CET/CEST no requiere tocar el cron).

```sql
select cron.schedule(
  'daily-intelligence-report',
  '05 01 * * *',
  $$select net.http_post(
    url := 'https://mwdauubztjxkbrefirbg.supabase.co/functions/v1/daily-intelligence-report',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )$$
);
```

## Envío de prueba (marcado [TEST])

Solo tras configurar secretos y con autorización del PO:

```bash
curl -X POST \
  https://mwdauubztjxkbrefirbg.supabase.co/functions/v1/daily-intelligence-report \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

## Respuesta

```json
{ "ok": true, "status": "SENT", "report_date": "2026-09-11",
  "sources": { "posthog": true, "supabase": true, "stripe": true, "email": true },
  "test": false }
```
