// PB-WELCOME-EMAIL-001 — arnés de pruebas SQL sobre PostgreSQL 16 real.
//
// Crea un entorno mínimo equivalente al de Supabase (roles anon/authenticated/
// service_role, esquema auth con auth.users y auth.uid(), y las tablas base
// referenciadas por la migración), aplica sql/046 y ejecuta la batería de QA.
//
// Uso: deno run --allow-net --allow-read qa/welcome-email-sql-qa.ts
import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

const SQL_FILE = new URL("../sql/046-pb-welcome-email-001.sql", import.meta.url);

const client = new Client({
  user: "postgres",
  database: "postgres",
  hostname: "127.0.0.1",
  port: 55432,
  tls: { enabled: false },
});

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, got?: unknown) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  FAIL  ${name}${got !== undefined ? ` — got: ${JSON.stringify(got)}` : ""}`);
  }
}

async function one<T = unknown>(sql: string, args: unknown[] = []): Promise<T> {
  const r = await client.queryArray(sql, args);
  return r.rows[0]?.[0] as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entorno Supabase mínimo
// ─────────────────────────────────────────────────────────────────────────────
const BOOTSTRAP = `
DROP SCHEMA IF EXISTS auth CASCADE;
DROP TABLE IF EXISTS public.app_14da0f1941_profiles CASCADE;
DROP TABLE IF EXISTS public.app_14da0f1941_welcome_emails CASCADE;
DROP TABLE IF EXISTS public.app_14da0f1941_welcome_email_events CASCADE;
DROP TABLE IF EXISTS public.app_14da0f1941_welcome_email_config CASCADE;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

CREATE SCHEMA auth;

