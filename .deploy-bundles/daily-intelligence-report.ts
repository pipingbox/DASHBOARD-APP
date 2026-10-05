// supabase/functions/daily-intelligence-report/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// supabase/functions/_shared/email-provider.ts
import nodemailer from "npm:nodemailer";
var RESEND_PROVIDER_NAME = "resend_smtp";
var ONECOM_PROVIDER_NAME = "smtp_onecom";
var NOTIFY_DEFAULT_FROM = "notifications@notify.pipingbox.com";
var LEGACY_DEFAULT_FROM = "noreply@pipingbox.com";
function resolveSmtpConfig() {
  const notifyHost = Deno.env.get("NOTIFY_SMTP_HOST");
  const notifyUser = Deno.env.get("NOTIFY_SMTP_USER");
  const notifyPass = Deno.env.get("NOTIFY_SMTP_PASSWORD");
  if (notifyHost && notifyUser && notifyPass) {
    return {
      host: notifyHost,
      port: parseInt(Deno.env.get("NOTIFY_SMTP_PORT") || "465", 10),
      secure: Deno.env.get("NOTIFY_SMTP_SECURE") !== "false",
      user: notifyUser,
      pass: notifyPass,
      from: Deno.env.get("NOTIFY_SMTP_FROM") || NOTIFY_DEFAULT_FROM,
      providerName: RESEND_PROVIDER_NAME
    };
  }
  const host = Deno.env.get("SMTP_HOST");
  const user = Deno.env.get("SMTP_USER");
  const pass = Deno.env.get("SMTP_PASSWORD");
  if (!host || !user || !pass) {
    return null;
  }
  return {
    host,
    port: parseInt(Deno.env.get("SMTP_PORT") || "587", 10),
    secure: Deno.env.get("SMTP_SECURE") !== "false",
    user,
    pass,
    from: Deno.env.get("SMTP_FROM") || LEGACY_DEFAULT_FROM,
    providerName: ONECOM_PROVIDER_NAME
  };
}
var SmtpEmailProvider = class {
  transporter;
  from;
  providerName;
  constructor(config) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass }
    });
    this.from = config.from;
    this.providerName = config.providerName;
  }
  isConfigured() {
    return true;
  }
  async send(message) {
    const result = await this.transporter.sendMail({
      from: message.fromName ? { name: message.fromName, address: this.from } : this.from,
      to: message.to,
      bcc: message.bcc,
      replyTo: message.replyTo,
      subject: message.subject,
      text: message.text,
      html: message.html
    });
    return {
      messageId: result.messageId,
      provider: this.providerName,
      accepted: Array.isArray(result.accepted) ? result.accepted.length : void 0,
      rejected: Array.isArray(result.rejected) ? result.rejected.length : void 0
    };
  }
};
var NoopEmailProvider = class {
  isConfigured() {
    return false;
  }
  async send() {
    throw new Error("email_provider_not_configured");
  }
};
function createEmailProvider() {
  const config = resolveSmtpConfig();
  if (!config) {
    return new NoopEmailProvider();
  }
  return new SmtpEmailProvider(config);
}

