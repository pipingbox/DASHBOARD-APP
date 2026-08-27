// Edge Function: stripe-webhook
// Purpose: The single place where access is granted. Verifies Stripe's signature,
//   deduplicates deliveries, and applies the effect of each payment event.
// Ticket: brain/06-EXECUTION/TICKETS/EXECUTING/PB-STRIPE-001.md (Fase 4)
// Spec:   brain/10-CORPORATE/STRIPE_INTEGRATION_SPEC.md §6
//
// DEPLOY NOTE — verify_jwt MUST be false for this function.
//   Stripe does not send a Supabase JWT. Authentication here is the signature
//   check below, which is stronger: it proves the payload came from Stripe and
//   was not altered. Deploy with:
//       supabase functions deploy stripe-webhook --no-verify-jwt
//   (create-checkout is the opposite: it MUST keep verify_jwt = true.)
//
// Endpoint URL to register in Stripe:
//   https://mwdauubztjxkbrefirbg.supabase.co/functions/v1/stripe-webhook
//
// Events handled (SPEC §6.1):
//   checkout.session.completed      → mark paid / create subscription, grant access
//   invoice.paid                    → extend subscription period
//   invoice.payment_failed          → mark past_due
//   customer.subscription.updated   → sync status, period, cancel_at_period_end
//   customer.subscription.deleted   → mark canceled, revoke premium
//   charge.refunded                 → mark order refunded, revoke access
//   charge.dispute.created          → mark order disputed, record CHARGEBACK    (PB-MARKET-REVENUE-EVENTS-001)
//   charge.dispute.closed           → record CHARGEBACK / CHARGEBACK_REVERSAL   (PB-MARKET-REVENUE-EVENTS-001)
//   payment_intent.payment_failed   → log failure
//
// STRIPE DASHBOARD ACTION REQUIRED: charge.dispute.created and
// charge.dispute.closed must be added to this endpoint's subscribed event list.
// Handling them in code does nothing until Stripe is told to deliver them.
//
// REVENUE-EVENT CAPTURE (PB-MARKET-REVENUE-EVENTS-001):
//   Economic facts exist only at the instant they happen. The Stripe fee, the
//   amount actually settled, the coupon applied, the country evidence observed
//   — none can be reconstructed later. They are written to
//   app_marketplace_revenue_events as RAW FACTS: nothing here computes a Net
//   Course Revenue, a split, a platform fee or a balance. Those are blocked by
//   PB-MARKET-TAX-001 and must be derived from these events once the definition
//   is settled.
//
//   Capture NEVER breaks payment processing. Every revenue-event write and
//   every extra Stripe call sits behind a try/catch that logs and continues:
//   losing telemetry is bad, failing a paid customer's access grant is worse.
//
// Environment variables required:
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//   - STRIPE_SECRET_KEY
//   - STRIPE_WEBHOOK_SECRET   (whsec_... — specific to THIS endpoint)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

// Deno has no synchronous crypto, so signature verification must use the async
// variant. constructEvent() would throw here.
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const toIso = (unixSeconds: number | null | undefined): string | null =>
  unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;

/** Resolve our internal user id from whatever the event carries. */
async function resolveUserId(
  metadata: Record<string, string> | null | undefined,
  stripeCustomerId?: string | null,
): Promise<string | null> {
  if (metadata?.user_id) return metadata.user_id;

  if (stripeCustomerId) {
    const { data } = await supabase
      .from("app_subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", stripeCustomerId)
      .limit(1)
      .maybeSingle();
    if (data?.user_id) return data.user_id;
  }
  return null;
}

// =============================================================================
// PB-MARKET-REVENUE-EVENTS-001 — raw-fact capture
// =============================================================================
// RULE FOR EVERYTHING BELOW: record facts, never derive.
//
// Every field written into app_marketplace_revenue_events is a value read
// directly off a Stripe object. Nothing here computes a Net Course Revenue, an
// instructor share, a platform fee, a take rate or a balance. If you find
// yourself writing an arithmetic expression that combines two monetary fields,
// stop: that is a derivation, and the definition it would encode has not been
// decided yet (PB-MARKET-TAX-001).
//
// The one arithmetic that IS allowed is sign normalisation and reading a value
// Stripe itself already computed (e.g. balance_transaction.fee), because those
// are transcriptions, not interpretations.
//
// PB-MARKET-REVENUE-LIVEMODE-001 — ALWAYS RECORD `livemode`.
// Every revenue-event write below transcribes `event.livemode`. It is read off
// the EVENT, not off the nested object: the event is the delivery Stripe
// authenticated with the webhook signature, so its flag is the one that
// actually describes the mode this delivery came from, and it is present on
// every event object regardless of type or API version.
//
// This matters more than a normal field because the events table is
// APPEND-ONLY: no UPDATE, no DELETE, ever. A row written without this flag is
// permanently indistinguishable from real revenue at the column level, and a
// test-mode transaction would sit inside the production revenue ledger forever.
// Requires sql/006-revenue-events-livemode.sql to be applied FIRST — PostgREST
// rejects the whole row if the column is missing.

