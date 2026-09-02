// _shared/whatsapp-provider.ts
// Adapter para envio de WhatsApp Business Platform.
// PB-MATCHING-NOTIFICATIONS-001 / PB-WHATSAPP-BUSINESS-001

export interface WhatsAppMessage {
  to: string; // E.164
  body: string;
}

export interface WhatsAppProvider {
  send(message: WhatsAppMessage): Promise<{ messageId?: string; provider: string }>;
  isConfigured(): boolean;
}

class NoopWhatsAppProvider implements WhatsAppProvider {
  isConfigured(): boolean {
    return false;
  }

  async send(): Promise<{ messageId?: string; provider: string }> {
    throw new Error("whatsapp_provider_not_configured");
  }
}

export function createWhatsAppProvider(): WhatsAppProvider {
  const provider = Deno.env.get("WHATSAPP_PROVIDER");
  if (!provider) {
    return new NoopWhatsAppProvider();
  }

  // P1: implementar Twilio / 360dialog / Vonage segun provider.
  return new NoopWhatsAppProvider();
}
