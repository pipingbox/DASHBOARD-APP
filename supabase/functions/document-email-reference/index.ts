/**
 * PB-DOCUMENT-INTAKE-001 — Entrega B: document-email-reference.
 *
 * Crea una referencia temporal segura para el envío documental por correo.
 * Autenticación: JWT de usuario (verify_jwt=true por defecto + validación
 * manual con auth.getUser). El usuario se obtiene EXCLUSIVAMENTE del JWT —
 * nunca se acepta un user_id del cliente. Rate limit por usuario.
 *
 * Deploy (MANUAL, fuera de CI — ver README.md): supabase functions deploy.
 * Secrets: ninguno específico (usa SUPABASE_URL/SERVICE_ROLE auto-inyectados;
 * telemetría opcional POSTHOG_KEY/POSTHOG_HOST).
 */

import { createServiceClient, createSupabaseDbAdapter } from '../_shared/document-intake/adapters.ts';
import { createReference } from '../_shared/document-intake/pipeline.ts';
import type { TelemetryConfig } from '../_shared/document-intake/telemetry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'missing_authorization' });

  const supabase = createServiceClient();
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (error || !user) return json(401, { error: 'invalid_token' });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: 'invalid_payload' });
  }

  const result = await createReference(
    {
      db: createSupabaseDbAdapter(supabase),
      telemetry: telemetryConfig(),
      now: () => new Date(),
      randomUuid: () => crypto.randomUUID(),
      intakeAddress: Deno.env.get('DOCUMENT_INTAKE_ADDRESS') ?? 'documentos@documents.pipingbox.com',
    },
    { userId: user.id, documentType: String(body.document_type ?? '') },
  );
  return json(result.httpStatus, result.body);
});
