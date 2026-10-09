#!/usr/bin/env node
/**
 * PB-PIPE-COMB-CORRECTION-001 / P3-C — standalone PDF text extraction
 * helper for the Playwright E2E specs.
 *
 * Usage: node scripts/extract-pdf-text.mjs <file.pdf>
 * Prints a single JSON object { pages, text } on stdout.
 *
 * The E2E suite cannot import pdfjs-dist directly (Playwright's TS
 * transformer rewrites ESM imports to CJS requires, which the pdfjs
 * legacy ESM build does not support), so the specs shell out to this
 * script and parse its stdout. pdfjs-dist is a verification-only
 * devDependency of this repo, not an app dependency.
 */
import fs from 'node:fs';

/* Keep pdfjs load/render warnings off stdout: the consumer JSON-parses it. */
console.log = () => {};
console.warn = () => {};
console.info = () => {};

const [file] = process.argv.slice(2);
if (!file) {
  console.error('usage: extract-pdf-text.mjs <file.pdf>');
  process.exit(2);
}

const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
const data = new Uint8Array(fs.readFileSync(file));
const pdf = await getDocument({ data, useSystemFonts: true }).promise;
const pages = [];
for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const tc = await page.getTextContent();
  pages.push(tc.items.map((it) => it.str).join(' '));
}
process.stdout.write(JSON.stringify({ pages: pdf.numPages, text: pages.join('\n') }));
