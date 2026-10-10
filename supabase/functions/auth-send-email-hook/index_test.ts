// PB-I18N-EMAIL-001 — Tests del Send Email Auth Hook (sin red, sin envíos).
// Ejecutar: deno test --allow-env supabase/functions/auth-send-email-hook/
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { signWebhook, parseHookSecret, verifyWebhook, WebhookVerificationError } from "../_shared/standard-webhooks.ts";
import { redactSensitive, type EmailMessage, type EmailProvider, type EmailSendResult } from "../_shared/email-provider.ts";
import { SUPPORTED_EMAIL_LANGUAGES, LOCALES } from "../_shared/email-i18n/mod.ts";
import { buildVerifyUrl, handleRequest, planEmails, type HookPayload } from "./index.ts";

// Secreto de prueba (32 bytes en base64), formato de la UI de Supabase.
const SECRET = "v1,whsec_" + btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i + 1)));
const AUTH_URL = "https://auth.pipingbox.com";
const OPTS = { authPublicUrl: AUTH_URL, otpExpSeconds: 3600 };

function payload(type: string, lang?: string, extra: Partial<HookPayload["email_data"]> = {}, user: Partial<HookPayload["user"]> = {}): HookPayload {
  return {
    user: {
      id: "00000000-0000-0000-0000-000000000001",
      email: "worker@example.test",
      user_metadata: lang ? { lang, full_name: "Test" } : { full_name: "Test" },
      ...user,
    },
    email_data: {
      token: "123456",
      token_hash: "hash_abc",
      redirect_to: "https://pipingbox.com/auth/callback?lng=es&flow=confirmation",
      email_action_type: type,
      site_url: "https://pipingbox.com",
      ...extra,
    },
  };
}

class FakeProvider implements EmailProvider {
  sent: EmailMessage[] = [];
  fail = false;
  isConfigured() { return true; }
  async send(m: EmailMessage): Promise<EmailSendResult> {
    if (this.fail) throw new Error("boom");
    this.sent.push(m);
    return { provider: "fake", messageId: `fake-${this.sent.length}` };
  }
}

