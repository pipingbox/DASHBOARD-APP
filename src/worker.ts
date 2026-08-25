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
//   academy.pipingbox.com/*    → pass-through + X-Robots-Tag (NOT a redirect)
//
// The former Cloudflare Redirect Rule (pipingbox.com → www) has been deleted.
// We own the full redirect chain here, 301 permanent.
//
// NOT retired yet (phase B, blocked by PB-WEB-003):
//   academy.pipingbox.com and jobs.pipingbox.com still expose a live /api/v1
//   backend. Their storage buckets and auth users have not been inventoried,
//   so neither host may be redirected yet. academy is routed here ONLY to
//   inject a noindex header; its content and origin are untouched.
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
};

// ---------------------------------------------------------------------------
// PB-WEB-002 — reversible SEO containment.
//
// academy.pipingbox.com is a live, fully indexable legacy site competing with
// the canonical domain, and it serves /blog: an empty shadcn/ui starter
// scaffold titled "Blog | shadcnui", declared in its sitemap with priority 1.0.
// It cannot be redirected yet (PB-WEB-008 phase B is blocked by PB-WEB-003).
//
// So we do the minimum reversible thing: proxy the origin response untouched
// and add a noindex header. No redirect, no content change, no origin change.
//
// Per Cloudflare's Routes documentation, calling fetch() on the incoming
// Request from a Worker mounted on a *Route* issues a subrequest to the
// application server defined in the zone's DNS — it does NOT re-invoke this
// Worker. (This differs from Custom Domains, where it would loop.)
//
// Rollback: remove 'academy.pipingbox.com' below and drop its route block from
// wrangler.toml, then redeploy. The origin is never modified.
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
      // Fail open: if anything goes wrong reaching the origin, serve the
      // original response rather than turning a live host into an error page.
      const originResponse = await fetch(request);
      try {
        const tagged = new Response(originResponse.body, originResponse);
        tagged.headers.set('X-Robots-Tag', 'noindex, nofollow');
        return tagged;
      } catch {
        return originResponse;
      }
    }

    return env.ASSETS.fetch(request);
  },
};
