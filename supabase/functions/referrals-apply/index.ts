import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// PB-REFERRAL-ALDO-001 — canonical CORS preamble (same pattern as
// secure-file-access): without it the browser preflight (OPTIONS) gets a
// bare 405 and NO browser can call this function cross-origin.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

interface ApplyBody {
  referred_id: string;
  referrer_id: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Missing authorization" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    },
  );

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body: ApplyBody = await req.json().catch(() => ({}));

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const { data: caller } = await adminClient
    .from("app_14da0f1941_profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const isAdmin = caller?.role === "admin";
  const isSelf = user.id === body.referred_id;

  // Allow admin assignment or self-service bootstrap.
  if (!isAdmin && !isSelf) {
    return json({ error: "Forbidden" }, 403);
  }

  const { referred_id, referrer_id } = body;

  if (!referred_id || !referrer_id || referred_id === referrer_id) {
    return json({ error: "Invalid referral pair" }, 400);
  }

  // Never overwrite a previous attribution on the self-service path.
  // (Admin corrections keep the ability to reassign explicitly.)
  const { data: referredProfile, error: referredReadErr } = await adminClient
    .from("app_14da0f1941_profiles")
    .select("referred_by_user_id")
    .eq("user_id", referred_id)
    .maybeSingle();

  if (referredReadErr) {
    return json({ error: "referred_read_failed" }, 500);
  }

  const previousAttribution = (referredProfile?.referred_by_user_id as string | null) ?? null;

  if (previousAttribution === referrer_id) {
    return json({ success: true, already_assigned: true, attribution: "existing_same" });
  }

  if (!isAdmin && previousAttribution) {
    // Preserve the previous attribution; do not fail the caller.
    return json({ success: true, already_assigned: true, attribution: "existing_other" });
  }

  // Concurrency-safe claim for the non-admin path.
  let claimQuery = adminClient
    .from("app_14da0f1941_profiles")
    .update({ referred_by_user_id: referrer_id })
    .eq("user_id", referred_id);
  if (!isAdmin) {
    claimQuery = claimQuery.is("referred_by_user_id", null);
  }

  const { data: claimed, error: profileErr } = await claimQuery.select("user_id");

  if (profileErr) {
    return json({ error: "attribution_claim_failed" }, 500);
  }

  const weClaimed = (claimed?.length ?? 0) > 0;

  if (!weClaimed && !isAdmin) {
    // Someone else claimed concurrently — classify definitively.
    const { data: after } = await adminClient
      .from("app_14da0f1941_profiles")
      .select("referred_by_user_id")
      .eq("user_id", referred_id)
      .maybeSingle();
    const now = (after?.referred_by_user_id as string | null) ?? null;
    return json({
      success: true,
      already_assigned: true,
      attribution: now === referrer_id ? "existing_same" : now ? "existing_other" : "unknown",
    });
  }

  const { data: existing, error: existingErr } = await adminClient
    .from("app_14da0f1941_referrals")
    .select("id")
    .eq("referrer_id", referrer_id)
    .eq("referred_id", referred_id)
    .maybeSingle();

  if (existingErr) {
    if (weClaimed) {
      await adminClient
        .from("app_14da0f1941_profiles")
        .update({ referred_by_user_id: null })
        .eq("user_id", referred_id)
        .eq("referred_by_user_id", referrer_id);
    }
    return json({ error: "referral_lookup_failed" }, 500);
  }

  if (!existing) {
    // referred_email must be the REFERRED user's email, not the caller's
    // (the caller may be an admin assigning on their behalf).
    const { data: referredAuth } = await adminClient.auth.admin.getUserById(referred_id);
    const { error: insertErr } = await adminClient.from("app_14da0f1941_referrals").insert({
      referrer_id,
      referred_id,
      referred_email: referredAuth?.user?.email ?? "",
      status: "pending",
    });

    if (insertErr && insertErr.code !== "23505") {
      // Consistency: never leave the profile attributed without its row.
      if (weClaimed) {
        await adminClient
          .from("app_14da0f1941_profiles")
          .update({ referred_by_user_id: null })
          .eq("user_id", referred_id)
          .eq("referred_by_user_id", referrer_id);
      }
      return json({ error: "referral_insert_failed" }, 500);
    }
  }

  return json({ success: true, attribution: weClaimed ? "confirmed" : "existing_same" });
});
