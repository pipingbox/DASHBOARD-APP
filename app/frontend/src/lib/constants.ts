/**
 * Application constants for PipingBox.
 * Production URL is used for all auth redirects to prevent localhost leaking into OAuth flows.
 */

const PRODUCTION_URL = 'https://app.pipingbox.com';

/**
 * Returns the correct app base URL based on the environment.
 * In production builds, always returns the production URL.
 * In development (localhost), returns window.location.origin for local testing.
 */
export function getAppBaseUrl(): string {
  if (typeof window === 'undefined') return PRODUCTION_URL;

  const origin = window.location.origin;

  // If running on localhost or 127.0.0.1, it's development
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
    return origin;
  }

  // In production, always use the canonical production URL
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
  const origin = window.location.origin;
  return !origin.includes('localhost') && !origin.includes('127.0.0.1');
}