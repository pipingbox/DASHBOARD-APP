// _shared/daily-report-core.ts
// PB-PDI-004 — núcleo puro y testeable del informe "PipingBox Daily Intelligence".
//
// Sin Deno.serve, sin red, sin Supabase/Stripe/PostHog reales: todas las
// dependencias se inyectan. Esto permite las 17 pruebas obligatorias sin
// levantar servicios.

export const BRUSSELS_TZ = "Europe/Brussels";

// ──────────────────────────────────────────────────────────────────────────
// Ventana del día anterior en Europe/Brussels (CET/CEST correcto)
// ──────────────────────────────────────────────────────────────────────────

export interface ReportWindow {
  /** YYYY-MM-DD del día analizado, en Europe/Brussels. */
  reportDate: string;
  /** ISO UTC inclusive. */
  startUtc: string;
  /** ISO UTC exclusive. */
  endUtc: string;
}

/** Offset (ms) de la zona Brussels en un instante UTC dado, vía Intl. */
function tzOffsetMs(utcDate: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(utcDate);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  // Hora local representada como si fuera UTC; la diferencia es el offset.
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") === 24 ? 0 : get("hour"), get("minute"), get("second"));
  return asUTC - utcDate.getTime();
}

/** Convierte un muro de reloj Brussels (YYYY-MM-DD HH:mm:ss) a Date UTC. */
export function brusselsWallToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number): Date {
  // Aproximación inicial: tratar el muro como UTC.
  let guess = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  // Corregir por el offset real en ese instante (dos pasadas por si cae en el
  // borde del cambio de horario).
  for (let i = 0; i < 3; i++) {
    const off = tzOffsetMs(guess, BRUSSELS_TZ);
    const corrected = new Date(Date.UTC(y, mo - 1, d, h, mi, s) - off);
    if (corrected.getTime() === guess.getTime()) break;
    guess = corrected;
  }
  return guess;
}

