import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Window in which a freshly inserted lead may still be notified. The public
// form inserts the row and calls this function immediately afterwards, so a
// few minutes is generous. Anything older is a replay attempt.
const LEAD_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * Every value below is attacker-controlled: the form is public and the leads
 * table accepts anonymous inserts. Interpolating any of it raw into an HTML
 * mail sent from noreply@pipingbox.com lets a stranger put arbitrary links
 * and markup inside a message that looks like it came from us.
 */
function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Long fields would let someone push a novel into jobs@pipingbox.com, or blow
// past the SMTP message size limit and break delivery for everyone.
function clamp(value: unknown, max: number): string {
  const s = escapeHtml(value);
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  console.log(JSON.stringify({ requestId, method: req.method, url: req.url }));

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    let body: any;
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // The lead row — not the request body — is the source of truth.
    //
    // Previously this function mailed whatever arrived in the payload, to
    // whatever address arrived in the payload. That made it an open relay:
    // anyone could send branded PipingBox mail to anyone. Now the row must
    // already exist, and every value that reaches the message comes from it.
    const { data: leads, error: leadError } = await supabase
      .from("app_14da0f1941_company_leads")
      .select(
        "id, created_at, notified_at, company_name, contact_person, email, country, workers_needed, start_date, number_of_workers, project_duration, message"
      )
      .eq("email", email)
      .eq("company_name", company_name)
      .order("created_at", { ascending: false })
      .limit(1);

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

    // One mail per lead, ever. Without this, a single stored row could be
    // replayed thousands of times: one form submission, unlimited mail.
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

    // Claim the lead before sending. Two concurrent calls race here; the one
    // that finds the row already claimed stops. Better to occasionally lose a
    // mail than to occasionally send it twice.
    const { data: claimed, error: claimError } = await supabase
      .from("app_14da0f1941_company_leads")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", lead.id)
      .is("notified_at", null)
      .select("id");

    if (claimError || !claimed || claimed.length === 0) {
      console.log(JSON.stringify({ requestId, skipped: "claim_lost", leadId: lead.id }));
      return new Response(
        JSON.stringify({ success: true, emailsSent: false, reason: "Already notified" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const numWorkers = parseInt(lead.number_of_workers || "0", 10);
    const isUrgentWorkers = numWorkers >= 10;
    const isUrgentDate =
      lead.start_date && new Date(lead.start_date) <= new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const priority = isUrgentWorkers || isUrgentDate ? "urgent" : "normal";

    await supabase
      .from("app_14da0f1941_company_leads")
      .update({ priority })
      .eq("id", lead.id);

    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "587", 10);
    const smtpSecure = Deno.env.get("SMTP_SECURE") !== "false";
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    const smtpFrom = Deno.env.get("SMTP_FROM") || "noreply@pipingbox.com";

    if (!smtpHost || !smtpUser || !smtpPassword) {
      // Release the claim: nothing was sent, so a later retry should be able
      // to send. Leaving it claimed would silently lose the lead's mail.
      await supabase
        .from("app_14da0f1941_company_leads")
        .update({ notified_at: null })
        .eq("id", lead.id);

      console.log(JSON.stringify({ requestId, warning: "SMTP not configured, skipping emails" }));
      return new Response(
        JSON.stringify({ success: true, priority, emailsSent: false, reason: "SMTP not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Every interpolation below is escaped and length-capped.
    const safe = {
      company_name: clamp(lead.company_name, 200),
      contact_person: clamp(lead.contact_person, 200),
      email: clamp(lead.email, 320),
      country: clamp(lead.country, 100),
      workers_needed: clamp(lead.workers_needed, 200),
      number_of_workers: clamp(lead.number_of_workers, 20),
      start_date: clamp(lead.start_date, 40),
      project_duration: clamp(lead.project_duration, 100),
      message: clamp(lead.message, 2000),
    };

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: { user: smtpUser, pass: smtpPassword },
    });

    const adminHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0a0a0a; color: #e4e4e7; border: 1px solid #27272a;">
        <div style="border-bottom: 1px solid #27272a; padding-bottom: 16px; margin-bottom: 24px;">
          <h1 style="margin: 0; font-size: 20px; color: #f59e0b;">⚡ New Workforce Request</h1>
          <p style="margin: 4px 0 0; font-size: 12px; color: #71717a; text-transform: uppercase; letter-spacing: 0.1em;">PipingBox Lead Pipeline</p>
        </div>
        ${priority === "urgent" ? '<div style="background: #7f1d1d; border: 1px solid #dc2626; padding: 8px 12px; margin-bottom: 16px; font-size: 12px; color: #fca5a5; text-transform: uppercase; letter-spacing: 0.05em;">🔴 URGENT PRIORITY</div>' : ""}
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
          PipingBox Recruitment Pipeline · ${new Date().toISOString().split("T")[0]} · lead ${lead.id}
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: smtpFrom,
      to: "jobs@pipingbox.com",
      subject: `New Workforce Request - ${lead.company_name}`,
      html: adminHtml,
    });

    console.log(JSON.stringify({ requestId, action: "admin_email_sent", to: "jobs@pipingbox.com", leadId: lead.id }));

    const companyHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #ffffff; color: #18181b;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="margin: 0; font-size: 24px; color: #18181b;">PipingBox</h1>
          <p style="margin: 4px 0 0; font-size: 12px; color: #71717a; text-transform: uppercase; letter-spacing: 0.15em;">Industrial Workforce Solutions</p>
        </div>
        <div style="background: #f4f4f5; border-left: 3px solid #f59e0b; padding: 16px 20px; margin-bottom: 24px;">
          <h2 style="margin: 0 0 4px; font-size: 16px; color: #18181b;">Request Received ✓</h2>
          <p style="margin: 0; font-size: 14px; color: #52525b;">Your workforce request has been successfully submitted.</p>
        </div>
        <p style="font-size: 14px; color: #3f3f46; line-height: 1.6;">
          Dear ${safe.contact_person},
        </p>
        <p style="font-size: 14px; color: #3f3f46; line-height: 1.6;">
          Thank you for reaching out to PipingBox. We have received your request for <strong>${safe.workers_needed}</strong>${safe.number_of_workers ? ` (${safe.number_of_workers} workers)` : ""} in <strong>${safe.country}</strong>.
        </p>
        <p style="font-size: 14px; color: #3f3f46; line-height: 1.6;">
          Our recruitment team will review your requirements and get back to you within <strong>24–48 hours</strong> with a tailored proposal including candidate profiles and availability.
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
          <p style="margin: 0; font-size: 12px; color: #a1a1aa;">PipingBox · Industrial Workforce Solutions</p>
          <p style="margin: 4px 0 0; font-size: 11px; color: #d4d4d8;">Connecting skilled professionals with industrial projects worldwide</p>
        </div>
      </div>
    `;

    // Sent to the address stored on the lead row, never to an address taken
    // from the request body.
    await transporter.sendMail({
      from: smtpFrom,
      to: lead.email,
      subject: "PipingBox Workforce Request Received",
      html: companyHtml,
    });

    console.log(JSON.stringify({ requestId, action: "company_confirmation_sent", leadId: lead.id }));

    return new Response(
      JSON.stringify({ success: true, priority, emailsSent: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error(JSON.stringify({ requestId, error: error.message, stack: error.stack }));
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
