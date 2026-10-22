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

  // Gate de verificaciones por hora ATOMICO y CON BLOQUEO (FIX M1): agotada
  // la ventana RECHAZA con 429; ya no basta incrementar un contador. Impide
  // escrituras ilimitadas en auditoria repitiendo verify (incluido expirado).
  const verifyMaxPerHour = parseInt(Deno.env.get("PHONE_OTP_VERIFY_MAX_PER_HOUR") || "15", 10);
  const { data: gate, error: gateError } = await supabase.rpc("pb_phone_verify_gate", {
    p_user_id: user.id,
    p_max_per_window: verifyMaxPerHour,
    p_window_seconds: 3600,
  });

  if (gateError) {
    return json({ error: gateError.message }, 500);
  }

  if (!gate?.allowed) {
    const body429: Record<string, unknown> = { error: gate?.reason || "verify_rate_limited" };
    if (typeof gate?.retry_after_seconds === "number") {
      body429.retry_after_seconds = gate.retry_after_seconds;
    }
    return json(body429, 429);
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
    // FIX M1: el intento sobre codigo expirado TAMBIEN consume presupuesto
    // del challenge (attempts+1), ademas del gate horario de arriba.
    await supabase
      .from("app_14da0f1941_phone_verifications")
      .update({ attempts: record.attempts + 1 })
      .eq("id", record.id)
      .is("verified_at", null);

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

  const valid = bcrypt.compareSync(code, record.otp_code_hash); // sync: sin Web Worker en edge runtime

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

  // FIX L2 (paso 1): marcar el challenge SOLO si sigue vigente (verified_at
  // IS NULL). Si un verify concurrente ya gano, 0 filas => no continuar.
  const { data: claimed, error: claimError } = await supabase
    .from("app_14da0f1941_phone_verifications")
    .update({ verified_at: now, attempts: record.attempts + 1 })
    .eq("id", record.id)
    .is("verified_at", null)
    .select("id");

  if (claimError) {
    return json({ error: claimError.message }, 500);
  }

  if (!claimed || claimed.length === 0) {
    // Otro verify ya reclamo este challenge (carrera). No devolver exito.
    return json({ error: "verification_already_consumed" }, 409);
  }

  // FIX L2 (paso 2): persistir el perfil SOLO si el numero vigente del
  // perfil sigue siendo el del challenge. Si un cambio de numero (send-otp)
  // gano la carrera, el perfil tiene otro phone_e164 => 0 filas => NO
  // devolver verified:true: el numero nuevo quedaria verificado sin OTP.
  const { data: updatedProfile, error: profileError } = await supabase
    .from("app_14da0f1941_profiles")
    .update({
      phone_verified: true,
      phone_verified_at: now,
      phone_verification_method: "sms_otp",
    })
    .eq("user_id", user.id)
    .eq("phone_e164", record.phone_e164)
    .select("user_id");

  if (profileError) {
    return json({ error: profileError.message }, 500);
  }

  if (!updatedProfile || updatedProfile.length === 0) {
    // Distinguir perfil inexistente (auth-only borrado entre medias) de
    // cambio de numero concurrente.
    const { data: currentProfile } = await supabase
      .from("app_14da0f1941_profiles")
      .select("phone_e164")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!currentProfile) {
      // Perfil inexistente: recrear con el numero verificado del challenge.
      const { error: upsertError } = await supabase
        .from("app_14da0f1941_profiles")
        .upsert({
          user_id: user.id,
          phone_e164: record.phone_e164,
          phone_verified: true,
          phone_verified_at: now,
          phone_verification_method: "sms_otp",
        }, { onConflict: "user_id" });
      if (upsertError) {
        return json({ error: upsertError.message }, 500);
      }
    } else {
      // Carrera con cambio de numero/reenvio: el challenge queda verificado
      // pero el numero vigente NO. Rechazar: no afirmar verified:true (L2).
      return json({ error: "verification_superseded" }, 409);
    }
  }

  await recordPhoneEvent(supabase, {
    userId: user.id,
    event: "phone_verified",
    phoneE164: record.phone_e164,
    metadata: { method: "sms_otp" },
  });

  return json({ verified: true }, 200);
});
