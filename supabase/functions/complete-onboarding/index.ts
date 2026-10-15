// Edge Function: complete-onboarding
// Purpose: Mark onboarding as completed and update backend-controlled fields.
// PB-MATCHING-NOTIFICATIONS-001
//
// Replaces direct frontend updates of marketplace_ready, onboarding_status and
// profile_completion (protected columns).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createServiceClient,
  drainMarketplaceReadyActivations,
} from "../_shared/application-activation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (userError || !user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let body: { marketplace_ready?: boolean } = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    // ignore
  }

  const { data, error } = await supabase.rpc("pb_complete_onboarding", {
    p_user_id: user.id,
    p_marketplace_ready: body.marketplace_ready === true,
  });

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // PB-JOBS-MARKETPLACE-READY-ACTIVATION-001: si pb_complete_onboarding provocó
  // una transición marketplace_ready false -> true, el trigger de sql/034 ya
  // activó las candidaturas pendientes y encoló el email en el outbox. Aquí se
  // drena (máx. un email por transición, idempotente vía claim). Fail-open:
  // un fallo del email NO debe fallar el onboarding.
  try {
    const drainResults = await drainMarketplaceReadyActivations(
      { supabase: createServiceClient() },
      { userId: user.id, limit: 5 },
    );
    if (drainResults.length > 0) {
      console.log(
        `[complete-onboarding] marketplace-ready drain: user=${user.id} processed=${drainResults.length}`,
      );
    }
  } catch (drainErr) {
    console.error(
      "[complete-onboarding] marketplace-ready drain failed (fail-open):",
      drainErr instanceof Error ? drainErr.message : String(drainErr),
    );
  }

  // The RPC returns the resulting canonical trio so callers (wizard, E2E) can
  // verify the final state without a second round-trip.
  return new Response(
    JSON.stringify({ completed: true, profile: data }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
