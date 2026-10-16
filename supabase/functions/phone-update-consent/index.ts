// Edge Function: phone-update-consent
// PB-WHATSAPP-FOUNDATION-001
//
// Gestiona el consentimiento WhatsApp por finalidad (service / job_alerts /
// marketing), SEPARADO de la verificacion del telefono:
//   * activar cualquier opt-in exige telefono verificado;
//   * desactivar siempre esta permitido (revocacion libre);
//   * registra consent_at + version del texto y la revocacion efectiva
//     (whatsapp_opted_out_at cuando todos quedan a false);
//   * auditoria whatsapp_opt_in_changed sin PII.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { recordPhoneEvent } from "../_shared/phone-events.ts";

const CONSENT_VERSION = "wa-consent-v1";

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

  let body: {
    service_opt_in?: boolean;
    job_alerts_opt_in?: boolean;
    marketing_opt_in?: boolean;
  } = {};
  try {
    body = await req.json();
  } catch {
    // ignore
  }

  const wantsTrue = [body.service_opt_in, body.job_alerts_opt_in, body.marketing_opt_in]
    .some((v) => v === true);
  const anyProvided = [body.service_opt_in, body.job_alerts_opt_in, body.marketing_opt_in]
    .some((v) => typeof v === "boolean");

  if (!anyProvided) {
    return json({ error: "no_consent_fields" }, 400);
  }

  const { data: profile, error: profileError } = await supabase
    .from("app_14da0f1941_profiles")
    .select("user_id, phone_e164, phone_verified, whatsapp_service_opt_in, whatsapp_job_alerts_opt_in, whatsapp_marketing_opt_in")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    return json({ error: profileError.message }, 500);
  }

  if (!profile || !profile.phone_e164) {
    return json({ error: "phone_required" }, 400);
  }

  if (wantsTrue && !profile.phone_verified) {
    return json({ error: "phone_not_verified" }, 400);
  }

  const next = {
    whatsapp_service_opt_in: typeof body.service_opt_in === "boolean"
      ? body.service_opt_in
      : profile.whatsapp_service_opt_in,
    whatsapp_job_alerts_opt_in: typeof body.job_alerts_opt_in === "boolean"
      ? body.job_alerts_opt_in
      : profile.whatsapp_job_alerts_opt_in,
    whatsapp_marketing_opt_in: typeof body.marketing_opt_in === "boolean"
      ? body.marketing_opt_in
      : profile.whatsapp_marketing_opt_in,
  };

  const now = new Date().toISOString();
  const anyOn = next.whatsapp_service_opt_in || next.whatsapp_job_alerts_opt_in || next.whatsapp_marketing_opt_in;
  const wasOn = profile.whatsapp_service_opt_in || profile.whatsapp_job_alerts_opt_in || profile.whatsapp_marketing_opt_in;

  const update: Record<string, unknown> = {
    ...next,
    whatsapp_consent_at: now,
    whatsapp_consent_version: CONSENT_VERSION,
  };

  // Revocacion efectiva: todos a false habiendo habido algun opt-in activo.
  // FIX L3: whatsapp_opted_out_at es la fecha de la ULTIMA retirada efectiva
  // y se CONSERVA al reactivar un opt-in (semantica historica, no de estado).
  // El estado actual lo dan siempre los tres flags booleanos; opted_out_at
  // solo registra cuando ocurrio la ultima revocacion (auditable, GDPR).
  if (!anyOn && wasOn) {
    update.whatsapp_opted_out_at = now;
  }

  const { error: updateError } = await supabase
    .from("app_14da0f1941_profiles")
    .update(update)
    .eq("user_id", user.id);

  if (updateError) {
    return json({ error: updateError.message }, 500);
  }

  await recordPhoneEvent(supabase, {
    userId: user.id,
    event: "whatsapp_opt_in_changed",
    phoneE164: profile.phone_e164,
    metadata: {
      service: next.whatsapp_service_opt_in,
      job_alerts: next.whatsapp_job_alerts_opt_in,
      marketing: next.whatsapp_marketing_opt_in,
      consent_version: CONSENT_VERSION,
      revoked: !anyOn && wasOn,
    },
  });

  return json({ ok: true, ...next, consent_version: CONSENT_VERSION }, 200);
});
