// Edge Function: ensure-admin-role
// Purpose: Promote the primary admin account to role='admin' securely.
// PB-MATCHING-NOTIFICATIONS-001
//
// The frontend must NOT update role directly. This function verifies the JWT
// and delegates to pb_promote_primary_admin(), which checks auth.users.email.

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

  const { error } = await supabase.rpc("pb_promote_primary_admin", { p_user_id: user.id });

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ role: "admin" }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