async function signedRequest(body: unknown, secret = SECRET, tsOffset = 0): Promise<Request> {
  const raw = JSON.stringify(body);
  const id = "msg_test";
  const ts = String(Math.floor(Date.now() / 1000) + tsOffset);
  const sig = await signWebhook(parseHookSecret(secret), id, ts, raw);
  return new Request("http://localhost/auth-send-email-hook", {
    method: "POST",
    headers: { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": sig },
    body: raw,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// URL de verificación
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("buildVerifyUrl replica el formato nativo de GoTrue", () => {
  const u = buildVerifyUrl(AUTH_URL, "tok", "signup", "https://pipingbox.com/cb?lng=ro&flow=confirmation");
  assertEquals(u, "https://auth.pipingbox.com/auth/v1/verify?token=tok&type=signup&redirect_to=https%3A%2F%2Fpipingbox.com%2Fcb%3Flng%3Dro%26flow%3Dconfirmation");
  // Base con barra final y sin ella producen lo mismo
  assertEquals(buildVerifyUrl(AUTH_URL + "/", "t", "recovery", ""), "https://auth.pipingbox.com/auth/v1/verify?token=t&type=recovery");
});

// ─────────────────────────────────────────────────────────────────────────────
// planEmails
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("planEmails: signup/recovery/magiclink/invite en 11 idiomas, asunto localizado", () => {
  const map: Record<string, keyof typeof LOCALES.en.templates> = { signup: "confirmation", recovery: "recovery", magiclink: "magic_link", invite: "invite" };
  for (const lang of SUPPORTED_EMAIL_LANGUAGES) {
    for (const [type, tpl] of Object.entries(map)) {
      const [p, ...rest] = planEmails(payload(type, lang), OPTS);
      assertEquals(rest.length, 0);
      assertEquals(p.to, "worker@example.test");
      assertEquals(p.lang, { lang, source: "user_metadata" });
      assertEquals(p.rendered.subject, LOCALES[lang].templates[tpl].subject.replace("{email}", "worker@example.test"));
      assertStringIncludes(p.rendered.html, `type=${type}`);
      assertStringIncludes(p.rendered.html, "token=hash_abc");
      assert(!p.rendered.html.includes("123456"), "OTP en claro en correo de enlace");
    }
  }
});

Deno.test("planEmails: sin lang en user_metadata → inglés (sin inferencia)", () => {
  const [p] = planEmails(payload("signup", undefined, {}, { user_metadata: { country: "RO" } }), OPTS);
  assertEquals(p.lang, { lang: "en", source: "fallback" });
  assertEquals(p.rendered.subject, LOCALES.en.templates.confirmation.subject);
});

Deno.test("planEmails: lang inválido → inglés", () => {
  const [p] = planEmails(payload("recovery", "klingon"), OPTS);
  assertEquals(p.lang.lang, "en");
});

Deno.test("planEmails: email_change seguro genera dos correos con tokens cruzados", () => {
  const out = planEmails(
    payload("email_change", "es", { token_hash_new: "hash_current" }, { new_email: "new@example.test" }),
    OPTS,
  );
  assertEquals(out.length, 2);
  const current = out.find((p) => p.to === "worker@example.test")!;
  const next = out.find((p) => p.to === "new@example.test")!;
  assertStringIncludes(current.rendered.html, "token=hash_current");
  assertStringIncludes(next.rendered.html, "token=hash_abc");
  assertEquals(current.rendered.template, "email_change_current");
  assertEquals(next.rendered.template, "email_change_new");
  assertStringIncludes(current.rendered.html, "new@example.test");
});

Deno.test("planEmails: email_change simple genera solo el correo a la nueva dirección", () => {
  const out = planEmails(payload("email_change", "es", {}, { new_email: "new@example.test" }), OPTS);
  assertEquals(out.length, 1);
  assertEquals(out[0].to, "new@example.test");
});

Deno.test("planEmails: reauthentication incluye el código y no enlace", () => {
  const [p] = planEmails(payload("reauthentication", "de"), OPTS);
  assertStringIncludes(p.rendered.html, "123456");
  assert(!p.rendered.html.includes("/auth/v1/verify"));
  assertEquals(p.rendered.subject, LOCALES.de.templates.reauthentication.subject);
});

Deno.test("planEmails: notificaciones de seguridad (7 tipos) en el idioma del usuario", () => {
  const types = [
    "password_changed_notification", "email_changed_notification", "phone_changed_notification",
    "identity_linked_notification", "identity_unlinked_notification",
    "mfa_factor_enrolled_notification", "mfa_factor_unenrolled_notification",
  ] as const;
  for (const t of types) {
    const [p] = planEmails(payload(t, "pl", { old_email: "old@example.test", old_phone: "+1", provider: "google", factor_type: "totp" }, { phone: "+2" }), OPTS);
    assertEquals(p.rendered.template, t);
    assertEquals(p.rendered.lang, "pl");
    assertEquals(p.rendered.missing, [], `${t}: ${p.rendered.missing}`);
    assertStringIncludes(p.rendered.html, "support@pipingbox.com");
  }
});

Deno.test("planEmails: tipo desconocido lanza error (GoTrue no envía nada)", () => {
  let threw = false;
  try { planEmails(payload("unknown_type"), OPTS); } catch { threw = true; }
  assert(threw);
});

// ─────────────────────────────────────────────────────────────────────────────
// Firma Standard Webhooks
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("verifyWebhook acepta firma válida y rechaza manipulaciones", async () => {
  const body = JSON.stringify({ a: 1 });
  const id = "x", ts = String(Math.floor(Date.now() / 1000));
  const sig = await signWebhook(parseHookSecret(SECRET), id, ts, body);
  const ok = await verifyWebhook(SECRET, body, { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": sig });
  assertEquals(ok, { a: 1 });
  // Firma de otro secreto
  const other = "whsec_" + btoa("another-secret-another-secret-00");
  const bad = await signWebhook(parseHookSecret(other), id, ts, body);
  await assertRejectsWith(() => verifyWebhook(SECRET, body, { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": bad }), "signature_mismatch");
  // Payload alterado
  await assertRejectsWith(() => verifyWebhook(SECRET, body + " ", { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": sig }), "signature_mismatch");
  // Timestamp fuera de ventana
  const oldTs = String(Number(ts) - 3600);
  const oldSig = await signWebhook(parseHookSecret(SECRET), id, oldTs, body);
  await assertRejectsWith(() => verifyWebhook(SECRET, body, { "webhook-id": id, "webhook-timestamp": oldTs, "webhook-signature": oldSig }), "timestamp_out_of_tolerance");
  // Cabeceras ausentes
  await assertRejectsWith(() => verifyWebhook(SECRET, body, {}), "missing_headers");
});

async function assertRejectsWith(fn: () => Promise<unknown>, msg: string) {
  try { await fn(); } catch (e) { assert(e instanceof WebhookVerificationError, "tipo de error"); assertEquals((e as Error).message, msg); return; }
  throw new Error(`no lanzó ${msg}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// handleRequest end-to-end (proveedor falso)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("handleRequest: firma inválida → 401 y nada enviado", async () => {
  const provider = new FakeProvider();
  const req = await signedRequest(payload("signup", "es"), "whsec_" + btoa("wrong-secret-wrong-secret-wrong-0"));
  const res = await handleRequest(req, { provider, hookSecret: SECRET, opts: OPTS });
  assertEquals(res.status, 401);
  assertEquals(provider.sent.length, 0);
});

Deno.test("handleRequest: método no POST → 405", async () => {
  const res = await handleRequest(new Request("http://x", { method: "GET" }), { provider: new FakeProvider(), hookSecret: SECRET, opts: OPTS });
  assertEquals(res.status, 405);
});

Deno.test("handleRequest: signup en 11 idiomas → 200, un envío, asunto y <html lang> correctos", async () => {
  for (const lang of SUPPORTED_EMAIL_LANGUAGES) {
    const provider = new FakeProvider();
    const res = await handleRequest(await signedRequest(payload("signup", lang)), { provider, hookSecret: SECRET, opts: OPTS });
    assertEquals(res.status, 200, `${lang}: status`);
    assertEquals(await res.json(), {});
    assertEquals(provider.sent.length, 1, `${lang}: envíos`);
    const m = provider.sent[0];
    assertEquals(m.subject, LOCALES[lang].templates.confirmation.subject);
    assertStringIncludes(m.html!, `<html lang="${lang}"`);
    assertStringIncludes(m.html!, "https://auth.pipingbox.com/auth/v1/verify?token=hash_abc&amp;type=signup&amp;redirect_to=");
    assertStringIncludes(m.text!, "https://auth.pipingbox.com/auth/v1/verify?token=hash_abc&type=signup&redirect_to=");
    assertEquals(m.capture?.source, "auth-send-email-hook");
    assertEquals(m.capture?.lang, lang);
    assertEquals(m.capture?.langSource, "user_metadata");
    assert(m.text && m.text.length > 100, "text/plain presente");
  }
});

Deno.test("handleRequest: fallo del proveedor → 500 (GoTrue no hace fallback silencioso)", async () => {
  const provider = new FakeProvider();
  provider.fail = true;
  const res = await handleRequest(await signedRequest(payload("recovery", "fr")), { provider, hookSecret: SECRET, opts: OPTS });
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error.message, "email_send_failed");
});

Deno.test("handleRequest: payload sin email → 400", async () => {
  const provider = new FakeProvider();
  const p = payload("signup", "es");
  p.user.email = "";
  const res = await handleRequest(await signedRequest(p), { provider, hookSecret: SECRET, opts: OPTS });
  assertEquals(res.status, 400);
  assertEquals(provider.sent.length, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Redacción para captura QA
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("redactSensitive elimina tokens y OTP antes de persistir", () => {
  const html = `<a href="https://auth.pipingbox.com/auth/v1/verify?token=SECRET_HASH&type=signup&redirect_to=x">go</a> code 123456`;
  const out = redactSensitive(html);
  assert(!out.includes("SECRET_HASH"));
  assert(!out.includes("123456"));
  assertStringIncludes(out, "token=[REDACTED]&type=signup");
  assertStringIncludes(out, "[OTP]");
});
