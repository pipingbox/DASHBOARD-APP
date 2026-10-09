#!/usr/bin/env node
/**
 * PB-PIPE-COMB-CORRECTION-001 / P3-C (review fix F4).
 *
 * Regenerates `app/frontend/src/tools/prefabrication/pipe-comb/assets/
 * noto-sans-base64.ts` from the Noto Sans TTF files in the same directory
 * (SIL OFL 1.1, see OFL.txt). The exporter embeds the fonts as base64 so a
 * PDF export never performs a font request and behaves identically in dev,
 * build and test.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'app/frontend/src/tools/prefabrication/pipe-comb/assets',
);

const regular = fs.readFileSync(path.join(DIR, 'NotoSans-Regular.ttf'));
const bold = fs.readFileSync(path.join(DIR, 'NotoSans-Bold.ttf'));

const header = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * PB-PIPE-COMB-CORRECTION-001 / P3-C (review fix F4): Noto Sans embedded
 * as base64 for the fabrication PDF exporter.
 *
 * Source fonts: NotoSans-Regular.ttf / NotoSans-Bold.ttf (same directory),
 * SIL Open Font License 1.1 (see OFL.txt), from the official
 * notofonts/latin-greek-cyrillic release. Embedding the base64 in the
 * bundle guarantees zero font requests at export time, identical bytes in
 * dev/build/test and no separately distributed font files.
 *
 * Regenerate with: node scripts/gen-pipe-comb-pdf-fonts.mjs
 */
`;

const out = `${header}export const NOTO_SANS_REGULAR_B64 =\n  '${regular.toString('base64')}';\n\nexport const NOTO_SANS_BOLD_B64 =\n  '${bold.toString('base64')}';\n`;

fs.writeFileSync(path.join(DIR, 'noto-sans-base64.ts'), out);
console.log(`noto-sans-base64.ts written (${out.length} chars, regular ${regular.length} B, bold ${bold.length} B)`);
