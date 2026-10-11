// Pruebas de seguridad y regresión del emisor administrativo de candidaturas.
//
// Cubren `index.maintainable.ts`, no el bundle v13 desplegado (archivado como
// snapshot de solo lectura en PIPINGBOX-BRAIN@4e19d0ed).
//
// Fijan: (a) el comportamiento verificado de v13 que debe preservarse, y
// (b) las tres correcciones aprobadas — reclamo atómico anti-replay, manejo
// explícito de resultados ambiguos del proveedor y lista blanca de
// destinatarios.

import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  ALLOWED_ALERT_DOMAINS,
  buildAdminHtml,
  buildSubject,
  CANONICAL_JOBS_MAILBOX,
  CLAIM_LEASE_SECONDS,
  claimNotification,
  clamp,
  classifySendError,
  classifySendInfo,
  describeVcaStatus,
  escapeHtml,
  finalizeNotification,
  isAllowedAlertRecipient,
  type JobRow,
  MAX_NOTIFICATION_ATTEMPTS,
  type ProfileRow,
  REPLAY_WINDOW_MS,
  resolveAlertRecipients,
  resolveSmtp,
} from "./index.maintainable.ts";

const NOW = Date.parse("2026-10-10T12:29:56.389Z");
const APP_ID = "11111111-1111-1111-1111-111111111111";

function job(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: "33333333-3333-3333-3333-333333333333",
    title: "Pipe Welder",
    company: "Acme Industrial",
    country: "Netherlands",
    location: "Rotterdam",
    ...overrides,
  };
}

function profile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    full_name: "Jan de Vries",
    title: "Welder",
    years_experience: 12,
    availability_status: "available",
    profile_completion: 85,
    ...overrides,
  };
}

/** Cliente mínimo que solo implementa `rpc`, lo único que usan los helpers. */
function fakeSupabase(
  impl: (fn: string, args: Record<string, unknown>) => { data: unknown; error: unknown },
  calls?: Array<{ fn: string; args: Record<string, unknown> }>,
): SupabaseClient {
  return {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls?.push({ fn, args });
      return Promise.resolve(impl(fn, args));
    },
  } as unknown as SupabaseClient;
}

// ── Invariantes de v13 que deben preservarse ────────────────────────────────

Deno.test("buzón administrativo canónico", () => {
  assertEquals(CANONICAL_JOBS_MAILBOX, "jobs@pipingbox.com");
});

Deno.test("ventana de frescura de 15 minutos, igual que v13", () => {
  assertEquals(REPLAY_WINDOW_MS, 15 * 60 * 1000);
});

Deno.test("resolveSmtp: NOTIFY_* tiene prioridad (idéntico a v13)", () => {
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
});

Deno.test("resolveSmtp: sin SMTP no se considera configurado", () => {
  const r = resolveSmtp(() => undefined);
  assertEquals(r.configured, false);
  assertEquals(r.host, null);
});

Deno.test("describeVcaStatus reproduce las tres variantes de v13", () => {
  assertEquals(describeVcaStatus({ expiry_date: "2027-01-15" }, NOW), "Valid until 2027-01-15");
  assertEquals(describeVcaStatus({ expiry_date: "2024-01-15" }, NOW), "Expired 2024-01-15");
  assertEquals(describeVcaStatus({ expiry_date: null }, NOW), "On record (no expiry date)");
  assertEquals(describeVcaStatus(null, NOW), null);
});

// ── Escape e inyección ──────────────────────────────────────────────────────

Deno.test("escapeHtml neutraliza marcado inyectado", () => {
  assertEquals(
    escapeHtml(`<img src=x onerror="alert('x')">`),
    "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;",
  );
});

Deno.test("escapeHtml tolera no-strings (v13 lanzaría TypeError)", () => {
  assertEquals(escapeHtml(null), "");
  assertEquals(escapeHtml(undefined), "");
  assertEquals(escapeHtml(42), "42");
});

