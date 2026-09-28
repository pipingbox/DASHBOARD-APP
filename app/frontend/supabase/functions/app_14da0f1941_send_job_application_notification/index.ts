// PB-JOBS-PILOT-FOLLOWUP-002 — Jobs operational email routing.
//
// Sends the recruitment notification for a new job application to the
// canonical Jobs operational mailbox (jobs@pipingbox.com). Deployed with
// verify_jwt=true: the candidate's session token authorizes the call.
//
// Auth emails (confirmation/password) are NOT touched: they belong to
// Supabase Auth and always go to the authenticated user's own address.
//
// Contract:
// - The application MUST already exist in app_14da0f1941_job_applications
//   for (caller user_id, job_id) — the insert happens in the browser before
//   invoking, exactly like the lead-alert flow (PB-LEADFORM-001 lesson).
// - Replay guard: only applications created within the last 15 minutes
//   trigger an email, so a re-invocation cannot spam the mailbox.
// - The HTTP response NEVER contains addresses or candidate PII — it goes
//   back to the candidate's browser. SMTP acceptance evidence is returned
//   as a boolean only.
// - Logs carry no addresses (the canonical recipient is public by design).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CANONICAL_JOBS_MAILBOX = "jobs@pipingbox.com";
const REPLAY_WINDOW_MS = 15 * 60 * 1000;

serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  console.log(JSON.stringify({ requestId, method: req.method, url: req.url }));

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
    if (!body.job_id) {
      return jsonResponse(400, { error: "Missing job_id" });
    }

    // Authoritative caller identity (server-verified JWT).
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authClient = createClient(supabaseUrl, anonKey);
    const { data: userData, error: userError } = await authClient.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return jsonResponse(401, { error: "Invalid authorization" });
    }
    const userId = userData.user.id;

    const supabase = createClient(supabaseUrl, serviceKey);

    // The application must exist for this caller + job.
    const { data: applications } = await supabase
      .from("app_14da0f1941_job_applications")
      .select("id, created_at, status")
      .eq("user_id", userId)
      .eq("job_id", body.job_id)
      .order("created_at", { ascending: false })
      .limit(1);

    const application = applications?.[0];
    if (!application) {
      return jsonResponse(404, { error: "no_matching_application" });
    }

    // Replay guard.
    const createdAt = new Date(application.created_at).getTime();
    if (Date.now() - createdAt > REPLAY_WINDOW_MS) {
      console.log(JSON.stringify({ requestId, action: "replay_guard_skipped" }));
      return jsonResponse(200, { success: true, emailsSent: false, reason: "stale_application" });
    }

    // Load the job (canonical source title/company).
    const { data: job } = await supabase
      .from("app_14da0f1941_jobs")
      .select("id, title, company, country, location")
      .eq("id", body.job_id)
      .maybeSingle();
    if (!job) {
      return jsonResponse(404, { error: "no_matching_job" });
    }

    // Candidate profile (internal email content only — never analytics).
    const { data: profile } = await supabase
      .from("app_14da0f1941_profiles")
      .select("full_name, username, role, profile_completion, country")
      .eq("user_id", userId)
      .maybeSingle();

    // SMTP setup (project-level secrets, same provider as the lead alert).
    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "587", 10);
    const smtpSecure = Deno.env.get("SMTP_SECURE") !== "false";
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    const smtpFrom = Deno.env.get("SMTP_FROM") || "noreply@pipingbox.com";

    if (!smtpHost || !smtpUser || !smtpPassword) {
      console.log(JSON.stringify({ requestId, warning: "SMTP not configured, skipping email" }));
      return jsonResponse(200, { success: true, emailsSent: false, reason: "SMTP not configured" });
    }

    // Canonical operational routing. Single recipient by design — no
    // competing internal inboxes. Optional audit BCC via env, off by default.
    const alertTo = Deno.env.get("JOB_ALERT_TO") || CANONICAL_JOBS_MAILBOX;
    const alertBcc = Deno.env.get("JOB_ALERT_BCC") || undefined;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: { user: smtpUser, pass: smtpPassword },
    });

    const candidateLine = profile?.full_name || "(profile incomplete)";
    const candidateEmail = userData.user.email ?? "(no email on record)";
    const profileCompletion = profile?.profile_completion ?? 0;
    const candidateId = userId;

    const adminHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0a0a0a; color: #e4e4e7; border: 1px solid #27272a;">
        <div style="border-bottom: 1px solid #27272a; padding-bottom: 16px; margin-bottom: 24px;">
          <h1 style="margin: 0; font-size: 20px; color: #f59e0b;">New Job Application</h1>
          <p style="margin: 4px 0 0; font-size: 12px; color: #71717a; text-transform: uppercase; letter-spacing: 0.1em;">PipingBox Jobs Pipeline</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr><td style="padding: 8px 0; color: #71717a; width: 160px;">Job</td><td style="padding: 8px 0; color: #fafafa; font-weight: 600;">${job.title}</td></tr>
          <tr><td style="padding: 8px 0; color: #71717a;">Company / Project</td><td style="padding: 8px 0; color: #fafafa;">${job.company}</td></tr>
          <tr><td style="padding: 8px 0; color: #71717a;">Country</td><td style="padding: 8px 0; color: #fafafa;">${job.country ?? job.location ?? "—"}</td></tr>
          <tr><td style="padding: 8px 0; color: #71717a;">Candidate</td><td style="padding: 8px 0; color: #fafafa; font-weight: 600;">${candidateLine}</td></tr>
          <tr><td style="padding: 8px 0; color: #71717a;">Candidate email</td><td style="padding: 8px 0; color: #fafafa;"><a href="mailto:${candidateEmail}" style="color: #f59e0b;">${candidateEmail}</a></td></tr>
          <tr><td style="padding: 8px 0; color: #71717a;">Profile completion</td><td style="padding: 8px 0; color: #fafafa;">${profileCompletion}%</td></tr>
          <tr><td style="padding: 8px 0; color: #71717a;">Application status</td><td style="padding: 8px 0; color: #fafafa;">${application.status ?? "applied"}</td></tr>
        </table>
        <p style="margin-top: 20px; font-size: 13px; color: #a1a1aa;">
          Review the candidate in the PIPINGBOX dashboard (admin &gt; candidates, or the job's applications view) — candidate id <code style="color:#f59e0b;">${candidateId}</code>.
        </p>
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #27272a; font-size: 11px; color: #52525b;">
          PipingBox Jobs Pipeline · ${new Date().toISOString().split("T")[0]}
        </div>
      </div>
    `;

    const info = await transporter.sendMail({
      from: smtpFrom,
      to: alertTo,
      ...(alertBcc ? { bcc: alertBcc } : {}),
      subject: `New application — ${job.title}`,
      html: adminHtml,
    });

    const accepted = !info.rejected || info.rejected.length === 0;
    console.log(
      JSON.stringify({
        requestId,
        action: "application_alert_email",
        smtpAccepted: accepted,
        messageId: info.messageId,
      }),
    );

    return jsonResponse(200, {
      success: true,
      emailsSent: accepted,
      ...(accepted ? {} : { reason: "smtp_rejected" }),
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
