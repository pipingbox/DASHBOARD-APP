// Verificación P0 con identidades QA autorizadas (sin service_role).
// Esquema real de audit_logs: actor_email/action_type/target_type TEXT NOT NULL,
// target_id/details TEXT NULL. Clasifica la CAUSA de cada respuesta; un >=400
// genérico NO es prueba de RLS.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const EMAIL_A = process.env.E2E_TEST_EMAIL;
const PASS_A = process.env.E2E_TEST_PASSWORD;
const EMAIL_B = process.env.E2E_TEST_EMAIL_B;
const PASS_B = process.env.E2E_TEST_PASSWORD_B;
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

const AUDIT = 'app_14da0f1941_audit_logs';
const INTERNAL = 'app_14da0f1941_workforce_request_internal';
const ASSIGN = 'app_14da0f1941_workforce_assignments';
const FIXTURE_ID = '86bfc261-7515-48ad-b182-4bea15819d29';
const RUN_MARK = `p0verify-${Date.now()}`;

async function login(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  const data = await res.json();
  return { token: data.access_token, userId: data.user.id, email: data.user.email };
}

// Clasifica la respuesta de la Data API en una causa concreta.
function classify(res) {
  const j = res.json;
  if (res.status === 401) return j?.code === 'PGRST301' || /jwt/i.test(res.text) ? 'auth_invalid' : 'unauthorized';
  if (res.status === 403) return 'rls_or_grant_denied';
  if (res.status === 400) {
    const c = j?.code || '';
    if (c === '23502' || c === '23503' || c === '23505' || c === '23514' || c === '22P02') return `constraint_${c}`;
    if (c === 'PGRST204' || c === 'PGRST205') return `schema_${c}`;
    if (c === '42501') return 'rls_or_grant_denied';
    return `bad_request_${c || 'unknown'}`;
  }
  if (res.status === 404) return 'not_found';
  if (res.status === 406) return 'not_acceptable';
  if (res.status === 409) return 'conflict';
  if (res.status >= 500) return `server_${res.status}`;
  if (res.status === 200 || res.status === 201) return 'ok';
  if (res.status === 204) return 'ok_no_content';
  return `other_${res.status}`;
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
  return { status: res.status, json, text, cause: null };
}
function R(r) { r.cause = classify(r); return r; }

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
// Denegación de escritura: la API debe rechazar con una causa de AUTORIZACIÓN
// (42501/403/401), no con un error de esquema/constraint/servidor que enmascare
// la prueba. Un 400 por payload inválido NO demuestra RLS.
const AUTH_DENIED = (r) => ['rls_or_grant_denied', 'unauthorized', 'auth_invalid'].includes(r.cause);

