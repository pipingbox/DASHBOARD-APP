/**
 * SPA_ROUTE_CONTRACT — canonical routing truth for both React Router (App.tsx)
 * and the Cloudflare Worker (src/worker.ts).
 *
 * PB-SEO-102: structural soft-404 prevention. The Worker uses this contract to
 * decide whether a path should receive the SPA shell (and optional prerendered
 * HTML), or a real HTTP 404.
 *
 * This file is pure data (no browser-only imports) so it can be imported by:
 *   - src/worker.ts (Cloudflare Worker runtime)
 *   - app/frontend/src/App.tsx drift guard
 *   - future sitemap/prerender generators (public routes derive from visibility=PUBLIC)
 *
 * Keep it in sync with App.tsx. A CI guard checks for drift.
 */

export type RouteVisibility =
  | 'PUBLIC'    // indexable, accessible without session
  | 'GUEST'     // only for non-authenticated users (login/register)
  | 'PROTECTED' // requires a session (worker does NOT enforce auth)
  | 'COMPANY'   // company-scoped, requires company role in-app
  | 'ADMIN';    // admin-only

export type RouteKind =
  | 'EXACT'
  | 'DYNAMIC'
  | 'LEGACY_REDIRECT'; // matched but only issues a client redirect

export interface RouteRule {
  /** Path pattern. Use :param syntax for dynamic segments. */
  pattern: string;
  /** Visibility classification. */
  visibility: RouteVisibility;
  /** Static exact route vs dynamic family. */
  kind: RouteKind;
  /** Optional structural validation for dynamic segments (pathname already normalized, no trailing slash). */
  validate?: (path: string, params: Record<string, string>) => boolean;
  /** Human-readable note for drift documentation. */
  note?: string;
}

// Legacy numeric module IDs accepted by AcademyModuleLegacyRedirect.
const LEGACY_MODULE_IDS = /^([1-9]|1[0-9]|2[0-2])$/;

// Sensible slug / ID shapes. Keep permissive enough for existing content but
// restrictive enough to block random invalid paths.
const SLUG_RE = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/i;
const UUID_OR_SHORTID_RE = /^[a-zA-Z0-9_-]{8,128}$/;

