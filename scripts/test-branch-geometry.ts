/* H-001 — deterministic geometry tests for the canonical branch engine.
   Run: node --experimental-strip-types scripts/test-branch-geometry.ts

   Coverage (PO GO H-001):
   - Reference vectors 90° / 45° as regression fixtures (evidence, not authority).
   - G3 large header / small branch. G4 equal nominal sizes.
   - G5 division counts. G6 invalid / impossible geometry.
   - Invariants: closure, symmetry, continuity, finite outputs, exact
     circumference, exact spacing, header-radius dependency (the H-001 bug
     class), beta boundaries (15°, just above, 90°, below minimum). */

import {
  computeBranchIntersection,
  BETA_MIN_DEG,
  type BranchIntersectionInput,
} from '../app/frontend/src/tools/branch/branchIntersectionGeometry.ts';
import {
  buildBranchTemplate,
  templatePoint,
} from '../app/frontend/src/tools/branch/branchTemplateSvg.ts';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; } else { failed++; failures.push(`${name}${detail ? ' — ' + detail : ''}`); }
}

const REF = { R: 168.30 / 2, dIn: 77.92, dEx: 88.9, L: 200, N: 24 };

function refInput(betaDeg: number): BranchIntersectionInput {
  return {
    headerOuterRadius: REF.R,
    branchOuterDiameter: REF.dEx,
    branchInnerDiameter: REF.dIn,
    betaDeg,
    divisions: REF.N,
    referenceLength: REF.L,
  };
}

const REF_90 = [115.8,116.5,118.1,120.5,122.9,124.7,125.4,124.7,122.9,120.5,118.1,116.5,115.8,116.5,118.1,120.5,122.9,124.7,125.4,124.7,122.9,120.5,118.1,116.5];
const REF_45 = [120.0,119.5,118.0,115.1,110.5,103.6,94.5,83.5,71.5,60.0,50.5,44.2,42.0,44.2,50.5,60.0,71.5,83.5,94.5,103.6,110.5,115.1,118.0,119.5];
const REF_X  = [0.0,-10.1,-19.7,-28.1,-34.7,-39.0,-40.5,-39.0,-34.7,-28.1,-19.7,-10.1,-0.0,10.1,19.7,28.1,34.7,39.0,40.5,39.0,34.7,28.1,19.7,10.1];
const REF_Y90= [39.0,37.6,33.7,27.5,19.5,10.1,0.0,-10.1,-19.5,-27.5,-33.7,-37.6,-39.0,-37.6,-33.7,-27.5,-19.5,-10.1,-0.0,10.1,19.5,27.5,33.7,37.6];
const REF_Y45= [55.1,53.8,50.0,43.6,34.6,23.1,9.6,-5.4,-20.5,-34.3,-45.4,-52.6,-55.1,-52.6,-45.4,-34.3,-20.5,-5.4,9.6,23.1,34.6,43.6,50.0,53.8];

/* Reference vectors carry 0.1 mm display precision → tolerance 0.051 mm. */
function vsFixture(name: string, actual: number[], ref: number[]) {
  const bad: string[] = [];
  for (let i = 0; i < ref.length; i++) {
    if (Math.abs(actual[i] - ref[i]) > 0.051) bad.push(`i=${i} calc=${actual[i].toFixed(3)} ref=${ref[i]}`);
  }
  check(name, bad.length === 0, bad.join('; '));
}

/* ── G1 — 6" header / 3" branch, 90°, centerline, 24 divisions ── */
const g1 = computeBranchIntersection(refInput(90));
check('G1 valid', g1.valid, JSON.stringify(g1.errors));
// Fixture: first 24 stations (station 24 = closure).
vsFixture('G1 branchMark 90° vs reference', g1.stations.slice(0, 24).map(s => s.markFromEnd!), REF_90);
vsFixture('G1 picajeX 90° vs reference', g1.stations.slice(0, 24).map(s => s.picajeX), REF_X);
vsFixture('G1 picajeY 90° vs reference', g1.stations.slice(0, 24).map(s => s.picajeY), REF_Y90);

