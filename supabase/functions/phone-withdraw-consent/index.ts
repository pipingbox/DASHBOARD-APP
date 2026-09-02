// Edge Function: phone-withdraw-consent
// Purpose: Remove phone number and all WhatsApp/SMS consent atomically.
// PB-PHONE-VERIFICATION-001
//
// phone_e164, phone_verified_at and consent fields are backend-controlled.
// The frontend must call this function instead of updating profiles directly.

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

  // Invalidate any pending OTP for this user.
  await supabase
    .from("app_14da0f1941_phone_verifications")
    .update({ expires_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("verified_at", null);

  const { error } = await supabase
    .from("app_14da0f1941_profiles")
    .update({
      phone_e164: null,
      phone_country_code: null,
      phone_verified_at: null,
      whatsapp_opt_in: false,
      whatsapp_opt_in_at: null,
      whatsapp_opt_in_source: null,
    })
    .eq("user_id", user.id);

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ removed: true }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
