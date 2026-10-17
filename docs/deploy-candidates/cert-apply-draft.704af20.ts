// supabase/functions/cert-apply-draft/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
function log(fields) {
  const allowed = [
    "fn",
    "event",
    "status",
    "draft_id",
    "correlation_id",
    "fields_confirmed_count",
    "conflicts_count",
    "linked_existing",
    "protected_count"
  ];
  const safe = Object.fromEntries(
    allowed.filter((k) => fields[k] !== void 0).map((k) => [k, fields[k]])
  );
  console.log(JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), ...safe }));
}
Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) return json({ error: "missing_env" }, 500);
  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const { data: { user }, error: userError } = await serviceClient.auth.getUser(
    authHeader.slice("Bearer ".length)
  );
  if (userError || !user) return json({ error: "unauthorized" }, 401);
  const userId = user.id;
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!body?.draft_id) return json({ error: "invalid_request", reason: "draft_id required" }, 400);
  const { data, error } = await serviceClient.rpc("pb_cert_apply_draft", {
    p_draft_id: body.draft_id,
    p_user_id: userId,
    p_fields: body.fields ?? [],
    p_target_certification_id: body.target_certification_id ?? null,
    p_reject_linked: body.reject_linked === true
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("draft_not_found")) {
      return json({ error: "not_found" }, 404);
    }
    if (msg.includes("target_not_found")) {
      return json({ error: "not_found", reason: "target certification does not exist" }, 404);
    }
    if (msg.includes("target_not_owned")) {
      return json({ error: "forbidden" }, 403);
    }
    if (msg.includes("invalid_draft_state")) {
      return json({ error: "invalid_state", reason: msg.slice(0, 120) }, 409);
    }
    log({ fn: "cert-apply-draft", event: "rpc_error", draft_id: body.draft_id, correlation_id: correlationId });
    return json({ error: "apply_failed" }, 500);
  }
  const result = data ?? {};
  switch (result.status) {
    case "confirmed":
      log({
        fn: "cert-apply-draft",
        event: "confirmed",
        draft_id: body.draft_id,
        fields_confirmed_count: result.fields_confirmed_count,
        linked_existing: result.linked_existing,
        correlation_id: correlationId
      });
      return json({
        status: "confirmed",
        draft_id: body.draft_id,
        certification_id: result.certification_id,
        linked_existing: result.linked_existing,
        fields_confirmed_count: result.fields_confirmed_count
      });
    case "already_confirmed":
      log({ fn: "cert-apply-draft", event: "already_confirmed", draft_id: body.draft_id, correlation_id: correlationId });
      return json({ status: "already_confirmed", draft_id: body.draft_id });
    case "conflict":
      log({
        fn: "cert-apply-draft",
        event: "conflict",
        draft_id: body.draft_id,
        conflicts_count: result.conflicts?.length,
        correlation_id: correlationId
      });
      return json({ error: "conflict", conflicts: result.conflicts ?? [] }, 409);
    case "verified_cert_protected":
      log({
        fn: "cert-apply-draft",
        event: "verified_cert_protected",
        draft_id: body.draft_id,
        protected_count: result.protected_fields?.length,
        correlation_id: correlationId
      });
      return json({
        error: "verified_cert_protected",
        certification_id: result.certification_id,
        protected_fields: result.protected_fields ?? []
      }, 409);
    case "error":
      return json({ error: "invalid_request", reason: result.reason ?? "invalid" }, 400);
    default:
      log({ fn: "cert-apply-draft", event: "unexpected_status", draft_id: body.draft_id, correlation_id: correlationId });
      return json({ error: "apply_failed" }, 500);
  }
});
