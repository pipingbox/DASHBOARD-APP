import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "PB-";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
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
        JSON.stringify({ error: "missing_env", details: `URL: ${!!supabaseUrl}, KEY: ${!!serviceRoleKey}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create admin client that bypasses RLS
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Get all auth users
    let allAuthUsers: any[] = [];
    let page = 1;
    const perPage = 1000;

    while (true) {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (authError) {
        return new Response(
          JSON.stringify({ error: "auth_list_failed", details: authError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const users = authData?.users || [];
      allAuthUsers = allAuthUsers.concat(users);
      if (users.length < perPage) break;
      page++;
    }

    // Fetch profiles using direct REST API call with service_role key to bypass RLS
    const profilesUrl = `${supabaseUrl}/rest/v1/app_14da0f1941_profiles?select=id,user_id,full_name,username,role,account_type,title,bio,location,company,skills,avatar_url,cv_visible,cv_file_url,cv_url,availability_status,referral_code,referred_by_user_id,years_experience,profile_completion,profile_visibility,created_at,updated_at&limit=1000`;
    
    const profilesRes = await fetch(profilesUrl, {
      headers: {
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!profilesRes.ok) {
      const errText = await profilesRes.text();
      return new Response(
        JSON.stringify({ error: "profiles_fetch_failed", details: errText, status: profilesRes.status }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const existingProfiles: any[] = await profilesRes.json();

    const profilesByUserId = new Map(existingProfiles.map((p: any) => [p.user_id, p]));
    const existingUserIds = new Set(existingProfiles.map((p: any) => p.user_id));
    const missingUsers = allAuthUsers.filter((u: any) => !existingUserIds.has(u.id));

    // GET mode
    if (req.method === "GET") {
      const url = new URL(req.url);
      const mode = url.searchParams.get("mode");

      if (mode === "list-all") {
        const authUsersList = allAuthUsers.map((u: any) => {
          const profile = profilesByUserId.get(u.id);
          // Use the stored profile_completion from DB directly (single source of truth)
          const profileCompletion = profile?.profile_completion ?? 0;

          return {
            auth_id: u.id,
            email: u.email || null,
            full_name: profile?.full_name || u.user_metadata?.full_name || u.raw_user_meta_data?.full_name || null,
            created_at: u.created_at,
            last_sign_in_at: u.last_sign_in_at,
            auth_provider: u.app_metadata?.provider || "email",
            has_profile: existingUserIds.has(u.id),
            profile: profile ? {
              id: profile.id,
              role: profile.role,
              account_type: profile.account_type,
              title: profile.title,
              bio: profile.bio,
              location: profile.location,
              company: profile.company,
              skills: profile.skills,
              avatar_url: profile.avatar_url,
              cv_visible: profile.cv_visible,
              cv_file_url: profile.cv_file_url,
              cv_url: profile.cv_url,
              availability_status: profile.availability_status,
              referral_code: profile.referral_code,
              referred_by_user_id: profile.referred_by_user_id,
              years_experience: profile.years_experience,
              profile_completion: profileCompletion,
              profile_visibility: profile.profile_visibility,
              created_at: profile.created_at,
            } : null,
          };
        });

        return new Response(
          JSON.stringify({
            auth_users: authUsersList,
            total_auth_users: allAuthUsers.length,
            total_profiles: existingProfiles.length,
            orphan_count: missingUsers.length,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Default GET: orphans only
      const orphanList = missingUsers.map((u: any) => ({
        auth_id: u.id,
        email: u.email || null,
        full_name: u.user_metadata?.full_name || u.raw_user_meta_data?.full_name || null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        auth_provider: u.app_metadata?.provider || "email",
        has_profile: false,
      }));

      return new Response(
        JSON.stringify({
          orphans: orphanList,
          orphan_count: missingUsers.length,
          total_auth_users: allAuthUsers.length,
          total_profiles: existingProfiles.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST mode: backfill missing profiles
    if (missingUsers.length === 0) {
      return new Response(
        JSON.stringify({
          message: "All users already have profiles. No backfill needed.",
          created: 0,
          total_auth_users: allAuthUsers.length,
          total_profiles: existingProfiles.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert missing profiles via REST API with service_role
    const profilesToInsert = missingUsers.map((u: any) => ({
      user_id: u.id,
      full_name: u.user_metadata?.full_name || u.raw_user_meta_data?.full_name || u.email?.split("@")[0] || "User",
      username: u.email?.split("@")[0] || null,
      role: "user",
      account_type: "worker",
      cv_visible: false,
      availability_status: "not_specified",
      referral_code: generateReferralCode(),
    }));

    const insertUrl = `${supabaseUrl}/rest/v1/app_14da0f1941_profiles`;
    const insertRes = await fetch(insertUrl, {
      method: "POST",
      headers: {
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
      body: JSON.stringify(profilesToInsert),
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      return new Response(
        JSON.stringify({
          error: "insert_failed",
          details: errText,
          attempted: profilesToInsert.length,
          missing_users: missingUsers.slice(0, 10).map((u: any) => ({ id: u.id, email: u.email })),
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const inserted = await insertRes.json();

    return new Response(
      JSON.stringify({
        message: `Backfill complete. Created ${inserted?.length || 0} missing profile(s).`,
        created: inserted?.length || 0,
        total_auth_users: allAuthUsers.length,
        total_profiles_after: existingProfiles.length + (inserted?.length || 0),
        created_profiles: inserted?.map((p: any) => ({ user_id: p.user_id, full_name: p.full_name })),
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