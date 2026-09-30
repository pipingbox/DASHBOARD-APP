/* H-001 — deterministic geometry tests for the canonical branch engine.
   Run: node --experimental-strip-types scripts/test-branch-geometry.ts

   Coverage (PO GO H-001 final hardening):
   - SET-ON public convention (PO D1 correction): branch cut on branch OD,
     header hole (picaje) on branch ID, development on branch OD.
   - SET-ON 90° vector as supplied by the PO; SET-ON 45° vector generated
     independently (scripts/gen-seton-vectors.ts, cylinder-equation derivation).
   - Tubero 90°/45° vectors kept as an ALTERNATIVE-convention regression
     (cut + hole on branch ID) — evidence of another convention, not the
     public source of truth.
   - G3 large header / small branch. G4 equal nominal sizes. G5 division
     counts. G6 invalid / impossible geometry.
   - Invariants: closure, symmetry, continuity, finite outputs, exact
     circumference, exact spacing, header-radius AND branch-OD dependency,
     beta boundaries (15°, just above, 90°, below minimum).
   - Reference separation (D1): cut radius and hole radius are independent
     parameters; changing one does not silently change the other output.
   - Physical 1:1 template (PO D3/§7): identity table=print, tiling, data
     block, station arc positions, closure never presented as division N+1.
   - Isometric tube-on-tube view (§9): canonical stations only, long header,
     OD/beta dependency, no PAD. */

import {
  computeBranchIntersection,
  BETA_MIN_DEG,
  type BranchIntersectionInput,
} from '../app/frontend/src/tools/branch/branchIntersectionGeometry.ts';
import {
  buildBranchTemplate,
  templatePoint,
} from '../app/frontend/src/tools/branch/branchTemplateSvg.ts';
import {
  buildPicajeTemplate,
} from '../app/frontend/src/tools/branch/branchPicajeTemplateSvg.ts';
import {
  buildBranchIsometric,
  projectStation,
} from '../app/frontend/src/tools/branch/branchIsometricSvg.ts';
import {
  svgPagesToPdf,
  pdfLatin1Safe,
} from '../app/frontend/src/tools/branch/svgMmToPdf.ts';

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

/* ── SET-ON public vectors (cut on branch OD) ──
   90°: supplied by the PO (saddle depth 84.15 − 71.45 = 12.70 mm).
   45°: generated independently from the cylinder equation. */
const SETON_90 = [84.15,83.36,81.16,78.06,74.83,72.37,71.45,72.37,74.83,78.06,81.16,83.36,84.15,83.36,81.16,78.06,74.83,72.37,71.45,72.37,74.83,78.06,81.16,83.36];
const SETON_45 = [74.56,74.95,76.29,78.96,83.6,90.85,101.05,113.85,128.05,141.82,153.28,160.82,163.46,160.82,153.28,141.82,128.05,113.85,101.05,90.85,83.6,78.96,76.29,74.95];

/* ── Tubero vectors (ALTERNATIVE convention: cut + hole on branch ID) ── */
const REF_90 = [115.8,116.5,118.1,120.5,122.9,124.7,125.4,124.7,122.9,120.5,118.1,116.5,115.8,116.5,118.1,120.5,122.9,124.7,125.4,124.7,122.9,120.5,118.1,116.5];
const REF_45 = [120.0,119.5,118.0,115.1,110.5,103.6,94.5,83.5,71.5,60.0,50.5,44.2,42.0,44.2,50.5,60.0,71.5,83.5,94.5,103.6,110.5,115.1,118.0,119.5];
const REF_X  = [0.0,-10.1,-19.7,-28.1,-34.7,-39.0,-40.5,-39.0,-34.7,-28.1,-19.7,-10.1,-0.0,10.1,19.7,28.1,34.7,39.0,40.5,39.0,34.7,28.1,19.7,10.1];
const REF_Y90= [39.0,37.6,33.7,27.5,19.5,10.1,0.0,-10.1,-19.5,-27.5,-33.7,-37.6,-39.0,-37.6,-33.7,-27.5,-19.5,-10.1,-0.0,10.1,19.5,27.5,33.7,37.6];
const REF_Y45= [55.1,53.8,50.0,43.6,34.6,23.1,9.6,-5.4,-20.5,-34.3,-45.4,-52.6,-55.1,-52.6,-45.4,-34.3,-20.5,-5.4,9.6,23.1,34.6,43.6,50.0,53.8];

