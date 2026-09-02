// Edge Function: job-match-notify
// Purpose: Score all MATCH_READY workers against open job(s) and enqueue
//          multichannel notifications according to candidate preferences.
//
// PB-MATCHING-NOTIFICATIONS-001
//
// Triggers:
//   a) Called by CompanyPostJob.tsx after a new job is published (body: { job_id }).
//   b) Manual or cron backfill (body: { all: true }) — limited to last 48h.
//
// Dedup: UNIQUE(dedupe_key) on notification_queue; upsert with ignoreDuplicates
//        prevents duplicate deliveries and avoids batch failure.
// Threshold: MATCH_THRESHOLD = 60 (env var).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  calculateMatchScore,
  isMatchReady,
  isWorkerRole,
  type OpportunityForMatching,
  type WorkerProfileForMatching,
  type ValidCertification,
} from "../_shared/matching.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface JobRow {
  id: string;
  title: string;
  company: string | null;
  company_name: string | null;
  location: string | null;
  country: string | null;
  category: string | null;
  discipline: string | null;
  description: string | null;
  requirements: string | null;
  required_certifications: string[] | null;
  mandatory_location: string | null;
  accepts_remote: boolean | null;
}

interface ProfileRow {
  user_id: string;
  role: string | null;
  full_name: string | null;
  title: string | null;
  location: string | null;
  years_experience: number | null;
  availability_status: string | null;
  skills: string[] | null;
  profile_completion: number | null;
  willing_to_travel: boolean | null;
  willing_to_relocate: boolean | null;
  preferred_regions: string | null;
  phone_e164: string | null;
  phone_verified_at: string | null;
  whatsapp_opt_in: boolean | null;
}

interface MatchingPrefsRow {
  user_id: string;
  job_matching_enabled: boolean | null;
  email_job_alerts: boolean | null;
  whatsapp_job_alerts: boolean | null;
}

function toOpportunity(job: JobRow): OpportunityForMatching {
  return {
    id: job.id,
    title: job.title,
    category: job.category,
    discipline: job.discipline,
    location: job.location,
    country: job.country,
    description: job.description,
    requirements: job.requirements,
    required_certifications: job.required_certifications,
    mandatory_location: job.mandatory_location,
    accepts_remote: job.accepts_remote,
  };
}