/** Shape of an app_marketplace_revenue_events row. Facts only — no derived field. */
interface RevenueEventRow {
  order_id: string | null;
  course_id: string | null;
  instructor_id: string | null;
  event_type:
    | "SALE"
    | "REFUND"
    | "PARTIAL_REFUND"
    | "CHARGEBACK"
    | "CHARGEBACK_REVERSAL"
    | "ADJUSTMENT";
  occurred_at: string;
  currency: string;
  gross_amount_cents: number | null;
  tax_amount_cents: number | null;
  discount_amount_cents: number | null;
  stripe_fee_cents: number | null;
  net_settled_cents: number | null;
  coupon_code: string | null;
  promotion_id: string | null;
  discount_funded_by: string | null;
  buyer_country: string | null;
  buyer_country_evidence: Record<string, unknown> | null;
  buyer_vat_number: string | null;
  buyer_is_business: boolean | null;
  instructor_tier_at_event: string | null;
  acquisition_channel: string | null;
  stripe_event_id: string;
  stripe_object_id: string | null;
  raw_payload: Record<string, unknown> | null;
  // PB-MARKET-REVENUE-LIVEMODE-001. Stripe's own flag, transcribed unchanged:
  // true = real money, false = test mode. Not optional in this interface even
  // though the column is nullable, so that a new call site cannot forget it —
  // omitting it is a compile error, whereas a missing NULL would be a silent
  // unmarkable row in an APPEND-ONLY ledger that can never be corrected.
  livemode: boolean | null;
}

/**
 * Insert one revenue event. NEVER throws.
 *
 * Telemetry must not be able to break payment processing: an instructor's
 * missing sale row is recoverable from Stripe, a buyer who paid and did not get
 * access is not. A duplicate stripe_event_id (23505) is the idempotency
 * guarantee working as designed on a webhook retry, so it is logged at info
 * level and is not an error.
 */
async function recordRevenueEvent(row: RevenueEventRow): Promise<void> {
  try {
    const { error } = await supabase.from("app_marketplace_revenue_events").insert(row);
    if (error) {
      if (error.code === "23505") {
        console.log(
          "stripe-webhook: revenue event already recorded (retry), event=",
          row.stripe_event_id,
        );
        return;
      }
      // Includes the "table does not exist" case while sql/005 is unapplied.
      console.error(
        "stripe-webhook: revenue event insert failed, type=",
        row.event_type,
        "event=",
        row.stripe_event_id,
        error,
      );
    }
  } catch (err) {
    console.error(
      "stripe-webhook: revenue event insert threw, type=",
      row.event_type,
      "event=",
      row.stripe_event_id,
      err,
    );
  }
}

/**
 * Read the fee Stripe actually charged and the amount it actually settled.
 *
 * These are OBSERVED FACTS on the balance transaction, not `gross - fee`:
 * FX conversion, cross-border fees and Stripe's own rounding make that
 * arithmetic wrong, and the settled figure is the one that reconciles with the
 * bank.
 *
 * Costs one extra API call. Worth it — the fee is unrecoverable after Stripe's
 * retention window, and it is an input to every future revenue definition.
 * Returns nulls on any failure: NULL honestly means "not observed", whereas a
 * defaulted 0 would be a false observation.
 */
async function fetchSettlementFacts(
  balanceTransaction: string | Stripe.BalanceTransaction | null | undefined,
): Promise<{ stripe_fee_cents: number | null; net_settled_cents: number | null }> {
  const miss = { stripe_fee_cents: null, net_settled_cents: null };
  if (!balanceTransaction) return miss;

  try {
    const bt =
      typeof balanceTransaction === "string"
        ? await stripe.balanceTransactions.retrieve(balanceTransaction)
        : balanceTransaction;
    return {
      stripe_fee_cents: bt.fee ?? null,
      net_settled_cents: bt.net ?? null,
    };
  } catch (err) {
    console.error("stripe-webhook: balance transaction lookup failed", err);
    return miss;
  }
}

/**
 * Location evidence for the buyer, as observed. EU VAT place-of-supply rules
 * require two non-contradictory items, so all available sources are kept side
 * by side rather than reduced to one country.
 *
 * This RECORDS evidence. It does not weigh it, reconcile contradictions, or
 * conclude anything — that determination is PB-MARKET-TAX-001.
 */
function buildCountryEvidence(charge: Stripe.Charge | null): Record<string, unknown> | null {
  if (!charge) return null;

  const cardDetails = charge.payment_method_details?.card ?? null;
  const evidence: Record<string, unknown> = {
    source: "stripe.charge",
    observed_at: new Date().toISOString(),
    payment_method_type: charge.payment_method_details?.type ?? null,
    billing_country: charge.billing_details?.address?.country ?? null,
    // Card issuing country ("BIN country"): a distinct, independent signal from
    // the self-declared billing address.
    card_country: cardDetails?.country ?? null,
  };
  return evidence;
}

