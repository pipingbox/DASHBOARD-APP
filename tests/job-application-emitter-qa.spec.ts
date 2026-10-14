import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test';

/**
 * PB-I18N-EMAIL-001 (rev.7) — matriz QA del emisor mantenible de candidaturas.
 *
 * Ejerce la función DESPLEGADA EN QA con el slug de prueba
 * `app_14da0f1941_send_job_application_notification_maintainable` (fuente:
 * supabase/functions/app_14da0f1941_send_job_application_notification/index.maintainable.ts).
 * La función de producción NO se toca: este slug solo existe en QA.
 *
 * QA no tiene secretos SMTP, de modo que el envío falla de forma controlada y
 * se verifica el ciclo completo del reclamo (sql/030) sin enviar correos.
 *
 * Todas las cuentas y filas son sintéticas y se eliminan al final.
 *
 * Requiere:
 *   QA_JOBAPP_EMITTER=1
 *   QA_SUPABASE_URL / QA_SUPABASE_ANON_KEY / QA_SUPABASE_SERVICE_KEY
 */

const QA_REF = 'uqfbilyfpflrlthnyijj';
const SLUG = 'app_14da0f1941_send_job_application_notification_maintainable';
const SUPABASE_URL = process.env.QA_SUPABASE_URL ?? `https://${QA_REF}.supabase.co`;
const ANON_KEY = process.env.QA_SUPABASE_ANON_KEY ?? '';
const SERVICE_KEY = process.env.QA_SUPABASE_SERVICE_KEY ?? '';
const FN_URL = `/functions/v1/${SLUG}`;
const PASSWORD = 'PbJobsEmitter!2026x';

let anon: APIRequestContext;
let service: APIRequestContext;
let fn: APIRequestContext;
const fx = { users: [] as string[], profiles: [] as string[], jobs: [] as string[], apps: [] as string[] };

async function makeUser(tag: string) {
  const email = `pb-jobs-emitter-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@pipingbox-test.example`;
  const res = await service.post('/auth/v1/admin/users', { data: { email, password: PASSWORD, email_confirm: true } });
  expect([200, 201], `create user ${tag}`).toContain(res.status());
  const user = await res.json();
  fx.users.push(user.id);
  const login = await anon.post('/auth/v1/token?grant_type=password', { data: { email, password: PASSWORD } });
  expect(login.status(), `login ${tag}`).toBe(200);
  const body = await login.json();
  return { id: user.id as string, token: body.access_token as string };
}

async function makeJob() {
  const res = await service.post('/rest/v1/app_14da0f1941_jobs', {
    data: { title: 'pb-emitter-qa', company: 'PB Synthetic QA', country: 'NL', source_language: 'en' },
    headers: { Prefer: 'return=representation' },
  });
  expect([200, 201], 'create job').toContain(res.status());
  const [job] = await res.json();
  fx.jobs.push(job.id);
  return job.id as string;
}

async function makeApplication(userId: string, jobId: string) {
  const res = await service.post('/rest/v1/app_14da0f1941_job_applications', {
    data: { user_id: userId, job_id: jobId, job_title: 'pb-emitter-qa', company_name: 'PB Synthetic QA', status: 'applied' },
    headers: { Prefer: 'return=representation' },
  });
  expect([200, 201], 'create application').toContain(res.status());
  const [app] = await res.json();
  fx.apps.push(app.id);
  return app.id as string;
}

async function notificationRow(applicationId: string) {
  const res = await service.get(`/rest/v1/app_14da0f1941_job_application_notifications?application_id=eq.${applicationId}`);
  const rows = await res.json();
  return rows[0] as { state: string; attempts: number; last_error: string | null } | undefined;
}