-- Subconjunto de auth.users suficiente para el flujo de confirmación.
CREATE TABLE auth.users (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                text,
  encrypted_password   text,
  email_confirmed_at   timestamptz,
  last_sign_in_at      timestamptz,
  recovery_token        text,
  raw_user_meta_data   jsonb DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- auth.uid() simulado mediante GUC, igual que hace Supabase con el JWT.
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- Tabla de perfiles (sólo lo que la vista de métricas necesita).
CREATE TABLE public.app_14da0f1941_profiles (
  user_id            uuid PRIMARY KEY,
  account_type       text,
  preferred_language text,
  marketplace_ready  boolean DEFAULT false
);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO service_role;
`;

console.log("PB-WELCOME-EMAIL-001 — QA SQL sobre PostgreSQL 16.2 real\n");

await client.connect();

console.log("[bootstrap] entorno Supabase mínimo");
await client.queryArray(BOOTSTRAP);

console.log("[migración] aplicando sql/046-pb-welcome-email-001.sql");
const migration = await Deno.readTextFile(SQL_FILE);
await client.queryArray(migration);
console.log("  OK — la migración se aplica sin errores\n");

console.log("[idempotencia de la migración] segunda aplicación");
await client.queryArray(migration);
console.log("  OK — reaplicable sin efectos secundarios\n");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de dominio
// ─────────────────────────────────────────────────────────────────────────────
async function newUser(
  meta: Record<string, unknown>,
  opts: { confirmed?: boolean } = {},
): Promise<string> {
  return await one<string>(
    `INSERT INTO auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
     VALUES ($1, 'hash', CASE WHEN $2 THEN now() ELSE NULL END, $3::jsonb)
     RETURNING id::text`,
    [`u${crypto.randomUUID()}@example.com`, opts.confirmed ?? false, JSON.stringify(meta)],
  );
}

const confirm = (id: string) =>
  client.queryArray(
    `UPDATE auth.users SET email_confirmed_at = now(), updated_at = now() WHERE id = $1::uuid`,
    [id],
  );

const rowCount = (id: string) =>
  one<bigint>(
    `SELECT count(*) FROM public.app_14da0f1941_welcome_emails WHERE user_id = $1::uuid`,
    [id],
  );

const setEnabled = (on: boolean) =>
  client.queryArray(
    `SELECT public.app_14da0f1941_set_welcome_email_enabled($1, 'qa')`,
    [on],
  );

// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUPO 1 · Estado inicial y gate de producción ──");
// ═════════════════════════════════════════════════════════════════════════════

check(
  "1.1 La feature nace DESACTIVADA (gate de producción)",
  (await one<boolean>(`SELECT enabled FROM public.app_14da0f1941_welcome_email_config`)) === false,
);
check(
  "1.2 enabled_at nace NULL (sin suelo, nada encolable)",
  (await one(`SELECT enabled_at FROM public.app_14da0f1941_welcome_email_config`)) === null,
);

const uOff = await newUser({ account_type: "worker", lang: "es" });
await confirm(uOff);
check(
  "1.3 Con la feature OFF, confirmar NO encola nada (sin backlog)",
  (await rowCount(uOff)) === 0n,
  await rowCount(uOff),
);

// ═════════════════════════════════════════════════════════════════════════════
console.log("\n── GRUPO 2 · Anti-retroactividad ──");
// ═════════════════════════════════════════════════════════════════════════════

// Usuario histórico: confirmado ANTES de activar la feature.
const uHistoric = await newUser({ account_type: "worker", lang: "en" }, { confirmed: true });
await client.queryArray(
  `UPDATE auth.users SET email_confirmed_at = now() - interval '200 days' WHERE id = $1::uuid`,
  [uHistoric],
);

await setEnabled(true);

check(
  "2.1 Al activar, enabled_at queda fijado (suelo anti-retroactividad)",
  (await one(`SELECT enabled_at FROM public.app_14da0f1941_welcome_email_config`)) !== null,
);
check(
  "2.2 Usuario histórico (confirmado hace 200 días) NO se encola",
  (await rowCount(uHistoric)) === 0n,
);
check(
  "2.3 El encolado explícito de un histórico devuelve 'before_floor'",
  (await one<string>(`SELECT public.app_14da0f1941_enqueue_welcome_email($1, 'sweep')`, [uHistoric])) ===
    "before_floor",
  await one<string>(`SELECT public.app_14da0f1941_enqueue_welcome_email($1, 'sweep')`, [uHistoric]),
);
check(
  "2.4 El usuario confirmado durante la ventana OFF tampoco entra al activar",
  (await rowCount(uOff)) === 0n,
);
check(
  "2.5 No existe ninguna función de backfill/retroactividad",
  (await one<bigint>(
    `SELECT count(*) FROM pg_proc WHERE proname LIKE '%welcome%'
       AND (proname LIKE '%backfill%' OR proname LIKE '%retro%' OR proname LIKE '%bulk%')`,
  )) === 0n,
);

// ═════════════════════════════════════════════════════════════════════════════
console.log("\n── GRUPO 3 · Disparo por confirmación REAL ──");
// ═════════════════════════════════════════════════════════════════════════════

const uWorker = await newUser({ account_type: "worker", lang: "es" });
check("3.1 Alta sin confirmar NO encola", (await rowCount(uWorker)) === 0n);
check(
  "3.2 Encolar sin confirmación devuelve 'not_confirmed'",
  (await one<string>(`SELECT public.app_14da0f1941_enqueue_welcome_email($1, 'gate_rpc')`, [uWorker])) ===
    "not_confirmed",
);

await confirm(uWorker);
check("3.3 La confirmación REAL encola exactamente 1 fila", (await rowCount(uWorker)) === 1n);
check(
  "3.4 Se captura account_type='worker' y lang='es' del user_metadata",
  (await one<string>(
    `SELECT account_type || '/' || lang FROM public.app_14da0f1941_welcome_emails WHERE user_id = $1::uuid`,
    [uWorker],
  )) === "worker/es",
);
check(
  "3.5 source='auth_trigger' y state='pending'",
  (await one<string>(
    `SELECT source || '/' || state FROM public.app_14da0f1941_welcome_emails WHERE user_id = $1::uuid`,
    [uWorker],
  )) === "auth_trigger/pending",
);

const uCompany = await newUser({ account_type: "company", lang: "nl" });
await confirm(uCompany);
check(
  "3.6 Variante empresa: account_type='company'",
  (await one<string>(
    `SELECT account_type FROM public.app_14da0f1941_welcome_emails WHERE user_id = $1::uuid`,
    [uCompany],
  )) === "company",
);

// OAuth / Google: el alta nace ya confirmada.
const uOauth = await newUser({ account_type: "worker", lang: "de" }, { confirmed: true });
check("3.7 Alta OAuth ya confirmada (INSERT) encola 1 fila", (await rowCount(uOauth)) === 1n);

// account_type ausente o basura → 'worker'.
const uNoType = await newUser({ lang: "fr" });
await confirm(uNoType);
check(
  "3.8 Sin account_type en metadata → 'worker' por defecto",
  (await one<string>(
    `SELECT account_type FROM public.app_14da0f1941_welcome_emails WHERE user_id = $1::uuid`,
    [uNoType],
  )) === "worker",
);
const uBadType = await newUser({ account_type: "ADMIN'; DROP TABLE--", lang: "pl" });
await confirm(uBadType);
check(
  "3.9 account_type manipulado se normaliza a 'worker' (no inyecta)",
  (await one<string>(
    `SELECT account_type FROM public.app_14da0f1941_welcome_emails WHERE user_id = $1::uuid`,
    [uBadType],
  )) === "worker",
);

// ═════════════════════════════════════════════════════════════════════════════
console.log("\n── GRUPO 4 · NO disparar por login ni recuperación ──");
// ═════════════════════════════════════════════════════════════════════════════

const uLogin = await newUser({ account_type: "worker", lang: "es" });
await confirm(uLogin);
const beforeLogin = await rowCount(uLogin);

// Login habitual: toca last_sign_in_at.
for (let i = 0; i < 5; i++) {
  await client.queryArray(
    `UPDATE auth.users SET last_sign_in_at = now(), updated_at = now() WHERE id = $1::uuid`,
    [uLogin],
  );
}
check(
  "4.1 5 logins consecutivos NO crean filas nuevas",
  (await rowCount(uLogin)) === beforeLogin && beforeLogin === 1n,
);

// Recuperación de contraseña.
await client.queryArray(
  `UPDATE auth.users SET recovery_token = 'tok', updated_at = now() WHERE id = $1::uuid`,
  [uLogin],
);
await client.queryArray(
  `UPDATE auth.users SET encrypted_password = 'nuevo', recovery_token = NULL, updated_at = now() WHERE id = $1::uuid`,
  [uLogin],
);
check("4.2 Recuperación de contraseña NO encola", (await rowCount(uLogin)) === 1n);

// Reconfirmación / UPDATE que vuelve a escribir email_confirmed_at.
await client.queryArray(
  `UPDATE auth.users SET email_confirmed_at = now(), updated_at = now() WHERE id = $1::uuid`,
  [uLogin],
);
check("4.3 Re-escribir email_confirmed_at (OLD no NULL) NO duplica", (await rowCount(uLogin)) === 1n);

// Cambio de dirección de email conservando la confirmación.
await client.queryArray(
  `UPDATE auth.users SET email = 'nuevo@example.com', email_confirmed_at = now(), updated_at = now() WHERE id = $1::uuid`,
  [uLogin],
);
check("4.4 Cambio de email con confirmación previa NO duplica", (await rowCount(uLogin)) === 1n);

// Un usuario ya confirmado que vuelve a NULL y se reconfirma: sigue siendo 1
// fila porque la PK es user_id (garantía estructural).
await client.queryArray(
  `UPDATE auth.users SET email_confirmed_at = NULL WHERE id = $1::uuid`,
  [uLogin],
);
await confirm(uLogin);
check(
  "4.5 Incluso des-confirmando y reconfirmando sigue habiendo 1 sola fila (PK=user_id)",
  (await rowCount(uLogin)) === 1n,
);

// ═════════════════════════════════════════════════════════════════════════════
console.log("\n── GRUPO 5 · Idempotencia y concurrencia ──");
// ═════════════════════════════════════════════════════════════════════════════

const uIdem = await newUser({ account_type: "worker", lang: "it" });
await confirm(uIdem);

const results: string[] = [];
for (let i = 0; i < 10; i++) {
  results.push(
    await one<string>(`SELECT public.app_14da0f1941_enqueue_welcome_email($1, 'sweep')`, [uIdem]),
  );
}
check(
  "5.1 10 encolados repetidos → todos 'duplicate', 1 sola fila",
  results.every((r) => r === "duplicate") && (await rowCount(uIdem)) === 1n,
  results,
);

// Concurrencia real: N conexiones simultáneas encolando el mismo usuario.
const uRace = await newUser({ account_type: "company", lang: "pt" });
await client.queryArray(
  `UPDATE auth.users SET email_confirmed_at = now() WHERE id = $1::uuid`,
  [uRace],
);
await client.queryArray(`DELETE FROM public.app_14da0f1941_welcome_emails WHERE user_id = $1::uuid`, [
  uRace,
]);

const racers = Array.from({ length: 8 }, () =>
  new Client({
    user: "postgres",
    database: "postgres",
    hostname: "127.0.0.1",
    port: 55432,
    tls: { enabled: false },
  })
);
await Promise.all(racers.map((c) => c.connect()));
const raceOut = await Promise.all(
  racers.map((c) =>
    c.queryArray(`SELECT public.app_14da0f1941_enqueue_welcome_email($1, 'sweep')`, [uRace])
      .then((r) => r.rows[0][0] as string)
      .catch((e) => `ERR:${e.message}`)
  ),
);
const enqueued = raceOut.filter((r) => r === "enqueued").length;
const dups = raceOut.filter((r) => r === "duplicate").length;
check(
  "5.2 8 encolados CONCURRENTES → exactamente 1 'enqueued' y 7 'duplicate'",
  enqueued === 1 && dups === 7 && (await rowCount(uRace)) === 1n,
  { enqueued, dups, raceOut },
);

// Claim concurrente: sólo uno puede reclamar.
const claimOut = await Promise.all(
  racers.map((c) =>
    c.queryObject(`SELECT * FROM public.app_14da0f1941_claim_welcome_email($1::uuid, 3, 120)`, [uRace])
      .then((r) => (r.rows[0] as { claimed: boolean }).claimed)
      .catch(() => null)
  ),
);
check(
  "5.3 8 claims CONCURRENTES → exactamente 1 gana el lease",
  claimOut.filter((c) => c === true).length === 1,
  claimOut,
);
await Promise.all(racers.map((c) => c.end()));

// ═════════════════════════════════════════════════════════════════════════════
console.log("\n── GRUPO 6 · Claim / fase / finalize y reintentos ──");
// ═════════════════════════════════════════════════════════════════════════════

const uFlow = await newUser({ account_type: "worker", lang: "ro" });
await confirm(uFlow);

type ClaimRow = {
  claimed: boolean;
  state: string | null;
  attempts: number;
  reason: string;
  claim_id: string | null;
  delivery_phase: string | null;
  account_type: string | null;
  lang: string | null;
};
const claim1 = (await client.queryObject<ClaimRow>(
  `SELECT * FROM public.app_14da0f1941_claim_welcome_email($1::uuid, 3, 120)`,
  [uFlow],
)).rows[0];
check("6.1 Primer claim concedido con fase pre_send", claim1.claimed && claim1.delivery_phase === "pre_send");
check("6.2 El claim devuelve account_type y lang para el render", claim1.account_type === "worker" && claim1.lang === "ro");

const claim2 = (await client.queryObject<ClaimRow>(
  `SELECT * FROM public.app_14da0f1941_claim_welcome_email($1::uuid, 3, 120)`,
  [uFlow],
)).rows[0];
check("6.3 Segundo claim con lease vivo se rechaza (in_progress_elsewhere)", !claim2.claimed && claim2.reason === "in_progress_elsewhere", claim2.reason);

await client.queryArray(
  `SELECT public.app_14da0f1941_mark_welcome_email_phase($1::uuid, $2::uuid, 'send_started')`,
  [uFlow, claim1.claim_id],
);
const fin = (await client.queryObject<{ finalized: boolean; state: string }>(
  `SELECT * FROM public.app_14da0f1941_finalize_welcome_email($1::uuid, $2::uuid, 'sent', 'msg-1', NULL, 'worker', 'ro')`,
  [uFlow, claim1.claim_id],
)).rows[0];
check("6.4 Finalize 'sent' consolida el estado", fin.finalized && fin.state === "sent");

const claim3 = (await client.queryObject<ClaimRow>(
  `SELECT * FROM public.app_14da0f1941_claim_welcome_email($1::uuid, 3, 120)`,
  [uFlow],
)).rows[0];
check("6.5 Tras 'sent' NINGÚN claim posterior es posible (already_sent)", !claim3.claimed && claim3.reason === "already_sent", claim3.reason);
check(
  "6.6 Un reintento del drenador sobre un enviado no reenvía (sigue sent, 1 fila)",
  (await one<string>(
    `SELECT state FROM public.app_14da0f1941_welcome_emails WHERE user_id = $1::uuid`,
    [uFlow],
  )) === "sent" && (await rowCount(uFlow)) === 1n,
);
check(
  "6.7 Finalize con claim_id ajeno es rechazado",
  (await client.queryObject<{ finalized: boolean; reason: string }>(
    `SELECT * FROM public.app_14da0f1941_finalize_welcome_email($1::uuid, gen_random_uuid(), 'sent', 'x', NULL, NULL, NULL)`,
    [uFlow],
  )).rows[0].reason === "claim_not_found_or_not_claimed",
);

// ═════════════════════════════════════════════════════════════════════════════
console.log("\n── GRUPO 7 · Fallo SMTP, reintentos y lease caducado ──");
// ═════════════════════════════════════════════════════════════════════════════

const uSmtp = await newUser({ account_type: "worker", lang: "uk" });
await confirm(uSmtp);

// Tres fallos SMTP consecutivos → se agota el presupuesto de intentos.
for (let i = 1; i <= 3; i++) {
  const c = (await client.queryObject<ClaimRow>(
    `SELECT * FROM public.app_14da0f1941_claim_welcome_email($1::uuid, 3, 120)`,
    [uSmtp],
  )).rows[0];
  if (!c.claimed) break;
  await client.queryArray(
    `SELECT public.app_14da0f1941_finalize_welcome_email($1::uuid, $2::uuid, 'failed', NULL, 'smtp_timeout', NULL, NULL)`,
    [uSmtp, c.claim_id],
  );
}
check(
  "7.1 Tras 3 fallos SMTP el estado es 'failed' con attempts=3",
  (await one<string>(
    `SELECT state || '/' || attempts FROM public.app_14da0f1941_welcome_emails WHERE user_id = $1::uuid`,
    [uSmtp],
  )) === "failed/3",
  await one<string>(
    `SELECT state || '/' || attempts FROM public.app_14da0f1941_welcome_emails WHERE user_id = $1::uuid`,
    [uSmtp],
  ),
);
const claimExhausted = (await client.queryObject<ClaimRow>(
  `SELECT * FROM public.app_14da0f1941_claim_welcome_email($1::uuid, 3, 120)`,
  [uSmtp],
)).rows[0];
check("7.2 Agotados los intentos no se reclama más (max_attempts_exhausted)", !claimExhausted.claimed && claimExhausted.reason === "max_attempts_exhausted", claimExhausted.reason);
check(
  "7.3 El fallido agotado no aparece como drenable",
  (await one<bigint>(
    `SELECT count(*) FROM public.app_14da0f1941_list_pending_welcome_emails(100, 3) WHERE user_id = $1::uuid`,
    [uSmtp],
  )) === 0n,
);

// Lease caducado en pre_send → recuperable (no se transmitió nada).
const uPre = await newUser({ account_type: "worker", lang: "bg" });
await confirm(uPre);
const cPre = (await client.queryObject<ClaimRow>(
  `SELECT * FROM public.app_14da0f1941_claim_welcome_email($1::uuid, 3, 120)`,
  [uPre],
)).rows[0];
await client.queryArray(
  `UPDATE public.app_14da0f1941_welcome_emails SET lease_expires_at = now() - interval '1 hour' WHERE user_id = $1::uuid`,
  [uPre],
);
const cPre2 = (await client.queryObject<ClaimRow>(
  `SELECT * FROM public.app_14da0f1941_claim_welcome_email($1::uuid, 3, 120)`,
  [uPre],
)).rows[0];
check("7.4 Lease caducado en pre_send SÍ es recuperable (no hubo transmisión)", cPre2.claimed && cPre2.attempts === 2, cPre2);
void cPre;

// Lease caducado tras send_started → 'ambiguous', nunca reenvío.
const uAmb = await newUser({ account_type: "company", lang: "es" });
await confirm(uAmb);
const cAmb = (await client.queryObject<ClaimRow>(
  `SELECT * FROM public.app_14da0f1941_claim_welcome_email($1::uuid, 3, 120)`,
  [uAmb],
)).rows[0];
await client.queryArray(
  `SELECT public.app_14da0f1941_mark_welcome_email_phase($1::uuid, $2::uuid, 'send_started')`,
  [uAmb, cAmb.claim_id],
);
await client.queryArray(
  `UPDATE public.app_14da0f1941_welcome_emails SET lease_expires_at = now() - interval '1 hour' WHERE user_id = $1::uuid`,
  [uAmb],
);
const cAmb2 = (await client.queryObject<ClaimRow>(
  `SELECT * FROM public.app_14da0f1941_claim_welcome_email($1::uuid, 3, 120)`,
  [uAmb],
)).rows[0];
check(
  "7.5 Lease caducado tras send_started → 'ambiguous' y NO reenvío",
  !cAmb2.claimed && cAmb2.reason === "ambiguous_requires_manual_review",
  cAmb2.reason,
);
check(
  "7.6 Un 'ambiguous' nunca vuelve a la cola drenable",
  (await one<bigint>(
    `SELECT count(*) FROM public.app_14da0f1941_list_pending_welcome_emails(100, 3) WHERE user_id = $1::uuid`,
    [uAmb],
  )) === 0n,
);

// ═════════════════════════════════════════════════════════════════════════════
console.log("\n── GRUPO 8 · Gate RPC self-healing y autorización ──");
// ═════════════════════════════════════════════════════════════════════════════

const uGate = await newUser({ account_type: "worker", lang: "es" });
await confirm(uGate);
await client.queryArray(`DELETE FROM public.app_14da0f1941_welcome_emails WHERE user_id = $1::uuid`, [uGate]);

await client.queryArray(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uGate]);
check(
  "8.1 El gate RPC recupera la fila perdida del propio usuario",
  (await one<string>(`SELECT public.app_14da0f1941_request_welcome_email()`)) === "enqueued",
);
check(
  "8.2 Llamarlo de nuevo es idempotente ('duplicate')",
  (await one<string>(`SELECT public.app_14da0f1941_request_welcome_email()`)) === "duplicate",
);

// Sin sesión no se puede encolar.
await client.queryArray(`SELECT set_config('request.jwt.claim.sub', '', false)`);
check(
  "8.3 Sin sesión el gate RPC devuelve 'unauthenticated'",
  (await one<string>(`SELECT public.app_14da0f1941_request_welcome_email()`)) === "unauthenticated",
);

// Un usuario NO confirmado no puede forzar su bienvenida.
const uUnconf = await newUser({ account_type: "worker", lang: "es" });
await client.queryArray(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uUnconf]);
check(
  "8.4 Un usuario sin confirmar no puede forzar el correo ('not_confirmed')",
  (await one<string>(`SELECT public.app_14da0f1941_request_welcome_email()`)) === "not_confirmed",
);
check("8.5 …y no se ha creado fila alguna", (await rowCount(uUnconf)) === 0n);
await client.queryArray(`SELECT set_config('request.jwt.claim.sub', '', false)`);

check(
  "8.6 El gate RPC no acepta parámetros (imposible actuar sobre terceros)",
  (await one<bigint>(
    `SELECT count(*) FROM pg_proc WHERE proname = 'app_14da0f1941_request_welcome_email' AND pronargs = 0`,
  )) === 1n,
);

// ═════════════════════════════════════════════════════════════════════════════
console.log("\n── GRUPO 9 · Permisos, RLS y aislamiento ──");
// ═════════════════════════════════════════════════════════════════════════════

for (const tbl of [
  "app_14da0f1941_welcome_emails",
  "app_14da0f1941_welcome_email_config",
  "app_14da0f1941_welcome_email_events",
]) {
  check(
    `9.1 RLS habilitada en ${tbl}`,
    (await one<boolean>(`SELECT relrowsecurity FROM pg_class WHERE relname = $1`, [tbl])) === true,
  );
  check(
    `9.2 ${tbl} sin políticas para anon/authenticated`,
    (await one<bigint>(`SELECT count(*) FROM pg_policies WHERE tablename = $1`, [tbl])) === 0n,
  );
  for (const role of ["anon", "authenticated"]) {
    check(
      `9.3 ${role} NO tiene SELECT sobre ${tbl}`,
      (await one<boolean>(`SELECT has_table_privilege($1, $2, 'SELECT')`, [role, `public.${tbl}`])) === false,
    );
  }
}

for (const fn of [
  "app_14da0f1941_enqueue_welcome_email(text, text)",
  "app_14da0f1941_claim_welcome_email(uuid, integer, integer)",
  "app_14da0f1941_finalize_welcome_email(uuid, uuid, text, text, text, text, text)",
  "app_14da0f1941_set_welcome_email_enabled(boolean, text)",
  "app_14da0f1941_list_pending_welcome_emails(integer, integer)",
  "app_14da0f1941_log_welcome_email_event(text, text, text, text, text)",
  "app_14da0f1941_recover_missing_welcome_emails(integer)",
]) {
  for (const role of ["anon", "authenticated"]) {
    check(
      `9.4 ${role} NO puede ejecutar ${fn.split("(")[0]}`,
      (await one<boolean>(`SELECT has_function_privilege($1, $2, 'EXECUTE')`, [role, `public.${fn}`])) === false,
    );
  }
  check(
    `9.5 service_role SÍ puede ejecutar ${fn.split("(")[0]}`,
    (await one<boolean>(`SELECT has_function_privilege('service_role', $1, 'EXECUTE')`, [`public.${fn}`])) === true,
  );
}

check(
  "9.6 Todas las funciones del flujo fijan search_path (anti-hijacking)",
  (await one<bigint>(
    `SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'app_14da0f1941_%welcome%'
        AND p.prosecdef = true
        AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')`,
  )) === 0n,
);

