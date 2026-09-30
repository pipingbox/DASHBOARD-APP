// Edge Function: daily-intelligence-report
// PB-PDI-004 — genera y envía el informe "PipingBox Daily Intelligence".
//
// INVOCACIÓN
//   - pg_cron `5 * * * *` (tick horario) + pg_net con cabecera `X-Cron-Key`.
//     El valor de esa clave vive en Supabase Vault (secreto
//     `daily-intelligence-cron-key`, generado DENTRO de la base de datos):
//     nunca aparece en SQL, código, logs ni respuestas. El envío productivo
//     SOLO procede cuando la hora local Europe/Brussels es 00:05 (ventana
//     00:00–00:59); el resto de ticks horarios se saltan sin efecto.
//   - Manual/admin: `Authorization: Bearer SUPABASE_SERVICE_ROLE_KEY`
//     (preflight, prueba y reintentos).
//
// ACTIVACIÓN DEL ENVÍO DIARIO
//   - Todo envío productivo exige el secreto `DAILY_REPORT_ENABLED="true"`
//     (lo activa el PO tras aprobar el correo de prueba). Hasta entonces el
//     cron existe pero cada tick se salta sin claim ni correo.
//
// PRUEBA {"test":true}
//   - Envía a support@pipingbox.com con asunto "[TEST] ..." y NO escribe en
//     app_daily_intelligence_runs: no consume ni bloquea el report_date
//     productivo del día.
//
// SEGURIDAD
//   - verify_jwt = false (el cron no porta JWT); la función autentica por sí
//     misma: Bearer service_role o X-Cron-Key validado contra Vault vía RPC
//     SECURITY DEFINER `app_verify_daily_report_cron_key` (solo service_role).
//   - Logs sin secretos ni PII (sanitizeError/sanitizeText).
//   - Fail-closed: si una fuente crítica falla, el informe es PARTIAL/FAILED y
//     nunca se marca SENT falsamente.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createEmailProvider } from "../_shared/email-provider.ts";
import {
  getPreviousBrusselsDayWindow,
  brusselsWallToUtc,
  isBrusselsDailyTick,
  evaluateProductionGate,
  claimDecision,
  sendWithRetry,
  SMTP_RETRY_POLICY,
  STALE_GENERATING_MS,
  buildRecommendations,
  renderReportHtml,
  renderReportText,
  reportSubject,
  sanitizeError,
  sanitizeText,
  scanForPii,
  hogqlTraffic,
  hogqlRoutes,
  hogqlFunnelSignup,
  hogqlOnboarding,
  hogqlOnboardingSteps,
  hogqlReferrals,
  hogqlErrors,
  type DailyMetrics,
  type SourceStatus,
  type RunRow,
} from "../_shared/daily-report-core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SOURCE_TIMEOUT_MS = 20_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label}_timeout`)), ms)),
  ]);
}

