import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { EMAIL_LOGO_URL, renderEmailHeader } from "./email-header.ts";
import { renderConfirmationRoHtml, renderConfirmationRoText } from "./confirmation-email-template.ts";
import { renderRecoveryEmailHtml, renderRecoveryEmailText } from "./recovery-email-template.ts";
import { renderReportHtml, type ReportData } from "./daily-report-core.ts";
import { renderMarketplaceReconciliationEmail } from "./email-i18n/reconciliation.ts";
import {
  ACTION_TEMPLATES,
  NOTICE_TEMPLATES,
  SUPPORTED_EMAIL_LANGUAGES,
  renderActionEmail,
  renderApplicationPendingProfileEmail,
  renderMarketplaceReadyEmail,
  renderNoticeEmail,
  renderWelcomeEmail,
} from "./email-i18n/mod.ts";

export function assertOfficialEmailLogo(html: string): void {
  const images = [...html.matchAll(/<img\b[^>]*>/gi)].map(([tag]) => tag);
  assertEquals(images.length, 1, "exactamente una imagen en la cabecera");
  assertEquals(images[0], renderEmailHeader().match(/<img\b[^>]*>/i)?.[0]);
  assertStringIncludes(images[0], `src="${EMAIL_LOGO_URL}"`);
  assertStringIncludes(images[0], 'alt="PIPINGBOX"');
  assertStringIncludes(images[0], 'max-width:100%');
  assertStringIncludes(images[0], 'height:auto');
  assert(!images[0].includes("?"), "logo sin query de seguimiento");
  assert(!/\son[a-z]+\s*=/i.test(html), "sin manejadores de eventos");
  assert(!/<script\b|<iframe\b/i.test(html), "sin scripts ni iframes");
}

Deno.test("el asset email es PNG RGBA optimizado del original", async () => {
  const file = new URL("../../../app/frontend/public/assets/logos/logo-horizontal-email.png", import.meta.url);
  const bytes = await Deno.readFile(file);
  assertEquals([...bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assertEquals(view.getUint32(16), 720);
  assertEquals(view.getUint32(20), 265);
  assert(bytes.byteLength < 100_000, "optimizado por debajo de 100 KB");
  assertEquals(EMAIL_LOGO_URL, "https://pipingbox.com/assets/logos/logo-horizontal-email.png");
});

Deno.test("el logo oficial aparece una sola vez en todas las familias i18n y los 11 idiomas", () => {
  assertEquals(SUPPORTED_EMAIL_LANGUAGES.length, 11);
  for (const lang of SUPPORTED_EMAIL_LANGUAGES) {
    for (const template of ACTION_TEMPLATES) {
      const { html, text } = renderActionEmail({ template, lang, actionUrl: "https://pipingbox.com/jobs", vars: { name: "Eva", company: "Trident", jobTitle: "Welder", score: 80 } });
      assertOfficialEmailLogo(html);
      assert(text.length > 0 && !text.includes("<img"));
    }
    for (const template of NOTICE_TEMPLATES) {
      const { html, text } = renderNoticeEmail({ template, lang, vars: { name: "Eva" }, code: "123456" });
      assertOfficialEmailLogo(html);
      assert(text.length > 0 && !text.includes("<img"));
    }
    for (const variant of ["worker", "company"] as const) {
      const { html, text } = renderWelcomeEmail({ variant, lang, appBaseUrl: "https://pipingbox.com" });
      assertOfficialEmailLogo(html);
      assertStringIncludes(text, "PIPINGBOX");
    }
    assertOfficialEmailLogo(renderMarketplaceReconciliationEmail({ lang, actionUrl: "https://pipingbox.com/profile", missing: ["cv"] }).html);
    assertOfficialEmailLogo(renderApplicationPendingProfileEmail({ lang, actionUrl: "https://pipingbox.com/profile", pendingItems: ["cv"] }).html);
    assertOfficialEmailLogo(renderMarketplaceReadyEmail({ lang, actionUrl: "https://pipingbox.com/jobs", jobTitles: ["Welder"] }).html);
  }
});

Deno.test("correos de soporte mantienen copy y texto plano con logo nuevo", () => {
  assertOfficialEmailLogo(renderConfirmationRoHtml("Test"));
  assertOfficialEmailLogo(renderRecoveryEmailHtml("Test"));
  assertStringIncludes(renderConfirmationRoText("Test"), "PipingBox");
  assertStringIncludes(renderRecoveryEmailText("Test"), "PipingBox");
});

Deno.test("informe operativo mantiene una única cabecera de marca", () => {
  const report = {
    window: { reportDate: "2026-10-16" }, generatedAt: "2026-10-17", isTest: true,
    executionStatus: "SUCCESS", avgSessionNote: "No disponible", routes: [], recommendations: [],
    sources: { posthog: false, supabase: false, stripe: false, email: false },
    metrics: { errors: [], currency: "EUR", grossCents: 0 },
  } as unknown as ReportData;
  assertOfficialEmailLogo(renderReportHtml(report));
});
