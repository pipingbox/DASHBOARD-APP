/**
 * Centralized admin configuration.
 *
 * The primary admin email acts as a last-resort fallback so the platform owner
 * is never locked out.  In production this should move to an env variable or
 * Supabase custom claims; for now it lives in a single importable constant
 * instead of being scattered across multiple files.
 */
export const PRIMARY_ADMIN_EMAIL: string =
  import.meta.env.VITE_PRIMARY_ADMIN_EMAIL || 'gaspardelhierromata@gmail.com';
