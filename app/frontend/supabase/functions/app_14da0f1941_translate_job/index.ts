// PB-JOBS-PILOT-003 — automatic translation of dynamic job content.
//
// Pipeline (§6): given a job_id, generate/persist translations for all
// supported target locales into app_14da0f1941_job_translations, keyed to the
// canonical source content hash. The source job is never modified.
//
// Safety (§9 fail-open):
// - Translation failures NEVER block job creation/editing. A provider outage
//   leaves the job fully usable in its source language and is surfaced as a
//   status the admin/QA can act on (and retry).
// - Idempotent: a fresh (hash-matching) translation is never re-generated,
//   so repeated calls are cheap and never clobber content (§12).
// - Authorization: the caller must own the job or be a recognized admin.
//
// Provider independence (§7): translation itself lives in
// ../_shared/translation-provider.ts. This function only orchestrates —
// the Jobs domain never calls a provider directly.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getTranslationProvider, translateJobContent } from "../_shared/translation-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** FNV-1a over the canonical content fields — MUST match jobs/utils.ts and
 *  sql/016 seeds. Shared by the whole invalidation contract. */
function hashSourceContent(job: { title?: string | null; summary?: string | null; description?: string | null; requirements?: string | null }): string {
  const src = [job.title ?? "", job.summary ?? "", job.description ?? "", job.requirements ?? ""].join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  console.log(JSON.stringify({ requestId, method: req.method }));

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse(401, { error: "Missing authorization" });
    }
    const jwt = authHeader.slice("Bearer ".length);

    let body: { job_id?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse(400, { error: "Invalid request body" });
    }
    if (!body.job_id) return jsonResponse(400, { error: "Missing job_id" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authClient = createClient(supabaseUrl, anonKey);
    const { data: userData, error: userError } = await authClient.auth.getUser(jwt);
    if (userError || !userData?.user) return jsonResponse(401, { error: "Invalid authorization" });

    const supabase = createClient(supabaseUrl, serviceKey);

    // Load the canonical job (source of truth). Never modified here.
    const { data: job, error: jobError } = await supabase
      .from("app_14da0f1941_jobs")
      .select("id, title, summary, description, requirements, source_language, company_user_id")
      .eq("id", body.job_id)
      .maybeSingle();
    if (jobError || !job) return jsonResponse(404, { error: "job_not_found" });

    // Authorization: owner or recognized admin (same boundary as job mgmt).
    const { data: profile } = await supabase
      .from("app_14da0f1941_profiles")
      .select("role")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    const isAdmin = profile?.role === "admin" || profile?.role === "jobs_moderator";
    const isOwner = job.company_user_id === userData.user.id;
    if (!isAdmin && !isOwner) return jsonResponse(403, { error: "forbidden" });

    const sourceLanguage = job.source_language ?? "en";
    const sourceHash = hashSourceContent(job);
    // Supported reader locales (target set). Source locale is excluded by design.
    const supported = (Deno.env.get("TRANSLATION_TARGET_LOCALES") ?? "es,nl,fr,pt")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && s !== sourceLanguage);

    const provider = getTranslationProvider({
      TRANSLATE_PROVIDER: Deno.env.get("TRANSLATE_PROVIDER"),
      TRANSLATE_API_URL: Deno.env.get("TRANSLATE_API_URL"),
      TRANSLATE_API_KEY: Deno.env.get("TRANSLATE_API_KEY"),
    });

    // Load existing translations once so we never regenerate a fresh one.
    const { data: existing } = await supabase
      .from("app_14da0f1941_job_translations")
      .select("language, source_content_hash, translation_status")
      .eq("job_id", job.id);
    const byLanguage = new Map((existing ?? []).map((t) => [t.language, t]));

    const results: Array<{ language: string; status: "translated" | "skipped_fresh" | "failed" }> = [];
    let providerConfigured = provider.configured();

    for (const target of supported) {
      const prev = byLanguage.get(target);
      // Idempotence (§12): a fresh translation keyed to the current source hash
      // is kept verbatim — no redundant provider call, no clobber.
      if (prev && prev.source_content_hash === sourceHash) {
        results.push({ language: target, status: "skipped_fresh" });
        continue;
      }
      if (!providerConfigured) {
        results.push({ language: target, status: "failed" });
        continue;
      }
      const res = await translateJobContent(
        provider,
        { title: job.title, summary: job.summary, description: job.description, requirements: job.requirements },
        sourceLanguage,
        target,
      );
      if (!res.ok || !res.translation) {
        console.log(JSON.stringify({ requestId, language: target, translation: "failed", reason: res.reason }));
        results.push({ language: target, status: "failed" });
        continue;
      }
      const { error: upsertError } = await supabase
        .from("app_14da0f1941_job_translations")
        .upsert(
          {
            job_id: job.id,
            language: target,
            title: res.translation.title,
            summary: res.translation.summary,
            description: res.translation.description,
            requirements: res.translation.requirements,
            source_language: sourceLanguage,
            source_content_hash: sourceHash,
            translation_status: "machine",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "job_id,language" },
        );
      if (upsertError) {
        console.log(JSON.stringify({ requestId, language: target, translation: "persist_failed" }));
        results.push({ language: target, status: "failed" });
        continue;
      }
      results.push({ language: target, status: "translated" });
    }

    const summary = {
      translated: results.filter((r) => r.status === "translated").length,
      skipped_fresh: results.filter((r) => r.status === "skipped_fresh").length,
      failed: results.filter((r) => r.status === "failed").length,
    };
    console.log(JSON.stringify({ requestId, job_id: job.id, provider: provider.id, providerConfigured, ...summary }));

    return jsonResponse(200, {
      success: true,
      job_id: job.id,
      provider: provider.id,
      provider_configured: providerConfigured,
      results,
      summary,
    });
  } catch (error) {
    console.error(JSON.stringify({ requestId, error: (error as Error).message }));
    return jsonResponse(500, { error: "Internal server error" });
  }

  function jsonResponse(status: number, payload: Record<string, unknown>): Response {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
