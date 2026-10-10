// _shared/standard-webhooks.ts
// PB-I18N-EMAIL-001 — Verificación de firma Standard Webhooks (la que usa el
// Send Email Auth Hook de Supabase) implementada con WebCrypto, sin
// dependencias externas. Compatible con la librería `standardwebhooks`.
//
// Cabeceras: webhook-id, webhook-timestamp, webhook-signature ("v1,<base64>"
// separadas por espacio si hay varias). Firma = HMAC-SHA256(secret,
// `${id}.${timestamp}.${payload}`), secreto en base64 tras el prefijo
// "whsec_" (la UI de Supabase lo entrega como "v1,whsec_<base64>").

export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

export function parseHookSecret(raw: string): Uint8Array {
  let s = raw.trim();
  if (s.startsWith("v1,")) s = s.slice(3);
  if (s.startsWith("whsec_")) s = s.slice(6);
  if (!s) throw new WebhookVerificationError("empty_secret");
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toBase64(bytes: ArrayBuffer): string {
  let s = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signWebhook(
  secretBytes: Uint8Array,
  id: string,
  timestamp: string,
  payload: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${payload}`));
  return `v1,${toBase64(sig)}`;
}

export interface VerifyOptions {
  nowSeconds?: number;
  toleranceSeconds?: number;
}

/**
 * Verifica la firma y la ventana temporal. Lanza WebhookVerificationError.
 * Devuelve el payload parseado como JSON.
 */
export async function verifyWebhook<T = unknown>(
  secretRaw: string,
  payload: string,
  headers: Headers | Record<string, string>,
  opts: VerifyOptions = {},
): Promise<T> {
  const get = (name: string): string | null =>
    headers instanceof Headers ? headers.get(name) : (headers[name] ?? headers[name.toLowerCase()] ?? null);

  const id = get("webhook-id");
  const ts = get("webhook-timestamp");
  const sigHeader = get("webhook-signature");
  if (!id || !ts || !sigHeader) throw new WebhookVerificationError("missing_headers");

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) throw new WebhookVerificationError("invalid_timestamp");
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tol = opts.toleranceSeconds ?? WEBHOOK_TOLERANCE_SECONDS;
  if (Math.abs(now - tsNum) > tol) throw new WebhookVerificationError("timestamp_out_of_tolerance");

  const expected = await signWebhook(parseHookSecret(secretRaw), id, ts, payload);
  const expectedSig = expected.slice(3);
  const ok = sigHeader
    .split(" ")
    .map((p) => p.trim())
    .filter((p) => p.startsWith("v1,"))
    .some((p) => constantTimeEqual(p.slice(3), expectedSig));
  if (!ok) throw new WebhookVerificationError("signature_mismatch");

  try {
    return JSON.parse(payload) as T;
  } catch {
    throw new WebhookVerificationError("invalid_json");
  }
}
