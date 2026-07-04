// TD-02 (DEC-37): Primary admin email — centralized source of truth.
//
// Previously hardcoded as a literal in 3 files (useAuth.tsx, ProtectedRoute.tsx,
// CandidateProfile.tsx). Now read from VITE_PRIMARY_ADMIN_EMAIL env var.
//
// IMPORTANT: This is an INTERMEDIATE fix. The email is still client-visible
// (it's in the Vite bundle). The proper fix (DEC-37) is to move admin
// identification to a DB table or JWT custom claim set by a Supabase Edge
// Function, which requires a migration. Until then, admin access is enforced
// by profile.role in the DB (RLS), so exposing this email is not a security
// risk — it's only used as a fallback when the profile fetch fails.
//
// All files that need the primary admin email MUST import it from here.
// Never hardcode the email in a component or hook.

export const PRIMARY_ADMIN_EMAIL =
  import.meta.env.VITE_PRIMARY_ADMIN_EMAIL || '';

/**
 * Returns true if the given email matches the primary admin.
 * Empty/undefined emails always return false.
 */
export function isPrimaryAdmin(email?: string | null): boolean {
  if (!email || !PRIMARY_ADMIN_EMAIL) return false;
  return email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase();
}