check(
  "9.7 La migración NO toca tablas de Marketplace Ready / recovery",
  !/marketplace_ready_activations|job_application_profile_pending_emails|recovery_/.test(
    migration.replace(/^\s*--.*$/gm, ""),
  ),
);

check(
  "9.8 Existe exactamente 1 trigger propio sobre auth.users",
  (await one<bigint>(
    `SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'auth' AND c.relname = 'users' AND NOT t.tgisinternal
        AND t.tgname = 'app_14da0f1941_auth_users_welcome_email'`,
  )) === 1n,
);

// ═════════════════════════════════════════════════════════════════════════════
console.log("\n── GRUPO 10 · Telemetría sin PII y métricas ──");
// ═════════════════════════════════════════════════════════════════════════════

const eventCols = await client.queryArray<[string]>(
  `SELECT column_name FROM information_schema.columns
    WHERE table_name = 'app_14da0f1941_welcome_email_events' ORDER BY 1`,
);
const cols = eventCols.rows.map((r) => r[0]);
check(
  "10.1 La tabla de telemetría NO tiene columnas con PII (user_id/email/name/phone)",
  !cols.some((c) => /user_id|email_address|^email$|name|phone|ip/.test(c)),
  cols,
);
check(
  "10.2 Se registran eventos agregados de encolado",
  (await one<bigint>(
    `SELECT count(*) FROM public.app_14da0f1941_welcome_email_events WHERE event = 'enqueued'`,
  )) > 0n,
);
check(
  "10.3 Se registran eventos de resultado de entrega",
  (await one<bigint>(
    `SELECT count(*) FROM public.app_14da0f1941_welcome_email_events WHERE event LIKE 'delivery_%'`,
  )) > 0n,
);
check(
  "10.4 La vista de embudo es consultable y no expone user_id",
  (await one<bigint>(`SELECT count(*) FROM public.app_14da0f1941_welcome_email_funnel`)) >= 0n &&
    !(await client.queryArray<[string]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'app_14da0f1941_welcome_email_funnel'`,
    )).rows.map((r) => r[0]).includes("user_id"),
);

// ═════════════════════════════════════════════════════════════════════════════
console.log("\n── GRUPO 11 · Rollback inmediato ──");
// ═════════════════════════════════════════════════════════════════════════════

const sentBefore = await one<bigint>(
  `SELECT count(*) FROM public.app_14da0f1941_welcome_emails WHERE state = 'sent'`,
);
await setEnabled(false);
check(
  "11.1 Desactivar deja enabled=false al instante",
  (await one<boolean>(`SELECT enabled FROM public.app_14da0f1941_welcome_email_config`)) === false,
);

const uAfterOff = await newUser({ account_type: "worker", lang: "es" });
await confirm(uAfterOff);
check("11.2 Tras el rollback, una confirmación nueva NO encola", (await rowCount(uAfterOff)) === 0n);
check(
  "11.3 El rollback conserva la evidencia de lo ya enviado",
  (await one<bigint>(
    `SELECT count(*) FROM public.app_14da0f1941_welcome_emails WHERE state = 'sent'`,
  )) === sentBefore,
);
check(
  "11.4 Reactivar mueve el suelo y NO recupera el backlog de la ventana OFF",
  await (async () => {
    await setEnabled(true);
    return (await rowCount(uAfterOff)) === 0n &&
      (await one<string>(`SELECT public.app_14da0f1941_enqueue_welcome_email($1, 'sweep')`, [uAfterOff])) ===
        "before_floor";
  })(),
);

console.log("\n── GRUPO 12 · Corte, reactivación, fencing y sweep sin pestaña ──");
const uCut = await newUser({ account_type: "company", lang: "es" });
await confirm(uCut);
const cutClaim = (await client.queryObject<ClaimRow>(
  `SELECT * FROM public.app_14da0f1941_claim_welcome_email($1::uuid, 3, 120)`, [uCut],
)).rows[0];
await setEnabled(false);
check("12.1 mark con flag OFF rechaza transmisión", !(await client.queryObject<{ marked: boolean }>(
  `SELECT * FROM public.app_14da0f1941_mark_welcome_email_phase($1::uuid,$2::uuid,'send_started')`,
  [uCut, cutClaim.claim_id],
)).rows[0].marked);
check("12.2 claim y listado con flag OFF no seleccionan pendientes/claims previos",
  !(await client.queryObject<ClaimRow>(`SELECT * FROM public.app_14da0f1941_claim_welcome_email($1::uuid,3,120)`, [uCut])).rows[0].claimed &&
  (await one<bigint>(`SELECT count(*) FROM public.app_14da0f1941_list_pending_welcome_emails(200,3) WHERE user_id=$1::uuid`, [uCut])) === 0n);
await setEnabled(true);
check("12.3 la reactivación no selecciona claims ni pendientes de la época anterior",
  !(await client.queryObject<ClaimRow>(`SELECT * FROM public.app_14da0f1941_claim_welcome_email($1::uuid,3,120)`, [uCut])).rows[0].claimed &&
  (await one<bigint>(`SELECT count(*) FROM public.app_14da0f1941_list_pending_welcome_emails(200,3) WHERE user_id=$1::uuid`, [uCut])) === 0n &&
  !(await client.queryObject<{ marked: boolean }>(`SELECT * FROM public.app_14da0f1941_mark_welcome_email_phase($1::uuid,$2::uuid,'send_started')`, [uCut, cutClaim.claim_id])).rows[0].marked);

const uPhase = await newUser({ account_type: "company", lang: "es" });
await confirm(uPhase);
const phaseClaim = (await client.queryObject<ClaimRow>(`SELECT * FROM public.app_14da0f1941_claim_welcome_email($1::uuid,3,120)`, [uPhase])).rows[0];
check("12.4 no se puede finalizar sent sin mark", !(await client.queryObject<{ finalized: boolean }>(
  `SELECT * FROM public.app_14da0f1941_finalize_welcome_email($1::uuid,$2::uuid,'sent')`,
  [uPhase, phaseClaim.claim_id],
)).rows[0].finalized);
check("12.5 no se permite retroceder send_started a pre_send", !(await client.queryObject<{ marked: boolean }>(
  `SELECT * FROM public.app_14da0f1941_mark_welcome_email_phase($1::uuid,$2::uuid,'pre_send')`,
  [uPhase, phaseClaim.claim_id],
)).rows[0].marked);
await client.queryArray(`SELECT public.app_14da0f1941_mark_welcome_email_phase($1::uuid,$2::uuid,'send_started')`, [uPhase, phaseClaim.claim_id]);
check("12.6 timeout tras send_started no puede terminar failed/reintentable", !(await client.queryObject<{ finalized: boolean }>(
  `SELECT * FROM public.app_14da0f1941_finalize_welcome_email($1::uuid,$2::uuid,'failed',NULL,'smtp_timeout')`,
  [uPhase, phaseClaim.claim_id],
)).rows[0].finalized);
check("12.7 sin tipo resuelto, conserva company previamente encolado", (await (async () => {
  await client.queryArray(`SELECT public.app_14da0f1941_finalize_welcome_email($1::uuid,$2::uuid,'ambiguous',NULL,'smtp_timeout',NULL,NULL)`, [uPhase, phaseClaim.claim_id]);
  return one<string>(`SELECT account_type FROM public.app_14da0f1941_welcome_emails WHERE user_id=$1::uuid`, [uPhase]);
})()) === "company");

const uExpired = await newUser({ account_type: "worker" });
await confirm(uExpired);
const expClaim = (await client.queryObject<ClaimRow>(`SELECT * FROM public.app_14da0f1941_claim_welcome_email($1::uuid,1,120)`, [uExpired])).rows[0];
await client.queryArray(`SELECT public.app_14da0f1941_mark_welcome_email_phase($1::uuid,$2::uuid,'send_started')`, [uExpired, expClaim.claim_id]);
await client.queryArray(`UPDATE public.app_14da0f1941_welcome_emails SET lease_expires_at=now()-interval '1 hour' WHERE user_id=$1::uuid`, [uExpired]);
await setEnabled(false);
await client.queryArray(`SELECT * FROM public.app_14da0f1941_list_pending_welcome_emails(1,1)`);
check("12.8 sweep mantiene send_started vencidos aun apagado y con max attempts",
  (await one<string>(`SELECT state FROM public.app_14da0f1941_welcome_emails WHERE user_id=$1::uuid`, [uExpired])) === "ambiguous");
await setEnabled(true);
const uLost = await newUser({ account_type: "worker", lang: "en" });
await confirm(uLost);
await client.queryArray(`DELETE FROM public.app_14da0f1941_welcome_emails WHERE user_id=$1::uuid`, [uLost]);
check("12.9 confirmación nueva + cierre de pestaña: cron recupera fila sin sesión",
  (await one<number>(`SELECT public.app_14da0f1941_recover_missing_welcome_emails(200)`)) === 1 &&
  (await one<string>(`SELECT state FROM public.app_14da0f1941_welcome_emails WHERE user_id=$1::uuid`, [uLost])) === "pending");
check("12.10 recuperación es idempotente", (await one<number>(`SELECT public.app_14da0f1941_recover_missing_welcome_emails(200)`)) === 0);
const lostClaim = (await client.queryObject<ClaimRow>(`SELECT * FROM public.app_14da0f1941_claim_welcome_email($1::uuid,3,120)`, [uLost])).rows[0];
const lostMark = (await client.queryObject<{ marked: boolean }>(`SELECT * FROM public.app_14da0f1941_mark_welcome_email_phase($1::uuid,$2::uuid,'send_started')`, [uLost,lostClaim.claim_id])).rows[0];
const lostFinish = (await client.queryObject<{ finalized: boolean; state: string }>(`SELECT * FROM public.app_14da0f1941_finalize_welcome_email($1::uuid,$2::uuid,'sent','capture:test')`, [uLost,lostClaim.claim_id])).rows[0];
check("12.11 recorrido automático recuperado → claim → mark → sent registrado", lostClaim.claimed && lostMark.marked && lostFinish.finalized && lostFinish.state === "sent");
await client.queryArray(`SELECT public.app_14da0f1941_log_welcome_email_event('delivery_failed','company','es','sweep','pii@example.test')`);
check("12.12 el logger no persiste texto libre del proveedor", (await one<bigint>(
  `SELECT count(*) FROM public.app_14da0f1941_welcome_email_events WHERE detail LIKE '%@%'`,
)) === 0n);

console.log("\n── GRUPO 13 · Cron: Vault y autorización en PostgreSQL ──");
await client.queryArray(`
CREATE SCHEMA IF NOT EXISTS vault;
CREATE TABLE IF NOT EXISTS vault.secrets (name text PRIMARY KEY, value text NOT NULL);
CREATE OR REPLACE VIEW vault.decrypted_secrets AS SELECT name, value AS decrypted_secret FROM vault.secrets;
CREATE OR REPLACE FUNCTION vault.create_secret(p_value text, p_name text, p_description text)
RETURNS uuid LANGUAGE plpgsql AS $$ BEGIN
  INSERT INTO vault.secrets(name,value) VALUES (p_name,p_value);
  RETURN gen_random_uuid();
END $$;
CREATE SCHEMA IF NOT EXISTS cron;
CREATE TABLE IF NOT EXISTS cron.job (jobname text PRIMARY KEY, schedule text NOT NULL, command text NOT NULL);
CREATE OR REPLACE FUNCTION cron.schedule(p_name text, p_schedule text, p_command text)
RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN
  INSERT INTO cron.job VALUES(p_name,p_schedule,p_command);
  RETURN 1;
END $$;
CREATE OR REPLACE FUNCTION cron.unschedule(p_name text)
RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN
  DELETE FROM cron.job WHERE jobname=p_name;
  RETURN true;
END $$;
`);
const cronSql = await Deno.readTextFile(new URL("../sql/047-pb-welcome-email-cron.sql", import.meta.url));
await client.queryArray(cronSql);
await client.queryArray(cronSql);
check("13.1 cron idempotente, sólo un job autenticado con Vault", (await one<bigint>(
  `SELECT count(*) FROM cron.job WHERE jobname='pb-welcome-email' AND command LIKE '%X-Cron-Key%'
   AND command LIKE '%vault.decrypted_secrets%' AND schedule='* * * * *'`,
)) === 1n);
check("13.2 verificador rechaza clave inválida", (await one<boolean>(
  `SELECT public.app_14da0f1941_verify_welcome_cron_key('invalid')`,
)) === false);
check("13.3 verificador admite únicamente la clave almacenada en Vault", (await one<boolean>(
  `SELECT public.app_14da0f1941_verify_welcome_cron_key((SELECT value FROM vault.secrets WHERE name='welcome-email-cron-key'))`,
)) === true);
check("13.4 verificador sólo ejecutable por service_role", (await one<boolean>(
  `SELECT has_function_privilege('service_role','public.app_14da0f1941_verify_welcome_cron_key(text)','EXECUTE')`,
)) === true && (await one<boolean>(
  `SELECT has_function_privilege('authenticated','public.app_14da0f1941_verify_welcome_cron_key(text)','EXECUTE')`,
)) === false);

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(70)}`);
console.log(`RESULTADO QA SQL: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) {
  console.log("\nFallos:");
  for (const f of failures) console.log(`  - ${f}`);
}
console.log("═".repeat(70));

await client.end();
if (fail > 0) Deno.exit(1);