function toWorker(profile: ProfileRow, certs: ValidCertification[]): WorkerProfileForMatching {
  return {
    user_id: profile.user_id,
    role: profile.role,
    title: profile.title,
    years_experience: profile.years_experience,
    location: profile.location,
    availability_status: profile.availability_status,
    skills: profile.skills,
    profile_completion: profile.profile_completion,
    willing_to_travel: profile.willing_to_travel,
    willing_to_relocate: profile.willing_to_relocate,
    preferred_regions: profile.preferred_regions,
    certifications: certs,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const threshold = parseInt(Deno.env.get("MATCH_THRESHOLD") || "60", 10);
  const whatsappEnabled = Deno.env.get("WHATSAPP_PROVIDER") !== undefined &&
    Deno.env.get("WHATSAPP_PROVIDER") !== "";

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
    .select(
      "id, title, company, company_name, location, country, category, discipline, description, requirements, required_certifications, mandatory_location, accepts_remote",
    )
    .eq("status", "open");

  if (!allMode && jobIds.length > 0) {
    jobQuery = jobQuery.in("id", jobIds);
  } else {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    jobQuery = jobQuery.gte("created_at", cutoff);
  }

  const { data: jobs, error: jobsError } = await jobQuery;

  if (jobsError) {
    return new Response(
      JSON.stringify({ error: jobsError.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!jobs || jobs.length === 0) {
    return new Response(
      JSON.stringify({ enqueued: 0, message: "No jobs to process." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // 2. Fetch MATCH_READY workers
  const { data: workers, error: workersError } = await supabase
    .from("app_14da0f1941_profiles")
    .select(
      "user_id, role, full_name, title, location, years_experience, availability_status, skills, profile_completion, willing_to_travel, willing_to_relocate, preferred_regions, phone_e164, phone_verified_at, whatsapp_opt_in",
    )
    .or("role.eq.worker,role.eq.user");

  if (workersError) {
    return new Response(
      JSON.stringify({ error: workersError.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!workers || workers.length === 0) {
    return new Response(
      JSON.stringify({ enqueued: 0, message: "No eligible workers." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // 3. Fetch certifications with validity
  const workerIds = workers.map((w: ProfileRow) => w.user_id);
  const { data: allCerts } = await supabase
    .from("app_worker_certifications")
    .select("user_id, certification_name, name, is_verified, expiry_date, expiration_date")
    .in("user_id", workerIds);

  const certsByWorker = new Map<string, ValidCertification[]>();
  for (const cert of (allCerts || []) as {
    user_id: string;
    certification_name?: string | null;
    name?: string | null;
    is_verified?: boolean | null;
    expiry_date?: string | null;
    expiration_date?: string | null;
  }[]) {
    if (!certsByWorker.has(cert.user_id)) certsByWorker.set(cert.user_id, []);
    const expiry = cert.expiry_date || cert.expiration_date;
    const isExpired = expiry ? new Date(expiry) < new Date() : false;
    certsByWorker.get(cert.user_id)!.push({
      name: cert.certification_name || cert.name || "",
      is_verified: cert.is_verified !== false, // si la columna no existe, asumir true
      is_expired: isExpired,
    });
  }

  // 4. Fetch matching preferences
  const { data: allPrefs } = await supabase
    .from("app_14da0f1941_matching_preferences")
    .select("user_id, job_matching_enabled, email_job_alerts, whatsapp_job_alerts")
    .in("user_id", workerIds);

  const prefsByWorker = new Map<string, MatchingPrefsRow>();
  for (const p of (allPrefs || []) as MatchingPrefsRow[]) {
    prefsByWorker.set(p.user_id, p);
  }

  // 5. Score and enqueue
  const queueInserts: Record<string, unknown>[] = [];
  let evaluated = 0;
  let eligible = 0;

  for (const job of jobs as JobRow[]) {
    const opportunity = toOpportunity(job);
    const companyName = job.company_name || job.company || undefined;

    for (const worker of workers as ProfileRow[]) {
      evaluated++;
      if (!isWorkerRole(worker.role)) continue;
      if (!isMatchReady(worker)) continue;

      const workerCerts = certsByWorker.get(worker.user_id) || [];
      const result = calculateMatchScore(opportunity, toWorker(worker, workerCerts));

      if (!result.eligible || result.score < threshold) continue;
      eligible++;

      const prefs = prefsByWorker.get(worker.user_id);
      if (prefs?.job_matching_enabled === false) continue;

      const basePayload = {
        title: "Nueva oferta compatible",
        message: `${result.score}% de compatibilidad con "${job.title}"${companyName ? ` en ${companyName}` : ""}.`,
        action_url: `/jobs/${job.id}`,
        metadata: {
          score: result.score,
          breakdown: result.breakdown,
          company_name: companyName ?? null,
        },
      };

      // In-app only when job_matching_enabled is not false
      queueInserts.push({
        opportunity_type: "job",
        opportunity_id: job.id,
        candidate_user_id: worker.user_id,
        channel: "in_app",
        status: "pending",
        payload: { ...basePayload, channel: "in_app" },
        dedupe_key: `job:${job.id}:${worker.user_id}:in_app`,
      });

      // Email: explicit opt-in required
      if (prefs?.email_job_alerts === true) {
        queueInserts.push({
          opportunity_type: "job",
          opportunity_id: job.id,
          candidate_user_id: worker.user_id,
          channel: "email",
          status: "pending",
          payload: { ...basePayload, channel: "email" },
          dedupe_key: `job:${job.id}:${worker.user_id}:email`,
        });
      }

      // WhatsApp: feature flag + verified + explicit opt-in
      const whatsappAllowed =
        whatsappEnabled &&
        worker.phone_verified_at &&
        worker.whatsapp_opt_in === true &&
        prefs?.whatsapp_job_alerts === true;

      if (whatsappAllowed && worker.phone_e164) {
        queueInserts.push({
          opportunity_type: "job",
          opportunity_id: job.id,
          candidate_user_id: worker.user_id,
          channel: "whatsapp",
          status: "pending",
          payload: { ...basePayload, channel: "whatsapp" },
          dedupe_key: `job:${job.id}:${worker.user_id}:whatsapp`,
        });
      }
    }
  }

  let enqueued = 0;
  if (queueInserts.length > 0) {
    const { error: insertError } = await supabase
      .from("app_14da0f1941_notification_queue")
      .upsert(queueInserts, { onConflict: "dedupe_key", ignoreDuplicates: true });

    if (insertError) {
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    enqueued = queueInserts.length;
  }

  return new Response(
    JSON.stringify({
      enqueued,
      jobs_processed: jobs.length,
      workers_evaluated: evaluated,
      workers_eligible: eligible,
      threshold,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
