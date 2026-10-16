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
