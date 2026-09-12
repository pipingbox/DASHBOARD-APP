// Edge Function: daily-intelligence-report
// PB-PDI-004 — genera y envía el informe "PipingBox Daily Intelligence".
//
// Invocación diaria por pg_cron + pg_net (ver README.md). También admite
// disparo manual autenticado (service_role). Idempotente por report_date.
//
// SEGURIDAD
//   - verify_jwt = false; autenticación por Authorization: Bearer SERVICE_ROLE_KEY
//     (comprobada abajo). Nadie más puede disparar el informe.
//   - Logs sin secretos ni PII (sanitizeError/sanitizeText).
//   - Fail-closed: si una fuente crítica falla, el informe es PARTIAL/FAILED y
//     nunca se marca SENT falsamente.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createEmailProvider } from "../_shared/email-provider.ts";
import {
  getPreviousBrusselsDayWindow,
  buildRecommendations,
  renderReportHtml,
  renderReportText,
  reportSubject,
  sanitizeError,
  sanitizeText,
  hogqlTraffic,
  hogqlRoutes,
  hogqlFunnelSignup,
  hogqlOnboarding,
  hogqlOnboardingSteps,
  hogqlReferrals,
  hogqlErrors,
  type DailyMetrics,
  type SourceStatus,
} from "../_shared/daily-report-core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SOURCE_TIMEOUT_MS = 20_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label}_timeout`)), ms)),
  ]);
}

