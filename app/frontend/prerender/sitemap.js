import fs from 'node:fs';
import path from 'node:path';
import { getBlogRoutes } from './blog-routes.js';
import { getSitemapLastmod } from './blog-sitemap.js';

// PB-OBSERVABILITY-PROD-ROLLOUT-001: replaces vite-plugin-sitemap.
//
// Root cause of the public-route contract failure (test 30): vite-plugin-sitemap
// 0.8.2 normalizes EVERY route to the slash-less form. Blog routes are
// prerendered directories whose canonical URL ends with '/' (see
// normalizeRouteFromMarkdown in utils.js and the SPA route contract), so the
// plugin emitted their non-canonical variants ('/blog/<slug>'), which 307
// redirect to the canonical form — sitemap URLs must never redirect.
//
// Canonical URL policy (single policy for router, sitemap and canonical links):
//   - '/' and blog routes (prerendered directories): trailing slash;
//   - every other app route: no trailing slash.
// This generator builds the sitemap from the same sources as the router and
// the prerenderer, so the three cannot drift apart again.

const HOSTNAME = 'https://pipingbox.com';

// PB-WEB-006: all public routes approved in PB-WEB-005 (F1 + F2).
// PB-SEO-101: legal/contact/certification routes added.
const APP_ROUTES = [
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

export function buildSitemapEntries() {
  const lastmod = getSitemapLastmod();
  const routes = ['/', ...APP_ROUTES, ...getBlogRoutes()].sort();

  return routes.map((route) => ({
    loc: `${HOSTNAME}${route}`,
    ...(lastmod[route] ? { lastmod: lastmod[route].toISOString().slice(0, 10) } : {}),
  }));
}

export function renderSitemapXml(entries) {
  const urls = entries
    .map((entry) => {
      const lastmod = entry.lastmod ? `\n    <lastmod>${entry.lastmod}</lastmod>` : '';
      return `  <url>\n    <loc>${entry.loc}</loc>${lastmod}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function pbExplicitSitemapPlugin() {
  let outPath = null;

  return {
    // PB-OBSERVABILITY-PROD-ROLLOUT-001: explicit sitemap generation with the
    // canonical trailing-slash policy. Replaces vite-plugin-sitemap, which
    // stripped trailing slashes from every URL (see module header).
    name: 'pb-explicit-sitemap',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outPath = path.resolve(config.root, config.build.outDir, 'sitemap.xml');
    },
    closeBundle() {
      fs.writeFileSync(outPath, renderSitemapXml(buildSitemapEntries()));
    },
  };
}