export const SPA_ROUTE_CONTRACT: RouteRule[] = [
  // ─── PUBLIC exact routes ───────────────────────────────────────────────────
  { pattern: '/', visibility: 'PUBLIC', kind: 'EXACT' },
  { pattern: '/blog', visibility: 'PUBLIC', kind: 'EXACT', note: 'blog index, prerendered' },
  { pattern: '/pricing', visibility: 'PUBLIC', kind: 'EXACT' },
  { pattern: '/tools', visibility: 'PUBLIC', kind: 'EXACT' },
  { pattern: '/jobs', visibility: 'PUBLIC', kind: 'EXACT' },
  { pattern: '/companies', visibility: 'PUBLIC', kind: 'EXACT' },
  { pattern: '/companies/request-workers', visibility: 'PUBLIC', kind: 'EXACT' },
  { pattern: '/certifications', visibility: 'PUBLIC', kind: 'EXACT' },
  { pattern: '/certifications/vca', visibility: 'PUBLIC', kind: 'EXACT' },
  { pattern: '/certifications/scc', visibility: 'PUBLIC', kind: 'EXACT' },
  { pattern: '/certifications/prl', visibility: 'PUBLIC', kind: 'EXACT' },
  { pattern: '/certificaciones/prl', visibility: 'PUBLIC', kind: 'EXACT', note: 'Spanish PRL canonical alias' },
  { pattern: '/academy', visibility: 'PUBLIC', kind: 'EXACT' },
  { pattern: '/academy/vca-course', visibility: 'PUBLIC', kind: 'EXACT' },
  { pattern: '/academy/vca-booking', visibility: 'PUBLIC', kind: 'EXACT' },
  { pattern: '/academy/scc-course', visibility: 'PUBLIC', kind: 'EXACT' },
  { pattern: '/academy/prl-course', visibility: 'PUBLIC', kind: 'EXACT' },
  { pattern: '/privacy', visibility: 'PUBLIC', kind: 'EXACT' },
  { pattern: '/terms', visibility: 'PUBLIC', kind: 'EXACT' },
  { pattern: '/dsa', visibility: 'PUBLIC', kind: 'EXACT' },
  { pattern: '/contact', visibility: 'PUBLIC', kind: 'EXACT' },

  // ─── PUBLIC dynamic routes ─────────────────────────────────────────────────
  {
    pattern: '/blog/:slug',
    visibility: 'PUBLIC',
    kind: 'DYNAMIC',
    validate: (_path, params) => SLUG_RE.test(params.slug ?? ''),
    note: 'blog post, prerendered for known slugs; unknown slug serves 404 UI',
  },
  {
    pattern: '/worker/:id',
    visibility: 'PUBLIC',
    kind: 'DYNAMIC',
    validate: (_path, params) => UUID_OR_SHORTID_RE.test(params.id ?? ''),
    note: 'public worker profile; resource existence not validated at edge',
  },

  // ─── GUEST routes ──────────────────────────────────────────────────────────
  { pattern: '/login', visibility: 'GUEST', kind: 'EXACT' },
  { pattern: '/register', visibility: 'GUEST', kind: 'EXACT' },
  { pattern: '/forgot-password', visibility: 'GUEST', kind: 'EXACT' },
  { pattern: '/reset-password', visibility: 'GUEST', kind: 'EXACT', note: 'token handled via query string' },

  // ─── PROTECTED exact routes ────────────────────────────────────────────────
  { pattern: '/dashboard', visibility: 'PROTECTED', kind: 'EXACT' },
  { pattern: '/profile', visibility: 'PROTECTED', kind: 'EXACT' },
  { pattern: '/applications', visibility: 'PROTECTED', kind: 'EXACT' },
  { pattern: '/messages', visibility: 'PROTECTED', kind: 'EXACT' },
  { pattern: '/content-drafts', visibility: 'PROTECTED', kind: 'EXACT' },
  { pattern: '/community', visibility: 'PROTECTED', kind: 'EXACT' },

  // ─── COMPANY exact routes ──────────────────────────────────────────────────
  { pattern: '/company-dashboard', visibility: 'COMPANY', kind: 'EXACT' },
  { pattern: '/enterprise-dashboard', visibility: 'COMPANY', kind: 'EXACT' },
  { pattern: '/company/jobs', visibility: 'COMPANY', kind: 'EXACT' },
  { pattern: '/company/post-job', visibility: 'COMPANY', kind: 'EXACT' },
  { pattern: '/company/candidates', visibility: 'COMPANY', kind: 'EXACT' },
  { pattern: '/company/workers-search', visibility: 'COMPANY', kind: 'EXACT' },
  { pattern: '/company/workforce-requests', visibility: 'COMPANY', kind: 'EXACT' },
  { pattern: '/company/documentation', visibility: 'COMPANY', kind: 'EXACT' },
  { pattern: '/company/profile', visibility: 'COMPANY', kind: 'EXACT' },
  { pattern: '/company/analytics', visibility: 'COMPANY', kind: 'EXACT' },
  { pattern: '/company/settings', visibility: 'COMPANY', kind: 'EXACT' },
  { pattern: '/company/billing', visibility: 'COMPANY', kind: 'EXACT' },

  // ─── ADMIN exact routes ────────────────────────────────────────────────────
  { pattern: '/admin', visibility: 'ADMIN', kind: 'EXACT' },

  // ─── PROTECTED dynamic routes ──────────────────────────────────────────────
  {
    pattern: '/academy/course/:slug',
    visibility: 'PROTECTED',
    kind: 'DYNAMIC',
    validate: (_path, params) => SLUG_RE.test(params.slug ?? ''),
    note: 'course detail; resource existence not validated at edge',
  },
  {
    pattern: '/academy/lesson/:lessonId',
    visibility: 'PROTECTED',
    kind: 'DYNAMIC',
    validate: (_path, params) => UUID_OR_SHORTID_RE.test(params.lessonId ?? ''),
    note: 'lesson view; resource existence not validated at edge',
  },
  {
    pattern: '/academy/module/:moduleId',
    visibility: 'PROTECTED',
    kind: 'DYNAMIC',
    validate: (_path, params) => LEGACY_MODULE_IDS.test(params.moduleId ?? ''),
    note: 'module 1-22',
  },
  {
    pattern: '/academy/exam/:examType',
    visibility: 'PROTECTED',
    kind: 'DYNAMIC',
    validate: (_path, params) => SLUG_RE.test(params.examType ?? ''),
    note: 'vca/scc/prl/etc.',
  },
  {
    pattern: '/academy/:moduleId',
    visibility: 'PROTECTED',
    kind: 'LEGACY_REDIRECT',
    validate: (_path, params) => LEGACY_MODULE_IDS.test(params.moduleId ?? ''),
    note: 'legacy alias /academy/:moduleId numeric 1-22 -> /academy/module/:moduleId (client redirect)',
  },
  {
    pattern: '/community/:channelSlug',
    visibility: 'PROTECTED',
    kind: 'DYNAMIC',
    validate: (_path, params) => SLUG_RE.test(params.channelSlug ?? ''),
    note: 'channel; resource existence not validated at edge',
  },
  {
    pattern: '/community/:channelSlug/post/:postId',
    visibility: 'PROTECTED',
    kind: 'DYNAMIC',
    validate: (_path, params) =>
      SLUG_RE.test(params.channelSlug ?? '') && UUID_OR_SHORTID_RE.test(params.postId ?? ''),
    note: 'post; resource existence not validated at edge',
  },
  {
    pattern: '/candidate/:userId',
    visibility: 'COMPANY',
    kind: 'DYNAMIC',
    validate: (_path, params) => UUID_OR_SHORTID_RE.test(params.userId ?? ''),
    note: 'candidate profile; resource existence not validated at edge',
  },
];

// Static well-known paths that must be served from ASSETS and never fall back to SPA.
export const STATIC_WELL_KNOWN_PATHS = new Set([
  '/robots.txt',
  '/sitemap.xml',
  '/site.webmanifest',
  '/.well-known/assetlinks.json',
]);

// Prefixes that are unambiguously static assets (built JS/CSS/images/fonts).
export const STATIC_ASSET_PREFIXES = [
  '/assets/',
  '/catalog/',
];

/**
 * Match a normalized pathname against the route contract.
 * Returns the matched rule + parsed params, or null.
 */
export function matchSpaRoute(pathname: string): { rule: RouteRule; params: Record<string, string> } | null {
  const normalized = pathname.replace(/\/$/, '') || '/';

  for (const rule of SPA_ROUTE_CONTRACT) {
    const params = matchPattern(rule.pattern, normalized);
    if (params === null) continue;
    if (rule.validate && !rule.validate(normalized, params)) continue;
    return { rule, params };
  }
  return null;
}

function matchPattern(pattern: string, pathname: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);

  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const part = patternParts[i];
    if (part.startsWith(':')) {
      params[part.slice(1)] = pathParts[i];
    } else if (part !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

/**
 * Derive the list of PUBLIC exact routes for sitemaps / prerender.
 */
export function getPublicExactRoutes(): string[] {
  return SPA_ROUTE_CONTRACT.filter(
    (r) => r.visibility === 'PUBLIC' && r.kind === 'EXACT',
  ).map((r) => r.pattern);
}
