// Edge Function: job-match-notify
// Purpose: Score all MARKETPLACE_READY workers against a job and insert JOB_MATCH
//          in-app notifications for workers scoring >= MATCH_THRESHOLD.
//
// Triggers:
//   a) Called by CompanyPostJob.tsx after a new job is published (body: { job_id }).
//   b) Can be triggered manually or via cron for backfill (body: { all: true }).
//
// Dedup: a (user_id, job_id) pair is never notified twice (checked before insert).
// Threshold: MATCH_THRESHOLD = 60 (configurable via env MATCH_THRESHOLD).
//
// Scoring mirrors jobMatching.ts (AUTO-001) — kept in sync manually until a shared
// Deno module is established (IA-003).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Scoring logic (mirrors frontend/src/lib/jobMatching.ts AUTO-001) ────────

const WEIGHTS = {
  specialty: 0.30,
  certifications: 0.25,
  location: 0.15,
  experience: 0.15,
  languages: 0.10,
  completion: 0.05,
};

function norm(s: string | null | undefined): string {
  return (s || "").toLowerCase().trim();
}

function overlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a.map(norm));
  let hits = 0;
  for (const item of b.map(norm)) if (setA.has(item)) hits++;
  return hits / b.length;
}

interface JobRow {
  id: string;
  title: string;
  company: string | null;
  company_name: string | null;
  location: string | null;
  category: string | null;
  discipline: string | null;
  description: string | null;
  requirements: string | null;
}

interface ProfileRow {
  user_id: string;
  title: string | null;
  role: string | null;
  location: string | null;
  years_experience: number | null;
  availability_status: string | null;
  skills: string[] | null;
  languages: string[] | null;
  profile_completion: number | null;
  marketplace_ready: boolean;
}

function scoreWorker(job: JobRow, worker: ProfileRow, workerCerts: string[]): number {
  if (!worker.marketplace_ready) return 0;

  const jobCat = norm(job.category || job.discipline);
  const workerTitle = norm(worker.title);
  const workerSkills = (worker.skills || []).map(norm);

  const specialtyScore =
    jobCat && workerSkills.includes(jobCat) ? 1.0 :
    jobCat && workerTitle.includes(jobCat) ? 0.8 :
    jobCat && workerSkills.some((s) => s.includes(jobCat) || jobCat.includes(s)) ? 0.5 :
    0.2;

  // Extract required certs from requirements text (simple keyword scan)
  const reqText = norm(job.requirements || job.description || "");
  const knownCerts = ["vca", "weld", "cswip", "asnt", "pssr", "atex", "bosiet", "huet", "gwo"];
  const requiredCerts = knownCerts.filter((c) => reqText.includes(c));
  const certScore = requiredCerts.length > 0
    ? overlap(workerCerts.map(norm), requiredCerts)
    : 0.5;

  const jobLoc = norm(job.location);
  const workerLoc = norm(worker.location);
  const isAvailable = worker.availability_status === "available" || worker.availability_status === "in_2_weeks";
  const locationScore =
    !jobLoc ? 0.5 :
    jobLoc === workerLoc ? 1.0 :
    jobLoc && workerLoc && (jobLoc.includes(workerLoc) || workerLoc.includes(jobLoc)) ? 0.7 :
    isAvailable ? 0.4 : 0.1;

  const years = worker.years_experience ?? 0;
  const experienceScore =
    years >= 10 ? 1.0 :
    years >= 5 ? 0.8 :
    years >= 2 ? 0.5 :
    years > 0 ? 0.3 : 0.1;

  const langScore = (worker.languages || []).length > 0
    ? Math.min(1, (worker.languages || []).length / 3)
    : 0.2;

  const completionScore = Math.min(1, (worker.profile_completion || 0) / 100);

  const score =
    specialtyScore * WEIGHTS.specialty * 100 +
    certScore * WEIGHTS.certifications * 100 +
    locationScore * WEIGHTS.location * 100 +
    experienceScore * WEIGHTS.experience * 100 +
    langScore * WEIGHTS.languages * 100 +
    completionScore * WEIGHTS.completion * 100;

  return Math.min(100, Math.max(0, Math.round(score)));
}

// ── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const threshold = parseInt(Deno.env.get("MATCH_THRESHOLD") || "60", 10);

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let jobIds: string[] = [];
  let allMode = false;

  try {
    const body = await req.json().catch(() => ({}));
    if (body.job_id) {
      jobIds = [body.job_id];
    } else {
      allMode = true;
    }
  } catch {
    allMode = true;
  }

  // 1. Fetch job(s)
  let jobQuery = supabase
    .from("app_14da0f1941_jobs")
    .select("id, title, company, company_name, location, category, discipline, description, requirements")
    .eq("status", "open");

  if (!allMode && jobIds.length > 0) {
    jobQuery = jobQuery.in("id", jobIds);
  } else {
    // For all-mode, limit to jobs published in the last 48 hours to avoid backfilling the full history
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    jobQuery = jobQuery.gte("created_at", cutoff);
  }

  const { data: jobs, error: jobsError } = await jobQuery;

  if (jobsError) {
    console.error("[job-match-notify] Error fetching jobs:", jobsError);
    return new Response(
      JSON.stringify({ error: jobsError.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!jobs || jobs.length === 0) {
    return new Response(
      JSON.stringify({ notified: 0, message: "No jobs to process." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  console.log(`[job-match-notify] Processing ${jobs.length} job(s) with threshold ${threshold}.`);

  // 2. Fetch all MARKETPLACE_READY workers
  const { data: workers, error: workersError } = await supabase
    .from("app_14da0f1941_profiles")
    .select("user_id, title, role, location, years_experience, availability_status, skills, languages, profile_completion, marketplace_ready")
    .eq("marketplace_ready", true);

  if (workersError) {
    console.error("[job-match-notify] Error fetching workers:", workersError);
    return new Response(
      JSON.stringify({ error: workersError.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!workers || workers.length === 0) {
    return new Response(
      JSON.stringify({ notified: 0, message: "No marketplace_ready workers." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // 3. Fetch certifications for all workers in one query
  const workerIds = workers.map((w: ProfileRow) => w.user_id);
  const { data: allCerts } = await supabase
    .from("app_worker_certifications")
    .select("user_id, certification_name")
    .in("user_id", workerIds);

  const certsByWorker = new Map<string, string[]>();
  for (const cert of (allCerts || []) as { user_id: string; certification_name: string }[]) {
    if (!certsByWorker.has(cert.user_id)) certsByWorker.set(cert.user_id, []);
    certsByWorker.get(cert.user_id)!.push(cert.certification_name);
  }

  // 4. Score and notify
  let notifiedCount = 0;
  let skippedDupCount = 0;

  for (const job of jobs as JobRow[]) {
    const companyName = job.company_name || job.company || undefined;

    for (const worker of workers as ProfileRow[]) {
      const workerCerts = certsByWorker.get(worker.user_id) || [];
      const score = scoreWorker(job, worker, workerCerts);

      if (score < threshold) continue;

      // Dedup: skip if a JOB_MATCH notification already exists for this (user_id, job_id)
      const { data: existing } = await supabase
        .from("app_14da0f1941_notifications")
        .select("id")
        .eq("user_id", worker.user_id)
        .eq("type", "JOB_MATCH")
        .eq("related_entity_id", job.id)
        .limit(1);

      if (existing && existing.length > 0) {
        skippedDupCount++;
        continue;
      }

      const { error: insertError } = await supabase
        .from("app_14da0f1941_notifications")
        .insert({
          user_id: worker.user_id,
          type: "JOB_MATCH",
          title: "Nueva oferta compatible",
          message: `${score}% de compatibilidad con "${job.title}"${companyName ? ` en ${companyName}` : ""}.`,
          related_entity_type: "job",
          related_entity_id: job.id,
          action_url: "/jobs",
          actor_name: companyName ?? null,
          is_read: false,
        });

      if (insertError) {
        console.error(`[job-match-notify] Insert error for worker ${worker.user_id} / job ${job.id}:`, insertError);
      } else {
        notifiedCount++;
        console.log(`[job-match-notify] Notified ${worker.user_id} — ${score}% match for "${job.title}"`);
      }
    }
  }

  const summary = {
    notified: notifiedCount,
    skipped_duplicates: skippedDupCount,
    jobs_processed: jobs.length,
    workers_evaluated: workers.length,
    threshold,
  };

  console.log("[job-match-notify] Summary:", summary);

  return new Response(
    JSON.stringify(summary),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
