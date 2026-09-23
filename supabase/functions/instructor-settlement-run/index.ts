// Edge Function: instructor-settlement-run
// Purpose: PB-MARKET-NCR-LEDGER-001 (T7, PO GO 2026-09-23) — T+30 settlement.
//
//   SALE -> revenue events -> ledger entries -> (this function) settlement
//   -> self-billing invoice -> bank transfer -> PAID
//
// What it does, per run (admin-invoked or scheduled):
//   1. Matures PENDING ledger entries whose available_at (T+30) has passed
//      into AVAILABLE.
//   2. Groups AVAILABLE SALE_CREDIT entries per instructor, computes NET
//      REVENUE via the canonical formula (frozen on the settlement row,
//      coherence-enforced by the DB), applies the split snapshot and any
//      OFFSET from post-payout reversals, writes the settlement with
//      IMMUTABLE instructor + issuer snapshots, marks entries SCHEDULED,
//      and generates the DRAFT self-billing invoice.
//
// What it NEVER does:
//   * No recomputation of a frozen settlement. Corrections are new ledger
//     entries (OFFSET / RECOVERABLE), never edits.
//   * No payout execution: bank transfer is an operator act; this function
//     only schedules. PAID is marked by the operator after the transfer.
//   * No Stripe Connect. Payout rail = BANK_TRANSFER (DEC-66).
//
// Auth: admin JWT only. This moves money-adjacent state; it is never public.
//
// Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// DEC-59 tiers -> split. Percentages are channel-dependent CONFIG, never
// stored as a column on the instructor row (schema guard, FORBIDDEN list).
// STANDARD 70/30 is the reference model (DEC-65); the tier in force is
// snapshotted onto the settlement, so a later change never rewrites history.
const TIER_SPLIT_PCT: Record<string, number> = {
  STANDARD: 70,
  FOUNDING: 80,
  STRATEGIC: 85,
};

interface LedgerEntry {
  id: string;
  instructor_id: string;
  entry_type: string;
  status: string;
  amount_cents: number;
  currency: string;
  order_id: string | null;
  available_at: string | null;
  occurred_at: string;
  livemode: boolean | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Admin-only: identify the caller and check the role.
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return json({ error: "unauthorized" }, 401);

  const { data: profile } = await supabase
    .from("app_14da0f1941_profiles")
    .select("role")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (profile?.role !== "admin") return json({ error: "forbidden" }, 403);

  const now = new Date().toISOString();
  const report = { matured: 0, settlements_created: 0, instructors: [] as string[], errors: [] as string[] };

  // ---------------------------------------------------------------------------
  // 1. Mature PENDING entries whose T+30 window has elapsed.
  // ---------------------------------------------------------------------------
  const { data: matured, error: matureErr } = await supabase
    .from("app_instructor_ledger_entries")
    .update({ status: "AVAILABLE" })
    .eq("status", "PENDING")
    .lte("available_at", now)
    .select("id");

  if (matureErr) {
    console.error("settlement-run: maturity update failed", matureErr);
    return json({ error: "maturity_failed" }, 500);
  }
  report.matured = matured?.length ?? 0;

  // ---------------------------------------------------------------------------
  // 2. Settle AVAILABLE credits per instructor.
  // ---------------------------------------------------------------------------
  const { data: available, error: availErr } = await supabase
    .from("app_instructor_ledger_entries")
    .select("id, instructor_id, entry_type, status, amount_cents, currency, order_id, available_at, occurred_at, livemode")
    .eq("status", "AVAILABLE")
    .order("occurred_at", { ascending: true });

  if (availErr) {
    console.error("settlement-run: available read failed", availErr);
    return json({ error: "read_failed" }, 500);
  }

  const byInstructor = new Map<string, LedgerEntry[]>();
  for (const entry of (available ?? []) as LedgerEntry[]) {
    const list = byInstructor.get(entry.instructor_id) ?? [];
    list.push(entry);
    byInstructor.set(entry.instructor_id, list);
  }

