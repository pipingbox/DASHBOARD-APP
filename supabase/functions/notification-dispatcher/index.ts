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
//
// Correcciones de seguridad/robustez:
//   - No lee auth.users directamente; usa Auth Admin API (service_role).
//   - Concurrencia: reserva el batch atomico via RPC pb_claim_notification_batch
//     con FOR UPDATE SKIP LOCKED y estado 'processing'.
//   - Throttling: cuenta real de filas de delivery_logs (sin columna count).
//   - Procesa pending y scheduled.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createEmailProvider } from "../_shared/email-provider.ts";
import { renderActionEmail, resolveRecipientLanguage } from "../_shared/email-i18n/mod.ts";
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
    /** PB-I18N-EMAIL-001: plantilla estructurada para correo localizado. */
    email_template?: {
      template: "job_match" | "workforce_match";
      vars: Record<string, string | number | null | undefined>;
    };
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

/** Identidad mínima del destinatario resuelta vía Auth Admin API. */
interface RecipientIdentity {
  email: string | null;
  userMetadata: Record<string, unknown> | null;
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
  const appBaseUrl = (Deno.env.get("APP_BASE_URL") || "https://pipingbox.com").replace(/\/$/, "");

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const emailProvider = createEmailProvider();
  const whatsappProvider = createWhatsAppProvider();

  // 1. Atomically claim a batch of pending/scheduled rows into 'processing'.
  const { data: rows, error: claimError } = await supabase.rpc(
    "pb_claim_notification_batch",
    { p_batch_size: batchSize },
  );

  if (claimError) {
    return new Response(
      JSON.stringify({ error: claimError.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!rows || rows.length === 0) {
    return new Response(
      JSON.stringify({ processed: 0, message: "No pending notifications." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // 2. Prefetch candidate phones and preferences.
  const userIds = [...new Set((rows as QueueRow[]).map((r) => r.candidate_user_id))];

  const { data: profiles } = await supabase
    .from("app_14da0f1941_profiles")
    .select("user_id, phone_e164, phone_verified_at, whatsapp_opt_in, preferred_language")
    .in("user_id", userIds);

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

  // 3. Throttling counts via RPC.
  const { data: throttleCounts } = await supabase.rpc(
    "pb_delivery_counts_last_24h",
    { p_user_ids: userIds },
  );

  const sentCountByUserChannel = new Map<string, number>();
  for (const s of (throttleCounts || []) as { candidate_user_id: string; channel: string; sent_count: number }[]) {
    const key = `${s.candidate_user_id}:${s.channel}`;
    sentCountByUserChannel.set(key, s.sent_count);
  }

  // 4. Lazy identity resolver via Auth Admin API (email + user_metadata.lang).
  const identityCache = new Map<string, RecipientIdentity>();
  async function getRecipientIdentity(userId: string): Promise<RecipientIdentity> {
    const cached = identityCache.get(userId);
    if (cached) return cached;
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    const identity: RecipientIdentity = error || !data.user
      ? { email: null, userMetadata: null }
      : { email: data.user.email ?? null, userMetadata: (data.user.user_metadata as Record<string, unknown>) ?? null };
    identityCache.set(userId, identity);
    return identity;
  }

  // 5. Process each row
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const row of rows as QueueRow[]) {
    processed++;

    const profile = (profiles || []).find((p) => p.user_id === row.candidate_user_id);
    const prefs = prefsByUser.get(row.candidate_user_id);

    // Re-verify preferences. Absence of prefs means external channels are OFF.
    if (row.opportunity_type === "job" && prefs?.job_matching_enabled === false) {
      await finishQueueRow(supabase, row.id, "cancelled", "job_matching_disabled");
      continue;
    }
    if (row.opportunity_type === "workforce" && prefs?.workforce_invitations_enabled === false) {
      await finishQueueRow(supabase, row.id, "cancelled", "workforce_invitations_disabled");
      continue;
    }
    if (row.channel === "email" && prefs?.email_job_alerts !== true) {
      await finishQueueRow(supabase, row.id, "cancelled", "email_job_alerts_disabled");
      continue;
    }
    if (row.channel === "whatsapp" && prefs?.whatsapp_job_alerts !== true) {
      await finishQueueRow(supabase, row.id, "cancelled", "whatsapp_job_alerts_disabled");
      continue;
    }

    // Extra phone verification check for whatsapp channel.
    if (row.channel === "whatsapp" && !profile?.phone_verified_at) {
      await finishQueueRow(supabase, row.id, "cancelled", "phone_not_verified");
      continue;
    }
    if (row.channel === "whatsapp" && profile?.whatsapp_opt_in !== true) {
      await finishQueueRow(supabase, row.id, "cancelled", "whatsapp_opt_in_missing");
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
        const identity = await getRecipientIdentity(row.candidate_user_id);
        const email = identity.email;
        if (!email) {
          throw new Error("candidate_email_missing");
        }
        // PB-I18N-EMAIL-001: idioma del DESTINATARIO (nunca del actor):
        // user_metadata.lang → profiles.preferred_language → 'en'.
        const lang = resolveRecipientLanguage({
          userMetadata: identity.userMetadata,
          profileLanguage: profile?.preferred_language ?? null,
        });
        const tpl = row.payload.email_template;
        let subject = row.payload.title;
        let text: string = row.payload.message;
        let html: string | undefined;
        let templateName = "legacy_payload";
        if (tpl && (tpl.template === "job_match" || tpl.template === "workforce_match")) {
          const rendered = renderActionEmail({
            template: tpl.template,
            lang: lang.lang,
            actionUrl: `${appBaseUrl}${row.payload.action_url || "/dashboard"}`,
            vars: tpl.vars,
            showExpiry: false,
          });
          subject = rendered.subject;
          text = rendered.text;
          html = rendered.html;
          templateName = rendered.template;
        }
        const result = await emailProvider.send({
          to: email,
          subject,
          text,
          html,
          fromName: "PIPINGBOX",
          capture: {
            source: "notification-dispatcher",
            template: templateName,
            lang: lang.lang,
            langSource: lang.source,
            meta: { opportunity_type: row.opportunity_type, queue_id: row.id },
          },
        });
        deliveryStatus = "sent";
        provider = result.provider;
        providerMessageId = result.messageId ?? null;
      } else if (row.channel === "whatsapp") {
        if (!whatsappProvider.isConfigured()) {
          throw new Error("whatsapp_provider_not_configured");
        }
        if (!profile?.phone_e164) {
          throw new Error("candidate_phone_missing");
        }
        const result = await whatsappProvider.send({
          to: profile.phone_e164,
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

async function finishQueueRow(
  supabase: SupabaseClient,
  id: string,
  status: "cancelled" | "failed" | "sent",
  reason: string | null,
) {
  await supabase
    .from("app_14da0f1941_notification_queue")
    .update({
      status,
      failure_reason: reason,
      updated_at: new Date().toISOString(),
    })
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
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
}
