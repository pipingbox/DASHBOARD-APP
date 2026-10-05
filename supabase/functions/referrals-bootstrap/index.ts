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

interface BootstrapBody {
  referral_code?: string;
}

// Explicit outcome classification so the client only clears the stored
// referral code on DEFINITIVE results and keeps it on transient failures.
type Attribution =
  | "confirmed" // this call set the attribution + referral row
  | "existing_same" // already attributed to this same referrer
  | "existing_other" // already attributed to a different referrer (preserved)
  | "invalid_code" // code not found — definitive
  | "self_referral" // code belongs to the caller — definitive
  | "none"; // no code supplied

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

  const body: BootstrapBody = await req.json().catch(() => ({}));

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // Idempotency: an existing referral_code is stable and must be returned
  // as-is instead of being regenerated (PB-REFERRAL-ALDO-001).
  const { data: profile, error: profileReadErr } = await adminClient
    .from("app_14da0f1941_profiles")
    .select("referral_code, referred_by_user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileReadErr) {
    return json({ error: "profile_read_failed" }, 500);
  }

  let code = (profile?.referral_code as string | null) ?? null;

  if (!code) {
    // Generate with collision retry (referral_code has a UNIQUE index).
    for (let attempt = 0; attempt < 3 && !code; attempt++) {
      const candidate = `PB-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const { error: codeErr } = await adminClient
        .from("app_14da0f1941_profiles")
        .update({ referral_code: candidate })
        .eq("user_id", user.id)
        .is("referral_code", null);
      if (!codeErr) {
        code = candidate;
      } else if (codeErr.code !== "23505") {
        return json({ error: "code_assign_failed" }, 500);
      }
    }

    if (!code) {
      return json({ error: "Could not allocate referral code" }, 500);
    }
  }

  let attribution: Attribution = "none";
  let referrerId: string | null = null;
  const currentAttribution = (profile?.referred_by_user_id as string | null) ?? null;

  if (body.referral_code) {
    const { data: referrer, error: referrerErr } = await adminClient
      .from("app_14da0f1941_profiles")
      .select("user_id")
      .eq("referral_code", body.referral_code)
      .maybeSingle();

    if (referrerErr) {
      return json({ error: "referrer_lookup_failed", referral_code: code }, 500);
    }

    const resolvedReferrer = (referrer?.user_id as string | null) ?? null;

    if (!resolvedReferrer) {
      attribution = "invalid_code";
    } else if (resolvedReferrer === user.id) {
      attribution = "self_referral";
    } else if (currentAttribution) {
      // A previous attribution is never overwritten. If it already points to
      // the same referrer, the row-heal below still runs (covers legacy
      // profiles attributed while the row insert was broken).
      attribution = currentAttribution === resolvedReferrer ? "existing_same" : "existing_other";
      referrerId = currentAttribution;
    } else {
      referrerId = resolvedReferrer;

        // Concurrency-safe claim: only wins if still unattributed.
        const { data: claimed, error: claimErr } = await adminClient
          .from("app_14da0f1941_profiles")
          .update({ referred_by_user_id: referrerId })
          .eq("user_id", user.id)
          .is("referred_by_user_id", null)
          .select("user_id");

        if (claimErr) {
          return json({ error: "attribution_claim_failed", referral_code: code }, 500);
        }

        const weClaimed = (claimed?.length ?? 0) > 0;

        if (!weClaimed) {
          // Lost the race or state changed between read and claim — re-read
          // to classify definitively instead of guessing.
          const { data: after } = await adminClient
            .from("app_14da0f1941_profiles")
            .select("referred_by_user_id")
            .eq("user_id", user.id)
            .maybeSingle();
          const now = (after?.referred_by_user_id as string | null) ?? null;
          if (now === referrerId) {
            attribution = "existing_same";
          } else if (now) {
            attribution = "existing_other";
            referrerId = now;
          } else {
            return json({ error: "attribution_state_unknown", referral_code: code }, 500);
          }
        } else {
          attribution = "confirmed";
        }

        // Referral row: single writer, deduped, errors NOT ignored.
        if (attribution === "confirmed" || attribution === "existing_same") {
          const { data: existing, error: existingErr } = await adminClient
            .from("app_14da0f1941_referrals")
            .select("id")
            .eq("referrer_id", referrerId)
            .eq("referred_id", user.id)
            .maybeSingle();

          if (existingErr) {
            if (weClaimed) {
              // Compensate only the claim WE made so a later retry can
              // rebuild a consistent state.
              await adminClient
                .from("app_14da0f1941_profiles")
                .update({ referred_by_user_id: null })
                .eq("user_id", user.id)
                .eq("referred_by_user_id", referrerId);
            }
            return json({ error: "referral_lookup_failed", referral_code: code }, 500);
          }

          if (!existing) {
            const { error: insertErr } = await adminClient
              .from("app_14da0f1941_referrals")
              .insert({
                referrer_id: referrerId,
                referred_id: user.id,
                referred_email: user.email ?? "",
                status: "pending",
              });

            if (insertErr && insertErr.code !== "23505") {
              // Consistency: never leave the profile attributed without its
              // referral row — compensate only the claim WE made.
              if (weClaimed) {
                await adminClient
                  .from("app_14da0f1941_profiles")
                  .update({ referred_by_user_id: null })
                  .eq("user_id", user.id)
                  .eq("referred_by_user_id", referrerId);
              }
              return json({ error: "referral_insert_failed", referral_code: code }, 500);
            }
          }
        }
      }
    }

  return json({
    referral_code: code,
    referrer_id: referrerId,
    attribution,
  });
});