Deno.test("clamp recorta y escapa", () => {
  assertEquals(clamp("abcdef", 3), "abc...");
  assertEquals(clamp("<b>", 100), "&lt;b&gt;");
});

Deno.test("asunto en inglés, con y sin nombre de candidato", () => {
  assertEquals(
    buildSubject(job(), "Jan de Vries"),
    "New application \u2014 Jan de Vries \u2014 Pipe Welder",
  );
  assertEquals(buildSubject(job(), null), "New application \u2014 Pipe Welder");
});

Deno.test("cuerpo escapa inyección y no filtra tokens", () => {
  const html = buildAdminHtml({
    job: job({ title: `<script>steal()</script>`, company: "Acme & Co" }),
    profile: profile({ full_name: `<b>Jan</b> de Vries` }),
    candidateEmail: "jan@example.com",
    userId: "22222222-2222-2222-2222-222222222222",
    vcaStatus: "Valid until 2027-01-15",
    applicationStatus: "applied",
  });
  assert(!html.includes("<script>"), "no debe interpolar script en crudo");
  assertStringIncludes(html, "&lt;script&gt;steal()&lt;/script&gt;");
  assertStringIncludes(html, "Acme &amp; Co");
  assertStringIncludes(html, "&lt;b&gt;Jan&lt;/b&gt; de Vries");
  assert(!/token|verify\?|access_token/i.test(html), "no debe contener tokens");
});

Deno.test("cuerpo mantiene los datos operativos de v13", () => {
  const html = buildAdminHtml({
    job: job(),
    profile: profile(),
    candidateEmail: "jan@example.com",
    userId: "22222222-2222-2222-2222-222222222222",
    vcaStatus: "Valid until 2027-01-15",
    applicationStatus: "applied",
  });
  for (const expected of [
    "Pipe Welder",
    "Acme Industrial",
    "Netherlands",
    "Jan de Vries",
    "jan@example.com",
    "12 years",
    "available",
    "Valid until 2027-01-15",
    "85%",
    "applied",
  ]) {
    assertStringIncludes(html, expected);
  }
  // Excepción i18n permanente: aviso interno en inglés.
  assertStringIncludes(html, "New Job Application");
  assertStringIncludes(html, "PIPINGBOX Jobs Pipeline");
  // Enlace a la ficha, con el id codificado.
  assertStringIncludes(html, "https://pipingbox.com/candidate/22222222-2222-2222-2222-222222222222");
});

Deno.test("cuerpo usa el naranja corporativo con texto oscuro en el botón (WCAG AA)", () => {
  const html = buildAdminHtml({
    job: job(),
    profile: profile(),
    candidateEmail: "jan@example.com",
    userId: "22222222-2222-2222-2222-222222222222",
    vcaStatus: null,
    applicationStatus: null,
  });
  assertStringIncludes(html, "#E8611A");
  assertStringIncludes(html, "background: #E8611A; color: #18181B");
  assert(!html.includes("#f59e0b"), "no debe quedar el ámbar de v13");
});

Deno.test("perfil ausente no rompe el aviso", () => {
  const html = buildAdminHtml({
    job: job(),
    profile: null,
    candidateEmail: "jan@example.com",
    userId: "22222222-2222-2222-2222-222222222222",
    vcaStatus: null,
    applicationStatus: null,
  });
  assertStringIncludes(html, "(profile incomplete)");
  assertStringIncludes(html, "Not on record");
  assertStringIncludes(html, "applied");
});

// ── Lista blanca de destinatarios (corrección de §2.4) ──────────────────────

