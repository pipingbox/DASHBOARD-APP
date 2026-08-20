# cert-expiry-alerts

Edge Function that sends email alerts to workers whose certifications are expiring soon.

## Purpose

Closes the retention loop: Academy → Profile → Marketplace. Workers with expiring certs are less attractive to recruiters. This function proactively reminds them to renew, keeping the marketplace fresh.

**Ticket:** AUTO-002

## How it works

1. Queries `worker_certifications` where `expiry_date` is within the next 30 days (configurable via `ALERT_WINDOW_DAYS`).
2. Groups expiring certs by `user_id`.
3. Fetches profile names from `profiles` and emails from `auth.users` (admin API).
4. Sends a branded HTML email to each affected worker via Resend.
5. Logs a summary: how many emails sent, skipped, total certs expiring.

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SUPABASE_URL` | Yes | — | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | — | Service role key (bypasses RLS) |
| `RESEND_API_KEY` | No | — | If absent, logs to console only (dev mode) |
| `ALERT_FROM_EMAIL` | No | `noreply@pipingbox.com` | Sender address |
| `ALERT_WINDOW_DAYS` | No | `30` | Days until expiry to trigger alert |

## Deployment

```bash
supabase functions deploy cert-expiry-alerts --no-verify-jwt
```

## Schedule (cron)

Run daily at 08:00 UTC via `pg_cron`:

```sql
select cron.schedule(
  'cert-expiry-alerts-daily',
  '0 8 * * *',
  $$select net.http_post(
    url := 'https://<project-ref>.functions.supabase.co/cert-expiry-alerts',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object()
  )$$
);
```

## Manual trigger

```bash
curl -X POST \
  https://<project-ref>.functions.supabase.co/cert-expiry-alerts \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Response

```json
{
  "sent": 3,
  "skipped": 0,
  "total_certs": 5,
  "total_users": 3,
  "window_days": 30
}
```

## Dependencies

- `worker_certifications` table with `expiry_date` column
- `profiles` table with `full_name` column
- Resend account (for email delivery) — optional in dev

## Future improvements

- Idempotency table to avoid duplicate emails within the same window
- Multi-language emails based on worker's `preferred_language`
- WhatsApp/SMS alerts via Twilio for high-urgency certs (VCA, CompEx)
- Dashboard analytics: cert expiry rates per country/trade