/** Componentes del muro de reloj Brussels en un instante. */
export function brusselsParts(utcDate: Date): { y: number; mo: number; d: number } {
  const dtf = new Intl.DateTimeFormat("en-CA", { timeZone: BRUSSELS_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  const [y, mo, d] = dtf.format(utcDate).split("-").map(Number);
  return { y, mo, d };
}

/**
 * Ventana canónica del día anterior completo en Europe/Brussels:
 * [ayer 00:00:00, hoy 00:00:00) convertida a UTC con CET/CEST correcto.
 * `now` se inyecta para testabilidad (cambios de horario).
 */
export function getPreviousBrusselsDayWindow(now: Date): ReportWindow {
  const { y, mo, d } = brusselsParts(now);
  // Medianoche Brussels de "hoy" (fin exclusivo) y de "ayer" (inicio inclusivo).
  const end = brusselsWallToUtc(y, mo, d, 0, 0, 0);
  const start = new Date(end.getTime());
  // Restar un día en el muro Brussels: moverse a ayer 00:00.
  const yesterday = new Date(Date.UTC(y, mo - 1, d - 1));
  const yp = brusselsParts(yesterday);
  const startWall = brusselsWallToUtc(yp.y, yp.mo, yp.d, 0, 0, 0);
  start.setTime(startWall.getTime());
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    reportDate: `${yp.y}-${pad(yp.mo)}-${pad(yp.d)}`,
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Consultas HogQL (todas filtran environment='production')
// ──────────────────────────────────────────────────────────────────────────

export function hogqlTraffic(): string {
  return `SELECT count() AS page_views, count(DISTINCT person_id) AS unique_persons, count(DISTINCT properties.$session_id) AS sessions FROM events WHERE event = 'page_viewed' AND properties.environment = 'production' AND timestamp >= parseDateTimeBestEffort('${'${start}'}') AND timestamp < parseDateTimeBestEffort('${'${end}'}')`;
}

export function hogqlRoutes(): string {
  return `SELECT properties.route AS route, count() AS views, count(DISTINCT person_id) AS unique_persons FROM events WHERE event = 'page_viewed' AND properties.environment = 'production' AND timestamp >= parseDateTimeBestEffort('${'${start}'}') AND timestamp < parseDateTimeBestEffort('${'${end}'}') GROUP BY route ORDER BY views DESC LIMIT 25`;
}

export function hogqlFunnelSignup(): string {
  return `SELECT countIf(event = 'signup_started') AS signup_started, countIf(event = 'auth_created') AS auth_created FROM events WHERE event IN ('signup_started','auth_created') AND properties.environment = 'production' AND timestamp >= parseDateTimeBestEffort('${'${start}'}') AND timestamp < parseDateTimeBestEffort('${'${end}'}')`;
}

export function hogqlOnboarding(): string {
  return `SELECT countIf(event = 'onboarding_started') AS started, countIf(event = 'onboarding_step_reached') AS step_events, countIf(event = 'onboarding_completed') AS completed FROM events WHERE event IN ('onboarding_started','onboarding_step_reached','onboarding_completed') AND properties.environment = 'production' AND timestamp >= parseDateTimeBestEffort('${'${start}'}') AND timestamp < parseDateTimeBestEffort('${'${end}'}')`;
}

export function hogqlOnboardingSteps(): string {
  return `SELECT toString(properties.step) AS step, count(DISTINCT person_id) AS users_reached FROM events WHERE event = 'onboarding_step_reached' AND properties.environment = 'production' AND timestamp >= parseDateTimeBestEffort('${'${start}'}') AND timestamp < parseDateTimeBestEffort('${'${end}'}') GROUP BY step ORDER BY step ASC`;
}

export function hogqlReferrals(): string {
  return `SELECT countIf(event = 'referral_link_opened') AS opened, countIf(event = 'referral_captured') AS captured FROM events WHERE event IN ('referral_link_opened','referral_captured') AND properties.environment = 'production' AND timestamp >= parseDateTimeBestEffort('${'${start}'}') AND timestamp < parseDateTimeBestEffort('${'${end}'}')`;
}

export function hogqlErrors(): string {
  return `SELECT properties.error_name AS error_name, properties.incident_code AS incident_code, properties.route AS route, count() AS occurrences, max(timestamp) AS last_seen FROM events WHERE event = 'app_error' AND properties.environment = 'production' AND timestamp >= parseDateTimeBestEffort('${'${start}'}') AND timestamp < parseDateTimeBestEffort('${'${end}'}') GROUP BY error_name, incident_code, route ORDER BY occurrences DESC LIMIT 50`;
}

export function hogqlGeoDevice(): string {
  return `SELECT countIf(1) AS total, any(properties.$geoip_country_code) AS country FROM events WHERE event = 'page_viewed' AND properties.environment = 'production' AND timestamp >= parseDateTimeBestEffort('${'${start}'}') AND timestamp < parseDateTimeBestEffort('${'${end}'}') GROUP BY properties.$geoip_country_code ORDER BY total DESC LIMIT 10`;
}

// ──────────────────────────────────────────────────────────────────────────
// Motor determinista de recomendaciones (sin LLM)
// ──────────────────────────────────────────────────────────────────────────

export type Priority = "P0" | "P1" | "P2";

export interface Recommendation {
  priority: Priority;
  title: string;
  evidence: string;
  impact: string;
  action: string;
  successCriteria: string;
  /** true si es una recomendación de observación/crecimiento (no una incidencia). */
  observational: boolean;
}

export interface DailyMetrics {
  // PostHog
  pageViews: number;
  uniquePersons: number;
  sessions: number;
  signupStarted: number;
  authCreated: number;
  onboardingStarted: number;
  onboardingCompleted: number;
  onboardingStepDropoffs: Array<{ step: string; usersReached: number }>;
  referralOpened: number;
  referralCaptured: number;
  errors: Array<{ errorName: string; incidentCode: string; route: string; occurrences: number }>;
  totalErrors: number;
  // Supabase
  newUsers: number;
  emailsConfirmed: number;
  emailsPending: number;
  // Stripe
  paymentsCompleted: number;
  paymentsFailed: number;
  grossCents: number;
  currency: string;
  checkoutNotActivated: number;
}

const PRIORITY_RANK: Record<Priority, number> = { P0: 0, P1: 1, P2: 2 };

/**
 * Genera exactamente 5 recomendaciones priorizadas, basadas solo en métricas
 * observadas. Si hay menos de 5 incidencias reales, completa con observaciones
 * claramente etiquetadas. Nunca inventa problemas.
 */
export function buildRecommendations(m: DailyMetrics): Recommendation[] {
  const recs: Recommendation[] = [];

  // P0: pago completado sin activación.
  if (m.checkoutNotActivated > 0) {
    recs.push({
      priority: "P0",
      title: "Pago completado sin activación de plan",
      evidence: `${m.checkoutNotActivated} checkout(s) completados sin activación canónica el día analizado.`,
      impact: "Clientes que pagaron sin acceso concedido: riesgo financiero y de confianza.",
      action: "Reconciliar checkout.session.completed contra app_subscriptions/app_orders y conceder acceso.",
      successCriteria: "0 checkouts completados sin activación en el próximo informe.",
      observational: false,
    });
  }

  // P0/P1: ausencia total de tráfico → dato, no mejora inventada.
  if (m.uniquePersons === 0 && m.pageViews === 0) {
    recs.push({
      priority: "P1",
      title: "Ausencia total de tráfico de producción",
      evidence: "0 personas únicas y 0 page views con environment='production' en el día.",
      impact: "O bien no hubo usuarios, o la telemetría dejó de ingerir.",
      action: "Verificar manualmente que la app responde y que PostHog ingiere; confirmar que no es un fallo de la capa.",
      successCriteria: "Confirmar si el cero es real (sin usuarios) o un fallo de ingesta.",
      observational: true,
    });
  }

  // P1: errores repetidos.
  if (m.totalErrors > 0) {
    const top = m.errors[0];
    const repeated = m.errors.filter((e) => e.occurrences >= 3);
    recs.push({
      priority: repeated.length > 0 ? "P1" : "P2",
      title: `Errores de aplicación (${m.totalErrors} en el día)`,
      evidence: top
        ? `Más frecuente: ${top.errorName} (${top.occurrences}x, ${top.incidentCode || "sin código"}, ruta ${top.route || "desconocida"}).`
        : `${m.totalErrors} app_error.`,
      impact: "Degrada la experiencia y puede bloquear journeys clave.",
      action: "Investigar la ruta y el código PB-ERR del error más recurrente.",
      successCriteria: "Reducir la recurrencia del error principal a 0 en próximos informes.",
      observational: false,
    });
  }

  // P1/P2: registros iniciados sin alta.
  if (m.signupStarted > m.authCreated) {
    const drop = m.signupStarted - m.authCreated;
    recs.push({
      priority: drop >= 3 ? "P1" : "P2",
      title: "Registros iniciados sin completar alta",
      evidence: `${m.signupStarted} signup_started frente a ${m.authCreated} auth_created (${drop} abandonos).`,
      impact: "Pérdida de altas en el primer paso del funnel.",
      action: "Revisar el flujo de Auth (errores, validaciones, confirmación) en el paso de alta.",
      successCriteria: "Conversión signup→auth_created en mejora sostenida.",
      observational: false,
    });
  }

  // P1/P2: altas sin confirmación de correo.
  if (m.emailsPending > 0) {
    recs.push({
      priority: m.emailsPending >= 3 ? "P1" : "P2",
      title: "Altas sin confirmación de correo",
      evidence: `${m.emailsPending} cuenta(s) creadas sin email confirmado al cierre del día.`,
      impact: "Usuarios que no pueden iniciar sesión; posible problema de entrega de correo.",
      action: "Revisar la entrega del correo de confirmación (SMTP, spam) y la UX de reenvío.",
      successCriteria: "Reducir cuentas pendientes de confirmación respecto a nuevas altas.",
      observational: false,
    });
  }

  // P2: abandono de onboarding por paso.
  if (m.onboardingStarted > m.onboardingCompleted && m.onboardingStepDropoffs.length > 0) {
    const steps = [...m.onboardingStepDropoffs].sort((a, b) => Number(a.step) - Number(b.step));
    let worst = steps[0];
    let worstDrop = -1;
    for (let i = 0; i < steps.length; i++) {
      const reached = steps[i].usersReached;
      const next = steps[i + 1]?.usersReached ?? (i === steps.length - 1 ? m.onboardingCompleted : reached);
      const drop = reached - next;
      if (drop > worstDrop) { worstDrop = drop; worst = steps[i]; }
    }
    recs.push({
      priority: "P2",
      title: "Abandono del onboarding",
      evidence: `${m.onboardingStarted} iniciados, ${m.onboardingCompleted} completados; mayor caída en el paso ${worst.step}.`,
      impact: "Perfiles que no llegan a MARKETPLACE_READY.",
      action: `Revisar la fricción del paso ${worst.step} del wizard.`,
      successCriteria: "Aumentar la tasa de finalización del onboarding.",
      observational: false,
    });
  }

  // P2: referido abierto sin captura.
  if (m.referralOpened > m.referralCaptured) {
    recs.push({
      priority: "P2",
      title: "Referidos abiertos sin captura",
      evidence: `${m.referralOpened} referral_link_opened frente a ${m.referralCaptured} referral_captured.`,
      impact: "Atribución de referidos incompleta.",
      action: "Revisar la persistencia/atribución del código referido tras la apertura.",
      successCriteria: "Aproximar referral_captured a referral_link_opened.",
      observational: false,
    });
  }

  // P2: pagos fallidos.
  if (m.paymentsFailed > 0) {
    recs.push({
      priority: "P2",
      title: "Pagos fallidos",
      evidence: `${m.paymentsFailed} pago(s) fallidos en el día.`,
      impact: "Ingresos no capturados.",
      action: "Revisar causas de fallo de pago y la reintentación de checkout.",
      successCriteria: "Reducir pagos fallidos respecto a completados.",
      observational: false,
    });
  }

  // Ordenar por prioridad y tomar incidencias primero.
  recs.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);

  // Completar hasta 5 con observaciones de crecimiento (etiquetadas), sin inventar.
  const observations: Recommendation[] = [
    {
      priority: "P2",
      title: "Observación: actividad de referidos",
      evidence: `${m.referralOpened} aperturas y ${m.referralCaptured} capturas de referido.`,
      impact: "Canal de crecimiento orgánico.",
      action: "Mantener la atribución; valorar incentivar el compartido.",
      successCriteria: "Crecimiento sostenido de capturas semana a semana.",
      observational: true,
    },
    {
      priority: "P2",
      title: "Observación: engagement de tráfico",
      evidence: `${m.pageViews} page views de ${m.uniquePersons} personas en ${m.sessions} sesiones.`,
      impact: "Señal de interés del producto.",
      action: "Revisar las rutas más vistas para priorizar contenido.",
      successCriteria: "Aumentar vistas por sesión.",
      observational: true,
    },
    {
      priority: "P2",
      title: "Observación: finalización de onboarding",
      evidence: `${m.onboardingCompleted} onboarding completados.`,
      impact: "Perfiles listos para el marketplace.",
      action: "Analizar qué impulsa a completar y replicarlo.",
      successCriteria: "Crecer onboarding_completed.",
      observational: true,
    },
    {
      priority: "P2",
      title: "Observación: actividad de pagos",
      evidence: `${m.paymentsCompleted} pagos completados (${(m.grossCents / 100).toFixed(2)} ${m.currency}).`,
      impact: "Ingresos.",
      action: "Mantener el flujo de checkout estable.",
      successCriteria: "Crecer pagos completados.",
      observational: true,
    },
    {
      priority: "P2",
      title: "Observación: salud de registros",
      evidence: `${m.newUsers} nuevos usuarios, ${m.emailsConfirmed} correos confirmados.`,
      impact: "Base de usuarios.",
      action: "Mantener la entregabilidad del correo de confirmación.",
      successCriteria: "Tasa de confirmación alta.",
      observational: true,
    },
  ];

  const result = recs.slice(0, 5);
  for (const obs of observations) {
    if (result.length >= 5) break;
    if (!result.some((r) => r.title === obs.title)) result.push(obs);
  }
  return result.slice(0, 5);
}

// ──────────────────────────────────────────────────────────────────────────
// Sanitización / PII
// ──────────────────────────────────────────────────────────────────────────

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/g;
const TOKENISH_RE = /(phc_|phx_|sk_live|sk_test|whsec_|Bearer\s+)[A-Za-z0-9_-]+/g;

/** Limpia PII/secretos de un mensaje destinado a logs o al correo. */
export function sanitizeText(input: string): string {
  return String(input ?? "")
    .replace(EMAIL_RE, "[redacted-email]")
    .replace(TOKENISH_RE, "[redacted-secret]")
    .replace(PHONE_RE, "[redacted-phone]");
}

/** Sanitiza un error desconocido a un mensaje seguro (sin trazas ni secretos). */
export function sanitizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "unknown_error");
  return sanitizeText(msg).slice(0, 300);
}

