// PB-CERT-AUTO-PROFILE-001 — Tests del motor de extracción de certificados.
//
// Casos obligatorios (diseño §11):
//   1. Certificado completo → 5 campos.
//   2. Sin fechas → no inventa.
//   3. Fechas ambiguas → low, sin autoaceptar.
//   4. "Sin caducidad" → expiry ausente.
//   5. issue > expiry → ambas low.
//   6. issue futura → low.
//   7. Mes/año sin día → fecha ausente (no se inventa el día).
//   8. Idiomas: ES/EN/DE funcionales.
//   9. Credencial sin dígitos → ausente.

import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { extractCert } from './certEngine.ts';

const DOC_ID = '00000000-0000-0000-0000-000000000001';
const AT = '2026-01-15T10:00:00.000Z';

function field(result: ReturnType<typeof extractCert>, name: string) {
  return result.fields.find((f) => f.field === name);
}

Deno.test('certificado completo EN: 5 campos con confianza alta', () => {
  const text = `
    CERTIFICATE OF QUALIFICATION
    VCA Basis
    Issued by: Bureau Veritas
    Certificate No: BV-2023-88412
    Issue Date: 15/03/2023
    Expiry Date: 16/03/2033
  `;
  const r = extractCert({ text, sourceDocumentId: DOC_ID, extractedAt: AT });
  assertEquals(field(r, 'certification_name')?.value, 'VCA Basis');
  assertEquals(field(r, 'certification_name')?.confidence, 'high');
  assertEquals(field(r, 'issuing_organization')?.value, 'Bureau Veritas');
  assertEquals(field(r, 'issuing_organization')?.confidence, 'high');
  assertEquals(field(r, 'credential_id')?.value, 'BV-2023-88412');
  assertEquals(field(r, 'credential_id')?.confidence, 'high');
  // 15/03/2023: día > 12 → inequívoco DD/MM → high.
  assertEquals(field(r, 'issue_date')?.value, '2023-03-15');
  assertEquals(field(r, 'issue_date')?.confidence, 'high');
  assertEquals(field(r, 'expiry_date')?.value, '2033-03-16');
  assertEquals(field(r, 'expiry_date')?.confidence, 'high');
  assertEquals(r.fields.length, 5);
});

Deno.test('sin fechas: no inventa issue_date ni expiry_date', () => {
  const text = `
    Certificate of Flange Fitting
    Issued by: TÜV Rheinland
    Certificate No: TR-99120
  `;
  const r = extractCert({ text, sourceDocumentId: DOC_ID, extractedAt: AT });
  assertEquals(field(r, 'certification_name')?.value, 'Flange Fitting');
  assertEquals(field(r, 'issue_date'), undefined);
  assertEquals(field(r, 'expiry_date'), undefined);
});

Deno.test('fecha ambigua (día ≤ 12): low confidence, nunca autoaceptada', () => {
  const text = `
    VCA VOL
    Issued by: VCA Infra
    Certificate No: 5544332
    Issue Date: 05/06/2022
  `;
  const r = extractCert({ text, sourceDocumentId: DOC_ID, extractedAt: AT });
  const d = field(r, 'issue_date');
  assertExists(d);
  // Convención europea DD/MM pero ambigua → low.
  assertEquals(d.value, '2022-06-05');
  assertEquals(d.confidence, 'low');
});

Deno.test('"sin caducidad" declarado: expiry_date ausente', () => {
  const text = `
    First Aid
    Issued by: Red Cross
    Certificate No: RC-11223
    Issue Date: 10/01/2024
    This certificate has no expiry date.
  `;
  const r = extractCert({ text, sourceDocumentId: DOC_ID, extractedAt: AT });
  assertEquals(field(r, 'issue_date')?.value, '2024-01-10');
  assertEquals(field(r, 'expiry_date'), undefined);
});

Deno.test('issue > expiry: ambas low (revisión obligatoria)', () => {
  const text = `
    SCC
    Issued by: SGS
    Certificate No: SGS-7788
    Issue Date: 20/05/2024
    Expiry Date: 20/05/2022
  `;
  const r = extractCert({ text, sourceDocumentId: DOC_ID, extractedAt: AT });
  assertEquals(field(r, 'issue_date')?.confidence, 'low');
  assertEquals(field(r, 'expiry_date')?.confidence, 'low');
});

