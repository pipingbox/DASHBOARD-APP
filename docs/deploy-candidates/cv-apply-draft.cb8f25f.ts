// supabase/functions/cv-apply-draft/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
var DRAFTS_TABLE = "app_cv_extraction_drafts";
var EVENTS_TABLE = "app_cv_extraction_events";
var PROFILES_TABLE = "app_14da0f1941_profiles";
var EXPERIENCES_TABLE = "app_worker_experiences";
var CERTIFICATIONS_TABLE = "app_worker_certifications";
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
    "fields_applied",
    "fields_confirmed_count",
    "experiences_applied_count",
    "experiences_merged_count",
    "certifications_applied_count",
    "conflicts_count",
    "time_to_confirmation_ms",
    "marketplace_ready_after_confirmation"
  ];
  const safe = Object.fromEntries(
    allowed.filter((k) => fields[k] !== void 0).map((k) => [k, fields[k]])
  );
  console.log(JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), ...safe }));
}
var FIELD_TO_COLUMN = {
  full_name: "full_name",
  title: "title",
  location: "location",
  summary: "bio",
  years_experience: "years_experience",
  skills: "skills",
  welding_processes: "skills",
  // sin columna propia: merge en skills
  disciplines: "skills",
  // sin columna propia: merge en skills
  availability: "availability_status",
  willing_to_travel: "willing_to_travel",
  willing_to_relocate: "willing_to_relocate"
};
var INFO_ONLY_FIELDS = /* @__PURE__ */ new Set(["email", "phone", "languages", "education", "certifications_declared"]);
var TEXT_COLUMNS = /* @__PURE__ */ new Set(["full_name", "title", "location", "bio"]);
function isEmptyProfileValue(v) {
  if (v === null || v === void 0) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}
