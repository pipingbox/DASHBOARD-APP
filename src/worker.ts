import {
  SPA_ROUTE_CONTRACT,
  STATIC_ASSET_PREFIXES,
  STATIC_WELL_KNOWN_PATHS,
  matchSpaRoute,
} from '../SPA_ROUTE_CONTRACT';

export interface Env {
  ASSETS: Fetcher;
}

// Alias hosts: redirect to the canonical apex preserving the full path.
const ALIAS_HOSTS = new Set(['app.pipingbox.com', 'www.pipingbox.com']);

// Retired satellites: every path collapses onto one canonical section.
const SATELLITE_TARGETS: Record<string, string> = {
  'tools.pipingbox.com': '/tools',
  'community.pipingbox.com': '/community',
  'companies.pipingbox.com': '/companies',
  'early.pipingbox.com': '/',
  'jobs.pipingbox.com': '/jobs',
  'academy.pipingbox.com': '/academy',
};

const CANONICAL = 'https://pipingbox.com';

/**
 * PB-SEO-102: structural route validation at the edge.
 *
 * Flow per canonical request:
 *   1. Static well-known paths and asset-prefixes go to ASSETS (real 404 if missing).
 *   2. Paths matching SPA_ROUTE_CONTRACT receive the SPA shell (prerendered HTML
 *      if present, otherwise index.html from the static-assets fallback).
 *   3. Everything else returns HTTP 404.
 *
 * Auth/role enforcement remains client-side; the Worker only guards structural
 * validity so unknown routes no longer return 200 + index.html.
 */
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

    const pathname = decodeURIComponent(url.pathname);

    // 1. Unambiguous static assets: let ASSETS serve, but reject SPA-shell
    // fallbacks for missing assets under /assets/ or /catalog/.
    if (isStaticAsset(pathname)) {
      const response = await env.ASSETS.fetch(request);
      if (
        response.status === 200 &&
        isStaticAssetPrefix(pathname) &&
        response.headers.get('content-type')?.includes('text/html')
      ) {
        return new Response('Not found', { status: 404 });
      }
      return response;
    }

    // 2. SPA route contract: allow index.html (or prerendered HTML) to handle it.
    if (matchSpaRoute(pathname)) {
      return env.ASSETS.fetch(request);
    }

    // 3. Unknown route: real 404, never the SPA shell.
    return new Response('Not found', { status: 404 });
  },
};

function isStaticAsset(pathname: string): boolean {
  if (STATIC_WELL_KNOWN_PATHS.has(pathname)) return true;
  return isStaticAssetPrefix(pathname);
}

function isStaticAssetPrefix(pathname: string): boolean {
  return STATIC_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