Deno.test("solo se permiten dominios de PIPINGBOX", () => {
  assertEquals(ALLOWED_ALERT_DOMAINS, ["pipingbox.com", "notify.pipingbox.com"]);
  assertEquals(isAllowedAlertRecipient("jobs@pipingbox.com"), true);
  assertEquals(isAllowedAlertRecipient("ops@notify.pipingbox.com"), true);
  assertEquals(isAllowedAlertRecipient("  Jobs@PipingBox.com  "), true);
  assertEquals(isAllowedAlertRecipient("attacker@evil.com"), false);
  // Sufijo malicioso: no basta con que acabe parecido.
  assertEquals(isAllowedAlertRecipient("attacker@evilpipingbox.com"), false);
  assertEquals(isAllowedAlertRecipient("attacker@pipingbox.com.evil.com"), false);
  // Lista separada por comas: rechazada entera.
  assertEquals(isAllowedAlertRecipient("jobs@pipingbox.com,attacker@evil.com"), false);
  assertEquals(isAllowedAlertRecipient("jobs@pipingbox.com;attacker@evil.com"), false);
  assertEquals(isAllowedAlertRecipient("Jobs <jobs@pipingbox.com>"), false);
  assertEquals(isAllowedAlertRecipient(""), false);
  assertEquals(isAllowedAlertRecipient(undefined), false);
});

Deno.test("sin overrides se usa el buzón canónico y no hay BCC", () => {
  const r = resolveAlertRecipients(() => undefined);
  assertEquals(r.to, CANONICAL_JOBS_MAILBOX);
  assertEquals(r.bcc, undefined);
  assertEquals(r.overrides, []);
  assertEquals(r.rejected, []);
});

Deno.test("override permitido se aplica y se registra", () => {
  const env: Record<string, string> = {
    JOB_ALERT_TO: "recruitment@pipingbox.com",
    JOB_ALERT_BCC: "ops@notify.pipingbox.com",
  };
  const r = resolveAlertRecipients((n) => env[n]);
  assertEquals(r.to, "recruitment@pipingbox.com");
  assertEquals(r.bcc, "ops@notify.pipingbox.com");
  assertEquals(r.overrides, ["JOB_ALERT_TO", "JOB_ALERT_BCC"]);
});

Deno.test("override a dominio ajeno se descarta sin romper el aviso", () => {
  const env: Record<string, string> = {
    JOB_ALERT_TO: "attacker@evil.com",
    JOB_ALERT_BCC: "exfil@evil.com",
  };
  const r = resolveAlertRecipients((n) => env[n]);
  // Datos personales del candidato nunca salen del dominio.
  assertEquals(r.to, CANONICAL_JOBS_MAILBOX);
  assertEquals(r.bcc, undefined);
  assertEquals(r.rejected, ["JOB_ALERT_TO", "JOB_ALERT_BCC"]);
  assertEquals(r.overrides, []);
});

// ── Resultado del proveedor ─────────────────────────────────────────────────

Deno.test("fallo antes de transmitir es reintentable", () => {
  for (const code of ["EDNS", "ECONNECTION", "EAUTH", "EENVELOPE", "EMESSAGE"]) {
    assertEquals(classifySendError(Object.assign(new Error("x"), { code })), "failed", code);
  }
});

Deno.test("timeout o socket cortado es ambiguo y no se reintenta", () => {
  for (const code of ["ETIMEDOUT", "ESOCKET", "ESTREAM"]) {
    assertEquals(classifySendError(Object.assign(new Error("x"), { code })), "ambiguous", code);
  }
});

Deno.test("error desconocido se trata como ambiguo, no como fallo", () => {
  assertEquals(classifySendError(new Error("boom")), "ambiguous");
  assertEquals(classifySendError(null), "ambiguous");
  assertEquals(classifySendError(Object.assign(new Error("x"), { code: 42 })), "ambiguous");
});

Deno.test("classifySendInfo distingue aceptado de rechazado", () => {
  assertEquals(classifySendInfo({ rejected: [] }), "sent");
  assertEquals(classifySendInfo({}), "sent");
  assertEquals(classifySendInfo(null), "sent");
  assertEquals(classifySendInfo({ rejected: ["jobs@pipingbox.com"] }), "failed");
});

// ── Reclamo atómico (corrección de replay) ──────────────────────────────────

