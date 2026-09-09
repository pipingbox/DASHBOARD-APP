/**
 * PB-SEO-102: route-contract drift guard.
 *
 * This script parses App.tsx and compares its declared routes against the
 * canonical SPA_ROUTE_CONTRACT. It is intended to run in CI so a new React
 * Router route cannot silently become a production 404 at the Worker edge.
 *
 * Modeled as a CLI so it can be invoked by `node scripts/route-contract-guard.js`
 * without pulling the full Vite/test toolchain.
 *
 * Current scope: static/exact and parameterized path strings. It deliberately
 * ignores wildcard routes and programmatic path construction; add those
 * manually to the contract if they are real application routes.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPA_ROUTE_CONTRACT } from '../SPA_ROUTE_CONTRACT.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appTsxPath = path.resolve(__dirname, '../app/frontend/src/App.tsx');
const contractPatterns = new Set(SPA_ROUTE_CONTRACT.map((r) => r.pattern));

// Extract every `path="..."` value from App.tsx.
const appSource = readFileSync(appTsxPath, 'utf8');
const appPaths = new Set<string>();
const pathRegex = /path\s*=\s*"([^"]+)"/g;
let match;
while ((match = pathRegex.exec(appSource)) !== null) {
  appPaths.add(match[1]);
}

const appNotInContract: string[] = [];
for (const appPath of appPaths) {
  // Wildcards and redirects inside React Router are not routable pages.
  if (appPath === '*') continue;
  if (!contractPatterns.has(appPath)) {
    appNotInContract.push(appPath);
  }
}

const contractNotInApp: string[] = [];
for (const contractPath of contractPatterns) {
  if (!appPaths.has(contractPath)) {
    contractNotInApp.push(contractPath);
  }
}

let failed = false;

if (appNotInContract.length > 0) {
  console.error('Route-contract drift detected. These App.tsx paths are missing from SPA_ROUTE_CONTRACT:');
  for (const p of appNotInContract) console.error(`  - ${p}`);
  failed = true;
}

if (contractNotInApp.length > 0) {
  console.error('Route-contract drift detected. These SPA_ROUTE_CONTRACT entries no longer exist in App.tsx:');
  for (const p of contractNotInApp) console.error(`  - ${p}`);
  failed = true;
}

if (failed) {
  process.exit(1);
}

console.log(`Route-contract drift guard PASS: ${appPaths.size} App.tsx path declarations <-> ${contractPatterns.size} SPA_ROUTE_CONTRACT entries are aligned.`);
