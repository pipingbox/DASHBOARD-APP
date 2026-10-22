// Edge Function: job-application-profile-pending-email
// PB-JOBS-MARKETPLACE-READY-ACTIVATION-001 — EMAIL 1.
//
// "Candidatura recibida — completa tu perfil para activarla."
//
// La invoca el frontend inmediatamente después de crear una candidatura con
// perfil no Marketplace Ready. La decisión de enviar NO se toma aquí por
// datos del cliente: se relee la candidatura y el perfil desde fuentes
// backend canónicas (el estado 'pending_profile_validation' lo fijó el
// trigger BEFORE INSERT de sql/034 leyendo profiles.marketplace_ready).
//
// Idempotencia: claim con PK = application_id
// (app_14da0f1941_claim_application_profile_pending_email, patrón sql/030e).
// Reintentos, doble submit o webhooks repetidos no generan un segundo email.
//
// Fail-open para el flujo de candidatura: un fallo de este email NO debe
// bloquear la UX (la candidatura ya está guardada); se devuelve 200 con
// el resultado para que el frontend decida qué mostrar.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createServiceClient,
  sendApplicationPendingProfileEmail,
} from "../_shared/application-activation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    // ── Autenticación: solo el propietario de la candidatura. ──────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    if (!supabaseUrl || !anonKey) return json({ error: "missing_env" }, 500);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    const caller = userData?.user;
    if (userError || !caller) return json({ error: "unauthorized" }, 401);

    let body: { application_id?: string } = {};
    try {
      body = await req.json();
    } catch {
      // Sin body: 400 abajo.
    }
    const applicationId = body.application_id;
    if (!applicationId) return json({ error: "missing_application_id" }, 400);

    const admin = createServiceClient();
    const result = await sendApplicationPendingProfileEmail(
      { supabase: admin },
      { applicationId, userId: caller.id },
    );

    // Correlation ID para trazabilidad (sin PII).
    const correlationId = crypto.randomUUID();
    if (result.kind === "failed") {
      console.error(
        `[job-application-profile-pending-email] corr=${correlationId} application=${applicationId} reason=${result.reason}`,
      );
    } else {
      console.log(
        `[job-application-profile-pending-email] corr=${correlationId} application=${applicationId} outcome=${result.kind}` +
          (result.kind === "sent" ? ` lang=${result.lang}(${result.langSource})` : ` reason=${result.reason}`),
      );
    }

    return json({ result: result.kind, reason: "reason" in result ? result.reason : undefined, correlation_id: correlationId });
  } catch (err) {
    console.error("[job-application-profile-pending-email] unexpected_error", err instanceof Error ? err.message : String(err));
    return json({ error: "unexpected_error" }, 500);
  }
});
