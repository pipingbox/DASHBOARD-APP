// _shared/sms-provider.ts
// Adapter para envio de SMS OTP.
// PB-PHONE-VERIFICATION-001

export interface SmsMessage {
  to: string; // E.164
  body: string;
}

export interface SmsProvider {
  send(message: SmsMessage): Promise<{ messageId?: string; provider: string }>;
  isConfigured(): boolean;
}

class ConsoleSmsProvider implements SmsProvider {
  isConfigured(): boolean {
    return true;
  }

  async send(message: SmsMessage): Promise<{ messageId?: string; provider: string }> {
    console.log(`[SMS CONSOLE] to=${message.to} body=${message.body}`);
    return { messageId: "console", provider: "console" };
  }
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
  const provider = Deno.env.get("SMS_PROVIDER") || "console";
  if (provider === "console") {
    return new ConsoleSmsProvider();
  }
  // P1: Twilio / Vonage
  return new NoopSmsProvider();
}
