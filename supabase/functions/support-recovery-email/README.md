# support-recovery-email

Edge Function interna que envía el correo de recuperación a la cuenta afectada
por los errores de renderizado del 25/09 (PB-PDI-004 /
PB-UI-DOM-INSERTBEFORE-001; fix `e7141b7` ya en producción).

## Finalidad

Un único correo transaccional, con copy exacto aprobado por el PO, invocado
manualmente (sin cron, sin envíos automáticos). No forma parte del flujo de
ningún usuario y no expone superficie pública.

## Autenticación (server-to-server, validada DENTRO de la función)

`verify_jwt = false` (la petición legítima de pg_net no porta JWT). La función
autentica cada petición por sí misma:

| Origen | Credencial | Validación |
|---|---|---|
| pg_net (BD) | Cabecera `X-Recovery-Key` | RPC `app_verify_recovery_invoke_key` (SECURITY DEFINER) compara contra el secreto de Vault `support-recovery-invoke-key` |
| Manual/admin | `Authorization: Bearer <SERVICE_ROLE_KEY>` | Comparación timing-safe (SHA-256 + XOR constante) contra el secreto inyectado |

- Sin credenciales → **401**. Credencial inválida → **401**.
- `anon` y JWTs de usuario (`authenticated`) → **401** (rechazo explícito).
- La clave de Vault se genera DENTRO de la base de datos al aplicar
  `sql/015-support-recovery-email-vault.sql` y nunca se escribe en SQL,
  código, logs ni respuestas.
- Sin CORS: función interna, exclusivamente server-to-server.

## Petición

La petición NO acepta destinatario, asunto, nombre, HTML, texto ni BCC: todo
está definido server-side. Cualquier campo de mensaje en el body → `400`.
Solo se admiten dos flags cerrados:

```jsonc
{ "preflight": true }          // estado de secretos por NOMBRE, sin valores
{ "mode": "TEST" }             // (default) prueba a support@pipingbox.com
{ "mode": "PRODUCTION" }       // bloqueado (ver abajo)
```

## Modos cerrados

- **TEST** (default): To `support@pipingbox.com`, nombre renderizado
  "Edward", asunto con prefijo `[TEST]`. No usa ni requiere el correo real
  del usuario.
- **PRODUCTION**: bloqueado. Exige los secretos `PO_GO=1` y
  `PROD_SHA_VERIFIED=1` (segundo GO explícito del PO) y el destinatario
  resuelto server-side (secreto `RECOVERY_RECIPIENT`, nunca parámetro libre).

## Copia de auditoría (decisión del PO)

- BCC fijo y exacto: `info@pipingbox.com`, en la **misma transacción SMTP**
  (envelope). Nodemailer no emite cabecera `Bcc` en el mensaje visible.
- Guardas: BCC exacto; jamás desde el body; sin CC ni destinatarios
  adicionales; sin BCC en HTML, texto o cabeceras visibles.
- Fail-closed: si el proveedor rechaza algún destinatario o no confirma los
  dos aceptados (To + BCC), el estado es `PARTIAL` con `audit_copy_sent=false`
  y se reporta al PO; nunca se afirma una copia de auditoría no confirmada.

## Secretos (solo por nombre)

| Variable | Requerida | Descripción |
|---|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` | auto | Inyectados por el runtime |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` | Sí | Proveedor one.com (mismos valores que el resto de funciones SMTP) |
| `SMTP_PORT` / `SMTP_SECURE` / `SMTP_FROM` | No | 587 / true / remitente verificado |
| `PO_GO` | No | `1` = segundo GO del PO (modo PRODUCTION) |
| `PROD_SHA_VERIFIED` | No | `1` = SHA productivo verificado |
| `RECOVERY_RECIPIENT` / `RECOVERY_RECIPIENT_NAME` | No | Destinatario real, resuelto server-side, solo para PRODUCTION |

## Despliegue

```bash
node scripts/build-support-recovery-bundle.mjs   # bundle single-file
# después, vía Supabase Management API (create/update con verify_jwt=false)
```

## Invocación de la prueba (pg_net + Vault)

```sql
SELECT net.http_post(
  url := 'https://mwdauubztjxkbrefirbg.supabase.co/functions/v1/support-recovery-email',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'X-Recovery-Key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'support-recovery-invoke-key')
  ),
  body := jsonb_build_object('mode', 'TEST'),
  timeout_milliseconds := 60000
);
```

## Logs

Solo: tipo de plantilla, timestamp, estado del proveedor, message ID
sanitizado y `audit_copy_sent`. Sin tokens, correos, nombres ni contenido del
mensaje. Sin PII en Brain, commits o logs (trazabilidad por `correlation_id`).