Deno.test('issue futura: low confidence', () => {
  const text = `
    ISO 9606-1
    Issued by: DNV
    Certificate No: DNV-33445
    Issue Date: 20/05/2030
  `;
  const r = extractCert({ text, sourceDocumentId: DOC_ID, extractedAt: AT });
  assertEquals(field(r, 'issue_date')?.confidence, 'low');
});

Deno.test('mes/año sin día: fecha ausente (no se inventa el día)', () => {
  const text = `
    MIG/MAG Welding (135/136)
    Issued by: TWI
    Certificate No: TWI-5566
    Issue Date: March 2023
  `;
  const r = extractCert({ text, sourceDocumentId: DOC_ID, extractedAt: AT });
  assertEquals(field(r, 'issue_date'), undefined);
});

Deno.test('ES: etiquetas en español', () => {
  const text = `
    CERTIFICADO
    VCA Básico
    Emitido por: Applus
    Nº de certificado: AP-2024-1122
    Fecha de emisión: 22/02/2024
    Fecha de caducidad: 22/02/2034
  `;
  const r = extractCert({ text, sourceDocumentId: DOC_ID, extractedAt: AT });
  assertEquals(field(r, 'certification_name')?.value, 'VCA Basis');
  assertEquals(field(r, 'issuing_organization')?.value, 'Applus');
  assertEquals(field(r, 'credential_id')?.value, 'AP-2024-1122');
  assertEquals(field(r, 'issue_date')?.value, '2024-02-22');
  assertEquals(field(r, 'expiry_date')?.value, '2034-02-22');
});

Deno.test('DE: etiquetas en alemán', () => {
  const text = `
    ZERTIFIKAT
    ISO 9606-1
    Ausgestellt von: TÜV Nord
    Zertifikatsnummer: TN-88-4412
    Ausstellungsdatum: 03.11.2023
    Gültig bis: 03.11.2026
  `;
  const r = extractCert({ text, sourceDocumentId: DOC_ID, extractedAt: AT });
  assertEquals(field(r, 'certification_name')?.value, 'ISO 9606-1');
  assertEquals(field(r, 'issuing_organization')?.value, 'TÜV Nord');
  assertEquals(field(r, 'credential_id')?.value, 'TN-88-4412');
  assertEquals(field(r, 'issue_date')?.value, '2023-11-03');
  assertEquals(field(r, 'expiry_date')?.value, '2026-11-03');
});

Deno.test('credencial sin dígitos: ausente (no captura palabras sueltas)', () => {
  const text = `
    Confined Space Entry
    Issued by: Kiwa
    Certificate No: VALID
  `;
  const r = extractCert({ text, sourceDocumentId: DOC_ID, extractedAt: AT });
  assertEquals(field(r, 'credential_id'), undefined);
});

Deno.test('emisor conocido sin etiqueta: medium confidence', () => {
  const text = `
    TIG Welding (141)
    This qualification was assessed under the supervision of Bureau Veritas.
    Registration No: BV-4455
  `;
  const r = extractCert({ text, sourceDocumentId: DOC_ID, extractedAt: AT });
  const issuer = field(r, 'issuing_organization');
  assertExists(issuer);
  assertEquals(issuer.confidence, 'medium');
});

Deno.test('documento vacío: cero campos, sin errores', () => {
  const r = extractCert({ text: '   \n  ', sourceDocumentId: DOC_ID, extractedAt: AT });
  assertEquals(r.fields.length, 0);
});

Deno.test('todos los campos llevan source/confidence/extracted_at/document_id', () => {
  const text = `
    VCA Basis
    Issued by: Bureau Veritas
    Certificate No: BV-1
    Issue Date: 15/03/2023
  `;
  const r = extractCert({ text, sourceDocumentId: DOC_ID, extractedAt: AT });
  for (const f of r.fields) {
    assertEquals(f.source, 'certificate_document');
    assertEquals(f.extracted_at, AT);
    assertEquals(f.source_document_id, DOC_ID);
    assertExists(f.confidence);
  }
});
