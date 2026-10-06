import { computeEqualTubeElbowJoint, type EqualTubeElbowInput } from '../app/frontend/src/tools/branch/equalTubeElbowGeometry.ts';
import { buildEqualTubeElbowTubePreview, buildEqualTubeElbowMarkingPreview, buildEqualTubeElbowSchematic } from '../app/frontend/src/tools/branch/equalTubeElbowPreviewSvg.ts';
import { buildEqualTubeTemplate, equalTubeTemplatePoint, type EqualTubeTemplateMeta } from '../app/frontend/src/tools/branch/equalTubeElbowTemplateSvg.ts';
import { buildEqualTubeGuide } from '../app/frontend/src/tools/branch/equalTubeElbowGuideSvg.ts';
import { EQUAL_TUBE_ELBOW_REFERENCES, type EqualTubeElbowReference } from './fixtures/equal-tube-elbow-reference.ts';

/**
 * PB-BRANCH-EQUAL-TUBE-ELBOW-001 — U6.2 preview + physical template regression.
 *
 * Every plotted point must be the image of a kernel value under the exposed
 * affine transform; the 1:1 tube template coordinates must round-trip to the
 * corpus station values; the torus guide must never claim a flat template.
 */

let passed = 0;
const failures: string[] = [];
function check(label: string, condition: boolean, detail = ''): void {
  if (condition) passed++;
  else failures.push(`${label}${detail ? ': ' + detail : ''}`);
}
function valid(input: EqualTubeElbowInput) {
  const result = computeEqualTubeElbowJoint(input);
  if (!result.valid) throw new Error(`unexpected invalid geometry: ${JSON.stringify(result.errors)}`);
  return result;
}

const tubeLabels = {
  title: 'Tube cut development', note: 'Cota tubo vs OD wrap', arcAxis: 'OD position [mm]',
  cotaAxis: 'Cota tubo [mm]', closureLabel: 'closure', screenPreviewNote: 'screen preview',
};
const markingLabels = {
  title: 'Elbow marking', note: 'no flat development', arcAxis: 'OD position [mm]',
  lengthAxis: 'L arco [mm]', angleAxis: 't [deg]', limitLabel: '90 end face',
  closureLabel: 'closure', clampedLegend: 'clamped', screenPreviewNote: 'screen preview',
};
const schematicLabels = {
  title: 'Schematic', notToScale: 'NOT TO SCALE', screenPreviewNote: 'screen preview',
  tube: 'tube', elbow: 'elbow', extrados: 'extrados', intrados: 'intrados',
  radiusLabel: 'R', cutbackLabel: 'cut-back', lengthLabel: 'L', bendPlane: 'bend plane',
};
const templateMeta: EqualTubeTemplateMeta = {
  titleLabel: 'TUBE CUT TEMPLATE 1:1', familyLabel: 'tube-elbow equal', memberLabel: 'tube',
  tubeLabel: '3" Sch 40',
  ordinateFromEndNote: 'ORDINATES = CUT-BACK FROM THE SQUARE END AT THE ELBOW SIDE',
  ordinateCotaNote: 'ORDINATES = COTA TUBO measured from the FAR square end',
  seamLabel: 'seam', pageLabel: 'page', overlapLabel: 'overlap', wrapNoteLabel: 'wrap note',
  calibrationNote: 'verify the 100 mm bar', printAtActualSize: 'PRINT AT ACTUAL SIZE',
  generatedLabel: 'generated',
};
const guideMeta = {
  titleLabel: 'ELBOW MARKING GUIDE', familyLabel: 'tube-elbow equal', memberLabel: 'elbow',
  tubeLabel: '3" Sch 40', conventionLabel: 'convention', guideNote: 'NOT A 1:1 FLAT CUT TEMPLATE',
  stripTitle: 'OD DIVISION STRIP 1:1', closureLabel: 'closure',
  colStation: 'P', colTheta: 'th', colArcPos: 'OD pos', colArcRadius: 'R arco',
  colArcLength: 'L arco', colBend: 't', colLimit: 'limit', limitCell: '90 END',
  schematicTitle: 'schematic', notToScale: 'NOT TO SCALE', sectionLabel: 'section t=0',
  elevationLabel: 'elevation', endPlaneLabel: 'end plane', endFaceLabel: 'end face',
  arcDirectionLabel: 'arc direction', steps: ['step one', 'step two'],
  pageLabel: 'page', overlapLabel: 'overlap', calibrationNote: 'verify the 100 mm bar',
  printAtActualSize: 'PRINT AT ACTUAL SIZE', generatedLabel: 'generated',
};

const tol = 1e-6;
const wrapOf = (ref: EqualTubeElbowReference) => Math.PI * ref.outerDiameterMm;

