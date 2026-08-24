import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Centralized Profile Completion Calculation (Server-Side)
 *
 * Weight distribution (total = 100%):
 *   Photo:          10%
 *   Full Name:       5%
 *   Position/Title:  5%
 *   Company:         5%
 *   Location:        5%
 *   Years Exp:       5%
 *   Skills:         10%
 *   Bio:            10%
 *   CV:             15%
 *   Experience:     15%
 *   Certification:  10%
 *   Documents:       5%
 */
function calculateCompletion(profile: any, expCount: number, certCount: number, docCount: number): number {
  let score = 0;
  if (profile.avatar_url && profile.avatar_url.trim().length > 0) score += 10;
  if (profile.full_name && profile.full_name.trim().length > 0) score += 5;
  if (profile.title && profile.title.trim().length > 0) score += 5;
  if (profile.company && profile.company.trim().length > 0) score += 5;
  if (profile.location && profile.location.trim().length > 0) score += 5;
  if (profile.years_experience && profile.years_experience > 0) score += 5;
  if (profile.skills && Array.isArray(profile.skills) && profile.skills.length > 0) score += 10;
  if (profile.bio && profile.bio.trim().length > 10) score += 10;
  if (profile.cv_file_url || profile.cv_url) score += 15;
  if (expCount > 0) score += 15;
  if (certCount > 0) score += 10;
  if (docCount > 0) score += 5;
  return score;
}

/**
 * Whether the user consented to being discoverable in the marketplace.
 *
 * PB-ADMIN-ONBOARDING-SCHEMA-001: `marketplace_ready` is NOT a derived completeness flag.
 * Setting it true exposes the worker's personal data to companies, so it must never be
 * inferred from profile_completion alone. The user's choice is recorded by the onboarding
 * wizard in profile_visibility / cv_visible and has to be respected here.
 */
function consentsToMarketplace(profile: any): boolean {
  if (profile.profile_visibility === "public") return true;
  if (profile.profile_visibility == null && profile.cv_visible === true) return true;
  return false;
}

function getOnboardingStatus(
  profile: any,
  completion: number,
  consents: boolean,
): string {
  // A complete profile that opted out is PROFILE_COMPLETED, not MARKETPLACE_READY:
  // it is finished, it is simply not published.
  if (completion >= 30) return consents ? "MARKETPLACE_READY" : "PROFILE_COMPLETED";
  if (profile.full_name && profile.title) return "PROFILE_STARTED";
  return "AUTH_ONLY";
}

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

    // Fetch profiles
    let profilesQuery = `${supabaseUrl}/rest/v1/app_14da0f1941_profiles?select=id,user_id,full_name,title,company,location,years_experience,skills,bio,avatar_url,cv_file_url,cv_url,profile_visibility,cv_visible`;
    if (targetUserId) {
      profilesQuery += `&user_id=eq.${targetUserId}`;
    } else {
      profilesQuery += `&limit=2000`;
    }

    const profilesRes = await fetch(profilesQuery, {
      headers: {
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!profilesRes.ok) {
      const errText = await profilesRes.text();
      console.error("recalculate-profiles: profiles fetch failed", errText);
      return json({ error: "profiles_fetch_failed" }, 500);
    }

    const profiles: any[] = await profilesRes.json();

    if (profiles.length === 0) {
      return json({ message: "No profiles found to recalculate", updated: 0 });
    }

    const userIds = profiles.map((p: any) => p.user_id);

    // Fetch experience counts
    const expCountMap = new Map<string, number>();
    const expUrl = `${supabaseUrl}/rest/v1/app_worker_experiences?select=user_id&user_id=in.(${userIds.join(",")})`;
    const expRes = await fetch(expUrl, {
      headers: {
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
    });
    if (expRes.ok) {
      const exps: any[] = await expRes.json();
      for (const e of exps) {
        expCountMap.set(e.user_id, (expCountMap.get(e.user_id) || 0) + 1);
      }
    }

    // Fetch certification counts
    const certCountMap = new Map<string, number>();
    const certUrl = `${supabaseUrl}/rest/v1/app_worker_certifications?select=user_id&user_id=in.(${userIds.join(",")})`;
    const certRes = await fetch(certUrl, {
      headers: {
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
    });
    if (certRes.ok) {
      const certs: any[] = await certRes.json();
      for (const c of certs) {
        certCountMap.set(c.user_id, (certCountMap.get(c.user_id) || 0) + 1);
      }
    }

    // Fetch document counts
    const docCountMap = new Map<string, number>();
    const docUrl = `${supabaseUrl}/rest/v1/app_worker_documents?select=user_id&user_id=in.(${userIds.join(",")})`;
    const docRes = await fetch(docUrl, {
      headers: {
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
    });
    if (docRes.ok) {
      const docs: any[] = await docRes.json();
      for (const d of docs) {
        docCountMap.set(d.user_id, (docCountMap.get(d.user_id) || 0) + 1);
      }
    }

    // Calculate and update each profile
    let updatedCount = 0;
    let callerResult: Record<string, unknown> | null = null;

    for (const profile of profiles) {
      const expCount = expCountMap.get(profile.user_id) || 0;
      const certCount = certCountMap.get(profile.user_id) || 0;
      const docCount = docCountMap.get(profile.user_id) || 0;

      const completion = calculateCompletion(profile, expCount, certCount, docCount);
      const consents = consentsToMarketplace(profile);
      const onboardingStatus = getOnboardingStatus(profile, completion, consents);
      const marketplaceReady = completion >= 30 && consents;

      const updateUrl = `${supabaseUrl}/rest/v1/app_14da0f1941_profiles?user_id=eq.${profile.user_id}`;
      const updateRes = await fetch(updateUrl, {
        method: "PATCH",
        headers: {
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          profile_completion: completion,
          onboarding_status: onboardingStatus,
          marketplace_ready: marketplaceReady,
        }),
      });

      if (updateRes.ok) {
        updatedCount++;
        if (profile.user_id === caller.id) {
          callerResult = {
            profile_completion: completion,
            onboarding_status: onboardingStatus,
            marketplace_ready: marketplaceReady,
          };
        }
      }
    }

    // The response no longer carries a list of profiles. It used to return up
    // to 50 rows with user_id and full_name, which turned every call into a
    // personal-data dump. Callers get counts, plus their own result when it
    // applies.
    return json({
      message: `Recalculation complete. Updated ${updatedCount}/${profiles.length} profiles.`,
      updated: updatedCount,
      total_profiles: profiles.length,
      ...(callerResult ? { profile: callerResult } : {}),
    });
  } catch (err) {
    console.error("recalculate-profiles: unexpected error", err);
    return json({ error: "unexpected_error" }, 500);
  }
});
