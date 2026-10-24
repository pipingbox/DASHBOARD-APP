import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleWelcomeRequest } from "./index.ts";

Deno.test("cron: clave inválida no recupera ni drena, sin JWT", async () => {
  const calls: string[] = [];
  const service = {
    rpc: (name: string) => {
      calls.push(name);
      return Promise.resolve({ data: false, error: null });
    },
  } as unknown as SupabaseClient;
  const response = await handleWelcomeRequest(new Request("https://example.test/welcome", {
    method: "POST", headers: { "X-Cron-Key": "invalid" },
  }), { service: () => service, user: () => { throw Error("should not authenticate user"); } });
  assertEquals(response.status, 401);
  assertEquals(calls, ["app_14da0f1941_verify_welcome_cron_key"]);
});

Deno.test("cron: clave válida recupera y drena aun sin pestaña abierta", async () => {
  const calls: string[] = [];
  const service = {
    rpc: (name: string) => {
      calls.push(name);
      if (name.endsWith("verify_welcome_cron_key")) return Promise.resolve({ data: true, error: null });
      if (name.endsWith("recover_missing_welcome_emails")) return Promise.resolve({ data: 1, error: null });
      return Promise.resolve({ data: [], error: null });
    },
  } as unknown as SupabaseClient;
  const response = await handleWelcomeRequest(new Request("https://example.test/welcome", {
    method: "POST", headers: { "X-Cron-Key": "valid" }, body: '{"drain":"all"}',
  }), { service: () => service, user: () => { throw Error("should not authenticate user"); } });
  assertEquals(response.status, 200);
  assertEquals((await response.json()).mode, "scheduled");
  assertEquals(calls, [
    "app_14da0f1941_verify_welcome_cron_key",
    "app_14da0f1941_recover_missing_welcome_emails",
    "app_14da0f1941_list_pending_welcome_emails",
  ]);
});

Deno.test("sin JWT ni clave cron no accede al service role", async () => {
  const response = await handleWelcomeRequest(new Request("https://example.test/welcome", { method: "POST" }), {
    service: () => { throw Error("should not create service client"); },
    user: () => { throw Error("should not authenticate user"); },
  });
  assertEquals(response.status, 401);
});

Deno.test("JWT de usuario no permite drenar a terceros", async () => {
  const previousUrl = Deno.env.get("SUPABASE_URL");
  const previousKey = Deno.env.get("SUPABASE_ANON_KEY");
  Deno.env.set("SUPABASE_URL", "https://example.test");
  Deno.env.set("SUPABASE_ANON_KEY", "test-public-key");
  try {
    const service = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { role: "worker" }, error: null }) }) }) }),
      rpc: () => { throw Error("should not drain"); },
    } as unknown as SupabaseClient;
    const user = {
      auth: { getUser: () => Promise.resolve({ data: { user: { id: "self" } }, error: null }) },
    } as unknown as SupabaseClient;
    const response = await handleWelcomeRequest(new Request("https://example.test/welcome", {
      method: "POST", headers: { Authorization: "Bearer test-jwt" }, body: '{"user_id":"other"}',
    }), { service: () => service, user: () => user });
    assertEquals(response.status, 403);
  } finally {
    if (previousUrl === undefined) Deno.env.delete("SUPABASE_URL"); else Deno.env.set("SUPABASE_URL", previousUrl);
    if (previousKey === undefined) Deno.env.delete("SUPABASE_ANON_KEY"); else Deno.env.set("SUPABASE_ANON_KEY", previousKey);
  }
});

