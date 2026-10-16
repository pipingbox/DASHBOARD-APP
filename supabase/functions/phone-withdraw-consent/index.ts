// Edge Function: phone-withdraw-consent
// PB-WHATSAPP-FOUNDATION-001 (evoluciona PB-PHONE-VERIFICATION-001)
//
// Baja completa: elimina el telefono y TODO el consentimiento WhatsApp de
// forma atomica, invalida los OTP pendientes y fecha la revocacion
// (whatsapp_opted_out_at). El historico queda en phone_events (append-only).
//
// phone_e164, phone_verified* y los campos de consentimiento son
// backend-controlled: el frontend DEBE usar esta funcion.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

  const { data: profile } = await supabase
    .from("app_14da0f1941_profiles")
    .select("phone_e164, whatsapp_service_opt_in, whatsapp_job_alerts_opt_in, whatsapp_marketing_opt_in")
    .eq("user_id", user.id)
    .maybeSingle();

  // Invalidar cualquier OTP pendiente.
  await supabase
    .from("app_14da0f1941_phone_verifications")
    .update({ expires_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("verified_at", null);

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("app_14da0f1941_profiles")
    .update({
      phone_number_raw: null,
      phone_e164: null,
      phone_country_code: null,
      phone_verified: false,
      phone_verified_at: null,
      phone_verification_method: null,
      whatsapp_service_opt_in: false,
      whatsapp_job_alerts_opt_in: false,
      whatsapp_marketing_opt_in: false,
      whatsapp_consent_at: null,
      whatsapp_consent_version: null,
      whatsapp_opted_out_at: now,
    })
    .eq("user_id", user.id);

  if (error) {
    return json({ error: error.message }, 500);
  }

  if (profile?.phone_e164) {
    await recordPhoneEvent(supabase, {
      userId: user.id,
      event: "phone_changed",
      phoneE164: profile.phone_e164,
      metadata: { removed: true },
    });
  }

  const hadConsent = profile
    ? (profile.whatsapp_service_opt_in || profile.whatsapp_job_alerts_opt_in || profile.whatsapp_marketing_opt_in)
    : false;

  if (hadConsent) {
    await recordPhoneEvent(supabase, {
      userId: user.id,
      event: "whatsapp_opt_in_changed",
      phoneE164: profile?.phone_e164 ?? null,
      metadata: { revoked: true, service: false, job_alerts: false, marketing: false },
    });
  }

  return json({ removed: true }, 200);
});
