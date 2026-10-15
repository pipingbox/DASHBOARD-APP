// Edge Function: marketplace-ready-activation-email
// PB-JOBS-MARKETPLACE-READY-ACTIVATION-001 — EMAIL 2.
//
// "Perfil validado — tus candidaturas ya pueden revisarse."
//
// Drena el outbox app_14da0f1941_marketplace_ready_activations (una fila por
// transición EFECTIVA marketplace_ready false -> true, creada por el trigger
// de sql/034). Cada fila produce como máximo UN email (claim atómico).
//
// Puntos de drenaje del flujo:
//   1. complete-onboarding (tras pb_complete_onboarding RPC).
//   2. recalculate-profiles (tras actualizar perfiles).
//   3. Esta función: self-service del propio usuario (reintentos) y ops.
//      Un usuario autenticado solo drena SUS filas; un admin puede pasar
//      user_id o drain=all (limitado).
//
// El email NUNCA pasa candidaturas a sent_to_client: la activación de estados
// la hizo el trigger de la BD (pending_profile_validation -> applied).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createServiceClient,
  drainMarketplaceReadyActivations,
  PROFILES_TABLE,
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

    let body: { user_id?: string; limit?: number } = {};
    try {
      body = await req.json();
    } catch {
      // Body opcional.
    }

    const admin = createServiceClient();

    // Autorización: un usuario solo drena su propio outbox. Un admin puede
    // drenar el de otro usuario (ops). El rol se lee de la fuente canónica.
    let targetUserId: string | undefined = caller.id;
    if (body.user_id && body.user_id !== caller.id) {
      const { data: callerProfile } = await admin
        .from(PROFILES_TABLE)
        .select("role")
        .eq("user_id", caller.id)
        .maybeSingle();
      if (callerProfile?.role !== "admin") return json({ error: "forbidden" }, 403);
      targetUserId = body.user_id;
    }

    const results = await drainMarketplaceReadyActivations(
      { supabase: admin },
      { userId: targetUserId, limit: body.limit },
    );

    const summary = {
      processed: results.length,
      sent: results.filter((r) => r.kind === "sent").length,
      skipped: results.filter((r) => r.kind === "skipped").length,
      failed: results.filter((r) => r.kind === "failed").length,
      results: results.map((r) => ({
        activation_id: "activationId" in r ? r.activationId : undefined,
        outcome: r.kind,
        reason: "reason" in r ? r.reason : undefined,
        lang: r.kind === "sent" ? r.lang : undefined,
      })),
    };
    console.log(
      `[marketplace-ready-activation-email] user=${targetUserId} processed=${summary.processed} sent=${summary.sent} skipped=${summary.skipped} failed=${summary.failed}`,
    );

    return json(summary);
  } catch (err) {
    console.error("[marketplace-ready-activation-email] unexpected_error", err instanceof Error ? err.message : String(err));
    return json({ error: "unexpected_error" }, 500);
  }
});