/** Marketplace attribution facts carried on the order row. */
interface OrderAttribution {
  id: string | null;
  course_id: string | null;
  instructor_id: string | null;
  instructor_tier_at_sale: string | null;
  acquisition_channel: string | null;
}

const EMPTY_ATTRIBUTION: OrderAttribution = {
  id: null,
  course_id: null,
  instructor_id: null,
  instructor_tier_at_sale: null,
  acquisition_channel: null,
};

/**
 * Look up the attribution already recorded on the order. Never throws and never
 * invents: if the order cannot be found the event is still written, with the
 * attribution left NULL. A NULL is an honest "unknown"; a guess would be data
 * we made up and could never distinguish from an observation later.
 */
async function loadOrderAttribution(
  match: { paymentIntentId?: string | null; sessionId?: string | null },
): Promise<OrderAttribution> {
  try {
    let query = supabase
      .from("app_orders")
      .select("id, course_id, instructor_id, instructor_tier_at_sale, acquisition_channel");

    if (match.paymentIntentId) {
      query = query.eq("stripe_payment_intent_id", match.paymentIntentId);
    } else if (match.sessionId) {
      query = query.eq("stripe_checkout_session_id", match.sessionId);
    } else {
      return EMPTY_ATTRIBUTION;
    }

    const { data, error } = await query.limit(1).maybeSingle();
    if (error || !data) return EMPTY_ATTRIBUTION;
    return data as OrderAttribution;
  } catch (err) {
    console.error("stripe-webhook: order attribution lookup failed", err);
    return EMPTY_ATTRIBUTION;
  }
}

/**
 * Retrieve the charge behind a payment intent, expanded with its balance
 * transaction so the fee and settled amount come back in the same call.
 * Returns null on failure — the event is then recorded without them.
 */
async function fetchChargeForIntent(
  paymentIntentId: string | null | undefined,
): Promise<Stripe.Charge | null> {
  if (!paymentIntentId) return null;
  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge.balance_transaction"],
    });
    const charge = intent.latest_charge;
    return charge && typeof charge !== "string" ? charge : null;
  } catch (err) {
    console.error("stripe-webhook: charge lookup failed for intent", paymentIntentId, err);
    return null;
  }
}

/**
 * Discount facts applied to a checkout session.
 *
 * allow_promotion_codes is already true in create-checkout, so coupon-bearing
 * sales already happen in production and are currently recorded nowhere. The
 * discount total is read from Stripe's own total_details, never recomputed from
 * list price minus paid.
 *
 * discount_funded_by is deliberately left NULL: who bore the cost of a discount
 * is not visible in the Stripe object, and a guess written into a fact table is
 * worse than an honest unknown.
 */
