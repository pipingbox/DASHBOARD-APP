/**
 * PB-DOCUMENT-INTAKE-001 — Entrega B: tokens de referencia y primitivas
 * criptográficas. Módulo PURO: sin Deno.*, sin esm.sh, sin import.meta.env —
 * importable desde Edge Functions (Deno) y desde tests (Node/Playwright).
 * Web Crypto (globalThis.crypto) está disponible en ambos runtimes.
 */

/** Token opaco de 192 bits (24 bytes) → 32 chars base64url. Resistente a enumeración. */
export function generateReferenceToken(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  // base64url estándar: 24 bytes → exactamente 32 chars, sin padding.
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Comparación timing-safe de strings ASCII (hex/base64url). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
