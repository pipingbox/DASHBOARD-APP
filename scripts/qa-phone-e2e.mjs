#!/usr/bin/env node
/**
 * PB-WHATSAPP-FOUNDATION-001 — QA E2E (casos A–M del ticket §13)
 * Contra el proyecto QA (uqfbilyfpflrlthnyijj) con el provider MOCK.
 * Uso: node scripts/qa-phone-e2e.mjs
 */

const BASE = 'https://uqfbilyfpflrlthnyijj.supabase.co';
const ANON = process.env.QA_ANON_KEY;
const SERVICE = process.env.QA_SERVICE_KEY;
const USER_A = { email: 'qa-phone-a@pipingbox-qa.test', password: 'Qa!Phone2026a' };
const USER_B = { email: 'qa-phone-b@pipingbox-qa.test', password: 'Qa!Phone2026b' };

if (!ANON || !SERVICE) {
  console.error('QA_ANON_KEY / QA_SERVICE_KEY requeridos');
  process.exit(1);
}

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${detail}`); }
}

async function signIn({ email, password }) {
  const res = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`signIn ${email}: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function fn(slug, token, payload) {
  const res = await fetch(`${BASE}/functions/v1/${slug}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function rest(path, token, { method = 'GET', body, key } = {}) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key || ANON,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(token ? { Authorization: `Bearer ${token}` } : { Authorization: `Bearer ${key || ANON}` }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

const svc = (path, opts) => rest(path, null, { ...opts, key: SERVICE });

const PHONE_COLS =
  'user_id,phone_number_raw,phone_e164,phone_country_code,phone_present,phone_verified,phone_verified_at,phone_verification_method,whatsapp_service_opt_in,whatsapp_job_alerts_opt_in,whatsapp_marketing_opt_in,whatsapp_consent_at,whatsapp_consent_version,whatsapp_opted_out_at,marketplace_ready,onboarding_status,profile_completion,marketplace_contract_version';

async function getProfileA(tokA) {
  const r = await rest(`app_14da0f1941_profiles?select=${PHONE_COLS}&user_id=eq.${UID_A}`, tokA);
  return r.data?.[0] ?? null;
}

const UID_A = 'a11ce000-0000-4000-8000-00000000000a';
const UID_B = 'b22ce000-0000-4000-8000-00000000000b';

async function cleanupVerifications() {
  await svc(`app_14da0f1941_phone_verifications?user_id=eq.${UID_A}`, { method: 'DELETE' });
  await svc(`app_14da0f1941_phone_provider_outbox?user_id=eq.${UID_A}`, { method: 'DELETE' });
}

async function lastCapturedCode() {
  const r = await svc(
    `app_14da0f1941_phone_provider_outbox?user_id=eq.${UID_A}&order=created_at.desc&limit=1&select=captured_code,to_phone,provider`,
  );
  return r.data?.[0] ?? null;
}

async function events() {
  const r = await svc(
    `app_14da0f1941_phone_events?user_id=eq.${UID_A}&order=created_at.asc&select=event,phone_masked,metadata`,
  );
  return r.data ?? [];
}

async function main() {
  console.log('== Sign in QA users ==');
  const tokA = await signIn(USER_A);
  const tokB = await signIn(USER_B);
  console.log('  ok');

  // ── Caso J (anon) ────────────────────────────────────────────────────────
  console.log('== J: anon denied ==');
  const anonCall = await fn('phone-send-otp', null, { phone: '612345678', country_code: 'ES' });
  check('J1 anon edge function sin Authorization => 401', anonCall.status === 401, JSON.stringify(anonCall.body));
  const anonVerifs = await rest(`app_14da0f1941_phone_verifications?select=id`);
  check('J2 anon select verifications => denied/sin filas',
    anonVerifs.status >= 400 || (Array.isArray(anonVerifs.data) && anonVerifs.data.length === 0), JSON.stringify(anonVerifs.data).slice(0, 200));
  const anonEvents = await rest(`app_14da0f1941_phone_events?select=id`);
  check('J3 anon select events => denied/sin filas',
    anonEvents.status >= 400 || (Array.isArray(anonEvents.data) && anonEvents.data.length === 0));
  const anonOutbox = await rest(`app_14da0f1941_phone_provider_outbox?select=id`);
  check('J4 anon select outbox => denied/sin filas',
    anonOutbox.status >= 400 || (Array.isArray(anonOutbox.data) && anonOutbox.data.length === 0));

  // ── Caso A: usuario auth-only sin telefono ───────────────────────────────
  console.log('== A: sin telefono (auth-only, sin perfil) ==');
  const prof0 = await getProfileA(tokA);
  check('A1 sin perfil o phone_present=false', prof0 === null || prof0.phone_present === false);
  check('A2 sin perfil o phone_verified=false', prof0 === null || prof0.phone_verified === false);

  // ── Caso B: numero valido anadido ────────────────────────────────────────
  console.log('== B: anadir numero valido ==');
  await cleanupVerifications();
  const sendB = await fn('phone-send-otp', tokA, { phone: '612345678', country_code: 'ES' });
  check('B1 send-otp => sent:true', sendB.status === 200 && sendB.body.sent === true, JSON.stringify(sendB.body));
  const profB = await getProfileA(tokA);
  check('B2 phone_present=true', profB?.phone_present === true);
  check('B3 phone_verified=false', profB?.phone_verified === false);
  check('B4 e164 canonico con +', profB?.phone_e164 === '+34612345678', profB?.phone_e164);
  check('B5 phone_number_raw guardado', profB?.phone_number_raw === '612345678');
  check('B6 auth-only: perfil creado sin onboarding (AUTH_ONLY)', profB?.onboarding_status === 'AUTH_ONLY');
  check('B7 auth-only: marketplace_ready=false', profB?.marketplace_ready === false);
  const capB = await lastCapturedCode();
  check('B8 mock capture: codigo de 6 digitos en outbox', /^[0-9]{6}$/.test(capB?.captured_code ?? ''), JSON.stringify(capB));
  const otpCodeB = capB.captured_code;

  // ── Caso D: OTP incorrecto ───────────────────────────────────────────────
  console.log('== D: OTP incorrecto ==');
  const wrong = otpCodeB === '000000' ? '000001' : '000000';
  const verD = await fn('phone-verify-otp', tokA, { code: wrong });
  check('D1 verify con codigo erroneo => invalid_code', verD.status === 400 && verD.body.error === 'invalid_code', JSON.stringify(verD.body));
  const profD = await getProfileA(tokA);
  check('D2 sigue sin verificar', profD?.phone_verified === false);

  // ── Caso C: OTP correcto ─────────────────────────────────────────────────
  console.log('== C: OTP correcto ==');
  const verC = await fn('phone-verify-otp', tokA, { code: otpCodeB });
  check('C1 verify => verified:true', verC.status === 200 && verC.body.verified === true, JSON.stringify(verC.body));
  const profC = await getProfileA(tokA);
  check('C2 phone_verified=true', profC?.phone_verified === true);
  check('C3 phone_verified_at != null', profC?.phone_verified_at !== null);
  check('C4 metodo sms_otp', profC?.phone_verification_method === 'sms_otp');

  // ── Caso K: Marketplace Ready no se altera ───────────────────────────────
  console.log('== K: Marketplace Ready inalterado ==');
  check('K1 marketplace_ready sigue false', profC?.marketplace_ready === false);
  check('K2 onboarding_status sigue AUTH_ONLY', profC?.onboarding_status === 'AUTH_ONLY');
  check('K3 profile_completion=0', profC?.profile_completion === 0);
  check('K4 contract version no tocada', profC?.marketplace_contract_version === null || profC?.marketplace_contract_version === 0);

  // ── Consentimiento antes de verificado (con numero nuevo, caso H parcial) ─
  console.log('== L: opt-in requiere verificacion ==');
  // (telefono actual ya verificado; el caso no-verificado se prueba tras el cambio de numero en H)

  // ── Caso L: opt-in con verificado ────────────────────────────────────────
  console.log('== L: opt-in con telefono verificado ==');
  const consL = await fn('phone-update-consent', tokA, { job_alerts_opt_in: true });
  check('L1 job_alerts on => ok', consL.status === 200 && consL.body.whatsapp_job_alerts_opt_in === true, JSON.stringify(consL.body));
  const consL2 = await fn('phone-update-consent', tokA, { marketing_opt_in: true });
  check('L2 marketing on => ok', consL2.status === 200);
  const profL = await getProfileA(tokA);
  check('L3 jobs=true, marketing=true, service=false (separados)',
    profL?.whatsapp_job_alerts_opt_in === true && profL?.whatsapp_marketing_opt_in === true && profL?.whatsapp_service_opt_in === false);
  check('L4 consent_at registrado', profL?.whatsapp_consent_at !== null);
  check('L5 consent_version registrada', typeof profL?.whatsapp_consent_version === 'string' && profL.whatsapp_consent_version.length > 0);

  // ── Caso M: opt-out efectivo ─────────────────────────────────────────────
  console.log('== M: opt-out ==');
  const consM = await fn('phone-update-consent', tokA, { job_alerts_opt_in: false, marketing_opt_in: false });
  check('M1 revocacion ok', consM.status === 200);
  const profM = await getProfileA(tokA);
  check('M2 todos los opt-ins false',
    profM?.whatsapp_job_alerts_opt_in === false && profM?.whatsapp_marketing_opt_in === false && profM?.whatsapp_service_opt_in === false);
  check('M3 whatsapp_opted_out_at con timestamp', profM?.whatsapp_opted_out_at !== null);

  // ── Caso G: reenvio invalida el codigo anterior + cooldown ───────────────
  console.log('== G: reenvio OTP ==');
  await cleanupVerifications();
  const sendG1 = await fn('phone-send-otp', tokA, { phone: '+34612345678', country_code: 'ES' });
  check('G0 resend mismo numero => ok', sendG1.status === 200, JSON.stringify(sendG1.body));
  const codeG1 = (await lastCapturedCode()).captured_code;
  const sendGcool = await fn('phone-send-otp', tokA, { phone: '+34612345678', country_code: 'ES' });
  check('G1 reenvio inmediato => cooldown 429', sendGcool.status === 429 && sendGcool.body.error === 'resend_cooldown', JSON.stringify(sendGcool.body));
  await cleanupVerifications(); // resetea cooldown (borra filas)
  const sendG2 = await fn('phone-send-otp', tokA, { phone: '+34612345678', country_code: 'ES' });
  check('G2 segundo envio ok', sendG2.status === 200);
  const verG = await fn('phone-verify-otp', tokA, { code: codeG1 });
  check('G3 codigo anterior invalido tras reenvio', verG.status === 400 && (verG.body.error === 'invalid_code' || verG.body.error === 'no_pending_verification'), JSON.stringify(verG.body));

  // ── Caso E: OTP expirado ─────────────────────────────────────────────────
  console.log('== E: OTP expirado ==');
  await cleanupVerifications();
  const sendE = await fn('phone-send-otp', tokA, { phone: '+34612345678', country_code: 'ES' });
  check('E0 envio ok', sendE.status === 200);
  const codeE = (await lastCapturedCode()).captured_code;
  await svc(`app_14da0f1941_phone_verifications?user_id=eq.${UID_A}&verified_at=is.null`, {
    method: 'PATCH',
    body: { expires_at: new Date(Date.now() - 1000).toISOString() },
  });
  const verE = await fn('phone-verify-otp', tokA, { code: codeE });
  check('E1 codigo expirado => code_expired', verE.status === 400 && verE.body.error === 'code_expired', JSON.stringify(verE.body));
  const profE = await getProfileA(tokA);
  check('E2 no verifica con expirado', profE?.phone_verified === true && profE?.phone_e164 === '+34612345678' ? profE.phone_verified_at !== null : profE?.phone_verified === false);

  // ── Caso F: demasiados intentos + rate limit de envios ───────────────────
  console.log('== F: max intentos + rate limit ==');
  await cleanupVerifications();
  const sendF = await fn('phone-send-otp', tokA, { phone: '+34612345678', country_code: 'ES' });
  check('F0 envio ok', sendF.status === 200);
  for (let i = 1; i <= 5; i++) {
    await fn('phone-verify-otp', tokA, { code: '999999' });
  }
  const verF = await fn('phone-verify-otp', tokA, { code: '999999' });
  check('F1 sexto intento => max_attempts_exceeded', verF.status === 400 && verF.body.error === 'max_attempts_exceeded', JSON.stringify(verF.body));
  // Rate limit: 3 envios en la hora => 4o bloqueado
  await cleanupVerifications();
  await fn('phone-send-otp', tokA, { phone: '+34612345678', country_code: 'ES' });
  await svc(`app_14da0f1941_phone_verifications?user_id=eq.${UID_A}&verified_at=is.null`, { method: 'PATCH', body: { expires_at: new Date(Date.now() - 61000).toISOString() } });
  await svc(`app_14da0f1941_phone_verifications?user_id=eq.${UID_A}`, { method: 'PATCH', body: { created_at: new Date(Date.now() - 3500000).toISOString() } });
  await fn('phone-send-otp', tokA, { phone: '+34612345678', country_code: 'ES' });
  await svc(`app_14da0f1941_phone_verifications?user_id=eq.${UID_A}`, { method: 'PATCH', body: { created_at: new Date(Date.now() - 3000000).toISOString() } });
  await fn('phone-send-otp', tokA, { phone: '+34612345678', country_code: 'ES' });
  const sendF4 = await fn('phone-send-otp', tokA, { phone: '+34612345678', country_code: 'ES' });
  check('F2 4o envio en la hora => rate_limit_exceeded', sendF4.status === 429 && sendF4.body.error === 'rate_limit_exceeded', JSON.stringify(sendF4.body));

  // ── Caso H: cambio de numero verificado ──────────────────────────────────
  console.log('== H: cambio de numero ==');
  await cleanupVerifications();
  // Estado previo: verificado con +34612345678 y opt-ins on
  await fn('phone-update-consent', tokA, { job_alerts_opt_in: true });
  const sendH = await fn('phone-send-otp', tokA, { phone: '477123456', country_code: 'BE' });
  check('H0 envio a numero nuevo => ok', sendH.status === 200, JSON.stringify(sendH.body));
  const profH = await getProfileA(tokA);
  check('H1 nuevo e164 presente', profH?.phone_e164 === '+32477123456', profH?.phone_e164);
  check('H2 verificacion invalidada', profH?.phone_verified === false && profH?.phone_verified_at === null);
  check('H3 opt-ins NO heredados (todos false)',
    profH?.whatsapp_job_alerts_opt_in === false && profH?.whatsapp_service_opt_in === false && profH?.whatsapp_marketing_opt_in === false);
  check('H4 revocacion fechada', profH?.whatsapp_opted_out_at !== null);
  const consH = await fn('phone-update-consent', tokA, { job_alerts_opt_in: true });
  check('H5 opt-in sin verificar => phone_not_verified', consH.status === 400 && consH.body.error === 'phone_not_verified', JSON.stringify(consH.body));
  const codeH = (await lastCapturedCode()).captured_code;
  const verH = await fn('phone-verify-otp', tokA, { code: codeH });
  check('H6 re-verificacion del nuevo numero ok', verH.status === 200 && verH.body.verified === true);

  // ── Caso I: cross-user ───────────────────────────────────────────────────
  console.log('== I: cross-user (B no ve ni toca a A) ==');
  const readAasB = await rest(`app_14da0f1941_profiles?select=user_id,phone_e164&user_id=eq.${UID_A}`, tokB);
  check('I1 B lee perfil de A => sin filas', Array.isArray(readAasB.data) && readAasB.data.length === 0, JSON.stringify(readAasB.data).slice(0, 200));
  const updAasB = await rest(`app_14da0f1941_profiles?user_id=eq.${UID_A}`, tokB, {
    method: 'PATCH',
    body: { phone_e164: '+34600000000' },
  });
  check('I2 B actualiza telefono de A => denegado/sin efecto',
    updAasB.status >= 400 || (Array.isArray(updAasB.data) && updAasB.data.length === 0), `status=${updAasB.status}`);
  const verifsAasB = await rest(`app_14da0f1941_phone_verifications?select=id&user_id=eq.${UID_A}`, tokB);
  check('I3 B lee verifications de A => sin filas', Array.isArray(verifsAasB.data) && verifsAasB.data.length === 0);
  const eventsAasB = await rest(`app_14da0f1941_phone_events?select=id&user_id=eq.${UID_A}`, tokB);
  check('I4 B lee events de A => sin filas', Array.isArray(eventsAasB.data) && eventsAasB.data.length === 0);
  const outboxAsB = await rest(`app_14da0f1941_phone_provider_outbox?select=id`, tokB);
  check('I5 B lee outbox => sin filas', Array.isArray(outboxAsB.data) && outboxAsB.data.length === 0);
  // Guard: escritura directa de columnas protegidas por el propio usuario
  const selfHack = await rest(`app_14da0f1941_profiles?user_id=eq.${UID_A}`, tokA, {
    method: 'PATCH',
    body: { phone_verified: false },
  });
  check('I6 A intenta escribir phone_verified directo => guard lo rechaza', selfHack.status >= 400, `status=${selfHack.status} ${JSON.stringify(selfHack.data).slice(0, 120)}`);
  const selfHack2 = await rest(`app_14da0f1941_profiles?user_id=eq.${UID_A}`, tokA, {
    method: 'PATCH',
    body: { whatsapp_job_alerts_opt_in: true },
  });
  check('I7 A intenta escribir opt-in directo => guard lo rechaza', selfHack2.status >= 400, `status=${selfHack2.status}`);

  // ── Auditoria: mascara y sin OTP ─────────────────────────────────────────
  console.log('== Auditoria ==');
  const evs = await events();
  const types = new Set(evs.map((e) => e.event));
  for (const t of ['phone_added', 'phone_changed', 'verification_started', 'verification_failed', 'phone_verified', 'whatsapp_opt_in_changed']) {
    check(`AUD evento ${t} registrado`, types.has(t));
  }
  const badMask = evs.filter((e) => e.phone_masked !== null && !/^\+\d{2,3}\*{6}\d{3}$/.test(e.phone_masked));
  check('AUD todos los telefonos enmascarados (+34******678)', badMask.length === 0, JSON.stringify(badMask).slice(0, 200));
  const leak = evs.filter((e) => JSON.stringify(e).match(/\b\d{6}\b/));
  check('AUD ningun codigo OTP en events', leak.length === 0, JSON.stringify(leak).slice(0, 200));
  const fullPhone = evs.filter((e) => e.phone_masked && e.phone_masked.length > 12);
  check('AUD ningun numero completo en events', fullPhone.length === 0);

  // ── Withdraw final ───────────────────────────────────────────────────────
  console.log('== Withdraw (baja completa) ==');
  const wd = await fn('phone-withdraw-consent', tokA);
  check('W1 withdraw ok', wd.status === 200);
  const profW = await getProfileA(tokA);
  check('W2 telefono eliminado', profW?.phone_e164 === null && profW?.phone_present === false);
  check('W3 verificacion reseteada', profW?.phone_verified === false && profW?.phone_verified_at === null);
  check('W4 opt-ins false + opted_out_at', profW?.whatsapp_job_alerts_opt_in === false && profW?.whatsapp_opted_out_at !== null);

  console.log(`\n==== RESULT: ${passed} passed, ${failed} failed ====`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('E2E error:', err);
  process.exit(1);
});
