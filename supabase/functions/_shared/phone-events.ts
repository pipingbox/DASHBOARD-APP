// _shared/phone-events.ts
// Audit trail de eventos de telefono/consentimiento.
// PB-WHATSAPP-FOUNDATION-001
//
// Reglas:
//   * NUNCA se registra el codigo OTP.
//   * NUNCA el numero completo: solo phone_masked ("+34******678").
//   * NUNCA secretos de provider.
//   * Fallo de auditoria NO rompe el flujo de negocio (se loguea un warning
//     sin datos), pero queda constancia del evento siempre que sea posible.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { maskE164 } from "./phone.ts";

export const PHONE_EVENT_TYPES = [
  "phone_added",
  "phone_changed",
  "verification_started",
  "verification_failed",
  "phone_verified",
  "whatsapp_opt_in_changed",
] as const;

export type PhoneEventType = (typeof PHONE_EVENT_TYPES)[number];

export interface PhoneEventInput {
  userId: string;
  event: PhoneEventType;
  /** E.164 completo: se enmascara antes de persistir. */
  phoneE164?: string | null;
  /** Solo datos no sensibles (reason, scope, valores booleanos). */
  metadata?: Record<string, unknown>;
}

// deno-lint-ignore no-explicit-any
export async function recordPhoneEvent(
  supabase: SupabaseClient<any, any, any>,
  input: PhoneEventInput,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("app_14da0f1941_phone_events")
      .insert({
        user_id: input.userId,
        event: input.event,
        phone_masked: input.phoneE164 ? maskE164(input.phoneE164) : null,
        metadata: input.metadata ?? {},
      });
    if (error) {
      console.warn(`[phone-events] audit insert failed for event=${input.event}: ${error.message}`);
    }
  } catch (err) {
    console.warn(`[phone-events] audit insert threw for event=${input.event}`);
  }
}
