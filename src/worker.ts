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
//   (academy.pipingbox.com is NOT routed here — see PB-WEB-002 note below)
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
// PB-WEB-002 — attempted SEO containment for academy, ROLLED BACK 2026-08-25.
//
// The plan was to route academy.pipingbox.com/* through this Worker, proxy the
// legacy origin with fetch(request) and add X-Robots-Tag: noindex.
//
// It regressed: academy served the CANONICAL SPA instead of its own content.
//
// Root cause: this Worker has a Static Assets binding. Cloudflare resolves a
// matching asset — including the single-page-application fallback to
// index.html — BEFORE the Worker script runs. So for real page paths the
// pass-through branch never executed and academy got this app's index.html.
// Only paths with no asset match (/_cb-<random>) reached the Worker, which is
// exactly why the first verification probe looked green. Probing a synthetic
// uncached path is the right way to defeat edge cache, but it is the wrong way
// to validate asset-serving behaviour: it exercises a different code path.
//
// Conclusion: a Worker with an ASSETS binding cannot transparently proxy a
// foreign origin. Adding noindex to academy requires a mechanism outside this
// Worker — a Cloudflare Transform Rule (Modify Response Header), or a change
// at the Atoms origin.
// ---------------------------------------------------------------------------

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

    return env.ASSETS.fetch(request);
  },
};
