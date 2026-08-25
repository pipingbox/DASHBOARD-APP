export interface Env {
  ASSETS: Fetcher;
}

// ---------------------------------------------------------------------------
// PB-WEB-007 (2026-08-25): canonical redirect — app + www → pipingbox.com
// PB-WEB-008 (2026-08-25): satellite retirement, phase A.
//
// Worker Routes registered:
//   pipingbox.com/*            → serves the SPA
//   app.pipingbox.com/*        → 301, path preserved
//   www.pipingbox.com/*        → 301, path preserved
//   tools.pipingbox.com/*      → 301 → /tools
//   community.pipingbox.com/*  → 301 → /community
//   companies.pipingbox.com/*  → 301 → /companies
//   early.pipingbox.com/*      → 301 → /
//
// The former Cloudflare Redirect Rule (pipingbox.com → www) has been deleted.
// We own the full redirect chain here, 301 permanent.
//
// NOT retired yet (phase B, blocked by PB-WEB-003):
//   academy.pipingbox.com and jobs.pipingbox.com still expose a live /api/v1
//   backend (verified 401, reproducible). Their content has never been
//   inventoried or exported. Adding a route for them here would make those
//   backends unreachable by hostname before we know what they hold.
//   Do not add them until PB-WEB-003 is closed.
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