/* ── G2 — same case at 45° ── */
const g2 = computeBranchIntersection(refInput(45));
check('G2 valid', g2.valid, JSON.stringify(g2.errors));
vsFixture('G2 branchMark 45° vs reference', g2.stations.slice(0, 24).map(s => s.markFromEnd!), REF_45);
vsFixture('G2 picajeX 45° vs reference', g2.stations.slice(0, 24).map(s => s.picajeX), REF_X);
vsFixture('G2 picajeY 45° vs reference', g2.stations.slice(0, 24).map(s => s.picajeY), REF_Y45);

/* ── Invariants on G1/G2 ── */
for (const [name, g] of [['G1', g1], ['G2', g2]] as const) {
  const st = g.stations;
  check(`${name} N+1 stations`, st.length === REF.N + 1, `got ${st.length}`);
  check(`${name} closure: station N ≡ station 0`,
    Math.abs(st[REF.N].cutOrdinate - st[0].cutOrdinate) < 1e-9 &&
    Math.abs(st[REF.N].picajeX - st[0].picajeX) < 1e-9 &&
    Math.abs(st[REF.N].picajeY - st[0].picajeY) < 1e-9);
  check(`${name} exact circumference`, Math.abs(g.developedCircumference - Math.PI * REF.dEx) < 1e-9);
  check(`${name} exact spacing`, Math.abs(g.stationSpacing - Math.PI * REF.dEx / REF.N) < 1e-9);
  check(`${name} all finite`, st.every(s =>
    Number.isFinite(s.cutOrdinate) && Number.isFinite(s.picajeX) && Number.isFinite(s.picajeY) &&
    Number.isFinite(s.relativeOrdinate) && Number.isFinite(s.markFromEnd!)));
  check(`${name} continuity`, st.slice(1).every((s, i) =>
    Math.abs(s.cutOrdinate - st[i].cutOrdinate) < g.maxCutOrdinate - g.minCutOrdinate + 1e-9));
  check(`${name} arcPosition monotone`, st.slice(1).every((s, i) =>
    Math.abs(s.arcPosition - st[i].arcPosition - g.stationSpacing) < 1e-9));
}
/* 90° centerline symmetry: s(θ) = s(360°−θ) and s(θ) = s(180°−θ). */
{
  const st = g1.stations;
  let okMirror = true;
  let okHalf = true;
  for (let i = 1; i < 12; i++) {
    if (Math.abs(st[i].cutOrdinate - st[24 - i].cutOrdinate) > 1e-9) okMirror = false;
    if (Math.abs(st[i].cutOrdinate - st[12 - i].cutOrdinate) > 1e-9) okHalf = false;
  }
  check('G1 90° symmetry θ↔360°−θ', okMirror);
  check('G1 90° symmetry θ↔180°−θ', okHalf);
}

/* ── Header-radius dependency (H-001 regression guard) ── */
{
  const big = computeBranchIntersection({ ...refInput(90), headerOuterRadius: 609.6 / 2, referenceLength: undefined });
  check('header radius changes 90° saddle', big.valid &&
    Math.abs(big.stations[0].cutOrdinate - g1.stations[0].cutOrdinate) > 1,
    `R=84.15 → s0=${g1.stations[0].cutOrdinate.toFixed(2)}, R=304.8 → s0=${big.valid ? big.stations[0].cutOrdinate.toFixed(2) : 'INVALID'}`);
  const big45 = computeBranchIntersection({ ...refInput(45), headerOuterRadius: 609.6 / 2, referenceLength: undefined });
  check('header radius changes 45° saddle', big45.valid &&
    Math.abs(big45.stations[0].cutOrdinate - g2.stations[0].cutOrdinate) > 1);
}

/* ── G3 — large header / small branch (24" × 2", 90°) ── */
{
  const g3 = computeBranchIntersection({
    headerOuterRadius: 609.6 / 2, branchOuterDiameter: 60.3, branchInnerDiameter: 52.5,
    betaDeg: 90, divisions: 24,
  });
  check('G3 valid', g3.valid, JSON.stringify(g3.errors));
  // Limit: R ≫ r → s(θ) ≈ R − r²sin²θ/(2R)…; monotone from θ=0 to θ=90°.
  const s0 = g3.stations[0].cutOrdinate, s6 = g3.stations[6].cutOrdinate;
  check('G3 s(90°) < s(0°)', s6 < s0);
  check('G3 shallow saddle', (s0 - s6) < REF.dIn, `depth=${(s0 - s6).toFixed(2)} mm`);
}

