/**
 * Application constants for PipingBox.
 *
 * Auth redirect architecture (PB-CF-MIGRATION step 5-5b):
 * Auth redirects/callbacks must target the SAME origin the app is actually
 * running on (production, Cloudflare Workers preview, or localhost), never
 * a hardcoded domain guessed from "is this localhost or not". Previously
 * any non-localhost origin was force-redirected to PRODUCTION_URL, which
 * broke OAuth/magic-link callbacks on the workers.dev preview.
 *
 * ALLOWED_AUTH_ORIGINS is the single source of truth for which origins are
 * trusted to receive auth callbacks. If window.location.origin matches one
 * of these (or is localhost/127.0.0.1), it is used as-is. Any other/unknown
 * origin (e.g. a phishing clone or unexpected preview URL) safely falls
 * back to PRODUCTION_URL instead of leaking the redirect to it.
 *
 * NOTE: Supabase Auth's dashboard "Redirect URLs" allowlist must also
 * include every origin listed here (see AGENTS.md / deployment docs) or
 * Supabase itself will reject the callback regardless of this code.
 */

const PRODUCTION_URL = 'https://app.pipingbox.com';
const PREVIEW_URL = 'https://pipingbox-app.pipingbox.workers.dev';

const ALLOWED_AUTH_ORIGINS = [PRODUCTION_URL, PREVIEW_URL];

function isLocalOrigin(origin: string): boolean {
  return origin.includes('localhost') || origin.includes('127.0.0.1');
}

/**
 * Returns the correct app base URL based on the environment.
 * - localhost/127.0.0.1 -> current origin (local dev)
 * - a known/allowlisted origin (production or preview) -> current origin
 * - anything else (unexpected host) -> PRODUCTION_URL, as a safe default
 */
export function getAppBaseUrl(): string {
  if (typeof window === 'undefined') return PRODUCTION_URL;

  const origin = window.location.origin;

  if (isLocalOrigin(origin)) return origin;
  if (ALLOWED_AUTH_ORIGINS.includes(origin)) return origin;

  return PRODUCTION_URL;
}

/**
 * Returns the auth redirect URL for OAuth callbacks.
 * Always points to /dashboard after successful authentication.
 */
export function getAuthRedirectUrl(path: string = '/dashboard'): string {
  return `${getAppBaseUrl()}${path}`;
}

/**
 * Check if we're running in production environment.
 */
export function isProduction(): boolean {
  if (typeof window === 'undefined') return true;
  return window.location.origin === PRODUCTION_URL;
}