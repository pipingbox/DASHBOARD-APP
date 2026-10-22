import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createServiceClient } from "../_shared/application-activation.ts";
import { drainMarketplaceReconciliationEmails } from "../_shared/marketplace-reconciliation-email.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (Deno.env.get("RECONCILIATION_EMAILS_ENABLED") !== "true") return json({ error: "not_enabled" }, 503);
  const bearer = req.headers.get("Authorization");
  if (!bearer?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) return json({ error: "missing_env" }, 500);

  const callerClient = createClient(url, key, {
    global: { headers: { Authorization: bearer } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "unauthorized" }, 401);
  const admin = createServiceClient();
  const { data: profile, error: profileError } = await admin
    .from("app_14da0f1941_profiles").select("role").eq("user_id", userData.user.id).maybeSingle();
  if (profileError || profile?.role !== "admin") return json({ error: "forbidden" }, 403);

  let body: { batch_id?: string; limit?: number };
  try { body = await req.json(); } catch { return json({ error: "invalid_body" }, 400); }
  if (!body.batch_id || !/^[a-zA-Z0-9_-]{1,80}$/.test(body.batch_id)) return json({ error: "invalid_batch" }, 400);
  try {
    const results = await drainMarketplaceReconciliationEmails({ supabase: admin }, body.batch_id, body.limit);
    return json({ processed: results.length, sent: results.filter((result) => result.outcome === "sent").length,
      results: results.map((result) => ({ outcome: result.outcome })) });
  } catch (error) {
    console.error("[marketplace-reconciliation-email] failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "delivery_failed" }, 500);
  }
});
