// _shared/sms-provider.ts
// Adapter para envio de SMS OTP.
// PB-PHONE-VERIFICATION-001
//
// IMPORTANTE: no hay fallback a console en produccion. Si SMS_PROVIDER no esta
// configurado con un proveedor real, isConfigured() devuelve false y el caller
// devuelve sms_provider_not_configured sin escribir OTPs en logs.

export interface SmsMessage {
  to: string; // E.164
  body: string;
}

export interface SmsProvider {
  send(message: SmsMessage): Promise<{ messageId?: string; provider: string }>;
  isConfigured(): boolean;
}

class NoopSmsProvider implements SmsProvider {
  isConfigured(): boolean {
    return false;
  }

  async send(): Promise<{ messageId?: string; provider: string }> {
    throw new Error("sms_provider_not_configured");
  }
}

export function createSmsProvider(): SmsProvider {
  const provider = Deno.env.get("SMS_PROVIDER");
  if (!provider) {
    return new NoopSmsProvider();
  }

  switch (provider.toLowerCase()) {
    case "twilio":
    case "vonage":
      // P1: implementar adaptador real cuando se contrate proveedor.
      return new NoopSmsProvider();
    default:
      return new NoopSmsProvider();
  }
}
