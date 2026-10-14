import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test';

/**
 * PB-I18N-EMAIL-001 (rev.7) — matriz QA versionada del reclamo atómico de
 * notificación de candidatura (sql/030):
 *   · app_14da0f1941_claim_job_application_notification
 *   · app_14da0f1941_finalize_job_application_notification
 *
 * Cubre: idempotencia, duplicados, concurrencia real, reintentos, expiración
 * del lease, estado 'ambiguous' terminal, agotamiento de intentos, finalize
 * inválido, truncado de last_error y superficie de seguridad (RLS + ACL).
 *
 * Todas las filas son sintéticas y se eliminan al final (limpieza 0 residuales).
 * No envía correo: solo ejerce las RPCs de PostgreSQL.
 *
 * Requiere:
 *   QA_JOBAPP_CLAIM=1
 *   QA_SUPABASE_URL / QA_SUPABASE_ANON_KEY / QA_SUPABASE_SERVICE_KEY
 */

const QA_REF = 'uqfbilyfpflrlthnyijj';
const TABLE = 'app_14da0f1941_';
const CLAIM = 'app_14da0f1941_claim_job_application_notification';
const FINALIZE = 'app_14da0f1941_finalize_job_application_notification';
const NOTIF_TABLE = `${TABLE}job_application_notifications`;
const APPS_TABLE = `${TABLE}job_applications`;

const SUPABASE_URL = process.env.QA_SUPABASE_URL ?? `https://${QA_REF}.supabase.co`;
const ANON_KEY = process.env.QA_SUPABASE_ANON_KEY ?? '';
const SERVICE_KEY = process.env.QA_SUPABASE_SERVICE_KEY ?? '';

let anon: APIRequestContext;
let service: APIRequestContext;
const createdApplicationIds: string[] = [];

interface ClaimResult {
  claimed: boolean;
  state: string | null;
  attempts: number;
  reason: string;
}

async function rpcClaim(client: APIRequestContext, applicationId: string | null, opts?: { maxAttempts?: number; leaseSeconds?: number }) {
  const res = await client.post(`/rest/v1/rpc/${CLAIM}`, {
    data: {
      p_application_id: applicationId,
      ...(opts?.maxAttempts !== undefined ? { p_max_attempts: opts.maxAttempts } : {}),
      ...(opts?.leaseSeconds !== undefined ? { p_lease_seconds: opts.leaseSeconds } : {}),
    },
  });
  return { status: res.status(), body: (await res.json().catch(() => null)) as ClaimResult[] | null };
}

async function rpcFinalize(applicationId: string, state: string, opts?: { messageId?: string; lastError?: string }) {
  const res = await service.post(`/rest/v1/rpc/${FINALIZE}`, {
    data: {
      p_application_id: applicationId,
      p_state: state,
      ...(opts?.messageId !== undefined ? { p_message_id: opts.messageId } : {}),
      ...(opts?.lastError !== undefined ? { p_last_error: opts.lastError } : {}),
    },
  });
  return { status: res.status(), body: await res.json().catch(() => null) };
}

async function createApplication(tag: string) {
  const res = await service.post(`/rest/v1/${APPS_TABLE}`, {
    data: {
      user_id: crypto.randomUUID(),
      job_title: `pb-claim-${tag}`,
      company_name: 'PB Synthetic QA',
      status: 'applied',
    },
    headers: { Prefer: 'return=representation' },
  });
  expect([200, 201], `create synthetic application (${tag})`).toContain(res.status());
  const [row] = await res.json();
  createdApplicationIds.push(row.id);
  return row.id as string;
}

