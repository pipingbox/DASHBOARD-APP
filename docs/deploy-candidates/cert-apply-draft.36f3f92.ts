// supabase/functions/cert-apply-draft/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
var DRAFTS_TABLE = "app_cert_extraction_drafts";
var EVENTS_TABLE = "app_cert_extraction_events";
var CERTS_TABLE = "app_worker_certifications";
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
    "linked_existing"
  ];
  const safe = Object.fromEntries(
    allowed.filter((k) => fields[k] !== void 0).map((k) => [k, fields[k]])
  );
  console.log(JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), ...safe }));
}
var FIELD_TO_COLUMN = {
  certification_name: "certification_name",
  issuing_organization: "issuing_organization",
  credential_id: "credential_id",
  issue_date: "issue_date",
  expiry_date: "expiry_date"
};
var DATE_FIELDS = /* @__PURE__ */ new Set(["issue_date", "expiry_date"]);
var MAX_TEXT = 160;
function isEmptyValue(v) {
  return v === null || v === void 0 || v.trim() === "";
}
function toDbDate(v) {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
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
  const { data: { user }, error: userError } = await serviceClient.auth.getUser(authHeader.slice("Bearer ".length));
  if (userError || !user) return json({ error: "unauthorized" }, 401);
  const userId = user.id;
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!body?.draft_id) return json({ error: "invalid_request", reason: "draft_id required" }, 400);
  const { data: draft, error: draftError } = await serviceClient.from(DRAFTS_TABLE).select("id, user_id, extraction_status, extracted_fields, storage_bucket, storage_path, linked_certification_id, created_at").eq("id", body.draft_id).eq("user_id", userId).maybeSingle();
  if (draftError) return json({ error: "draft_read_failed" }, 500);
  if (!draft) return json({ error: "not_found" }, 404);
  if (draft.extraction_status === "review_confirmed") {
    return json({ status: "already_confirmed", draft_id: draft.id });
  }
  if (draft.extraction_status !== "pending_review") {
    return json({ error: "invalid_state", reason: `draft is ${draft.extraction_status}` }, 409);
  }
  let targetId = null;
  if (typeof body.target_certification_id === "string" && body.target_certification_id) {
    targetId = body.target_certification_id;
  } else if (draft.linked_certification_id && body.reject_linked !== true) {
    targetId = draft.linked_certification_id;
  }
  let existing = null;
  if (targetId) {
    const { data: cert, error: certError } = await serviceClient.from(CERTS_TABLE).select("id, user_id, certification_name, issuing_organization, credential_id, issue_date, expiry_date, storage_bucket, storage_path").eq("id", targetId).maybeSingle();
    if (certError) return json({ error: "cert_read_failed" }, 500);
    if (!cert) return json({ error: "not_found", reason: "target certification does not exist" }, 404);
    if (cert.user_id !== userId) return json({ error: "forbidden" }, 403);
    existing = cert;
  }
  const draftFields = new Map(draft.extracted_fields.map((f) => [f.field, f]));
  const decisions = new Map((body.fields ?? []).map((d) => [d.field, d]));
  const patch = {};
  const conflicts = [];
  let fieldsConfirmed = 0;
  for (const [fieldName, column] of Object.entries(FIELD_TO_COLUMN)) {
    const decision = decisions.get(fieldName);
    if (!decision) continue;
    const draftField = draftFields.get(fieldName);
    if (!draftField && decision.action !== "edit") continue;
    let value;
    if (decision.action === "edit") {
      value = typeof decision.value === "string" ? decision.value.trim() : null;
    } else {
      value = draftField?.value?.trim() ?? null;
    }
    if (!value) continue;
    if (DATE_FIELDS.has(fieldName)) {
      const dbDate = toDbDate(value);
      if (!dbDate) continue;
      value = dbDate;
    } else {
      value = value.slice(0, MAX_TEXT);
    }
    if (existing) {
      const current = existing[column];
      if (isEmptyValue(current)) {
        patch[column] = value;
        fieldsConfirmed++;
      } else if (current !== value) {
        if (decision.overwrite === true) {
          patch[column] = value;
          fieldsConfirmed++;
        } else {
          conflicts.push({ field: fieldName, existing_value: current, proposed_value: value });
        }
      }
    } else {
      patch[column] = value;
      fieldsConfirmed++;
    }
  }
  if (conflicts.length > 0) {
    log({ fn: "cert-apply-draft", event: "conflict", draft_id: draft.id, conflicts_count: conflicts.length, correlation_id: correlationId });
    return json({ error: "conflict", conflicts }, 409);
  }
  if (!existing && isEmptyValue(patch["certification_name"] ?? null)) {
    return json({ error: "invalid_request", reason: "certification_name is required for a new certification" }, 400);
  }
  let certificationId;
  if (existing) {
    const updatePayload = { ...patch, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
    if (isEmptyValue(existing.storage_path)) {
      updatePayload.storage_bucket = draft.storage_bucket;
      updatePayload.storage_path = draft.storage_path;
    }
    const { error: updateError } = await serviceClient.from(CERTS_TABLE).update(updatePayload).eq("id", existing.id).eq("user_id", userId);
    if (updateError) {
      log({ fn: "cert-apply-draft", event: "cert_update_failed", draft_id: draft.id, correlation_id: correlationId });
      return json({ error: "cert_update_failed" }, 500);
    }
    certificationId = existing.id;
  } else {
    const insertPayload = {
      user_id: userId,
      certification_name: patch["certification_name"],
      issuing_organization: patch["issuing_organization"] ?? null,
      credential_id: patch["credential_id"] ?? null,
      issue_date: patch["issue_date"] ?? null,
      expiry_date: patch["expiry_date"] ?? null,
      expiration_date: patch["expiry_date"] ?? null,
      storage_bucket: draft.storage_bucket,
      storage_path: draft.storage_path,
      is_verified: false,
      verified_at: null,
      is_visible: true,
      visible_to_companies: true
    };
    const { data: inserted, error: insertError } = await serviceClient.from(CERTS_TABLE).insert(insertPayload).select("id").single();
    if (insertError || !inserted) {
      log({ fn: "cert-apply-draft", event: "cert_insert_failed", draft_id: draft.id, correlation_id: correlationId });
      return json({ error: "cert_insert_failed" }, 500);
    }
    certificationId = inserted.id;
  }
  const { error: draftUpdateError } = await serviceClient.from(DRAFTS_TABLE).update({
    extraction_status: "review_confirmed",
    reviewed_at: (/* @__PURE__ */ new Date()).toISOString(),
    updated_at: (/* @__PURE__ */ new Date()).toISOString(),
    linked_certification_id: certificationId
  }).eq("id", draft.id).eq("user_id", userId);
  if (draftUpdateError) {
    log({ fn: "cert-apply-draft", event: "draft_close_failed", draft_id: draft.id, correlation_id: correlationId });
    return json({ error: "draft_close_failed" }, 500);
  }
  try {
    await serviceClient.from(EVENTS_TABLE).insert({
      user_id: userId,
      draft_id: draft.id,
      event_type: "cert_review_confirmed",
      fields_confirmed_count: fieldsConfirmed,
      linked_existing: existing !== null
    });
  } catch {
  }
  log({
    fn: "cert-apply-draft",
    event: "confirmed",
    draft_id: draft.id,
    fields_confirmed_count: fieldsConfirmed,
    linked_existing: existing !== null,
    correlation_id: correlationId
  });
  return json({
    status: "confirmed",
    draft_id: draft.id,
    certification_id: certificationId,
    linked_existing: existing !== null,
    fields_confirmed_count: fieldsConfirmed
  });
});
