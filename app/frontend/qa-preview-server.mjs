/**
 * Local preview server for PB-DOCUMENT-UPLOAD-RELIABILITY-001 QA runs.
 * Serves app/frontend/dist statically and forwards /api/config to the
 * deployed Cloudflare function (missing from `vite preview`, causing 500s
 * that break the app's runtime-config bootstrap in cv-upload-smoke).
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const DIST = join(import.meta.dirname, 'dist');
const PORT = Number(process.env.PORT || 4174);
const UPSTREAM_CONFIG = 'https://pipingbox.app/api/config';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  if (url.pathname === '/api/config') {
    try {
      const up = await fetch(UPSTREAM_CONFIG, { headers: { accept: 'application/json' } });
      const body = await up.text();
      res.writeHead(up.status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(body);
    } catch (err) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'config upstream unreachable' }));
    }
    return;
  }

  let path = url.pathname;
  if (path.endsWith('/')) path += 'index.html';
  let file = normalize(join(DIST, path));
  if (!file.startsWith(DIST)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    // SPA fallback
    try {
      const index = await readFile(join(DIST, 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(index);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`preview+config listening on http://127.0.0.1:${PORT}`);
});
