import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Get all auth users using admin API (paginate to get all)
    let allAuthUsers: any[] = [];
    let page = 1;
    const perPage = 1000;

    while (true) {
      const { data: authData, error: authError } = await supabase.auth.admin.listUsers({
        page,
        perPage,
      });

      if (authError) {
        return new Response(
          JSON.stringify({ error: "Failed to list auth users", details: authError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const users = authData?.users || [];
      allAuthUsers = allAuthUsers.concat(users);

      if (users.length < perPage) break;
      page++;
    }

    // Get all existing profile user_ids
    const { data: existingProfiles, error: profilesError } = await supabase
      .from("app_14da0f1941_profiles")
      .select("user_id");

    if (profilesError) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch profiles", details: profilesError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const existingUserIds = new Set((existingProfiles || []).map((p: any) => p.user_id));

    // Find auth users without profiles
    const missingUsers = allAuthUsers.filter((u) => !existingUserIds.has(u.id));

    if (missingUsers.length === 0) {
      return new Response(
        JSON.stringify({
          message: "All users already have profiles. No backfill needed.",
          created: 0,
          total_auth_users: allAuthUsers.length,
          total_profiles: existingProfiles?.length || 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create missing profiles with required default values
    const profilesToInsert = missingUsers.map((u) => ({
      user_id: u.id,
      full_name: u.user_metadata?.full_name || u.raw_user_meta_data?.full_name || u.email?.split("@")[0] || "User",
      username: u.email?.split("@")[0] || null,
      role: "user",
      account_type: "worker",
      cv_visible: true,
      availability_status: "available",
      profile_completion: 10,
    }));

    const { data: inserted, error: insertError } = await supabase
      .from("app_14da0f1941_profiles")
      .insert(profilesToInsert)
      .select("user_id, full_name");

    if (insertError) {
      return new Response(
        JSON.stringify({
          error: "Failed to insert profiles",
          details: insertError.message,
          attempted: profilesToInsert.length,
          missing_users: missingUsers.map((u) => ({
            id: u.id,
            email: u.email,
            full_name: u.user_metadata?.full_name || u.raw_user_meta_data?.full_name || "N/A",
          })),
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        message: `Backfill complete. Created ${inserted?.length || 0} missing profile(s).`,
        created: inserted?.length || 0,
        total_auth_users: allAuthUsers.length,
        total_profiles_after: (existingProfiles?.length || 0) + (inserted?.length || 0),
        created_profiles: inserted,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Unexpected error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});