async function notificationRow(applicationId: string) {
  const res = await service.get(`/rest/v1/${NOTIF_TABLE}?select=*&application_id=eq.${applicationId}`);
  const rows = await res.json();
  return rows[0] as
    | { state: string; attempts: number; sent_at: string | null; message_id: string | null; last_error: string | null }
    | undefined;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test.describe('PB-I18N-EMAIL-001 rev.7 — reclamo atómico de notificación de candidatura (sql/030)', () => {
  test.skip(process.env.QA_JOBAPP_CLAIM !== '1', 'QA_JOBAPP_CLAIM=1 requerido');

  test.beforeAll(async () => {
    expect(SERVICE_KEY, 'QA_SUPABASE_SERVICE_KEY requerida').toBeTruthy();
    expect(ANON_KEY, 'QA_SUPABASE_ANON_KEY requerida').toBeTruthy();
    const base = { baseURL: SUPABASE_URL };
    anon = await pwRequest.newContext({ ...base, extraHTTPHeaders: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } });
    service = await pwRequest.newContext({ ...base, extraHTTPHeaders: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  });

  test.afterAll(async () => {
    // Limpieza: filas de notificación primero (FK CASCADE también cubre, pero
    // se hace explícito para no depender del orden) y luego las candidaturas.
    for (const id of createdApplicationIds) {
      await service.delete(`/rest/v1/${NOTIF_TABLE}?application_id=eq.${id}`).catch(() => undefined);
      await service.delete(`/rest/v1/${APPS_TABLE}?id=eq.${id}`).catch(() => undefined);
    }
    await anon.dispose();
    await service.dispose();
  });

  test('seguridad: anon no puede invocar las RPCs ni tocar la tabla (RLS + ACL)', async () => {
    const appId = await createApplication('security');

    const rpc = await rpcClaim(anon, appId);
    expect(rpc.status, 'claim RPC debe denegar a anon').toBeGreaterThanOrEqual(400);

    const rpcF = await anon.post(`/rest/v1/rpc/${FINALIZE}`, { data: { p_application_id: appId, p_state: 'sent' } });
    expect(rpcF.status(), 'finalize RPC debe denegar a anon').toBeGreaterThanOrEqual(400);

    const sel = await anon.get(`/rest/v1/${NOTIF_TABLE}?select=*`);
    expect(sel.status(), 'SELECT directo debe denegar a anon').toBeGreaterThanOrEqual(400);

    const ins = await anon.post(`/rest/v1/${NOTIF_TABLE}`, { data: { application_id: appId, state: 'sent', lease_expires_at: new Date().toISOString() } });
    expect(ins.status(), 'INSERT directo debe denegar a anon').toBeGreaterThanOrEqual(400);

    expect(await notificationRow(appId), 'ninguna fila creada por anon').toBeUndefined();
  });

  test('validación de entrada: application_id nulo y candidatura inexistente', async () => {
    const nullRes = await rpcClaim(service, null);
    expect(nullRes.status).toBe(200);
    expect(nullRes.body?.[0]).toMatchObject({ claimed: false, attempts: 0, reason: 'missing_application_id' });

    const unknownRes = await rpcClaim(service, crypto.randomUUID());
    expect(unknownRes.status).toBe(200);
    expect(unknownRes.body?.[0]).toMatchObject({ claimed: false, attempts: 0, reason: 'unknown_application' });
  });

  test('flujo feliz + duplicados: sent es terminal y no se vuelve a reclamar jamás', async () => {
    const appId = await createApplication('happy');

    const first = await rpcClaim(service, appId);
    expect(first.body?.[0]).toMatchObject({ claimed: true, state: 'claimed', attempts: 1, reason: 'claimed' });

    const fin = await rpcFinalize(appId, 'sent', { messageId: 'msg-synthetic-001' });
    expect(fin.status).toBe(200);
    expect(fin.body?.[0]).toMatchObject({ finalized: true, state: 'sent', attempts: 1 });

    // Reintento inmediato y otro más tarde: nunca se reclama de nuevo.
    for (let i = 0; i < 2; i++) {
      const again = await rpcClaim(service, appId);
      expect(again.body?.[0]).toMatchObject({ claimed: false, state: 'sent', attempts: 1, reason: 'already_sent' });
      if (i === 0) await sleep(300);
    }

    const row = await notificationRow(appId);
    expect(row?.state).toBe('sent');
    expect(row?.attempts).toBe(1);
    expect(row?.message_id).toBe('msg-synthetic-001');
    expect(row?.sent_at).toBeTruthy();

    // Un finalize posterior no puede degradar un 'sent' confirmado.
    const degrade = await rpcFinalize(appId, 'failed', { lastError: 'late failure' });
    expect(degrade.body?.[0]).toMatchObject({ finalized: false, state: 'sent', attempts: 1 });
    expect((await notificationRow(appId))?.state).toBe('sent');
  });

  test('concurrencia real: N reclamos simultáneos → exactamente 1 gana', async () => {
    const appId = await createApplication('concurrency');

    const N = 8;
    const results = await Promise.all(Array.from({ length: N }, () => rpcClaim(service, appId)));
    const winners = results.filter((r) => r.status === 200 && r.body?.[0]?.claimed === true);
    const losers = results.filter((r) => r.status === 200 && r.body?.[0]?.claimed === false);

    expect(winners, 'exactamente un ganador').toHaveLength(1);
    expect(winners[0].body?.[0]).toMatchObject({ attempts: 1, reason: 'claimed' });
    expect(losers).toHaveLength(N - 1);
    for (const loser of losers) {
      expect(loser.body?.[0]?.reason).toBe('in_progress_elsewhere');
      expect(loser.body?.[0]?.attempts).toBe(1);
    }

    const row = await notificationRow(appId);
    expect(row?.attempts).toBe(1);
    expect(row?.state).toBe('claimed');
  });

  test('reintentos: failed es reclamable y acumula intentos', async () => {
    const appId = await createApplication('retry');

    await rpcClaim(service, appId);
    const fail1 = await rpcFinalize(appId, 'failed', { lastError: 'smtp timeout (sintético)' });
    expect(fail1.body?.[0]).toMatchObject({ finalized: true, state: 'failed', attempts: 1 });

    const retry = await rpcClaim(service, appId);
    expect(retry.body?.[0]).toMatchObject({ claimed: true, state: 'claimed', attempts: 2, reason: 'claimed' });

    const row = await notificationRow(appId);
    expect(row?.last_error).toBeNull(); // el reclamo limpia el error anterior

    const ok = await rpcFinalize(appId, 'sent', { messageId: 'msg-synthetic-002' });
    expect(ok.body?.[0]).toMatchObject({ finalized: true, state: 'sent', attempts: 2 });

    const closed = await rpcClaim(service, appId);
    expect(closed.body?.[0]?.reason).toBe('already_sent');
  });

  test('expiración del lease: lease vivo bloquea; lease vencido permite retomar tras caída', async () => {
    const appId = await createApplication('lease');

    const first = await rpcClaim(service, appId, { leaseSeconds: 1 });
    expect(first.body?.[0]?.claimed).toBe(true);

    const tooSoon = await rpcClaim(service, appId, { leaseSeconds: 1 });
    expect(tooSoon.body?.[0]).toMatchObject({ claimed: false, state: 'claimed', attempts: 1, reason: 'in_progress_elsewhere' });

    await sleep(1600); // el lease (1 s) vence: simula un proceso muerto con el reclamo tomado

    const retaken = await rpcClaim(service, appId, { leaseSeconds: 60 });
    expect(retaken.body?.[0]).toMatchObject({ claimed: true, state: 'claimed', attempts: 2, reason: 'claimed' });
  });

  test("ambiguous es terminal: no se reintenta ni se reclama automáticamente", async () => {
    const appId = await createApplication('ambiguous');

    await rpcClaim(service, appId);
    const fin = await rpcFinalize(appId, 'ambiguous', { lastError: 'provider accepted? confirmation lost (sintético)' });
    expect(fin.body?.[0]).toMatchObject({ finalized: true, state: 'ambiguous', attempts: 1 });

    await sleep(300);
    const again = await rpcClaim(service, appId);
    expect(again.body?.[0]).toMatchObject({ claimed: false, state: 'ambiguous', attempts: 1, reason: 'ambiguous_requires_manual_review' });

    // Ni siquiera otro finalize puede moverlo: solo 'claimed' es cerrable.
    const move = await rpcFinalize(appId, 'sent', { messageId: 'msg-late' });
    expect(move.body?.[0]).toMatchObject({ finalized: false, state: 'ambiguous' });
    expect((await notificationRow(appId))?.state).toBe('ambiguous');
  });

  test('agotamiento de intentos: max_attempts bloquea nuevos reclamos', async () => {
    const appId = await createApplication('max-attempts');

    const c1 = await rpcClaim(service, appId, { maxAttempts: 2 });
    expect(c1.body?.[0]).toMatchObject({ claimed: true, attempts: 1 });
    await rpcFinalize(appId, 'failed', { lastError: 'fallo sintético 1' });

    const c2 = await rpcClaim(service, appId, { maxAttempts: 2 });
    expect(c2.body?.[0]).toMatchObject({ claimed: true, attempts: 2 });
    await rpcFinalize(appId, 'failed', { lastError: 'fallo sintético 2' });

    const c3 = await rpcClaim(service, appId, { maxAttempts: 2 });
    expect(c3.body?.[0]).toMatchObject({ claimed: false, state: 'failed', attempts: 2, reason: 'max_attempts_exhausted' });
  });

  test('finalize con estado inválido es rechazado por la RPC', async () => {
    const appId = await createApplication('invalid-finalize');
    await rpcClaim(service, appId);

    const bad = await rpcFinalize(appId, 'claimed');
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(bad.body)).toContain('invalid_finalize_state');

    // El reclamo sigue vivo y cerrable correctamente.
    const good = await rpcFinalize(appId, 'sent', { messageId: 'msg-synthetic-003' });
    expect(good.body?.[0]?.finalized).toBe(true);
  });

  test('last_error se trunca a 500 caracteres', async () => {
    const appId = await createApplication('truncate');
    await rpcClaim(service, appId);

    const longError = 'E'.repeat(600);
    await rpcFinalize(appId, 'failed', { lastError: longError });

    const row = await notificationRow(appId);
    expect(row?.last_error).toHaveLength(500);
  });
});
