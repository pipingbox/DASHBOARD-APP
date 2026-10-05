/* PB-BRANCH-INJERTO-EXPANSION-001 U5.4 — review artifact generator (§31).
   Writes the CODO → TUBO fabrication PDFs (receiver PICAJE TEMPLATE 1:1 and
   ELBOW MARKING GUIDE) for the reference and large cases to an output
   directory, using the real English i18n labels through the same PDF-safe
   label layer the panel uses. Run with:
     node --experimental-strip-types scripts/generate-elbow-on-pipe-artifacts.ts [outDir]
   Default outDir: C:/tmp/u54 (or /tmp/u54 outside Windows). */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeElbowOnPipe } from '../app/frontend/src/tools/branch/elbowOnPipeGeometry.ts';
import type { ElbowOnPipeInput } from '../app/frontend/src/tools/branch/elbowOnPipeGeometry.ts';
import { buildElbowOnPipeReceiverTemplate } from '../app/frontend/src/tools/branch/elbowOnPipeReceiverTemplateSvg.ts';
import { buildElbowOnPipeMarkingGuide } from '../app/frontend/src/tools/branch/elbowOnPipeMarkingGuideSvg.ts';
import { buildElbowOnPipePdfLabels } from '../app/frontend/src/tools/branch/elbowOnPipePdfLabels.ts';
import { svgPagesToPdf } from '../app/frontend/src/tools/branch/svgMmToPdf.ts';
import type { PdfPageFormatId } from '../app/frontend/src/tools/branch/pdfPageFormat.ts';

const outDir = process.argv[2] ?? (process.platform === 'win32' ? 'C:/tmp/u54' : '/tmp/u54');
mkdirSync(outDir, { recursive: true });

const en = JSON.parse(readFileSync(new URL('../app/frontend/src/i18n/locales/en.json', import.meta.url), 'utf8')) as Record<string, unknown>;
const translate = (key: string): string => {
  let node: unknown = en;
  for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
  if (typeof node !== 'string') throw new Error(`missing i18n key en:${key}`);
  return node;
};

const REF = { elbowInnerDiameterMm: 77.92, elbowOuterDiameterMm: 88.9, elbowCentrelineRadiusMm: 114.3, receiverOuterDiameterMm: 168.3, divisions: 24 } as const;
const BIG = { elbowInnerDiameterMm: 303.2, elbowOuterDiameterMm: 323.8, elbowCentrelineRadiusMm: 457.2, receiverOuterDiameterMm: 508, divisions: 48 } as const;

interface Job {
  file: string;
  kind: 'receiver' | 'guide';
  input: ElbowOnPipeInput;
  format: PdfPageFormatId;
  yPrimeMm?: number | null;
  elbowLabel: string;
  receiverLabel: string;
  datumLabel: string;
}

const refElbow = '3" Sch 40 · OD 88.9 mm · ID 77.92 mm · R 114.3 mm';
const refReceiver = '6" · D 168.3 mm';
const bigElbow = '12" Sch 40 · OD 323.8 mm · ID 303.2 mm · R 457.2 mm';
const bigReceiver = '20" · D 508 mm';

const jobs: Job[] = [
  { file: 'ref-receiver-EJE-A4.pdf', kind: 'receiver', input: { ...REF, datum: { type: 'EJE' } }, format: 'A4', elbowLabel: refElbow, receiverLabel: refReceiver, datumLabel: 'EJE' },
  { file: 'ref-receiver-BOP-A4.pdf', kind: 'receiver', input: { ...REF, datum: { type: 'BOP' } }, format: 'A4', elbowLabel: refElbow, receiverLabel: refReceiver, datumLabel: 'BOP' },
  { file: 'ref-receiver-TOP-A4.pdf', kind: 'receiver', input: { ...REF, datum: { type: 'TOP' } }, format: 'A4', elbowLabel: refElbow, receiverLabel: refReceiver, datumLabel: 'TOP' },
  { file: 'ref-receiver-FE+20-A4.pdf', kind: 'receiver', input: { ...REF, datum: { type: 'FE', fe: 20 } }, format: 'A4', elbowLabel: refElbow, receiverLabel: refReceiver, datumLabel: 'FE +20' },
  { file: 'ref-receiver-EJE-Yprime100-A4.pdf', kind: 'receiver', input: { ...REF, datum: { type: 'EJE' } }, format: 'A4', yPrimeMm: 100, elbowLabel: refElbow, receiverLabel: refReceiver, datumLabel: 'EJE' },
  { file: 'ref-guide-EJE-A4.pdf', kind: 'guide', input: { ...REF, datum: { type: 'EJE' } }, format: 'A4', elbowLabel: refElbow, receiverLabel: refReceiver, datumLabel: 'EJE' },
  { file: 'ref-guide-BOP-A4.pdf', kind: 'guide', input: { ...REF, datum: { type: 'BOP' } }, format: 'A4', elbowLabel: refElbow, receiverLabel: refReceiver, datumLabel: 'BOP' },
  { file: 'ref-guide-FE+20-A4.pdf', kind: 'guide', input: { ...REF, datum: { type: 'FE', fe: 20 } }, format: 'A4', elbowLabel: refElbow, receiverLabel: refReceiver, datumLabel: 'FE +20' },
  { file: 'big-receiver-EJE-A4-multipage.pdf', kind: 'receiver', input: { ...BIG, datum: { type: 'EJE' } }, format: 'A4', elbowLabel: bigElbow, receiverLabel: bigReceiver, datumLabel: 'EJE' },
  { file: 'big-receiver-EJE-A1.pdf', kind: 'receiver', input: { ...BIG, datum: { type: 'EJE' } }, format: 'A1', elbowLabel: bigElbow, receiverLabel: bigReceiver, datumLabel: 'EJE' },
  { file: 'big-guide-EJE-A4-continuation.pdf', kind: 'guide', input: { ...BIG, datum: { type: 'EJE' } }, format: 'A4', elbowLabel: bigElbow, receiverLabel: bigReceiver, datumLabel: 'EJE' },
];

for (const job of jobs) {
  const result = computeElbowOnPipe(job.input);
  if (!result.valid) throw new Error(`${job.file}: invalid geometry ${result.errors.join(',')}`);
  const labels = buildElbowOnPipePdfLabels({ translate, datumLabel: job.datumLabel, elbowLabel: job.elbowLabel, receiverLabel: job.receiverLabel });
  const built = job.kind === 'receiver'
    ? buildElbowOnPipeReceiverTemplate(result, { format: job.format, meta: labels.receiver, yPrimeMm: job.yPrimeMm ?? null })
    : buildElbowOnPipeMarkingGuide(result, { format: job.format, meta: labels.guide, yPrimeMm: job.yPrimeMm ?? null });
  if (!built) throw new Error(`${job.file}: generator returned null`);
  const pdf = svgPagesToPdf(built.tiles.map(t => ({ svg: t.svg, widthMm: t.widthMm, heightMm: t.heightMm })));
  writeFileSync(join(outDir, job.file), pdf);
  const q = (Buffer.from(pdf).toString('latin1').match(/\?/g) ?? []).length;
  console.log(`${job.file.padEnd(40)} pages=${String(built.tiles.length).padStart(2)} format=${job.format} bytes=${pdf.length} qmarks=${q}`);
}
console.log(`written to ${outDir}`);
