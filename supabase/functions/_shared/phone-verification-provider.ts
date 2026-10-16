// _shared/phone-verification-provider.ts
// Abstraccion PhoneVerificationProvider para el envio del OTP.
// PB-WHATSAPP-FOUNDATION-001
//
// La logica de negocio NO depende de Meta/Twilio/etc: solo de esta interfaz.
//
// Providers:
//   * "mock" (capture provider SOLO QA). Escribe el "SMS" en
//     app_14da0f1941_phone_provider_outbox (transporte simulado; el codigo
//     viaja en el mensaje porque ES el canal, igual que un SMS real). La
//     tabla no es legible por authenticated/anon.
//     Barrera tecnica M2 (fail-safe): activarlo exige LAS TRES condiciones:
//       1) provider seleccionado = 'mock' (env o fila de config);
//       2) config.mock_enabled = true (una fila provider='mock' NO basta);
//       3) project ref actual en MOCK_ALLOWED_REFS (solo QA).
//     En produccion el ref nunca coincide => mock imposible aunque la fila
//     exista. Cualquier duda => unconfigured (503 controlado, nunca logs).
//   * cualquier otro valor / ausencia: provider no configurado. El caller
//     devuelve sms_provider_not_configured. NUNCA hay fallback a console/logs:
//     el OTP jamas se escribe en logs.
//
// El provider real (WhatsApp Cloud API / Twilio / Vonage) es una entrega
// posterior: se anadira un case nuevo aqui sin tocar las edge functions.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isMockProviderAllowed,
  projectRefFromSupabaseUrl,
} from "./phone-mock-guard.ts";

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

// Project refs donde el mock puede existir (QA) y decision fail-safe:
// ver _shared/phone-mock-guard.ts (modulo puro, testeado unitariamente).

// deno-lint-ignore no-explicit-any
export async function createPhoneVerificationProvider(
  supabase: SupabaseClient<any, any, any>,
): Promise<PhoneVerificationProvider> {
  let selected = (Deno.env.get("PHONE_VERIFICATION_PROVIDER") || "").toLowerCase();
  let mockEnabled = false;

  // Config auditable en BBDD (tabla service_role-only, 1 fila). M2: una fila
  // provider='mock' YA NO BASTA para activar el mock; se exige ademas
  // mock_enabled=true (columna con default false) y el project ref permitido.
  try {
    const { data } = await supabase
      .from("app_14da0f1941_phone_provider_config")
      .select("provider, mock_enabled")
      .eq("id", true)
      .maybeSingle();
    mockEnabled = data?.mock_enabled === true;
    if (!selected) {
      selected = (data?.provider || "").toLowerCase();
    }
  } catch {
    mockEnabled = false;
  }

  if (selected === "mock") {
    // Barrera 2/3 (M2): mock_enabled explicito + ref en allowlist.
    // Cualquier fallo => UnconfiguredProvider (503 controlado, nunca logs).
    if (!isMockProviderAllowed(mockEnabled, projectRefFromSupabaseUrl(Deno.env.get("SUPABASE_URL") || ""))) {
      return new UnconfiguredProvider();
    }
    return new MockCaptureProvider(supabase);
  }
  // "twilio" | "vonage" | "whatsapp-cloud": entrega futura (ticket provider real).
  return new UnconfiguredProvider();
}
