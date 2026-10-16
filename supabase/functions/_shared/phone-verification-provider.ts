// _shared/phone-verification-provider.ts
// Abstraccion PhoneVerificationProvider para el envio del OTP.
// PB-WHATSAPP-FOUNDATION-001
//
// La logica de negocio NO depende de Meta/Twilio/etc: solo de esta interfaz.
//
// Providers:
//   * "mock" (PHONE_VERIFICATION_PROVIDER=mock): capture provider SOLO QA.
//     Escribe el "SMS" en app_14da0f1941_phone_provider_outbox (transporte
//     simulado; el codigo viaja en el mensaje porque ES el canal, igual que
//     un SMS real). La tabla no es legible por authenticated/anon y el
//     provider esta prohibido en produccion (ver rollback del ticket).
//   * cualquier otro valor / ausencia: provider no configurado. El caller
//     devuelve sms_provider_not_configured. NUNCA hay fallback a console/logs:
//     el OTP jamas se escribe en logs.
//
// El provider real (WhatsApp Cloud API / Twilio / Vonage) es una entrega
// posterior: se anadira un case nuevo aqui sin tocar las edge functions.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface PhoneVerificationSendInput {
  /** Destinatario canonico E.164 con '+'. */
  to: string;
  /** Codigo OTP en claro: SOLO atraviesa el transporte, nunca se persiste en phone_verifications. */
  code: string;
  ttlMinutes: number;
  userId: string;
}

export interface PhoneVerificationSendResult {
  messageId?: string;
  provider: string;
}

export interface PhoneVerificationProvider {
  readonly name: string;
  isConfigured(): boolean;
  sendOtp(input: PhoneVerificationSendInput): Promise<PhoneVerificationSendResult>;
}

export const PHONE_PROVIDER_NOT_CONFIGURED = "sms_provider_not_configured";

class MockCaptureProvider implements PhoneVerificationProvider {
  readonly name = "mock";

  // deno-lint-ignore no-explicit-any
  constructor(private readonly supabase: SupabaseClient<any, any, any>) {}

  isConfigured(): boolean {
    return true;
  }

  async sendOtp(input: PhoneVerificationSendInput): Promise<PhoneVerificationSendResult> {
    const body =
      `Tu codigo de verificacion de PipingBox es: ${input.code}. Valido por ${input.ttlMinutes} minutos.`;
    const { error } = await this.supabase
      .from("app_14da0f1941_phone_provider_outbox")
      .insert({
        user_id: input.userId,
        to_phone: input.to,
        body,
        captured_code: input.code,
        provider: this.name,
      });
    if (error) {
      throw new Error(`mock_capture_failed: ${error.message}`);
    }
    return { provider: this.name };
  }
}

class UnconfiguredProvider implements PhoneVerificationProvider {
  readonly name = "unconfigured";

  isConfigured(): boolean {
    return false;
  }

  async sendOtp(): Promise<PhoneVerificationSendResult> {
    throw new Error(PHONE_PROVIDER_NOT_CONFIGURED);
  }
}

// deno-lint-ignore no-explicit-any
export async function createPhoneVerificationProvider(
  supabase: SupabaseClient<any, any, any>,
): Promise<PhoneVerificationProvider> {
  let selected = (Deno.env.get("PHONE_VERIFICATION_PROVIDER") || "").toLowerCase();

  if (!selected) {
    // Fallback auditable en BBDD (tabla service_role-only, 1 fila). Se usa
    // cuando la plataforma no permite fijar secrets; la fila 'mock' SOLO se
    // siembra en QA. En produccion la tabla queda vacia => unconfigured.
    try {
      const { data } = await supabase
        .from("app_14da0f1941_phone_provider_config")
        .select("provider")
        .eq("id", true)
        .maybeSingle();
      selected = (data?.provider || "").toLowerCase();
    } catch {
      selected = "";
    }
  }

  if (selected === "mock") {
    return new MockCaptureProvider(supabase);
  }
  // "twilio" | "vonage" | "whatsapp-cloud": entrega futura (ticket provider real).
  return new UnconfiguredProvider();
}
