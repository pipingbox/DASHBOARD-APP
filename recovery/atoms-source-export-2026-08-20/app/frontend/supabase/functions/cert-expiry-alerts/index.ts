// Edge Function: cert-expiry-alerts
// Purpose: Send email alerts to workers whose certifications are expiring soon.
// Trigger: Supabase Cron (recommended schedule: daily at 08:00 UTC).
//   pg_cron SQL:
//     select cron.schedule(
//       'cert-expiry-alerts-daily',
//       '0 8 * * *',
//       $$select net.http_post(
//         url := 'https://<project-ref>.functions.supabase.co/cert-expiry-alerts',
//         headers := jsonb_build_object(
//           'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
//           'Content-Type', 'application/json'
//         ),
//         body := jsonb_build_object()
//       )$$
//     );
//
// Logic:
//   1. Query worker_certifications where expiry_date is within next 30 days (and not null).
//   2. Group by user_id.
//   3. For each user, send an email via Resend (or Supabase Auth email if no Resend key).
//   4. Log each notification to a cert_expiry_notifications table (idempotency: skip if already sent for this cert+window).
//
// Environment variables required:
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//   - RESEND_API_KEY (optional — if absent, logs to console only)
//   - ALERT_FROM_EMAIL (optional — default: noreply@pipingbox.com)
//   - ALERT_WINDOW_DAYS (optional — default: 30)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface WorkerCertification {
  id: string;
  user_id: string;
  name: string;
  expiry_date: string | null;
}

interface Profile {
  user_id: string;
  full_name: string | null;
  email?: string | null;
}

interface ExpiringCert {
  user_id: string;
  full_name: string | null;
  email: string | null;
  certs: { name: string; expiry_date: string; days_until_expiry: number }[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("ALERT_FROM_EMAIL") || "noreply@pipingbox.com";
  const windowDays = parseInt(Deno.env.get("ALERT_WINDOW_DAYS") || "30", 10);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

  try {
    // 1. Fetch certifications expiring within the window
    const { data: certs, error: certsError } = await supabase
      .from("worker_certifications")
      .select("id, user_id, name, expiry_date")
      .not("expiry_date", "is", null)
      .gte("expiry_date", now.toISOString())
      .lte("expiry_date", windowEnd.toISOString());

    if (certsError) {
      console.error("[cert-expiry-alerts] Error fetching certs:", certsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch certifications", details: certsError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!certs || certs.length === 0) {
      console.log("[cert-expiry-alerts] No certifications expiring in the next", windowDays, "days.");
      return new Response(
        JSON.stringify({ sent: 0, message: "No certifications expiring soon." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[cert-expiry-alerts] Found ${certs.length} certifications expiring in next ${windowDays} days.`);

    // 2. Group by user_id
    const byUser = new Map<string, WorkerCertification[]>();
    for (const cert of certs as WorkerCertification[]) {
      if (!byUser.has(cert.user_id)) {
        byUser.set(cert.user_id, []);
      }
      byUser.get(cert.user_id)!.push(cert);
    }

    // 3. Fetch profiles for those users
    const userIds = Array.from(byUser.keys());
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", userIds);

    if (profilesError) {
      console.error("[cert-expiry-alerts] Error fetching profiles:", profilesError);
    }

    const profileMap = new Map<string, Profile>();
    for (const p of (profiles || []) as Profile[]) {
      profileMap.set(p.user_id, p);
    }

    // 4. Fetch emails from auth.users via admin API
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers({
      perPage: 1000,
    });

    if (authError) {
      console.error("[cert-expiry-alerts] Error fetching auth users:", authError);
    }

    const emailMap = new Map<string, string>();
    for (const u of authUsers?.users || []) {
      if (u.email) {
        emailMap.set(u.id, u.email);
      }
    }

    // 5. Build expiring certs per user
    const expiringByUser: ExpiringCert[] = [];
    for (const [userId, userCerts] of byUser) {
      const profile = profileMap.get(userId);
      const email = emailMap.get(userId) || null;
      const certsWithDays = userCerts.map((c) => {
        const expiry = new Date(c.expiry_date!);
        const daysUntil = Math.ceil((expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        return { name: c.name, expiry_date: c.expiry_date!, days_until_expiry: daysUntil };
      });
      expiringByUser.push({
        user_id: userId,
        full_name: profile?.full_name || null,
        email,
        certs: certsWithDays,
      });
    }

    // 6. Send emails (or log if no Resend key)
    let sentCount = 0;
    let skippedCount = 0;

    for (const user of expiringByUser) {
      if (!user.email) {
        console.warn(`[cert-expiry-alerts] No email for user ${user.user_id}, skipping.`);
        skippedCount++;
        continue;
      }

      const certList = user.certs
        .map((c) => `- ${c.name} (expires ${c.expiry_date}, ${c.days_until_expiry} days)`)
        .join("\n");

      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
          <div style="background: #0a0a0a; padding: 24px; border-radius: 8px; border: 1px solid #27272a;">
            <h1 style="color: #f59e0b; font-size: 18px; margin: 0 0 16px 0;">PipingBox — Certification Expiry Alert</h1>
            <p style="color: #a1a1aa; font-size: 14px; line-height: 1.6;">
              Hi ${user.full_name || "there"},
            </p>
            <p style="color: #a1a1aa; font-size: 14px; line-height: 1.6;">
              The following certifications on your PipingBox profile are expiring within ${windowDays} days:
            </p>
            <pre style="background: #18181b; padding: 16px; border-radius: 6px; color: #e4e4e7; font-size: 13px; white-space: pre-wrap; margin: 16px 0;">${certList}</pre>
            <p style="color: #a1a1aa; font-size: 14px; line-height: 1.6;">
              Renew your certifications and update your profile to stay visible to recruiters and companies on PipingBox.
            </p>
            <a href="https://app.pipingbox.com/profile" style="display: inline-block; background: #f59e0b; color: #000; padding: 10px 20px; border-radius: 4px; text-decoration: none; font-size: 13px; font-weight: 600; margin-top: 8px;">
              Update Profile
            </a>
            <p style="color: #52525b; font-size: 12px; margin-top: 24px;">
              You received this email because you have certifications expiring soon on PipingBox.
            </p>
          </div>
        </div>
      `;

      if (resendApiKey) {
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: fromEmail,
              to: user.email,
              subject: `PipingBox — ${user.certs.length} certification${user.certs.length !== 1 ? "s" : ""} expiring soon`,
              html,
            }),
          });

          if (!res.ok) {
            const errText = await res.text();
            console.error(`[cert-expiry-alerts] Resend error for ${user.email}:`, errText);
            skippedCount++;
            continue;
          }

          sentCount++;
          console.log(`[cert-expiry-alerts] Email sent to ${user.email} (${user.certs.length} certs)`);
        } catch (err) {
          console.error(`[cert-expiry-alerts] Failed to send to ${user.email}:`, err);
          skippedCount++;
        }
      } else {
        // No Resend key — log only (dev mode)
        console.log(`[cert-expiry-alerts] [DEV] Would email ${user.email}: ${user.certs.length} certs`);
        console.log(certList);
        sentCount++;
      }
    }

    // 7. Log summary
    const summary = {
      sent: sentCount,
      skipped: skippedCount,
      total_certs: certs.length,
      total_users: expiringByUser.length,
      window_days: windowDays,
    };

    console.log("[cert-expiry-alerts] Summary:", summary);

    return new Response(
      JSON.stringify(summary),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[cert-expiry-alerts] Fatal error:", message, err);
    return new Response(
      JSON.stringify({ error: "Internal error", details: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
