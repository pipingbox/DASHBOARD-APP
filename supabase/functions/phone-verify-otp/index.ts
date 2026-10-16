// Edge Function: phone-verify-otp
// PB-WHATSAPP-FOUNDATION-001 (evoluciona PB-PHONE-VERIFICATION-001)
//
// Valida el codigo OTP del challenge pendiente mas reciente:
//   * expiracion corta, max intentos, anti brute-force;
//   * exito => phone_verified=true + phone_verified_at + metodo en el perfil;
//   * fallo => attempts+1 y auditoria verification_failed (sin el codigo).
// El consentimiento WhatsApp NO se otorga aqui: vive en phone-update-consent.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.2.4/mod.ts";
import { recordPhoneEvent } from "../_shared/phone-events.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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
    return json({ error: "Unauthorized" }, 401);
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (userError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: { code?: string } = {};
  try {
    body = await req.json();
  } catch {
    // ignore
  }

  const code = (body.code || "").trim();
  if (!code || code.length !== 6) {
    return json({ error: "invalid_code" }, 400);
  }

  const { data: rows, error: fetchError } = await supabase
    .from("app_14da0f1941_phone_verifications")
    .select("id, otp_code_hash, attempts, max_attempts, expires_at, phone_e164")
    .eq("user_id", user.id)
    .is("verified_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (fetchError) {
    return json({ error: fetchError.message }, 500);
  }

  if (!rows || rows.length === 0) {
    return json({ error: "no_pending_verification" }, 400);
  }

  const record = rows[0];

  if (new Date(record.expires_at) < new Date()) {
    await recordPhoneEvent(supabase, {
      userId: user.id,
      event: "verification_failed",
      phoneE164: record.phone_e164,
      metadata: { reason: "expired" },
    });
    return json({ error: "code_expired" }, 400);
  }

  if (record.attempts >= record.max_attempts) {
    await recordPhoneEvent(supabase, {
      userId: user.id,
      event: "verification_failed",
      phoneE164: record.phone_e164,
      metadata: { reason: "max_attempts" },
    });
    return json({ error: "max_attempts_exceeded" }, 400);
  }

  const valid = await bcrypt.compare(code, record.otp_code_hash);

  if (!valid) {
    await supabase
      .from("app_14da0f1941_phone_verifications")
      .update({ attempts: record.attempts + 1 })
      .eq("id", record.id);

    await recordPhoneEvent(supabase, {
      userId: user.id,
      event: "verification_failed",
      phoneE164: record.phone_e164,
      metadata: { reason: "invalid_code", attempt: record.attempts + 1, max_attempts: record.max_attempts },
    });

    return json({ error: "invalid_code" }, 400);
  }

  const now = new Date().toISOString();

  await supabase
    .from("app_14da0f1941_phone_verifications")
    .update({ verified_at: now, attempts: record.attempts + 1 })
    .eq("id", record.id);

  const { error: profileError } = await supabase
    .from("app_14da0f1941_profiles")
    .update({
      phone_e164: record.phone_e164,
      phone_verified: true,
      phone_verified_at: now,
      phone_verification_method: "sms_otp",
    })
    .eq("user_id", user.id);

  if (profileError) {
    return json({ error: profileError.message }, 500);
  }

  await recordPhoneEvent(supabase, {
    userId: user.id,
    event: "phone_verified",
    phoneE164: record.phone_e164,
    metadata: { method: "sms_otp" },
  });

  return json({ verified: true }, 200);
});
