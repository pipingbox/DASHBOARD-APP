import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    const {
      company_name,
      contact_person,
      email,
      country,
      workers_needed,
      start_date,
      number_of_workers,
      project_duration,
      message,
    } = body;

    if (!company_name || !email) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine priority
    const numWorkers = parseInt(number_of_workers || "0", 10);
    const isUrgentWorkers = numWorkers >= 10;
    const isUrgentDate = start_date && new Date(start_date) <= new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const priority = isUrgentWorkers || isUrgentDate ? "urgent" : "normal";

    // Update lead with priority in database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find the most recent lead by this email/company to update priority
    const { data: leads } = await supabase
      .from("app_14da0f1941_company_leads")
      .select("id")
      .eq("email", email)
      .eq("company_name", company_name)
      .order("created_at", { ascending: false })
      .limit(1);

    if (leads && leads.length > 0) {
      await supabase
        .from("app_14da0f1941_company_leads")
        .update({ priority })
        .eq("id", leads[0].id);
    }

    // Setup SMTP transport
    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "587", 10);
    const smtpSecure = Deno.env.get("SMTP_SECURE") !== "false";
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    const smtpFrom = Deno.env.get("SMTP_FROM") || "noreply@pipingbox.com";

    if (!smtpHost || !smtpUser || !smtpPassword) {
      console.log(JSON.stringify({ requestId, warning: "SMTP not configured, skipping emails" }));
      return new Response(
        JSON.stringify({ success: true, priority, emailsSent: false, reason: "SMTP not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: { user: smtpUser, pass: smtpPassword },
    });

    // Email 1: Notification to admin (jobs@pipingbox.com)
    const adminHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0a0a0a; color: #e4e4e7; border: 1px solid #27272a;">
        <div style="border-bottom: 1px solid #27272a; padding-bottom: 16px; margin-bottom: 24px;">
          <h1 style="margin: 0; font-size: 20px; color: #f59e0b;">⚡ New Workforce Request</h1>
          <p style="margin: 4px 0 0; font-size: 12px; color: #71717a; text-transform: uppercase; letter-spacing: 0.1em;">PipingBox Lead Pipeline</p>
        </div>
        ${priority === "urgent" ? '<div style="background: #7f1d1d; border: 1px solid #dc2626; padding: 8px 12px; margin-bottom: 16px; font-size: 12px; color: #fca5a5; text-transform: uppercase; letter-spacing: 0.05em;">🔴 URGENT PRIORITY</div>' : ""}
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr><td style="padding: 8px 0; color: #71717a; width: 140px;">Company</td><td style="padding: 8px 0; color: #fafafa; font-weight: 600;">${company_name}</td></tr>
          <tr><td style="padding: 8px 0; color: #71717a;">Contact</td><td style="padding: 8px 0; color: #fafafa;">${contact_person}</td></tr>
          <tr><td style="padding: 8px 0; color: #71717a;">Email</td><td style="padding: 8px 0; color: #fafafa;"><a href="mailto:${email}" style="color: #f59e0b;">${email}</a></td></tr>
          <tr><td style="padding: 8px 0; color: #71717a;">Country</td><td style="padding: 8px 0; color: #fafafa;">${country}</td></tr>
          <tr><td style="padding: 8px 0; color: #71717a;">Workers Needed</td><td style="padding: 8px 0; color: #fafafa;">${workers_needed}</td></tr>
          ${number_of_workers ? `<tr><td style="padding: 8px 0; color: #71717a;">Quantity</td><td style="padding: 8px 0; color: #fafafa;">${number_of_workers}</td></tr>` : ""}
          ${start_date ? `<tr><td style="padding: 8px 0; color: #71717a;">Start Date</td><td style="padding: 8px 0; color: #fafafa;">${start_date}</td></tr>` : ""}
          ${project_duration ? `<tr><td style="padding: 8px 0; color: #71717a;">Duration</td><td style="padding: 8px 0; color: #fafafa;">${project_duration}</td></tr>` : ""}
        </table>
        ${message ? `<div style="margin-top: 16px; padding: 12px; background: #18181b; border: 1px solid #27272a;"><p style="margin: 0 0 4px; font-size: 11px; color: #71717a; text-transform: uppercase; letter-spacing: 0.05em;">Message</p><p style="margin: 0; font-size: 14px; color: #d4d4d8;">${message}</p></div>` : ""}
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #27272a; font-size: 11px; color: #52525b;">
          PipingBox Recruitment Pipeline · ${new Date().toISOString().split("T")[0]}
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: smtpFrom,
      to: "jobs@pipingbox.com",
      subject: `New Workforce Request - ${company_name}`,
      html: adminHtml,
    });

    console.log(JSON.stringify({ requestId, action: "admin_email_sent", to: "jobs@pipingbox.com" }));

    // Email 2: Confirmation to company
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
          Dear ${contact_person},
        </p>
        <p style="font-size: 14px; color: #3f3f46; line-height: 1.6;">
          Thank you for reaching out to PipingBox. We have received your request for <strong>${workers_needed}</strong>${number_of_workers ? ` (${number_of_workers} workers)` : ""} in <strong>${country}</strong>.
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

    await transporter.sendMail({
      from: smtpFrom,
      to: email,
      subject: "PipingBox Workforce Request Received",
      html: companyHtml,
    });

    console.log(JSON.stringify({ requestId, action: "company_confirmation_sent", to: email }));

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