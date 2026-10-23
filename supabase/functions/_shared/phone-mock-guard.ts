// _shared/phone-mock-guard.ts
// PB-WHATSAPP-FOUNDATION-001 FIX1 (M2): barrera tecnica anti-mock fail-safe.
//
// Modulo PURO (sin dependencias externas) para que sea testeable unitariamente
// en Deno y en Node (strip-types). El provider mock/capture SOLO puede vivir
// en proyectos QA explicitamente listados; en cualquier otro (produccion
// incluida) es imposible activarlo aunque alguien inserte la fila en la tabla
// phone_provider_config: una fila provider='mock' NO basta.

// Project refs permitidos (QA). Overridable por env solo si la plataforma lo
// permite; el default es la lista QA hardcodeada (no es secreto: es un ref).
const MOCK_ALLOWED_REFS = (
  (typeof Deno !== "undefined" && Deno.env?.get("PHONE_VERIFICATION_MOCK_ALLOW_REFS")) ||
  "uqfbilyfpflrlthnyijj"
).split(",").map((s) => s.trim()).filter(Boolean);

/** Extrae el project ref de una SUPABASE_URL (https://<ref>.supabase.co). */
export function projectRefFromSupabaseUrl(url: string): string {
  const match = (url || "").match(/^https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  return match ? match[1] : "";
}

/**
 * El mock solo esta permitido con mock_enabled explicito Y ref en allowlist.
 * Fail-safe por omision: cualquier dato ausente/desconocido => false.
 */
export function isMockProviderAllowed(mockEnabled: boolean, projectRef: string): boolean {
  if (!mockEnabled) return false;
  if (!projectRef) return false;
  return MOCK_ALLOWED_REFS.includes(projectRef);
}
