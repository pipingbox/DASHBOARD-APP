/**
 * PB-DOCUMENT-INTAKE-001 — Entrega B: verificación de firmas de webhook
 * compatibles con Standard Webhooks / Svix (Resend).
 *
 * Esquema verificado documentalmente (resend.com/docs/webhooks + svix):
 *   - Cabeceras: svix-id, svix-timestamp, svix-signature.
 *   - Secreto: "whsec_" + base64; la clave HMAC es el base64 DECODIFICADO.
 *   - Contenido firmado: `${id}.${timestamp}.${body}` (body crudo, sin parsear).
 *   - Firma: base64(HMAC-SHA256(key, contenido)).
 *   - La cabecera puede llevar varias firmas "v1,<sig>" separadas por espacios
 *     (rotación); vale cualquier coincidencia.
 *   - Ventana anti-replay: |now - timestamp| <= tolerancia (5 min por defecto).
 *
 * Módulo PURO (sin Deno.*): usable en tests Node.
 */

import { timingSafeEqual } from './tokens.ts';

export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export type SvixVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'missing_headers' | 'timestamp_out_of_range' | 'bad_signature' | 'bad_secret' };

const DEFAULT_TOLERANCE_SECONDS = 300;

function base64ToBytes(b64: string): Uint8Array | null {
  try {
    // atob existe en Deno y en Node >= 16 (global).
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function verifySvixSignature(
  headers: SvixHeaders,
  rawBody: string,
  secret: string,
  nowSeconds: number,
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
): Promise<SvixVerifyResult> {
  if (!headers.id || !headers.timestamp || !headers.signature) {
    return { ok: false, reason: 'missing_headers' };
  }
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > toleranceSeconds) {
    return { ok: false, reason: 'timestamp_out_of_range' };
  }
  const secretB64 = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  const keyBytes = base64ToBytes(secretB64);
  if (!keyBytes) return { ok: false, reason: 'bad_secret' };

  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signedContent = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const expected = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signedContent),
  );
  const expectedB64 = bytesToBase64(new Uint8Array(expected));

  // Cabecera con una o varias firmas "v1,<sig>" separadas por espacios.
  const candidates = headers.signature
    .split(' ')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('v1,'))
    .map((part) => part.slice(3));
  for (const candidate of candidates) {
    if (timingSafeEqual(candidate, expectedB64)) return { ok: true };
  }
  return { ok: false, reason: 'bad_signature' };
}

/** Firma un payload (para el correo sintético TEST y los tests). */
export async function signSvixPayload(
  id: string,
  timestampSeconds: number,
  rawBody: string,
  secret: string,
): Promise<string> {
  const secretB64 = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  const keyBytes = base64ToBytes(secretB64);
  if (!keyBytes) throw new Error('bad_secret');
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signedContent = `${id}.${timestampSeconds}.${rawBody}`;
  const sig = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signedContent),
  );
  return `v1,${bytesToBase64(new Uint8Array(sig))}`;
}
