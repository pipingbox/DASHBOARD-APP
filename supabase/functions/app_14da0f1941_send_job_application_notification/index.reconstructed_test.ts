// Pruebas de regresión del emisor administrativo de candidaturas (Jobs).
//
// Cubren la RECONSTRUCCIÓN (`index.reconstructed.ts`), no el bundle v13
// desplegado. Fijan el contrato observado en producción para que cualquier
// cambio futuro sea deliberado:
//   · destinatario fijo jobs@pipingbox.com
//   · prioridad NOTIFY_SMTP_* sobre SMTP_*, sin configuraciones a medias
//   · ventana de frescura de 15 min (anti-repetición disponible)
//   · pertenencia de la candidatura al llamante
//   · escape de HTML en todo valor controlado por el usuario
//   · asunto y cuerpo en inglés (excepción documentada a PB-I18N-EMAIL-001)
//   · ningún token, enlace de autenticación ni correo personal en el cuerpo

import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ADMIN_RECIPIENT,
  APPLICATION_MAX_AGE_MS,
  type ApplicationRow,
  buildAdminHtml,
  buildSubject,
  callerFromAuthHeader,
  clamp,
  escapeHtml,
  evaluateGates,
  resolveSmtp,
} from "./index.reconstructed.ts";

const NOW = Date.parse("2026-10-10T12:29:56.389Z");

function row(overrides: Partial<ApplicationRow> = {}): ApplicationRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    created_at: "2026-10-10T12:29:54.139Z",
    user_id: "22222222-2222-2222-2222-222222222222",
    job_title: "Pipe Welder",
    company_name: "Acme Industrial",
    location: "Rotterdam",
    contract_type: "full_time",
    status: "applied",
    job_id: "33333333-3333-3333-3333-333333333333",
    ...overrides,
  };
}

Deno.test("destinatario administrativo fijo", () => {
  assertEquals(ADMIN_RECIPIENT, "jobs@pipingbox.com");
});

Deno.test("ventana de frescura de 15 minutos", () => {
  assertEquals(APPLICATION_MAX_AGE_MS, 15 * 60 * 1000);
});

Deno.test("escapeHtml neutraliza marcado inyectado", () => {
  assertEquals(
    escapeHtml(`<img src=x onerror="alert('x')">`),
    "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;",
  );
  assertEquals(escapeHtml(null), "");
  assertEquals(escapeHtml(undefined), "");
});

Deno.test("clamp recorta y escapa", () => {
  assertEquals(clamp("abcdef", 3), "abc...");
  assertEquals(clamp("<b>", 100), "&lt;b&gt;");
});

Deno.test("asunto en inglés con puesto y empresa", () => {
  assertEquals(
    buildSubject({ job_title: "Pipe Welder", company_name: "Acme Industrial" }),
    "New Job Application - Pipe Welder @ Acme Industrial",
  );
});

Deno.test("cuerpo escapa inyección y no filtra datos sensibles", () => {
  const html = buildAdminHtml(
    row({ job_title: `<script>steal()</script>`, company_name: "Acme & Co" }),
    `<b>Jan</b> de Vries`,
  );
  assert(!html.includes("<script>"), "no debe interpolar script en crudo");
  assertStringIncludes(html, "&lt;script&gt;steal()&lt;/script&gt;");
  assertStringIncludes(html, "Acme &amp; Co");
  assertStringIncludes(html, "&lt;b&gt;Jan&lt;/b&gt; de Vries");
  // Sin enlaces de autenticación ni direcciones personales.
  assert(!/token|verify\?|access_token/i.test(html), "no debe contener tokens ni enlaces de verificación");
  assert(!/@(gmail|yahoo|outlook)\./i.test(html), "no debe contener correos personales");
  // Excepción i18n: aviso interno en inglés.
  assertStringIncludes(html, "New Job Application");
  assertStringIncludes(html, "PIPINGBOX Recruitment Pipeline");
});

Deno.test("gate: candidatura inexistente → 404", () => {
  const r = evaluateGates(null, "22222222-2222-2222-2222-222222222222", NOW);
  assert(!r.ok);
  if (!r.ok) {
    assertEquals(r.status, 404);
    assertEquals(r.logged, "no_matching_application");
    assertEquals(r.body.emailsSent, false);
  }
});

Deno.test("gate: candidatura de otro usuario → 403", () => {
  const r = evaluateGates(row(), "99999999-9999-9999-9999-999999999999", NOW);
  assert(!r.ok);
  if (!r.ok) {
    assertEquals(r.status, 403);
    assertEquals(r.logged, "application_owner_mismatch");
  }
});

Deno.test("gate: candidatura antigua → 409 (anti-repetición)", () => {
  const r = evaluateGates(row(), "22222222-2222-2222-2222-222222222222", NOW + APPLICATION_MAX_AGE_MS + 1);
  assert(!r.ok);
  if (!r.ok) {
    assertEquals(r.status, 409);
    assertEquals(r.logged, "application_too_old");
  }
});

Deno.test("gate: candidatura propia y reciente → pasa", () => {
  assertEquals(evaluateGates(row(), "22222222-2222-2222-2222-222222222222", NOW).ok, true);
});

Deno.test("gate: sin JWT legible no se inventa propietario", () => {
  // verify_jwt=true garantiza un JWT válido; si el `sub` no se pudo leer, la
  // comprobación de pertenencia no debe bloquear el aviso operativo.
  assertEquals(evaluateGates(row(), null, NOW).ok, true);
});

Deno.test("resolveSmtp: NOTIFY_* tiene prioridad", () => {
  const env: Record<string, string> = {
    NOTIFY_SMTP_HOST: "smtp.resend.com",
    NOTIFY_SMTP_USER: "resend",
    NOTIFY_SMTP_PASSWORD: "x",
    SMTP_HOST: "send.one.com",
    SMTP_USER: "legacy",
    SMTP_PASSWORD: "y",
  };
  const r = resolveSmtp((n) => env[n]);
  assertEquals(r.host, "smtp.resend.com");
  assertEquals(r.port, 465);
  assertEquals(r.secure, true);
  assertEquals(r.from, "notifications@notify.pipingbox.com");
  assertEquals(r.provider, "resend_smtp");
  assertEquals(r.configured, true);
});

Deno.test("resolveSmtp: configuración NOTIFY_* parcial nunca se usa a medias", () => {
  const env: Record<string, string> = {
    NOTIFY_SMTP_HOST: "smtp.resend.com",
    SMTP_HOST: "send.one.com",
    SMTP_USER: "legacy",
    SMTP_PASSWORD: "y",
  };
  const r = resolveSmtp((n) => env[n]);
  assertEquals(r.host, "send.one.com");
  assertEquals(r.port, 587);
  assertEquals(r.from, "noreply@pipingbox.com");
  assertEquals(r.provider, "smtp_onecom");
  assertEquals(r.configured, true);
});

Deno.test("resolveSmtp: sin SMTP no se considera configurado", () => {
  const r = resolveSmtp(() => undefined);
  assertEquals(r.configured, false);
  assertEquals(r.host, null);
});

Deno.test("callerFromAuthHeader extrae el sub sin verificar firma", () => {
  const payload = btoa(JSON.stringify({ sub: "22222222-2222-2222-2222-222222222222" }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  assertEquals(
    callerFromAuthHeader(`Bearer header.${payload}.sig`),
    "22222222-2222-2222-2222-222222222222",
  );
  assertEquals(callerFromAuthHeader(null), null);
  assertEquals(callerFromAuthHeader("Bearer not-a-jwt"), null);
  assertEquals(callerFromAuthHeader("Bearer a.b.c"), null);
});
