// Edge Function: phone-verify-otp
// Purpose: Verify OTP and mark phone as verified.
// PB-PHONE-VERIFICATION-001

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt/mod.ts";

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

  let body: { code?: string; whatsapp_opt_in?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // ignore
  }

  const code = (body.code || "").trim();
  if (!code || code.length !== 6) {
    return new Response(
      JSON.stringify({ error: "Invalid code" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { data: rows, error: fetchError } = await supabase
    .from("app_14da0f1941_phone_verifications")
    .select("id, otp_code_hash, attempts, max_attempts, expires_at, phone_e164")
    .eq("user_id", user.id)
    .is("verified_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (fetchError) {
    return new Response(
      JSON.stringify({ error: fetchError.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!rows || rows.length === 0) {
    return new Response(
      JSON.stringify({ error: "No pending verification" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const record = rows[0];

  if (new Date(record.expires_at) < new Date()) {
    return new Response(
      JSON.stringify({ error: "Code expired" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (record.attempts >= record.max_attempts) {
    return new Response(
      JSON.stringify({ error: "Max attempts exceeded" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const valid = await bcrypt.compare(code, record.otp_code_hash);

  if (!valid) {
    await supabase
      .from("app_14da0f1941_phone_verifications")
      .update({ attempts: record.attempts + 1 })
      .eq("id", record.id);

    return new Response(
      JSON.stringify({ error: "Invalid code" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const now = new Date().toISOString();

  await supabase
    .from("app_14da0f1941_phone_verifications")
    .update({ verified_at: now, attempts: record.attempts + 1 })
    .eq("id", record.id);

  const whatsappOptIn = body.whatsapp_opt_in === true;
  const profileUpdate: Record<string, unknown> = {
    phone_e164: record.phone_e164,
    phone_verified_at: now,
  };

  if (whatsappOptIn) {
    profileUpdate.whatsapp_opt_in = true;
    profileUpdate.whatsapp_opt_in_at = now;
    profileUpdate.whatsapp_opt_in_source = "profile_settings";
  }

  await supabase
    .from("app_14da0f1941_profiles")
    .update(profileUpdate)
    .eq("user_id", user.id);

  return new Response(
    JSON.stringify({ verified: true, phone_e164: record.phone_e164 }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