  // The issuer: the ACTIVE LegalEntity (007). A settlement cannot be issued
  // without one — the invoice would assert a seller that does not exist.
  const { data: entity } = await supabase
    .from("app_legal_entities")
    .select("id, legal_name, trading_name, jurisdiction, legal_form, vat_number, registered_address, invoice_prefix")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!entity) {
    // Not an error worth failing the whole run for: maturity already happened
    // and is honest. Settlements simply cannot be issued yet.
    return json({ ...report, note: "no_active_legal_entity_settlements_skipped" });
  }

  const issuerSnapshot = {
    legal_entity_id: entity.id,
    legal_name: entity.legal_name,
    trading_name: entity.trading_name,
    jurisdiction: entity.jurisdiction,
    legal_form: entity.legal_form,
    vat_number: entity.vat_number,
    registered_address: entity.registered_address,
    snapshot_at: now,
  };

  for (const [instructorId, entries] of byInstructor) {
    try {
      // IMMUTABLE instructor snapshot: identity, tax residence, TIN/VAT,
      // address, IBAN, tier — as they are NOW. Later profile changes never
      // touch the settlement or the self-billing invoice (PO, T7).
      const { data: instructor, error: instrErr } = await supabase
        .from("app_marketplace_instructors")
        .select("id, legal_name, display_name, legal_form, tax_country, tax_identification_number, vat_number, legal_address, iban, revenue_share_tier")
        .eq("id", instructorId)
        .single();

      if (instrErr || !instructor) {
        report.errors.push(`instructor ${instructorId}: profile read failed`);
        continue;
      }

      const instructorSnapshot = {
        instructor_id: instructor.id,
        legal_name: instructor.legal_name,
        display_name: instructor.display_name,
        legal_form: instructor.legal_form,
        tax_residence_country: instructor.tax_country,
        tin: instructor.tax_identification_number,
        vat_number: instructor.vat_number,
        legal_address: instructor.legal_address,
        iban: instructor.iban,
        revenue_share_tier: instructor.revenue_share_tier,
        snapshot_at: now,
      };

      // Aggregate the facts. The split is NOT applied per-entry: Net Revenue
      // is computed from the period totals via the canonical formula, then
      // split once (DEC-65). Entry amounts carry the sale-side facts.
      const credits = entries.filter((e) => e.entry_type === "SALE_CREDIT");
      const offsets = entries.filter((e) => e.entry_type === "OFFSET");
      if (credits.length === 0) continue;

      const currency = credits[0].currency;
      const grossCents = credits.reduce((s, e) => s + Number(e.amount_cents), 0);
      const offsetCents = Math.abs(offsets.reduce((s, e) => s + Number(e.amount_cents), 0));

      // Tax/discount/fee facts for these sales come from the revenue events
      // attached to the same orders. Read them; the canonical formula
      // consumes exactly these deduction legs.
      const orderIds = credits.map((c) => c.order_id).filter(Boolean) as string[];
      const { data: eventFacts } = orderIds.length > 0
        ? await supabase
            .from("app_marketplace_revenue_events")
            .select("tax_amount_cents, discount_amount_cents, stripe_fee_cents")
            .eq("event_type", "SALE")
            .in("order_id", orderIds)
        : { data: [] as { tax_amount_cents: number | null; discount_amount_cents: number | null; stripe_fee_cents: number | null }[] };

      const taxCents = (eventFacts ?? []).reduce((s, e) => s + (e.tax_amount_cents ?? 0), 0);
      const discountCents = (eventFacts ?? []).reduce((s, e) => s + (e.discount_amount_cents ?? 0), 0);
      const feeCents = (eventFacts ?? []).reduce((s, e) => s + (e.stripe_fee_cents ?? 0), 0);

      // CANONICAL Net Revenue (app_net_revenue_cents — the only
      // implementation). Computed via RPC so the formula lives in ONE place
      // (the database), not re-implemented here.
      const { data: netRevenueCents, error: ncrErr } = await supabase.rpc(
        "app_net_revenue_cents",
        {
          p_gross_cents: grossCents,
          p_tax_cents: taxCents,
          p_discounts_cents: discountCents,
          p_refunds_cents: 0, // refunds arrive as their own ledger entries
          p_chargebacks_cents: 0,
          p_fees_cents: feeCents,
        },
      );
      if (ncrErr || netRevenueCents == null) {
        report.errors.push(`instructor ${instructorId}: NCR computation failed`);
        continue;
      }

      const splitPct = TIER_SPLIT_PCT[instructor.revenue_share_tier ?? "STANDARD"] ?? 70;
      const instructorShareCents = Math.round((Number(netRevenueCents) * splitPct) / 100);
      const platformShareCents = Number(netRevenueCents) - instructorShareCents;
      const payableCents = instructorShareCents - offsetCents;

      if (payableCents <= 0) {
        // Nothing payable this cycle (offsets ate the share). Entries stay
        // AVAILABLE for the next run; no settlement with a non-positive
        // payable is ever created.
        continue;
      }

      const periodStart = credits[0].occurred_at;
      const periodEnd = now;

      const { data: settlement, error: settleErr } = await supabase
        .from("app_settlements")
        .insert({
          instructor_id: instructorId,
          legal_entity_id: entity.id,
          period_start: periodStart,
          period_end: periodEnd,
          currency,
          gross_cents: grossCents,
          tax_cents: taxCents,
          discounts_cents: discountCents,
          refunds_cents: 0,
          chargebacks_cents: 0,
          fees_cents: feeCents,
          net_revenue_cents: netRevenueCents,
          instructor_share_pct: splitPct,
          instructor_share_cents: instructorShareCents,
          platform_share_cents: platformShareCents,
          offset_applied_cents: offsetCents,
          payable_cents: payableCents,
          instructor_snapshot: instructorSnapshot,
          issuer_snapshot: issuerSnapshot,
          status: "SCHEDULED",
          payout_rail: "BANK_TRANSFER",
          livemode: credits[0].livemode,
        })
        .select("id")
        .single();

      if (settleErr || !settlement) {
        console.error("settlement-run: settlement insert failed", settleErr);
        report.errors.push(`instructor ${instructorId}: settlement insert failed`);
        continue;
      }

      // Mark entries SCHEDULED under this settlement (lifecycle move only).
      const entryIds = entries.map((e) => e.id);
      const { error: linkErr } = await supabase
        .from("app_instructor_ledger_entries")
        .update({ status: "SCHEDULED", settlement_id: settlement.id })
        .in("id", entryIds);
      if (linkErr) {
        console.error("settlement-run: entry link failed", linkErr);
        report.errors.push(`instructor ${instructorId}: entry link failed`);
        continue;
      }

      // Self-billing invoice (DRAFT) with atomic per-issuer numbering.
      const { data: invoiceNumber, error: numErr } = await supabase.rpc(
        "app_next_self_billing_number",
        { p_legal_entity_id: entity.id },
      );
      if (numErr || !invoiceNumber) {
        report.errors.push(`instructor ${instructorId}: invoice numbering failed`);
        continue;
      }

      const { error: sbiErr } = await supabase
        .from("app_self_billing_invoices")
        .insert({
          settlement_id: settlement.id,
          instructor_id: instructorId,
          legal_entity_id: entity.id,
          invoice_number: invoiceNumber,
          period_start: periodStart,
          period_end: periodEnd,
          currency,
          net_revenue_cents: netRevenueCents,
          instructor_share_cents: instructorShareCents,
          payable_cents: payableCents,
          instructor_snapshot: instructorSnapshot,
          issuer_snapshot: issuerSnapshot,
          status: "DRAFT",
          livemode: credits[0].livemode,
        });
      if (sbiErr) {
        console.error("settlement-run: self-billing insert failed", sbiErr);
        report.errors.push(`instructor ${instructorId}: self-billing insert failed`);
        continue;
      }

      report.settlements_created += 1;
      report.instructors.push(instructorId);
    } catch (err) {
      console.error("settlement-run: instructor failed", instructorId, err);
      report.errors.push(`instructor ${instructorId}: exception`);
    }
  }

  return json(report);
});
