export interface Env {
  ASSETS: Fetcher;
}

// ---------------------------------------------------------------------------
// PB-WEB-007 (2026-08-25): canonical redirect — app + www → pipingbox.com
//
// Worker Routes registered:
//   app.pipingbox.com/*   → this worker (pipingbox-app-prod)
//   www.pipingbox.com/*   → this worker
//   pipingbox.com/*       → this worker
//
// The former Cloudflare Redirect Rule (pipingbox.com → www) has been deleted.
// We now own the full redirect chain here, 301 permanent.
// ---------------------------------------------------------------------------

const REDIRECT_HOSTS = new Set(['app.pipingbox.com', 'www.pipingbox.com']);
const CANONICAL = 'https://pipingbox.com';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (REDIRECT_HOSTS.has(url.hostname)) {
      const destination = CANONICAL + url.pathname + url.search + url.hash;
      return Response.redirect(destination, 301);
    }

    return env.ASSETS.fetch(request);
  },
};
