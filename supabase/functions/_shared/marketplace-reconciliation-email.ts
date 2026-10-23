import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveRecipientLanguage } from "./email-i18n/languages.ts";
import { renderMarketplaceReconciliationEmail, type Requirement } from "./email-i18n/reconciliation.ts";
import { createEmailProvider, type EmailProvider } from "./email-provider.ts";

type OutboxRow = { user_id: string; batch_id: string; state: string };

type Dependencies = { supabase: SupabaseClient; emailProvider?: EmailProvider; appBaseUrl?: string };

export async function drainMarketplaceReconciliationEmails(deps: Dependencies, batchId: string, limit = 10) {
  const { supabase } = deps;
  const { data: rows, error } = await supabase
    .from("app_14da0f1941_marketplace_reconcile_emails")
    .select("user_id, batch_id, state")
    .eq("batch_id", batchId)
    .in("state", ["pending", "failed", "claimed"])
    .order("created_at", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 50)) as { data: OutboxRow[] | null; error: unknown };
  if (error) throw new Error("reconcile_outbox_unavailable");

  const results: { userId: string; outcome: string }[] = [];
  for (const row of rows ?? []) {
    const { data: claims, error: claimError } = await supabase.rpc("pb_claim_marketplace_reconcile_email", {
      p_user_id: row.user_id, p_max_attempts: 3, p_lease_seconds: 120,
    });
    const claim = Array.isArray(claims) ? claims[0] : claims;
    if (claimError || !claim?.claimed || !claim?.claim_id) {
      results.push({ userId: row.user_id, outcome: claimError ? "claim_error" : claim?.reason ?? "not_claimed" });
      continue;
    }
    const claimId = claim.claim_id as string;
    let sendStarted = false;
    try {
      const { data: profile, error: profileError } = await supabase
        .from("app_14da0f1941_profiles")
        .select("marketplace_ready, preferred_language, profile_completion, profile_visibility, cv_visible")
        .eq("user_id", row.user_id).single();
      if (profileError || !profile) throw new Error("profile_unavailable");
      if (profile.marketplace_ready === true) {
        const { data: skipped, error: skipError } = await supabase.rpc("pb_finalize_marketplace_reconcile_email", {
          p_user_id: row.user_id, p_claim_id: claimId, p_outcome: "skipped",
        });
        if (skipError || skipped !== true) throw new Error("skip_finalize_failed");
        results.push({ userId: row.user_id, outcome: "already_ready" });
        continue;
      }

      const { data: authData, error: authError } = await supabase.auth.admin.getUserById(row.user_id);
      if (authError || !authData.user?.email) throw new Error("email_unavailable");
      const { data: missingData, error: missingError } = await supabase.rpc(
        "pb_marketplace_missing_requirements_for", { p_user_id: row.user_id, p_declared_consent: true },
      );
      const requirements = ["cv", "certificate", "availability", "consent", "completion"] as const;
      if (missingError || !Array.isArray(missingData) || missingData.length === 0 ||
          !missingData.every((key) => (requirements as readonly string[]).includes(key))) {
        throw new Error("missing_reasons_unavailable");
      }
      const missing: Requirement[] = missingData;
      const { data: phonePresent, error: phoneError } = await supabase.rpc(
        "pb_marketplace_phone_present", { p_user_id: row.user_id },
      );

      const lang = resolveRecipientLanguage({
        userMetadata: authData.user.user_metadata ?? null,
        profileLanguage: profile.preferred_language ?? null,
      });
      const rendered = renderMarketplaceReconciliationEmail({
        lang: lang.lang,
        actionUrl: `${(deps.appBaseUrl ?? Deno.env.get("APP_BASE_URL") ?? "https://pipingbox.com").replace(/\/$/, "")}/profile`,
        missing,
        phoneMissing: !phoneError && phonePresent === false,
      });
      const { data: marked, error: markError } = await supabase.rpc("pb_mark_marketplace_reconcile_email_send", {
        p_user_id: row.user_id, p_claim_id: claimId,
      });
      if (markError || marked !== true) throw new Error("mark_send_failed");
      sendStarted = true;
      const delivery = await (deps.emailProvider ?? createEmailProvider()).send({
        to: authData.user.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        capture: { source: "marketplace-reconciliation-email", template: "marketplace_reconciliation",
          lang: lang.lang, langSource: lang.source, meta: { batch_id: row.batch_id, missing } },
      });
      const { data: finalized, error: finalizeError } = await supabase.rpc("pb_finalize_marketplace_reconcile_email", {
        p_user_id: row.user_id, p_claim_id: claimId, p_outcome: "sent", p_message_id: delivery.messageId ?? null,
      });
      if (finalizeError || finalized !== true) throw new Error("send_finalize_failed");
      results.push({ userId: row.user_id, outcome: "sent" });
    } catch (error) {
      await supabase.rpc("pb_finalize_marketplace_reconcile_email", {
        p_user_id: row.user_id, p_claim_id: claimId, p_outcome: "failed",
        p_last_error: error instanceof Error ? error.message : "unknown_error",
      });
      results.push({ userId: row.user_id, outcome: sendStarted ? "ambiguous" : "failed" });
    }
  }
  return results;
}
