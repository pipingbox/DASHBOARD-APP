export interface Env {
  ASSETS: Fetcher;
}

// Cloudflare Workers Static Assets sirve archivos estaticos automaticamente y,
// gracias a `assets.not_found_handling = "single-page-application"` en
// wrangler.toml, cualquier ruta que no matchee un archivo estatico ya recibe
// index.html con 200 OK (fallback nativo para React Router).
// Este worker solo delega en ASSETS; existe como punto de extension futuro
// (p.ej. rutas /api/* que no se sirvan como estaticos).
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