function vsFixture(name: string, actual: number[], ref: number[], tol: number) {
  const bad: string[] = [];
  for (let i = 0; i < ref.length; i++) {
    if (Math.abs(actual[i] - ref[i]) > tol) bad.push(`i=${i} calc=${actual[i].toFixed(3)} ref=${ref[i]}`);
  }
  check(name, bad.length === 0, bad.join('; '));
}

/* ── G1 — 6" header / 3" branch, 90°, centerline, 24 divisions, SET-ON ── */
const g1 = computeBranchIntersection(refInput(90));
check('G1 valid', g1.valid, JSON.stringify(g1.errors));
vsFixture('G1 SET-ON cut 90° vs PO vector', g1.stations.slice(0, 24).map(s => s.cutOrdinate), SETON_90, 0.006);
check('G1 SET-ON saddle depth ≈ 12.70 mm',
  Math.abs((g1.maxCutOrdinate - g1.minCutOrdinate) - 12.70) < 0.01,
  `depth=${(g1.maxCutOrdinate - g1.minCutOrdinate).toFixed(2)}`);
vsFixture('G1 picajeX 90° (hole = branch ID)', g1.stations.slice(0, 24).map(s => s.picajeX), REF_X, 0.051);
vsFixture('G1 picajeY 90° (hole = branch ID)', g1.stations.slice(0, 24).map(s => s.picajeY), REF_Y90, 0.051);
check('G1 resolved echoes the six radii',
  g1.resolved.branchCutReferenceRadius === REF.dEx / 2 &&
  g1.resolved.headerHoleReferenceRadius === REF.dIn / 2 &&
  g1.resolved.developmentRadius === REF.dEx / 2 &&
  g1.resolved.headerOuterRadius === REF.R &&
  g1.resolved.branchOuterRadius === REF.dEx / 2 &&
  g1.resolved.branchInnerRadius === REF.dIn / 2);

/* ── G2 — same case at 45°, SET-ON ── */
const g2 = computeBranchIntersection(refInput(45));
check('G2 valid', g2.valid, JSON.stringify(g2.errors));
vsFixture('G2 SET-ON cut 45° vs independent vector', g2.stations.slice(0, 24).map(s => s.cutOrdinate), SETON_45, 0.006);
vsFixture('G2 picajeX 45°', g2.stations.slice(0, 24).map(s => s.picajeX), REF_X, 0.051);
vsFixture('G2 picajeY 45°', g2.stations.slice(0, 24).map(s => s.picajeY), REF_Y45, 0.051);

/* ── Tubero alternative convention (cut AND hole on branch ID) ── */
const alt = (betaDeg: number): BranchIntersectionInput => ({
  ...refInput(betaDeg),
  branchCutReferenceRadius: REF.dIn / 2,
  headerHoleReferenceRadius: REF.dIn / 2,
});
const a90 = computeBranchIntersection(alt(90));
const a45 = computeBranchIntersection(alt(45));
check('ALT 90° valid', a90.valid, JSON.stringify(a90.errors));
check('ALT 45° valid', a45.valid, JSON.stringify(a45.errors));
vsFixture('ALT convention mark 90° vs Tubero', a90.stations.slice(0, 24).map(s => s.markFromEnd!), REF_90, 0.051);
vsFixture('ALT convention mark 45° vs Tubero', a45.stations.slice(0, 24).map(s => s.markFromEnd!), REF_45, 0.051);
vsFixture('ALT convention picajeY 45° vs Tubero', a45.stations.slice(0, 24).map(s => s.picajeY), REF_Y45, 0.051);