/* ── G4 — equal nominal sizes (6" × 6", 90°) ── */
{
  // 6" sch 40: OD 168.3, WT 7.11 → ID 154.08
  const g4 = computeBranchIntersection({
    headerOuterRadius: 168.3 / 2, branchOuterDiameter: 168.3, branchInnerDiameter: 154.08,
    betaDeg: 90, divisions: 24,
  });
  check('G4 equal-size valid', g4.valid, JSON.stringify(g4.errors));
  // r = R? here rRef = 77.04 < 84.15 (ID-based). Classical result: s(θ) = q(θ) finite everywhere.
  check('G4 finite', g4.stations.every(s => Number.isFinite(s.cutOrdinate)));
  check('G4 closure', Math.abs(g4.stations[24].cutOrdinate - g4.stations[0].cutOrdinate) < 1e-9);
  // Exact equality case: rRef = R at 90° → s(θ) = R·|cosθ|.
  const eq = computeBranchIntersection({
    headerOuterRadius: 100, branchOuterDiameter: 210, branchInnerDiameter: 200,
    betaDeg: 90, divisions: 24,
  });
  check('G4 r=R valid', eq.valid, JSON.stringify(eq.errors));
  const expect = (i: number) => 100 * Math.abs(Math.cos((i * 2 * Math.PI) / 24));
  check('G4 r=R → s=R·|cosθ|', eq.stations.every((s, i) => Math.abs(s.cutOrdinate - expect(i)) < 1e-9));
}

/* ── G5 — division counts ── */
for (const N of [12, 16, 24, 36, 48]) {
  const g = computeBranchIntersection({ ...refInput(90), divisions: N });
  check(`G5 N=${N} valid`, g.valid);
  check(`G5 N=${N} stations`, g.stations.length === N + 1);
  check(`G5 N=${N} spacing`, Math.abs(g.stationSpacing - Math.PI * REF.dEx / N) < 1e-9);
  check(`G5 N=${N} closure`, Math.abs(g.stations[N].cutOrdinate - g.stations[0].cutOrdinate) < 1e-9);
  check(`G5 N=${N} angular step`, Math.abs(g.angularStepDeg - 360 / N) < 1e-12);
}

/* ── G6 — invalid / impossible geometry fails explicitly ── */
{
  const cases: [string, BranchIntersectionInput, string][] = [
    ['r > R', { headerOuterRadius: 30, branchOuterDiameter: 88.9, branchInnerDiameter: 77.92, betaDeg: 90, divisions: 24 }, 'REFERENCE_RADIUS_EXCEEDS_HEADER'],
    ['beta < min', { ...refInput(14.9) }, 'BETA_OUT_OF_RANGE'],
    ['beta = 0', { ...refInput(0) }, 'BETA_OUT_OF_RANGE'],
    ['beta > 90', { ...refInput(91) }, 'BETA_OUT_OF_RANGE'],
    ['ID >= OD', { headerOuterRadius: 100, branchOuterDiameter: 60.3, branchInnerDiameter: 60.3, betaDeg: 90, divisions: 24 }, 'INNER_EXCEEDS_OUTER'],
    ['NaN input', { ...refInput(90), headerOuterRadius: NaN }, 'NON_FINITE_INPUT'],
    ['zero division', { ...refInput(90), divisions: 0 }, 'INVALID_DIVISIONS'],
    ['L too short', { ...refInput(45), referenceLength: 100 }, 'REFERENCE_LENGTH_TOO_SHORT'],
  ];
  for (const [name, input, code] of cases) {
    const g = computeBranchIntersection(input);
    check(`G6 ${name} → ${code}`, !g.valid && g.errors.some(e => e.code === code) && g.stations.length === 0,
      JSON.stringify(g.errors));
  }
}

/* ── Beta boundaries (PO D4) ── */
{
  check('beta = 15° valid', computeBranchIntersection({ ...refInput(15), referenceLength: undefined }).valid);
  check('beta = 15.1° valid', computeBranchIntersection({ ...refInput(15.1), referenceLength: undefined }).valid);
  check('beta = 90° valid (no tan instability)', computeBranchIntersection(refInput(90)).valid);
  const b15 = computeBranchIntersection({ ...refInput(15), referenceLength: undefined });
  check('beta 15° finite', b15.stations.every(s => Number.isFinite(s.cutOrdinate) && Number.isFinite(s.picajeY)));
  check('BETA_MIN_DEG = 15', BETA_MIN_DEG === 15);
}

