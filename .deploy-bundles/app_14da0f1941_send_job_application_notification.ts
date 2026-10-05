// app/frontend/supabase/functions/app_14da0f1941_send_job_application_notification/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
var CANONICAL_JOBS_MAILBOX = "jobs@pipingbox.com";
var REPLAY_WINDOW_MS = 15 * 60 * 1e3;
var APP_BASE_URL = "https://pipingbox.com";
function esc(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
serve(async (req) => {
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
    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(400, { error: "Invalid request body" });
    }
    if (!body.job_id) {
      return jsonResponse(400, { error: "Missing job_id" });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authClient = createClient(supabaseUrl, anonKey);
    const { data: userData, error: userError } = await authClient.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return jsonResponse(401, { error: "Invalid authorization" });
    }
    const userId = userData.user.id;
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: applications } = await supabase.from("app_14da0f1941_job_applications").select("id, created_at, status").eq("user_id", userId).eq("job_id", body.job_id).order("created_at", { ascending: false }).limit(1);
    const application = applications?.[0];
    if (!application) {
      return jsonResponse(404, { error: "no_matching_application" });
    }
    const createdAt = new Date(application.created_at).getTime();
    if (Date.now() - createdAt > REPLAY_WINDOW_MS) {
      console.log(JSON.stringify({ requestId, action: "replay_guard_skipped" }));
      return jsonResponse(200, { success: true, emailsSent: false, reason: "stale_application" });
    }
    const { data: job } = await supabase.from("app_14da0f1941_jobs").select("id, title, company, country, location").eq("id", body.job_id).maybeSingle();
    if (!job) {
      return jsonResponse(404, { error: "no_matching_job" });
    }
    const { data: profile, error: profileError } = await supabase.from("app_14da0f1941_profiles").select(
      "full_name, username, role, profile_completion, location, title, years_experience, availability_status"
    ).eq("user_id", userId).maybeSingle();
    if (profileError) {
      console.log(JSON.stringify({ requestId, warning: "profile_query_failed", code: profileError.code }));
    }
    const { data: vcaCerts } = await supabase.from("app_worker_certifications").select("certification_name, expiry_date").eq("user_id", userId).ilike("certification_name", "%vca%").order("expiry_date", { ascending: false, nullsFirst: false }).limit(1);
    const vcaCert = vcaCerts?.[0];
    let vcaStatus = null;
    if (vcaCert) {
      if (!vcaCert.expiry_date) {
        vcaStatus = "On record (no expiry date)";
      } else {
        vcaStatus = new Date(vcaCert.expiry_date).getTime() >= Date.now() ? `Valid until ${new Date(vcaCert.expiry_date).toISOString().split("T")[0]}` : `Expired ${new Date(vcaCert.expiry_date).toISOString().split("T")[0]}`;
      }
    }
    const notifyConfigured = !!(Deno.env.get("NOTIFY_SMTP_HOST") && Deno.env.get("NOTIFY_SMTP_USER") && Deno.env.get("NOTIFY_SMTP_PASSWORD"));
    const env = (name) => Deno.env.get(`${notifyConfigured ? "NOTIFY_" : ""}${name}`);
    const smtpHost = env("SMTP_HOST");
    const smtpPort = parseInt(env("SMTP_PORT") || (notifyConfigured ? "465" : "587"), 10);
    const smtpSecure = env("SMTP_SECURE") !== "false";
    const smtpUser = env("SMTP_USER");
    const smtpPassword = env("SMTP_PASSWORD");
    const smtpFrom = env("SMTP_FROM") || (notifyConfigured ? "notifications@notify.pipingbox.com" : "noreply@pipingbox.com");
    const providerName = notifyConfigured ? "resend_smtp" : "smtp_onecom";
    if (!smtpHost || !smtpUser || !smtpPassword) {
      console.log(JSON.stringify({ requestId, warning: "SMTP not configured, skipping email" }));
      return jsonResponse(200, { success: true, emailsSent: false, reason: "SMTP not configured" });
    }
    const alertTo = Deno.env.get("JOB_ALERT_TO") || CANONICAL_JOBS_MAILBOX;
    const alertBcc = Deno.env.get("JOB_ALERT_BCC") || void 0;
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: { user: smtpUser, pass: smtpPassword }
    });
    const candidateName = profile?.full_name?.trim() || null;
    const candidateLine = candidateName ?? "(profile incomplete)";
    const candidateEmail = userData.user.email ?? "(no email on record)";
    const profileCompletion = profile?.profile_completion ?? 0;
    const candidateUrl = `${APP_BASE_URL}/candidate/${userId}`;
    const rows = [
      ["Job", esc(job.title)],
      ["Company / Project", esc(job.company)],
      ["Country", esc(job.country ?? job.location ?? "\u2014")],
      ["Candidate", esc(candidateLine)],
      ["Candidate email", esc(candidateEmail)]
    ];
    if (profile?.title) rows.push(["Profession / Trade", esc(profile.title)]);
    if (profile?.years_experience != null) {
      rows.push(["Experience", `${profile.years_experience} years`]);
    }
    if (profile?.availability_status) {
      rows.push(["Availability", esc(profile.availability_status)]);
    }
    rows.push(["VCA", vcaStatus ? esc(vcaStatus) : "Not on record"]);
    rows.push(["Profile completion", `${profileCompletion}%`]);
    rows.push(["Application status", esc(application.status ?? "applied")]);
    const tableRows = rows.map(
      ([label, value], i) => `<tr><td style="padding: 8px 0; color: #71717a; width: 170px; vertical-align: top;">${label}</td><td style="padding: 8px 0; color: #fafafa;${i === 3 ? " font-weight: 600;" : ""}">${value}</td></tr>`
    ).join("");
    const adminHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0a0a0a; color: #e4e4e7; border: 1px solid #27272a;">
        <div style="border-bottom: 1px solid #27272a; padding-bottom: 16px; margin-bottom: 24px;">
          <h1 style="margin: 0; font-size: 20px; color: #f59e0b;">New Job Application</h1>
          <p style="margin: 4px 0 0; font-size: 12px; color: #71717a; text-transform: uppercase; letter-spacing: 0.1em;">PipingBox Jobs Pipeline</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          ${tableRows}
        </table>
        <div style="margin-top: 28px; text-align: center;">
          <a href="${candidateUrl}" style="display: inline-block; background: #f59e0b; color: #000000; font-size: 14px; font-weight: 700; text-decoration: none; padding: 12px 32px; border-radius: 4px;">View candidate</a>
        </div>
        <p style="margin-top: 20px; font-size: 12px; color: #52525b; text-align: center;">
          Requires a PIPINGBOX admin/recruitment sign-in. Candidate id <code style="color:#71717a;">${userId}</code>
        </p>
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #27272a; font-size: 11px; color: #52525b;">
          PipingBox Jobs Pipeline \xB7 ${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}
        </div>
      </div>
    `;
    const subject = candidateName ? `New application \u2014 ${candidateName} \u2014 ${job.title}` : `New application \u2014 ${job.title}`;
    const fromField = notifyConfigured ? { name: "PipingBox Notifications", address: smtpFrom } : smtpFrom;
    const info = await transporter.sendMail({
      from: fromField,
      to: alertTo,
      ...alertBcc ? { bcc: alertBcc } : {},
      replyTo: CANONICAL_JOBS_MAILBOX,
      subject,
      html: adminHtml
    });
    const accepted = !info.rejected || info.rejected.length === 0;
    console.log(
      JSON.stringify({
        requestId,
        action: "application_alert_email",
        smtpAccepted: accepted,
        messageId: info.messageId,
        provider: providerName
      })
    );
    return jsonResponse(200, {
      success: true,
      emailsSent: accepted,
      ...accepted ? {} : { reason: "smtp_rejected" }
    });
  } catch (error) {
    console.error(JSON.stringify({ requestId, error: error.message }));
    return jsonResponse(500, { error: "Internal server error" });
  }
  function jsonResponse(status, payload) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