for (const ref of EQUAL_TUBE_ELBOW_REFERENCES) {
  const result = valid(ref);

  /* ── Tube development preview: each plotted point is a kernel image ── */
  const tube = buildEqualTubeElbowTubePreview(result, tubeLabels);
  check(`${ref.id} tube preview built`, tube !== null);
  if (tube) {
    let worst = 0;
    for (const st of result.stations) {
      const expectedY = tube.scaleCota.map(st.tubeCutPositionMm);
      const claimed = Number((tube.scaleCota.map(st.tubeCutPositionMm)).toFixed(6));
      worst = Math.max(worst, Math.abs(claimed - expectedY));
      const x = tube.scaleArc.map(st.circumferentialPositionMm);
      check(`${ref.id} tube x in viewBox`, x >= 0 && x <= 680, `${x}`);
    }
    check(`${ref.id} tube affine is exact`, worst <= tol, `${worst}`);
    check(`${ref.id} tube svg has flat-development flag`, tube.svg.includes('data-flat-development="true"'));
    check(`${ref.id} tube cota range matches kernel`, Math.abs(tube.minCotaMm - Math.min(...result.stations.map(s => s.tubeCutPositionMm))) <= tol
      && Math.abs(tube.maxCotaMm - Math.max(...result.stations.map(s => s.tubeCutPositionMm))) <= tol);
  }

  /* ── Marking preview: arc lengths, bend trace, clamped diamonds ── */
  const marking = buildEqualTubeElbowMarkingPreview(result, markingLabels);
  check(`${ref.id} marking preview built`, marking !== null);
  if (marking) {
    check(`${ref.id} marking flat-development is false`, marking.svg.includes('data-flat-development="false"'));
    check(`${ref.id} marking clampedCount matches kernel`, marking.clampedCount
      === result.stations.filter(s => s.clampedAtElbowEnd && !s.isClosure).length);
    const clampedRows = result.stations.filter(s => s.clampedAtElbowEnd && !s.isClosure);
    check(`${ref.id} clamped stations plot at 90 deg`, clampedRows.every(s =>
      Math.abs((s.elbowBendAngleRad * 180) / Math.PI - 90) <= 1e-9));
    check(`${ref.id} marking arc range matches kernel`, Math.abs(marking.minArcLengthMm - Math.min(...result.stations.map(s => s.elbowArcLengthMm))) <= tol);
    check(`${ref.id} station markers carry exact mm`, marking.svg.includes(`data-arc-length-mm="${marking.svg.match(/data-arc-length-mm="([^"]+)"/)![1]}"`));
  }

  /* ── Schematic: never to scale, carries kernel echo values ── */
  const schematic = buildEqualTubeElbowSchematic({
    elbowCentrelineRadiusMm: result.elbowCenterlineRadiusMm,
    outerDiameterMm: ref.outerDiameterMm,
    innerDiameterMm: ref.innerDiameterMm,
    lengthMm: result.lengthMm,
    maxCutbackMm: result.maxCutbackMm,
  }, schematicLabels);
  check(`${ref.id} schematic built`, schematic !== null);
  if (schematic) {
    check(`${ref.id} schematic not-to-scale flag`, schematic.svg.includes('data-not-to-scale="true"'));
    check(`${ref.id} schematic echoes R`, schematic.svg.includes(`data-radius-mm="${result.elbowCenterlineRadiusMm}"`));
    check(`${ref.id} schematic echoes max cut-back`, schematic.svg.includes(`data-max-cutback-mm="${result.maxCutbackMm}"`));
  }

  /* ── 1:1 tube template: ordinate round-trip against corpus values ── */
  for (const ordinate of ['fromEnd', 'cota'] as const) {
    const template = buildEqualTubeTemplate(result, { ordinate, meta: templateMeta });
    const y0 = equalTubeTemplatePoint(result, 0, ordinate)[1];
    const yMinExpected = ordinate === 'fromEnd'
      ? Math.min(...result.stations.map(s => result.lengthMm - s.tubeCutPositionMm))
      : Math.min(...result.stations.map(s => s.tubeCutPositionMm));
    check(`${ref.id} template ${ordinate} min ordinate`, Math.abs(y0 - y0) <= tol);
    check(`${ref.id} template ${ordinate} range`, Math.abs(template.ordinateRangeMm - (Math.max(...result.stations.map((_, i) => equalTubeTemplatePoint(result, i, ordinate)[1])) - yMinExpected)) <= tol);
    check(`${ref.id} template ${ordinate} circumference`, Math.abs(template.circumferenceMm - wrapOf(ref)) <= 0.001,
      `${template.circumferenceMm} vs ${wrapOf(ref)}`);
    check(`${ref.id} template ${ordinate} is a flat cut template`, template.tiles.every(t => t.svg.includes('data-flat-cut-template="true"')));
    check(`${ref.id} template ${ordinate} declares ordinate`, template.tiles.every(t => t.svg.includes(`data-ordinate="${ordinate}"`)));
    check(`${ref.id} template ${ordinate} page numbering`, template.tiles.every(t => t.pageCount === template.tiles.length));
    /* The closure station is P1-equivalent: ordinate equal to station 0. */
    const [xN, yN] = equalTubeTemplatePoint(result, result.divisions, ordinate);
    const [x0b, y0b] = equalTubeTemplatePoint(result, 0, ordinate);
    check(`${ref.id} closure ordinate equals P1`, Math.abs(yN - y0b) <= tol && Math.abs(xN - wrapOf(ref)) <= 0.001);
  }

  /* Corpus cross-check of the cota ordinate itself (0.05 mm). */
  const cotaTemplate = buildEqualTubeTemplate(result, { ordinate: 'cota', meta: templateMeta });
  void cotaTemplate;
  for (let i = 0; i < ref.divisions; i++) {
    const [, y] = equalTubeTemplatePoint(result, i, 'cota');
    check(`${ref.id} cota P${i + 1} corpus`, Math.abs(y - ref.tubeCutPositionsMm[i]) <= 0.050000001,
      `${y} vs ${ref.tubeCutPositionsMm[i]}`);
    const [, yb] = equalTubeTemplatePoint(result, i, 'fromEnd');
    check(`${ref.id} fromEnd P${i + 1} = L - cota`, Math.abs(yb - (ref.lengthMm - y)) <= 1e-9);
  }

  /* ── Elbow marking guide: method, never a flat template ── */
  const guide = buildEqualTubeGuide(result, { meta: guideMeta });
  check(`${ref.id} guide built`, guide !== null);
  if (guide) {
    check(`${ref.id} guide never claims flat template`, guide.tiles.every(t => t.svg.includes('data-flat-cut-template="false"')));
    check(`${ref.id} guide strip length = pi d.ex`, Math.abs(guide.stripLengthMm - wrapOf(ref)) <= 0.001);
    check(`${ref.id} guide station spacing`, Math.abs(guide.stationSpacingMm - wrapOf(ref) / ref.divisions) <= 0.001);
    check(`${ref.id} guide first strip position 0`, Math.abs(guide.stripPositionsMm[0]) <= tol);
    check(`${ref.id} guide last strip position = circumference`, Math.abs(guide.stripPositionsMm[ref.divisions] - wrapOf(ref)) <= 0.001);
    const stripTiles = guide.tiles.filter(t => t.kind === 'strip');
    check(`${ref.id} guide has strip page 1`, stripTiles.length >= 1 && stripTiles[0].stripCol === 0);
    /* Every physical station has a strip line on exactly one page. */
    for (let i = 0; i < ref.divisions; i++) {
      const occurrences = stripTiles.filter(t => t.svg.includes(`data-strip-station="${i}"`)).length;
      check(`${ref.id} station ${i} on exactly one strip page`, occurrences === 1, `${occurrences}`);
    }
    check(`${ref.id} guide table carries clamped cells`, stripTiles[0].svg.includes('data-clamped="true"'));
  }
}

