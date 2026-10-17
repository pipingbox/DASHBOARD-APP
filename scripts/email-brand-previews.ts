import { EMAIL_LOGO_URL } from "../supabase/functions/_shared/email-header.ts";
import { renderConfirmationRoHtml } from "../supabase/functions/_shared/confirmation-email-template.ts";
import { renderRecoveryEmailHtml } from "../supabase/functions/_shared/recovery-email-template.ts";
import { renderReportHtml, type DailyMetrics, type ReportData } from "../supabase/functions/_shared/daily-report-core.ts";
import { renderMarketplaceReconciliationEmail } from "../supabase/functions/_shared/email-i18n/reconciliation.ts";
import { renderActionEmail, renderApplicationPendingProfileEmail, renderMarketplaceReadyEmail, renderNoticeEmail } from "../supabase/functions/_shared/email-i18n/mod.ts";
import { buildAdminHtml } from "../supabase/functions/app_14da0f1941_send_job_application_notification/index.maintainable.ts";

const out = Deno.args[0] ?? "./email-brand-previews";
await Deno.mkdir(out, { recursive: true });
const logo = new URL("../app/frontend/public/assets/logos/logo-horizontal-email.png", import.meta.url);
await Deno.copyFile(logo, `${out}/logo-horizontal-email.png`);

const metrics: DailyMetrics = {
  pageViews: 0, uniquePersons: 0, sessions: 0, signupStarted: 0, authCreated: 0,
  onboardingStarted: 0, onboardingCompleted: 0, onboardingStepDropoffs: [],
  referralOpened: 0, referralCaptured: 0, errors: [], totalErrors: 0,
  newUsers: 0, emailsConfirmed: 0, emailsPending: 0, paymentsCompleted: 0,
  paymentsFailed: 0, grossCents: 0, currency: "EUR", checkoutNotActivated: 0,
};
const report: ReportData = {
  window: { reportDate: "2026-10-16", startUtc: "", endUtc: "" },
  generatedAt: "2026-10-17T00:05:00Z", metrics, recommendations: [],
  sources: { posthog: false, supabase: false, stripe: false, email: false },
  routes: [], executionStatus: "SUCCESS", isTest: true, avgSessionNote: "No disponible",
};
const url = "https://pipingbox.com/profile";
const examples: Record<string, string> = {
  "auth-confirmation": renderActionEmail({ template: "confirmation", lang: "es", actionUrl: url }).html,
  "auth-recovery": renderActionEmail({ template: "recovery", lang: "es", actionUrl: url }).html,
  "auth-support-ro": renderConfirmationRoHtml("Utilizator"),
  "support-recovery": renderRecoveryEmailHtml("Profesional"),
  "job-match": renderActionEmail({ template: "job_match", lang: "es", actionUrl: url, vars: { jobTitle: "Soldador", company: "Trident Industrial", score: 85 } }).html,
  "notice": renderNoticeEmail({ template: "password_changed_notification", lang: "es" }).html,
  "email-1": renderApplicationPendingProfileEmail({ lang: "es", actionUrl: url, pendingItems: ["cv"] }).html,
  "email-2": renderMarketplaceReadyEmail({ lang: "es", actionUrl: "https://pipingbox.com/jobs", jobTitles: ["Soldador"] }).html,
  "reconciliation": renderMarketplaceReconciliationEmail({ lang: "es", actionUrl: url, missing: ["cv"] }).html,
  "admin-job-maintainable": buildAdminHtml({
    job: { id: "33333333-3333-3333-3333-333333333333", title: "Soldador", company: "Trident Industrial", country: "NL", location: "Rotterdam" },
    profile: null, candidateEmail: "candidate@example.test", userId: "22222222-2222-2222-2222-222222222222",
    vcaStatus: null, applicationStatus: "applied",
  }),
  "daily-report": renderReportHtml(report),
};
const links: string[] = [];
for (const [name, html] of Object.entries(examples)) {
  await Deno.writeTextFile(`${out}/${name}.html`, html.replaceAll(EMAIL_LOGO_URL, "./logo-horizontal-email.png"));
  links.push(`<li><a href="./${name}.html">${name}</a></li>`);
}
await Deno.writeTextFile(`${out}/index.html`, `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Previews de marca · PIPINGBOX</title><style>body{font:16px/1.6 system-ui;background:#111;color:#eee;margin:32px}a{color:#ff914d}</style></head><body><h1>Previews de marca · PIPINGBOX</h1><p>Ejemplos sintéticos sin envíos. Logo local sólo para previsualización; el correo real usa ${EMAIL_LOGO_URL} tras publicar el asset. El emisor administrativo de candidaturas sigue sin entrypoint desplegable.</p><ul>${links.join("")}</ul></body></html>`);
console.log(`previews de marca: ${links.length} ejemplos en ${out}`);
