# PB-DOCUMENT-INTAKE-001 — Entrega B: funciones del canal documental por correo

Estado: PREPARADAS. **NO desplegadas** (STOP del GO del PO hasta un segundo GO
explícito). El despliegue es MANUAL (fuera de CI), como el resto de funciones
del proyecto.

## Funciones

| Función | verify_jwt | Acceso |
|---|---|---|
| `document-email-reference` | `true` (defecto) | JWT de usuario; rate limit por usuario |
| `document-email-inbound` | **`false`** | Público SOLO para el proveedor; firma svix obligatoria (timing-safe, ventana 5 min) |
| `document-email-processor` | **`false`** | Solo interno: cabecera `X-Internal-Secret` (timing-safe) |
| `document-email-admin` | `true` (defecto) | JWT + rol `admin` en `app_14da0f1941_profiles` |

`verify_jwt` se configura FUERA del repo (Management API / dashboard), mismo
patrón que `stripe-webhook`.

## Secrets (Supabase → Edge Functions → Secrets)

| Secret | Uso |
|---|---|
| `DOCUMENT_INTAKE_WEBHOOK_SECRET` | Secreto de firma del webhook de Resend (`whsec_…`) — inbound |
| `DOCUMENT_INTAKE_INTERNAL_SECRET` | Secreto interno inbound → processor (aleatorio >= 32 bytes) |
| `RESEND_API_KEY` | API de Resend para descargar adjuntos — processor |
| `DOCUMENT_INTAKE_ADDRESS` | Opcional; defecto `documentos@documents.pipingbox.com` |
| `POSTHOG_KEY` / `POSTHOG_HOST` | Opcional; telemetría fail-open (sin ellos = no-op) |
| `DOCUMENT_INTAKE_ENV` | Opcional; `preview`/`production` para telemetría |

## Orden de activación (tras segundo GO del PO)

1. Aplicar `sql/021-pb-document-email-intake.sql` (SQL Editor) y verificar
   (runbook `scripts/verify-sql-state.md`): 4 tablas, RLS, bucket privado.
2. Configurar los secrets anteriores.
3. `supabase functions deploy document-email-reference document-email-inbound document-email-processor document-email-admin`
4. Poner `verify_jwt=false` en `document-email-inbound` y `document-email-processor` (Management API).
5. Resend: activar receiving en el dominio, crear webhook `email.received` →
   `https://mwdauubztjxkbrefirbg.supabase.co/functions/v1/document-email-inbound`,
   copiar el `whsec_…` a `DOCUMENT_INTAKE_WEBHOOK_SECRET`.
6. DNS (acción manual del PO): MX del subdominio `documents.pipingbox.com`
   (valor exacto generado por el dashboard de Resend). **Nunca tocar los MX de
   `pipingbox.com`** (one.com sigue intacto).
7. Smoke sintético firmado (tests/document-email-intake.spec.ts) contra la
   función desplegada.

## Rollback

`supabase functions delete` de las 4 funciones + rollback SQL comentado en la
migración 021. No hay dependencias desde código productivo existente.
