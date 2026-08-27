/**
 * PipingBox Role-Based Access Control (RBAC) Configuration
 *
 * Supported roles:
 * - admin: Full platform access
 * - community_moderator: Community management
 * - jobs_moderator: Recruitment management
 * - worker: Standard user experience
 * - company: Company-focused interface
 * - academy_instructor: Course marketplace instructor (PB-MARKET-SCHEMA-001)
 *
 * Future-ready for:
 * - verified_recruiter
 * - regional_moderator
 * - premium_company
 * - support_staff
 *
 * NOTE on academy_instructor: the role exists in the RBAC model, but the
 * instructor's own pipeline state does NOT live here. It lives in
 * app_marketplace_instructors.instructor_status. Do not confuse it with the
 * worker ONBOARDING_STATUS ladder or with profiles.marketplace_ready, which
 * belong to the JOB marketplace (see lib/onboarding.ts).
 */

export type UserRole =
  | 'admin'
  | 'community_moderator'
  | 'jobs_moderator'
  | 'worker'
  | 'company'
  | 'academy_instructor';

export const ALL_ROLES: UserRole[] = [
  'admin',
  'community_moderator',
  'jobs_moderator',
  'worker',
  'company',
  'academy_instructor',
];

export const DEFAULT_ROLE: UserRole = 'worker';

/**
 * Route access map — defines which roles can access each route.
 * Routes not listed here are accessible to all authenticated users.
 *
 * academy_instructor: NO instructor-specific route is declared here on purpose.
 * The instructor dashboard does not exist yet — there is no <Route> serving it
 * in App.tsx — and declaring a route that no component serves would make
 * hasRouteAccess() return true for a 404. Only the routes an instructor
 * legitimately needs today are granted: /academy (they must be able to see the
 * catalog their own course lives in) and /messages (QA review correspondence).
 * When the instructor dashboard ships, add its real path here and to
 * NAV_VISIBILITY in the same commit that adds the <Route>.
 */
export const ROUTE_ACCESS: Record<string, UserRole[]> = {
  '/admin': ['admin'],
  '/content-drafts': ['admin', 'community_moderator'],
  '/applications': ['admin', 'worker'],
  '/messages': ['admin', 'worker', 'company', 'jobs_moderator', 'academy_instructor'],
  '/companies': ['admin', 'jobs_moderator', 'company'],
  '/companies/request-workers': ['admin', 'jobs_moderator', 'company'],
  '/academy': ['admin', 'worker', 'academy_instructor'],
  '/tools': ['admin', 'worker'],
  '/company-dashboard': ['admin', 'company'],
  '/company/jobs': ['admin', 'company'],
  '/company/post-job': ['admin', 'company'],
  '/company/candidates': ['admin', 'company'],
  '/candidate/:userId': ['admin', 'jobs_moderator', 'company'],
  '/company/workers-search': ['admin', 'company'],
  '/company/workforce-requests': ['admin', 'company'],
  '/company/documentation': ['admin', 'company'],
  '/company/profile': ['admin', 'company'],
  '/company/analytics': ['admin', 'company'],
  '/company/settings': ['admin', 'company'],
  '/company/billing': ['admin', 'company'],
};

/**
 * Navigation items visible per role.
 * Admin always sees everything — handled in the sidebar component.
 */
export const NAV_VISIBILITY: Record<string, UserRole[]> = {
  '/dashboard': ['admin', 'community_moderator', 'jobs_moderator', 'worker', 'academy_instructor'],
  '/company-dashboard': ['admin', 'company'],
  '/company/jobs': ['admin', 'company'],
  '/company/post-job': ['admin', 'company'],
  '/company/candidates': ['admin', 'company'],
  '/company/workers-search': ['admin', 'company'],
  '/company/workforce-requests': ['admin', 'company'],
  '/company/documentation': ['admin', 'company'],
  '/company/profile': ['admin', 'company'],
  '/company/analytics': ['admin', 'company'],
  '/company/settings': ['admin', 'company'],
  '/company/billing': ['admin', 'company'],
  '/academy': ['admin', 'worker', 'academy_instructor'],
  '/tools': ['admin', 'worker'],
  '/jobs': ['admin', 'jobs_moderator', 'worker'],
  '/community': ['admin', 'community_moderator', 'worker', 'company'],
  '/companies': ['admin', 'jobs_moderator'],
  '/applications': ['admin', 'worker'],
  '/messages': ['admin', 'worker', 'company', 'jobs_moderator', 'academy_instructor'],
  '/content-drafts': ['admin', 'community_moderator'],
  '/profile': ['admin', 'community_moderator', 'jobs_moderator', 'worker', 'academy_instructor'],
};

/**
 * Check if a role has access to a given route.
 * Admin always has access. If route is not in ROUTE_ACCESS, it's open to all authenticated users.
 * Supports dynamic route patterns (e.g., /candidate/:userId).
 */
export function hasRouteAccess(role: string | undefined | null, route: string): boolean {
  if (!role) return false;
  if (role === 'admin') return true;

  // Legacy 'user' role maps to 'worker'
  const normalizedRole = role === 'user' ? 'worker' : role;

  // Check exact match first
  const allowedRoles = ROUTE_ACCESS[route];
  if (allowedRoles) {
    return allowedRoles.includes(normalizedRole as UserRole);
  }

  // Check dynamic route patterns
  for (const [pattern, roles] of Object.entries(ROUTE_ACCESS)) {
    if (pattern.includes(':')) {
      // Convert pattern like /candidate/:userId to regex /^\/candidate\/[^/]+$/
      const regexStr = '^' + pattern.replace(/:[^/]+/g, '[^/]+') + '$';
      if (new RegExp(regexStr).test(route)) {
        return roles.includes(normalizedRole as UserRole);
      }
    }
  }

  // No restriction defined — open to all
  return true;
}

/**
 * Check if a nav item should be visible for a given role.
 * Admin always sees everything.
 */
export function isNavVisible(role: string | undefined | null, path: string): boolean {
  if (!role) return false;
  if (role === 'admin') return true;

  // Legacy 'user' role maps to 'worker'
  const normalizedRole = role === 'user' ? 'worker' : role;

  const allowedRoles = NAV_VISIBILITY[path];
  if (!allowedRoles) return true; // Not restricted — show to all
  return allowedRoles.includes(normalizedRole as UserRole);
}

/**
 * Get the default redirect path for a role after login or when accessing unauthorized routes.
 */
export function getDefaultRoute(role: string | undefined | null): string {
  if (!role) return '/dashboard';
  switch (role) {
    case 'company':
      return '/company-dashboard';
    default:
      return '/dashboard';
  }
}

/**
 * Get a human-readable role label for sidebar badge display.
 */
export function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: 'ADMIN',
    community_moderator: 'COMMUNITY MODERATOR',
    jobs_moderator: 'JOBS MODERATOR',
    worker: 'WORKER',
    company: 'COMPANY',
    academy_instructor: 'INSTRUCTOR',
    user: 'WORKER',
  };
  return labels[role] ?? 'USER';
}

/**
 * Get preview role options for admin "View As" switcher.
 */
export const PREVIEW_ROLE_OPTIONS: { value: UserRole | 'admin'; label: string }[] = [
  { value: 'admin', label: 'Admin View' },
  { value: 'worker', label: 'Worker View' },
  { value: 'company', label: 'Company View' },
  { value: 'community_moderator', label: 'Community Moderator View' },
  { value: 'jobs_moderator', label: 'Jobs Moderator View' },
  { value: 'academy_instructor', label: 'Academy Instructor View' },
];