/**
 * PB-DOCUMENT-INTAKE-001 — Entrega B: extracción de la referencia del correo
 * entrante. La referencia viaja en el ASUNTO ("PB-DOC-<token> — Certificado")
 * o en el destinatario con plus-addressing ("documentos+<token>@…").
 * El token NUNCA se persiste en claro: solo se usa para calcular su hash.
 *
 * Módulo PURO (sin Deno.*).
 */

const SUBJECT_PATTERN = /PB-DOC-([A-Za-z0-9_-]{32})\b/;
const PLUS_ADDRESS_PATTERN = /^[^@+]+\+([A-Za-z0-9_-]{32})@/;

/**
 * Devuelve el token de referencia (32 chars base64url) o null.
 * Nunca lanza: un correo arbitrario sin referencia devuelve null.
 */
export function extractReferenceToken(input: {
  subject?: unknown;
  to?: unknown;
}): string | null {
  if (typeof input.subject === 'string') {
    const m = SUBJECT_PATTERN.exec(input.subject);
    if (m) return m[1];
  }
  const recipients = Array.isArray(input.to) ? input.to : [];
  for (const raw of recipients) {
    if (typeof raw !== 'string') continue;
    // El proveedor puede entregar "Nombre <addr@dominio>"; extraer la dirección.
    const addrMatch = /<([^>]+)>/.exec(raw);
    const addr = (addrMatch ? addrMatch[1] : raw).trim();
    const m = PLUS_ADDRESS_PATTERN.exec(addr);
    if (m) return m[1];
  }
  return null;
}
