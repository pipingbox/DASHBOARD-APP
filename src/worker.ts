export interface Env {
  ASSETS: Fetcher;
}

// ---------------------------------------------------------------------------
// PB-WEB-007 (2026-08-25): canonical redirect — app + www → pipingbox.com
// PB-WEB-008 (2026-08-25): satellite retirement, phase A.
// PB-WEB-002 (2026-08-25): SEO containment for academy (see NOINDEX_HOSTS).
//
// Worker Routes registered:
//   pipingbox.com/*            → serves the SPA
//   app.pipingbox.com/*        → 301, path preserved
//   www.pipingbox.com/*        → 301, path preserved
//   tools.pipingbox.com/*      → 301 → /tools
//   community.pipingbox.com/*  → 301 → /community
//   companies.pipingbox.com/*  → 301 → /companies
//   early.pipingbox.com/*      → 301 → /
//   jobs.pipingbox.com/*       → 301 → /jobs        (phase B)
//   academy.pipingbox.com/*    → pass-through + noindex, NOT a redirect
//
// The former Cloudflare Redirect Rule (pipingbox.com → www) has been deleted.
// We own the full redirect chain here, 301 permanent.
//
// Phase B status (PB-WEB-003 closed its data gate 2026-08-25 — Atoms inventory
// returned 0 storage buckets, 0 objects and no end users on either project):
//   jobs    → retired. It held no data and no content of its own; it was
//             already a bridge page pointing at the canonical app.
//   academy → NOT retired. It still holds the only content worth migrating
//             (copy in 6 languages + 5 CDN images, see PB-WEB-010). It stays
//             served from its own origin with a noindex header until that
//             migration lands.
// ---------------------------------------------------------------------------

const CANONICAL = 'https://pipingbox.com';

// Alias hosts: redirect to the canonical apex preserving the full path.
const ALIAS_HOSTS = new Set(['app.pipingbox.com', 'www.pipingbox.com']);

// Retired satellites: every path collapses onto one canonical section.
// Collapsing (instead of preserving the path) is deliberate — the satellites'
// internal URL structure does not match this app's routes, so preserving the
// path would 301 straight into a 404.
const SATELLITE_TARGETS: Record<string, string> = {
  'tools.pipingbox.com': '/tools',
  'community.pipingbox.com': '/community',
  'companies.pipingbox.com': '/companies',
  'early.pipingbox.com': '/',
  'jobs.pipingbox.com': '/jobs',
};

// ---------------------------------------------------------------------------
// PB-WEB-002 — reversible SEO containment for academy.
//
// academy.pipingbox.com is a live, fully indexable legacy site competing with
// the canonical domain, and it serves /blog: an empty shadcn/ui starter
// scaffold titled "Blog | shadcnui", declared in its sitemap with priority 1.0.
// It cannot be redirected yet (PB-WEB-008 phase B is blocked by PB-WEB-003).
//
// So we do the minimum reversible thing: proxy the Atoms origin response
// untouched and add a noindex header. No redirect, no content change, and no
// change at the origin.
//
// fetch(request) reaches the legacy origin rather than looping: per
// Cloudflare's Routes behaviour a subrequest to a URL matching the Worker's
// own *Route* goes to the application server defined in the zone's DNS.
// Verified in production — the proxied response carries the origin's
// cf-cache-status: DYNAMIC, not an edge-cached artefact.
//
// REQUIRES assets.run_worker_first = true in wrangler.toml. Without it,
// Cloudflare resolves a matching static asset — including the SPA fallback to
// index.html — before this script runs, and academy silently receives THIS
// app's index.html. That regression happened on 2026-08-25 and is the whole
// reason the flag is set. Note the diagnostic trap: probing a synthetic
// uncached path (/_cb-<ts>) defeats edge cache but has no asset match, so it
// exercises the Worker while real page paths never reach it. It reported green
// while the site was broken. Always diff real page bytes against a baseline.
//
// Rollback: removing this branch is NOT sufficient. While the route exists the
// default branch would serve academy this app's assets. The route itself must
// be deleted in the Cloudflare dashboard — `wrangler deploy` cannot delete
// routes with the current token.
// ---------------------------------------------------------------------------
const NOINDEX_HOSTS = new Set(['academy.pipingbox.com']);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (ALIAS_HOSTS.has(url.hostname)) {
      return Response.redirect(
        CANONICAL + url.pathname + url.search + url.hash,
        301,
      );
    }

    const satelliteTarget = SATELLITE_TARGETS[url.hostname];
    if (satelliteTarget) {
      return Response.redirect(CANONICAL + satelliteTarget, 301);
    }

    if (NOINDEX_HOSTS.has(url.hostname)) {
      const originResponse = await fetch(request);
      try {
        const tagged = new Response(originResponse.body, originResponse);
        tagged.headers.set('X-Robots-Tag', 'noindex, nofollow');
        return tagged;
      } catch {
        // Fail open: serve the origin response unmodified rather than turn a
        // live host into an error page.
        return originResponse;
      }
    }

    return env.ASSETS.fetch(request);
  },
};
