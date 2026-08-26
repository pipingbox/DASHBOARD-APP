export interface Env {
  ASSETS: Fetcher;
}

// ---------------------------------------------------------------------------
// PB-WEB-007 (2026-08-25): canonical redirect — app + www → pipingbox.com
// PB-WEB-008 (2026-08-25): satellite retirement, phase A.
// PB-WEB-008 (2026-08-26): satellite retirement, phase B — academy retired.
// PB-WEB-002 (2026-08-25): SEO containment for academy (superseded by phase B).
//
// Worker Routes registered:
//   pipingbox.com/*            → serves the SPA
//   app.pipingbox.com/*        → 301, path preserved
//   www.pipingbox.com/*        → 301, path preserved
//   tools.pipingbox.com/*      → 301 → /tools
//   community.pipingbox.com/*  → 301 → /community
//   companies.pipingbox.com/*  → 301 → /companies
//   early.pipingbox.com/*      → 301 → /
//   jobs.pipingbox.com/*       → 301 → /jobs        (retired phase B, 2026-08-25)
//   academy.pipingbox.com/*    → 301 → /academy     (retired phase B, 2026-08-26)
//
// The former Cloudflare Redirect Rule (pipingbox.com → www) has been deleted.
// We own the full redirect chain here, 301 permanent.
//
// Phase B complete (2026-08-26):
//   jobs    → retired 2026-08-25. No data, no content of its own.
//   academy → retired 2026-08-26. PB-WEB-010 complete (copy + assets migrated);
//             PB-SEC-PUBLIC-READ-001 resolved (canonical serves real content);
//             C1/C2/C3 PASS; C5 PENDING-MANUAL (Atoms Auth 0 users confirmed
//             via /api/v1/courses 404 — no active courses on legacy backend).
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
  'academy.pipingbox.com': '/academy',
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
