import fs from 'node:fs';
import path from 'node:path';

/**
 * PB-SEO-103: dedupe the <head> of prerendered HTML files.
 *
 * vite-prerender-plugin APPENDS the page-specific head elements (canonical,
 * description, og:*, twitter:*) returned by the prerender script, but the
 * index.html template already carries its own generic versions of those tags
 * for the SPA shell. The result is duplicate head tags where the TEMPLATE
 * version comes first — and crawlers honor the FIRST canonical, so every
 * prerendered page canonicalized to the homepage (verified in production for
 * /blog/* before this fix; the same would happen to /tools/* pages).
 *
 * This plugin runs in closeBundle (after the prerender plugin wrote the
 * files) and, for every prerendered file (identified by the
 * `prerender-static-page` marker inserted by prerender/public.js and
 * prerender/blog.js), removes the template-inherited canonical / description
 * / og:* / twitter:* tags that appear BEFORE the marker. The page-specific
 * tags after the marker are the only survivors, so each prerendered page
 * serves exactly one canonical pointing to itself.
 *
 * The template tags stay untouched in the non-prerendered SPA shell
 * (dist/index.html), keeping the homepage's social/meta preview intact.
 */

// Tags the prerender scripts re-emit per page. Anything of these shapes
// before the marker is a template leftover.
const TEMPLATE_TAG_RE =
  /<link\s+rel="canonical"[^>]*>\s*|<meta\s+name="description"[^>]*>\s*|<meta\s+property="og:[^"]*"[^>]*>\s*|<meta\s+name="twitter:[^"]*"[^>]*>\s*/g;

const MARKER = '<meta name="prerender-static-page"';

function dedupeHead(html) {
  const markerIndex = html.indexOf(MARKER);
  if (markerIndex === -1) return html;

  const headStart = html.indexOf('<head');
  const headEnd = html.indexOf('</head>');
  if (headStart === -1 || headEnd === -1 || markerIndex > headEnd) return html;

  const head = html.slice(headStart, headEnd);
  const markerInHead = head.indexOf(MARKER);
  if (markerInHead === -1) return html;

  const before = head.slice(0, markerInHead);
  const after = head.slice(markerInHead);
  const cleanedBefore = before.replace(TEMPLATE_TAG_RE, '');

  return html.slice(0, headStart) + cleanedBefore + after + html.slice(headEnd);
}

export function pbPrerenderHeadDedupePlugin() {
  return {
    name: 'pb-prerender-head-dedupe',
    apply: 'build',
    closeBundle() {
      // __dirname resolves to app/frontend/prerender when Vite bundles the
      // config; dist is one level up.
      const distDir = path.resolve(__dirname, '..', 'dist');
      if (!fs.existsSync(distDir)) {
        console.warn('[pb-prerender-head-dedupe] dist not found at', distDir);
        return;
      }
      let processed = 0;
      let rewritten = 0;

      const visit = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            visit(full);
          } else if (entry.isFile() && entry.name.endsWith('.html')) {
            const html = fs.readFileSync(full, 'utf-8');
            if (!html.includes(MARKER)) continue;
            processed++;
            const deduped = dedupeHead(html);
            if (deduped !== html) {
              fs.writeFileSync(full, deduped);
              rewritten++;
            }
          }
        }
      };
      visit(distDir);
      console.log(`[pb-prerender-head-dedupe] processed ${processed} prerendered pages, rewrote ${rewritten}`);
    },
  };
}
