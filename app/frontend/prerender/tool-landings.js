import { TOOL_LANDINGS } from '../src/lib/tool-landings';

/**
 * PB-SEO-103: prerender route list for the SEO tool landing pages.
 *
 * Each route is emitted with a '.html' suffix because vite-prerender-plugin
 * writes '<route>.html' as a standalone file (instead of '<route>/index.html')
 * when the queued URL ends with .html. Cloudflare static assets then serves
 * dist/tools/<slug>.html at the canonical extension-less URL /tools/<slug>
 * with HTTP 200 — no trailing-slash redirect, consistent with the canonical
 * URL policy in prerender/sitemap.js.
 *
 * The slugs come from the single canonical registry
 * (src/lib/tool-landings.ts), shared with the router, the route contract and
 * the sitemap, so prerendered routes and valid routes cannot drift apart.
 */
export function getToolLandingPrerenderRoutes() {
  return TOOL_LANDINGS.map((tool) => `/tools/${tool.slug}.html`);
}
