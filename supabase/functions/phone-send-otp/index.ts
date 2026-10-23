// Edge Function: phone-send-otp
// PB-WHATSAPP-FOUNDATION-001 (evoluciona PB-PHONE-VERIFICATION-001)
//
// Flujo: normaliza el telefono a E.164 canonico, crea el challenge OTP
// (hash bcrypt, TTL corto), lo persiste como telefono NO verificado del
// perfil (upsert: funciona para usuarios auth-only sin perfil completo) y
// envia el codigo via PhoneVerificationProvider (mock/capture en QA).
//
// Seguridad:
//   * OTP con CSPRNG; NUNCA en claro en BD, NUNCA en logs, NUNCA en respuesta.
//   * Rate limit por hora + cooldown de reenvio; reenvio invalida el OTP anterior.
//   * Cambio de numero: resetea verificacion y revoca opt-ins (ticket §7).
//   * Auditoria sin PII: phone_added / phone_changed / verification_started /
//     whatsapp_opt_in_changed (telefono enmascarado).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.2.4/mod.ts";
import { normalizeToE164, generateOtpCode } from "../_shared/phone.ts";
import {
  createPhoneVerificationProvider,
  PHONE_PROVIDER_NOT_CONFIGURED,
} from "../_shared/phone-verification-provider.ts";
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
  const otpTtlMinutes = parseInt(Deno.env.get("PHONE_OTP_TTL_MINUTES") || "10", 10);
  const maxPerHour = parseInt(Deno.env.get("PHONE_OTP_MAX_PER_HOUR") || "3", 10);
  const resendCooldownSeconds = parseInt(Deno.env.get("PHONE_OTP_RESEND_COOLDOWN_SECONDS") || "60", 10);

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

  let body: { phone?: string; phone_e164?: string; country_code?: string } = {};
  try {
    body = await req.json();
  } catch {
    // ignore
  }

  const countryCode = (body.country_code || "ES").toUpperCase();
  const rawInput = (body.phone ?? body.phone_e164 ?? "").trim();
  const normalized = normalizeToE164(countryCode, rawInput);

  if (!normalized.valid || !normalized.e164) {
    return json({ error: normalized.error || "Invalid phone number" }, 400);
  }

  const phoneE164 = normalized.e164;

  // Provider configurado? Si no hay transporte, no tiene sentido escribir nada.
  const provider = await createPhoneVerificationProvider(supabase);
  if (!provider.isConfigured()) {
    return json({ error: PHONE_PROVIDER_NOT_CONFIGURED }, 503);
  }

  // Rate limit por hora + cooldown de reenvio ATOMICOS (FIX L1): el gate es
  // una RPC con SELECT ... FOR UPDATE sobre la fila de throttle del usuario,
  // por lo que solicitudes concurrentes se serializan y no pueden sobrepasar
  // ni la ventana ni el cooldown (el count-then-insert anterior era TOCTOU).
  const { data: gate, error: gateError } = await supabase.rpc("pb_phone_send_gate", {
    p_user_id: user.id,
    p_max_per_window: maxPerHour,
    p_window_seconds: 3600,
    p_cooldown_seconds: resendCooldownSeconds,
  });

  if (gateError) {
    return json({ error: gateError.message }, 500);
  }

  if (!gate?.allowed) {
    const reason = gate?.reason || "rate_limit_exceeded";
    const body429: Record<string, unknown> = { error: reason };
    if (typeof gate?.retry_after_seconds === "number") {
      body429.retry_after_seconds = gate.retry_after_seconds;
    }
    return json(body429, 429);
  }

  // Invalidar OTPs pendientes anteriores (un reenvio mata al codigo previo).
  await supabase
    .from("app_14da0f1941_phone_verifications")
    .update({ expires_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("verified_at", null);

  const code = generateOtpCode();
  const hash = bcrypt.hashSync(code); // sync: el edge runtime no tiene Web Worker (ticket PB-WHATSAPP-FOUNDATION-001)
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
    return json({ error: insertError.message }, 500);
  }

  // Estado actual del perfil (puede no existir: usuario auth-only).
  const { data: existing } = await supabase
    .from("app_14da0f1941_profiles")
    .select("user_id, phone_e164, phone_verified, whatsapp_service_opt_in, whatsapp_job_alerts_opt_in, whatsapp_marketing_opt_in")
    .eq("user_id", user.id)
    .maybeSingle();

  const previousPhone = existing?.phone_e164 ?? null;
  const isFirstAdd = !previousPhone;
  const isNumberChange = previousPhone !== null && previousPhone !== phoneE164;

  const now = new Date().toISOString();
  const profileRow: Record<string, unknown> = {
    user_id: user.id,
    phone_number_raw: rawInput,
    phone_e164: phoneE164,
    phone_country_code: countryCode,
  };

  if (isNumberChange) {
    // Ticket §7: numero nuevo => verificacion invalida y consentimiento NO heredado.
    profileRow.phone_verified = false;
    profileRow.phone_verified_at = null;
    profileRow.phone_verification_method = null;
    profileRow.whatsapp_service_opt_in = false;
    profileRow.whatsapp_job_alerts_opt_in = false;
    profileRow.whatsapp_marketing_opt_in = false;
    profileRow.whatsapp_consent_at = null;
    profileRow.whatsapp_consent_version = null;
    profileRow.whatsapp_opted_out_at = now;
  }

  // Upsert: crea perfil minimo para usuarios auth-only o actualiza el existente.
  const { error: profileError } = await supabase
    .from("app_14da0f1941_profiles")
    .upsert(profileRow, { onConflict: "user_id" });

  if (profileError) {
    return json({ error: profileError.message }, 500);
  }

  if (isFirstAdd) {
    await recordPhoneEvent(supabase, { userId: user.id, event: "phone_added", phoneE164 });
  } else if (isNumberChange) {
    await recordPhoneEvent(supabase, {
      userId: user.id,
      event: "phone_changed",
      phoneE164,
      metadata: { consent_revoked: true },
    });
    await recordPhoneEvent(supabase, {
      userId: user.id,
      event: "whatsapp_opt_in_changed",
      phoneE164,
      metadata: { reason: "phone_changed", service: false, job_alerts: false, marketing: false },
    });
  }

  await recordPhoneEvent(supabase, {
    userId: user.id,
    event: "verification_started",
    phoneE164,
    metadata: { provider: provider.name, ttl_minutes: otpTtlMinutes },
  });

  try {
    await provider.sendOtp({ to: phoneE164, code, ttlMinutes: otpTtlMinutes, userId: user.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }

  return json({ sent: true, expires_at: expiresAt, cooldown_seconds: resendCooldownSeconds }, 200);
});