// ── PostHog query (HogQL) ─────────────────────────────────────────────────
async function hogql(query: string, start: string, end: string): Promise<unknown[][]> {
  const key = Deno.env.get("POSTHOG_PERSONAL_API_KEY");
  const host = Deno.env.get("POSTHOG_HOST") || "https://eu.i.posthog.com";
  const project = Deno.env.get("POSTHOG_PROJECT_ID") || "271316";
  if (!key) throw new Error("posthog_key_not_configured");
  const filled = query.replaceAll("${start}", start).replaceAll("${end}", end);
  const res = await withTimeout(
    fetch(`${host}/api/projects/${project}/query/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query: filled } }),
    }),
    SOURCE_TIMEOUT_MS,
    "posthog",
  );
  if (!res.ok) throw new Error(`posthog_http_${res.status}`);
  const json = await res.json();
  return (json?.results ?? []) as unknown[][];
}

const num = (v: unknown) => Number(v ?? 0) || 0;

// ── Recolección de métricas ───────────────────────────────────────────────
async function collectMetrics(
  supabase: SupabaseClient,
  start: string,
  end: string,
  sources: SourceStatus,
): Promise<{ metrics: DailyMetrics; routes: Array<{ route: string; views: number; uniquePersons: number }> }> {
  const m: DailyMetrics = {
    pageViews: 0, uniquePersons: 0, sessions: 0,
    signupStarted: 0, authCreated: 0,
    onboardingStarted: 0, onboardingCompleted: 0, onboardingStepDropoffs: [],
    referralOpened: 0, referralCaptured: 0,
    errors: [], totalErrors: 0,
    newUsers: 0, emailsConfirmed: 0, emailsPending: 0,
    paymentsCompleted: 0, paymentsFailed: 0, grossCents: 0, currency: "EUR", checkoutNotActivated: 0,
  };
  let routes: Array<{ route: string; views: number; uniquePersons: number }> = [];

  // ── PostHog ──
  try {
    const traffic = await hogql(hogqlTraffic(), start, end);
    m.pageViews = num(traffic[0]?.[0]);
    m.uniquePersons = num(traffic[0]?.[1]);
    m.sessions = num(traffic[0]?.[2]);

    const r = await hogql(hogqlRoutes(), start, end);
    routes = r.map((row) => ({ route: String(row[0] ?? "/"), views: num(row[1]), uniquePersons: num(row[2]) }));

    const signup = await hogql(hogqlFunnelSignup(), start, end);
    m.signupStarted = num(signup[0]?.[0]);
    m.authCreated = num(signup[0]?.[1]);

    const onb = await hogql(hogqlOnboarding(), start, end);
    m.onboardingStarted = num(onb[0]?.[0]);
    m.onboardingCompleted = num(onb[0]?.[2]);

    const steps = await hogql(hogqlOnboardingSteps(), start, end);
    m.onboardingStepDropoffs = steps.map((row) => ({ step: String(row[0] ?? ""), usersReached: num(row[1]) }));

    const ref = await hogql(hogqlReferrals(), start, end);
    m.referralOpened = num(ref[0]?.[0]);
    m.referralCaptured = num(ref[0]?.[1]);

    const errs = await hogql(hogqlErrors(), start, end);
    m.errors = errs.map((row) => ({
      errorName: sanitizeText(String(row[0] ?? "Error")),
      incidentCode: sanitizeText(String(row[1] ?? "")),
      route: String(row[2] ?? ""),
      occurrences: num(row[3]),
    }));
    m.totalErrors = m.errors.reduce((a, e) => a + e.occurrences, 0);
    sources.posthog = true;
  } catch (e) {
    console.error(JSON.stringify({ source: "posthog", error: sanitizeError(e) }));
    sources.posthog = false;
  }

  // ── Supabase ──
  try {
    const { count: newProfiles } = await supabase
      .from("app_14da0f1941_profiles")
      .select("user_id", { count: "exact", head: true })
      .gte("created_at", start)
      .lt("created_at", end);
    m.newUsers = newProfiles ?? 0;

    // Confirmación de correo vía Auth Admin API (service_role), sin auth.users directo.
    let confirmed = 0;
    let pending = 0;
    let page = 1;
    const perPage = 200;
    // Recorrer usuarios creados en la ventana. listUsers no filtra por fecha;
    // se filtra en memoria por created_at dentro de la ventana.
    for (let i = 0; i < 10; i++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
      if (error) throw error;
      const users = data?.users ?? [];
      if (users.length === 0) break;
      for (const u of users) {
        const created = u.created_at ? new Date(u.created_at).toISOString() : "";
        if (created >= start && created < end) {
          if (u.email_confirmed_at) confirmed++;
          else pending++;
        }
      }
      if (users.length < perPage) break;
      page++;
    }
    m.emailsConfirmed = confirmed;
    m.emailsPending = pending;
    sources.supabase = true;
  } catch (e) {
    console.error(JSON.stringify({ source: "supabase", error: sanitizeError(e) }));
    sources.supabase = false;
  }

  // ── Stripe (tablas canónicas; livemode real) ──
  try {
    const { data: rev } = await supabase
      .from("app_marketplace_revenue_events")
      .select("event_type, gross_amount_cents, currency, livemode")
      .gte("occurred_at", start)
      .lt("occurred_at", end)
      .or("livemode.is.null,livemode.eq.true");
    const events = (rev ?? []) as Array<{ event_type: string; gross_amount_cents: number | null; currency: string | null }>;
    m.paymentsCompleted = events.filter((e) => e.event_type === "SALE").length;
    m.paymentsFailed = events.filter((e) => e.event_type === "PAYMENT_FAILED").length;
    m.grossCents = events
      .filter((e) => e.event_type === "SALE")
      .reduce((a: number, e) => a + (Number(e.gross_amount_cents) || 0), 0);
    m.currency = events.find((e) => e.currency)?.currency ?? "EUR";

    // Checkout completado pero plan no activado: órdenes pagadas sin suscripción activa.
    const { data: paidOrders } = await supabase
      .from("app_orders")
      .select("id, user_id, product_key")
      .eq("status", "paid")
      .gte("paid_at", start)
      .lt("paid_at", end);
    let notActivated = 0;
    for (const o of paidOrders ?? []) {
      const { count } = await supabase
        .from("app_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", o.user_id)
        .in("status", ["active", "trialing"]);
      if ((count ?? 0) === 0) notActivated++;
    }
    m.checkoutNotActivated = notActivated;
    sources.stripe = true;
  } catch (e) {
    console.error(JSON.stringify({ source: "stripe", error: sanitizeError(e) }));
    sources.stripe = false;
  }

  return { metrics: m, routes };
}

// ── Claim idempotente del día ─────────────────────────────────────────────
async function claimRun(
  supabase: SupabaseClient,
  reportDate: string,
  correlationId: string,
): Promise<{ claimed: boolean; alreadySent: boolean }> {
  // Si ya existe un SENT para este día, no reenviar.
  const { data: existing } = await supabase
    .from("app_daily_intelligence_runs")
    .select("status, attempts")
    .eq("report_date", reportDate)
    .maybeSingle();
  if (existing?.status === "SENT") return { claimed: false, alreadySent: true };

  if (!existing) {
    const { error } = await supabase.from("app_daily_intelligence_runs").insert({
      report_date: reportDate,
      status: "GENERATING",
      attempts: 1,
      correlation_id: correlationId,
    });
    // UNIQUE(report_date): otro proceso ganó el claim.
    if (error) return { claimed: false, alreadySent: false };
    return { claimed: true, alreadySent: false };
  }

  // Reintento de una ejecución previa fallida/parcial.
  const { error } = await supabase
    .from("app_daily_intelligence_runs")
    .update({ status: "GENERATING", attempts: (existing.attempts ?? 0) + 1, correlation_id: correlationId, updated_at: new Date().toISOString() })
    .eq("report_date", reportDate)
    .neq("status", "SENT");
  return { claimed: !error, alreadySent: false };
}

async function finalizeRun(
  supabase: SupabaseClient,
  reportDate: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await supabase
    .from("app_daily_intelligence_runs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("report_date", reportDate);
}

// ── Handler ───────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const correlationId = crypto.randomUUID();
  const log = (obj: Record<string, unknown>) => console.log(JSON.stringify({ correlationId, ...obj }));

  // Autenticación: solo service_role.
  const auth = req.headers.get("Authorization") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!serviceKey || auth !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let isTest = false;
  let forcedDate: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    isTest = body?.test === true;
    forcedDate = typeof body?.report_date === "string" ? body.report_date : null;
  } catch { /* body opcional */ }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const window = getPreviousBrusselsDayWindow(new Date());
  if (forcedDate) window.reportDate = forcedDate;

  const { claimed, alreadySent } = await claimRun(supabase, window.reportDate, correlationId);
  if (alreadySent) {
    log({ action: "skip_already_sent", report_date: window.reportDate });
    return new Response(JSON.stringify({ ok: true, skipped: "already_sent", report_date: window.reportDate }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!claimed) {
    log({ action: "skip_claim_contended", report_date: window.reportDate });
    return new Response(JSON.stringify({ ok: true, skipped: "claim_contended", report_date: window.reportDate }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const sources: SourceStatus = { posthog: false, supabase: false, stripe: false, email: false };
  let executionStatus: "SUCCESS" | "PARTIAL" | "FAILED" = "SUCCESS";
  let sendError: string | null = null;

  try {
    const { metrics, routes } = await collectMetrics(supabase, window.startUtc, window.endUtc, sources);

    // Ninguna fuente de datos disponible → informe no fiable → FAILED, no enviar.
    if (!sources.posthog && !sources.supabase && !sources.stripe) {
      executionStatus = "FAILED";
      await finalizeRun(supabase, window.reportDate, {
        status: "FAILED", posthog_ok: false, supabase_ok: false, stripe_ok: false,
        error_sanitized: "all_data_sources_unavailable",
      });
      log({ action: "failed_all_sources", report_date: window.reportDate });
      return new Response(JSON.stringify({ ok: false, status: "FAILED", reason: "all_data_sources_unavailable" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Alguna fuente caída → PARTIAL (aún se envía, marcado claramente).
    if (!sources.posthog || !sources.supabase || !sources.stripe) executionStatus = "PARTIAL";

    const recommendations = buildRecommendations(metrics);
    const generatedAt = new Date().toISOString();
    const recipient = Deno.env.get("DAILY_REPORT_RECIPIENT") || "support@pipingbox.com";
    const data = {
      window, generatedAt, metrics, recommendations, sources, routes,
      executionStatus, isTest,
      avgSessionNote: "No disponible (requiere instrumentación de duración de sesión)",
    };

    const provider = createEmailProvider();
    if (!provider.isConfigured()) {
      sources.email = false;
      executionStatus = "PARTIAL";
      sendError = "email_provider_not_configured";
    } else {
      try {
        await withTimeout(
          provider.send({
            to: recipient,
            subject: reportSubject(window.reportDate, isTest),
            html: renderReportHtml(data),
            text: renderReportText(data),
          }),
          SOURCE_TIMEOUT_MS,
          "email",
        );
        sources.email = true;
      } catch (e) {
        sources.email = false;
        sendError = sanitizeError(e);
        executionStatus = "PARTIAL";
      }
    }

    // Fail-closed: solo SENT si el correo salió y ninguna fuente crítica falló.
    const sent = sources.email;
    const finalStatus = !sources.email ? "FAILED" : executionStatus === "SUCCESS" ? "SENT" : "PARTIAL";

    await finalizeRun(supabase, window.reportDate, {
      status: finalStatus,
      posthog_ok: sources.posthog,
      supabase_ok: sources.supabase,
      stripe_ok: sources.stripe,
      email_ok: sources.email,
      sent_at: sent ? generatedAt : null,
      error_sanitized: sendError,
    });

    log({ action: "report_done", report_date: window.reportDate, status: finalStatus, sources });
    return new Response(
      JSON.stringify({ ok: sources.email, status: finalStatus, report_date: window.reportDate, sources, test: isTest }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const err = sanitizeError(e);
    await finalizeRun(supabase, window.reportDate, {
      status: "FAILED",
      posthog_ok: sources.posthog, supabase_ok: sources.supabase, stripe_ok: sources.stripe, email_ok: sources.email,
      error_sanitized: err,
    });
    console.error(JSON.stringify({ correlationId, action: "report_exception", error: err }));
    return new Response(JSON.stringify({ ok: false, status: "FAILED", error: err }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
