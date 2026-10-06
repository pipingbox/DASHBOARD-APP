/**
 * PB-DOCUMENT-INTAKE-001 — Entrega B: document-email-processor.
 *
 * Procesador asíncrono: descarga adjuntos del proveedor, valida MIME real y
 * tamaño, calcula SHA-256, deduplica, guarda en cuarentena (bucket privado),
 * ejecuta comprobaciones estáticas de seguridad, crea el borrador de
 * extracción y deja el mensaje en EXTRACTION_PENDING (máximo automático).
 * NUNCA promociona a perfil canónico.
 *
 * Acceso: SOLO interno — verify_jwt=false (fuera del repo) + secreto interno
 * X-Internal-Secret con comparación timing-safe. Lo invoca
 * document-email-inbound (waitUntil) u operaciones manuales autorizadas.
 *
 * Secrets: DOCUMENT_INTAKE_INTERNAL_SECRET, RESEND_API_KEY.
 */

import {
  createResendAdapter,
  createServiceClient,
  createSupabaseDbAdapter,
  createSupabaseStorageAdapter,
} from '../_shared/document-intake/adapters.ts';
import { processInboundMessage, verifyInternalSecret } from '../_shared/document-intake/pipeline.ts';
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
  const internalSecret = Deno.env.get('DOCUMENT_INTAKE_INTERNAL_SECRET');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!internalSecret || !resendApiKey) return json(500, { error: 'not_configured' });
  if (!verifyInternalSecret(req.headers.get('X-Internal-Secret'), internalSecret)) {
    return json(401, { error: 'invalid_internal_secret' });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: 'invalid_payload' });
  }
  const messageId = typeof body.message_id === 'string' ? body.message_id : null;
  if (!messageId) return json(400, { error: 'invalid_payload' });

  const supabase = createServiceClient();
  try {
    await processInboundMessage(
      {
        db: createSupabaseDbAdapter(supabase),
        provider: createResendAdapter(resendApiKey),
        storage: createSupabaseStorageAdapter(supabase),
        telemetry: telemetryConfig(),
        now: () => new Date(),
        randomUuid: () => crypto.randomUUID(),
        providerName: 'resend',
      },
      messageId,
    );
  } catch (err) {
    // El error queda acotado al mensaje; detalle solo en logs de plataforma.
    console.error('document-email-processor failed', err instanceof Error ? err.message : 'unknown');
    return json(500, { error: 'processing_failed' });
  }
  return json(200, { status: 'processed' });
});
