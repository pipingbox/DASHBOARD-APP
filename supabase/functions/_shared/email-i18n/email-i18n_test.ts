// PB-I18N-EMAIL-001 — Tests de la capa de correos localizados.
// Ejecutar: deno test --allow-read supabase/functions/_shared/email-i18n/
import { assert, assertEquals, assertStringIncludes, assertThrows } from "jsr:@std/assert@1";
import {
  ACTION_TEMPLATES,
  DEFAULT_EMAIL_LANGUAGE,
  LOCALES,
  NOTICE_TEMPLATES,
  SUPPORTED_EMAIL_LANGUAGES,
  escapeHtml,
  getLocale,
  normalizeEmailLanguage,
  renderActionEmail,
  renderNoticeEmail,
  resolveRecipientLanguage,
  safeUrl,
  type ActionTemplateId,
  type NoticeTemplateId,
} from "./mod.ts";

const FRONTEND_LANGUAGES_JSON = new URL("../../../../app/frontend/src/i18n/languages.json", import.meta.url);

function flatten(obj: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (typeof v === "string") out[key] = v;
      else Object.assign(out, flatten(v, key));
    }
  }
  return out;
}

function placeholders(s: string): string[] {
  return [...s.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map((m) => m[1]).sort();
}

// ─────────────────────────────────────────────────────────────────────────────
// Paridad de idiomas y claves
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("los 11 códigos coinciden con app/frontend/src/i18n/languages.json", async () => {
  const raw = JSON.parse(await Deno.readTextFile(FRONTEND_LANGUAGES_JSON)) as Array<{ code: string }> | Record<string, unknown>;
  const codes = Array.isArray(raw)
    ? raw.map((l) => l.code)
    : Array.isArray((raw as { languages?: Array<{ code: string }> }).languages)
    ? (raw as { languages: Array<{ code: string }> }).languages.map((l) => l.code)
    : Object.keys(raw);
  assertEquals([...codes].sort(), [...SUPPORTED_EMAIL_LANGUAGES].sort());
  assertEquals(Object.keys(LOCALES).sort(), [...SUPPORTED_EMAIL_LANGUAGES].sort());
});

Deno.test("todos los locales tienen exactamente las mismas claves que en", () => {
  const ref = Object.keys(flatten(LOCALES.en)).sort();
  for (const code of SUPPORTED_EMAIL_LANGUAGES) {
    assertEquals(Object.keys(flatten(LOCALES[code])).sort(), ref, `claves distintas en ${code}`);
    assertEquals(LOCALES[code].code, code);
  }
});

Deno.test("ningún locale tiene cadenas vacías ni idénticas a 'en' salvo marca/soporte", () => {
  const en = flatten(LOCALES.en);
  for (const code of SUPPORTED_EMAIL_LANGUAGES) {
    if (code === "en") continue;
    const loc = flatten(LOCALES[code]);
    let identical = 0;
    for (const [k, v] of Object.entries(loc)) {
      assert(v.trim().length > 0, `${code}.${k} vacío`);
      if (v === en[k] && k !== "code") identical++;
    }
    // Tolerancia mínima (p. ej. nombres propios); un locale sin traducir fallaría.
    assert(identical <= 3, `${code}: ${identical} cadenas sin traducir`);
  }
});

Deno.test("los marcadores {x} de cada cadena coinciden en los 11 idiomas", () => {
  const en = flatten(LOCALES.en);
  for (const code of SUPPORTED_EMAIL_LANGUAGES) {
    const loc = flatten(LOCALES[code]);
    for (const k of Object.keys(en)) {
      assertEquals(placeholders(loc[k]), placeholders(en[k]), `marcadores distintos en ${code}.${k}`);
    }
  }
});

Deno.test("todos los asuntos empiezan por 'PIPINGBOX ·'", () => {
  for (const code of SUPPORTED_EMAIL_LANGUAGES) {
    for (const [name, t] of Object.entries(LOCALES[code].templates)) {
      assert((t as { subject: string }).subject.startsWith("PIPINGBOX · "), `${code}.${name}.subject`);
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Normalización y resolución del idioma
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("normalizeEmailLanguage", () => {
  assertEquals(normalizeEmailLanguage("ro-RO"), "ro");
  assertEquals(normalizeEmailLanguage(" PT "), "pt");
  assertEquals(normalizeEmailLanguage("uk_UA"), "uk");
  assertEquals(normalizeEmailLanguage("zz"), null);
  assertEquals(normalizeEmailLanguage(42), null);
  assertEquals(normalizeEmailLanguage(undefined), null);
  assertEquals(getLocale("xx").code, DEFAULT_EMAIL_LANGUAGE);
});

Deno.test("resolveRecipientLanguage: prioridad user_metadata > profile > request > en", () => {
  assertEquals(resolveRecipientLanguage({ userMetadata: { lang: "bg" }, profileLanguage: "es", requested: "fr" }), { lang: "bg", source: "user_metadata" });
  assertEquals(resolveRecipientLanguage({ userMetadata: { lang: "zz" }, profileLanguage: "es" }), { lang: "es", source: "profile" });
  assertEquals(resolveRecipientLanguage({ requested: "pl" }), { lang: "pl", source: "request" });
  assertEquals(resolveRecipientLanguage({}), { lang: "en", source: "fallback" });
  // Sin inferencia por otros campos (país, correo…)
  assertEquals(resolveRecipientLanguage({ userMetadata: { country: "RO", email: "x@y.ro" } }), { lang: "en", source: "fallback" });
});

// ─────────────────────────────────────────────────────────────────────────────
// Renderizado 11 idiomas × todas las plantillas
// ─────────────────────────────────────────────────────────────────────────────

const ACTION_VARS = {
  email: "worker@example.test",
  newEmail: "new@example.test",
  score: 87,
  jobTitle: "TIG Welder 6G",
  company: "ACME Industrial",
  workerType: "Pipe Fitter",
  country: "Netherlands",
  certName: "ASME IX",
  expiresOn: "2026-12-01",
};
const NOTICE_VARS = {
  email: "worker@example.test",
  oldEmail: "old@example.test",
  phone: "+31600000000",
  oldPhone: "+31611111111",
  provider: "Google",
  factorType: "TOTP",
  name: "Florin",
};
const URL_OK = "https://auth.pipingbox.com/auth/v1/verify?token=abc&type=signup&redirect_to=https%3A%2F%2Fpipingbox.com%2Fauth%2Fcallback%3Flng%3Des";

Deno.test("renderActionEmail: 11 idiomas × plantillas de acción sin marcadores pendientes", () => {
  for (const lang of SUPPORTED_EMAIL_LANGUAGES) {
    for (const template of ACTION_TEMPLATES as readonly ActionTemplateId[]) {
      const r = renderActionEmail({ template, lang, actionUrl: URL_OK, vars: ACTION_VARS });
      assertEquals(r.lang, lang);
      assertEquals(r.missing, [], `${lang}.${template} missing=${r.missing}`);
      assert(!/\{[a-zA-Z]+\}/.test(r.html), `${lang}.${template}: marcador sin sustituir en HTML`);
      assert(!/\{[a-zA-Z]+\}/.test(r.text), `${lang}.${template}: marcador sin sustituir en texto`);
      assertStringIncludes(r.html, `<html lang="${lang}"`);
      assertStringIncludes(r.html, '<meta charset="utf-8">');
      assertStringIncludes(r.html, "#E8611A");
      assertStringIncludes(r.html, URL_OK.replace(/&/g, "&amp;"));
      assertStringIncludes(r.text, URL_OK);
      assertStringIncludes(r.html, "support@pipingbox.com");
      assert(r.subject.length > 10 && r.subject.length < 120, `${lang}.${template}: asunto ${r.subject.length} chars`);
    }
  }
});

Deno.test("renderNoticeEmail: 11 idiomas × plantillas informativas", () => {
  for (const lang of SUPPORTED_EMAIL_LANGUAGES) {
    for (const template of NOTICE_TEMPLATES as readonly NoticeTemplateId[]) {
      const r = renderNoticeEmail({ template, lang, vars: NOTICE_VARS, code: template === "reauthentication" ? "123456" : undefined });
      assertEquals(r.missing, [], `${lang}.${template} missing=${r.missing}`);
      assert(!/\{[a-zA-Z]+\}/.test(r.html), `${lang}.${template}: marcador sin sustituir`);
      if (template === "reauthentication") assertStringIncludes(r.html, "123456");
      if (template.endsWith("_notification")) assertStringIncludes(r.html, "support@pipingbox.com");
    }
  }
});

Deno.test("alfabetos no latinos (uk, bg) se preservan en asunto y cuerpo", () => {
  const uk = renderActionEmail({ template: "confirmation", lang: "uk", actionUrl: URL_OK, vars: ACTION_VARS });
  assert(/[\u0400-\u04FF]/.test(uk.subject), "asunto uk sin cirílico");
  assert(/[\u0400-\u04FF]/.test(uk.html), "html uk sin cirílico");
  const bg = renderActionEmail({ template: "recovery", lang: "bg", actionUrl: URL_OK, vars: ACTION_VARS });
  assert(/[\u0400-\u04FF]/.test(bg.subject));
  assertStringIncludes(bg.html, '<html lang="bg"');
});

Deno.test("fallback a inglés para idioma desconocido o nulo", () => {
  const a = renderActionEmail({ template: "confirmation", lang: "xx", actionUrl: URL_OK, vars: ACTION_VARS });
  assertEquals(a.lang, "en");
  assertEquals(a.subject, LOCALES.en.templates.confirmation.subject);
  const b = renderActionEmail({ template: "confirmation", lang: null, actionUrl: URL_OK, vars: ACTION_VARS });
  assertEquals(b.lang, "en");
});

Deno.test("job_match sin empresa usa body_no_company", () => {
  const r = renderActionEmail({ template: "job_match", lang: "es", actionUrl: URL_OK, vars: { ...ACTION_VARS, company: "" } });
  assertEquals(r.missing, []);
  assert(!r.html.includes(" en ."), "cuerpo con empresa vacía");
  assertStringIncludes(r.html, "TIG Welder 6G");
});

// ─────────────────────────────────────────────────────────────────────────────
// Seguridad
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("escape HTML de variables (inyección)", () => {
  const evil = `<script>alert('x')</script><img src=x onerror="alert(1)">`;
  const r = renderActionEmail({ template: "confirmation", lang: "en", actionUrl: URL_OK, vars: { email: evil } });
  assert(!r.html.includes("<script>"), "script sin escapar");
  assert(!r.html.includes("<img"), "etiqueta img sin escapar");
  assert(!r.html.includes('onerror="'), "atributo con comillas sin escapar");
  assertStringIncludes(r.html, "&lt;script&gt;");
  assertStringIncludes(r.html, "onerror=&quot;alert(1)&quot;");
  // text/plain conserva el literal (no es HTML)
  assertStringIncludes(r.text, evil);
  assertEquals(escapeHtml(`"&'<>`), "&quot;&amp;&#39;&lt;&gt;");
});

Deno.test("safeUrl rechaza esquemas peligrosos y URLs relativas", () => {
  assertThrows(() => safeUrl("javascript:alert(1)"));
  assertThrows(() => safeUrl("data:text/html,x"));
  assertThrows(() => safeUrl("/relative"));
  assertThrows(() => safeUrl(""));
  assertEquals(safeUrl("https://pipingbox.com/x?a=1&b=2"), "https://pipingbox.com/x?a=1&b=2");
  assertThrows(() => renderActionEmail({ template: "recovery", lang: "en", actionUrl: "javascript:1", vars: ACTION_VARS }));
});

Deno.test("aislamiento entre destinatarios: el idioma es del destinatario, no del actor", () => {
  // Simula dos destinatarios distintos para la misma acción.
  const a = resolveRecipientLanguage({ userMetadata: { lang: "ro" } });
  const b = resolveRecipientLanguage({ userMetadata: null, profileLanguage: null });
  const ra = renderActionEmail({ template: "job_match", lang: a.lang, actionUrl: URL_OK, vars: ACTION_VARS });
  const rb = renderActionEmail({ template: "job_match", lang: b.lang, actionUrl: URL_OK, vars: ACTION_VARS });
  assertEquals(ra.lang, "ro");
  assertEquals(rb.lang, "en");
  assert(ra.subject !== rb.subject);
});

Deno.test("text/plain no contiene etiquetas HTML", () => {
  for (const lang of SUPPORTED_EMAIL_LANGUAGES) {
    const r = renderActionEmail({ template: "recovery", lang, actionUrl: URL_OK, vars: ACTION_VARS });
    assert(!/<[a-z!/][^>]*>/i.test(r.text), `${lang}: HTML en texto plano`);
  }
});
