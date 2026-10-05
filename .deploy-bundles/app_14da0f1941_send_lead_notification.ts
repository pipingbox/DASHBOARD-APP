// supabase/functions/app_14da0f1941_send_lead_notification/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
var LEAD_MAX_AGE_MS = 15 * 60 * 1e3;
function escapeHtml(value) {
  if (value === null || value === void 0) return "";
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function clamp(value, max) {
  const s = escapeHtml(value);
  return s.length > max ? `${s.slice(0, max)}...` : s;
}
async function releaseClaim(supabase, leadId, requestId, reason) {
  const { error } = await supabase.from("app_14da0f1941_company_leads").update({ notified_at: null }).eq("id", leadId);
  if (error) {
    console.error(
      JSON.stringify({ requestId, error: "claim_release_failed", leadId, reason, details: error.message })
    );
    return;
  }
  console.log(JSON.stringify({ requestId, action: "claim_released", leadId, reason }));
}
serve(async (req) => {
  const requestId = crypto.randomUUID();
  console.log(JSON.stringify({ requestId, method: req.method, url: req.url }));
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  let supabase = null;
  let claimedLeadId = null;
  let adminMailSent = false;
  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { company_name, email } = body;
    if (!company_name || !email) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    supabase = createClient(supabaseUrl, supabaseKey);
    const { data: leads, error: leadError } = await supabase.from("app_14da0f1941_company_leads").select(
      "id, created_at, notified_at, company_name, contact_person, email, country, workers_needed, start_date, number_of_workers, project_duration, message"
    ).eq("email", email).eq("company_name", company_name).order("created_at", { ascending: false }).limit(1);
    if (leadError) {
      console.error(JSON.stringify({ requestId, error: "lead_lookup_failed", details: leadError.message }));
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const lead = leads?.[0];
    if (!lead) {
      console.log(JSON.stringify({ requestId, rejected: "no_matching_lead" }));
      return new Response(
        JSON.stringify({ error: "No matching lead" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (lead.notified_at) {
      console.log(JSON.stringify({ requestId, skipped: "already_notified", leadId: lead.id }));
      return new Response(
        JSON.stringify({ success: true, emailsSent: false, reason: "Already notified" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const ageMs = Date.now() - new Date(lead.created_at).getTime();
    if (ageMs > LEAD_MAX_AGE_MS) {
      console.log(JSON.stringify({ requestId, rejected: "lead_too_old", leadId: lead.id, ageMs }));
      return new Response(
        JSON.stringify({ error: "Lead too old to notify" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { data: claimed, error: claimError } = await supabase.from("app_14da0f1941_company_leads").update({ notified_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", lead.id).is("notified_at", null).select("id");
    if (claimError || !claimed || claimed.length === 0) {
      console.log(JSON.stringify({ requestId, skipped: "claim_lost", leadId: lead.id }));
      return new Response(
        JSON.stringify({ success: true, emailsSent: false, reason: "Already notified" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    claimedLeadId = lead.id;
    const numWorkers = parseInt(lead.number_of_workers || "0", 10);
    const isUrgentWorkers = numWorkers >= 10;
    const isUrgentDate = lead.start_date && new Date(lead.start_date) <= new Date(Date.now() + 14 * 24 * 60 * 60 * 1e3);
    const priority = isUrgentWorkers || isUrgentDate ? "urgent" : "normal";
    await supabase.from("app_14da0f1941_company_leads").update({ priority }).eq("id", lead.id);
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
      await releaseClaim(supabase, lead.id, requestId, "smtp_not_configured");
      const missing = [
        !smtpHost && "SMTP_HOST",
        !smtpUser && "SMTP_USER",
        !smtpPassword && "SMTP_PASSWORD"
      ].filter(Boolean);
      console.error(JSON.stringify({ requestId, error: "smtp_not_configured", missing, leadId: lead.id }));
      return new Response(
        JSON.stringify({ success: true, priority, emailsSent: false, reason: "SMTP not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const safe = {
      company_name: clamp(lead.company_name, 200),
      contact_person: clamp(lead.contact_person, 200),
      email: clamp(lead.email, 320),
      country: clamp(lead.country, 100),
      workers_needed: clamp(lead.workers_needed, 200),
      number_of_workers: clamp(lead.number_of_workers, 20),
      start_date: clamp(lead.start_date, 40),
      project_duration: clamp(lead.project_duration, 100),
      message: clamp(lead.message, 2e3)
    };
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: { user: smtpUser, pass: smtpPassword }
    });
    const adminHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0a0a0a; color: #e4e4e7; border: 1px solid #27272a;">
        <div style="border-bottom: 1px solid #27272a; padding-bottom: 16px; margin-bottom: 24px;">
          <h1 style="margin: 0; font-size: 20px; color: #f59e0b;">\u26A1 New Workforce Request</h1>
          <p style="margin: 4px 0 0; font-size: 12px; color: #71717a; text-transform: uppercase; letter-spacing: 0.1em;">PipingBox Lead Pipeline</p>
        </div>
        ${priority === "urgent" ? '<div style="background: #7f1d1d; border: 1px solid #dc2626; padding: 8px 12px; margin-bottom: 16px; font-size: 12px; color: #fca5a5; text-transform: uppercase; letter-spacing: 0.05em;">\u{1F534} URGENT PRIORITY</div>' : ""}
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr><td style="padding: 8px 0; color: #71717a; width: 140px;">Company</td><td style="padding: 8px 0; color: #fafafa; font-weight: 600;">${safe.company_name}</td></tr>
          <tr><td style="padding: 8px 0; color: #71717a;">Contact</td><td style="padding: 8px 0; color: #fafafa;">${safe.contact_person}</td></tr>
          <tr><td style="padding: 8px 0; color: #71717a;">Email</td><td style="padding: 8px 0; color: #fafafa;">${safe.email}</td></tr>
          <tr><td style="padding: 8px 0; color: #71717a;">Country</td><td style="padding: 8px 0; color: #fafafa;">${safe.country}</td></tr>
          <tr><td style="padding: 8px 0; color: #71717a;">Workers Needed</td><td style="padding: 8px 0; color: #fafafa;">${safe.workers_needed}</td></tr>
          ${safe.number_of_workers ? `<tr><td style="padding: 8px 0; color: #71717a;">Quantity</td><td style="padding: 8px 0; color: #fafafa;">${safe.number_of_workers}</td></tr>` : ""}
          ${safe.start_date ? `<tr><td style="padding: 8px 0; color: #71717a;">Start Date</td><td style="padding: 8px 0; color: #fafafa;">${safe.start_date}</td></tr>` : ""}
          ${safe.project_duration ? `<tr><td style="padding: 8px 0; color: #71717a;">Duration</td><td style="padding: 8px 0; color: #fafafa;">${safe.project_duration}</td></tr>` : ""}
        </table>
        ${safe.message ? `<div style="margin-top: 16px; padding: 12px; background: #18181b; border: 1px solid #27272a;"><p style="margin: 0 0 4px; font-size: 11px; color: #71717a; text-transform: uppercase; letter-spacing: 0.05em;">Message</p><p style="margin: 0; font-size: 14px; color: #d4d4d8;">${safe.message}</p></div>` : ""}
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #27272a; font-size: 11px; color: #52525b;">
          PipingBox Recruitment Pipeline \xB7 ${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]} \xB7 lead ${lead.id}
        </div>
      </div>
    `;
    const fromField = notifyConfigured ? { name: "PipingBox Notifications", address: smtpFrom } : smtpFrom;
    const replyTo = "jobs@pipingbox.com";
    await transporter.sendMail({
      from: fromField,
      to: "jobs@pipingbox.com",
      replyTo,
      subject: `New Workforce Request - ${lead.company_name}`,
      html: adminHtml
    });
    adminMailSent = true;
    console.log(JSON.stringify({ requestId, action: "admin_email_sent", to: "jobs@pipingbox.com", leadId: lead.id, provider: providerName }));
    const companyHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #ffffff; color: #18181b;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="margin: 0; font-size: 24px; color: #18181b;">PipingBox</h1>
          <p style="margin: 4px 0 0; font-size: 12px; color: #71717a; text-transform: uppercase; letter-spacing: 0.15em;">Industrial Workforce Solutions</p>
        </div>
        <div style="background: #f4f4f5; border-left: 3px solid #f59e0b; padding: 16px 20px; margin-bottom: 24px;">
          <h2 style="margin: 0 0 4px; font-size: 16px; color: #18181b;">Request Received \u2713</h2>
          <p style="margin: 0; font-size: 14px; color: #52525b;">Your workforce request has been successfully submitted.</p>
        </div>
        <p style="font-size: 14px; color: #3f3f46; line-height: 1.6;">
          Dear ${safe.contact_person},
        </p>
        <p style="font-size: 14px; color: #3f3f46; line-height: 1.6;">
          Thank you for reaching out to PipingBox. We have received your request for <strong>${safe.workers_needed}</strong>${safe.number_of_workers ? ` (${safe.number_of_workers} workers)` : ""} in <strong>${safe.country}</strong>.
        </p>
        <p style="font-size: 14px; color: #3f3f46; line-height: 1.6;">
          Our recruitment team will review your requirements and get back to you within <strong>24\u201348 hours</strong> with a tailored proposal including candidate profiles and availability.
        </p>
        <div style="background: #fefce8; border: 1px solid #fef08a; padding: 16px; margin: 24px 0;">
          <p style="margin: 0; font-size: 13px; color: #854d0e;"><strong>What happens next:</strong></p>
          <ol style="margin: 8px 0 0; padding-left: 20px; font-size: 13px; color: #854d0e; line-height: 1.8;">
            <li>Our team reviews your specific requirements</li>
            <li>We source matching candidates from our network</li>
            <li>You receive qualified candidate profiles</li>
            <li>We handle all deployment logistics</li>
          </ol>
        </div>
        <p style="font-size: 14px; color: #3f3f46; line-height: 1.6;">
          If you have any urgent questions, please contact us directly at <a href="mailto:jobs@pipingbox.com" style="color: #f59e0b;">jobs@pipingbox.com</a>.
        </p>
        <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e4e4e7; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #a1a1aa;">PipingBox \xB7 Industrial Workforce Solutions</p>
          <p style="margin: 4px 0 0; font-size: 11px; color: #d4d4d8;">Connecting skilled professionals with industrial projects worldwide</p>
        </div>
      </div>
    `;
    try {
      await transporter.sendMail({
        from: fromField,
        to: lead.email,
        replyTo,
        subject: "PipingBox Workforce Request Received",
        html: companyHtml
      });
    } catch (confirmError) {
      console.error(
        JSON.stringify({
          requestId,
          error: "company_confirmation_failed",
          leadId: lead.id,
          details: confirmError?.message
        })
      );
      return new Response(
        JSON.stringify({
          success: true,
          priority,
          emailsSent: "partial",
          adminNotified: true,
          reason: "Company confirmation failed"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.log(JSON.stringify({ requestId, action: "company_confirmation_sent", leadId: lead.id, provider: providerName }));
    return new Response(
      JSON.stringify({ success: true, priority, emailsSent: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error(JSON.stringify({ requestId, error: error.message, stack: error.stack }));
    if (supabase && claimedLeadId && !adminMailSent) {
      await releaseClaim(supabase, claimedLeadId, requestId, "unhandled_error");
    }
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
