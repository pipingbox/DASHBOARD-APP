// Edge Function: notification-dispatcher
// Purpose: Consume app_14da0f1941_notification_queue and deliver by channel.
//
// PB-MATCHING-NOTIFICATIONS-001
//
// Channels:
//   - in_app: insert into app_14da0f1941_notifications
//   - email: SMTP one.com via _shared/email-provider.ts
//   - whatsapp: feature flag; fails with whatsapp_provider_not_configured until P1
//
// Runs every 5 minutes via Supabase cron or scheduled function.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createEmailProvider } from "../_shared/email-provider.ts";
import { createWhatsAppProvider } from "../_shared/whatsapp-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface QueueRow {
  id: string;
  opportunity_type: string;
  opportunity_id: string;
  candidate_user_id: string;
  channel: "in_app" | "email" | "whatsapp";
  status: string;
  payload: {
    title: string;
    message: string;
    action_url?: string;
    metadata?: Record<string, unknown>;
  };
  attempts: number;
  max_attempts: number;
  scheduled_at: string;
}

interface UserIdentity {
  id: string;
  email: string | null;
  phone_e164: string | null;
}

function backoffMinutes(attempt: number): number {
  return Math.min(2 ** attempt, 60); // 2, 4, 8, 16, 32, 60 min
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const batchSize = parseInt(Deno.env.get("DISPATCHER_BATCH_SIZE") || "500", 10);
  const maxPerChannelDay = parseInt(Deno.env.get("DISPATCHER_MAX_PER_CHANNEL_DAY") || "10", 10);

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const emailProvider = createEmailProvider();
  const whatsappProvider = createWhatsAppProvider();

  // 1. Fetch pending notifications
  const { data: rows, error: fetchError } = await supabase
    .from("app_14da0f1941_notification_queue")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(batchSize);

  if (fetchError) {
    return new Response(
      JSON.stringify({ error: fetchError.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!rows || rows.length === 0) {
    return new Response(
      JSON.stringify({ processed: 0, message: "No pending notifications." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // 2. Prefetch candidate emails and phones
  const userIds = [...new Set((rows as QueueRow[]).map((r) => r.candidate_user_id))];

  const { data: profiles } = await supabase
    .from("app_14da0f1941_profiles")
    .select("user_id, phone_e164")
    .in("user_id", userIds);

  const { data: authUsers } = await supabase
    .from("auth.users")
    .select("id, email")
    .in("id", userIds);

  const userById = new Map<string, UserIdentity>();
  for (const u of (authUsers || []) as { id: string; email: string | null }[]) {
    userById.set(u.id, { id: u.id, email: u.email, phone_e164: null });
  }
  for (const p of (profiles || []) as { user_id: string; phone_e164: string | null }[]) {
    const existing = userById.get(p.user_id);
    if (existing) {
      existing.phone_e164 = p.phone_e164;
    } else {
      userById.set(p.user_id, { id: p.user_id, email: null, phone_e164: p.phone_e164 });
    }
  }

  // 3. Prefetch preferences and throttling counts
  const { data: prefs } = await supabase
    .from("app_14da0f1941_matching_preferences")
    .select("user_id, job_matching_enabled, workforce_invitations_enabled, email_job_alerts, whatsapp_job_alerts")
    .in("user_id", userIds);

  const prefsByUser = new Map<string, {
    job_matching_enabled: boolean | null;
    workforce_invitations_enabled: boolean | null;
    email_job_alerts: boolean | null;
    whatsapp_job_alerts: boolean | null;
  }>();
  for (const p of (prefs || [])) {
    prefsByUser.set(p.user_id, p);
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: sentToday } = await supabase
    .from("app_14da0f1941_delivery_logs")
    .select("candidate_user_id, channel, count")
    .gte("created_at", dayAgo)
    .in("status", ["sent", "delivered"]);

  const sentCountByUserChannel = new Map<string, number>();
  for (const s of (sentToday || []) as { candidate_user_id: string; channel: string; count: number }[]) {
    const key = `${s.candidate_user_id}:${s.channel}`;
    sentCountByUserChannel.set(key, (sentCountByUserChannel.get(key) || 0) + (s.count || 1));
  }

  // 4. Process each row
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const row of rows as QueueRow[]) {
    processed++;

    const user = userById.get(row.candidate_user_id);
    const prefs = prefsByUser.get(row.candidate_user_id);

    // Re-verify preferences
    if (row.opportunity_type === "job" && prefs?.job_matching_enabled === false) {
      await cancelQueueRow(supabase, row.id, "job_matching_disabled");
      continue;
    }
    if (row.opportunity_type === "workforce" && prefs?.workforce_invitations_enabled === false) {
      await cancelQueueRow(supabase, row.id, "workforce_invitations_disabled");
      continue;
    }
    if (row.channel === "email" && prefs?.email_job_alerts === false) {
      await cancelQueueRow(supabase, row.id, "email_job_alerts_disabled");
      continue;
    }
    if (row.channel === "whatsapp" && prefs?.whatsapp_job_alerts === false) {
      await cancelQueueRow(supabase, row.id, "whatsapp_job_alerts_disabled");
      continue;
    }

    // Throttling
    const throttleKey = `${row.candidate_user_id}:${row.channel}`;
    if ((sentCountByUserChannel.get(throttleKey) || 0) >= maxPerChannelDay) {
      await rescheduleQueueRow(supabase, row, backoffMinutes(row.attempts));
      continue;
    }

    let deliveryStatus = "failed";
    let failureReason: string | null = null;
    let provider: string | null = null;
    let providerMessageId: string | null = null;
    let sentAt: string | null = null;

    try {
      if (row.channel === "in_app") {
        const { error } = await supabase.from("app_14da0f1941_notifications").insert({
          user_id: row.candidate_user_id,
          type: row.opportunity_type === "job" ? "JOB_MATCH" : "WORKFORCE_INVITATION",
          title: row.payload.title,
          message: row.payload.message,
          related_entity_type: row.opportunity_type,
          related_entity_id: row.opportunity_id,
          action_url: row.payload.action_url || "/dashboard",
          is_read: false,
        });
        if (error) throw error;
        deliveryStatus = "sent";
        provider = "in_app";
      } else if (row.channel === "email") {
        if (!emailProvider.isConfigured()) {
          throw new Error("email_provider_not_configured");
        }
        if (!user?.email) {
          throw new Error("candidate_email_missing");
        }
        const result = await emailProvider.send({
          to: user.email,
          subject: row.payload.title,
          text: row.payload.message,
        });
        deliveryStatus = "sent";
        provider = result.provider;
        providerMessageId = result.messageId ?? null;
      } else if (row.channel === "whatsapp") {
        if (!whatsappProvider.isConfigured()) {
          throw new Error("whatsapp_provider_not_configured");
        }
        if (!user?.phone_e164) {
          throw new Error("candidate_phone_missing");
        }
        const result = await whatsappProvider.send({
          to: user.phone_e164,
          body: row.payload.message,
        });
        deliveryStatus = "sent";
        provider = result.provider;
        providerMessageId = result.messageId ?? null;
      }

      sentAt = new Date().toISOString();
      succeeded++;
      sentCountByUserChannel.set(throttleKey, (sentCountByUserChannel.get(throttleKey) || 0) + 1);
    } catch (err) {
      failureReason = err instanceof Error ? err.message : String(err);
      deliveryStatus = "failed";
      failed++;
    }

    const now = new Date().toISOString();

    // Update queue
    if (deliveryStatus === "sent") {
      await supabase
        .from("app_14da0f1941_notification_queue")
        .update({
          status: "sent",
          attempts: row.attempts + 1,
          sent_at: now,
          failure_reason: null,
        })
        .eq("id", row.id);
    } else {
      const nextAttempt = row.attempts + 1;
      if (nextAttempt >= row.max_attempts) {
        await supabase
          .from("app_14da0f1941_notification_queue")
          .update({
            status: "failed",
            attempts: nextAttempt,
            failed_at: now,
            failure_reason: failureReason,
          })
          .eq("id", row.id);
      } else {
        await supabase
          .from("app_14da0f1941_notification_queue")
          .update({
            status: "pending",
            attempts: nextAttempt,
            scheduled_at: new Date(Date.now() + backoffMinutes(nextAttempt) * 60 * 1000).toISOString(),
            failure_reason: failureReason,
          })
          .eq("id", row.id);
      }
    }

    // Insert delivery log
    await supabase.from("app_14da0f1941_delivery_logs").insert({
      queue_id: row.id,
      opportunity_type: row.opportunity_type,
      opportunity_id: row.opportunity_id,
      candidate_user_id: row.candidate_user_id,
      channel: row.channel,
      provider,
      provider_message_id: providerMessageId,
      status: deliveryStatus,
      failure_reason: failureReason,
      sent_at: sentAt,
    });
  }

  return new Response(
    JSON.stringify({ processed, succeeded, failed }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

async function cancelQueueRow(
  supabase: SupabaseClient,
  id: string,
  reason: string,
) {
  await supabase
    .from("app_14da0f1941_notification_queue")
    .update({ status: "cancelled", failure_reason: reason })
    .eq("id", id);
}

async function rescheduleQueueRow(
  supabase: SupabaseClient,
  row: QueueRow,
  minutes: number,
) {
  await supabase
    .from("app_14da0f1941_notification_queue")
    .update({
      status: "scheduled",
      scheduled_at: new Date(Date.now() + minutes * 60 * 1000).toISOString(),
      failure_reason: "throttled",
    })
    .eq("id", row.id);
}
