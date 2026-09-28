/* H-001 print delta — writes the current physical artifacts to /tmp:
   cut template (SVG + PDF), picaje template (SVG + PDF) for the 3" reference
   case, and prints their physical dimensions. Diagnostic only; the real
   gates live in scripts/test-branch-geometry.ts. */
import { computeBranchIntersection } from '../app/frontend/src/tools/branch/branchIntersectionGeometry.ts';
import { buildBranchTemplate } from '../app/frontend/src/tools/branch/branchTemplateSvg.ts';
import { buildPicajeTemplate } from '../app/frontend/src/tools/branch/branchPicajeTemplateSvg.ts';
import { svgPagesToPdf } from '../app/frontend/src/tools/branch/svgMmToPdf.ts';
import { writeFileSync } from 'node:fs';

const input = {
  headerOuterRadius: 168.3 / 2,
  branchOuterDiameter: 88.9,
  branchInnerDiameter: 77.92,
  betaDeg: 90,
  divisions: 24,
  referenceLength: 200,
};

const result = computeBranchIntersection(input);
if (!result.valid) throw new Error('invalid: ' + JSON.stringify(result.errors));

const generatedLabel = 'PIPINGBOX · H-001 · reference case';

const cut = buildBranchTemplate(result, {
  ordinate: 'fromEnd',
  meta: {
    headerLabel: '6" Sch 40 (OD 168.3 mm)',
    branchLabel: '3" Sch 40 (OD 88.9 mm)',
    betaDeg: 90,
    titleLabel: 'Branch cut template 1:1 (development)',
    seamLabel: 'Seam',
    pageLabel: 'Page',
    overlapLabel: 'Overlap',
    wrapNoteLabel: 'Wrap the template around the branch OD. Align the seam line with station 1.',
    calibrationNote: 'After printing, verify the 100 mm bar with a ruler before marking the pipe.',
    printAtActualSize: 'PRINT AT 100% / ACTUAL SIZE',
    generatedLabel,
  },
});

const picaje = buildPicajeTemplate(result, {
  meta: {
    headerLabel: '6" Sch 40 (OD 168.3 mm)',
    branchRefLabel: '3" (ID 77.92 mm)',
    betaDeg: 90,
    titleLabel: 'Header picaje template 1:1 — opening',
    originLabel: 'Origin (0,0)',
    xAxisLabel: 'arc on header',
    yAxisLabel: 'header axis',
    openingNote: 'Line = nominal opening (reference: branch ID). No bevel or cutting allowance in V1.',
    wrapNote: 'X = developed circumferential distance on the header surface (wrap direction). Y = axial distance along the header. Align X = 0 with the reference generatrix.',
    calibrationNote: 'After printing, verify the 100 mm bar with a ruler before marking the pipe.',
    printAtActualSize: 'PRINT AT 100% / ACTUAL SIZE',
    pageLabel: 'Page',
    overlapLabel: 'Overlap',
    generatedLabel,
  },
});

console.log(`cut: ${cut.tiles.length} page(s), tiled=${cut.tiled}, circumference=${cut.circumferenceMm.toFixed(3)} mm`);
cut.tiles.forEach((t, i) => writeFileSync(`/tmp/h001-cut-${i + 1}.svg`, t.svg));
writeFileSync('/tmp/h001-cut.pdf', svgPagesToPdf(cut.tiles.map(t => ({ svg: t.svg, widthMm: t.widthMm, heightMm: t.heightMm }))));

console.log(`picaje: ${picaje.tiles.length} page(s), tiled=${picaje.tiled}, X range ${picaje.xMin.toFixed(3)}..${picaje.xMax.toFixed(3)} (${picaje.widthMm.toFixed(3)} mm), Y range ${picaje.yMin.toFixed(3)}..${picaje.yMax.toFixed(3)} (${picaje.heightMm.toFixed(3)} mm)`);
picaje.tiles.forEach((t, i) => writeFileSync(`/tmp/h001-picaje-${i + 1}.svg`, t.svg));
writeFileSync('/tmp/h001-picaje.pdf', svgPagesToPdf(picaje.tiles.map(t => ({ svg: t.svg, widthMm: t.widthMm, heightMm: t.heightMm }))));

console.log('artifacts: /tmp/h001-cut-{1..n}.svg, /tmp/h001-cut.pdf, /tmp/h001-picaje-{1..n}.svg, /tmp/h001-picaje.pdf');