function extractDiscountFacts(session: Stripe.Checkout.Session): {
  discount_amount_cents: number | null;
  coupon_code: string | null;
  promotion_id: string | null;
} {
  const discountCents = session.total_details?.amount_discount ?? null;
  const firstDiscount = session.discounts?.[0];

  let couponCode: string | null = null;
  let promotionId: string | null = null;

  if (firstDiscount) {
    // coupon and promotion_code are EXPANDABLE: in a webhook payload they
    // normally arrive as bare id strings, not objects. Both shapes are handled
    // rather than assuming one — an unhandled shape here would silently record
    // NULL for a sale that did carry a coupon, which is precisely the kind of
    // quiet fact loss this work exists to stop.
    //
    // When only the id is available it IS the recorded value. A coupon id is
    // still a stable, resolvable reference back to Stripe; it is simply less
    // readable than the human name. Recording the id beats recording nothing.
    const coupon = firstDiscount.coupon;
    if (coupon && typeof coupon !== "string") {
      couponCode = coupon.name ?? coupon.id ?? null;
    } else if (typeof coupon === "string") {
      couponCode = coupon;
    }

    const promotion = firstDiscount.promotion_code;
    promotionId = typeof promotion === "string" ? promotion : (promotion?.id ?? null);
  }

  return {
    discount_amount_cents: discountCents,
    coupon_code: couponCode,
    promotion_id: promotionId,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!webhookSecret) {
    console.error("stripe-webhook: STRIPE_WEBHOOK_SECRET is not set");
    return new Response("not configured", { status: 503 });
  }
  if (!signature) {
    return new Response("missing signature", { status: 400 });
  }

  // Must be the raw body. Parsing it first would break the signature check.
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    // Either a forged request or a secret that belongs to a different endpoint.
    console.error("stripe-webhook: signature verification failed", err);
    return new Response("invalid signature", { status: 400 });
  }

  // ---------------------------------------------------------------------------
  // Idempotency gate (SPEC §6.3)
  // ---------------------------------------------------------------------------
  // Stripe retries deliveries. Without this, a retry of checkout.session.completed
  // would grant access twice. The UNIQUE constraint on stripe_event_id is what
  // actually enforces it — the insert is the lock, not a prior SELECT, which
  // would race against a concurrent retry.
  const { error: dedupeError } = await supabase
    .from("app_stripe_events")
    .insert({
      stripe_event_id: event.id,
      event_type: event.type,
      payload: event as unknown as Record<string, unknown>,
    });

  if (dedupeError) {
    if (dedupeError.code === "23505") {
      // Already processed. Acknowledge so Stripe stops retrying.
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.error("stripe-webhook: dedupe insert failed", dedupeError);
    // Returning 500 makes Stripe retry, which is what we want: we could not
    // guarantee exactly-once, so better to retry than to silently drop.
    return new Response("dedupe failed", { status: 500 });
  }

  try {
    switch (event.type) {
      // -----------------------------------------------------------------------
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const metadata = (session.metadata || {}) as Record<string, string>;
        const userId = await resolveUserId(metadata, session.customer as string | null);

        if (!userId) {
          console.error("stripe-webhook: no user_id for session", session.id);
          break;
        }

        if (session.mode === "subscription" && session.subscription) {
          // SPEC §5.2: the subscription row is created here, not at checkout
          // creation, so an abandoned session leaves no phantom subscription.
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          const productKey =
            (sub.metadata?.product_key as string) ||
            metadata.product_keys?.split(",")[0] ||
            "unknown";

          await supabase.from("app_subscriptions").upsert(
            {
              user_id: userId,
              product_key: productKey,
              stripe_customer_id: sub.customer as string,
              stripe_subscription_id: sub.id,
              status: sub.status === "active" || sub.status === "trialing" ? sub.status : "past_due",
              current_period_start: toIso(sub.current_period_start),
              current_period_end: toIso(sub.current_period_end),
              cancel_at_period_end: sub.cancel_at_period_end,
            },
            { onConflict: "stripe_subscription_id" },
          );
          // The premium flag on profiles is set by the DB trigger
          // app_sync_premium_from_subscription, not here.
        } else {
          // One-time payment: settle the pending orders for this session.
          const { data: updated, error } = await supabase
            .from("app_orders")
            .update({
              status: "paid",
              paid_at: new Date().toISOString(),
              stripe_payment_intent_id: session.payment_intent as string | null,
            })
            .eq("stripe_checkout_session_id", session.id)
            .eq("status", "pending")
            .select("id");

          if (error) throw error;

          // Recovery path: create-checkout logs and continues if its pending
          // insert fails, so the rows may not exist. Rebuild them from metadata
          // rather than lose a paid order.
          if (!updated || updated.length === 0) {
            const keys = (metadata.product_keys || "").split(",").filter(Boolean);
            if (keys.length > 0) {
              const { data: priceRows } = await supabase
                .from("app_stripe_prices")
                .select("product_key, stripe_price_id, amount_cents, currency")
                .in("product_key", keys);

              if (priceRows?.length) {
                await supabase.from("app_orders").insert(
                  priceRows.map((p) => ({
                    user_id: userId,
                    product_key: p.product_key,
                    stripe_price_id: p.stripe_price_id,
                    stripe_checkout_session_id: session.id,
                    stripe_payment_intent_id: session.payment_intent as string | null,
                    amount_cents: p.amount_cents ?? 0,
                    currency: p.currency,
                    status: "paid",
                    paid_at: new Date().toISOString(),
                    metadata: { recovered_by_webhook: "true" },
                  })),
                );
                console.warn("stripe-webhook: recovered missing orders for", session.id);
              }
            }
          }

          // -------------------------------------------------------------------
          // PB-MARKET-REVENUE-EVENTS-001 — record the SALE as raw facts.
          // -------------------------------------------------------------------
          // Wrapped whole: access has already been granted above, and nothing in
          // this block may be allowed to undo that by throwing. A failure here
          // costs telemetry, not a customer.
          try {
            const paymentIntentId = (session.payment_intent as string | null) ?? null;

            // One extra Stripe call, deliberately. The fee Stripe actually took
            // and the amount it actually settled exist nowhere in the session
            // object and are unrecoverable later. fetchChargeForIntent and
            // fetchSettlementFacts both degrade to null rather than throw.
            const charge = await fetchChargeForIntent(paymentIntentId);
            const settlement = await fetchSettlementFacts(charge?.balance_transaction ?? null);
            const discounts = extractDiscountFacts(session);
            const attribution = await loadOrderAttribution({
              paymentIntentId,
              sessionId: session.id,
            });

            const customerDetails = session.customer_details ?? null;
            // Stripe only populates customer_details.tax_ids when
            // tax_id_collection is enabled on the session — and create-checkout
            // does NOT enable it today, so in practice this is null right now.
            //
            // The read stays in place deliberately: the day tax_id_collection is
            // switched on, the fact starts being captured with no code change.
            // A null here means "not collected", NOT "the buyer has no VAT
            // number", and nothing downstream may read it as the latter.
            // Presence of a tax id is also NOT evidence of a validated B2B
            // status — no VIES consultation has taken place (PB-MARKET-TAX-001).
            const buyerTaxId = customerDetails?.tax_ids?.[0]?.value ?? null;

            await recordRevenueEvent({
              order_id: attribution.id,
              course_id: attribution.course_id,
              instructor_id: attribution.instructor_id,
              event_type: "SALE",
              // When it happened per Stripe, not when we wrote it down.
              occurred_at: toIso(event.created) ?? new Date().toISOString(),
              currency: (session.currency || "eur").toUpperCase(),
              // Stripe's own totals, transcribed. Not recomputed from line items.
              gross_amount_cents: session.amount_total ?? null,
              tax_amount_cents: session.total_details?.amount_tax ?? null,
              discount_amount_cents: discounts.discount_amount_cents,
              stripe_fee_cents: settlement.stripe_fee_cents,
              net_settled_cents: settlement.net_settled_cents,
              coupon_code: discounts.coupon_code,
              promotion_id: discounts.promotion_id,
              // Unknown at write time and deliberately not guessed.
              discount_funded_by: null,
              buyer_country:
                customerDetails?.address?.country ??
                charge?.billing_details?.address?.country ??
                null,
              buyer_country_evidence: buildCountryEvidence(charge),
              buyer_vat_number: buyerTaxId,
              // THREE-STATE. Left null: whether the buyer is a business is not
              // determined here, and defaulting to false would assert
              // "consumer" about every buyer nobody asked.
              buyer_is_business: null,
              instructor_tier_at_event: attribution.instructor_tier_at_sale,
              acquisition_channel: attribution.acquisition_channel,
              stripe_event_id: event.id,
              stripe_object_id: session.id,
              raw_payload: session as unknown as Record<string, unknown>,
              // Real money or a test-mode run. Transcribed from the event.
              livemode: event.livemode,
            });
          } catch (captureErr) {
            console.error(
              "stripe-webhook: SALE capture failed for session",
              session.id,
              captureErr,
            );
          }
        }
        break;
      }

      // -----------------------------------------------------------------------
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;

        if (invoice.subscription) {
          const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
          await supabase
            .from("app_subscriptions")
            .update({
              status: "active",
              current_period_start: toIso(sub.current_period_start),
              current_period_end: toIso(sub.current_period_end),
              cancel_at_period_end: sub.cancel_at_period_end,
            })
            .eq("stripe_subscription_id", sub.id);
        }

        // SPEC §7.2 — EU invoice record.
        const userId = await resolveUserId(
          invoice.metadata as Record<string, string> | null,
          invoice.customer as string | null,
        );
        if (userId) {
          const taxCents = invoice.tax ?? 0;
          const netCents = (invoice.amount_paid ?? 0) - taxCents;

          // -------------------------------------------------------------------
          // VAT DETERMINATION — DELIBERATELY NOT PERFORMED.
          // Deferred to PB-MARKET-TAX-001. Do not improvise it here.
          // -------------------------------------------------------------------
          // WHAT WAS WRONG. This line used to read:
          // schema-guard-allow-reverse-charge: the next line QUOTES the deleted
          // defect as evidence; it is not a read. vat_determination_status does
          // appear in this same block, just beyond the guard's line window,
          // because this explanation is long. Documenting a hazard thoroughly
          // should not be punished — but silencing the guard must stay visible.
          //   reverse_charge: taxCents === 0 && (invoice.customer_address?.country ?? "EE") !== "EE"
          //
          // automatic_tax is OFF (create-checkout enables it only when
          // STRIPE_AUTOMATIC_TAX=true, which stays off until the OU is
          // VAT-registered), so invoice.tax is ALWAYS 0 and the first operand is
          // ALWAYS true. The expression collapsed to "country != EE", which
          // meant EVERY NON-ESTONIAN CUSTOMER WAS RECORDED AS REVERSE CHARGE —
          // including B2C consumers, for whom reverse charge does not exist.
          // The `?? "EE"` fallback failed in the opposite direction, silently
          // marking address-less customers as domestic.
          //
          // WHY IT MATTERS. Reverse charge is an AFFIRMATIVE FISCAL CLAIM that
          // shifts VAT liability onto the customer. Asserting it without a
          // validated business VAT number and a B2B determination is wrong, and
          // wrong in the direction that under-declares output VAT.
          //
          // WHAT REPLACES IT. Nothing is inferred. Reverse charge may only ever
          // become true on POSITIVE EVIDENCE: a VAT number validated against
          // VIES plus an actual B2B determination. Neither exists today, so the
          // value is false — which is not a claim that the supply is domestic,
          // it is the ABSENCE of the affirmative claim. vat_determination_status
          // carries the honest statement of what we know, so the record says
          // "not determined" instead of asserting a position it cannot support.
          const automaticTaxEnabled = invoice.automatic_tax?.status === "complete";

          // Raw inputs, recorded so a correct determination stays POSSIBLE
          // later rather than having to be invented from an empty record.
          const customerVatId = invoice.customer_tax_ids?.[0]?.value ?? null;
          const countryEvidence = {
            source: "stripe.invoice",
            observed_at: new Date().toISOString(),
            // No `?? "EE"`. An absent address is recorded as absent.
            customer_address_country: invoice.customer_address?.country ?? null,
            customer_shipping_country: invoice.customer_shipping?.address?.country ?? null,
            customer_tax_id_type: invoice.customer_tax_ids?.[0]?.type ?? null,
            automatic_tax_status: invoice.automatic_tax?.status ?? null,
          };

          await supabase.from("app_invoices").upsert(
            {
              user_id: userId,
              stripe_invoice_id: invoice.id,
              invoice_number: invoice.number,
              invoice_date: invoice.created
                ? new Date(invoice.created * 1000).toISOString().slice(0, 10)
                : null,
              customer_name: invoice.customer_name,
              customer_country: invoice.customer_address?.country ?? null,
              customer_vat_id: customerVatId,
              amount_cents: invoice.amount_paid ?? 0,
              vat_cents: taxCents,
              // Derived, not read from Stripe: with automatic_tax off there is
              // no rate to read. Recomputing it keeps the record self-consistent.
              vat_rate: netCents > 0 ? Number(((taxCents / netCents) * 100).toFixed(2)) : 0,
              // NEVER INFERRED. Only positive evidence may set this true, and
              // no code path produces that evidence yet (PB-MARKET-TAX-001).
              reverse_charge: false,
              vat_determination_status: automaticTaxEnabled
                ? "AUTOMATIC_TAX"
                : "AUTOMATIC_TAX_DISABLED",
              automatic_tax_enabled: automaticTaxEnabled,
              // A number supplied is not a number validated, and NOT_PROVIDED
              // means "we did not collect one" — never "the customer has none".
              // tax_id_collection is off in create-checkout, so this is
              // NOT_PROVIDED in practice today. Recording PROVIDED rather than
              // VIES_VALIDATED is the whole point: no VIES consultation has
              // taken place, and without a consultation reference a
              // reverse-charge position could not be evidenced anyway.
              customer_vat_number_status: customerVatId ? "PROVIDED" : "NOT_PROVIDED",
              customer_country_evidence: countryEvidence,
              currency: (invoice.currency || "eur").toUpperCase(),
              pdf_url: invoice.invoice_pdf,
            },
            { onConflict: "stripe_invoice_id" },
          );
        }
        break;
      }

      // -----------------------------------------------------------------------
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          // Premium is NOT revoked here. SPEC §6.1 grants a 7-day grace period;
          // Stripe drives it and ends the subscription itself if it never pays,
          // which arrives as customer.subscription.deleted.
          await supabase
            .from("app_subscriptions")
            .update({ status: "past_due" })
            .eq("stripe_subscription_id", invoice.subscription as string);
        }
        break;
      }

      // -----------------------------------------------------------------------
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const status =
          sub.status === "active" || sub.status === "trialing"
            ? sub.status
            : sub.status === "canceled" || sub.status === "incomplete_expired"
              ? "canceled"
              : "past_due";

        await supabase
          .from("app_subscriptions")
          .update({
            status,
            current_period_start: toIso(sub.current_period_start),
            current_period_end: toIso(sub.current_period_end),
            cancel_at_period_end: sub.cancel_at_period_end,
          })
          .eq("stripe_subscription_id", sub.id);
        break;
      }

      // -----------------------------------------------------------------------
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await supabase
          .from("app_subscriptions")
          .update({ status: "canceled", cancel_at_period_end: false })
          .eq("stripe_subscription_id", sub.id);
        // Premium revocation is handled by the DB trigger.
        break;
      }

      // -----------------------------------------------------------------------
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        if (charge.payment_intent) {
          const paymentIntentId = charge.payment_intent as string;

          // A PARTIAL refund is a different economic event from a full one, and
          // until now they were indistinguishable: both landed on
          // status = 'refunded' with no amount recorded anywhere.
          const refundedCents = charge.amount_refunded ?? 0;
          const chargedCents = charge.amount ?? 0;
          const isFullRefund = chargedCents > 0 && refundedCents >= chargedCents;

          await supabase
            .from("app_orders")
            .update({
              // A partially refunded order is still a paid order: the buyer
              // keeps what they paid for. Only a full refund unwinds the sale.
              status: isFullRefund ? "refunded" : "paid",
              refunded_at: new Date().toISOString(),
              refunded_amount_cents: refundedCents,
            })
            .eq("stripe_payment_intent_id", paymentIntentId);

          // -------------------------------------------------------------------
          // PB-MARKET-REVENUE-EVENTS-001 — record the refund as raw facts.
          // -------------------------------------------------------------------
          try {
            const attribution = await loadOrderAttribution({ paymentIntentId });

            // The refund has its OWN balance transaction, carrying the fee
            // treatment Stripe actually applied to the reversal. That is not
            // the same as the original charge's, and it is not derivable from
            // it.
            const latestRefund = charge.refunds?.data?.[0] ?? null;
            const settlement = await fetchSettlementFacts(
              latestRefund?.balance_transaction ?? null,
            );

            await recordRevenueEvent({
              order_id: attribution.id,
              course_id: attribution.course_id,
              instructor_id: attribution.instructor_id,
              event_type: isFullRefund ? "REFUND" : "PARTIAL_REFUND",
              occurred_at: toIso(event.created) ?? new Date().toISOString(),
              currency: (charge.currency || "eur").toUpperCase(),
              // Negative: money leaving. Sign normalisation only, so that a
              // period total is a plain SUM with no direction logic — and
              // therefore nowhere to hide a policy decision.
              gross_amount_cents: -refundedCents,
              tax_amount_cents: null,
              discount_amount_cents: null,
              stripe_fee_cents: settlement.stripe_fee_cents,
              net_settled_cents: settlement.net_settled_cents,
              coupon_code: null,
              promotion_id: null,
              discount_funded_by: null,
              buyer_country: charge.billing_details?.address?.country ?? null,
              buyer_country_evidence: buildCountryEvidence(charge),
              buyer_vat_number: null,
              buyer_is_business: null,
              instructor_tier_at_event: attribution.instructor_tier_at_sale,
              acquisition_channel: attribution.acquisition_channel,
              stripe_event_id: event.id,
              stripe_object_id: charge.id,
              raw_payload: charge as unknown as Record<string, unknown>,
              // Real money or a test-mode run. Transcribed from the event.
              livemode: event.livemode,
            });
          } catch (captureErr) {
            console.error("stripe-webhook: refund capture failed for", charge.id, captureErr);
          }
        }
        break;
      }

      // -----------------------------------------------------------------------
      // A CHARGEBACK IS NOT A REFUND. Previously this event was not handled at
      // all, so a dispute was invisible until it settled and then arrived —
      // if at all — collapsed into 'refunded'. Different cause (imposed on us,
      // not decided by us), different liability (contestable), different cost
      // (a dispute fee), and an open question as to who ultimately bears it.
      // Recording it separately decides none of that; collapsing it destroys
      // the evidence needed to decide.
      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const paymentIntentId =
          typeof dispute.payment_intent === "string"
            ? dispute.payment_intent
            : (dispute.payment_intent?.id ?? null);

        if (paymentIntentId) {
          // 'disputed', not 'chargeback': the dispute is OPEN and the outcome
          // is unknown. Access is deliberately NOT revoked here — a dispute can
          // be won, and pre-emptively cutting off a customer who may be in the
          // right is a support incident, not a control.
          await supabase
            .from("app_orders")
            .update({ status: "disputed" })
            .eq("stripe_payment_intent_id", paymentIntentId);
        }

        console.warn(
          "stripe-webhook: dispute opened",
          dispute.id,
          "reason=",
          dispute.reason ?? "unknown",
        );

        try {
          const attribution = await loadOrderAttribution({ paymentIntentId });
          // Dispute.balance_transactions is an array of FULL BalanceTransaction
          // objects, not ids, so this needs no extra API call —
          // fetchSettlementFacts takes either form.
          const settlement = await fetchSettlementFacts(
            dispute.balance_transactions?.[0] ?? null,
          );

          await recordRevenueEvent({
            order_id: attribution.id,
            course_id: attribution.course_id,
            instructor_id: attribution.instructor_id,
            event_type: "CHARGEBACK",
            occurred_at: toIso(event.created) ?? new Date().toISOString(),
            currency: (dispute.currency || "eur").toUpperCase(),
            // Negative: the funds have been withdrawn pending the outcome.
            gross_amount_cents: -(dispute.amount ?? 0),
            tax_amount_cents: null,
            discount_amount_cents: null,
            // The dispute fee, as Stripe reported it. An observed cost, not an
            // allocation of that cost to anybody.
            stripe_fee_cents: settlement.stripe_fee_cents,
            net_settled_cents: settlement.net_settled_cents,
            coupon_code: null,
            promotion_id: null,
            discount_funded_by: null,
            buyer_country: null,
            buyer_country_evidence: null,
            buyer_vat_number: null,
            buyer_is_business: null,
            instructor_tier_at_event: attribution.instructor_tier_at_sale,
            acquisition_channel: attribution.acquisition_channel,
            stripe_event_id: event.id,
            stripe_object_id: dispute.id,
            raw_payload: dispute as unknown as Record<string, unknown>,
            // Real money or a test-mode run. Transcribed from the event.
            livemode: event.livemode,
          });
        } catch (captureErr) {
          console.error("stripe-webhook: dispute capture failed for", dispute.id, captureErr);
        }
        break;
      }

      // -----------------------------------------------------------------------
      // Outcome of a dispute. `won` means the withdrawal is reversed and the
      // funds come back, which is a genuinely different event from the original
      // chargeback and gets its own type rather than an edit of the earlier
      // row: the event log is append-only, so history is added to, never
      // rewritten.
      case "charge.dispute.closed": {
        const dispute = event.data.object as Stripe.Dispute;
        const paymentIntentId =
          typeof dispute.payment_intent === "string"
            ? dispute.payment_intent
            : (dispute.payment_intent?.id ?? null);

        // Stripe reports seven possible dispute statuses. Only two are terminal
        // financial outcomes; the rest are early-warning or in-flight states.
        // Deriving a conclusion from "not lost" would treat every one of them as
        // equivalent to a win — the same defect shape as the old VAT
        // reverse-charge inference, which turned an absence of evidence into a
        // positive claim.
        // So: assert only on positive evidence, and record anything else as an
        // ADJUSTMENT that preserves the observed status without interpreting it.
        const won = dispute.status === "won";
        const lost = dispute.status === "lost";
        const terminal = won || lost;

        if (paymentIntentId && terminal) {
          await supabase
            .from("app_orders")
            // Lost: the funds are gone, and this is NOT 'refunded'. Won: the
            // charge stands and the order returns to 'paid'. A non-terminal
            // status is deliberately left alone: moving it to 'paid' would
            // affirm the money is fine while the -amount CHARGEBACK still
            // stands, which is a false statement about a live dispute.
            .update({ status: lost ? "chargeback" : "paid" })
            .eq("stripe_payment_intent_id", paymentIntentId);
        }

        console.log(
          "stripe-webhook: dispute closed",
          dispute.id,
          "status=",
          dispute.status ?? "unknown",
          terminal ? "" : "(non-terminal: recorded as ADJUSTMENT, order untouched)",
        );

        try {
          const attribution = await loadOrderAttribution({ paymentIntentId });
          // Last entry: at closure the array holds the original withdrawal and,
          // if the dispute was won, the reversal. The last one carries the
          // final settlement facts. Full objects, so no extra API call.
          const settlement = await fetchSettlementFacts(
            dispute.balance_transactions?.[dispute.balance_transactions.length - 1] ?? null,
          );

          await recordRevenueEvent({
            order_id: attribution.id,
            course_id: attribution.course_id,
            instructor_id: attribution.instructor_id,
            // Lost -> the CHARGEBACK stands (recorded again at closure with the
            // final settlement facts). Won -> the withdrawal is reversed.
            // Neither -> ADJUSTMENT: a zero-amount CHARGEBACK_REVERSAL would
            // claim to reverse something that was never reversed, while the
            // earlier negative CHARGEBACK remains on the ledger. The raw status
            // is preserved in raw_payload for later interpretation.
            event_type: lost
              ? "CHARGEBACK"
              : won
                ? "CHARGEBACK_REVERSAL"
                : "ADJUSTMENT",
            occurred_at: toIso(event.created) ?? new Date().toISOString(),
            currency: (dispute.currency || "eur").toUpperCase(),
            // Won: money coming back, positive. Lost: already withdrawn at
            // creation, so 0 here — the withdrawal was recorded then, and
            // repeating it would double-count.
            gross_amount_cents: won ? (dispute.amount ?? 0) : 0,
            tax_amount_cents: null,
            discount_amount_cents: null,
            stripe_fee_cents: settlement.stripe_fee_cents,
            net_settled_cents: settlement.net_settled_cents,
            coupon_code: null,
            promotion_id: null,
            discount_funded_by: null,
            buyer_country: null,
            buyer_country_evidence: null,
            buyer_vat_number: null,
            buyer_is_business: null,
            instructor_tier_at_event: attribution.instructor_tier_at_sale,
            acquisition_channel: attribution.acquisition_channel,
            stripe_event_id: event.id,
            stripe_object_id: dispute.id,
            raw_payload: dispute as unknown as Record<string, unknown>,
            // Real money or a test-mode run. Transcribed from the event.
            livemode: event.livemode,
          });
        } catch (captureErr) {
          console.error(
            "stripe-webhook: dispute closure capture failed for",
            dispute.id,
            captureErr,
          );
        }
        break;
      }

      // -----------------------------------------------------------------------
      case "payment_intent.payment_failed": {
        const intent = event.data.object as Stripe.PaymentIntent;
        console.warn(
          "stripe-webhook: payment failed",
          intent.id,
          intent.last_payment_error?.message ?? "no message",
        );
        break;
      }

      // -----------------------------------------------------------------------
      default:
        // Not an error: Stripe sends whatever the endpoint is subscribed to.
        console.log("stripe-webhook: unhandled event type", event.type);
    }
  } catch (err) {
    console.error("stripe-webhook: handler failed for", event.type, event.id, err);
    // The dedupe row already exists, so a Stripe retry would be swallowed as a
    // duplicate and the effect would be lost forever. Remove it so the retry
    // can actually reprocess.
    await supabase.from("app_stripe_events").delete().eq("stripe_event_id", event.id);
    return new Response("handler failed", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
