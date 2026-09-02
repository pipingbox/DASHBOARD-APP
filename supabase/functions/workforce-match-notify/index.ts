// Edge Function: workforce-match-notify
// Purpose: Find MATCH_READY workers for a Workforce Request and enqueue
//          multichannel notifications according to candidate preferences.
//
// PB-MATCHING-NOTIFICATIONS-001
//
// Schema real de app_14da0f1941_workforce_requests (produccion):
//   - worker_type, country, message, status, priority, etc.
//   - NO title, location, description, requirements.
//
// Trigger: Admin clicks "Find matching candidates" in AdminWorkforceRequestDetail.
// Body: { workforce_request_id }
//
// Does NOT modify workforce_assignments: shortlisted → invited remains a human
// admin decision. This function only suggests/queues contacts.

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

interface WorkforceRequestRow {
  id: string;
  worker_type: string | null;
  country: string | null;
  message: string | null;
  required_certifications: string[] | null;
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
  workforce_invitations_enabled: boolean | null;
  email_job_alerts: boolean | null;
  whatsapp_job_alerts: boolean | null;
}

function toOpportunity(request: WorkforceRequestRow): OpportunityForMatching {
  return {
    id: request.id,
    title: "Workforce Request",
    category: request.worker_type,
    discipline: request.worker_type,
    location: null,
    country: request.country,
    description: request.message,
    requirements: request.message,
    required_certifications: request.required_certifications,
    mandatory_location: request.country,
    accepts_remote: false,
  };
}

function toWorker(profile: ProfileRow, certs: ValidCertification[]): WorkerProfileForMatching {
  return {
    user_id: profile.user_id,
    role: profile.role,
    full_name: profile.full_name,
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

  let requestId: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    requestId = body.workforce_request_id || null;
  } catch {
    requestId = null;
  }

  if (!requestId) {
    return new Response(
      JSON.stringify({ error: "workforce_request_id is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // 1. Fetch workforce request
  const { data: requests, error: requestError } = await supabase
    .from("app_14da0f1941_workforce_requests")
    .select(
      "id, worker_type, country, message, required_certifications",
    )
    .eq("id", requestId)
    .limit(1);

  if (requestError) {
    return new Response(
      JSON.stringify({ error: requestError.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!requests || requests.length === 0) {
    return new Response(
      JSON.stringify({ error: "Workforce request not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const request = requests[0] as WorkforceRequestRow;
  const opportunity = toOpportunity(request);

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
  const { data: allCerts, error: certsError } = await supabase
    .from("app_worker_certifications")
    .select("user_id, certification_name, is_verified, expiry_date, expiration_date")
    .in("user_id", workerIds);

  if (certsError) {
    return new Response(
      JSON.stringify({ error: certsError.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const certsByWorker = new Map<string, ValidCertification[]>();
  for (const cert of (allCerts || []) as {
    user_id: string;
    certification_name?: string | null;
    is_verified?: boolean | null;
    expiry_date?: string | null;
    expiration_date?: string | null;
  }[]) {
    if (!certsByWorker.has(cert.user_id)) certsByWorker.set(cert.user_id, []);
    const expiry = cert.expiry_date || cert.expiration_date;
    const isExpired = expiry ? new Date(expiry) < new Date() : false;
    certsByWorker.get(cert.user_id)!.push({
      name: cert.certification_name || "",
      is_verified: cert.is_verified === true,
      is_expired: isExpired,
    });
  }

  // 4. Fetch matching preferences
  const { data: allPrefs } = await supabase
    .from("app_14da0f1941_matching_preferences")
    .select("user_id, workforce_invitations_enabled, email_job_alerts, whatsapp_job_alerts")
    .in("user_id", workerIds);

  const prefsByWorker = new Map<string, MatchingPrefsRow>();
  for (const p of (allPrefs || []) as MatchingPrefsRow[]) {
    prefsByWorker.set(p.user_id, p);
  }

  // 5. Score and enqueue
  const queueInserts: Record<string, unknown>[] = [];
  let evaluated = 0;
  let eligible = 0;

  for (const worker of workers as ProfileRow[]) {
    evaluated++;
    if (!isWorkerRole(worker.role)) continue;
    if (!isMatchReady(worker)) continue;

    const workerCerts = certsByWorker.get(worker.user_id) || [];
    const result = calculateMatchScore(opportunity, toWorker(worker, workerCerts));

    if (!result.eligible || result.score < threshold) continue;
    eligible++;

    const prefs = prefsByWorker.get(worker.user_id);
    if (prefs?.workforce_invitations_enabled === false) continue;

    const basePayload = {
      title: "Nueva oportunidad de proyecto PipingBox",
      message: `${result.score}% de compatibilidad con "${opportunity.title}"${opportunity.country ? ` en ${opportunity.country}` : ""}.`,
      action_url: `/workforce/${request.id}`,
      metadata: {
        score: result.score,
        breakdown: result.breakdown,
        workforce_request_id: request.id,
      },
    };

    queueInserts.push({
      opportunity_type: "workforce",
      opportunity_id: request.id,
      candidate_user_id: worker.user_id,
      channel: "in_app",
      status: "pending",
      payload: { ...basePayload, channel: "in_app" },
      dedupe_key: `workforce:${request.id}:${worker.user_id}:in_app`,
    });

    if (prefs?.email_job_alerts === true) {
      queueInserts.push({
        opportunity_type: "workforce",
        opportunity_id: request.id,
        candidate_user_id: worker.user_id,
        channel: "email",
        status: "pending",
        payload: { ...basePayload, channel: "email" },
        dedupe_key: `workforce:${request.id}:${worker.user_id}:email`,
      });
    }

    const whatsappAllowed =
      whatsappEnabled &&
      worker.phone_verified_at &&
      worker.whatsapp_opt_in === true &&
      prefs?.whatsapp_job_alerts === true;

    if (whatsappAllowed && worker.phone_e164) {
      queueInserts.push({
        opportunity_type: "workforce",
        opportunity_id: request.id,
        candidate_user_id: worker.user_id,
        channel: "whatsapp",
        status: "pending",
        payload: { ...basePayload, channel: "whatsapp" },
        dedupe_key: `workforce:${request.id}:${worker.user_id}:whatsapp`,
      });
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
      workforce_request_id: request.id,
      workers_evaluated: evaluated,
      workers_eligible: eligible,
      threshold,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
