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

function getOnboardingStatus(profile: any, completion: number): string {
  if (completion >= 30) return "MARKETPLACE_READY";
  if (profile.full_name && profile.title) return "PROFILE_STARTED";
  return "AUTH_ONLY";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "missing_env" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Parse request body for optional single-user recalculation
    let targetUserId: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        targetUserId = body.user_id || null;
      } catch {
        // No body or invalid JSON - recalculate all
      }
    }

    // Fetch profiles
    let profilesQuery = `${supabaseUrl}/rest/v1/app_14da0f1941_profiles?select=id,user_id,full_name,title,company,location,years_experience,skills,bio,avatar_url,cv_file_url,cv_url`;
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
      return new Response(
        JSON.stringify({ error: "profiles_fetch_failed", details: errText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const profiles: any[] = await profilesRes.json();

    if (profiles.length === 0) {
      return new Response(
        JSON.stringify({ message: "No profiles found to recalculate", updated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
    const results: any[] = [];

    for (const profile of profiles) {
      const expCount = expCountMap.get(profile.user_id) || 0;
      const certCount = certCountMap.get(profile.user_id) || 0;
      const docCount = docCountMap.get(profile.user_id) || 0;

      const completion = calculateCompletion(profile, expCount, certCount, docCount);
      const onboardingStatus = getOnboardingStatus(profile, completion);
      const marketplaceReady = completion >= 30;

      // Update profile in database
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
        results.push({
          user_id: profile.user_id,
          full_name: profile.full_name,
          profile_completion: completion,
          onboarding_status: onboardingStatus,
          marketplace_ready: marketplaceReady,
        });
      }
    }

    return new Response(
      JSON.stringify({
        message: `Recalculation complete. Updated ${updatedCount}/${profiles.length} profiles.`,
        updated: updatedCount,
        total_profiles: profiles.length,
        results: results.slice(0, 50), // Limit response size
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "unexpected_error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});