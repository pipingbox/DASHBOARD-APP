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
const CANONICAL_HOST = 'pipingbox.com';

/**
 * PB-PWA-IDENTITY-001: the installed app must never be confusable with another
 * deployment.
 *
 * `site.webmanifest` declares `start_url: "/"` and `scope: "/"`, both relative,
 * so the SAME manifest installs under whatever origin served it. Preview and
 * production therefore produced two installed apps with identical name, icons
 * and identity, while intentionally running different commits — an installed
 * app then shows a different version than the browser with nothing on screen
 * explaining why.
 *
 * Fix: only the canonical production host gets the manifest untouched. Any
 * other origin (preview Worker subdomain, local, ad-hoc) gets a marked name
 * and its own `id`, so the browser treats it as a separate installable app and
 * the launcher entry says which deployment it is.
 *
 * Production identity is deliberately NOT modified: no `id` is injected for the
 * canonical host, so already-installed production apps keep resolving their
 * identity from `start_url` exactly as before.
 */
async function serveManifest(request: Request, env: Env, url: URL): Promise<Response> {
  const response = await env.ASSETS.fetch(request);
  if (url.hostname === CANONICAL_HOST || !response.ok) return response;

  let manifest: Record<string, unknown>;
  try {
    manifest = await response.json();
  } catch {
    return response;
  }

  const label = url.hostname.endsWith('.workers.dev') ? 'Preview' : 'Non-production';
  manifest.name = `PipingBox ${label} — do not use for production data`;
  manifest.short_name = `PipingBox ${label}`;
  // Same-origin id: keeps this deployment a distinct installable app.
  manifest.id = `/?deployment=${label.toLowerCase()}`;

  const headers = new Headers(response.headers);
  headers.delete('etag');
  headers.delete('content-length');
  headers.set('content-type', 'application/manifest+json; charset=utf-8');
  return new Response(JSON.stringify(manifest), { status: 200, headers });
}

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
      // PB-PWA-IDENTITY-001: the manifest carries the installed-app identity,
      // so non-production origins must not hand out the production identity.
      if (pathname === '/site.webmanifest') {
        return serveManifest(request, env, url);
      }
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
