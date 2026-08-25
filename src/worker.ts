export interface Env {
  ASSETS: Fetcher;
}

// ---------------------------------------------------------------------------
// PB-WEB-007 (2026-08-25): hostname canonical cutover to pipingbox.com (apex).
//
// Routing logic:
//  - app.pipingbox.com  -> 301 permanent redirect to https://pipingbox.com{path}
//  - www.pipingbox.com  -> 301 permanent redirect to https://pipingbox.com{path}
//  - pipingbox.com      -> serve the SPA (canonical host)
//
// Redirect is 301 (permanent) because there are zero active sessions and we want
// search engines to transfer all signals immediately.
// Rollback: revert this file and redeploy; routes in wrangler.toml stay the same.
// ---------------------------------------------------------------------------

const CANONICAL_HOST = 'pipingbox.com';
const REDIRECT_HOSTS = new Set(['app.pipingbox.com', 'www.pipingbox.com']);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Permanent redirect aliases -> canonical
    if (REDIRECT_HOSTS.has(url.hostname)) {
      const canonical = `https://${CANONICAL_HOST}${url.pathname}${url.search}${url.hash}`;
      return Response.redirect(canonical, 301);
    }

    // Canonical host: serve the SPA.
    return env.ASSETS.fetch(request);
  },
};
