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
//   payment_intent.payment_failed   → log failure
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
              amount_cents: invoice.amount_paid ?? 0,
              vat_cents: taxCents,
              // Derived, not read from Stripe: with automatic_tax off there is
              // no rate to read. Recomputing it keeps the record self-consistent.
              vat_rate: netCents > 0 ? Number(((taxCents / netCents) * 100).toFixed(2)) : 0,
              reverse_charge: taxCents === 0 && (invoice.customer_address?.country ?? "EE") !== "EE",
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
          await supabase
            .from("app_orders")
            .update({ status: "refunded", refunded_at: new Date().toISOString() })
            .eq("stripe_payment_intent_id", charge.payment_intent as string);
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