(async () => {
  const a = await login(EMAIL_A, PASS_A);
  const b = await login(EMAIL_B, PASS_B);
  let admin = null;
  try { admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD); } catch { admin = null; }
  console.log(`QA A: ${a.email} (${a.userId})`);
  console.log(`QA B: ${b.email} (${b.userId})`);
  console.log(`QA admin: ${admin ? admin.email : 'NO DISPONIBLE'}`);
  check('identidad admin QA disponible', !!admin, admin ? admin.email : 'E2E_ADMIN_* no autentica');

  // Payloads conformes al esquema real de audit_logs.
  const auditRow = (email) => ({
    actor_email: email,
    action_type: 'p0_permissions_check',
    target_type: 'qa_fixture',
    target_id: null,
    details: RUN_MARK,
  });

  // ── AUDITLOG — usuario normal ──
  const readAudit = R(await api(`${AUDIT}?select=id&limit=1`, a.token));
  check('auditlog: usuario normal NO lee (0 filas visibles)', readAudit.status === 200 && readAudit.json.length === 0, `cause=${readAudit.cause} rows=${readAudit.json?.length}`);

  const insAudit = R(await api(AUDIT, a.token, 'POST', auditRow(a.email)));
  check('auditlog: usuario normal NO inserta (denegación de autorización)', AUTH_DENIED(insAudit), `status=${insAudit.status} cause=${insAudit.cause}`);

  // ── AUDITLOG — anti-spoof (control de atribución) ──
  if (admin) {
    // Control positivo: admin inserta con SU PROPIO actor_email → permitido.
    const okIns = R(await api(AUDIT, admin.token, 'POST', auditRow(admin.email)));
    check('auditlog: admin inserta evento válido con su actor_email (control positivo)', okIns.status === 201, `status=${okIns.status} cause=${okIns.cause}`);
    // Mismo payload válido cambiando SOLO actor_email por otro → anti-spoof.
    const spoofIns = R(await api(AUDIT, admin.token, 'POST', auditRow(a.email)));
    check('auditlog: admin con actor_email ajeno → rechazado (anti-spoof)', AUTH_DENIED(spoofIns), `status=${spoofIns.status} cause=${spoofIns.cause}`);
    // Control positivo: admin lee audit_logs.
    const okRead = R(await api(`${AUDIT}?select=id&limit=1`, admin.token));
    check('auditlog: admin lee (control positivo)', okRead.status === 200, `status=${okRead.status} cause=${okRead.cause} rows=${okRead.json?.length}`);
  } else {
    check('auditlog: controles positivos admin + anti-spoof', false, 'sin identidad admin — no ejecutado, no declarado verificado');
  }

  // ── AUDITLOG — UPDATE/DELETE prohibidos (append-only) ──
  // Usar una fila REAL y verificable (la insertada por el admin), no el UUID cero.
  if (admin) {
    const mine = R(await api(`${AUDIT}?actor_email=eq.${encodeURIComponent(admin.email)}&action_type=eq.p0_permissions_check&order=created_at.desc&limit=1&select=id`, admin.token));
    const rowId = mine.json?.[0]?.id;
    check('auditlog: fila real localizable para prueba UPDATE/DELETE', !!rowId, `id=${rowId ? 'presente' : 'ausente'}`);
    if (rowId) {
      const upd = R(await api(`${AUDIT}?id=eq.${rowId}`, admin.token, 'PATCH', { action_type: 'tampered' }));
      check('auditlog: UPDATE prohibido incluso para admin (append-only)', AUTH_DENIED(upd), `status=${upd.status} cause=${upd.cause}`);
      const del = R(await api(`${AUDIT}?id=eq.${rowId}`, admin.token, 'DELETE'));
      check('auditlog: DELETE prohibido incluso para admin (append-only)', AUTH_DENIED(del), `status=${del.status} cause=${del.cause}`);
      // Verificar que la fila NO cambió (estado comprobable por identidad autorizada).
      const after = R(await api(`${AUDIT}?id=eq.${rowId}&select=action_type`, admin.token));
      check('auditlog: fila intacta tras intentos UPDATE/DELETE', after.status === 200 && after.json?.[0]?.action_type === 'p0_permissions_check', `action_type=${after.json?.[0]?.action_type}`);
    }
  }

  // ── INTERNAL-DATA ──
  const readInternal = R(await api(`${INTERNAL}?select=request_id&limit=1`, a.token));
  check('internal: usuario normal NO lee', readInternal.status === 200 && readInternal.json.length === 0, `cause=${readInternal.cause} rows=${readInternal.json?.length}`);
  const insInternal = R(await api(INTERNAL, a.token, 'POST', { request_id: a.userId, recruiter_name: 'spoof' }));
  check('internal: usuario normal NO inserta (denegación de autorización)', AUTH_DENIED(insInternal), `status=${insInternal.status} cause=${insInternal.cause}`);

  // ── ASSIGNMENTS ──
  const readAssign = R(await api(`${ASSIGN}?select=id&limit=1`, a.token));
  check('assignments: usuario normal NO lee', readAssign.status === 200 && readAssign.json.length === 0, `cause=${readAssign.cause} rows=${readAssign.json?.length}`);
  const insAssign = R(await api(ASSIGN, a.token, 'POST', { request_id: a.userId, worker_id: a.userId, status: 'shortlisted' }));
  check('assignments: usuario normal NO inserta (denegación de autorización)', AUTH_DENIED(insAssign), `status=${insAssign.status} cause=${insAssign.cause}`);

  // DELETE sobre el fixture REAL: existe y es verificable por identidad autorizada.
  // El fixture es visible para admin; un usuario normal no debe poder borrarlo.
  if (admin) {
    const fxAdmin = R(await api(`${ASSIGN}?id=eq.${FIXTURE_ID}&select=id`, admin.token));
    check('assignments: fixture existe y es verificable por admin', fxAdmin.status === 200 && fxAdmin.json?.length === 1, `rows=${fxAdmin.json?.length}`);
    const delFx = R(await api(`${ASSIGN}?id=eq.${FIXTURE_ID}`, a.token, 'DELETE'));
    check('assignments: usuario normal NO borra el fixture real', AUTH_DENIED(delFx) || (delFx.status === 200 && delFx.json?.length === 0), `status=${delFx.status} cause=${delFx.cause}`);
    const fxAfter = R(await api(`${ASSIGN}?id=eq.${FIXTURE_ID}&select=id`, admin.token));
    check('assignments: fixture intacto tras intento de borrado', fxAfter.status === 200 && fxAfter.json?.length === 1, `rows=${fxAfter.json?.length}`);
  }

  // ── ANON (sin sesión de usuario) ──
  const anonReadAudit = R(await api(`${AUDIT}?select=id&limit=1`, ANON_KEY));
  check('auditlog: anon NO lee', AUTH_DENIED(anonReadAudit) || (anonReadAudit.status === 200 && anonReadAudit.json?.length === 0), `status=${anonReadAudit.status} cause=${anonReadAudit.cause}`);
  const anonReadAssign = R(await api(`${ASSIGN}?select=id&limit=1`, ANON_KEY));
  check('assignments: anon NO lee', AUTH_DENIED(anonReadAssign) || (anonReadAssign.status === 200 && anonReadAssign.json?.length === 0), `status=${anonReadAssign.status} cause=${anonReadAssign.cause}`);

  // ── Fixture: invisible para usuario normal (política admin-only) ──
  const fixture = R(await api(`${ASSIGN}?id=eq.${FIXTURE_ID}&select=id,status,notes`, a.token));
  check('assignments: fixture invisible para usuario normal', fixture.status === 200 && fixture.json?.length === 0, `rows=${fixture.json?.length}`);

  // ── CREATE-CHECKOUT: kill switch de monetización ──
  const ccRes = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_key: 'vca_course_bvca' }),
  });
  let ccJson = null;
  try { ccJson = await ccRes.json(); } catch {}
  check(
    'create-checkout: QA POST con monetización desactivada → 403 monetization_disabled',
    ccRes.status === 403 && ccJson?.error === 'monetization_disabled',
    `status=${ccRes.status} error=${ccJson?.error}`
  );

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} PASS`);
  if (failed.length > 0) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
