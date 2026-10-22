// _shared/email-provider_test.ts
// PB-I18N-EMAIL-001 — Fail-safe de EMAIL_DELIVERY_MODE (revisión del PO,
// 2026-10-11): un valor ausente debe seguir cayendo en `smtp` (comportamiento
// histórico, sin cambios para funciones ya desplegadas); un valor PRESENTE
// pero inválido (typo) debe fallar de forma explícita en vez de usarse en
// silencio como `smtp` real.
//
// Ejecutar: deno test --allow-read --allow-env supabase/functions/_shared/
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { redactSensitive, resolveDeliveryMode } from "./email-provider.ts";

function withEnv(value: string | undefined, fn: () => void) {
  const prev = Deno.env.get("EMAIL_DELIVERY_MODE");
  try {
    if (value === undefined) Deno.env.delete("EMAIL_DELIVERY_MODE");
    else Deno.env.set("EMAIL_DELIVERY_MODE", value);
    fn();
  } finally {
    if (prev === undefined) Deno.env.delete("EMAIL_DELIVERY_MODE");
    else Deno.env.set("EMAIL_DELIVERY_MODE", prev);
  }
}

Deno.test("resolveDeliveryMode: sin configurar → smtp (comportamiento histórico, sin cambios)", () => {
  withEnv(undefined, () => assertEquals(resolveDeliveryMode(), "smtp"));
  withEnv("", () => assertEquals(resolveDeliveryMode(), "smtp"));
});

Deno.test("resolveDeliveryMode: valores válidos (case/espacios insensibles)", () => {
  withEnv("capture", () => assertEquals(resolveDeliveryMode(), "capture"));
  withEnv(" CAPTURE ", () => assertEquals(resolveDeliveryMode(), "capture"));
  withEnv("resend_api", () => assertEquals(resolveDeliveryMode(), "resend_api"));
  withEnv("SMTP", () => assertEquals(resolveDeliveryMode(), "smtp"));
});

Deno.test("resolveDeliveryMode: valor presente pero inválido lanza error (nunca smtp silencioso)", () => {
  withEnv("captrue", () => assertThrows(() => resolveDeliveryMode(), Error, "email_delivery_mode_invalid"));
  withEnv("Capture-QA", () => assertThrows(() => resolveDeliveryMode(), Error, "email_delivery_mode_invalid"));
  withEnv("prod", () => assertThrows(() => resolveDeliveryMode(), Error, "email_delivery_mode_invalid"));
});

Deno.test("redactSensitive: nunca devuelve el email ni el OTP crudos", () => {
  const out = redactSensitive("hola worker@example.com, tu código es 12345678");
  assert(!out.includes("worker@example.com"));
  assert(!out.includes("12345678"));
});
