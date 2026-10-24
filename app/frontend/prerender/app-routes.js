/**
 * PB-SEO-CRAWLER-CANONICAL-001: canonical registry of the public app routes.
 *
 * Root cause this module addresses: `APP_ROUTES` used to live inside
 * prerender/sitemap.js, so the sitemap advertised 14 URLs that the prerenderer
 * never rendered. Those URLs were served as the untouched index.html shell,
 * whose fallback `<link rel="canonical" href="https://pipingbox.com/">` is only
 * corrected by useSeo() AFTER JavaScript executes. A crawler that does not run
 * JS therefore received `canonical = /` for every one of them and treated them
 * as duplicates of the homepage.
 *
 * The list now lives here and is consumed by BOTH the sitemap generator and
 * the prerender queue, so a route can no longer be advertised without being
 * prerendered — the same single-source-of-truth rule that
 * src/lib/tool-landings.ts already enforces for the tool landings.
 *
 * Canonical URL policy (identical to prerender/sitemap.js):
 *   - '/' and blog routes (prerendered directories): trailing slash;
 *   - every other app route: no trailing slash.
 */

// PB-WEB-006: all public routes approved in PB-WEB-005 (F1 + F2).
// PB-SEO-101: legal/contact/certification routes added.
export const APP_ROUTES = [
  '/tools',
  '/academy',
  '/jobs',
  '/pricing',
  '/companies',
  '/companies/request-workers',
  '/contact',
  '/privacy',
  '/terms',
  '/dsa',
  '/certifications',
  '/certifications/vca',
  '/certifications/scc',
  '/certifications/prl',
];

/**
 * Prerender queue for the public app routes.
 *
 * Each route is emitted with a '.html' suffix because vite-prerender-plugin
 * writes '<route>.html' as a standalone file (instead of '<route>/index.html')
 * when the queued URL ends with .html. Cloudflare static assets then serves
 * dist/tools.html at the canonical extension-less URL /tools with HTTP 200 —
 * no trailing-slash redirect, matching the canonical URL policy above and the
 * mechanism already proven for /tools/<slug>.
 *
 * dist/tools.html and the dist/tools/ directory coexist without conflict: the
 * static-asset lookup for the extension-less path resolves the sibling .html
 * file, which is exactly how /tools/flange-dimensions already works today.
 */
export function getAppRoutePrerenderRoutes() {
  return APP_ROUTES.map((route) => `${route}.html`);
}
