// Edge Function: phone-send-otp
// Purpose: Generate and send OTP for phone verification.
// PB-PHONE-VERIFICATION-001

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt/mod.ts";
import { createSmsProvider } from "../_shared/sms-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const otpTtlMinutes = parseInt(Deno.env.get("PHONE_OTP_TTL_MINUTES") || "10", 10);
  const maxActiveOtps = parseInt(Deno.env.get("PHONE_MAX_ACTIVE_OTPS") || "3", 10);

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

  let body: { phone_e164?: string; country_code?: string } = {};
  try {
    body = await req.json();
  } catch {
    // ignore
  }

  const phoneE164 = normalizePhone(body.phone_e164 || "");
  if (!phoneE164 || phoneE164.length < 8) {
    return new Response(
      JSON.stringify({ error: "Invalid phone number" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Rate limit: count active/pending OTPs in the last hour
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recentOtps, error: countError } = await supabase
    .from("app_14da0f1941_phone_verifications")
    .select("id")
    .eq("user_id", user.id)
    .gte("created_at", hourAgo);

  if (countError) {
    return new Response(
      JSON.stringify({ error: countError.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if ((recentOtps || []).length >= maxActiveOtps) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded" }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Invalidate previous pending OTPs
  await supabase
    .from("app_14da0f1941_phone_verifications")
    .update({ expires_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("verified_at", null);

  const code = generateOtp();
  const hash = await bcrypt.hash(code);
  const expiresAt = new Date(Date.now() + otpTtlMinutes * 60 * 1000).toISOString();

  const { error: insertError } = await supabase
    .from("app_14da0f1941_phone_verifications")
    .insert({
      user_id: user.id,
      phone_e164: phoneE164,
      otp_code_hash: hash,
      attempts: 0,
      expires_at: expiresAt,
    });

  if (insertError) {
    return new Response(
      JSON.stringify({ error: insertError.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Update profile phone (not verified yet)
  await supabase
    .from("app_14da0f1941_profiles")
    .update({
      phone_e164: phoneE164,
      phone_country_code: body.country_code || null,
      phone_verified_at: null,
      whatsapp_opt_in: false,
      whatsapp_opt_in_at: null,
      whatsapp_opt_in_source: null,
    })
    .eq("user_id", user.id);

  // Send via adapter
  const smsProvider = createSmsProvider();
  try {
    await smsProvider.send({
      to: phoneE164,
      body: `Tu codigo de verificacion de PipingBox es: ${code}. Valido por ${otpTtlMinutes} minutos.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ sent: true, expires_at: expiresAt }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