// ──────────────────────────────────────────────────────────────────────────
// Render del correo (HTML + texto plano)
// ──────────────────────────────────────────────────────────────────────────

export interface SourceStatus {
  posthog: boolean;
  supabase: boolean;
  stripe: boolean;
  email: boolean;
}

export interface ReportData {
  window: ReportWindow;
  generatedAt: string;
  metrics: DailyMetrics;
  recommendations: Recommendation[];
  sources: SourceStatus;
  routes: Array<{ route: string; views: number; uniquePersons: number }>;
  executionStatus: "SUCCESS" | "PARTIAL" | "FAILED";
  isTest: boolean;
  avgSessionNote: string; // "No disponible" + documentación, o valor fiable
}

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:6px 0;color:#71717a;width:220px;">${esc(label)}</td><td style="padding:6px 0;color:#fafafa;font-weight:600;">${esc(value)}</td></tr>`;
}

export function renderReportHtml(d: ReportData): string {
  const m = d.metrics;
  const srcBadge = (ok: boolean) => (ok ? "✅ OK" : "⚠️ NO DISPONIBLE");
  const recRows = d.recommendations
    .map(
      (r) => `<div style="margin:0 0 12px;padding:12px;background:#18181b;border:1px solid #27272a;border-left:3px solid ${r.priority === "P0" ? "#dc2626" : r.priority === "P1" ? "#f59e0b" : "#3b82f6"};">
        <p style="margin:0;font-size:13px;color:#fafafa;font-weight:600;">[${r.priority}] ${esc(r.title)}${r.observational ? ' <span style="color:#71717a;font-weight:400;">(observación)</span>' : ""}</p>
        <p style="margin:6px 0 0;font-size:12px;color:#a1a1aa;"><strong>Evidencia:</strong> ${esc(r.evidence)}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#a1a1aa;"><strong>Impacto:</strong> ${esc(r.impact)}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#a1a1aa;"><strong>Acción:</strong> ${esc(r.action)}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#a1a1aa;"><strong>Criterio de éxito:</strong> ${esc(r.successCriteria)}</p>
      </div>`
    )
    .join("");
  const routeRows = d.routes
    .slice(0, 10)
    .map((r) => `<tr><td style="padding:4px 0;color:#d4d4d8;">${esc(r.route)}</td><td style="padding:4px 0;color:#fafafa;text-align:right;">${r.views}</td><td style="padding:4px 0;color:#a1a1aa;text-align:right;">${r.uniquePersons}</td></tr>`)
    .join("");
  const errRows = m.errors
    .slice(0, 10)
    .map((e) => `<tr><td style="padding:4px 0;color:#d4d4d8;">${esc(e.errorName)}</td><td style="padding:4px 0;color:#a1a1aa;">${esc(e.incidentCode || "—")}</td><td style="padding:4px 0;color:#a1a1aa;">${esc(e.route || "—")}</td><td style="padding:4px 0;color:#fafafa;text-align:right;">${e.occurrences}</td></tr>`)
    .join("");

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#0a0a0a;color:#e4e4e7;border:1px solid #27272a;">
  <div style="border-bottom:1px solid #27272a;padding-bottom:16px;margin-bottom:24px;">
    <h1 style="margin:0;font-size:20px;color:#f59e0b;">${d.isTest ? "[TEST] " : ""}PipingBox Daily Intelligence</h1>
    <p style="margin:4px 0 0;font-size:12px;color:#71717a;">Periodo: ${esc(d.window.reportDate)} (Europe/Brussels) · Generado: ${esc(d.generatedAt)} · Estado: ${d.executionStatus}</p>
  </div>

  <h2 style="font-size:15px;color:#fafafa;border-bottom:1px solid #27272a;padding-bottom:6px;">1. Resumen ejecutivo</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    ${row("Personas únicas", String(m.uniquePersons))}
    ${row("Sesiones", String(m.sessions))}
    ${row("Page views", String(m.pageViews))}
    ${row("Nuevos usuarios", String(m.newUsers))}
    ${row("Pagos completados", `${m.paymentsCompleted} (${(m.grossCents / 100).toFixed(2)} ${m.currency})`)}
    ${row("Errores", String(m.totalErrors))}
  </table>

  <h2 style="font-size:15px;color:#fafafa;border-bottom:1px solid #27272a;padding-bottom:6px;margin-top:24px;">2. Tráfico y comportamiento</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    ${row("Duración media de sesión", d.avgSessionNote)}
  </table>
  <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;">
    <tr><th style="text-align:left;color:#71717a;font-weight:600;padding-bottom:4px;">Ruta</th><th style="text-align:right;color:#71717a;font-weight:600;">Vistas</th><th style="text-align:right;color:#71717a;font-weight:600;">Únicos</th></tr>
    ${routeRows || '<tr><td colspan="3" style="color:#71717a;padding:8px 0;">Sin datos.</td></tr>'}
  </table>

  <h2 style="font-size:15px;color:#fafafa;border-bottom:1px solid #27272a;padding-bottom:6px;margin-top:24px;">3. Registros y confirmaciones</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    ${row("signup_started", String(m.signupStarted))}
    ${row("auth_created", String(m.authCreated))}
    ${row("Nuevos usuarios (backend)", String(m.newUsers))}
    ${row("Correos confirmados", String(m.emailsConfirmed))}
    ${row("Pendientes de confirmación", String(m.emailsPending))}
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
    ${row("Checkout sin activación", String(m.checkoutNotActivated))}
  </table>

  <h2 style="font-size:15px;color:#fafafa;border-bottom:1px solid #27272a;padding-bottom:6px;margin-top:24px;">7. Errores e incidencias</h2>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <tr><th style="text-align:left;color:#71717a;font-weight:600;">Error</th><th style="text-align:left;color:#71717a;font-weight:600;">Código</th><th style="text-align:left;color:#71717a;font-weight:600;">Ruta</th><th style="text-align:right;color:#71717a;font-weight:600;">Ocurrencias</th></tr>
    ${errRows || '<tr><td colspan="4" style="color:#71717a;padding:8px 0;">Sin errores.</td></tr>'}
  </table>

  <h2 style="font-size:15px;color:#fafafa;border-bottom:1px solid #27272a;padding-bottom:6px;margin-top:24px;">8. Cinco acciones recomendadas</h2>
  ${recRows}

  <h2 style="font-size:15px;color:#fafafa;border-bottom:1px solid #27272a;padding-bottom:6px;margin-top:24px;">9. Estado de las fuentes</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    ${row("PostHog", srcBadge(d.sources.posthog))}
    ${row("Supabase", srcBadge(d.sources.supabase))}
    ${row("Stripe", srcBadge(d.sources.stripe))}
    ${row("Proveedor de correo", srcBadge(d.sources.email))}
  </table>

  <div style="margin-top:24px;padding-top:16px;border-top:1px solid #27272a;font-size:11px;color:#52525b;">
    PipingBox Daily Intelligence · Informe operativo interno · Europe/Brussels${d.isTest ? " · CORREO DE PRUEBA" : ""}
  </div>
</div>`;
}

export function renderReportText(d: ReportData): string {
  const m = d.metrics;
  const lines: string[] = [];
  lines.push(`${d.isTest ? "[TEST] " : ""}PipingBox Daily Intelligence`);
  lines.push(`Periodo: ${d.window.reportDate} (Europe/Brussels) | Generado: ${d.generatedAt} | Estado: ${d.executionStatus}`);
  lines.push("");
  lines.push("1. RESUMEN EJECUTIVO");
  lines.push(`  Personas únicas: ${m.uniquePersons} | Sesiones: ${m.sessions} | Page views: ${m.pageViews}`);
  lines.push(`  Nuevos usuarios: ${m.newUsers} | Pagos: ${m.paymentsCompleted} (${(m.grossCents / 100).toFixed(2)} ${m.currency}) | Errores: ${m.totalErrors}`);
  lines.push("");
  lines.push("2. TRÁFICO");
  lines.push(`  Duración media de sesión: ${d.avgSessionNote}`);
  for (const r of d.routes.slice(0, 10)) lines.push(`  ${r.route} — ${r.views} vistas, ${r.uniquePersons} únicos`);
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
  lines.push(`  completados: ${m.paymentsCompleted} | bruto: ${(m.grossCents / 100).toFixed(2)} ${m.currency} | fallidos: ${m.paymentsFailed} | sin activación: ${m.checkoutNotActivated}`);
  lines.push("");
  lines.push("7. ERRORES");
  for (const e of m.errors.slice(0, 10)) lines.push(`  ${e.errorName} (${e.incidentCode || "—"}, ${e.route || "—"}) x${e.occurrences}`);
  if (m.errors.length === 0) lines.push("  Sin errores.");
  lines.push("");
  lines.push("8. CINCO ACCIONES RECOMENDADAS");
  d.recommendations.forEach((r, i) => {
    lines.push(`  ${i + 1}. [${r.priority}] ${r.title}${r.observational ? " (observación)" : ""}`);
    lines.push(`     Evidencia: ${r.evidence}`);
    lines.push(`     Acción: ${r.action}`);
  });
  lines.push("");
  lines.push("9. ESTADO DE LAS FUENTES");
  lines.push(`  PostHog: ${d.sources.posthog ? "OK" : "NO DISPONIBLE"} | Supabase: ${d.sources.supabase ? "OK" : "NO DISPONIBLE"} | Stripe: ${d.sources.stripe ? "OK" : "NO DISPONIBLE"} | Correo: ${d.sources.email ? "OK" : "NO DISPONIBLE"}`);
  return lines.join("\n");
}

export function reportSubject(reportDate: string, isTest: boolean): string {
  return `${isTest ? "[TEST] " : ""}PipingBox Daily Intelligence — ${reportDate}`;
}