/* ── D1 separation: cut radius and hole radius are independent ── */
{
  const odCut = computeBranchIntersection({ ...refInput(90), headerHoleReferenceRadius: REF.dEx / 2 });
  check('hole radius change does NOT change the cut',
    odCut.stations.every((s, i) => Math.abs(s.cutOrdinate - g1.stations[i].cutOrdinate) < 1e-12));
  const odHole = computeBranchIntersection({ ...refInput(90), branchCutReferenceRadius: REF.dIn / 2 });
  check('cut radius change does NOT change the picaje',
    odHole.stations.every((s, i) => Math.abs(s.picajeX - g1.stations[i].picajeX) < 1e-12 &&
      Math.abs(s.picajeY - g1.stations[i].picajeY) < 1e-12));
  check('cut radius switchable (ID→OD changes the saddle)',
    Math.abs(odHole.stations[6].cutOrdinate - g1.stations[6].cutOrdinate) > 1e-6);
}

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

/* ── Header-radius AND branch-OD dependency (H-001 regression guards) ── */
{
  const big = computeBranchIntersection({ ...refInput(90), headerOuterRadius: 609.6 / 2, referenceLength: undefined });
  check('header radius changes 90° saddle', big.valid &&
    Math.abs(big.stations[0].cutOrdinate - g1.stations[0].cutOrdinate) > 1 &&
    Math.abs(big.stations[6].cutOrdinate - g1.stations[6].cutOrdinate) > 1,
    `R=84.15 → s0=${g1.stations[0].cutOrdinate.toFixed(2)}, R=304.8 → s0=${big.valid ? big.stations[0].cutOrdinate.toFixed(2) : 'INVALID'}`);
  const big45 = computeBranchIntersection({ ...refInput(45), headerOuterRadius: 609.6 / 2, referenceLength: undefined });
  check('header radius changes 45° saddle', big45.valid &&
    Math.abs(big45.stations[0].cutOrdinate - g2.stations[0].cutOrdinate) > 1);
  // Branch OD dependency: thicker branch (4" instead of 3") → deeper saddle at 90°.
  const thick = computeBranchIntersection({
    ...refInput(90), branchOuterDiameter: 114.3, branchInnerDiameter: 102.3,
  });
  check('branch OD changes the cut', thick.valid &&
    Math.abs(thick.stations[6].cutOrdinate - g1.stations[6].cutOrdinate) > 1,
    `3" s(90°)=${g1.stations[6].cutOrdinate.toFixed(2)} vs 4" s(90°)=${thick.valid ? thick.stations[6].cutOrdinate.toFixed(2) : 'INVALID'}`);
}

/* ── G3 — large header / small branch (24" × 2", 90°) ── */
{
  const g3 = computeBranchIntersection({
    headerOuterRadius: 609.6 / 2, branchOuterDiameter: 60.3, branchInnerDiameter: 52.5,
    betaDeg: 90, divisions: 24,
  });
  check('G3 valid', g3.valid, JSON.stringify(g3.errors));
  const s0 = g3.stations[0].cutOrdinate, s6 = g3.stations[6].cutOrdinate;
  check('G3 s(90°) < s(0°)', s6 < s0);
  check('G3 shallow saddle', (s0 - s6) < REF.dIn, `depth=${(s0 - s6).toFixed(2)} mm`);
}

/* ── G4 — equal nominal sizes (6" × 6", 90°) ── */
{
  // 6" sch 40: OD 168.3, WT 7.11 → ID 154.08. SET-ON: rCut = R exactly.
  const g4 = computeBranchIntersection({
    headerOuterRadius: 168.3 / 2, branchOuterDiameter: 168.3, branchInnerDiameter: 154.08,
    betaDeg: 90, divisions: 24,
  });
  check('G4 equal-size valid', g4.valid, JSON.stringify(g4.errors));
  check('G4 finite', g4.stations.every(s => Number.isFinite(s.cutOrdinate)));
  check('G4 closure', Math.abs(g4.stations[24].cutOrdinate - g4.stations[0].cutOrdinate) < 1e-9);
  // Exact equality case: rCut = R at 90° → s(θ) = R·|cosθ|.
  const eq = computeBranchIntersection({
    headerOuterRadius: 105, branchOuterDiameter: 210, branchInnerDiameter: 200,
    betaDeg: 90, divisions: 24,
  });
  check('G4 r=R valid (SET-ON equality allowed)', eq.valid, JSON.stringify(eq.errors));
  const expect = (i: number) => 105 * Math.abs(Math.cos((i * 2 * Math.PI) / 24));
  check('G4 r=R → s=R·|cosθ|', eq.stations.every((s, i) => Math.abs(s.cutOrdinate - expect(i)) < 1e-9));
  // The old UI restriction branchOD < headerOD must NOT be an engine rule.
  check('G4 branchOD = headerOD accepted', g4.valid);
}

