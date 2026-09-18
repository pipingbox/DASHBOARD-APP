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
 *   1. Static files (well-known, /sw.js, /assets/*, /catalog/*) are served by
 *      ASSETS. If a static path returns the SPA HTML fallback (because the file
 *      is missing), we turn it into a real 404.
 *   2. Paths matching SPA_ROUTE_CONTRACT receive the SPA shell (prerendered HTML
 *      if present, otherwise index.html from the static-assets fallback).
 *   3. Unknown HTML-document requests receive index.html with HTTP 404 so React
 *      boots and renders the branded NotFound UI, plus X-Robots-Tag noindex.
 *   4. Unknown non-document requests receive a minimal HTTP 404.
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

    const pathname = safeDecodePathname(url.pathname);

    // The static SPA loads runtime configuration before mounting React.
    // Preview has no separate API origin, so return the same-origin default
    // instead of allowing the legacy /api/config request to blank the app.
    if (pathname === '/api/config') {
      return new Response(JSON.stringify({ API_BASE_URL: '' }), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    // 1. Static files: let ASSETS serve, but never let a missing static file
    // fall back to the SPA shell.
    if (isStaticPath(pathname)) {
      const response = await env.ASSETS.fetch(request);
      if (
        response.status === 200 &&
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

    // 3. Unknown route.
    const acceptsHtml = request.headers.get('accept')?.includes('text/html');
    if (acceptsHtml) {
      // Serve the SPA shell with HTTP 404 so React Router renders the branded
      // NotFound UI. Preserve original URL (no redirect). Request the root path
      // because the ASSETS binding redirects /index.html to /.
      const indexRequest = new Request(`${url.origin}/`, request);
      const indexResponse = await env.ASSETS.fetch(indexRequest);
      const headers = new Headers(indexResponse.headers);
      headers.set('content-type', 'text/html; charset=utf-8');
      headers.set('x-robots-tag', 'noindex, nofollow');
      headers.delete('location');
      return new Response(indexResponse.body, {
        status: 404,
        statusText: 'Not Found',
        headers,
      });
    }

    return new Response('Not found', { status: 404 });
  },
};

function safeDecodePathname(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

function isStaticPath(pathname: string): boolean {
  if (STATIC_WELL_KNOWN_PATHS.has(pathname)) return true;
  return STATIC_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