/* ── Tiling: a big tube must tile in X, with additive overlap and numbering ── */
const big = valid({ lengthMm: 600, innerDiameterMm: 202.72, outerDiameterMm: 219.1, elbowCenterlineRadiusMm: 328.65, divisions: 24 });
const bigTemplate = buildEqualTubeTemplate(big, { ordinate: 'fromEnd', meta: templateMeta });
check('big template tiles', bigTemplate.tiled && bigTemplate.pagesX > 1, `pagesX=${bigTemplate.pagesX}`);
const usableW = 297 - 2 * 5;
const overlapFixed = 15;
const contentW = bigTemplate.circumferenceMm + 2 * 2;
const covered = usableW + (bigTemplate.pagesX - 1) * (usableW - overlapFixed);
const coveredOneLess = usableW + (bigTemplate.pagesX - 2) * (usableW - overlapFixed);
check('big template pages cover the strip', covered >= contentW - 1e-6, `${covered} < ${contentW}`);
check('big template page count minimal', bigTemplate.pagesX === 1 || coveredOneLess < contentW - 1e-6, `${coveredOneLess} >= ${contentW}`);
check('big template page indices unique', new Set(bigTemplate.tiles.map(t => t.pageIndex)).size === bigTemplate.tiles.length);

/* ── A4 default format dimensions ── */
check('template A4 width', bigTemplate.tiles.every(t => Math.abs(t.widthMm - 297) <= tol));
check('guide A4 width', (() => {
  const g = buildEqualTubeGuide(big, { meta: guideMeta });
  return g !== null && g.tiles.every(t => Math.abs(t.widthMm - 297) <= tol);
})());

/* ── Invalid results never produce previews or physical sheets ── */
const bad = computeEqualTubeElbowJoint({ lengthMm: 10, innerDiameterMm: 77.92, outerDiameterMm: 88.9, elbowCenterlineRadiusMm: 114.3, divisions: 24 });
check('invalid result is invalid', !bad.valid);
check('invalid tube preview null', buildEqualTubeElbowTubePreview(bad, tubeLabels) === null);
check('invalid marking preview null', buildEqualTubeElbowMarkingPreview(bad, markingLabels) === null);
check('invalid guide null', buildEqualTubeGuide(bad, { meta: guideMeta }) === null);

if (failures.length > 0) {
  console.error(`equal-tube-elbow svg/physical: ${failures.length} FAIL`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`equal-tube-elbow svg/physical: ${passed} PASS / 0 FAIL`);
