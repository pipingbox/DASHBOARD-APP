// _shared/phone_test.ts
// PB-WHATSAPP-FOUNDATION-001 — tests unitarios de la logica pura de telefono.
//
// Compatible con Deno (`deno test --allow-read supabase/functions/_shared/`)
// y con Node >=22 (`node --experimental-strip-types --import ./test-shim-deno.ts`),
// usando node:assert (soportado por ambos runtimes).

import assert from "node:assert/strict";
import {
  normalizeToE164,
  maskE164,
  generateOtpCode,
  formatE164ForDisplay,
} from "./phone.ts";
import { isMockProviderAllowed, projectRefFromSupabaseUrl } from "./phone-mock-guard.ts";

// ─── normalizeToE164 ────────────────────────────────────────────────────────

Deno.test("normalizeToE164: numero nacional ES valido devuelve E.164 con +", () => {
  const r = normalizeToE164("ES", "612 345 678");
  assert.equal(r.valid, true);
  assert.equal(r.e164, "+34612345678");
  assert.equal(r.countryCode, "ES");
});

Deno.test("normalizeToE164: acepta entrada ya internacional con + y espacios", () => {
  const r = normalizeToE164("ES", "+34 612 34 56 78");
  assert.equal(r.valid, true);
  assert.equal(r.e164, "+34612345678");
});

Deno.test("normalizeToE164: elimina trunk prefix nacional (GB)", () => {
  const r = normalizeToE164("GB", "07700 900123");
  assert.equal(r.valid, true);
  assert.equal(r.e164, "+447700900123");
});

Deno.test("normalizeToE164: pais no soportado", () => {
  const r = normalizeToE164("US", "2025550123");
  assert.equal(r.valid, false);
  assert.match(r.error ?? "", /unsupported_country/);
});

Deno.test("normalizeToE164: longitud invalida", () => {
  const r = normalizeToE164("ES", "61234");
  assert.equal(r.valid, false);
  assert.match(r.error ?? "", /invalid_length/);
});

Deno.test("normalizeToE164: minusculas en country code", () => {
  const r = normalizeToE164("es", "612345678");
  assert.equal(r.valid, true);
  assert.equal(r.e164, "+34612345678");
});

// ─── maskE164 ────────────────────────────────────────────────────────────────

Deno.test("maskE164: formato +34******678 sin exponer el numero", () => {
  const masked = maskE164("+34612345678");
  assert.equal(masked, "+34******678");
  assert.ok(!masked.includes("612345"));
});

Deno.test("maskE164: prefijo de 3 digitos (PT)", () => {
  const masked = maskE164("+351912345678");
  assert.equal(masked, "+351******678");
});

Deno.test("maskE164: entrada corta o vacia", () => {
  assert.equal(maskE164("+12"), "***");
  assert.equal(maskE164(""), "***");
});

// ─── generateOtpCode ────────────────────────────────────────────────────────

Deno.test("generateOtpCode: 6 digitos, rango valido, formato estable", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const code = generateOtpCode();
    assert.match(code, /^[0-9]{6}$/);
    const n = Number(code);
    assert.ok(n >= 100000 && n <= 999999);
    seen.add(code);
  }
  // CSPRNG: 200 muestras no deben colapsar en unos pocos valores.
  assert.ok(seen.size > 150);
});

// ─── formatE164ForDisplay ───────────────────────────────────────────────────

Deno.test("formatE164ForDisplay: separa prefijo y nacional", () => {
  assert.equal(formatE164ForDisplay("+34612345678", "ES"), "+34 612345678");
  assert.equal(formatE164ForDisplay("34612345678", "ES"), "+34 612345678");
});

// ─── isMockProviderAllowed (FIX M2: barrera anti-mock fail-safe) ────────────

Deno.test("M2: fila provider='mock' sin mock_enabled NO activa el mock", () => {
  // Una sola fila provider='mock' ya no basta: mock_enabled=false => denegado.
  assert.equal(isMockProviderAllowed(false, "uqfbilyfpflrlthnyijj"), false);
});

Deno.test("M2: mock_enabled en proyecto NO permitido (prod) NO activa el mock", () => {
  // Aunque alguien inserte provider='mock' + mock_enabled=true en produccion,
  // el ref no esta en la allowlist => fail-safe.
  assert.equal(isMockProviderAllowed(true, "mwdauubztjxkbrefirbg"), false);
});

Deno.test("M2: mock solo con mock_enabled=true Y ref permitido (QA)", () => {
  assert.equal(isMockProviderAllowed(true, "uqfbilyfpflrlthnyijj"), true);
});

Deno.test("M2: ref vacio o desconocido siempre deniega (fail-safe por omision)", () => {
  assert.equal(isMockProviderAllowed(true, ""), false);
  assert.equal(isMockProviderAllowed(true, "aaaaaaaaaaaaaaaaaaaa"), false);
  assert.equal(isMockProviderAllowed(false, ""), false);
});

Deno.test("M2: projectRefFromSupabaseUrl extrae el ref o devuelve vacio", () => {
  assert.equal(projectRefFromSupabaseUrl("https://uqfbilyfpflrlthnyijj.supabase.co"), "uqfbilyfpflrlthnyijj");
  assert.equal(projectRefFromSupabaseUrl("https://mwdauubztjxkbrefirbg.supabase.co"), "mwdauubztjxkbrefirbg");
  assert.equal(projectRefFromSupabaseUrl(""), "");
  assert.equal(projectRefFromSupabaseUrl("http://localhost:54321"), "");
});
