export interface Env {
  ASSETS: Fetcher;
}

// ---------------------------------------------------------------------------
// PB-WEB-007 (2026-08-25): worker routes cover app, pipingbox.com and www.
//
// NOTE: The intended 301 redirect (app + www -> pipingbox.com apex) is NOT
// active here. Reason: Cloudflare has a Redirect Rule
//   pipingbox.com -> https://www.pipingbox.com  (302)
// that runs BEFORE Worker Routes in the Cloudflare processing chain. If the
// Worker also redirects pipingbox.com requests, a redirect loop occurs:
//
//   app -> 301 -> pipingbox.com
//             -> Redirect Rule 302 -> www.pipingbox.com
//             -> Worker 301 -> pipingbox.com
//             -> Redirect Rule 302 -> loop
//
// To enable the canonical apex redirect:
//   1. Delete the pipingbox.com -> www Redirect Rule in Cloudflare Dashboard
//      (Rules -> Redirect Rules).
//   2. Uncomment the REDIRECT_HOSTS logic below and redeploy.
//
// Current behaviour:
//   - app.pipingbox.com  -> serves SPA (via Worker + ASSETS)
//   - pipingbox.com      -> Redirect Rule 302 -> www.pipingbox.com -> Worker -> SPA
//   - www.pipingbox.com  -> serves SPA (via Worker + ASSETS)
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
