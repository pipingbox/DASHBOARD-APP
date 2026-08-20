// Edge Function: create-checkout
// Purpose: Create a Stripe Checkout Session for any PipingBox product and, for
//   one-time purchases, register the corresponding pending rows in app_orders.
// Ticket: brain/06-EXECUTION/TICKETS/EXECUTING/PB-STRIPE-001.md (Fase 3)
// Spec:   brain/10-CORPORATE/STRIPE_INTEGRATION_SPEC.md §5
//
// Request:
//   POST /functions/v1/create-checkout
//   Headers: Authorization: Bearer <user JWT>
//   Body: { product_key: "vca_course_bvca", metadata?: {...} }
//     or: { product_keys: ["vca_course_bvca", "vca_booking_standard"], metadata?: {...} }
//
// Response: { url: "https://checkout.stripe.com/...", session_id: "cs_test_..." }
//
// SECURITY — deviation from SPEC §5.1
//   The spec's request body is { product_key, user_id, metadata }. This function
//   IGNORES any user_id in the body and derives the identity from the JWT in the
//   Authorization header. A body-supplied user_id would let any caller create a
//   paid order in another user's name. SPEC §6.2 already requires that grants
//   never originate in the client; this applies the same rule to the purchase.
//
//   Prices are never taken from the request either. Only product_key travels
//   from the browser; the amount and the Stripe price id are read from
//   app_stripe_prices server-side. A client that sends its own amount can buy a
//   EUR 399 pack for EUR 0.01.
//
// Environment variables required:
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//   - STRIPE_SECRET_KEY          (sk_test_... in test mode)
//   - APP_BASE_URL               (optional — default: https://pipingbox.com)
//   - STRIPE_AUTOMATIC_TAX       (optional — "true" enables Stripe Tax; keep off until the OU is VAT-registered)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface StripePriceRow {
  product_key: string;
  stripe_price_id: string | null;
  amount_cents: number | null;
  currency: string;
  billing_type: "recurring" | "one_time";
  interval: "month" | "year" | null;
  is_active: boolean;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const appBaseUrl = Deno.env.get("APP_BASE_URL") || "https://pipingbox.com";
  const automaticTax = Deno.env.get("STRIPE_AUTOMATIC_TAX") === "true";

  if (!stripeSecretKey) {
    console.error("create-checkout: STRIPE_SECRET_KEY is not set");
    return json({ error: "stripe_not_configured" }, 503);
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // ---------------------------------------------------------------------------
  // 1. Identify the caller from the JWT. Never from the body.
  // ---------------------------------------------------------------------------
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return json({ error: "unauthorized" }, 401);
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return json({ error: "unauthorized" }, 401);
  }
  const user = userData.user;

  // ---------------------------------------------------------------------------
  // 2. Parse and normalize the requested products
  // ---------------------------------------------------------------------------
  let body: { product_key?: string; product_keys?: string[]; metadata?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const requestedKeys: string[] = body.product_keys?.length
    ? body.product_keys
    : body.product_key
      ? [body.product_key]
      : [];

  if (requestedKeys.length === 0) {
    return json({ error: "product_key_required" }, 400);
  }
  // Guard against a caller padding the cart to build an oversized session.
  if (requestedKeys.length > 5) {
    return json({ error: "too_many_line_items" }, 400);
  }
  // Duplicates would violate the (session_id, product_key) unique index and,
  // more importantly, are never intentional in this catalog.
  if (new Set(requestedKeys).size !== requestedKeys.length) {
    return json({ error: "duplicate_product_keys" }, 400);
  }

  // ---------------------------------------------------------------------------
  // 3. Resolve prices server-side
  // ---------------------------------------------------------------------------
  const { data: priceRows, error: priceError } = await supabase
    .from("app_stripe_prices")
    .select("product_key, stripe_price_id, amount_cents, currency, billing_type, interval, is_active")
    .in("product_key", requestedKeys);

  if (priceError) {
    console.error("create-checkout: price lookup failed", priceError);
    return json({ error: "price_lookup_failed" }, 500);
  }

  const prices = (priceRows || []) as StripePriceRow[];

  const missing = requestedKeys.filter((k) => !prices.some((p) => p.product_key === k));
  if (missing.length > 0) {
    return json({ error: "unknown_product_key", detail: missing }, 400);
  }

  const inactive = prices.filter((p) => !p.is_active || !p.stripe_price_id);
  if (inactive.length > 0) {
    // Reached when Fase 1 has not mapped the product in Stripe yet, or when a
    // price was archived. Either way it is not sellable right now.
    return json(
      { error: "product_not_available", detail: inactive.map((p) => p.product_key) },
      409,
    );
  }

  // Stripe cannot mix a subscription and a one-time price in a single
  // `mode=payment` session, and mixing them in `mode=subscription` changes the
  // billing semantics. Refuse the combination rather than guess.
  const hasRecurring = prices.some((p) => p.billing_type === "recurring");
  const hasOneTime = prices.some((p) => p.billing_type === "one_time");
  if (hasRecurring && hasOneTime) {
    return json({ error: "cannot_mix_subscription_and_one_time" }, 400);
  }
  const mode: "payment" | "subscription" = hasRecurring ? "subscription" : "payment";

  // ---------------------------------------------------------------------------
  // 4. Reuse the Stripe customer if this user already has one
  // ---------------------------------------------------------------------------
  const { data: existingSub } = await supabase
    .from("app_subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .not("stripe_customer_id", "is", null)
    .limit(1)
    .maybeSingle();

  const existingCustomerId: string | undefined = existingSub?.stripe_customer_id || undefined;

  // ---------------------------------------------------------------------------
  // 5. Create the Checkout Session
  // ---------------------------------------------------------------------------
  const lineItems = prices.map((p) => ({ price: p.stripe_price_id!, quantity: 1 }));

  // Travels to the webhook, which is where access is actually granted.
  const sessionMetadata: Record<string, string> = {
    ...(body.metadata || {}),
    user_id: user.id,
    product_keys: requestedKeys.join(","),
  };

  let session;
  try {
    session = await stripe.checkout.sessions.create(
      {
        mode,
        line_items: lineItems,
        client_reference_id: user.id,
        ...(existingCustomerId
          ? { customer: existingCustomerId }
          : { customer_email: user.email ?? undefined }),
        // Needed so the webhook can read metadata off the subscription too,
        // not just off the session.
        ...(mode === "subscription"
          ? { subscription_data: { metadata: sessionMetadata } }
          : { payment_intent_data: { metadata: sessionMetadata } }),
        metadata: sessionMetadata,
        // /account/orders does not exist yet. App.tsx has a catch-all that
        // redirects unknown paths to /dashboard, which would silently swallow
        // these query params and leave the buyer with no confirmation at all.
        // Point at the real route until the orders page ships.
        success_url: `${appBaseUrl}/dashboard?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appBaseUrl}/dashboard?purchase=canceled`,
        allow_promotion_codes: true,
        // Stripe Tax is off by default. Enabling it requires Stripe Tax to be
        // activated on the account and an origin address configured, neither of
        // which exists before PIPINGBOX OU. Turning it on prematurely makes
        // every session creation fail. Flip STRIPE_AUTOMATIC_TAX=true once the
        // OU is registered for VAT/OSS (SPEC §7).
        ...(automaticTax
          ? {
              automatic_tax: { enabled: true },
              // Required by Stripe when automatic_tax runs against an existing
              // customer: the address must be resolvable.
              ...(existingCustomerId ? { customer_update: { address: "auto" as const } } : {}),
            }
          : {}),
      },
      {
        // Stops a double-click from opening two sessions for the same intent.
        idempotencyKey: `checkout:${user.id}:${requestedKeys.sort().join("+")}:${Math.floor(Date.now() / 60000)}`,
      },
    );
  } catch (err) {
    console.error("create-checkout: stripe session creation failed", err);
    return json({ error: "stripe_session_failed" }, 502);
  }

  // ---------------------------------------------------------------------------
  // 6. Register pending orders (one-time only)
  // ---------------------------------------------------------------------------
  // Subscriptions are NOT written here: SPEC §5.2 creates the app_subscriptions
  // row on checkout.session.completed, so that a session the user abandons
  // never leaves a phantom subscription behind.
  if (mode === "payment") {
    const orderRows = prices.map((p) => ({
      user_id: user.id,
      product_key: p.product_key,
      stripe_price_id: p.stripe_price_id,
      stripe_checkout_session_id: session.id,
      amount_cents: p.amount_cents ?? 0,
      currency: p.currency,
      status: "pending",
      metadata: body.metadata || {},
    }));

    const { error: orderError } = await supabase.from("app_orders").insert(orderRows);

    if (orderError) {
      // The session already exists in Stripe at this point. Returning an error
      // would strand the user, and the webhook can recover the order from
      // session metadata anyway. Log loudly and continue.
      console.error(
        "create-checkout: pending order insert failed, session=",
        session.id,
        orderError,
      );
    }
  }

  return json({ url: session.url, session_id: session.id });
});