function toDbDate(v) {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  return null;
}
function normalizeAvailability(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const v = value.trim().toLowerCase();
  if (v === "immediately") return { availability_status: "available_immediately", available_from: null };
  const m = v.match(/^from\s+(.+)$/);
  if (m) {
    const raw = m[1].trim().replace(/[/.]/g, "-");
    const mm = raw.match(/^(\d{1,2})-(\d{4})$/);
    if (mm) return { availability_status: "available_from_date", available_from: `${mm[2]}-${mm[1].padStart(2, "0")}-01` };
    const yyyy = raw.match(/^(\d{4})$/);
    if (yyyy) return { availability_status: "available_from_date", available_from: `${yyyy[1]}-01-01` };
    return { availability_status: "available_from_date", available_from: null };
  }
  return null;
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
  const { data: draft, error: draftError } = await serviceClient.from(DRAFTS_TABLE).select("id, user_id, extraction_status, extracted_fields, proposed_experiences, proposed_certifications, created_at").eq("id", body.draft_id).eq("user_id", userId).maybeSingle();
  if (draftError) return json({ error: "draft_read_failed" }, 500);
  if (!draft) return json({ error: "not_found" }, 404);
  if (draft.extraction_status === "review_confirmed") {
    return json({ status: "already_confirmed", draft_id: draft.id });
  }
  if (draft.extraction_status !== "pending_review") {
    return json({ error: "invalid_state", reason: `draft is ${draft.extraction_status}` }, 409);
  }
  const { data: profile } = await serviceClient.from(PROFILES_TABLE).select("full_name, title, location, bio, years_experience, skills, availability_status, available_from, willing_to_travel, willing_to_relocate").eq("user_id", userId).maybeSingle();
  if (!profile) {
    return json({ error: "profile_not_ready", reason: "canonical profile does not exist yet" }, 409);
  }
  const draftFields = new Map(draft.extracted_fields.map((f) => [f.field, f]));
  const decisions = new Map((body.fields ?? []).map((d) => [d.field, d]));
  const patch = {};
  const conflicts = [];
  let fieldsConfirmed = 0;
  const skippedInfoOnly = [];
  const unavailable = [];
  const availability = decisions.get("availability");
  if (availability) {
    const draftField = draftFields.get("availability");
    if (draftField) {
      const value = availability.action === "edit" && typeof availability.value === "string" ? availability.value : draftField.value;
      const norm = normalizeAvailability(value);
      if (norm) {
        if (isEmptyProfileValue(profile["availability_status"])) {
          patch["availability_status"] = norm.availability_status;
          if (norm.available_from) patch["available_from"] = norm.available_from;
          fieldsConfirmed++;
        } else if (profile["availability_status"] !== norm.availability_status) {
          if (availability.overwrite === true) {
            patch["availability_status"] = norm.availability_status;
            if (norm.available_from) patch["available_from"] = norm.available_from;
            fieldsConfirmed++;
          } else {
            conflicts.push({ field: "availability", profile_value: profile["availability_status"], cv_value: norm.availability_status });
          }
        }
      }
    }
  }
  for (const [fieldName, column] of Object.entries(FIELD_TO_COLUMN)) {
    if (fieldName === "availability") continue;
    const decision = decisions.get(fieldName);
    if (!decision) continue;
    const draftField = draftFields.get(fieldName);
    if (!draftField) {
      unavailable.push(fieldName);
      continue;
    }
    let value;
    if (decision.action === "edit") {
      value = decision.value ?? null;
    } else {
      value = draftField.value;
    }
    if (value === null || value === void 0) continue;
    if (column === "skills") {
      const incoming = Array.isArray(value) ? value.filter((s2) => typeof s2 === "string" && s2.trim() !== "") : [];
      if (!incoming.length) continue;
      const existing2 = Array.isArray(profile["skills"]) ? profile["skills"] : [];
      const merged = [.../* @__PURE__ */ new Set([...existing2, ...incoming.map((s2) => s2.trim())])];
      if (merged.length !== existing2.length) {
        patch["skills"] = merged;
        fieldsConfirmed++;
      }
      continue;
    }
    if (column === "years_experience") {
      const n = typeof value === "number" ? value : parseInt(String(value), 10);
      if (!Number.isFinite(n) || n < 0 || n > 60) continue;
      if (isEmptyProfileValue(profile[column]) || profile[column] === 0) {
        patch[column] = n;
        fieldsConfirmed++;
      } else if (profile[column] !== n) {
        if (decision.overwrite === true) {
          patch[column] = n;
          fieldsConfirmed++;
        } else {
          conflicts.push({ field: fieldName, profile_value: profile[column], cv_value: n });
        }
      }
      continue;
    }
    if (column === "willing_to_travel" || column === "willing_to_relocate") {
      if (value !== true) continue;
      if (profile[column] !== true) {
        if (isEmptyProfileValue(profile[column])) {
          patch[column] = true;
          fieldsConfirmed++;
        } else if (decision.overwrite === true) {
          patch[column] = true;
          fieldsConfirmed++;
        } else {
          conflicts.push({ field: fieldName, profile_value: profile[column], cv_value: true });
        }
      }
      continue;
    }
    const s = typeof value === "string" ? value.trim() : "";
    if (!s || !TEXT_COLUMNS.has(column)) continue;
    const clipped = s.slice(0, column === "bio" ? 2e3 : 120);
    if (isEmptyProfileValue(profile[column])) {
      patch[column] = clipped;
      fieldsConfirmed++;
    } else if (profile[column].trim() !== clipped) {
      if (decision.overwrite === true) {
        patch[column] = clipped;
        fieldsConfirmed++;
      } else {
        conflicts.push({ field: fieldName, profile_value: profile[column], cv_value: clipped });
      }
    }
  }
  for (const f of decisions.keys()) {
    if (INFO_ONLY_FIELDS.has(f)) skippedInfoOnly.push(f);
  }
  if (conflicts.length > 0) {
    log({ fn: "cv-apply-draft", event: "conflict", draft_id: draft.id, conflicts_count: conflicts.length, correlation_id: correlationId });
    return json({ error: "conflict", conflicts }, 409);
  }
  const { data: existingExperiences } = await serviceClient.from(EXPERIENCES_TABLE).select("company_name, position, start_date, end_date").eq("user_id", userId);
  const existing = existingExperiences ?? [];
  const isSameExperience = (a, b) => {
    const norm = (v) => (v ?? "").trim().toLowerCase();
    const company = norm(a.company_name) !== "" && norm(a.company_name) === norm(b.company_name);
    const role = norm(a.position) !== "" && norm(a.position) === norm(b.position);
    const dates = (a.start_date ?? null) === (b.start_date ?? null) && (a.end_date ?? null) === (b.end_date ?? null);
    return (company || role) && dates;
  };
  const experiencesToInsert = [];
  let experiencesMerged = 0;
  for (const decision of body.experiences ?? []) {
    const proposal = draft.proposed_experiences.find((e) => e.local_id === decision.local_id);
    if (!proposal) continue;
    const merged = decision.action === "edit" && decision.patch ? { ...proposal, ...decision.patch } : proposal;
    if (!merged.position?.trim() && !merged.company_name?.trim()) continue;
    const candidate = {
      // company_name es NOT NULL en la tabla: cadena vacía cuando el CV no
      // la declara explícitamente (el guard de arriba exige position).
      company_name: merged.company_name?.trim() || "",
      position: merged.position?.trim() || "",
      start_date: toDbDate(merged.start_date),
      end_date: merged.currently_working === true ? null : toDbDate(merged.end_date)
    };
    if (existing.some((e) => isSameExperience(e, candidate)) || experiencesToInsert.some((e) => isSameExperience(e, candidate))) {
      experiencesMerged++;
      continue;
    }
    experiencesToInsert.push({
      user_id: userId,
      ...candidate,
      position: candidate.position,
      project_name: merged.project_name ?? null,
      city_region: merged.city_region ?? null,
      country: merged.country ?? null,
      currently_working: merged.currently_working === true,
      description_original: merged.description_original?.slice(0, 2e3) ?? null,
      visible_to_companies: true
    });
  }
  const { data: existingCerts } = await serviceClient.from(CERTIFICATIONS_TABLE).select("certification_name").eq("user_id", userId);
  const existingCertNames = new Set(
    (existingCerts ?? []).map((c) => (c.certification_name ?? "").trim().toLowerCase()).filter(Boolean)
  );
  const certsToInsert = [];
  for (const decision of body.certifications ?? []) {
    if (decision.action !== "accept") continue;
    const proposal = draft.proposed_certifications.find((c) => c.local_id === decision.local_id);
    if (!proposal?.name?.trim()) continue;
    const name = proposal.name.trim().slice(0, 160);
    if (existingCertNames.has(name.toLowerCase())) continue;
    existingCertNames.add(name.toLowerCase());
    certsToInsert.push({
      user_id: userId,
      certification_name: name,
      issuing_organization: null,
      // DECLARED / UNVERIFIED — jamás verified por texto del CV.
      is_verified: false,
      verified_at: null,
      storage_bucket: null,
      storage_path: null,
      certificate_file_url: null,
      file_url: null,
      is_visible: true,
      visible_to_companies: true,
      notes: "Declared in CV (unverified)"
    });
  }
  if (Object.keys(patch).length > 0) {
    const { error: updateError } = await serviceClient.from(PROFILES_TABLE).update(patch).eq("user_id", userId);
    if (updateError) {
      log({ fn: "cv-apply-draft", event: "profile_update_failed", draft_id: draft.id, correlation_id: correlationId });
      return json({ error: "profile_update_failed" }, 500);
    }
  }
  if (experiencesToInsert.length > 0) {
    const { error: expError } = await serviceClient.from(EXPERIENCES_TABLE).insert(experiencesToInsert);
    if (expError) {
      log({ fn: "cv-apply-draft", event: "experience_insert_failed", draft_id: draft.id, correlation_id: correlationId });
      return json({ error: "experience_insert_failed" }, 500);
    }
  }
  if (certsToInsert.length > 0) {
    const { error: certError } = await serviceClient.from(CERTIFICATIONS_TABLE).insert(certsToInsert);
    if (certError) {
      log({ fn: "cv-apply-draft", event: "certification_insert_failed", draft_id: draft.id, correlation_id: correlationId });
      return json({ error: "certification_insert_failed" }, 500);
    }
  }
  const { error: draftUpdateError } = await serviceClient.from(DRAFTS_TABLE).update({ extraction_status: "review_confirmed", reviewed_at: (/* @__PURE__ */ new Date()).toISOString(), updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", draft.id).eq("user_id", userId);
  if (draftUpdateError) {
    log({ fn: "cv-apply-draft", event: "draft_close_failed", draft_id: draft.id, correlation_id: correlationId });
    return json({ error: "draft_close_failed" }, 500);
  }
  let marketplaceReadyAfter = false;
  try {
    const { data: recalc, error: recalcError } = await serviceClient.rpc("pb_recalculate_profile_state", {
      p_user_id: userId,
      p_limit: 1
    });
    if (!recalcError && Array.isArray(recalc) && recalc.length > 0) {
      marketplaceReadyAfter = recalc[0].caller_marketplace_ready === true;
    }
  } catch {
  }
  const timeToConfirmationMs = Date.now() - new Date(draft.created_at).getTime();
  try {
    await serviceClient.from(EVENTS_TABLE).insert({
      user_id: userId,
      draft_id: draft.id,
      event_type: "cv_profile_review_confirmed",
      fields_confirmed_count: fieldsConfirmed,
      experiences_extracted_count: draft.proposed_experiences.length,
      experiences_applied_count: experiencesToInsert.length,
      certifications_proposed_count: draft.proposed_certifications.length,
      marketplace_ready_after_confirmation: marketplaceReadyAfter,
      time_to_confirmation_ms: timeToConfirmationMs
    });
  } catch {
  }
  log({
    fn: "cv-apply-draft",
    event: "confirmed",
    draft_id: draft.id,
    fields_confirmed_count: fieldsConfirmed,
    experiences_applied_count: experiencesToInsert.length,
    experiences_merged_count: experiencesMerged,
    marketplace_ready_after_confirmation: marketplaceReadyAfter,
    time_to_confirmation_ms: timeToConfirmationMs,
    correlation_id: correlationId
  });
  return json({
    status: "confirmed",
    draft_id: draft.id,
    fields_confirmed_count: fieldsConfirmed,
    experiences_applied_count: experiencesToInsert.length,
    experiences_merged_count: experiencesMerged,
    certifications_applied_count: certsToInsert.length,
    skipped_info_only: skippedInfoOnly,
    unavailable,
    marketplace_ready_after_confirmation: marketplaceReadyAfter
  });
});
