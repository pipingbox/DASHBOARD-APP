// _shared/application-activation_test.ts
// PB-JOBS-MARKETPLACE-READY-ACTIVATION-001 — matriz de pruebas obligatorias.
//
// Cubre la lógica compartida de los dos emails del flujo (EMAIL 1 perfil
// incompleto; EMAIL 2 Marketplace Ready) sin tocar ningún proyecto Supabase:
// el cliente se simula con un builder de consultas encadenable.
//
// Grupos (mapeo con la especificación):
//   1. Usuario Marketplace Ready aplica → sin email de perfil incompleto.
//   2. Usuario NO ready aplica → email exactamente una vez, idioma correcto.
//   3. Dos ofertas → dos emails, sin duplicados.
//   4. false→true → un solo email de validación con contexto múltiple.
//   5. Update con ready→true ya existente → sin outbox → sin reenvío.
//   6. Retry técnico → claim impide duplicar emails.
//   7. Idiomas: 11 soportados, subject/body/CTA; fallback inglés.
//   8. Seguridad: propiedad, estado canónico, no falsificación.
//   9. Regresión: nombres de RPC service-role, sin sent_to_client.

import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { EmailMessage, EmailProvider, EmailSendResult } from "./email-provider.ts";
import { drainMarketplaceReconciliationEmails } from "./marketplace-reconciliation-email.ts";
import {
  computePendingProfileItems,
  drainMarketplaceReadyActivations,
  sendApplicationPendingProfileEmail,
  JOB_APPLICATIONS_TABLE,
  PROFILES_TABLE,
  MARKETPLACE_READY_ACTIVATIONS_TABLE,
} from "./application-activation.ts";

// ─── Fakes ───────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

interface FakeConfig {
  applications: Row[];
  profiles: Row[];
  activations: Row[];
  reconcileEmails?: Row[];
  /** auth.users por id: { email, user_metadata }. */
  authUsers: Record<
    string,
    { email?: string | null; user_metadata?: Record<string, unknown> } | undefined
  >;
  /** Conteos head: experiences/certifications/documents por user_id. */
  counts?: Record<string, { experiences: number; certifications: number; documents: number }>;
  /** Implementación de rpc: (fn, args) => { data, error }. */
  rpc: (fn: string, args: Record<string, unknown>) => { data: unknown; error: unknown };
}

interface RecordedCall {
  fn: string;
  args: Record<string, unknown>;
}

function fakeSupabase(cfg: FakeConfig, calls?: RecordedCall[]): SupabaseClient {
  const applyIn = (rows: Row[], col: string, vals: unknown[]) =>
    rows.filter((r) => (vals as unknown[]).includes(r[col]));

  const chain = (rows: Row[]) => {
    const filters: Array<[string, unknown[]]> = [];
    const built: Record<string, unknown> = {
      select: () => built,
      in: (col: string, vals: unknown[]) => {
        filters.push([col, vals]);
        return built;
      },
      eq: (col: string, val: unknown) => {
        filters.push([col, [val]]);
        return built;
      },
      order: () => built,
      limit: () => built,
      maybeSingle: async () => {
        let out = rows;
        for (const [c, vals] of filters) out = applyIn(out, c, vals);
        return { data: out[0] ?? null, error: null };
      },
      single: async () => {
        let out = rows;
        for (const [c, vals] of filters) out = applyIn(out, c, vals);
        return { data: out[0] ?? null, error: null };
      },
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        let out = rows;
        for (const [c, vals] of filters) out = applyIn(out, c, vals);
        return Promise.resolve({ data: out, error: null, count: out.length }).then(resolve, reject);
      },
    };
    return built;
  };

  const tableRows: Record<string, Row[]> = {
    [JOB_APPLICATIONS_TABLE]: cfg.applications,
    [PROFILES_TABLE]: cfg.profiles,
    [MARKETPLACE_READY_ACTIVATIONS_TABLE]: cfg.activations,
    app_14da0f1941_marketplace_reconcile_emails: cfg.reconcileEmails ?? [],
    app_worker_experiences: Object.entries(cfg.counts ?? {}).flatMap(([uid, c]) =>
      Array.from({ length: c.experiences }, () => ({ user_id: uid }))),
    app_worker_certifications: Object.entries(cfg.counts ?? {}).flatMap(([uid, c]) =>
      Array.from({ length: c.certifications }, () => ({ user_id: uid }))),
    app_worker_documents: Object.entries(cfg.counts ?? {}).flatMap(([uid, c]) =>
      Array.from({ length: c.documents }, () => ({ user_id: uid }))),
  };

  return {
    from: (table: string) => chain(tableRows[table] ?? []),
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: cfg.authUsers[id] ?? null },
          error: null,
        }),
      },
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls?.push({ fn, args });
      const r = cfg.rpc(fn, args);
      // PostgREST devuelve ARRAY para funciones RETURNS TABLE (claim/finalize/
      // marc). Envolvemos aquí para que los tests reflejen el runtime real y
      // detecten regresiones de normalización en el módulo.
      if (
        r.data && typeof r.data === "object" && !Array.isArray(r.data) &&
        /_(claim|finalize|marc)_/.test(`_${fn}`)
      ) {
        return Promise.resolve({ ...r, data: [r.data] });
      }
      return Promise.resolve(r);
    },
  } as unknown as SupabaseClient;
}

class RecordingProvider implements EmailProvider {
  sent: EmailMessage[] = [];
  constructor(private fail = false) {}
  isConfigured() {
    return true;
  }
  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (this.fail) throw new Error("smtp_connection_refused");
    this.sent.push(message);
    return { messageId: `fake-${this.sent.length}`, provider: "fake", accepted: 1, rejected: 0 };
  }
}

// ─── Datos base ──────────────────────────────────────────────────────────────