// supabase/functions/_shared/daily-report-core.ts
var BRUSSELS_TZ = "Europe/Brussels";
function tzOffsetMs(utcDate, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = dtf.formatToParts(utcDate);
  const get = (t) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") === 24 ? 0 : get("hour"), get("minute"), get("second"));
  return asUTC - utcDate.getTime();
}
function brusselsWallToUtc(y, mo, d, h, mi, s) {
  let guess = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  for (let i = 0; i < 3; i++) {
    const off = tzOffsetMs(guess, BRUSSELS_TZ);
    const corrected = new Date(Date.UTC(y, mo - 1, d, h, mi, s) - off);
    if (corrected.getTime() === guess.getTime()) break;
    guess = corrected;
  }
  return guess;
}
function brusselsParts(utcDate) {
  const dtf = new Intl.DateTimeFormat("en-CA", { timeZone: BRUSSELS_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  const [y, mo, d] = dtf.format(utcDate).split("-").map(Number);
  return { y, mo, d };
}
function getPreviousBrusselsDayWindow(now) {
  const { y, mo, d } = brusselsParts(now);
  const end = brusselsWallToUtc(y, mo, d, 0, 0, 0);
  const start = new Date(end.getTime());
  const yesterday = new Date(Date.UTC(y, mo - 1, d - 1));
  const yp = brusselsParts(yesterday);
  const startWall = brusselsWallToUtc(yp.y, yp.mo, yp.d, 0, 0, 0);
  start.setTime(startWall.getTime());
  const pad = (n) => String(n).padStart(2, "0");
  return {
    reportDate: `${yp.y}-${pad(yp.mo)}-${pad(yp.d)}`,
    startUtc: start.toISOString(),
    endUtc: end.toISOString()
  };
}
function brusselsTimeParts(utcDate) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: BRUSSELS_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = dtf.formatToParts(utcDate);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { hour: hour === 24 ? 0 : hour, minute };
}
function isBrusselsDailyTick(now) {
  return brusselsTimeParts(now).hour === 0;
}
function evaluateProductionGate(i) {
  if (i.isTest) return { action: "run" };
  if (!i.enabled) return { action: "skip", reason: "production_disabled" };
  if (i.authMode === "cron" && !i.isDailyTick) return { action: "check_recovery" };
  return { action: "run" };
}
function hogqlTraffic() {
  return `SELECT count() AS page_views, count(DISTINCT person_id) AS unique_persons, count(DISTINCT properties.$session_id) AS sessions FROM events WHERE event = 'page_viewed' AND properties.environment = 'production' AND timestamp >= parseDateTimeBestEffort('${"${start}"}') AND timestamp < parseDateTimeBestEffort('${"${end}"}')`;
}
function hogqlRoutes() {
  return `SELECT properties.route AS route, count() AS views, count(DISTINCT person_id) AS unique_persons FROM events WHERE event = 'page_viewed' AND properties.environment = 'production' AND timestamp >= parseDateTimeBestEffort('${"${start}"}') AND timestamp < parseDateTimeBestEffort('${"${end}"}') GROUP BY route ORDER BY views DESC LIMIT 25`;
}
function hogqlFunnelSignup() {
  return `SELECT countIf(event = 'signup_started') AS signup_started, countIf(event = 'auth_created') AS auth_created FROM events WHERE event IN ('signup_started','auth_created') AND properties.environment = 'production' AND timestamp >= parseDateTimeBestEffort('${"${start}"}') AND timestamp < parseDateTimeBestEffort('${"${end}"}')`;
}
function hogqlOnboarding() {
  return `SELECT countIf(event = 'onboarding_started') AS started, countIf(event = 'onboarding_step_reached') AS step_events, countIf(event = 'onboarding_completed') AS completed FROM events WHERE event IN ('onboarding_started','onboarding_step_reached','onboarding_completed') AND properties.environment = 'production' AND timestamp >= parseDateTimeBestEffort('${"${start}"}') AND timestamp < parseDateTimeBestEffort('${"${end}"}')`;
}
function hogqlOnboardingSteps() {
  return `SELECT toString(properties.step) AS step, count(DISTINCT person_id) AS users_reached FROM events WHERE event = 'onboarding_step_reached' AND properties.environment = 'production' AND timestamp >= parseDateTimeBestEffort('${"${start}"}') AND timestamp < parseDateTimeBestEffort('${"${end}"}') GROUP BY step ORDER BY step ASC`;
}
function hogqlReferrals() {
  return `SELECT countIf(event = 'referral_link_opened') AS opened, countIf(event = 'referral_captured') AS captured FROM events WHERE event IN ('referral_link_opened','referral_captured') AND properties.environment = 'production' AND timestamp >= parseDateTimeBestEffort('${"${start}"}') AND timestamp < parseDateTimeBestEffort('${"${end}"}')`;
}
function hogqlErrors() {
  return `SELECT properties.error_name AS error_name, properties.incident_code AS incident_code, properties.route AS route, count() AS occurrences, max(timestamp) AS last_seen FROM events WHERE event = 'app_error' AND properties.environment = 'production' AND timestamp >= parseDateTimeBestEffort('${"${start}"}') AND timestamp < parseDateTimeBestEffort('${"${end}"}') GROUP BY error_name, incident_code, route ORDER BY occurrences DESC LIMIT 50`;
}
var PRIORITY_RANK = { P0: 0, P1: 1, P2: 2 };
function buildRecommendations(m) {
  const recs = [];
  if (m.checkoutNotActivated > 0) {
    recs.push({
      priority: "P0",
      title: "Pago completado sin activaci\xF3n de plan",
      evidence: `${m.checkoutNotActivated} checkout(s) completados sin activaci\xF3n can\xF3nica el d\xEDa analizado.`,
      impact: "Clientes que pagaron sin acceso concedido: riesgo financiero y de confianza.",
      action: "Reconciliar checkout.session.completed contra app_subscriptions/app_orders y conceder acceso.",
      successCriteria: "0 checkouts completados sin activaci\xF3n en el pr\xF3ximo informe.",
      observational: false
    });
  }
  if (m.uniquePersons === 0 && m.pageViews === 0) {
    recs.push({
      priority: "P1",
      title: "Ausencia total de tr\xE1fico de producci\xF3n",
      evidence: "0 personas \xFAnicas y 0 page views con environment='production' en el d\xEDa.",
      impact: "O bien no hubo usuarios, o la telemetr\xEDa dej\xF3 de ingerir.",
      action: "Verificar manualmente que la app responde y que PostHog ingiere; confirmar que no es un fallo de la capa.",
      successCriteria: "Confirmar si el cero es real (sin usuarios) o un fallo de ingesta.",
      observational: true
    });
  }
  if (m.totalErrors > 0) {
    const top = m.errors[0];
    const repeated = m.errors.filter((e) => e.occurrences >= 3);
    recs.push({
      priority: repeated.length > 0 ? "P1" : "P2",
      title: `Errores de aplicaci\xF3n (${m.totalErrors} en el d\xEDa)`,
      evidence: top ? `M\xE1s frecuente: ${top.errorName} (${top.occurrences}x, ${top.incidentCode || "sin c\xF3digo"}, ruta ${top.route || "desconocida"}).` : `${m.totalErrors} app_error.`,
      impact: "Degrada la experiencia y puede bloquear journeys clave.",
      action: "Investigar la ruta y el c\xF3digo PB-ERR del error m\xE1s recurrente.",
      successCriteria: "Reducir la recurrencia del error principal a 0 en pr\xF3ximos informes.",
      observational: false
    });
  }
  if (m.signupStarted > m.authCreated) {
    const drop = m.signupStarted - m.authCreated;
    recs.push({
      priority: drop >= 3 ? "P1" : "P2",
      title: "Registros iniciados sin completar alta",
      evidence: `${m.signupStarted} signup_started frente a ${m.authCreated} auth_created (${drop} abandonos).`,
      impact: "P\xE9rdida de altas en el primer paso del funnel.",
      action: "Revisar el flujo de Auth (errores, validaciones, confirmaci\xF3n) en el paso de alta.",
      successCriteria: "Conversi\xF3n signup\u2192auth_created en mejora sostenida.",
      observational: false
    });
  }
  if (m.emailsPending > 0) {
    recs.push({
      priority: m.emailsPending >= 3 ? "P1" : "P2",
      title: "Altas sin confirmaci\xF3n de correo",
      evidence: `${m.emailsPending} cuenta(s) creadas sin email confirmado al cierre del d\xEDa.`,
      impact: "Usuarios que no pueden iniciar sesi\xF3n; posible problema de entrega de correo.",
      action: "Revisar la entrega del correo de confirmaci\xF3n (SMTP, spam) y la UX de reenv\xEDo.",
      successCriteria: "Reducir cuentas pendientes de confirmaci\xF3n respecto a nuevas altas.",
      observational: false
    });
  }
  if (m.onboardingStarted > m.onboardingCompleted && m.onboardingStepDropoffs.length > 0) {
    const steps = [...m.onboardingStepDropoffs].sort((a, b) => Number(a.step) - Number(b.step));
    let worst = steps[0];
    let worstDrop = -1;
    for (let i = 0; i < steps.length; i++) {
      const reached = steps[i].usersReached;
      const next = steps[i + 1]?.usersReached ?? (i === steps.length - 1 ? m.onboardingCompleted : reached);
      const drop = reached - next;
      if (drop > worstDrop) {
        worstDrop = drop;
        worst = steps[i];
      }
    }
    recs.push({
      priority: "P2",
      title: "Abandono del onboarding",
      evidence: `${m.onboardingStarted} iniciados, ${m.onboardingCompleted} completados; mayor ca\xEDda en el paso ${worst.step}.`,
      impact: "Perfiles que no llegan a MARKETPLACE_READY.",
      action: `Revisar la fricci\xF3n del paso ${worst.step} del wizard.`,
      successCriteria: "Aumentar la tasa de finalizaci\xF3n del onboarding.",
      observational: false
    });
  }
  if (m.referralOpened > m.referralCaptured) {
    recs.push({
      priority: "P2",
      title: "Referidos abiertos sin captura",
      evidence: `${m.referralOpened} referral_link_opened frente a ${m.referralCaptured} referral_captured.`,
      impact: "Atribuci\xF3n de referidos incompleta.",
      action: "Revisar la persistencia/atribuci\xF3n del c\xF3digo referido tras la apertura.",
      successCriteria: "Aproximar referral_captured a referral_link_opened.",
      observational: false
    });
  }
  if (m.paymentsFailed > 0) {
    recs.push({
      priority: "P2",
      title: "Pagos fallidos",
      evidence: `${m.paymentsFailed} pago(s) fallidos en el d\xEDa.`,
      impact: "Ingresos no capturados.",
      action: "Revisar causas de fallo de pago y la reintentaci\xF3n de checkout.",
      successCriteria: "Reducir pagos fallidos respecto a completados.",
      observational: false
    });
  }
  recs.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  const observations = [
    {
      priority: "P2",
      title: "Observaci\xF3n: actividad de referidos",
      evidence: `${m.referralOpened} aperturas y ${m.referralCaptured} capturas de referido.`,
      impact: "Canal de crecimiento org\xE1nico.",
      action: "Mantener la atribuci\xF3n; valorar incentivar el compartido.",
      successCriteria: "Crecimiento sostenido de capturas semana a semana.",
      observational: true
    },
    {
      priority: "P2",
      title: "Observaci\xF3n: engagement de tr\xE1fico",
      evidence: `${m.pageViews} page views de ${m.uniquePersons} personas en ${m.sessions} sesiones.`,
      impact: "Se\xF1al de inter\xE9s del producto.",
      action: "Revisar las rutas m\xE1s vistas para priorizar contenido.",
      successCriteria: "Aumentar vistas por sesi\xF3n.",
      observational: true
    },
    {
      priority: "P2",
      title: "Observaci\xF3n: finalizaci\xF3n de onboarding",
      evidence: `${m.onboardingCompleted} onboarding completados.`,
      impact: "Perfiles listos para el marketplace.",
      action: "Analizar qu\xE9 impulsa a completar y replicarlo.",
      successCriteria: "Crecer onboarding_completed.",
      observational: true
    },
    {
      priority: "P2",
      title: "Observaci\xF3n: actividad de pagos",
      evidence: `${m.paymentsCompleted} pagos completados (${(m.grossCents / 100).toFixed(2)} ${m.currency}).`,
      impact: "Ingresos.",
      action: "Mantener el flujo de checkout estable.",
      successCriteria: "Crecer pagos completados.",
      observational: true
    },
    {
      priority: "P2",
      title: "Observaci\xF3n: salud de registros",
      evidence: `${m.newUsers} nuevos usuarios, ${m.emailsConfirmed} correos confirmados.`,
      impact: "Base de usuarios.",
      action: "Mantener la entregabilidad del correo de confirmaci\xF3n.",
      successCriteria: "Tasa de confirmaci\xF3n alta.",
      observational: true
    }
  ];
  const result = recs.slice(0, 5);
  for (const obs of observations) {
    if (result.length >= 5) break;
    if (!result.some((r) => r.title === obs.title)) result.push(obs);
  }
  return result.slice(0, 5);
}
var EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
var PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/g;
var TOKENISH_RE = /(phc_|phx_|sk_live|sk_test|whsec_|Bearer\s+)[A-Za-z0-9_-]+/g;
function sanitizeText(input) {
  return String(input ?? "").replace(EMAIL_RE, "[redacted-email]").replace(TOKENISH_RE, "[redacted-secret]").replace(PHONE_RE, "[redacted-phone]");
}
function sanitizeError(err) {
  const msg = err instanceof Error ? err.message : String(err ?? "unknown_error");
  return sanitizeText(msg).slice(0, 300);
}
var RETRYABLE_SMTP_PATTERNS = [
  /temporarily blacklisted/i,
  /blacklist/i,
  /try again later/i,
  /greylist/i,
  /timeout|timed?\s*out|etimedout|esocket/i,
  /connection\s+(reset|closed|refused|dropped|error)|econnreset|epipe|econnrefused|eai_again|ehostunreach|enetunreach/i,
  /\b(421|450|451|452)\b/,
  /server busy|too many connections|service unavailable|insufficient system storage/i
];
var NON_RETRYABLE_SMTP_PATTERNS = [
  /email_provider_not_configured/,
  /invalid recipient|no such user|unknown user|bad destination|address rejected/i,
  /\b(535|550|551|552|553|554)\b/,
  /sender rejected|message rejected|authentication (failed|required)|invalid login/i,
  /relaying denied|dns ?error/i
];
function classifySmtpError(err) {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (RETRYABLE_SMTP_PATTERNS.some((re) => re.test(msg))) return "retryable";
  if (NON_RETRYABLE_SMTP_PATTERNS.some((re) => re.test(msg))) return "non_retryable";
  return "non_retryable";
}
var SMTP_RETRY_POLICY = { maxAttempts: 3, delaysMs: [2e3, 5e3] };
async function sendWithRetry(send, policy, log) {
  let attempts = 0;
  let lastError = null;
  let lastErrorClass = null;
  for (let i = 1; i <= policy.maxAttempts; i++) {
    attempts = i;
    log({ action: "email_attempt", attempt: i });
    try {
      await send();
      return { sent: true, attempts, lastError: null, lastErrorClass: null };
    } catch (e) {
      lastError = sanitizeError(e);
      lastErrorClass = classifySmtpError(e);
      if (lastErrorClass === "non_retryable" || i === policy.maxAttempts) break;
      log({ action: "email_retry", attempt: i + 1, reason: `smtp_${lastErrorClass}` });
      await new Promise((r) => setTimeout(r, policy.delaysMs[i - 1] ?? 5e3));
    }
  }
  return { sent: false, attempts, lastError, lastErrorClass };
}
var MAX_DAILY_ATTEMPTS = 4;
var STALE_GENERATING_MS = 15 * 60 * 1e3;
function claimDecision(row2, opts, now = /* @__PURE__ */ new Date()) {
  if (!row2) return opts.recoveryMode ? "nothing_to_recover" : "insert_fresh";
  if (row2.status === "SENT") return "already_sent";
  if (row2.email_ok === true) return "already_delivered";
  if (row2.status === "GENERATING") {
    const stale = !!row2.updated_at && now.getTime() - new Date(row2.updated_at).getTime() > STALE_GENERATING_MS;
    return stale ? "stale_reclaim" : "reject_in_progress";
  }
  if ((row2.attempts ?? 0) >= MAX_DAILY_ATTEMPTS) return "reject_exhausted";
  return "reclaim";
}
function scanForPii(text) {
  const t = String(text ?? "");
  const emailRe = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  const phoneRe = /\+\d[\d\s().-]{7,}\d/g;
  const tokenRe = /(phc_|phx_|sk_live|sk_test|whsec_)[A-Za-z0-9_-]+/g;
  return {
    emails: (t.match(emailRe) || []).length,
    phones: (t.match(phoneRe) || []).length,
    tokens: (t.match(tokenRe) || []).length
  };
}
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function row(label, value) {
  return `<tr><td style="padding:6px 0;color:#71717a;width:220px;">${esc(label)}</td><td style="padding:6px 0;color:#fafafa;font-weight:600;">${esc(value)}</td></tr>`;
}
function renderReportHtml(d) {
  const m = d.metrics;
  const srcBadge = (ok) => ok ? "\u2705 OK" : "\u26A0\uFE0F NO DISPONIBLE";
  const recRows = d.recommendations.map(
    (r) => `<div style="margin:0 0 12px;padding:12px;background:#18181b;border:1px solid #27272a;border-left:3px solid ${r.priority === "P0" ? "#dc2626" : r.priority === "P1" ? "#f59e0b" : "#3b82f6"};">
        <p style="margin:0;font-size:13px;color:#fafafa;font-weight:600;">[${r.priority}] ${esc(r.title)}${r.observational ? ' <span style="color:#71717a;font-weight:400;">(observaci\xF3n)</span>' : ""}</p>
        <p style="margin:6px 0 0;font-size:12px;color:#a1a1aa;"><strong>Evidencia:</strong> ${esc(r.evidence)}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#a1a1aa;"><strong>Impacto:</strong> ${esc(r.impact)}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#a1a1aa;"><strong>Acci\xF3n:</strong> ${esc(r.action)}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#a1a1aa;"><strong>Criterio de \xE9xito:</strong> ${esc(r.successCriteria)}</p>
      </div>`
  ).join("");
  const routeRows = d.routes.slice(0, 10).map((r) => `<tr><td style="padding:4px 0;color:#d4d4d8;">${esc(r.route)}</td><td style="padding:4px 0;color:#fafafa;text-align:right;">${r.views}</td><td style="padding:4px 0;color:#a1a1aa;text-align:right;">${r.uniquePersons}</td></tr>`).join("");
  const errRows = m.errors.slice(0, 10).map((e) => `<tr><td style="padding:4px 0;color:#d4d4d8;">${esc(e.errorName)}</td><td style="padding:4px 0;color:#a1a1aa;">${esc(e.incidentCode || "\u2014")}</td><td style="padding:4px 0;color:#a1a1aa;">${esc(e.route || "\u2014")}</td><td style="padding:4px 0;color:#fafafa;text-align:right;">${e.occurrences}</td></tr>`).join("");
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#0a0a0a;color:#e4e4e7;border:1px solid #27272a;">
  <div style="border-bottom:1px solid #27272a;padding-bottom:16px;margin-bottom:24px;">
    <h1 style="margin:0;font-size:20px;color:#f59e0b;">${d.isTest ? "[TEST] " : ""}PipingBox Daily Intelligence</h1>
    <p style="margin:4px 0 0;font-size:12px;color:#71717a;">Periodo: ${esc(d.window.reportDate)} (Europe/Brussels) \xB7 Generado: ${esc(d.generatedAt)} \xB7 Estado: ${d.executionStatus}</p>
  </div>

  <h2 style="font-size:15px;color:#fafafa;border-bottom:1px solid #27272a;padding-bottom:6px;">1. Resumen ejecutivo</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    ${row("Personas \xFAnicas", String(m.uniquePersons))}
    ${row("Sesiones", String(m.sessions))}
    ${row("Page views", String(m.pageViews))}
    ${row("Nuevos usuarios", String(m.newUsers))}
    ${row("Pagos completados", `${m.paymentsCompleted} (${(m.grossCents / 100).toFixed(2)} ${m.currency})`)}
    ${row("Errores", String(m.totalErrors))}
  </table>

  <h2 style="font-size:15px;color:#fafafa;border-bottom:1px solid #27272a;padding-bottom:6px;margin-top:24px;">2. Tr\xE1fico y comportamiento</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    ${row("Duraci\xF3n media de sesi\xF3n", d.avgSessionNote)}
  </table>
  <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;">
    <tr><th style="text-align:left;color:#71717a;font-weight:600;padding-bottom:4px;">Ruta</th><th style="text-align:right;color:#71717a;font-weight:600;">Vistas</th><th style="text-align:right;color:#71717a;font-weight:600;">\xDAnicos</th></tr>
    ${routeRows || '<tr><td colspan="3" style="color:#71717a;padding:8px 0;">Sin datos.</td></tr>'}
  </table>

  <h2 style="font-size:15px;color:#fafafa;border-bottom:1px solid #27272a;padding-bottom:6px;margin-top:24px;">3. Registros y confirmaciones</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    ${row("signup_started", String(m.signupStarted))}
    ${row("auth_created", String(m.authCreated))}
    ${row("Nuevos usuarios (backend)", String(m.newUsers))}
    ${row("Correos confirmados", String(m.emailsConfirmed))}
    ${row("Pendientes de confirmaci\xF3n", String(m.emailsPending))}
  </table>

  <h2 style="font-size:15px;color:#fafafa;border-bottom:1px solid #27272a;padding-bottom:6px;margin-top:24px;">4. Onboarding y perfiles</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    ${row("onboarding_started", String(m.onboardingStarted))}
    ${row("onboarding_completed", String(m.onboardingCompleted))}
  </table>

  <h2 style="font-size:15px;color:#fafafa;border-bottom:1px solid #27272a;padding-bottom:6px;margin-top:24px;">5. Referidos</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    ${row("referral_link_opened", String(m.referralOpened))}
    ${row("referral_captured", String(m.referralCaptured))}
  </table>

  <h2 style="font-size:15px;color:#fafafa;border-bottom:1px solid #27272a;padding-bottom:6px;margin-top:24px;">6. Pagos</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    ${row("Pagos completados", String(m.paymentsCompleted))}
    ${row("Importe bruto", `${(m.grossCents / 100).toFixed(2)} ${m.currency}`)}
    ${row("Pagos fallidos", String(m.paymentsFailed))}
    ${row("Checkout sin activaci\xF3n", String(m.checkoutNotActivated))}
  </table>

  <h2 style="font-size:15px;color:#fafafa;border-bottom:1px solid #27272a;padding-bottom:6px;margin-top:24px;">7. Errores e incidencias</h2>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <tr><th style="text-align:left;color:#71717a;font-weight:600;">Error</th><th style="text-align:left;color:#71717a;font-weight:600;">C\xF3digo</th><th style="text-align:left;color:#71717a;font-weight:600;">Ruta</th><th style="text-align:right;color:#71717a;font-weight:600;">Ocurrencias</th></tr>
    ${errRows || '<tr><td colspan="4" style="color:#71717a;padding:8px 0;">Sin errores.</td></tr>'}
  </table>

  <h2 style="font-size:15px;color:#fafafa;border-bottom:1px solid #27272a;padding-bottom:6px;margin-top:24px;">8. Cinco acciones recomendadas</h2>
  ${recRows}

  <h2 style="font-size:15px;color:#fafafa;border-bottom:1px solid #27272a;padding-bottom:6px;margin-top:24px;">9. Estado de las fuentes</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    ${row("PostHog", srcBadge(d.sources.posthog))}
    ${row("Supabase", srcBadge(d.sources.supabase))}
    ${row("Stripe", srcBadge(d.sources.stripe))}
  </table>

  <div style="margin-top:24px;padding-top:16px;border-top:1px solid #27272a;font-size:11px;color:#52525b;">
    PipingBox Daily Intelligence \xB7 Informe operativo interno \xB7 Europe/Brussels${d.isTest ? " \xB7 CORREO DE PRUEBA" : ""}
  </div>
</div>`;
}
function renderReportText(d) {
  const m = d.metrics;
  const lines = [];
  lines.push(`${d.isTest ? "[TEST] " : ""}PipingBox Daily Intelligence`);
  lines.push(`Periodo: ${d.window.reportDate} (Europe/Brussels) | Generado: ${d.generatedAt} | Estado: ${d.executionStatus}`);
  lines.push("");
  lines.push("1. RESUMEN EJECUTIVO");
  lines.push(`  Personas \xFAnicas: ${m.uniquePersons} | Sesiones: ${m.sessions} | Page views: ${m.pageViews}`);
  lines.push(`  Nuevos usuarios: ${m.newUsers} | Pagos: ${m.paymentsCompleted} (${(m.grossCents / 100).toFixed(2)} ${m.currency}) | Errores: ${m.totalErrors}`);
  lines.push("");
  lines.push("2. TR\xC1FICO");
  lines.push(`  Duraci\xF3n media de sesi\xF3n: ${d.avgSessionNote}`);
  for (const r of d.routes.slice(0, 10)) lines.push(`  ${r.route} \u2014 ${r.views} vistas, ${r.uniquePersons} \xFAnicos`);
  lines.push("");
  lines.push("3. REGISTROS");
  lines.push(`  signup_started: ${m.signupStarted} | auth_created: ${m.authCreated} | nuevos: ${m.newUsers} | confirmados: ${m.emailsConfirmed} | pendientes: ${m.emailsPending}`);
  lines.push("");
  lines.push("4. ONBOARDING");
  lines.push(`  started: ${m.onboardingStarted} | completed: ${m.onboardingCompleted}`);
  lines.push("");
  lines.push("5. REFERIDOS");
  lines.push(`  opened: ${m.referralOpened} | captured: ${m.referralCaptured}`);
  lines.push("");
  lines.push("6. PAGOS");
  lines.push(`  completados: ${m.paymentsCompleted} | bruto: ${(m.grossCents / 100).toFixed(2)} ${m.currency} | fallidos: ${m.paymentsFailed} | sin activaci\xF3n: ${m.checkoutNotActivated}`);
  lines.push("");
  lines.push("7. ERRORES");
  for (const e of m.errors.slice(0, 10)) lines.push(`  ${e.errorName} (${e.incidentCode || "\u2014"}, ${e.route || "\u2014"}) x${e.occurrences}`);
  if (m.errors.length === 0) lines.push("  Sin errores.");
  lines.push("");
  lines.push("8. CINCO ACCIONES RECOMENDADAS");
  d.recommendations.forEach((r, i) => {
    lines.push(`  ${i + 1}. [${r.priority}] ${r.title}${r.observational ? " (observaci\xF3n)" : ""}`);
    lines.push(`     Evidencia: ${r.evidence}`);
    lines.push(`     Acci\xF3n: ${r.action}`);
  });
  lines.push("");
  lines.push("9. ESTADO DE LAS FUENTES");
  lines.push(`  PostHog: ${d.sources.posthog ? "OK" : "NO DISPONIBLE"} | Supabase: ${d.sources.supabase ? "OK" : "NO DISPONIBLE"} | Stripe: ${d.sources.stripe ? "OK" : "NO DISPONIBLE"}`);
  return lines.join("\n");
}
function reportSubject(reportDate, isTest) {
  return `${isTest ? "[TEST] " : ""}PipingBox Daily Intelligence \u2014 ${reportDate}`;
}

// supabase/functions/daily-intelligence-report/index.ts
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
var SOURCE_TIMEOUT_MS = 2e4;
function withTimeout(p, ms, label) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label}_timeout`)), ms))
  ]);
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
async function hogql(query, start, end) {
  const key = Deno.env.get("POSTHOG_PERSONAL_API_KEY");
  const host = Deno.env.get("POSTHOG_HOST") || "https://eu.i.posthog.com";
  const project = Deno.env.get("POSTHOG_PROJECT_ID") || "271316";
  if (!key) throw new Error("posthog_key_not_configured");
  const filled = query.replaceAll("${start}", start).replaceAll("${end}", end);
  const res = await withTimeout(
    fetch(`${host}/api/projects/${project}/query/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query: filled } })
    }),
    SOURCE_TIMEOUT_MS,
    "posthog"
  );
  if (!res.ok) throw new Error(`posthog_http_${res.status}`);
  const json2 = await res.json();
  return json2?.results ?? [];
}
var num = (v) => Number(v ?? 0) || 0;
async function collectMetrics(supabase, start, end, sources) {
  const m = {
    pageViews: 0,
    uniquePersons: 0,
    sessions: 0,
    signupStarted: 0,
    authCreated: 0,
    onboardingStarted: 0,
    onboardingCompleted: 0,
    onboardingStepDropoffs: [],
    referralOpened: 0,
    referralCaptured: 0,
    errors: [],
    totalErrors: 0,
    newUsers: 0,
    emailsConfirmed: 0,
    emailsPending: 0,
    paymentsCompleted: 0,
    paymentsFailed: 0,
    grossCents: 0,
    currency: "EUR",
    checkoutNotActivated: 0
  };
  let routes = [];
  try {
    const traffic = await hogql(hogqlTraffic(), start, end);
    m.pageViews = num(traffic[0]?.[0]);
    m.uniquePersons = num(traffic[0]?.[1]);
    m.sessions = num(traffic[0]?.[2]);
    const r = await hogql(hogqlRoutes(), start, end);
    routes = r.map((row2) => ({ route: String(row2[0] ?? "/"), views: num(row2[1]), uniquePersons: num(row2[2]) }));
    const signup = await hogql(hogqlFunnelSignup(), start, end);
    m.signupStarted = num(signup[0]?.[0]);
    m.authCreated = num(signup[0]?.[1]);
    const onb = await hogql(hogqlOnboarding(), start, end);
    m.onboardingStarted = num(onb[0]?.[0]);
    m.onboardingCompleted = num(onb[0]?.[2]);
    const steps = await hogql(hogqlOnboardingSteps(), start, end);
    m.onboardingStepDropoffs = steps.map((row2) => ({ step: String(row2[0] ?? ""), usersReached: num(row2[1]) }));
    const ref = await hogql(hogqlReferrals(), start, end);
    m.referralOpened = num(ref[0]?.[0]);
    m.referralCaptured = num(ref[0]?.[1]);
    const errs = await hogql(hogqlErrors(), start, end);
    m.errors = errs.map((row2) => ({
      errorName: sanitizeText(String(row2[0] ?? "Error")),
      incidentCode: sanitizeText(String(row2[1] ?? "")),
      route: String(row2[2] ?? ""),
      occurrences: num(row2[3])
    }));
    m.totalErrors = m.errors.reduce((a, e) => a + e.occurrences, 0);
    sources.posthog = true;
  } catch (e) {
    console.error(JSON.stringify({ source: "posthog", error: sanitizeError(e) }));
    sources.posthog = false;
  }
  try {
    const { count: newProfiles } = await supabase.from("app_14da0f1941_profiles").select("user_id", { count: "exact", head: true }).gte("created_at", start).lt("created_at", end);
    m.newUsers = newProfiles ?? 0;
    let confirmed = 0;
    let pending = 0;
    let page = 1;
    const perPage = 200;
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
  try {
    const { data: rev } = await supabase.from("app_marketplace_revenue_events").select("event_type, gross_amount_cents, currency, livemode").gte("occurred_at", start).lt("occurred_at", end).or("livemode.is.null,livemode.eq.true");
    const events = rev ?? [];
    m.paymentsCompleted = events.filter((e) => e.event_type === "SALE").length;
    m.paymentsFailed = events.filter((e) => e.event_type === "PAYMENT_FAILED").length;
    m.grossCents = events.filter((e) => e.event_type === "SALE").reduce((a, e) => a + (Number(e.gross_amount_cents) || 0), 0);
    m.currency = events.find((e) => e.currency)?.currency ?? "EUR";
    const { data: paidOrders } = await supabase.from("app_orders").select("id, user_id, product_key").eq("status", "paid").gte("paid_at", start).lt("paid_at", end);
    let notActivated = 0;
    for (const o of paidOrders ?? []) {
      const { count } = await supabase.from("app_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", o.user_id).in("status", ["active", "trialing"]);
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
async function claimRun(supabase, reportDate, correlationId, opts) {
  const logErr = (op, error) => console.error(JSON.stringify({
    correlationId,
    action: "claim_db_error",
    op,
    error: sanitizeError(error?.message ?? error)
  }));
  const { data: existing, error: selectError } = await supabase.from("app_daily_intelligence_runs").select("status, attempts, email_ok, updated_at").eq("report_date", reportDate).maybeSingle();
  if (selectError) {
    logErr("select", selectError);
    return { claimed: false, skipReason: "claim_db_error" };
  }
  const decision = claimDecision(existing ?? null, opts);
  switch (decision) {
    case "already_sent":
    case "already_delivered":
      return { claimed: false, skipReason: "already_sent" };
    case "nothing_to_recover":
      return { claimed: false, skipReason: "nothing_to_recover" };
    case "reject_in_progress":
      return { claimed: false, skipReason: "claim_in_progress" };
    case "reject_exhausted":
      return { claimed: false, skipReason: "recovery_exhausted" };
    case "insert_fresh": {
      const { error } = await supabase.from("app_daily_intelligence_runs").insert({
        report_date: reportDate,
        status: "GENERATING",
        attempts: 1,
        correlation_id: correlationId
      });
      if (error) {
        logErr("insert", error);
        return { claimed: false, skipReason: "claim_contended" };
      }
      return { claimed: true, skipReason: null };
    }
    case "reclaim":
    case "stale_reclaim": {
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      let q = supabase.from("app_daily_intelligence_runs").update({
        status: "GENERATING",
        attempts: (existing?.attempts ?? 0) + 1,
        correlation_id: correlationId,
        updated_at: nowIso
      }).eq("report_date", reportDate);
      if (decision === "reclaim") {
        q = q.in("status", ["FAILED", "PARTIAL"]).or("email_ok.is.null,email_ok.eq.false");
      } else {
        q = q.eq("status", "GENERATING").lt("updated_at", new Date(Date.now() - STALE_GENERATING_MS).toISOString());
      }
      const { data: updated, error } = await q.select();
      if (error) {
        logErr("update", error);
        return { claimed: false, skipReason: "claim_db_error" };
      }
      if (!updated || updated.length === 0) {
        return { claimed: false, skipReason: "claim_contended" };
      }
      return { claimed: true, skipReason: null };
    }
  }
}
async function finalizeRun(supabase, reportDate, patch) {
  await supabase.from("app_daily_intelligence_runs").update({ ...patch, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("report_date", reportDate);
}
function windowForReportDate(date) {
  const [y, mo, d] = date.split("-").map(Number);
  const anchor = brusselsWallToUtc(y, mo, d, 12, 0, 0);
  return getPreviousBrusselsDayWindow(new Date(anchor.getTime() + 24 * 3600 * 1e3));
}
async function generateAndSend(supabase, window, isTest, correlationId) {
  const sources = { posthog: false, supabase: false, stripe: false, email: false };
  let executionStatus = "SUCCESS";
  let sendError = null;
  const { metrics, routes } = await collectMetrics(supabase, window.startUtc, window.endUtc, sources);
  if (!sources.posthog && !sources.supabase && !sources.stripe) {
    return { ok: false, status: "FAILED", sources, sendError: "all_data_sources_unavailable" };
  }
  if (!sources.posthog || !sources.supabase || !sources.stripe) executionStatus = "PARTIAL";
  const recommendations = buildRecommendations(metrics);
  const generatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const recipient = Deno.env.get("DAILY_REPORT_RECIPIENT") || "support@pipingbox.com";
  const data = {
    window,
    generatedAt,
    metrics,
    recommendations,
    sources,
    routes,
    executionStatus,
    isTest,
    avgSessionNote: "No disponible (requiere instrumentaci\xF3n de duraci\xF3n de sesi\xF3n)"
  };
  const html = renderReportHtml(data);
  const text = renderReportText(data);
  const provider = createEmailProvider();
  if (!provider.isConfigured()) {
    return { ok: false, status: "FAILED", sources, sendError: "email_provider_not_configured" };
  }
  const sendLog = (e) => console.log(JSON.stringify({ correlationId, report_date: window.reportDate, ...e }));
  const sendResult = await sendWithRetry(
    () => withTimeout(
      provider.send({
        to: recipient,
        subject: reportSubject(window.reportDate, isTest),
        html,
        text,
        // PB-EDGE-RESEND-MIGRATION-001: display name del From por defecto.
        // Sin Reply-To: se conserva el comportamiento operativo historico.
        fromName: "PipingBox Notifications"
      }).then(() => void 0),
      SOURCE_TIMEOUT_MS,
      "email"
    ),
    SMTP_RETRY_POLICY,
    sendLog
  );
  if (!sendResult.sent) {
    console.error(JSON.stringify({
      correlationId,
      action: "email_failed",
      report_date: window.reportDate,
      attempts: sendResult.attempts,
      error_class: sendResult.lastErrorClass,
      error: sendResult.lastError
    }));
    return { ok: false, status: "FAILED", sources, sendError: sendResult.lastError ?? "email_send_failed" };
  }
  sources.email = true;
  const pii = scanForPii(`${html}
${text}`);
  const verification = {
    sections: 9,
    recommendations: recommendations.length,
    recommendation_priorities: recommendations.map((r) => r.priority),
    html_chars: html.length,
    text_chars: text.length,
    pii_scan: pii,
    pii_clean: pii.emails === 0 && pii.phones === 0 && pii.tokens === 0,
    subject: reportSubject(window.reportDate, isTest),
    recipient_domain: "pipingbox.com"
  };
  const status = executionStatus === "SUCCESS" ? isTest ? "SENT_TEST" : "SENT" : "PARTIAL";
  return { ok: true, status, sources, sendError, verification };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const correlationId = crypto.randomUUID();
  const log = (obj) => console.log(JSON.stringify({ correlationId, ...obj }));
  let body = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
  }
  const isTest = body?.test === true;
  const isPreflight = body?.preflight === true;
  const rawDate = typeof body?.report_date === "string" ? body.report_date : null;
  const forcedDate = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabase = createClient(supabaseUrl, serviceKey);
  let authMode = null;
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
  if (isPreflight) {
    const has = (n) => (Deno.env.get(n) || "").length > 0;
    const notifySmtp = has("NOTIFY_SMTP_HOST") && has("NOTIFY_SMTP_USER") && has("NOTIFY_SMTP_PASSWORD");
    const legacySmtp = has("SMTP_HOST") && has("SMTP_USER") && has("SMTP_PASSWORD");
    const config = {
      SUPABASE_URL: !!supabaseUrl,
      SUPABASE_SERVICE_ROLE_KEY: !!serviceKey,
      POSTHOG_PERSONAL_API_KEY: has("POSTHOG_PERSONAL_API_KEY"),
      SMTP_TRANSPORT: notifySmtp ? "resend_smtp" : legacySmtp ? "smtp_onecom" : false,
      SMTP_HOST: has("SMTP_HOST"),
      SMTP_USER: has("SMTP_USER"),
      SMTP_PASSWORD: has("SMTP_PASSWORD"),
      SMTP_PORT: has("SMTP_PORT") ? true : "587 (default)",
      SMTP_SECURE: has("SMTP_SECURE") ? true : "true (default)",
      SMTP_FROM: has("SMTP_FROM") ? true : "noreply@pipingbox.com (default)",
      NOTIFY_SMTP_HOST: has("NOTIFY_SMTP_HOST"),
      NOTIFY_SMTP_USER: has("NOTIFY_SMTP_USER"),
      NOTIFY_SMTP_PASSWORD: has("NOTIFY_SMTP_PASSWORD"),
      NOTIFY_SMTP_PORT: has("NOTIFY_SMTP_PORT") ? true : "465 (default)",
      NOTIFY_SMTP_SECURE: has("NOTIFY_SMTP_SECURE") ? true : "true (default)",
      NOTIFY_SMTP_FROM: has("NOTIFY_SMTP_FROM") ? true : "notifications@notify.pipingbox.com (default)",
      POSTHOG_PROJECT_ID: has("POSTHOG_PROJECT_ID") ? true : "271316 (default)",
      POSTHOG_HOST: has("POSTHOG_HOST") ? true : "https://eu.i.posthog.com (default)",
      DAILY_REPORT_RECIPIENT: has("DAILY_REPORT_RECIPIENT") ? true : "support@pipingbox.com (default)",
      DAILY_REPORT_ENABLED: Deno.env.get("DAILY_REPORT_ENABLED") === "true"
    };
    const missing = Object.entries(config).filter(([k, v]) => v === false && !k.startsWith("NOTIFY_SMTP_") && !k.startsWith("SMTP_")).map(([k]) => k);
    if (!notifySmtp && !legacySmtp) missing.push("SMTP_TRANSPORT");
    log({ action: "preflight", auth_mode: authMode, missing_required_secrets: missing });
    return json({ ok: true, action: "preflight", auth_mode: authMode, missing_required_secrets: missing, config });
  }
  const enabled = Deno.env.get("DAILY_REPORT_ENABLED") === "true";
  const isDailyTick = isBrusselsDailyTick(/* @__PURE__ */ new Date());
  const gate = evaluateProductionGate({ isTest, enabled, authMode, isDailyTick });
  if (gate.action === "skip") {
    log({ action: "skip", reason: gate.reason, auth_mode: authMode });
    return json({ ok: true, skipped: gate.reason, auth_mode: authMode, correlation_id: correlationId });
  }
  const recoveryMode = gate.action === "check_recovery";
  const window = forcedDate ? windowForReportDate(forcedDate) : getPreviousBrusselsDayWindow(/* @__PURE__ */ new Date());
  if (isTest) {
    try {
      const r = await generateAndSend(supabase, window, true, correlationId);
      log({ action: "test_report", report_date: window.reportDate, status: r.status, sources: r.sources });
      return json({
        ok: r.ok,
        status: r.status,
        report_date: window.reportDate,
        test: true,
        correlation_id: correlationId,
        sources: r.sources,
        error: r.sendError ?? void 0,
        verification: r.verification
      });
    } catch (e) {
      const err = sanitizeError(e);
      log({ action: "test_report_exception", error: err });
      return json({ ok: false, status: "FAILED", reason: err, test: true, correlation_id: correlationId });
    }
  }
  if (recoveryMode) {
    log({ action: "recovery_attempt", report_date: window.reportDate });
  }
  const claim = await claimRun(supabase, window.reportDate, correlationId, { recoveryMode });
  if (!claim.claimed) {
    log({ action: "skip", reason: claim.skipReason, report_date: window.reportDate, recovery: recoveryMode });
    return json({
      ok: true,
      skipped: claim.skipReason,
      report_date: window.reportDate,
      correlation_id: correlationId,
      recovery: recoveryMode
    });
  }
  try {
    const r = await generateAndSend(supabase, window, false, correlationId);
    const finalStatus = !r.sources.email ? "FAILED" : r.status;
    await finalizeRun(supabase, window.reportDate, {
      status: finalStatus,
      posthog_ok: r.sources.posthog,
      supabase_ok: r.sources.supabase,
      stripe_ok: r.sources.stripe,
      email_ok: r.sources.email,
      sent_at: r.sources.email ? (/* @__PURE__ */ new Date()).toISOString() : null,
      error_sanitized: r.sendError
    });
    log({ action: "report_done", report_date: window.reportDate, status: finalStatus, sources: r.sources });
    return json({
      ok: r.ok,
      status: finalStatus,
      report_date: window.reportDate,
      correlation_id: correlationId,
      sources: r.sources,
      error: r.sendError ?? void 0
    });
  } catch (e) {
    const err = sanitizeError(e);
    await finalizeRun(supabase, window.reportDate, { status: "FAILED", error_sanitized: err });
    console.error(JSON.stringify({ correlationId, action: "report_exception", error: err }));
    return json({ ok: false, status: "FAILED", error: err, correlation_id: correlationId });
  }
});
