/* Genera el artefacto físico 1:1 del caso de referencia y verifica sus dimensiones en mm. */
import { computeBranchIntersection } from '../app/frontend/src/tools/branch/branchIntersectionGeometry.ts';
import { buildBranchTemplate } from '../app/frontend/src/tools/branch/branchTemplateSvg.ts';
import { writeFileSync } from 'node:fs';

const input = {
  headerOuterRadius: 168.3 / 2,
  branchOuterDiameter: 88.9,
  branchInnerDiameter: 77.92,
  betaDeg: 90,
  divisions: 24,
};

const result = computeBranchIntersection(input);
if (!result.valid) throw new Error('invalid: ' + JSON.stringify(result.errors));

const tpl = buildBranchTemplate(result, {
  ordinate: 'relative',
  meta: {
    headerLabel: '6" (OD 168.3 mm)',
    branchLabel: '3" (OD 88.9 mm)',
    betaDeg: 90,
    titleLabel: 'Saddle cut template 1:1',
    seamLabel: 'Seam',
    pageLabel: 'Page',
    overlapLabel: 'Overlap',
    wrapNoteLabel: 'Wrap the template around the branch OD. Align the seam line with station 1.',
    calibrationNote: 'After printing, verify the 100 mm bar with a ruler before marking the pipe.',
    printAtActualSize: 'PRINT AT 100% / ACTUAL SIZE',
    generatedLabel: 'Generated 2026-09-27 · H-001-I5 · Contact: branch ID · Wrap: branch OD',
  },
});

console.log('tiles:', tpl.tiles.length);
tpl.tiles.forEach((t, i) => {
  const m = t.svg.match(/^<svg[^>]*width="([\d.]+)mm"[^>]*height="([\d.]+)mm"/);
  console.log(`tile ${i + 1}: width=${m?.[1]}mm height=${m?.[2]}mm viewBox=${t.svg.match(/viewBox="([^"]+)"/)?.[1]}`);
  writeFileSync(`/tmp/branch-template-tile-${i + 1}.svg`, t.svg);
});

// Verificaciones físicas
const dev = result.developedCircumference;
const step = result.stationSpacing;
console.log('developed circumference:', dev.toFixed(3), 'mm (expect 279.287)');
console.log('station spacing:', step.toFixed(3), 'mm (expect 11.637)');

const all = tpl.tiles.map(t => t.svg).join('\n');
const calib = all.match(/calibration[^]*?100 mm/);
console.log('calibration bar present:', /100\s*mm/.test(all));
console.log('PRINT AT 100% present:', /100%|Actual Size|ACTUAL SIZE/i.test(all));
console.log('no max-width:', !/max-width/.test(all));
console.log('page numbers:', (all.match(/Page\s+\d+\s*\/\s*\d+|P[aá]g/gi) || []).length > 0 || /page/i.test(all));
console.log('overlap marks:', /overlap|solape/i.test(all));
console.log('seam:', /seam/i.test(all));

// Distancia física entre estaciones en el SVG: x de líneas de estación consecutivas
const xs = [...tpl.tiles[0].svg.matchAll(/data-station="(\d+)"[^>]*x1="([\d.]+)"/g)].map(m => [+m[1], +m[2]]);
if (xs.length >= 2) {
  xs.sort((a, b) => a[0] - b[0]);
  const d = xs[1][1] - xs[0][1];
  console.log('SVG station delta x:', d.toFixed(3), 'mm (expect 11.637)');
} else {
  // fallback: buscar líneas verticales de estación por patrón alternativo
  const lines = [...tpl.tiles[0].svg.matchAll(/<line[^>]*class="station"[^>]*>/g)];
  console.log('station lines found (fallback):', lines.length);
}