const UID = "11111111-1111-1111-1111-111111111111";
const OTHER_UID = "22222222-2222-2222-2222-222222222222";
const APP_ID = "33333333-3333-3333-3333-333333333333";
const APP2_ID = "44444444-4444-4444-4444-444444444444";
const ACT_ID = "55555555-5555-5555-5555-555555555555";

function baseApplication(overrides: Row = {}): Row {
  return {
    id: APP_ID,
    user_id: UID,
    job_title: "Pipe Welder",
    company_name: "BASF",
    status: "pending_profile_validation",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function baseProfile(overrides: Row = {}): Row {
  return {
    user_id: UID,
    marketplace_ready: false,
    preferred_language: null,
    full_name: "Jan de Vries",
    title: "Welder",
    company: null,
    location: "Rotterdam",
    years_experience: 12,
    skills: ["TIG"],
    bio: "Experienced welder with 12 years in industrial construction.",
    avatar_url: "https://example.com/a.png",
    cv_storage_bucket: "cvs",
    cv_storage_path: "jan.pdf",
    cv_file_url: null,
    cv_url: null,
    ...overrides,
  };
}

/** rpc por defecto: claim OK + finalize OK. */
function defaultRpcCalls(state: Record<string, { state?: string; reason?: string; missing?: string[]; phonePresent?: boolean }> = {}) {
  return (fn: string, args: Record<string, unknown>) => {
    if (fn === "pb_marketplace_phone_present") {
      return { data: state[`${fn}:${args.p_user_id}`]?.phonePresent ?? true, error: null };
    }
    if (fn === "pb_marketplace_missing_requirements") {
      return { data: state[`${fn}:${args.p_user_id}`]?.missing ?? ["certificate", "availability"], error: null };
    }
    if (fn === "app_14da0f1941_claim_application_profile_pending_email") {
      const s = state[`${fn}:${args.p_application_id}`];
      if (s?.state) {
        return { data: { claimed: false, state: s.state, attempts: 1, reason: s.reason ?? "not_claimable", claim_id: null, delivery_phase: null }, error: null };
      }
      return { data: { claimed: true, state: "claimed", attempts: 1, reason: "claimed", claim_id: "c-1", delivery_phase: "pre_send" }, error: null };
    }
    if (fn === "app_14da0f1941_claim_marketplace_ready_activation") {
      const s = state[`${fn}:${args.p_activation_id}`];
      if (s?.state) {
        return { data: { claimed: false, state: s.state, attempts: 1, reason: s.reason ?? "not_claimable", claim_id: null, delivery_phase: null }, error: null };
      }
      return { data: { claimed: true, state: "claimed", attempts: 1, reason: "claimed", claim_id: "c-2", delivery_phase: "pre_send" }, error: null };
    }
    if (fn.startsWith("app_14da0f1941_marc_")) {
      return { data: { marked: true, delivery_phase: args.p_phase, reason: "marked" }, error: null };
    }
    if (fn.startsWith("app_14da0f1941_finalize_")) {
      return { data: { finalized: true, state: args.p_outcome, reason: "finalized" }, error: null };
    }
    return { data: null, error: { message: `unexpected rpc ${fn}` } };
  };
}

// ─── computePendingProfileItems ──────────────────────────────────────────────

Deno.test("computePendingProfileItems: espejo de recalculate-profiles", () => {
  // Perfil completo → nada pendiente.
  assertEquals(
    computePendingProfileItems(baseProfile(), { experiences: 1, certifications: 1, documents: 1 }),
    [],
  );
  // CV por las tres vías (canónica, legacy URL, enlace externo).
  for (const cv of [
    { cv_storage_bucket: "cvs", cv_storage_path: "a.pdf", cv_file_url: null, cv_url: null },
    { cv_storage_bucket: null, cv_storage_path: null, cv_file_url: "https://x/cv.pdf", cv_url: null },
    { cv_storage_bucket: null, cv_storage_path: null, cv_file_url: null, cv_url: "https://y/cv" },
  ]) {
    assertEquals(
      computePendingProfileItems({ ...baseProfile(), ...cv }, { experiences: 0, certifications: 0, documents: 0 })
        .includes("cv"),
      false,
    );
  }
  // Todo vacío → las 10 claves.
  const empty = computePendingProfileItems(
    {},
    { experiences: 0, certifications: 0, documents: 0 },
  );
  assertEquals(empty, [
    "photo", "basic_details", "location", "years_experience", "skills",
    "bio", "cv", "experience", "certifications", "documents",
  ]);
});

// ─── Grupo 1: usuario Marketplace Ready aplica → sin email ─────────────────

Deno.test("G1: candidatura 'applied' (perfil ready) no recibe email de perfil incompleto", async () => {
  const provider = new RecordingProvider();
  const calls: RecordedCall[] = [];
  const supabase = fakeSupabase({
    applications: [baseApplication({ status: "applied" })],
    profiles: [baseProfile({ marketplace_ready: true })],
    activations: [],
    authUsers: { [UID]: { email: "jan@example.com" } },
    rpc: defaultRpcCalls(),
  }, calls);

  const r = await sendApplicationPendingProfileEmail({ supabase, emailProvider: provider }, { applicationId: APP_ID, userId: UID });
  assertEquals(r.kind, "skipped");
  assert("reason" in r && r.reason.startsWith("not_pending:applied"));
  assertEquals(provider.sent.length, 0);
  // Sin claim → sin cambio de estado en claim table.
  assertEquals(calls.filter((c) => c.fn.includes("claim_")).length, 0);
});

// ─── Grupo 2: usuario NO ready aplica → email exactamente una vez ───────────

Deno.test("G2: pending → email enviado una vez, con claim/fase/finalize correctos", async () => {
  const provider = new RecordingProvider();
  const calls: RecordedCall[] = [];
  const supabase = fakeSupabase({
    applications: [baseApplication()],
    profiles: [baseProfile()],
    activations: [],
    authUsers: { [UID]: { email: "jan@example.com", user_metadata: { lang: "es" } } },
    counts: { [UID]: { experiences: 2, certifications: 0, documents: 0 } },
    rpc: defaultRpcCalls(),
  }, calls);

  const r = await sendApplicationPendingProfileEmail({ supabase, emailProvider: provider }, { applicationId: APP_ID, userId: UID });
  assertEquals(r.kind, "sent");
  if (r.kind === "sent") {
    assertEquals(r.lang, "es");
    assertEquals(r.langSource, "user_metadata");
  }
  assertEquals(provider.sent.length, 1);
  const msg = provider.sent[0];
  // El mensaje NO transmite rechazo; concepto correcto en el subject.
  assertStringIncludes(msg.subject, "Candidatura recibida");
  assertStringIncludes(msg.subject, "completa tu perfil para activarla");
  // El mensaje NO transmite rechazo (concepto del producto).
  assertStringIncludes(msg.text!, "NO ha sido rechazada");
  assertStringIncludes(msg.text!, "Pipe Welder");
  assertStringIncludes(msg.text!, "BASF");
  assertStringIncludes(msg.text!, "Sube un certificado o documento profesional");
  assertStringIncludes(msg.text!, "Indica tu disponibilidad");
  assert(!msg.text!.includes("Documentos"));
  assert(!msg.text!.includes("Foto de perfil"));
  // CTA al perfil.
  assertStringIncludes(msg.text!, "/profile");
  // Orden del protocolo: claim → marc send_started → send → finalize sent.
  assertEquals(calls[0].fn, "app_14da0f1941_claim_application_profile_pending_email");
  assertEquals(calls[1].fn, "pb_marketplace_missing_requirements");
  assertEquals(calls[2].fn, "pb_marketplace_phone_present");
  assertEquals(calls[3].fn, "app_14da0f1941_marc_application_profile_pending_email_phase");
  assertEquals(calls[3].args.p_phase, "send_started");
  const fin = calls[calls.length - 1];
  assertEquals(fin.fn, "app_14da0f1941_finalize_application_profile_pending_email");
  assertEquals(fin.args.p_outcome, "sent");
});

Deno.test("EMAIL 1 enumera exactamente los faltantes canónicos en captura", async () => {
  const cases = [
    { missing: ["cv"], label: "Sube un CV válido" },
    { missing: ["certificate"], label: "Sube un certificado o documento profesional" },
    { missing: ["availability"], label: "Indica tu disponibilidad" },
    { missing: ["cv", "certificate", "availability", "consent"], label: "Confirma el consentimiento y la visibilidad" },
  ];
  const allLabels = ["Sube un CV válido", "Sube un certificado o documento profesional", "Indica tu disponibilidad", "Confirma el consentimiento y la visibilidad"];
  for (const { missing, label } of cases) {
    const provider = new RecordingProvider();
    const supabase = fakeSupabase({
      applications: [baseApplication()], profiles: [baseProfile()], activations: [],
      authUsers: { [UID]: { email: "qa@example.invalid", user_metadata: { lang: "es" } } },
      rpc: defaultRpcCalls({ [`pb_marketplace_missing_requirements:${UID}`]: { missing } }),
    });
    const result = await sendApplicationPendingProfileEmail({ supabase, emailProvider: provider }, { applicationId: APP_ID, userId: UID });
    assertEquals(result.kind, "sent");
    assertEquals(provider.sent.length, 1);
    assertStringIncludes(provider.sent[0].text!, label);
    for (const item of allLabels) assertEquals(provider.sent[0].text!.includes(item), missing.includes(["cv", "certificate", "availability", "consent"][allLabels.indexOf(item)]));
  }
});

Deno.test("EMAIL 1 recomienda teléfono ausente sin añadirlo a los requisitos", async () => {
  for (const phonePresent of [false, true]) {
    const provider = new RecordingProvider();
    const supabase = fakeSupabase({
      applications: [baseApplication()], profiles: [baseProfile()], activations: [],
      authUsers: { [UID]: { email: "qa@example.invalid", user_metadata: { lang: "es" } } },
      rpc: defaultRpcCalls({
        [`pb_marketplace_missing_requirements:${UID}`]: { missing: ["cv"] },
        [`pb_marketplace_phone_present:${UID}`]: { phonePresent },
      }),
    });
    const result = await sendApplicationPendingProfileEmail({ supabase, emailProvider: provider }, { applicationId: APP_ID, userId: UID });
    assertEquals(result.kind, "sent");
    assertStringIncludes(provider.sent[0].text!, "Sube un CV válido");
    assertEquals(provider.sent[0].text!.includes("Recomendado: añade tu número de teléfono"), !phonePresent);
    assertEquals(provider.sent[0].capture?.meta?.pending_items, ["cv"]);
  }
});

Deno.test("EMAIL 1 conserva faltantes múltiples y no recomienda teléfono presente no verificado", async () => {
  for (const { missing, phonePresent } of [
    { missing: ["certificate"], phonePresent: true },
    { missing: ["cv", "certificate", "availability", "consent", "completion"], phonePresent: false },
  ]) {
    const provider = new RecordingProvider();
    const supabase = fakeSupabase({
      applications: [baseApplication()], profiles: [baseProfile()], activations: [],
      authUsers: { [UID]: { email: "qa@example.invalid", user_metadata: { lang: "es" } } },
      rpc: defaultRpcCalls({
        [`pb_marketplace_missing_requirements:${UID}`]: { missing },
        [`pb_marketplace_phone_present:${UID}`]: { phonePresent },
      }),
    });
    assertEquals((await sendApplicationPendingProfileEmail({ supabase, emailProvider: provider }, { applicationId: APP_ID, userId: UID })).kind, "sent");
    const message = provider.sent[0];
    assertEquals(message.capture?.meta?.pending_items, missing);
    assertEquals((message.html?.match(/<li/g) ?? []).length, missing.length);
    assertEquals(message.text!.includes("Recomendado: añade tu número de teléfono"), !phonePresent);
    assert(!message.text!.includes("teléfono verificado"));
    assertStringIncludes(message.text!, "/profile");
  }
});

Deno.test("reconciliación envía una vez por candidato y el teléfono queda recomendado", async () => {
  for (const phonePresent of [false, true]) {
    const provider = new RecordingProvider();
    const calls: RecordedCall[] = [];
    const row = { user_id: UID, batch_id: "qa-batch", state: "pending" };
    const supabase = fakeSupabase({
      applications: [baseApplication(), baseApplication({ id: APP2_ID })],
      profiles: [baseProfile({ preferred_language: "de" })], activations: [],
      reconcileEmails: [row],
      authUsers: { [UID]: { email: "qa@example.invalid", user_metadata: { lang: "es" } } },
      rpc: (fn, args) => {
        if (fn === "pb_claim_marketplace_reconcile_email") {
          return { data: row.state === "sent" ? { claimed: false, reason: "already_sent" } : { claimed: true, claim_id: "qa-claim" }, error: null };
        }
        if (fn === "pb_marketplace_missing_requirements") return { data: ["cv", "certificate"], error: null };
        if (fn === "pb_marketplace_phone_present") return { data: phonePresent, error: null };
        if (fn === "pb_mark_marketplace_reconcile_email_send") return { data: true, error: null };
        if (fn === "pb_finalize_marketplace_reconcile_email") {
          if (args.p_outcome === "sent") row.state = "sent";
          return { data: true, error: null };
        }
        return { data: null, error: { message: `unexpected rpc ${fn}` } };
      },
    }, calls);
    assertEquals(await drainMarketplaceReconciliationEmails({ supabase, emailProvider: provider }, "qa-batch"), [{ userId: UID, outcome: "sent" }]);
    assertEquals(provider.sent.length, 1);
    const message = provider.sent[0];
    assertStringIncludes(message.text!, "Sube un CV válido");
    assertStringIncludes(message.text!, "Sube un certificado o documento profesional");
    assertStringIncludes(message.text!, "/profile");
    assertEquals(message.capture?.lang, "es");
    assertEquals((message.html?.match(/<li/g) ?? []).length, 2);
    assertEquals(message.text!.includes("Recomendado: añade tu número de teléfono"), !phonePresent);
    assertEquals(message.capture?.meta?.missing, ["cv", "certificate"]);
    assertEquals(await drainMarketplaceReconciliationEmails({ supabase, emailProvider: provider }, "qa-batch"), []);
    assertEquals(provider.sent.length, 1);
    assertEquals(calls.filter((call) => call.fn === "pb_finalize_marketplace_reconcile_email" && call.args.p_outcome === "sent").length, 1);
  }
});

// ─── Grupo 3: dos ofertas → dos emails, cada una con su claim ───────────────

Deno.test("G3: dos candidaturas → dos emails independientes sin duplicados", async () => {
  const provider = new RecordingProvider();
  const supabase = fakeSupabase({
    applications: [
      baseApplication(),
      baseApplication({ id: APP2_ID, job_title: "TIG Welder", company_name: "INEOS" }),
    ],
    profiles: [baseProfile()],
    activations: [],
    authUsers: { [UID]: { email: "jan@example.com", user_metadata: { lang: "en" } } },
    rpc: defaultRpcCalls(),
  });

  const r1 = await sendApplicationPendingProfileEmail({ supabase, emailProvider: provider }, { applicationId: APP_ID, userId: UID });
  const r2 = await sendApplicationPendingProfileEmail({ supabase, emailProvider: provider }, { applicationId: APP2_ID, userId: UID });
  assertEquals(r1.kind, "sent");
  assertEquals(r2.kind, "sent");
  assertEquals(provider.sent.length, 2);
  assertStringIncludes(provider.sent[0].subject, "Application received");
  assertStringIncludes(provider.sent[1].text!, "TIG Welder");
});

// ─── Grupo 4: false→true → un solo email con contexto múltiple ──────────────

Deno.test("G4: activación con 2 candidaturas → UN email con cuerpo plural y títulos", async () => {
  const provider = new RecordingProvider();
  const calls: RecordedCall[] = [];
  const supabase = fakeSupabase({
    applications: [],
    profiles: [baseProfile({ marketplace_ready: true, preferred_language: "nl" })],
    activations: [{
      id: ACT_ID,
      user_id: UID,
      activated_count: 2,
      activated_job_titles: ["Pipe Welder", "TIG Welder"],
      state: "pending",
    }],
    authUsers: { [UID]: { email: "jan@example.com" } },
    rpc: defaultRpcCalls(),
  }, calls);

  const results = await drainMarketplaceReadyActivations({ supabase, emailProvider: provider }, { userId: UID });
  assertEquals(results.length, 1);
  assertEquals(results[0].kind, "sent");
  if (results[0].kind === "sent") {
    assertEquals(results[0].activatedCount, 2);
    assertEquals(results[0].lang, "nl");
    assertEquals(results[0].langSource, "profile");
  }
  assertEquals(provider.sent.length, 1);
  const msg = provider.sent[0];
  assertStringIncludes(msg.subject, "Profiel gevalideerd");
  assertStringIncludes(msg.text!, "2 lopende sollicitaties");
  assertStringIncludes(msg.text!, "Pipe Welder");
  assertStringIncludes(msg.text!, "TIG Welder");
  // CTA al listado de candidaturas.
  assertStringIncludes(msg.text!, "/applications");
  // Nunca se toca el estado de candidaturas desde el drenaje (lo hizo el
  // trigger de la BD); solo claim/phase/finalize del outbox.
  assertEquals(
    calls.every((c) => c.fn.startsWith("app_14da0f1941_") &&
      (c.fn.includes("marketplace_ready_activation") || c.fn.includes("claim_"))),
    true,
  );
});

Deno.test("G4b: activación con 1 candidatura → cuerpo singular con {jobTitle}", async () => {
  const provider = new RecordingProvider();
  const supabase = fakeSupabase({
    applications: [],
    profiles: [baseProfile({ marketplace_ready: true })],
    activations: [{
      id: ACT_ID, user_id: UID, activated_count: 1,
      activated_job_titles: ["Pipe Welder"], state: "pending",
    }],
    authUsers: { [UID]: { email: "jan@example.com", user_metadata: { lang: "fr" } } },
    rpc: defaultRpcCalls(),
  });
  const results = await drainMarketplaceReadyActivations({ supabase, emailProvider: provider }, { userId: UID });
  assertEquals(results[0].kind, "sent");
  assertEquals(provider.sent.length, 1);
  // Cuerpo singular con el título de la oferta; sin marcadores sin sustituir.
  assertStringIncludes(provider.sent[0].text!, "Pipe Welder");
  assert(!provider.sent[0].text!.includes("{jobTitle}"), "sin marcador {jobTitle} sin sustituir");
  assert(!provider.sent[0].text!.includes("{count}"), "sin marcadores sin sustituir");
});

Deno.test("G4c: transición sin candidaturas → 'skipped', sin email", async () => {
  const provider = new RecordingProvider();
  const calls: RecordedCall[] = [];
  const supabase = fakeSupabase({
    applications: [],
    profiles: [baseProfile({ marketplace_ready: true })],
    activations: [{ id: ACT_ID, user_id: UID, activated_count: 0, activated_job_titles: [], state: "pending" }],
    authUsers: { [UID]: { email: "jan@example.com" } },
    rpc: defaultRpcCalls(),
  }, calls);
  const results = await drainMarketplaceReadyActivations({ supabase, emailProvider: provider }, { userId: UID });
  assertEquals(results[0].kind, "skipped");
  if (results[0].kind === "skipped") assertEquals(results[0].reason, "no_pending_applications");
  assertEquals(provider.sent.length, 0);
  const fin = calls[calls.length - 1];
  assertEquals(fin.fn, "app_14da0f1941_finalize_marketplace_ready_activation");
  assertEquals(fin.args.p_outcome, "skipped");
});

// ─── Grupo 5: ready→true ya existente → sin outbox nuevo → sin reenvío ──────

Deno.test("G5: sin transición nueva (outbox vacío o ya sent) → cero emails", async () => {
  const provider = new RecordingProvider();
  // Caso a: no hay filas (update true→true no dispara trigger, no crea outbox).
  const empty = fakeSupabase({
    applications: [], profiles: [], activations: [],
    authUsers: {}, rpc: defaultRpcCalls(),
  });
  assertEquals((await drainMarketplaceReadyActivations({ supabase: empty, emailProvider: provider }, { userId: UID })).length, 0);
  // Caso b: la fila existe pero ya está 'sent' → no se selecciona.
  const sent = fakeSupabase({
    applications: [], profiles: [],
    activations: [{ id: ACT_ID, user_id: UID, activated_count: 2, activated_job_titles: ["A", "B"], state: "sent" }],
    authUsers: {}, rpc: defaultRpcCalls(),
  });
  assertEquals((await drainMarketplaceReadyActivations({ supabase: sent, emailProvider: provider }, { userId: UID })).length, 0);
  assertEquals(provider.sent.length, 0);
});

// ─── Grupo 6: retry técnico → claim impide duplicar ─────────────────────────

Deno.test("G6: reintento del EMAIL 1 → 'already_sent', sin segundo email", async () => {
  const provider = new RecordingProvider();
  const supabase = fakeSupabase({
    applications: [baseApplication()],
    profiles: [baseProfile()],
    activations: [],
    authUsers: { [UID]: { email: "jan@example.com" } },
    rpc: defaultRpcCalls(),
  });
  const first = await sendApplicationPendingProfileEmail({ supabase, emailProvider: provider }, { applicationId: APP_ID, userId: UID });
  assertEquals(first.kind, "sent");

  // Retry: la claim table ya está en 'sent' (simulate backend state).
  const retrySupabase = fakeSupabase({
    applications: [baseApplication()],
    profiles: [baseProfile()],
    activations: [],
    authUsers: { [UID]: { email: "jan@example.com" } },
    rpc: defaultRpcCalls({
      [`app_14da0f1941_claim_application_profile_pending_email:${APP_ID}`]: { state: "sent", reason: "already_sent" },
    }),
  });
  const second = await sendApplicationPendingProfileEmail({ supabase: retrySupabase, emailProvider: provider }, { applicationId: APP_ID, userId: UID });
  assertEquals(second.kind, "skipped");
  if (second.kind === "skipped") assertEquals(second.reason, "claim:already_sent");
  assertEquals(provider.sent.length, 1, "una candidatura = un email, con reintentos");
});

Deno.test("G6b: reintento del EMAIL 2 → 'already_sent', sin segundo email", async () => {
  const provider = new RecordingProvider();
  const supabase = fakeSupabase({
    applications: [], profiles: [baseProfile({ marketplace_ready: true })],
    activations: [{ id: ACT_ID, user_id: UID, activated_count: 1, activated_job_titles: ["A"], state: "pending" }],
    authUsers: { [UID]: { email: "jan@example.com" } },
    rpc: defaultRpcCalls(),
  });
  assertEquals((await drainMarketplaceReadyActivations({ supabase, emailProvider: provider }, { userId: UID }))[0].kind, "sent");

  const retry = fakeSupabase({
    applications: [], profiles: [],
    activations: [{ id: ACT_ID, user_id: UID, activated_count: 1, activated_job_titles: ["A"], state: "pending" }],
    authUsers: { [UID]: { email: "jan@example.com" } },
    rpc: defaultRpcCalls({
      [`app_14da0f1941_claim_marketplace_ready_activation:${ACT_ID}`]: { state: "sent", reason: "already_sent" },
    }),
  });
  const r2 = await drainMarketplaceReadyActivations({ supabase: retry, emailProvider: provider }, { userId: UID });
  assertEquals(r2[0].kind, "skipped");
  assertEquals(provider.sent.length, 1, "una transición = un email, con reintentos");
});

// ─── Grupo 7: idiomas ────────────────────────────────────────────────────────

Deno.test("G7: los 11 idiomas renderizan subject, cuerpo y CTA; fallback inglés", async () => {
  const langs = ["en", "es", "nl", "fr", "de", "pt", "it", "ro", "uk", "pl", "bg"];
  for (const lang of langs) {
    const provider = new RecordingProvider();
    const supabase = fakeSupabase({
      applications: [baseApplication()],
      profiles: [baseProfile({ preferred_language: lang })],
      activations: [{ id: ACT_ID, user_id: UID, activated_count: 2, activated_job_titles: ["A", "B"], state: "pending" }],
      authUsers: { [UID]: { email: "jan@example.com" } },
      rpc: defaultRpcCalls(),
    });
    const r1 = await sendApplicationPendingProfileEmail({ supabase, emailProvider: provider }, { applicationId: APP_ID, userId: UID });
    assertEquals(r1.kind, "sent", `EMAIL 1 debe enviarse en ${lang}`);
    if (r1.kind === "sent") assertEquals(r1.lang, lang);
    const subject1 = provider.sent[0].subject;
    assert(subject1.length > 10, `subject EMAIL 1 no vacío en ${lang}`);
    assert(!subject1.includes("{"), `subject EMAIL 1 sin marcadores en ${lang}`);
    assertStringIncludes(provider.sent[0].text!, "/profile", `CTA EMAIL 1 en ${lang}`);

    const r2 = await drainMarketplaceReadyActivations({ supabase, emailProvider: provider }, { userId: UID });
    assertEquals(r2[0].kind, "sent", `EMAIL 2 debe enviarse en ${lang}`);
    const subject2 = provider.sent[1].subject;
    assert(subject2.length > 10, `subject EMAIL 2 no vacío en ${lang}`);
    assert(!subject2.includes("{"), `subject EMAIL 2 sin marcadores en ${lang}`);
    assertStringIncludes(provider.sent[1].text!, "/applications", `CTA EMAIL 2 en ${lang}`);
  }
});

Deno.test("G7b: idioma inválido/ausente → fallback inglés", async () => {
  const provider = new RecordingProvider();
  const supabase = fakeSupabase({
    applications: [baseApplication()],
    profiles: [baseProfile({ preferred_language: "xx-invalid" })],
    activations: [],
    authUsers: { [UID]: { email: "jan@example.com", user_metadata: { lang: "zz" } } },
    rpc: defaultRpcCalls(),
  });
  const r = await sendApplicationPendingProfileEmail({ supabase, emailProvider: provider }, { applicationId: APP_ID, userId: UID });
  assertEquals(r.kind, "sent");
  if (r.kind === "sent") {
    assertEquals(r.lang, "en");
    assertEquals(r.langSource, "fallback");
    assertStringIncludes(provider.sent[0].subject, "Application received");
  }
});

Deno.test("G7c: user_metadata.lang tiene prioridad sobre profiles.preferred_language (idioma ACTUAL al envío)", async () => {
  const provider = new RecordingProvider();
  const supabase = fakeSupabase({
    applications: [baseApplication()],
    // El usuario cambió de idioma DESPUÉS de aplicar: metadata=pt, profile=de.
    profiles: [baseProfile({ preferred_language: "de" })],
    activations: [],
    authUsers: { [UID]: { email: "jan@example.com", user_metadata: { lang: "pt" } } },
    rpc: defaultRpcCalls(),
  });
  const r = await sendApplicationPendingProfileEmail({ supabase, emailProvider: provider }, { applicationId: APP_ID, userId: UID });
  if (r.kind === "sent") assertEquals(r.lang, "pt");
});

// ─── Grupo 8: seguridad ──────────────────────────────────────────────────────

Deno.test("G8a: otro usuario no puede disparar el email de una candidatura ajena", async () => {
  const provider = new RecordingProvider();
  const supabase = fakeSupabase({
    applications: [baseApplication()],
    profiles: [baseProfile()],
    activations: [],
    authUsers: { [OTHER_UID]: { email: "other@example.com" } },
    rpc: defaultRpcCalls(),
  });
  const r = await sendApplicationPendingProfileEmail({ supabase, emailProvider: provider }, { applicationId: APP_ID, userId: OTHER_UID });
  assertEquals(r.kind, "skipped");
  if (r.kind === "skipped") assertEquals(r.reason, "not_owner");
  assertEquals(provider.sent.length, 0);
});

Deno.test("G8b: marketplace_ready se resuelve desde el perfil backend, no del cliente", async () => {
  // Aunque la candidatura siga 'pending_profile_validation' por un desfase,
  // si el perfil canónico ya es marketplace_ready NO se envía el email.
  const provider = new RecordingProvider();
  const supabase = fakeSupabase({
    applications: [baseApplication()],
    profiles: [baseProfile({ marketplace_ready: true })],
    activations: [],
    authUsers: { [UID]: { email: "jan@example.com" } },
    rpc: defaultRpcCalls(),
  });
  const r = await sendApplicationPendingProfileEmail({ supabase, emailProvider: provider }, { applicationId: APP_ID, userId: UID });
  assertEquals(r.kind, "skipped");
  if (r.kind === "skipped") assertEquals(r.reason, "already_marketplace_ready");
  assertEquals(provider.sent.length, 0);
});

Deno.test("G8c: candidatura huérfana (no existe) → skipped sin claim", async () => {
  const provider = new RecordingProvider();
  const calls: RecordedCall[] = [];
  const supabase = fakeSupabase({
    applications: [], profiles: [], activations: [],
    authUsers: {}, rpc: defaultRpcCalls(),
  }, calls);
  const r = await sendApplicationPendingProfileEmail({ supabase, emailProvider: provider }, { applicationId: "99999999-9999-9999-9999-999999999999", userId: UID });
  assertEquals(r.kind, "skipped");
  assertEquals(calls.length, 0);
});

// ─── Grupo 9: regresión y robustez ───────────────────────────────────────────

Deno.test("G9a: fallo del proveedor → failed con finalize 'failed' (reintentable)", async () => {
  const provider = new RecordingProvider(true); // send() lanza.
  const calls: RecordedCall[] = [];
  const supabase = fakeSupabase({
    applications: [baseApplication()],
    profiles: [baseProfile()],
    activations: [],
    authUsers: { [UID]: { email: "jan@example.com" } },
    rpc: defaultRpcCalls(),
  }, calls);
  const r = await sendApplicationPendingProfileEmail({ supabase, emailProvider: provider }, { applicationId: APP_ID, userId: UID });
  assertEquals(r.kind, "failed");
  const fin = calls[calls.length - 1];
  assertEquals(fin.fn, "app_14da0f1941_finalize_application_profile_pending_email");
  assertEquals(fin.args.p_outcome, "failed");
});

Deno.test("G9b: candidatura antigua (fuera de ventana 15 min) → stale, sin email", async () => {
  const provider = new RecordingProvider();
  const supabase = fakeSupabase({
    applications: [baseApplication({ created_at: new Date(Date.now() - 3600_000).toISOString() })],
    profiles: [baseProfile()],
    activations: [],
    authUsers: { [UID]: { email: "jan@example.com" } },
    rpc: defaultRpcCalls(),
  });
  const r = await sendApplicationPendingProfileEmail({ supabase, emailProvider: provider }, { applicationId: APP_ID, userId: UID });
  assertEquals(r.kind, "skipped");
  if (r.kind === "skipped") assertEquals(r.reason, "stale_application");
  assertEquals(provider.sent.length, 0);
});

Deno.test("G9c: usuario sin email verificable → skipped, sin claim", async () => {
  const provider = new RecordingProvider();
  const calls: RecordedCall[] = [];
  const supabase = fakeSupabase({
    applications: [baseApplication()],
    profiles: [baseProfile()],
    activations: [],
    authUsers: { [UID]: { email: null } },
    rpc: defaultRpcCalls(),
  }, calls);
  const r = await sendApplicationPendingProfileEmail({ supabase, emailProvider: provider }, { applicationId: APP_ID, userId: UID });
  assertEquals(r.kind, "skipped");
  assertEquals(calls.filter((c) => c.fn.includes("claim")).length, 0);
});

Deno.test("G9d: el drenaje solo usa las RPCs de outbox (nunca app_update_application_status)", async () => {
  const provider = new RecordingProvider();
  const calls: RecordedCall[] = [];
  const supabase = fakeSupabase({
    applications: [],
    profiles: [baseProfile({ marketplace_ready: true })],
    activations: [{ id: ACT_ID, user_id: UID, activated_count: 1, activated_job_titles: ["A"], state: "pending" }],
    authUsers: { [UID]: { email: "jan@example.com" } },
    rpc: defaultRpcCalls(),
  }, calls);
  await drainMarketplaceReadyActivations({ supabase, emailProvider: provider }, { userId: UID });
  for (const c of calls) {
    assertEquals(
      c.fn.startsWith("app_14da0f1941_") && c.fn.includes("marketplace_ready_activation"),
      true,
      `RPC inesperada en el drenaje: ${c.fn}`,
    );
  }
  // Nunca se pide pasar una candidatura a sent_to_client desde el email flow.
  assertEquals(calls.some((c) => JSON.stringify(c.args).includes("sent_to_client")), false);
});

Deno.test("G9e: oferta sin empresa → cuerpo alternativo sin marcador {company}", async () => {
  const provider = new RecordingProvider();
  const supabase = fakeSupabase({
    applications: [baseApplication({ company_name: null })],
    profiles: [baseProfile({ preferred_language: "es" })],
    activations: [],
    authUsers: { [UID]: { email: "jan@example.com" } },
    rpc: defaultRpcCalls(),
  });
  const r = await sendApplicationPendingProfileEmail({ supabase, emailProvider: provider }, { applicationId: APP_ID, userId: UID });
  assertEquals(r.kind, "sent");
  const text = provider.sent[0].text!;
  assert(!text.includes("null"), "sin literal null");
  assert(!text.includes("{company}"), "sin marcador sin sustituir");
  assertStringIncludes(text, "Pipe Welder");
});

// ─── PB-JOBS-MARKETPLACE-READY-RECOVERY-001 — outcomes explícitos EMAIL 1 ───

Deno.test("R1: fallo REAL del RPC canónico → canonical_query_failed, sin email, claim reintentable", async () => {
  const provider = new RecordingProvider();
  const calls: RecordedCall[] = [];
  const supabase = fakeSupabase({
    applications: [baseApplication()],
    profiles: [baseProfile()],
    activations: [],
    authUsers: { [UID]: { email: "jan@example.com" } },
    rpc: (fn, args) => {
      if (fn === "pb_marketplace_missing_requirements") {
        return { data: null, error: { message: "relation does not exist" } };
      }
      return defaultRpcCalls()(fn, args);
    },
  }, calls);
  const r = await sendApplicationPendingProfileEmail({ supabase, emailProvider: provider }, { applicationId: APP_ID, userId: UID });
  assertEquals(r.kind, "failed");
  if (r.kind === "failed") assertEquals(r.reason, "canonical_query_failed");
  assertEquals(provider.sent.length, 0);
  const fin = calls.find((c) => c.fn === "app_14da0f1941_finalize_application_profile_pending_email");
  assertEquals(fin?.args.p_outcome, "failed");
  assertEquals(fin?.args.p_last_error, "canonical_query_failed");
  // Nunca se consultan faltantes inventados ni se envía plantilla de EMAIL 1.
  assertEquals(calls.some((c) => c.fn === "pb_sync_marketplace_ready_state"), false);
});

Deno.test("R2: lista vacía + sync promoted → eligible_state_stale_activated: sin EMAIL 1, EMAIL 2 por drain", async () => {
  const provider = new RecordingProvider();
  const calls: RecordedCall[] = [];
  const supabase = fakeSupabase({
    applications: [baseApplication()],
    profiles: [baseProfile()],
    activations: [{ id: ACT_ID, user_id: UID, activated_count: 1, activated_job_titles: ["Pipe Welder"], state: "pending" }],
    authUsers: { [UID]: { email: "jan@example.com" } },
    rpc: (fn, args) => {
      if (fn === "pb_marketplace_missing_requirements") return { data: [], error: null };
      if (fn === "pb_sync_marketplace_ready_state") {
        return { data: { out_status: "promoted", out_marketplace_ready: true, out_activated_count: 1 }, error: null };
      }
      return defaultRpcCalls()(fn, args);
    },
  }, calls);
  const r = await sendApplicationPendingProfileEmail({ supabase, emailProvider: provider }, { applicationId: APP_ID, userId: UID });
  assertEquals(r.kind, "skipped");
  if (r.kind === "skipped") assertEquals(r.reason, "eligible_state_stale_activated");
  // Exactamente UN email: el de activación (EMAIL 2), nunca el de perfil
  // incompleto pidiendo requisitos inexistentes.
  assertEquals(provider.sent.length, 1);
  assertEquals(provider.sent[0].capture?.template, "marketplace_ready");
  // El claim de EMAIL 1 queda auditado con el motivo explícito.
  const fin = calls.find((c) => c.fn === "app_14da0f1941_finalize_application_profile_pending_email");
  assertEquals(fin?.args.p_outcome, "failed");
  assertEquals(fin?.args.p_last_error, "eligible_state_stale_activated");
  assertEquals(calls.some((c) => c.fn === "pb_sync_marketplace_ready_state"), true);
});

Deno.test("R3: lista vacía + sync sin promover (consent_required) → fail-safe sin email", async () => {
  const provider = new RecordingProvider();
  const supabase = fakeSupabase({
    applications: [baseApplication()],
    profiles: [baseProfile()],
    activations: [],
    authUsers: { [UID]: { email: "jan@example.com" } },
    rpc: (fn, args) => {
      if (fn === "pb_marketplace_missing_requirements") return { data: [], error: null };
      if (fn === "pb_sync_marketplace_ready_state") {
        return { data: { out_status: "consent_required", out_marketplace_ready: false, out_activated_count: 0 }, error: null };
      }
      return defaultRpcCalls()(fn, args);
    },
  });
  const r = await sendApplicationPendingProfileEmail({ supabase, emailProvider: provider }, { applicationId: APP_ID, userId: UID });
  assertEquals(r.kind, "failed");
  if (r.kind === "failed") assertEquals(r.reason, "eligible_state_stale:consent_required");
  assertEquals(provider.sent.length, 0);
});

Deno.test("R4: lista vacía + error del sync → eligible_state_stale:sync_unavailable", async () => {
  const provider = new RecordingProvider();
  const supabase = fakeSupabase({
    applications: [baseApplication()],
    profiles: [baseProfile()],
    activations: [],
    authUsers: { [UID]: { email: "jan@example.com" } },
    rpc: (fn, args) => {
      if (fn === "pb_marketplace_missing_requirements") return { data: [], error: null };
      if (fn === "pb_sync_marketplace_ready_state") return { data: null, error: { message: "permission denied" } };
      return defaultRpcCalls()(fn, args);
    },
  });
  const r = await sendApplicationPendingProfileEmail({ supabase, emailProvider: provider }, { applicationId: APP_ID, userId: UID });
  assertEquals(r.kind, "failed");
  if (r.kind === "failed") assertEquals(r.reason, "eligible_state_stale:sync_unavailable");
  assertEquals(provider.sent.length, 0);
});

Deno.test("R5: RPC con items no-string → canonical_query_failed (no inventa faltantes)", async () => {
  const provider = new RecordingProvider();
  const supabase = fakeSupabase({
    applications: [baseApplication()],
    profiles: [baseProfile()],
    activations: [],
    authUsers: { [UID]: { email: "jan@example.com" } },
    rpc: (fn, args) => {
      if (fn === "pb_marketplace_missing_requirements") {
        return { data: [{ bogus: true }], error: null };
      }
      return defaultRpcCalls()(fn, args);
    },
  });
  const r = await sendApplicationPendingProfileEmail({ supabase, emailProvider: provider }, { applicationId: APP_ID, userId: UID });
  assertEquals(r.kind, "failed");
  if (r.kind === "failed") assertEquals(r.reason, "canonical_query_failed");
  assertEquals(provider.sent.length, 0);
});
