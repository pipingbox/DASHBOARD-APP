import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test';

/**
 * PB-I18N-EMAIL-001 (rev.7/rev.8) — matriz QA versionada del reclamo atómico
 * de notificación de candidatura (sql/030 + 030a + 030b + 030c):
 *   · app_14da0f1941_claim_job_application_notification
 *   · app_14da0f1941_finalize_job_application_notification (fencing por claim_id)
 *
 * Cubre: idempotencia, duplicados, concurrencia real, reintentos, expiración
 * del lease, FENCING TOKEN (rev.8: finalize tardío no cierra un reclamo
 * retomado), estado 'ambiguous' terminal, agotamiento de intentos, finalize
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
const MARK_PHASE = 'app_14da0f1941_marc_job_application_notification_phase';
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
  claim_id: string | null;
  delivery_phase: string | null;
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

async function rpcFinalize(applicationId: string, claimId: string | null, state: string, opts?: { messageId?: string; lastError?: string }) {
  const res = await service.post(`/rest/v1/rpc/${FINALIZE}`, {
    data: {
      p_application_id: applicationId,
      p_claim_id: claimId,
      p_state: state,
      ...(opts?.messageId !== undefined ? { p_message_id: opts.messageId } : {}),
      ...(opts?.lastError !== undefined ? { p_last_error: opts.lastError } : {}),
    },
  });
  return { status: res.status(), body: await res.json().catch(() => null) };
}

async function rpcMarkPhase(applicationId: string, claimId: string | null, phase: string) {
  const res = await service.post(`/rest/v1/rpc/${MARK_PHASE}`, {
    data: { p_application_id: applicationId, p_claim_id: claimId, p_phase: phase },
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
    | { state: string; attempts: number; sent_at: string | null; message_id: string | null; last_error: string | null; claim_id: string; delivery_phase: string }
    | undefined;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test.describe('PB-I18N-EMAIL-001 rev.8 — reclamo atómico con fencing token (sql/030+030c)', () => {
  test.skip(process.env.QA_JOBAPP_CLAIM !== '1', 'QA_JOBAPP_CLAIM=1 requerido');

  test.beforeAll(async () => {
    expect(SERVICE_KEY, 'QA_SUPABASE_SERVICE_KEY requerida').toBeTruthy();
    expect(ANON_KEY, 'QA_SUPABASE_ANON_KEY requerida').toBeTruthy();
    const base = { baseURL: SUPABASE_URL };
    anon = await pwRequest.newContext({ ...base, extraHTTPHeaders: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } });
    service = await pwRequest.newContext({ ...base, extraHTTPHeaders: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  });

  test.afterAll(async () => {
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

    const rpcF = await anon.post(`/rest/v1/rpc/${FINALIZE}`, { data: { p_application_id: appId, p_claim_id: crypto.randomUUID(), p_state: 'sent' } });
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
    expect(nullRes.body?.[0]).toMatchObject({ claimed: false, attempts: 0, reason: 'missing_application_id', claim_id: null });

    const unknownRes = await rpcClaim(service, crypto.randomUUID());
    expect(unknownRes.status).toBe(200);
    expect(unknownRes.body?.[0]).toMatchObject({ claimed: false, attempts: 0, reason: 'unknown_application', claim_id: null });
  });

  test('flujo feliz + duplicados: sent es terminal y no se vuelve a reclamar jamás', async () => {
    const appId = await createApplication('happy');

    const first = await rpcClaim(service, appId);
    expect(first.body?.[0]).toMatchObject({ claimed: true, state: 'claimed', attempts: 1, reason: 'claimed' });
    const token = first.body?.[0]?.claim_id;
    expect(token, 'el ganador recibe el fencing token').toBeTruthy();

    const fin = await rpcFinalize(appId, token, 'sent', { messageId: 'msg-synthetic-001' });
    expect(fin.status).toBe(200);
    expect(fin.body?.[0]).toMatchObject({ finalized: true, state: 'sent', attempts: 1, reason: 'finalized' });

    // Reintento inmediato y otro más tarde: nunca se reclama de nuevo y nunca
    // se entrega el token de un intento anterior.
    for (let i = 0; i < 2; i++) {
      const again = await rpcClaim(service, appId);
      expect(again.body?.[0]).toMatchObject({ claimed: false, state: 'sent', attempts: 1, reason: 'already_sent', claim_id: null });
      if (i === 0) await sleep(300);
    }

    const row = await notificationRow(appId);
    expect(row?.state).toBe('sent');
    expect(row?.attempts).toBe(1);
    expect(row?.message_id).toBe('msg-synthetic-001');
    expect(row?.sent_at).toBeTruthy();

    // Un finalize posterior (incluso con el token original) no puede degradar
    // un 'sent' confirmado.
    const degrade = await rpcFinalize(appId, token, 'failed', { lastError: 'late failure' });
    expect(degrade.body?.[0]).toMatchObject({ finalized: false, state: 'sent', attempts: 1, reason: 'not_claimed' });
    expect((await notificationRow(appId))?.state).toBe('sent');
  });

  test('concurrencia real: N reclamos simultáneos → exactamente 1 gana y solo él ve el token', async () => {
    const appId = await createApplication('concurrency');

    const N = 8;
    const results = await Promise.all(Array.from({ length: N }, () => rpcClaim(service, appId)));
    const winners = results.filter((r) => r.status === 200 && r.body?.[0]?.claimed === true);
    const losers = results.filter((r) => r.status === 200 && r.body?.[0]?.claimed === false);

    expect(winners, 'exactamente un ganador').toHaveLength(1);
    expect(winners[0].body?.[0]).toMatchObject({ attempts: 1, reason: 'claimed' });
    expect(winners[0].body?.[0].claim_id, 'solo el ganador recibe token').toBeTruthy();
    expect(losers).toHaveLength(N - 1);
    for (const loser of losers) {
      expect(loser.body?.[0]?.reason).toBe('in_progress_elsewhere');
      expect(loser.body?.[0]?.attempts).toBe(1);
      expect(loser.body?.[0]?.claim_id, 'los perdedores nunca ven el token').toBeNull();
    }

    const row = await notificationRow(appId);
    expect(row?.attempts).toBe(1);
    expect(row?.state).toBe('claimed');
    expect(row?.claim_id).toBe(winners[0].body?.[0].claim_id);
  });

  test('FENCING (rev.8): reclamo1 → vence lease → reclamo2 → finalize tardío del 1 NO cierra el reclamo del 2', async () => {
    const appId = await createApplication('fencing');

    // Proceso 1 toma el reclamo con lease de 1 s.
    const c1 = await rpcClaim(service, appId, { leaseSeconds: 1 });
    expect(c1.body?.[0]?.claimed).toBe(true);
    const token1 = c1.body?.[0]?.claim_id as string;

    // El lease vence: el proceso 1 "muere" sin finalizar.
    await sleep(1600);

    // Proceso 2 retoma el envío: nuevo intento, NUEVO token.
    const c2 = await rpcClaim(service, appId, { leaseSeconds: 60 });
    expect(c2.body?.[0]).toMatchObject({ claimed: true, state: 'claimed', attempts: 2, reason: 'claimed' });
    const token2 = c2.body?.[0]?.claim_id as string;
    expect(token2, 'cada intento genera un token distinto').not.toBe(token1);

    // El proceso 1 despierta e intenta cerrar con su token caducado.
    const late = await rpcFinalize(appId, token1, 'failed', { lastError: 'smtp timeout (proceso lento)' });
    expect(late.status).toBe(200);
    expect(late.body?.[0]).toMatchObject({ finalized: false, state: 'claimed', attempts: 2, reason: 'fenced_out' });

    // La fila sigue intacta: pertenece al intento del proceso 2.
    const row = await notificationRow(appId);
    expect(row?.state).toBe('claimed');
    expect(row?.attempts).toBe(2);
    expect(row?.claim_id).toBe(token2);
    expect(row?.last_error).toBeNull();

    // También con el resultado más peligroso ('sent'): el finalize tardío del
    // proceso 1 no puede marcar enviado un envío que el proceso 2 realiza.
    const lateSent = await rpcFinalize(appId, token1, 'sent', { messageId: 'msg-falso' });
    expect(lateSent.body?.[0]).toMatchObject({ finalized: false, state: 'claimed', attempts: 2, reason: 'fenced_out' });
    expect((await notificationRow(appId))?.message_id).toBeNull();

    // El proceso 2 sí puede cerrar su propio intento.
    const ok = await rpcFinalize(appId, token2, 'sent', { messageId: 'msg-proceso2' });
    expect(ok.body?.[0]).toMatchObject({ finalized: true, state: 'sent', attempts: 2, reason: 'finalized' });
    expect((await notificationRow(appId))?.message_id).toBe('msg-proceso2');
  });

  test('finalize sin claim_id (NULL) jamás cierra un reclamo', async () => {
    const appId = await createApplication('no-token');
    const c = await rpcClaim(service, appId);
    expect(c.body?.[0]?.claimed).toBe(true);

    const noToken = await rpcFinalize(appId, null, 'sent', { messageId: 'msg-sin-token' });
    expect(noToken.status).toBe(200);
    expect(noToken.body?.[0]).toMatchObject({ finalized: false, state: 'claimed', reason: 'fenced_out' });

    // El reclamo sigue vivo y cerrable con el token correcto.
    const ok = await rpcFinalize(appId, c.body?.[0]?.claim_id ?? '', 'sent', { messageId: 'msg-con-token' });
    expect(ok.body?.[0]?.finalized).toBe(true);
  });

  test('reintentos: failed es reclamable y acumula intentos (cada uno con token nuevo)', async () => {
    const appId = await createApplication('retry');

    const c1 = await rpcClaim(service, appId);
    const fail1 = await rpcFinalize(appId, c1.body?.[0]?.claim_id ?? '', 'failed', { lastError: 'smtp timeout (sintético)' });
    expect(fail1.body?.[0]).toMatchObject({ finalized: true, state: 'failed', attempts: 1 });

    const c2 = await rpcClaim(service, appId);
    expect(c2.body?.[0]).toMatchObject({ claimed: true, state: 'claimed', attempts: 2, reason: 'claimed' });
    expect(c2.body?.[0]?.claim_id, 'token nuevo en el reintento').not.toBe(c1.body?.[0]?.claim_id);

    const row = await notificationRow(appId);
    expect(row?.last_error).toBeNull(); // el reclamo limpia el error anterior

    const ok = await rpcFinalize(appId, c2.body?.[0]?.claim_id ?? '', 'sent', { messageId: 'msg-synthetic-002' });
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

  test("ambiguous es terminal: no se reintenta ni se reclama automáticamente (envío con confirmación perdida)", async () => {
    const appId = await createApplication('ambiguous');

    // SMTP aceptó (o no) y se perdió la confirmación: resultado incierto.
    const c = await rpcClaim(service, appId);
    const fin = await rpcFinalize(appId, c.body?.[0]?.claim_id ?? '', 'ambiguous', { lastError: 'provider accepted? confirmation lost (sintético)' });
    expect(fin.body?.[0]).toMatchObject({ finalized: true, state: 'ambiguous', attempts: 1, reason: 'finalized' });

    await sleep(300);
    const again = await rpcClaim(service, appId);
    expect(again.body?.[0]).toMatchObject({ claimed: false, state: 'ambiguous', attempts: 1, reason: 'ambiguous_requires_manual_review', claim_id: null });

    // Ni siquiera otro finalize (ni con el token original) puede moverlo:
    // solo la resolución manual desde el registro.
    const move = await rpcFinalize(appId, c.body?.[0]?.claim_id ?? '', 'sent', { messageId: 'msg-late' });
    expect(move.body?.[0]).toMatchObject({ finalized: false, state: 'ambiguous', reason: 'not_claimed' });
    expect((await notificationRow(appId))?.state).toBe('ambiguous');
  });

  test('agotamiento de intentos: max_attempts bloquea nuevos reclamos', async () => {
    const appId = await createApplication('max-attempts');

    const c1 = await rpcClaim(service, appId, { maxAttempts: 2 });
    expect(c1.body?.[0]).toMatchObject({ claimed: true, attempts: 1 });
    await rpcFinalize(appId, c1.body?.[0]?.claim_id ?? '', 'failed', { lastError: 'fallo sintético 1' });

    const c2 = await rpcClaim(service, appId, { maxAttempts: 2 });
    expect(c2.body?.[0]).toMatchObject({ claimed: true, attempts: 2 });
    await rpcFinalize(appId, c2.body?.[0]?.claim_id ?? '', 'failed', { lastError: 'fallo sintético 2' });

    const c3 = await rpcClaim(service, appId, { maxAttempts: 2 });
    expect(c3.body?.[0]).toMatchObject({ claimed: false, state: 'failed', attempts: 2, reason: 'max_attempts_exhausted', claim_id: null });
  });

  test('finalize con estado inválido es rechazado por la RPC', async () => {
    const appId = await createApplication('invalid-finalize');
    const c = await rpcClaim(service, appId);

    const bad = await rpcFinalize(appId, c.body?.[0]?.claim_id ?? '', 'claimed');
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(bad.body)).toContain('invalid_finalize_state');

    // El reclamo sigue vivo y cerrable correctamente.
    const good = await rpcFinalize(appId, c.body?.[0]?.claim_id ?? '', 'sent', { messageId: 'msg-synthetic-003' });
    expect(good.body?.[0]?.finalized).toBe(true);
  });

  test('last_error se trunca a 500 caracteres', async () => {
    const appId = await createApplication('truncate');
    const c = await rpcClaim(service, appId);

    const longError = 'E'.repeat(600);
    await rpcFinalize(appId, c.body?.[0]?.claim_id ?? '', 'failed', { lastError: longError });

    const row = await notificationRow(appId);
    expect(row?.last_error).toHaveLength(500);
  });

  // ── Fase de entrega (030d) ─────────────────────────────────────────────────

  test('FASE (rev.9): reclamo nuevo nace en pre_send; la marca send_started solo avanza con el token vigente', async () => {
    const appId = await createApplication('phase-mark');
    const c = await rpcClaim(service, appId);
    expect(c.body?.[0]?.claimed).toBe(true);
    expect(c.body?.[0]?.delivery_phase, 'un reclamo nuevo nace en pre_send').toBe('pre_send');
    const token = c.body?.[0]?.claim_id as string;

    // Un token ajeno no puede marcar la fase.
    const wrong = await rpcMarkPhase(appId, crypto.randomUUID(), 'send_started');
    expect(wrong.body?.[0]).toMatchObject({ marked: false, delivery_phase: 'pre_send', reason: 'fenced_out' });

    // El poseedor del token sí puede marcar el punto de no retorno.
    const mark = await rpcMarkPhase(appId, token, 'send_started');
    expect(mark.body?.[0]).toMatchObject({ marked: true, delivery_phase: 'send_started', reason: 'marked' });
    expect((await notificationRow(appId))?.delivery_phase).toBe('send_started');

    // La fase es monótona: no se puede re-marcar ni volver atrás.
    const again = await rpcMarkPhase(appId, token, 'send_started');
    expect(again.body?.[0]).toMatchObject({ marked: false, delivery_phase: 'send_started', reason: 'already_marked' });

    // Marcar con una fase inválida (p.ej. retroceder) es un error.
    const back = await rpcMarkPhase(appId, token, 'pre_send');
    expect(back.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(back.body)).toContain('invalid_phase_transition');
  });

  test('FASE (rev.9) OBLIGATORIA: send_started → proceso muere → vence lease → 2º intento NO envía (ambiguous)', async () => {
    const appId = await createApplication('phase-crash');

    // Proceso 1: reclama, marca el punto de no retorno y "muere" (no finalize).
    const c1 = await rpcClaim(service, appId, { leaseSeconds: 1 });
    const token1 = c1.body?.[0]?.claim_id as string;
    const mark = await rpcMarkPhase(appId, token1, 'send_started');
    expect(mark.body?.[0]?.marked).toBe(true);
    // (Aquí SMTP habría aceptado el correo y el proceso habría muerto.)

    await sleep(1600); // el lease vence

    // Proceso 2 intenta retomar el envío. OBLIGATORIO: ningún segundo envío.
    const c2 = await rpcClaim(service, appId, { leaseSeconds: 60 });
    expect(c2.body?.[0]).toMatchObject({
      claimed: false,
      state: 'ambiguous',
      reason: 'ambiguous_requires_manual_review',
      claim_id: null,
    });

    const row = await notificationRow(appId);
    expect(row?.state).toBe('ambiguous');
    expect(row?.delivery_phase).toBe('send_started');
    expect(row?.attempts, 'nunca se incrementaron los intentos: no hubo retoma').toBe(1);
    expect(row?.last_error).toBe('lease_expired_after_send_started_or_unknown_phase');

    // Ni con el token original ni con otro puede nadie reclamar ni cerrar.
    const again = await rpcClaim(service, appId);
    expect(again.body?.[0]?.reason).toBe('ambiguous_requires_manual_review');
    const late = await rpcFinalize(appId, token1, 'sent', { messageId: 'msg-tardio' });
    expect(late.body?.[0]).toMatchObject({ finalized: false, state: 'ambiguous', reason: 'not_claimed' });
    expect((await notificationRow(appId))?.message_id).toBeNull();
  });

  test('FASE (rev.9): vencimiento en pre_send (no-transmisión demostrada) SÍ permite retomar con seguridad', async () => {
    const appId = await createApplication('phase-safe-retry');

    // Proceso 1: reclama pero NUNCA marca send_started (murió antes de SMTP).
    const c1 = await rpcClaim(service, appId, { leaseSeconds: 1 });
    expect(c1.body?.[0]?.delivery_phase).toBe('pre_send');

    await sleep(1600); // el lease vence en pre_send

    // La no-transmisión está demostrada: el reclamo puede retomarse.
    const c2 = await rpcClaim(service, appId, { leaseSeconds: 60 });
    expect(c2.body?.[0]).toMatchObject({
      claimed: true,
      state: 'claimed',
      attempts: 2,
      reason: 'claimed',
      delivery_phase: 'pre_send',
    });
    expect((await notificationRow(appId))?.state).toBe('claimed');

    const ok = await rpcFinalize(appId, c2.body?.[0]?.claim_id ?? '', 'sent', { messageId: 'msg-safe-retry' });
    expect(ok.body?.[0]?.finalized).toBe(true);
  });
});
