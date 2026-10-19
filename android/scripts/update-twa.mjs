import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const assetDir = fileURLToPath(new URL('../assets/', import.meta.url));
const twaDir = fileURLToPath(new URL('../twa/', import.meta.url));
const cli = fileURLToPath(new URL('../node_modules/@bubblewrap/cli/bin/bubblewrap.js', import.meta.url));
const port = 8791;
const allowed = new Set(['icon-512.png', 'icon-maskable-512.png', 'icon-monochrome-512.png']);

const server = createServer(async (req, res) => {
  const name = (req.url || '').slice(1);
  if (!allowed.has(name)) {
    res.writeHead(404).end();
    return;
  }
  try {
    const image = await readFile(join(assetDir, name));
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': image.length });
    res.end(image);
  } catch {
    res.writeHead(404).end();
  }
});

server.listen(port, '127.0.0.1', () => {
  const child = spawn(process.execPath, [cli, 'update', '--skipVersionUpgrade'], {
    cwd: twaDir,
    stdio: 'inherit',
  });
  child.on('exit', (code) => server.close(() => { process.exitCode = code ?? 1; }));
  child.on('error', (error) => {
    console.error(error);
    server.close(() => { process.exitCode = 1; });
  });
});
server.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
