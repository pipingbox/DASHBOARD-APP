/**
 * PB-DOCUMENT-INTAKE-001 — Entrega B: document-email-inbound.
 *
 * Webhook PÚBLICO únicamente porque lo invoca el proveedor (Resend).
 * Autenticación: firma criptográfica del proveedor (svix/Standard Webhooks,
 * comparación timing-safe, ventana anti-replay de 5 min). Nada más da acceso.
 *
 * IMPORTANTE (deploy): verify_jwt debe ser FALSE — se configura fuera del
 * repo vía Management API / dashboard (mismo patrón que stripe-webhook).
 * La función es segura sin JWT porque TODA petición sin firma válida se
 * rechaza con 401 antes de tocar la BD.
 *
 * Responde rápido (idempotencia + registro de metadatos sanitizados) y
 * delega el procesamiento pesado en document-email-processor mediante
 * EdgeRuntime.waitUntil — nunca procesa archivos dentro de la petición.
 *
 * Secrets: DOCUMENT_INTAKE_WEBHOOK_SECRET (whsec_... de Resend),
 * DOCUMENT_INTAKE_INTERNAL_SECRET (secreto interno hacia el processor),
 * RESEND_API_KEY no es necesaria aquí (solo en el processor).
 */

import {
  createServiceClient,
  createSupabaseDbAdapter,
} from '../_shared/document-intake/adapters.ts';
import { handleInboundWebhook } from '../_shared/document-intake/pipeline.ts';
import type { TelemetryConfig } from '../_shared/document-intake/telemetry.ts';

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function telemetryConfig(): TelemetryConfig {
  return {
    posthogKey: Deno.env.get('POSTHOG_KEY'),
    posthogHost: Deno.env.get('POSTHOG_HOST'),
    environment: Deno.env.get('DOCUMENT_INTAKE_ENV') ?? 'production',
    appVersion: Deno.env.get('APP_VERSION'),
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const webhookSecret = Deno.env.get('DOCUMENT_INTAKE_WEBHOOK_SECRET');
  const internalSecret = Deno.env.get('DOCUMENT_INTAKE_INTERNAL_SECRET');
  if (!webhookSecret || !internalSecret) return json(500, { error: 'not_configured' });

  const rawBody = await req.text();
  const supabase = createServiceClient();
  const processorUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/document-email-processor`;

  const result = await handleInboundWebhook(
    {
      db: createSupabaseDbAdapter(supabase),
      provider: { listAttachments: () => Promise.resolve([]), download: () => Promise.resolve(new Uint8Array()) }, // no se usa en el webhook
      storage: { putQuarantine: () => Promise.resolve(), createSignedQuarantineUrl: () => Promise.resolve('') }, // idem
      telemetry: telemetryConfig(),
      now: () => new Date(),
      randomUuid: () => crypto.randomUUID(),
      webhookSecret,
      providerName: 'resend',
      intakeAddress: Deno.env.get('DOCUMENT_INTAKE_ADDRESS') ?? 'documentos@documents.pipingbox.com',
      enqueueProcessing: (messageId) => {
        const task = fetch(processorUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': internalSecret },
          body: JSON.stringify({ message_id: messageId }),
        }).catch(() => {
          // fail-open: el mensaje queda en RECEIVED; re-drive manual o replay
          // del proveedor (documentado en el runbook).
        });
        const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
        if (runtime?.waitUntil) runtime.waitUntil(task);
      },
    },
    {
      headers: {
        id: req.headers.get('svix-id'),
        timestamp: req.headers.get('svix-timestamp'),
        signature: req.headers.get('svix-signature'),
      },
      rawBody,
    },
  );
  return json(result.httpStatus, result.body);
});