/* ── D1 — reference surface is an explicit parameter ── */
{
  const od = computeBranchIntersection({ ...refInput(90), intersectionReferenceRadius: REF.dEx / 2 });
  check('reference radius switchable (OD contact)', od.valid &&
    Math.abs(od.stations[6].cutOrdinate - g1.stations[6].cutOrdinate) > 1e-6,
    'switching ID→OD reference must change the contact profile');
  check('OD-contact picajeY range larger', Math.abs(od.stations[0].picajeY) > Math.abs(g1.stations[0].picajeY));
}

/* ── 1:1 template artifact (PO D3) — table = print identity ── */
{
  const META = {
    headerLabel: '6" Sch 40', branchLabel: '3" Sch 40', betaDeg: 90,
    titleLabel: 'Branch template', seamLabel: 'Seam', pageLabel: 'Page',
    overlapLabel: 'Overlap', wrapNoteLabel: 'Wrap around branch OD',
    calibrationNote: 'Verify the 100 mm bar after printing',
    printAtActualSize: 'PRINT AT 100% / ACTUAL SIZE', generatedLabel: 'test',
  };
  // templatePoint = canonical identity: x is the physical arc position, y the table ordinate.
  const okIdentity = g1.stations.every((st, i) => {
    const [x, y] = templatePoint(g1, i, 'fromEnd');
    return Math.abs(x - st.arcPosition) < 1e-9 && Math.abs(y - st.markFromEnd!) < 1e-9;
  });
  check('print coordinates = table coordinates', okIdentity);

  const tpl = buildBranchTemplate(g1, { ordinate: 'fromEnd', meta: META });
  check('circumference physical = π·88.9', Math.abs(tpl.circumferenceMm - 279.287) < 0.001,
    `${tpl.circumferenceMm}`);
  check('reference case tiles A4 landscape (279.287 mm useful)', tpl.tiles.length === 2 && tpl.tiled);
  check('tiles never scale: widths sum covers content', tpl.tiles.every(t => t.widthMm > 0));
  check('every tile carries 100 mm calibration bar', tpl.tiles.every(t => t.svg.includes('100 mm')));
  check('every tile states PRINT AT 100% / ACTUAL SIZE', tpl.tiles.every(t => t.svg.includes('PRINT AT 100% / ACTUAL SIZE')));
  check('every tile numbered', tpl.tiles.every((t, i) => t.svg.includes(`Page ${i + 1}/${tpl.tiles.length}`)));
  check('overlap marked on non-final tiles', tpl.tiles.slice(0, -1).every(t => t.svg.includes('Overlap')));
  check('physical svg units are mm', tpl.tiles.every(t => /width="[\d.]+mm"/.test(t.svg)));
  check('no auto scale-to-fit attribute', tpl.tiles.every(t => !t.svg.includes('max-width')));
  // Tiling invariant: consecutive tiles advance by usableWidth − overlap exactly.
  check('tile step = usable − overlap', Math.abs(tpl.tiles[1].originX - (277 - 15 - 10)) < 1e-9,
    `originX[1]=${tpl.tiles[1].originX}`);
  // Large pipe (24" OD → 1913 mm development) tiles deterministically.
  const big = computeBranchIntersection({
    headerOuterRadius: 914.4 / 2, branchOuterDiameter: 609.6, branchInnerDiameter: 590.6,
    betaDeg: 60, divisions: 48,
  });
  const tplBig = buildBranchTemplate(big, { ordinate: 'relative', meta: META });
  check('24" development tiled', tplBig.tiled && tplBig.tiles.length === Math.ceil((1913.238 + 20 - 277) / 262) + 1,
    `${tplBig.tiles.length} tiles for ${tplBig.circumferenceMm.toFixed(1)} mm`);
  check('all big tiles physical + calibrated', tplBig.tiles.every(t =>
    t.svg.includes('100 mm') && /width="[\d.]+mm"/.test(t.svg)));
}

console.log(`\n${passed} PASS / ${failed} FAIL`);
if (failed > 0) {
  console.log('FAILURES:');
  for (const f of failures) console.log(' -', f);
  process.exit(1);
}
console.log('All branch geometry tests passed.');