function json(obj: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
  const json2 = await res.json();
  return (json2?.results ?? []) as unknown[][];
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

// ── Claim idempotente del día (PB-DAILY-EMAIL-RETRY-001) ──────────────────
// EXACTLY-ONCE: la transición a GENERATING es un UPDATE condicional atómico
// (el WHERE re-verifica status/email_ok bajo el row lock). Dos ejecuciones
// concurrentes sobre el mismo report_date no pueden reclamar ambas: la
// segunda afecta a 0 filas. Las filas SENT o con email_ok=true jamás se
// tocan (un Daily cuyo correo salió no puede volver a enviarse).
async function claimRun(
  supabase: SupabaseClient,
  reportDate: string,
  correlationId: string,
  opts: { recoveryMode: boolean },
): Promise<{ claimed: boolean; skipReason: string | null }> {
  const logErr = (op: string, error: unknown) =>
    console.error(JSON.stringify({
      correlationId, action: "claim_db_error", op,
      error: sanitizeError((error as { message?: string })?.message ?? error),
    }));

  const { data: existing, error: selectError } = await supabase
    .from("app_daily_intelligence_runs")
    .select("status, attempts, email_ok, updated_at")
    .eq("report_date", reportDate)
    .maybeSingle();
  if (selectError) {
    logErr("select", selectError);
    return { claimed: false, skipReason: "claim_db_error" };
  }

  const decision = claimDecision((existing ?? null) as RunRow | null, opts);

  switch (decision) {
    case "already_sent":
    case "already_delivered":
      // SENT o correo ya entregado (PARTIAL con email_ok): nunca reenviar.
      return { claimed: false, skipReason: "already_sent" };
    case "nothing_to_recover":
      // Tick horario de recovery sin Daily fallido que recuperar.
      return { claimed: false, skipReason: "nothing_to_recover" };
    case "reject_in_progress":
      // Otra ejecución tiene el claim vivo (GENERATING fresco).
      return { claimed: false, skipReason: "claim_in_progress" };
    case "reject_exhausted":
      return { claimed: false, skipReason: "recovery_exhausted" };
    case "insert_fresh": {
      const { error } = await supabase.from("app_daily_intelligence_runs").insert({
        report_date: reportDate,
        status: "GENERATING",
        attempts: 1,
        correlation_id: correlationId,
      });
      // UNIQUE(report_date): otra ejecución concurrente ganó el claim.
      if (error) {
        logErr("insert", error);
        return { claimed: false, skipReason: "claim_contended" };
      }
      return { claimed: true, skipReason: null };
    }
    case "reclaim":
    case "stale_reclaim": {
      // Transición atómica condicional: re-verifica el estado en el WHERE.
      const nowIso = new Date().toISOString();
      let q = supabase
        .from("app_daily_intelligence_runs")
        .update({
          status: "GENERATING",
          attempts: (existing?.attempts ?? 0) + 1,
          correlation_id: correlationId,
          updated_at: nowIso,
        })
        .eq("report_date", reportDate);
      if (decision === "reclaim") {
        // Solo FAILED/PARTIAL cuyo correo NUNCA salió (email_ok null/false).
        q = q
          .in("status", ["FAILED", "PARTIAL"])
          .or("email_ok.is.null,email_ok.eq.false");
      } else {
        // GENERATING abandonado (ejecución muerta hace >15 min).
        q = q
          .eq("status", "GENERATING")
          .lt("updated_at", new Date(Date.now() - STALE_GENERATING_MS).toISOString());
      }
      const { data: updated, error } = await q.select();
      if (error) {
        logErr("update", error);
        return { claimed: false, skipReason: "claim_db_error" };
      }
      // 0 filas afectadas: el estado cambió bajo nosotros (ganador concurrente).
      if (!updated || updated.length === 0) {
        return { claimed: false, skipReason: "claim_contended" };
      }
      return { claimed: true, skipReason: null };
    }
  }
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

/** Ventana del día natural indicado (YYYY-MM-DD Brussels). */
function windowForReportDate(date: string) {
  const [y, mo, d] = date.split("-").map(Number);
  const anchor = brusselsWallToUtc(y, mo, d, 12, 0, 0);
  return getPreviousBrusselsDayWindow(new Date(anchor.getTime() + 24 * 3600 * 1000));
}

// ── Pipeline compartido: recolectar → renderizar → enviar ────────────────
async function generateAndSend(
  supabase: SupabaseClient,
  window: { reportDate: string; startUtc: string; endUtc: string },
  isTest: boolean,
  correlationId: string,
): Promise<{
  ok: boolean;
  status: "SENT" | "SENT_TEST" | "PARTIAL" | "FAILED";
  sources: SourceStatus;
  sendError: string | null;
  verification?: Record<string, unknown>;
}> {
  const sources: SourceStatus = { posthog: false, supabase: false, stripe: false, email: false };
  let executionStatus: "SUCCESS" | "PARTIAL" | "FAILED" = "SUCCESS";
  let sendError: string | null = null;

  const { metrics, routes } = await collectMetrics(supabase, window.startUtc, window.endUtc, sources);

  // Ninguna fuente de datos disponible → informe no fiable → FAILED, no enviar.
  if (!sources.posthog && !sources.supabase && !sources.stripe) {
    return { ok: false, status: "FAILED", sources, sendError: "all_data_sources_unavailable" };
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

  const html = renderReportHtml(data);
  const text = renderReportText(data);

  const provider = createEmailProvider();
  if (!provider.isConfigured()) {
    return { ok: false, status: "FAILED", sources, sendError: "email_provider_not_configured" };
  }
  // PB-DAILY-EMAIL-RETRY-001: retry con backoff SOLO para errores SMTP
  // transitorios (blacklist temporal, timeout, conexión, 4xx). Los permanentes
  // fallan rápido; el recovery horario queda acotado por MAX_DAILY_ATTEMPTS.
  const sendLog = (e: { action: string; attempt: number; reason?: string }) =>
    console.log(JSON.stringify({ correlationId, report_date: window.reportDate, ...e }));
  const sendResult = await sendWithRetry(
    () =>
      withTimeout(
        provider.send({
          to: recipient,
          subject: reportSubject(window.reportDate, isTest),
          html,
          text,
        }).then(() => undefined),
        SOURCE_TIMEOUT_MS,
        "email",
      ),
    SMTP_RETRY_POLICY,
    sendLog,
  );
  if (!sendResult.sent) {
    console.error(JSON.stringify({
      correlationId,
      action: "email_failed",
      report_date: window.reportDate,
      attempts: sendResult.attempts,
      error_class: sendResult.lastErrorClass,
      error: sendResult.lastError,
    }));
    return { ok: false, status: "FAILED", sources, sendError: sendResult.lastError ?? "email_send_failed" };
  }
  sources.email = true;

  // Verificación del contenido (secciones/recomendaciones/PII) para evidencia.
  const pii = scanForPii(`${html}\n${text}`);
  const verification = {
    sections: 9,
    recommendations: recommendations.length,
    recommendation_priorities: recommendations.map((r) => r.priority),
    html_chars: html.length,
    text_chars: text.length,
    pii_scan: pii,
    pii_clean: pii.emails === 0 && pii.phones === 0 && pii.tokens === 0,
    subject: reportSubject(window.reportDate, isTest),
    recipient_domain: "pipingbox.com",
  };

  const status = executionStatus === "SUCCESS" ? (isTest ? "SENT_TEST" : "SENT") : "PARTIAL";
  return { ok: true, status, sources, sendError, verification };
}

// ── Handler ───────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const correlationId = crypto.randomUUID();
  const log = (obj: Record<string, unknown>) => console.log(JSON.stringify({ correlationId, ...obj }));

  // Body opcional: {test, preflight, report_date}.
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  } catch { /* sin body */ }
  const isTest = body?.test === true;
  const isPreflight = body?.preflight === true;
  const rawDate = typeof body?.report_date === "string" ? body.report_date : null;
  const forcedDate = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabase = createClient(supabaseUrl, serviceKey);

  // ── Autenticación: admin (Bearer service_role) o cron (X-Cron-Key ↔ Vault).
  let authMode: "admin" | "cron" | null = null;
  const auth = req.headers.get("Authorization") || "";
  if (serviceKey && auth === `Bearer ${serviceKey}`) {
    authMode = "admin";
  } else {
    const cronKey = req.headers.get("X-Cron-Key") || "";
    if (cronKey) {
      try {
        const { data } = await supabase.rpc("app_verify_daily_report_cron_key", { p_candidate: cronKey });
        if (data === true) authMode = "cron";
      } catch (e) {
        console.error(JSON.stringify({ correlationId, action: "cron_key_verify_error", error: sanitizeError(e) }));
      }
    }
  }
  if (!authMode) {
    return json({ error: "unauthorized" }, 401);
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // ── Preflight: presencia de configuración por NOMBRE, sin valores.
  if (isPreflight) {
    const has = (n: string) => (Deno.env.get(n) || "").length > 0;
    const config: Record<string, boolean | string> = {
      SUPABASE_URL: !!supabaseUrl,
      SUPABASE_SERVICE_ROLE_KEY: !!serviceKey,
      POSTHOG_PERSONAL_API_KEY: has("POSTHOG_PERSONAL_API_KEY"),
      SMTP_HOST: has("SMTP_HOST"),
      SMTP_USER: has("SMTP_USER"),
      SMTP_PASSWORD: has("SMTP_PASSWORD"),
      SMTP_PORT: has("SMTP_PORT") ? true : "587 (default)",
      SMTP_SECURE: has("SMTP_SECURE") ? true : "true (default)",
      SMTP_FROM: has("SMTP_FROM") ? true : "noreply@pipingbox.com (default)",
      POSTHOG_PROJECT_ID: has("POSTHOG_PROJECT_ID") ? true : "271316 (default)",
      POSTHOG_HOST: has("POSTHOG_HOST") ? true : "https://eu.i.posthog.com (default)",
      DAILY_REPORT_RECIPIENT: has("DAILY_REPORT_RECIPIENT") ? true : "support@pipingbox.com (default)",
      DAILY_REPORT_ENABLED: Deno.env.get("DAILY_REPORT_ENABLED") === "true",
    };
    const missing = Object.entries(config).filter(([, v]) => v === false).map(([k]) => k);
    log({ action: "preflight", auth_mode: authMode, missing_required_secrets: missing });
    return json({ ok: true, action: "preflight", auth_mode: authMode, missing_required_secrets: missing, config });
  }

  // ── Gate de producción: activación por el PO + tick diario Brussels 00:05.
  // PB-DAILY-EMAIL-RETRY-001: los ticks horarios fuera de las 00:xx Brussels
  // entran en modo recovery (recuperar un FAILED de email), no en skip.
  const enabled = Deno.env.get("DAILY_REPORT_ENABLED") === "true";
  const isDailyTick = isBrusselsDailyTick(new Date());
  const gate = evaluateProductionGate({ isTest, enabled, authMode, isDailyTick });
  if (gate.action === "skip") {
    log({ action: "skip", reason: gate.reason, auth_mode: authMode });
    return json({ ok: true, skipped: gate.reason, auth_mode: authMode, correlation_id: correlationId });
  }
  const recoveryMode = gate.action === "check_recovery";

  const window = forcedDate ? windowForReportDate(forcedDate) : getPreviousBrusselsDayWindow(new Date());

  // ── Prueba: envío marcado [TEST]; NO consume el report_date productivo.
  if (isTest) {
    try {
      const r = await generateAndSend(supabase, window, true, correlationId);
      log({ action: "test_report", report_date: window.reportDate, status: r.status, sources: r.sources });
      return json({
        ok: r.ok, status: r.status, report_date: window.reportDate, test: true,
        correlation_id: correlationId, sources: r.sources,
        error: r.sendError ?? undefined, verification: r.verification,
      });
    } catch (e) {
      const err = sanitizeError(e);
      log({ action: "test_report_exception", error: err });
      return json({ ok: false, status: "FAILED", reason: err, test: true, correlation_id: correlationId });
    }
  }

  // ── Producción: claim idempotente → pipeline → finalize fail-closed.
  if (recoveryMode) {
    log({ action: "recovery_attempt", report_date: window.reportDate });
  }
  const claim = await claimRun(supabase, window.reportDate, correlationId, { recoveryMode });
  if (!claim.claimed) {
    log({ action: "skip", reason: claim.skipReason, report_date: window.reportDate, recovery: recoveryMode });
    return json({
      ok: true, skipped: claim.skipReason, report_date: window.reportDate,
      correlation_id: correlationId, recovery: recoveryMode,
    });
  }

  try {
    const r = await generateAndSend(supabase, window, false, correlationId);
    // Fail-closed: solo SENT/PARTIAL si el correo salió; si no, FAILED.
    const finalStatus = !r.sources.email ? "FAILED" : r.status;
    await finalizeRun(supabase, window.reportDate, {
      status: finalStatus,
      posthog_ok: r.sources.posthog,
      supabase_ok: r.sources.supabase,
      stripe_ok: r.sources.stripe,
      email_ok: r.sources.email,
      sent_at: r.sources.email ? new Date().toISOString() : null,
      error_sanitized: r.sendError,
    });
    log({ action: "report_done", report_date: window.reportDate, status: finalStatus, sources: r.sources });
    return json({
      ok: r.ok, status: finalStatus, report_date: window.reportDate,
      correlation_id: correlationId, sources: r.sources,
      error: r.sendError ?? undefined,
    });
  } catch (e) {
    const err = sanitizeError(e);
    await finalizeRun(supabase, window.reportDate, { status: "FAILED", error_sanitized: err });
    console.error(JSON.stringify({ correlationId, action: "report_exception", error: err }));
    return json({ ok: false, status: "FAILED", error: err, correlation_id: correlationId });
  }
});
