// Verificación P0 con identidades QA autorizadas (sin service_role).
// Separa PUBLIC/anon/authenticated de backend; no usa service_role para demostrar aislamiento.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const EMAIL_A = process.env.E2E_TEST_EMAIL;
const PASS_A = process.env.E2E_TEST_PASSWORD;
const EMAIL_B = process.env.E2E_TEST_EMAIL_B;
const PASS_B = process.env.E2E_TEST_PASSWORD_B;

async function login(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed for ${email}: ${res.status}`);
  const data = await res.json();
  return { token: data.access_token, userId: data.user.id, email: data.user.email };
}

async function api(path, token, method = 'GET', body = null, extraHeaders = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : null,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

(async () => {
  const a = await login(EMAIL_A, PASS_A);
  const b = await login(EMAIL_B, PASS_B);
  console.log(`QA A: ${a.email} (${a.userId})`);
  console.log(`QA B: ${b.email} (${b.userId})`);

  // ── AUDITLOG ──
  // Usuario normal NO puede leer audit_logs (admin-only).
  const readAudit = await api('app_14da0f1941_audit_logs?select=id&limit=1', a.token);
  check('auditlog: usuario normal NO lee', readAudit.status === 200 && readAudit.json.length === 0, `status=${readAudit.status} rows=${readAudit.json?.length}`);

  // Usuario normal NO puede insertar (policy admin-only + anti-spoof).
  const insAudit = await api('app_14da0f1941_audit_logs', a.token, 'POST', {
    actor_email: a.email, action: 'test', entity_type: 'test', entity_id: a.userId, details: {},
  });
  check('auditlog: usuario normal NO inserta', insAudit.status >= 400, `status=${insAudit.status}`);

  // Usuario normal NO puede insertar con actor_email falsificado (anti-spoof).
  const spoofAudit = await api('app_14da0f1941_audit_logs', a.token, 'POST', {
    actor_email: 'admin@pipingbox.com', action: 'test', entity_type: 'test', entity_id: a.userId, details: {},
  });
  check('auditlog: actor_email falsificado rechazado', spoofAudit.status >= 400, `status=${spoofAudit.status}`);

  // Usuario normal NO puede UPDATE ni DELETE audit_logs.
  const updAudit = await api('app_14da0f1941_audit_logs?id=eq.00000000-0000-0000-0000-000000000000', a.token, 'PATCH', { action: 'tampered' });
  check('auditlog: usuario normal NO update', updAudit.status >= 400 || (updAudit.status === 200 && updAudit.json?.length === 0), `status=${updAudit.status}`);
  const delAudit = await api('app_14da0f1941_audit_logs?id=eq.00000000-0000-0000-0000-000000000000', a.token, 'DELETE');
  check('auditlog: usuario normal NO delete', delAudit.status >= 400 || (delAudit.status === 200 && delAudit.json?.length === 0), `status=${delAudit.status}`);

  // ── INTERNAL-DATA ──
  // Usuario normal NO puede leer workforce_request_internal.
  const readInternal = await api('app_14da0f1941_workforce_request_internal?select=request_id&limit=1', a.token);
  check('internal: usuario normal NO lee', readInternal.status === 200 && readInternal.json.length === 0, `status=${readInternal.status} rows=${readInternal.json?.length}`);

  // Usuario normal NO puede insertar.
  const insInternal = await api('app_14da0f1941_workforce_request_internal', a.token, 'POST', {
    request_id: '00000000-0000-0000-0000-000000000000', recruiter_name: 'spoof',
  });
  check('internal: usuario normal NO inserta', insInternal.status >= 400, `status=${insInternal.status}`);

  // ── ASSIGNMENTS ──
  // Usuario normal NO puede leer assignments (admin-only).
  const readAssign = await api('app_14da0f1941_workforce_assignments?select=id&limit=1', a.token);
  check('assignments: usuario normal NO lee', readAssign.status === 200 && readAssign.json.length === 0, `status=${readAssign.status} rows=${readAssign.json?.length}`);

  // Usuario normal NO puede insertar.
  const insAssign = await api('app_14da0f1941_workforce_assignments', a.token, 'POST', {
    request_id: '00000000-0000-0000-0000-000000000000', worker_id: a.userId, status: 'shortlisted',
  });
  check('assignments: usuario normal NO inserta', insAssign.status >= 400, `status=${insAssign.status}`);

  // Usuario normal NO puede DELETE.
  const delAssign = await api('app_14da0f1941_workforce_assignments?id=eq.00000000-0000-0000-0000-000000000000', a.token, 'DELETE');
  check('assignments: usuario normal NO delete', delAssign.status >= 400 || (delAssign.status === 200 && delAssign.json?.length === 0), `status=${delAssign.status}`);

  // ── ANON (sin token) ──
  const anonReadAudit = await api('app_14da0f1941_audit_logs?select=id&limit=1', ANON_KEY);
  check('auditlog: anon NO lee', anonReadAudit.status >= 400 || (anonReadAudit.status === 200 && anonReadAudit.json?.length === 0), `status=${anonReadAudit.status}`);
  const anonReadAssign = await api('app_14da0f1941_workforce_assignments?select=id&limit=1', ANON_KEY);
  check('assignments: anon NO lee', anonReadAssign.status >= 400 || (anonReadAssign.status === 200 && anonReadAssign.json?.length === 0), `status=${anonReadAssign.status}`);

  // ── Fixture conservado ──
  const fixture = await api('app_14da0f1941_workforce_assignments?id=eq.86bfc261-7515-48ad-b182-4bea15819d29&select=id,status,notes', a.token);
  check('assignments: fixture QA conservado (admin-readable)', fixture.status === 200 && fixture.json?.length === 1, `rows=${fixture.json?.length}`);

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} PASS`);
  if (failed.length > 0) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
