import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { EmailProvider, EmailSendResult } from "./email-provider.ts";
import { drainWelcomeEmail } from "./welcome-email.ts";

function harness(send: () => Promise<EmailSendResult>, opts: { marked?: boolean; finalized?: boolean } = {}) {
  const calls: string[] = [];
  const supabase = {
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push(`${name}:${String(args?.p_outcome ?? args?.p_phase ?? "")}`);
      if (name.endsWith("claim_welcome_email")) return Promise.resolve({ data: [{ claimed: true, claim_id: "claim", attempts: 1 }], error: null });
      if (name.endsWith("mark_welcome_email_phase")) return Promise.resolve({ data: [{ marked: opts.marked ?? true }], error: null });
      if (name.endsWith("finalize_welcome_email")) return Promise.resolve({ data: [{ finalized: opts.finalized ?? true }], error: null });
      throw Error(name);
    },
    auth: { admin: { getUserById: () => Promise.resolve({ data: { user: {
      email: "example@example.test", email_confirmed_at: "2026-10-17T00:00:00Z", user_metadata: { lang: "es", account_type: "company" },
    } }, error: null }) } },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { account_type: "company" }, error: null }) }) }) }),
  } as unknown as SupabaseClient;
  const provider: EmailProvider = { isConfigured: () => true, send: () => { calls.push("send"); return send(); } };
  return { supabase, provider, calls };
}

Deno.test("no llama proveedor si mark devuelve marked=false", async () => {
  const { supabase, provider, calls } = harness(async () => ({ accepted: 1, provider: "mock" }), { marked: false });
  const result = await drainWelcomeEmail({ supabase, emailProvider: provider }, "user");
  assertEquals(result.outcome, "failed");
  assertEquals(calls.includes("send"), false);
  assertEquals(calls.some((call) => call.endsWith(":failed")), true);
});

Deno.test("SMTP incierto queda ambiguous y nunca failed reintentable", async () => {
  const { supabase, provider, calls } = harness(async () => { throw Error("timeout to example@example.test"); });
  const result = await drainWelcomeEmail({ supabase, emailProvider: provider }, "user");
  assertEquals(result.outcome, "ambiguous");
  assertEquals(result.reason, "smtp_timeout");
  assertEquals(calls.some((call) => call.endsWith(":ambiguous")), true);
});

Deno.test("sólo no aceptación demostrada es reintentable", async () => {
  const { supabase, provider, calls } = harness(async () => ({ accepted: 0, rejected: 1, provider: "mock" }));
  assertEquals((await drainWelcomeEmail({ supabase, emailProvider: provider }, "user")).outcome, "failed");
  assertEquals(calls.some((call) => call.endsWith(":failed")), true);
});

Deno.test("resultado aceptado sin finalize confirmado no informa sent", async () => {
  const { supabase, provider } = harness(async () => ({ accepted: 1, rejected: 0, provider: "mock" }), { finalized: false });
  assertEquals((await drainWelcomeEmail({ supabase, emailProvider: provider }, "user")).outcome, "ambiguous");
});

Deno.test("sin respuesta explícita de aceptación no informa sent", async () => {
  const { supabase, provider } = harness(async () => ({ provider: "mock" }));
  assertEquals((await drainWelcomeEmail({ supabase, emailProvider: provider }, "user")).outcome, "ambiguous");
});