function invoke(token: string | null, jobId: string) {
  return fn.post(FN_URL, {
    data: { job_id: jobId },
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

test.describe('PB-I18N-EMAIL-001 rev.7 — emisor mantenible de candidaturas en QA', () => {
  test.skip(process.env.QA_JOBAPP_EMITTER !== '1', 'QA_JOBAPP_EMITTER=1 requerido');

  test.beforeAll(async () => {
    expect(SERVICE_KEY, 'QA_SUPABASE_SERVICE_KEY requerida').toBeTruthy();
    expect(ANON_KEY, 'QA_SUPABASE_ANON_KEY requerida').toBeTruthy();
    anon = await pwRequest.newContext({ baseURL: SUPABASE_URL, extraHTTPHeaders: { apikey: ANON_KEY } });
    service = await pwRequest.newContext({
      baseURL: SUPABASE_URL,
      extraHTTPHeaders: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    fn = await pwRequest.newContext({ baseURL: SUPABASE_URL });
  });

  test.afterAll(async () => {
    for (const id of fx.apps) await service.delete(`/rest/v1/app_14da0f1941_job_application_notifications?application_id=eq.${id}`).catch(() => undefined);
    for (const id of fx.apps) await service.delete(`/rest/v1/app_14da0f1941_job_applications?id=eq.${id}`).catch(() => undefined);
    for (const id of fx.jobs) await service.delete(`/rest/v1/app_14da0f1941_jobs?id=eq.${id}`).catch(() => undefined);
    for (const id of fx.users) await service.delete(`/rest/v1/app_14da0f1941_profiles?user_id=eq.${id}`).catch(() => undefined);
    for (const id of fx.users) await service.delete(`/auth/v1/admin/users/${id}`).catch(() => undefined);

    const notif = await (await service.get('/rest/v1/app_14da0f1941_job_application_notifications?select=application_id')).json();
    const apps = await (await service.get('/rest/v1/app_14da0f1941_job_applications?job_title=eq.pb-emitter-qa&select=id')).json();
    const jobs = await (await service.get('/rest/v1/app_14da0f1941_jobs?title=eq.pb-emitter-qa&select=id')).json();
    expect(notif, 'limpieza: registro de reclamos vacío').toHaveLength(0);
    expect(apps, 'limpieza: candidaturas sintéticas eliminadas').toHaveLength(0);
    expect(jobs, 'limpieza: ofertas sintéticas eliminadas').toHaveLength(0);
    await anon.dispose();
    await service.dispose();
    await fn.dispose();
  });

  test('arranque, fallo SMTP controlado y ciclo completo del reclamo', async () => {
    const user = await makeUser('main');
    const prof = await service.post('/rest/v1/app_14da0f1941_profiles', {
      data: { user_id: user.id, role: 'worker', account_type: 'worker', full_name: 'Emitter QA', title: 'Welder' },
      headers: { Prefer: 'return=representation' },
    });
    const [profile] = await prof.json();
    fx.profiles.push(profile?.id);
    const jobId = await makeJob();
    const appId = await makeApplication(user.id, jobId);

    // Sonda de arranque viva: un BOOT_ERROR no devolvería este contrato.
    const first = await invoke(user.token, jobId);
    expect(first.status(), 'arranque correcto').toBe(200);
    const body1 = await first.json();
    expect(body1).toMatchObject({ success: true, emailsSent: false, reason: 'SMTP not configured' });

    const row1 = await notificationRow(appId);
    expect(row1).toMatchObject({ state: 'failed', attempts: 1, last_error: 'smtp_not_configured' });

    for (const expected of [2, 3]) {
      const body = await (await invoke(user.token, jobId)).json();
      expect(body.emailsSent).toBe(false);
      expect((await notificationRow(appId))?.attempts).toBe(expected);
    }

    const fourth = await (await invoke(user.token, jobId)).json();
    expect(fourth).toMatchObject({ success: true, emailsSent: false, reason: 'max_attempts_exhausted' });
  });

  test('negativos: otro usuario, JWT inválido, OPTIONS y job sin candidatura', async () => {
    const owner = await makeUser('owner');
    const jobId = await makeJob();
    await makeApplication(owner.id, jobId);

    const other = await makeUser('intruder');
    const rOther = await invoke(other.token, jobId);
    expect(rOther.status()).toBe(404);
    expect((await rOther.json())?.error).toBe('no_matching_application');

    const rBad = await invoke('invalid.jwt.token', jobId);
    expect([401, 403]).toContain(rBad.status());

    const rOpt = await fn.fetch(FN_URL, { method: 'OPTIONS' });
    expect([204, 200]).toContain(rOpt.status());

    const rNoApp = await invoke(owner.token, crypto.randomUUID());
    expect(rNoApp.status()).toBe(404);
  });

  test('ventana de frescura: candidatura >15 min no notifica ni crea reclamo', async () => {
    const user = await makeUser('stale');
    const jobId = await makeJob();
    const appId = await makeApplication(user.id, jobId);
    await service.patch(`/rest/v1/app_14da0f1941_job_applications?id=eq.${appId}`, {
      data: { created_at: new Date(Date.now() - 20 * 60 * 1000).toISOString() },
    });

    const res = await invoke(user.token, jobId);
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, emailsSent: false, reason: 'stale_application' });
    expect(await notificationRow(appId), 'sin reclamo para candidatura obsoleta').toBeUndefined();
  });
});