Deno.test("reclamo concedido", async () => {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const r = await claimNotification(
    fakeSupabase(
      () => ({ data: [{ claimed: true, state: "claimed", attempts: 1, reason: "claimed" }], error: null }),
      calls,
    ),
    APP_ID,
  );
  assertEquals(r.claimed, true);
  assertEquals(r.attempts, 1);
  assertEquals(calls[0].fn, "app_14da0f1941_claim_job_application_notification");
  assertEquals(calls[0].args.p_application_id, APP_ID);
  assertEquals(calls[0].args.p_max_attempts, MAX_NOTIFICATION_ATTEMPTS);
  assertEquals(calls[0].args.p_lease_seconds, CLAIM_LEASE_SECONDS);
});

Deno.test("segunda invocación de la misma candidatura no reclama (anti-duplicado)", async () => {
  const r = await claimNotification(
    fakeSupabase(() => ({
      data: [{ claimed: false, state: "sent", attempts: 1, reason: "already_sent" }],
      error: null,
    })),
    APP_ID,
  );
  assertEquals(r.claimed, false);
  assertEquals(r.reason, "already_sent");
});

Deno.test("invocación concurrente con lease vivo no reclama", async () => {
  const r = await claimNotification(
    fakeSupabase(() => ({
      data: [{ claimed: false, state: "claimed", attempts: 1, reason: "in_progress_elsewhere" }],
      error: null,
    })),
    APP_ID,
  );
  assertEquals(r.claimed, false);
  assertEquals(r.reason, "in_progress_elsewhere");
});

Deno.test("estado ambiguo exige revisión manual, no reintento", async () => {
  const r = await claimNotification(
    fakeSupabase(() => ({
      data: [{ claimed: false, state: "ambiguous", attempts: 2, reason: "ambiguous_requires_manual_review" }],
      error: null,
    })),
    APP_ID,
  );
  assertEquals(r.claimed, false);
  assertEquals(r.reason, "ambiguous_requires_manual_review");
});

Deno.test("intentos agotados no reclama", async () => {
  const r = await claimNotification(
    fakeSupabase(() => ({
      data: [{ claimed: false, state: "failed", attempts: 3, reason: "max_attempts_exhausted" }],
      error: null,
    })),
    APP_ID,
  );
  assertEquals(r.claimed, false);
  assertEquals(r.attempts, 3);
});

Deno.test("migración sin aplicar: falla cerrado, nunca envía", async () => {
  // Si la RPC no existe (sql/030 no aplicado) NO se puede volver al
  // comportamiento duplicable de v13: se deniega el envío.
  const r = await claimNotification(
    fakeSupabase(() => ({ data: null, error: { code: "PGRST202", message: "not found" } })),
    APP_ID,
  );
  assertEquals(r.claimed, false);
  assertEquals(r.reason, "claim_unavailable:PGRST202");
});

Deno.test("respuesta vacía de la RPC falla cerrado", async () => {
  const r = await claimNotification(fakeSupabase(() => ({ data: [], error: null })), APP_ID);
  assertEquals(r.claimed, false);
  assertEquals(r.reason, "claim_empty_response");
});

Deno.test("finalize envía estado, messageId y error al cierre", async () => {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  await finalizeNotification(
    fakeSupabase(() => ({ data: [{ finalized: true }], error: null }), calls),
    APP_ID,
    "sent",
    "<abc@notify.pipingbox.com>",
    null,
  );
  assertEquals(calls[0].fn, "app_14da0f1941_finalize_job_application_notification");
  assertEquals(calls[0].args.p_state, "sent");
  assertEquals(calls[0].args.p_message_id, "<abc@notify.pipingbox.com>");
});

Deno.test("fallo al cerrar el reclamo no propaga excepción", async () => {
  // El correo ya salió o no: lanzar aquí no arregla nada y rompería la
  // respuesta al cliente.
  await finalizeNotification(
    fakeSupabase(() => ({ data: null, error: { code: "57014" } })),
    APP_ID,
    "ambiguous",
    null,
    "timeout",
  );
});
