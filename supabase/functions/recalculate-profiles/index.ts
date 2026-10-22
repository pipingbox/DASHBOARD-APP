import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { drainMarketplaceReadyActivations } from "../_shared/application-activation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Canonical profile state recalculation.
 *
 * PB-MARKETPLACE-READY-CONSISTENCY-001: this function used to carry its own
 * TypeScript copy of the completion formula (12 weights), the consent predicate
 * and the status ladder. That copy was the second implementation of the
 * contract and the source of a real production divergence:
 *
 *   - the RPC `pb_complete_onboarding` required the wizard's explicit consent
 *     (p_marketplace_ready) AND the consent recorded in the profile columns;
 *   - this function derived consent from `profile_visibility` / `cv_visible`
 *     alone, so a global sweep could PROMOTE marketplace_ready to true for a
 *     user whose wizard had never finished. That is exactly what happened on
 *     2026-09-11 and produced the inconsistency investigated in the RCA.
 *
 * The formula now lives once, in SQL (`pb_profile_completion_score`,
 * `pb_marketplace_consent_columns`, `pb_onboarding_status`) and this function
 * delegates to `pb_recalculate_profile_state`, which maintains or degrades
 * marketplace_ready but never promotes it. Promotion stays exclusive to
 * `pb_complete_onboarding`.
 *
 * The 30-point threshold and the 12 weights are unchanged by this ticket.
 */

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json({ error: "missing_env" }, 500);
    }

    // ---------------------------------------------------------------------
    // Authentication.
    //
    // This function runs with the service role key: it can read and write
    // every profile in the database. Previously it accepted anonymous calls,
    // which meant anyone on the internet could trigger a 2000-row rewrite and
    // receive worker names and user ids in the response.
    //
    // Callers must now identify themselves. Admins may recalculate everyone;
    // an ordinary user may only recalculate their own profile.
    // ---------------------------------------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "unauthorized" }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    const caller = userData?.user;
    if (userError || !caller) {
      return json({ error: "unauthorized" }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerProfile } = await supabaseAdmin
      .from("app_14da0f1941_profiles")
      .select("role")
      .eq("user_id", caller.id)
      .maybeSingle();

    const isAdmin = callerProfile?.role === "admin";

    let targetUserId: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        targetUserId = body.user_id || null;
      } catch {
        // No body or invalid JSON.
      }
    }

    if (!isAdmin) {
      // A non-admin asking for someone else's profile, or for a full sweep,
      // is refused rather than silently narrowed: silent narrowing hides bugs
      // in whatever called this.
      if (targetUserId && targetUserId !== caller.id) {
        return json({ error: "forbidden" }, 403);
      }
      targetUserId = caller.id;
    }

    // Single canonical write path: SECURITY INVOKER RPC, EXECUTE granted to
    // service_role only. No formula, no consent predicate and no status ladder
    // live in this file any more.
    const { data, error } = await supabaseAdmin.rpc("pb_recalculate_profile_state", {
      p_user_id: targetUserId,
    });

    if (error) {
      console.error("recalculate-profiles: rpc failed", error.message);
      return json({ error: "recalculation_failed" }, 500);
    }

    const result = Array.isArray(data) ? data[0] : data;
    const processed: number = result?.processed ?? 0;
    const changed: number = result?.changed ?? 0;

    if (processed === 0) {
      return json({ message: "No profiles found to recalculate", updated: 0 });
    }

    // PB-JOBS-MARKETPLACE-READY-ACTIVATION-001: el drenaje del outbox de
    // activaciones se mantiene aunque este camino ya no pueda promover
    // marketplace_ready: puede haber activaciones pendientes encoladas por el
    // wizard. Fail-open: un fallo del email NO debe fallar el recálculo.
    try {
      const drainResults = await drainMarketplaceReadyActivations(
        {
          supabase: createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          }),
        },
        { userId: targetUserId ?? undefined, limit: targetUserId ? 5 : 10 },
      );
      if (drainResults.length > 0) {
        console.log(
          `[recalculate-profiles] marketplace-ready drain: user=${targetUserId ?? "sweep"} processed=${drainResults.length}`,
        );
      }
    } catch (drainErr) {
      console.error(
        "[recalculate-profiles] marketplace-ready drain failed (fail-open):",
        drainErr instanceof Error ? drainErr.message : String(drainErr),
      );
    }

    // The response carries counts only, plus the caller's own result when it
    // applies. `updated` now means "rows actually modified" instead of "rows
    // rewritten", so it can legitimately be lower than total_profiles.
    const callerResult = targetUserId === caller.id && result
      ? {
        profile_completion: result.caller_completion,
        onboarding_status: result.caller_status,
        marketplace_ready: result.caller_marketplace_ready,
      }
      : null;

    return json({
      message: `Recalculation complete. Updated ${changed}/${processed} profiles.`,
      updated: changed,
      total_profiles: processed,
      ...(callerResult ? { profile: callerResult } : {}),
    });
  } catch (err) {
    console.error("recalculate-profiles: unexpected error", err);
    return json({ error: "unexpected_error" }, 500);
  }
});