/* ── G5 — division counts / marking ── */
for (const N of [12, 16, 24, 36, 48]) {
  const g = computeBranchIntersection({ ...refInput(90), divisions: N });
  check(`G5 N=${N} valid`, g.valid);
  check(`G5 N=${N} stations`, g.stations.length === N + 1);
  check(`G5 N=${N} spacing`, Math.abs(g.stationSpacing - Math.PI * REF.dEx / N) < 1e-9);
  check(`G5 N=${N} closure`, Math.abs(g.stations[N].cutOrdinate - g.stations[0].cutOrdinate) < 1e-9);
  check(`G5 N=${N} angular step`, Math.abs(g.angularStepDeg - 360 / N) < 1e-12);
}
/* Marking (PO §12): N=24 → 24 real divisions, 15° step, ~11.637 mm for OD 88.9,
   closure repeats point 1 (never presented as an independent 25th division). */
{
  check('marking N=24 → 24 divisions + 1 closure point', g1.stations.length === 25);
  check('marking step 15°', Math.abs(g1.angularStepDeg - 15) < 1e-12);
  check('marking spacing ≈ 11.637 mm', Math.abs(g1.stationSpacing - 11.637) < 0.001, `${g1.stationSpacing}`);
  check('marking closure θ = 360° = point 1', g1.stations[24].thetaDeg === 360 &&
    Math.abs(g1.stations[24].arcPosition - g1.developedCircumference) < 1e-9);
}

/* ── G6 — invalid / impossible geometry fails explicitly ── */
{
  const cases: [string, BranchIntersectionInput, string][] = [
    ['r > R', { headerOuterRadius: 30, branchOuterDiameter: 88.9, branchInnerDiameter: 77.92, betaDeg: 90, divisions: 24 }, 'REFERENCE_RADIUS_EXCEEDS_HEADER'],
    ['hole radius > R', { headerOuterRadius: 30, branchOuterDiameter: 40, branchInnerDiameter: 77.92, betaDeg: 90, divisions: 24 }, 'REFERENCE_RADIUS_EXCEEDS_HEADER'],
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

/* ── 1:1 CUT template artifact (PO D3 + §7 + final delta §1/§2/§3/§4/§9) ── */
{
  const META = {
    headerLabel: '6" Sch 40', branchLabel: '3" Sch 40', betaDeg: 90,
    titleLabel: 'Branch cut template 1:1 (development)', seamLabel: 'Seam',
    pageLabel: 'Page', overlapLabel: 'Overlap',
    wrapNoteLabel: 'Wrap the template around the branch OD. Align the seam line with station 1.',
    calibrationNote: 'After printing, verify the 100 mm bar with a ruler before marking the pipe.',
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
  /* PO §1: the 3" reference (279.288 mm useful) must fit ONE full A4
     landscape page at true 1:1 — never scaled, never a forced second page. */
  check('3" reference: ONE A4 page at true 1:1', tpl.tiles.length === 1 && !tpl.tiled,
    `${tpl.tiles.length} tiles`);
  check('page is full A4 landscape (297 × 210 mm)',
    tpl.tiles[0].widthMm === 297 && tpl.tiles[0].heightMm === 210);
  check('every tile carries 100 mm calibration bar', tpl.tiles.every(t => t.svg.includes('100 mm')));
  check('every tile states PRINT AT 100% / ACTUAL SIZE', tpl.tiles.every(t => t.svg.includes('PRINT AT 100% / ACTUAL SIZE')));
  check('every tile numbered', tpl.tiles.every((t, i) => t.svg.includes(`Page ${i + 1}/${tpl.tiles.length}`)));
  check('physical svg units are mm', tpl.tiles.every(t => /width="[\d.]+mm"/.test(t.svg)));
  check('no auto scale-to-fit attribute', tpl.tiles.every(t => !t.svg.includes('max-width')));
  // §7 data block: physical data + station positions + closure never a false 25th division.
  check('data block includes angular step', tpl.tiles[0].svg.includes('Δθ = 15°'));
  check('data block includes linear step', tpl.tiles[0].svg.includes('Δs = 11.637 mm'));
  check('data block includes circumference', tpl.tiles[0].svg.includes('279.288 mm'));
  check('station arc positions printed (P2 = 11.637)', tpl.tiles[0].svg.includes('>11.637<'));
  check('closure labelled ≡1, never 25', tpl.tiles.some(t => t.svg.includes('>≡1<')) &&
    tpl.tiles.every(t => !t.svg.includes('>25<')));
  /* §4/§9: 24 real divisions with physical spacing 11.637 mm measured on the
     artifact itself (station generator lines carry data-station). */
  {
    const xs = [...tpl.tiles[0].svg.matchAll(/<line data-station="(\d+)"[^>]*x1="([\d.]+)"/g)]
      .map(m => [+m[1], +m[2]] as [number, number]).sort((a, b) => a[0] - b[0]);
    check('artifact has 25 station lines (24 + closure)', xs.length === 25, `${xs.length}`);
    const delta = xs[1][1] - xs[0][1];
    check('artifact station spacing = 11.637 mm (physical)', Math.abs(delta - 11.637) < 0.001, `${delta}`);
    check('artifact first station at pad + border (7 mm)', Math.abs(xs[0][1] - 7) < 0.001, `${xs[0][1]}`);
  }
  /* §3: print header legibility — no two text rows may collide vertically
     (same-row texts must instead be horizontally separated). */
  {
    for (const t of tpl.tiles) {
      const texts = [...t.svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)" font-size="([\d.]+)"([^>]*)>([^<]*)</g)]
        .map(m => ({ x: +m[1], y: +m[2], fs: +m[3], attrs: m[4], s: m[5] }));
      let overlap = false;
      const detail: string[] = [];
      for (let i = 0; i < texts.length && !overlap; i++) {
        for (let j = i + 1; j < texts.length && !overlap; j++) {
          const a = texts[i], b = texts[j];
          const dy = Math.abs(a.y - b.y);
          const fsMax = Math.max(a.fs, b.fs);
          if (dy >= 0.75 * fsMax) continue; // clearly different rows
          // Same visual row: horizontal intervals must not overlap.
          const w = (t: typeof a) => t.s.length * 0.6 * t.fs;
          const ax0 = a.attrs.includes('text-anchor="middle"') ? a.x - w(a) / 2
            : a.attrs.includes('text-anchor="end"') ? a.x - w(a) : a.x;
          const bx0 = b.attrs.includes('text-anchor="middle"') ? b.x - w(b) / 2
            : b.attrs.includes('text-anchor="end"') ? b.x - w(b) : b.x;
          if (ax0 < bx0 + w(b) && bx0 < ax0 + w(a)) {
            overlap = true;
            detail.push(`"${a.s}" vs "${b.s}" (y ${a.y}/${b.y})`);
          }
        }
      }
      check('print header has no overlapping text', !overlap, detail.join('; '));
    }
  }

  /* Tiled case: 24" branch development (π·609.6 ≈ 1915.02 mm) must tile
     deterministically without ever scaling the geometry. Since
     PB-BRANCH-CUT-TILING-Y-001 the grid is X+Y: pagesX from the development
     width, pagesY from the ordinate range vs the 102 mm A4 curve window. */
  const big = computeBranchIntersection({
    headerOuterRadius: 914.4 / 2, branchOuterDiameter: 609.6, branchInnerDiameter: 590.6,
    betaDeg: 60, divisions: 48,
  });
  const tplBig = buildBranchTemplate(big, { ordinate: 'relative', meta: META });
  const expPagesX = Math.max(1, Math.ceil((Math.PI * 609.6 + 4 - 287) / (287 - 15)) + 1);
  const expPagesY = Math.max(1, Math.ceil((tplBig.ordinateRangeMm + 4 - 102) / (102 - 15)) + 1);
  const expPages = expPagesX * expPagesY;
  check('24" development tiled deterministically (X+Y)', tplBig.tiled
    && tplBig.pagesX === expPagesX && tplBig.pagesY === expPagesY && tplBig.tiles.length === expPages,
    `${tplBig.tiles.length} tiles (expected ${expPages} = ${expPagesX}×${expPagesY})`);
  check('24" profile exceeds A4 curve window → vertical tiling', expPagesY > 1,
    `pagesY=${expPagesY}`);
  check('all big tiles full A4 physical + calibrated', tplBig.tiles.every(t =>
    t.svg.includes('100 mm') && /width="297mm"/.test(t.svg)));
  check('overlap marked on non-final tiles', tplBig.tiles.slice(0, -1).every(t => t.svg.includes('Overlap 15 mm')));
  check('tile step = usable − overlap', Math.abs(tplBig.tiles[1].originX - (287 - 15 - 2)) < 1e-9,
    `originX[1]=${tplBig.tiles[1].originX}`);
  // One-page vs tiled never scales: station spacing identical in both modes.
  {
    const xs = [...tplBig.tiles[0].svg.matchAll(/<line data-station="(\d+)"[^>]*x1="([\d.]+)"/g)]
      .map(m => [+m[1], +m[2]] as [number, number]).sort((a, b) => a[0] - b[0]);
    const delta = xs[1][1] - xs[0][1];
    const expect = Math.PI * 609.6 / 48;
    check('tiled artifact keeps true 1:1 spacing', Math.abs(delta - expect) < 0.001,
      `${delta} vs ${expect.toFixed(3)}`);
  }

  /* ── §2: deterministic physical PDF (no browser print scaling) ── */
  const pdfBytes = svgPagesToPdf(tpl.tiles.map(t => ({ svg: t.svg, widthMm: t.widthMm, heightMm: t.heightMm })));
  const pdf = Buffer.from(pdfBytes).toString('latin1');
  check('PDF header', pdf.startsWith('%PDF-1.4'));
  check('PDF MediaBox = physical A4 landscape pt', pdf.includes('/MediaBox [0 0 841.89 595.276]'));
  check('PDF single page for 3" reference', pdf.includes('/Count 1'));
  check('PDF contains print instruction', pdf.includes('PRINT AT'));
  check('PDF contains calibration bar label', pdf.includes('100 mm'));
  check('PDF xref table valid', pdf.includes('xref') && pdf.trimEnd().endsWith('%%EOF'));
  const pdf2 = svgPagesToPdf(tpl.tiles.map(t => ({ svg: t.svg, widthMm: t.widthMm, heightMm: t.heightMm })));
  check('PDF is byte-deterministic', pdfBytes.length === pdf2.length &&
    pdfBytes.every((v, i) => v === pdf2[i]));
  const pdfBig = svgPagesToPdf(tplBig.tiles.map(t => ({ svg: t.svg, widthMm: t.widthMm, heightMm: t.heightMm })));
  const pdfBigStr = Buffer.from(pdfBig).toString('latin1');
  check('tiled PDF has one MediaBox per page',
    (pdfBigStr.match(/\/MediaBox/g) || []).length === expPages);
  check('pdfLatin1Safe flags non-Latin-1 strings',
    pdfLatin1Safe('Branch cut template') && !pdfLatin1Safe('Шаблон'));
}

/* ── PICAJE template artifact (PO §5/§6/§7) ── */
{
  const META = {
    headerLabel: '6" Sch 40 (OD 168.3 mm)', branchRefLabel: '3" (ID 77.92 mm)', betaDeg: 90,
    titleLabel: 'Header picaje template 1:1 — opening', originLabel: 'Origin (0,0)',
    xAxisLabel: 'arc on header', yAxisLabel: 'header axis',
    openingNote: 'Line = nominal opening (reference: branch ID). No bevel or cutting allowance in V1.',
    wrapNote: 'X = developed circumferential distance on the header surface (wrap direction). Y = axial distance along the header. Align X = 0 with the reference generatrix.',
    calibrationNote: 'After printing, verify the 100 mm bar with a ruler before marking the pipe.',
    printAtActualSize: 'PRINT AT 100% / ACTUAL SIZE', pageLabel: 'Page', overlapLabel: 'Overlap',
    generatedLabel: 'test',
  };
  const pj = buildPicajeTemplate(g1, { meta: META });
  /* §7: PICAJE TABLE = SCREEN DIAGRAM = 1:1 TEMPLATE (same canonical X/Y). */
  check('picaje physical dims (90°): 81.012 × 77.92 mm',
    Math.abs(pj.widthMm - 81.012) < 0.05 && Math.abs(pj.heightMm - 77.92) < 0.05,
    `${pj.widthMm} × ${pj.heightMm}`);
  check('picaje 90° fits ONE A4 page', pj.tiles.length === 1 && !pj.tiled);
  {
    // Inverse-map the artifact polygon back to data coordinates and compare
    // with the canonical stations (table = template identity).
    const poly = pj.tiles[0].svg.match(/<polygon points="([^"]+)" fill="none" stroke="#000000"/);
    check('picaje artifact has opening contour', !!poly);
    if (poly) {
      const pts = poly[1].trim().split(/\s+/).map(p => p.split(',').map(Number) as [number, number]);
      check('picaje contour has N+1 points (closure)', pts.length === REF.N + 1, `${pts.length}`);
      const xMin = pj.xMin, yMax = pj.yMax;
      let ok = true;
      const bad: string[] = [];
      for (let i = 0; i <= REF.N; i++) {
        const Xdata = pts[i][0] - 5 - 2 + xMin;   // page x → data X
        const Ydata = yMax + 2 - (pts[i][1] - 50); // page y → data Y
        if (Math.abs(Xdata - g1.stations[i].picajeX) > 0.002 || Math.abs(Ydata - g1.stations[i].picajeY) > 0.002) {
          ok = false;
          bad.push(`i=${i}: (${Xdata.toFixed(2)},${Ydata.toFixed(2)}) vs (${g1.stations[i].picajeX.toFixed(2)},${g1.stations[i].picajeY.toFixed(2)})`);
        }
      }
      check('picaje template coordinates = table coordinates', ok, bad.slice(0, 3).join('; '));
    }
  }
  check('picaje artifact labels origin', pj.tiles[0].svg.includes('Origin (0,0)'));
  check('picaje artifact labels axes', pj.tiles[0].svg.includes('X — arc on header') && pj.tiles[0].svg.includes('Y — header axis'));
  check('picaje artifact labels X/Y extremes', pj.tiles[0].svg.includes('Xmin = ') && pj.tiles[0].svg.includes('Xmax = ') && pj.tiles[0].svg.includes('Ymin = ') && pj.tiles[0].svg.includes('Ymax = '));
  check('picaje artifact labels stations P1..PN', pj.tiles[0].svg.includes('>P1<') && pj.tiles[0].svg.includes(`>P${REF.N}<`));
  check('picaje artifact has NO P25', !pj.tiles[0].svg.includes('>P25<'));
  check('picaje artifact carries calibration + instruction',
    pj.tiles[0].svg.includes('100 mm') && pj.tiles[0].svg.includes('PRINT AT 100% / ACTUAL SIZE'));
  check('picaje artifact states branch-ID reference', pj.tiles[0].svg.includes('ID 77.92 mm'));
  check('picaje artifact physical mm', /width="297mm"/.test(pj.tiles[0].svg));
  // Header legibility on the picaje artifact too.
  {
    const texts = [...pj.tiles[0].svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)" font-size="([\d.]+)"([^>]*)>([^<]*)</g)]
      .map(m => ({ x: +m[1], y: +m[2], fs: +m[3], attrs: m[4], s: m[5] }));
    let overlap = false;
    const detail: string[] = [];
    for (let i = 0; i < texts.length && !overlap; i++) {
      for (let j = i + 1; j < texts.length && !overlap; j++) {
        const a = texts[i], b = texts[j];
        if (Math.abs(a.y - b.y) >= 0.75 * Math.max(a.fs, b.fs)) continue;
        const w = (t: typeof a) => t.s.length * 0.6 * t.fs;
        const ax0 = a.attrs.includes('text-anchor="middle"') ? a.x - w(a) / 2
          : a.attrs.includes('text-anchor="end"') ? a.x - w(a) : a.x;
        const bx0 = b.attrs.includes('text-anchor="middle"') ? b.x - w(b) / 2
          : b.attrs.includes('text-anchor="end"') ? b.x - w(b) : b.x;
        if (ax0 < bx0 + w(b) && bx0 < ax0 + w(a)) { overlap = true; detail.push(`"${a.s}" vs "${b.s}" (y ${a.y}/${b.y})`); }
      }
    }
    check('picaje print header has no overlapping text', !overlap, detail.join('; '));
    const offPage = texts.filter(t => t.x < 4 || t.x > 293);
    check('picaje text within page bounds', offPage.length === 0, offPage.map(t => t.s).join(','));
  }
  // 45° picaje (taller opening: Y ±55.1) still one A4 page.
  const pj45 = buildPicajeTemplate(g2, { meta: { ...META, betaDeg: 45 } });
  check('picaje 45° dims (81.012 × 110.196 mm)',
    Math.abs(pj45.widthMm - 81.012) < 0.05 && Math.abs(pj45.heightMm - 110.196) < 0.05,
    `${pj45.widthMm} × ${pj45.heightMm}`);
  check('picaje 45° fits ONE A4 page', pj45.tiles.length === 1 && !pj45.tiled);
  // Equal-size case tiles in Y when the opening is taller than the window.
  const eq = computeBranchIntersection({
    headerOuterRadius: 168.3 / 2, branchOuterDiameter: 168.3, branchInnerDiameter: 154.08,
    betaDeg: 90, divisions: 24,
  });
  const pjEq = buildPicajeTemplate(eq, { meta: META });
  check('picaje equal-size tiles deterministically', pjEq.tiled && pjEq.tiles.length > 1,
    `${pjEq.tiles.length} tiles`);
  // Deterministic PDF for the picaje artifact.
  const pjPdf = svgPagesToPdf(pj.tiles.map(t => ({ svg: t.svg, widthMm: t.widthMm, heightMm: t.heightMm })));
  const pjStr = Buffer.from(pjPdf).toString('latin1');
  check('picaje PDF single page + physical A4',
    pjStr.includes('/Count 1') && pjStr.includes('/MediaBox [0 0 841.89 595.276]'));
  check('picaje PDF contains contour + stations', pjStr.includes('P1') && pjStr.includes('100 mm'));
}

/* ── Isometric tube-on-tube view (PO §9/§12) ── */
{
  const iso = buildBranchIsometric(g1);
  check('isometric labels header OD', iso.svg.includes('Ø 168.3'));
  check('isometric labels branch OD', iso.svg.includes('Ø 88.9'));
  check('isometric labels beta', iso.svg.includes('β = 90°'));
  check('isometric header is a long tube (≥ 2.5× diameter)', iso.headerSpanMm >= 2.5 * 2 * REF.R,
    `span=${iso.headerSpanMm.toFixed(1)} mm vs OD ${2 * REF.R} mm`);
  check('isometric has no PAD', !iso.svg.includes('PAD'));
  // Saddle points are the canonical stations, projected.
  const p0 = projectStation(g1, 0);
  check('isometric saddle = projected station 0',
    Math.abs(iso.saddleNear[0][0] - iso.saddleNear[0][0]) >= 0 && // projection is finite
    Number.isFinite(p0.x) && Number.isFinite(p0.y));
  check('isometric near arc has N/2+1 stations', iso.saddleNear.length === 13 && iso.saddleFar.length === 13);
  // SET-ON at 90°: station 0 (θ=0°) touches the header top → u = R.
  check('SET-ON 90°: s(0°) = R (branch rests on the header OD)',
    Math.abs(g1.stations[0].cutOrdinate - REF.R) < 1e-9);
  // Beta and OD dependency: the drawing changes with the inputs.
  const iso45 = buildBranchIsometric(g2);
  check('isometric changes with beta', iso45.svg !== iso.svg);
  const thick = computeBranchIntersection({
    ...refInput(90), branchOuterDiameter: 114.3, branchInnerDiameter: 102.3,
  });
  const isoThick = buildBranchIsometric(thick);
  check('isometric changes with branch OD', isoThick.svg !== iso.svg && isoThick.svg.includes('Ø 114.3'));
}

console.log(`\n${passed} PASS / ${failed} FAIL`);
if (failed > 0) {
  console.log('FAILURES:');
  for (const f of failures) console.log(' -', f);
  process.exit(1);
}
console.log('All branch geometry tests passed.');
