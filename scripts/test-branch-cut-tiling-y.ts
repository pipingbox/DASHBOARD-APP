/* PB-BRANCH-CUT-TILING-Y-001 — deterministic X+Y tiling tests for the
   physical 1:1 branch CUT template.

   Run: node --experimental-strip-types scripts/test-branch-cut-tiling-y.ts

   Bug fixed: the cut template only tiled in X. When the ordinate profile
   exceeded the vertical curve window, parts of the contour fell outside
   every MediaBox (profile disappeared / vertically cut on some pages).

   Mandatory regression case (PO):
     Header 24" Sch40 (OD 609.6 / ID 590.54)
     Branch 20" Sch40 (OD 508.0 / ID 488.94)
     β = 60°, N = 48, relative template, A4 landscape
     → circumference 1595.929 mm, Δθ 7.5°, Δs 33.249 mm,
       ordinate range 330.115 mm ≫ 102 mm A4 curve window. */

import {
  computeBranchIntersection,
} from '../app/frontend/src/tools/branch/branchIntersectionGeometry.ts';
import {
  buildBranchTemplate,
  templatePoint,
} from '../app/frontend/src/tools/branch/branchTemplateSvg.ts';
import {
  svgPagesToPdf,
} from '../app/frontend/src/tools/branch/svgMmToPdf.ts';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; } else { failed++; failures.push(`${name}${detail ? ' — ' + detail : ''}`); }
}

const META = {
  headerLabel: '24" Sch 40 (OD 609.6 mm)',
  branchLabel: '20" Sch 40 (OD 508.0 mm)',
  betaDeg: 60,
  titleLabel: 'Branch cut template 1:1 (development)',
  seamLabel: 'Seam',
  pageLabel: 'Page',
  overlapLabel: 'Overlap',
  wrapNoteLabel: 'Wrap the template around the branch OD.',
  calibrationNote: 'After printing, verify the 100 mm bar with a ruler.',
  printAtActualSize: 'PRINT AT 100% / ACTUAL SIZE',
  generatedLabel: 'PIPINGBOX · H-001 · deterministic physical artifact',
} as const;

/* ── Page model constants (mirror branchTemplateSvg.ts, A4) ── */
const PAGE_W = 297;
const PAGE_H = 210;
const M = 5;
const PAD = 2;
const CURVE_TOP = 48;
const BOTTOM_BAND = 60;
const BASELINE = PAGE_H - BOTTOM_BAND;          // 150
const USABLE_W = PAGE_W - 2 * M;                // 287
const USABLE_H = BASELINE - CURVE_TOP;          // 102
const OVERLAP = 15;
const STEP_X = USABLE_W - OVERLAP;              // 272
const STEP_Y = USABLE_H - OVERLAP;              // 87

const geo = computeBranchIntersection({
  headerOuterRadius: 609.6 / 2,
  branchOuterDiameter: 508.0,
  branchInnerDiameter: 488.94,
  betaDeg: 60,
  divisions: 48,
});

/* Canonical coordinates: (arc, ord), s = ord − yMin. */
const pts = geo.stations.map((_, i) => templatePoint(geo, i, 'relative'));
const ords = pts.map(p => p[1]);
const yMin = Math.min(...ords);
const range = Math.max(...ords) - yMin;

const tpl = buildBranchTemplate(geo, { format: 'A4', ordinate: 'relative', meta: META });

console.log(`Bug case: circumference ${geo.developedCircumference.toFixed(3)} mm, Δs ${geo.stationSpacing.toFixed(3)} mm, ordinate range ${range.toFixed(3)} mm`);
console.log(`Grid: ${tpl.pagesX} × ${tpl.pagesY} = ${tpl.tiles.length} pages (before the fix: ${tpl.pagesX} × 1 = ${tpl.pagesX})`);

/* ═══ Canonical regression values (PO) ═══ */
check('circumference 1595.929 mm', Math.abs(geo.developedCircumference - 1595.929) < 0.001, String(geo.developedCircumference));
check('Δθ 7.5°', Math.abs(geo.angularStepDeg - 7.5) < 1e-9);
check('Δs 33.249 mm', Math.abs(geo.stationSpacing - 33.249) < 0.001, String(geo.stationSpacing));

/* ═══ 1. pagesY > 1 when the profile exceeds the printable height ═══ */
check('ordinate range exceeds A4 curve window', range > USABLE_H, `${range.toFixed(3)} vs ${USABLE_H}`);
check('pagesY > 1 (vertical tiling active)', tpl.pagesY > 1, `pagesY=${tpl.pagesY}`);
check('grid 6 × 4 = 24 pages', tpl.pagesX === 6 && tpl.pagesY === 4 && tpl.tiles.length === 24,
  `${tpl.pagesX}×${tpl.pagesY}=${tpl.tiles.length}`);
check('exceedsUsableHeight flag set', tpl.exceedsUsableHeight === true);

/* ═══ 2. Every contour point/segment is inside some tile domain ═══
   Sample every canonical segment densely; each sample (arc, s) must be
   covered by at least one tile: cc ∈ [c·stepX, c·stepX+usableW] AND
   s ∈ [r·stepY, r·stepY+usableH]. */
{
  const covered = (arc: number, s: number): boolean => {
    const cc = arc + PAD;
    const colOk = (c: number) => cc >= c * STEP_X - 1e-6 && cc <= c * STEP_X + USABLE_W + 1e-6;
    const rowOk = (r: number) => s >= r * STEP_Y - 1e-6 && s <= r * STEP_Y + USABLE_H + 1e-6;
    for (let r = 0; r < tpl.pagesY; r++) {
      if (!rowOk(r)) continue;
      for (let c = 0; c < tpl.pagesX; c++) {
        if (colOk(c)) return true;
      }
    }
    return false;
  };
  let worst: string | null = null;
  let ok = true;
  const SAMPLES = 200;
  for (let i = 0; i < pts.length - 1 && ok; i++) {
    const [x0, o0] = pts[i];
    const [x1, o1] = pts[i + 1];
    for (let k = 0; k <= SAMPLES; k++) {
      const t = k / SAMPLES;
      const arc = x0 + (x1 - x0) * t;
      const s = (o0 - yMin) + ((o1 - yMin) - (o0 - yMin)) * t;
      if (!covered(arc, s)) { ok = false; worst = `segment ${i}→${i + 1} @ t=${t.toFixed(2)} (arc=${arc.toFixed(3)}, s=${s.toFixed(3)})`; break; }
    }
  }
  check('every contour segment sample covered by some tile', ok, worst ?? '');
}

/* ═══ 3. No geometry loss between rows (band union is contiguous) ═══ */
{
  let ok = true; let detail = '';
  for (let r = 0; r < tpl.pagesY - 1; r++) {
    const topOfRow = r * STEP_Y + USABLE_H;
    const bottomOfNext = (r + 1) * STEP_Y;
    if (bottomOfNext >= topOfRow - 1e-9) { ok = false; detail = `gap between rows ${r}/${r + 1}`; break; }
  }
  check('row bands contiguous (no vertical gap)', ok, detail);
  const lastReach = (tpl.pagesY - 1) * STEP_Y + USABLE_H;
  check('last row reaches the top of the profile', lastReach >= range + 1e-9,
    `reach ${lastReach} vs range ${range.toFixed(3)}`);
}

/* ═══ 4. Adjacent tiles share exactly the planned overlap ═══ */
{
  let okX = true; let okY = true;
  for (let c = 0; c < tpl.pagesX - 1; c++) {
    const ov = (c * STEP_X + USABLE_W) - (c + 1) * STEP_X;
    if (Math.abs(ov - OVERLAP) > 1e-9) okX = false;
  }
  for (let r = 0; r < tpl.pagesY - 1; r++) {
    const ov = (r * STEP_Y + USABLE_H) - (r + 1) * STEP_Y;
    if (Math.abs(ov - OVERLAP) > 1e-9) okY = false;
  }
  check('horizontal overlap exactly 15 mm between columns', okX);
  check('vertical overlap exactly 15 mm between rows', okY);
  /* Vertical registration marks present on internal rows/columns. */
  const tilesAt = (c: number, r: number) => tpl.tiles.find(t => t.pageCol === c && t.pageRow === r)!;
  check('vertical registration marks on row boundaries',
    tilesAt(0, 0).svg.includes(`cy="${CURVE_TOP + OVERLAP / 2}"`)
    && tilesAt(0, 1).svg.includes(`cy="${BASELINE - OVERLAP / 2}"`));
}

/* ═══ 5. Same physical coordinates inside overlap zones ═══
   A station inside the shared vertical band is visible in BOTH adjacent
   rows (unclipped in both). Inverse-map its artifact occurrence in each
   row and require identical physical coordinates. */
{
  // All contour points on a tile: polyline points, or clipped data-seg endpoints.
  const contourPoints = (svg: string): [number, number][] => {
    const m = svg.match(/<polyline points="([^"]+)"/);
    if (m) return m[1].trim().split(/\s+/).map(p => p.split(',').map(Number) as [number, number]);
    const out: [number, number][] = [];
    const re = /<line data-seg="\d+" x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/g;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(svg)) !== null) {
      out.push([+mm[1], +mm[2]], [+mm[3], +mm[4]]);
    }
    return out;
  };
  const invArc = (pageX: number, col: number) => pageX - M - PAD + col * STEP_X;
  const invS = (pageY: number, row: number) => row * STEP_Y + (BASELINE - pageY);

  let checkedPairs = 0; let ok = true; let detail = '';
  for (let r = 0; r < tpl.pagesY - 1 && ok; r++) {
    for (let c = 0; c < tpl.pagesX && ok; c++) {
      const lower = contourPoints(tpl.tiles.find(t => t.pageCol === c && t.pageRow === r)!.svg);
      const upper = contourPoints(tpl.tiles.find(t => t.pageCol === c && t.pageRow === r + 1)!.svg);
      for (let i = 0; i < pts.length; i++) {
        const s = ords[i] - yMin;
        // Station inside the shared band [ (r+1)·stepY , r·stepY + usableH ].
        if (s < (r + 1) * STEP_Y + 1e-6 || s > r * STEP_Y + USABLE_H - 1e-6) continue;
        const canArc = pts[i][0];
        const find = (list: [number, number][], row: number): [number, number] | null => {
          for (const [px2, py2] of list) {
            const a = invArc(px2, c); const ss = invS(py2, row);
            if (Math.abs(a - canArc) < 0.005 && Math.abs(ss - s) < 0.005) return [a, ss];
          }
          return null;
        };
        const lo = find(lower, r); const up = find(upper, r + 1);
        if (!lo || !up) { ok = false; detail = `station ${i + 1} missing in overlap rows ${r}/${r + 1} (lo=${!!lo}, up=${!!up})`; break; }
        checkedPairs++;
        if (Math.abs(lo[0] - up[0]) > 0.005 || Math.abs(lo[1] - up[1]) > 0.005) {
          ok = false; detail = `station ${i + 1} rows ${r}/${r + 1}: (${lo}) vs (${up})`;
          break;
        }
      }
    }
  }
  check('overlap zones carry identical physical coordinates', ok && checkedPairs > 0,
    ok ? `${checkedPairs} station occurrences agree across rows` : detail);
}

/* ═══ 6. Reconstructed contour == canonical contour ═══
   (a) Every station appears inside at least one tile's window and its
       inverse-mapped position reproduces the canonical point.
   (b) No spurious geometry: every clipped segment endpoint inverse-maps
       onto its own canonical segment. */
{
  const contourPoints = (svg: string): [number, number][] => {
    const m = svg.match(/<polyline points="([^"]+)"/);
    if (m) return m[1].trim().split(/\s+/).map(p => p.split(',').map(Number) as [number, number]);
    const out: [number, number][] = [];
    const re = /<line data-seg="\d+" x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/g;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(svg)) !== null) out.push([+mm[1], +mm[2]], [+mm[3], +mm[4]]);
    return out;
  };
  const inv = (p: [number, number], col: number, row: number): [number, number] =>
    [p[0] - M - PAD + col * STEP_X, row * STEP_Y + (BASELINE - p[1])];

  // (a) stations recoverable from the artifact, inside some tile window.
  let ok = true; let detail = '';
  for (let i = 0; i < pts.length; i++) {
    const s = ords[i] - yMin;
    const canArc = pts[i][0];
    let found = false;
    for (const t of tpl.tiles) {
      for (const p of contourPoints(t.svg)) {
        const inX = p[0] >= M - 1e-9 && p[0] <= M + USABLE_W + 1e-9;
        const inY = p[1] >= CURVE_TOP - 1e-9 && p[1] <= BASELINE + 1e-9;
        if (!inX || !inY) continue;
        const [a, ss] = inv(p, t.pageCol ?? 0, t.pageRow ?? 0);
        if (Math.abs(a - canArc) < 0.005 && Math.abs(ss - s) < 0.005) { found = true; break; }
      }
      if (found) break;
    }
    if (!found) { ok = false; detail = `station ${i + 1} not recoverable inside ANY tile window`; break; }
  }
  check('all 49 stations recoverable from tiles, matching canonical', ok, detail);

  // (b) clipped endpoints lie on their canonical segment (no invented geometry).
  ok = true; detail = '';
  for (const t of tpl.tiles) {
    const re = /<line data-seg="(\d+)" x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/g;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(t.svg)) !== null) {
      const seg = +mm[1];
      const [ax0, o0] = [pts[seg][0], pts[seg][1] - yMin];
      const [ax1, o1] = [pts[seg + 1][0], pts[seg + 1][1] - yMin];
      for (const [px2, py2] of [[+mm[2], +mm[3]], [+mm[4], +mm[5]]] as [number, number][]) {
        const [a, ss] = inv([px2, py2], t.pageCol ?? 0, t.pageRow ?? 0);
        // Distance from (a, ss) to canonical segment (ax0,o0)→(ax1,o1).
        const dx = ax1 - ax0; const dy = o1 - o0;
        const len2 = dx * dx + dy * dy;
        const tt = len2 === 0 ? 0 : ((a - ax0) * dx + (ss - o0) * dy) / len2;
        const tc = Math.max(0, Math.min(1, tt));
        const dist = Math.hypot(a - (ax0 + dx * tc), ss - (o0 + dy * tc));
        if (dist > 0.005 || tt < -0.001 || tt > 1.001) {
          ok = false; detail = `page ${t.pageIndex + 1} seg ${seg} endpoint (${a.toFixed(3)},${ss.toFixed(3)}) off canonical (d=${dist.toFixed(4)}, t=${tt.toFixed(3)})`;
          break;
        }
      }
      if (!ok) break;
    }
    if (!ok) break;
  }
  check('no spurious geometry: every clipped endpoint on its canonical segment', ok, detail);
}

/* ═══ 7. Scale stays 1:1 inside every tile ═══ */
{
  // X: consecutive station generator lines on the same page keep Δs.
  let okX = true; let detailX = '';
  for (const t of tpl.tiles) {
    const xs: number[] = [];
    const re = /<line data-station="(\d+)" x1="([\d.]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t.svg)) !== null) xs[+m[1]] = parseFloat(m[2]);
    for (let i = 1; i < xs.length; i++) {
      if (xs[i] === undefined || xs[i - 1] === undefined) continue;
      const d = xs[i] - xs[i - 1];
      if (Math.abs(d - geo.stationSpacing) > 0.002) {
        okX = false; detailX = `page ${t.pageIndex + 1} Δ(${i}→${i + 1}) = ${d.toFixed(3)}`; break;
      }
    }
    if (!okX) break;
  }
  check('X spacing on every page = canonical 33.249 mm', okX, detailX);

  // Y: two stations visible in the same tile window keep |ΔpageY| = |Δord|.
  const contourPoints = (svg: string): [number, number][] => {
    const m = svg.match(/<polyline points="([^"]+)"/);
    if (m) return m[1].trim().split(/\s+/).map(p => p.split(',').map(Number) as [number, number]);
    const out: [number, number][] = [];
    const re = /<line data-seg="\d+" x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/g;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(svg)) !== null) out.push([+mm[1], +mm[2]], [+mm[3], +mm[4]]);
    return out;
  };
  let okY = false; let detailY = 'no tile with 2 in-window stations found';
  for (const t of tpl.tiles) {
    const pp = contourPoints(t.svg);
    const inWin = (p: [number, number]) =>
      p[0] >= M - 1e-9 && p[0] <= M + USABLE_W + 1e-9 && p[1] >= CURVE_TOP - 1e-9 && p[1] <= BASELINE + 1e-9;
    // Any two in-window artifact points whose inverse-mapped ordinates match
    // two canonical stations must keep the canonical vertical distance.
    const win: [number, number, number][] = []; // [pageY, arc, s]
    for (const p of pp) {
      if (!inWin(p)) continue;
      win.push([p[1], p[0] - M - PAD + (t.pageCol ?? 0) * STEP_X, (t.pageRow ?? 0) * STEP_Y + (BASELINE - p[1])]);
    }
    for (let a = 0; a < win.length && !okY; a++) {
      for (let b = a + 1; b < win.length && !okY; b++) {
        const dPage = Math.abs(win[a][0] - win[b][0]);
        const dPhys = Math.abs(win[a][2] - win[b][2]);
        if (dPage > 5 && Math.abs(dPage - dPhys) <= 0.005) { okY = true; }
      }
    }
    if (okY) detailY = '';
  }
  check('Y distances on the page = canonical ordinate distances (1:1)', okY, detailY);
}

/* ═══ 7b. No contour leakage outside the curve window on any tile ═══ */
{
  let ok = true; let detail = '';
  for (const t of tpl.tiles) {
    const re = /<line data-seg="\d+" x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/g;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(t.svg)) !== null) {
      for (const y of [+mm[2], +mm[4]]) {
        if (y < CURVE_TOP - 0.002 || y > BASELINE + 0.002) {
          ok = false; detail = `page ${t.pageIndex + 1} contour point at y=${y}`; break;
        }
      }
      if (!ok) break;
    }
    // Tiles with a full polyline must also be entirely inside the window.
    const m = t.svg.match(/<polyline points="([^"]+)"/);
    if (m) {
      for (const p of m[1].trim().split(/\s+/)) {
        const y = Number(p.split(',')[1]);
        if (y < CURVE_TOP - 0.002 || y > BASELINE + 0.002) {
          ok = false; detail = `page ${t.pageIndex + 1} polyline point at y=${y}`; break;
        }
      }
    }
    if (!ok) break;
  }
  check('no contour geometry outside the curve window (no leaks)', ok, detail);
}

/* ═══ Page artifact sanity ═══ */
{
  check('every tile is a full A4 page', tpl.tiles.every(t => t.widthMm === 297 && t.heightMm === 210));
  check('global page numbering X/Y', tpl.tiles.every(t =>
    t.svg.includes(`Page ${t.pageIndex + 1}/24`)));
  check('calibration bar + print instruction on every tile', tpl.tiles.every(t =>
    t.svg.includes('100 mm') && t.svg.includes('PRINT AT 100% / ACTUAL SIZE')));
  // All text elements stay inside the MediaBox (no clipped/crowded rows).
  let ok = true; let detail = '';
  for (const t of tpl.tiles) {
    const re = /<text x="([-\d.]+)" y="([-\d.]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t.svg)) !== null) {
      const x = parseFloat(m[1]); const y = parseFloat(m[2]);
      if (x < -0.01 || x > PAGE_W + 0.01 || y < -0.01 || y > PAGE_H + 0.01) {
        ok = false; detail = `page ${t.pageIndex + 1} text at (${x}, ${y})`; break;
      }
    }
    if (!ok) break;
  }
  check('all text inside the MediaBox', ok, detail);

  const pdf = svgPagesToPdf(tpl.tiles.map(t => ({ svg: t.svg, widthMm: t.widthMm, heightMm: t.heightMm })));
  const pdfStr = Buffer.from(pdf).toString('latin1');
  check('PDF has one MediaBox per page (24)',
    (pdfStr.match(/\/MediaBox/g) || []).length === 24);
  check('PDF deterministic', Buffer.compare(Buffer.from(pdf), Buffer.from(
    svgPagesToPdf(tpl.tiles.map(t => ({ svg: t.svg, widthMm: t.widthMm, heightMm: t.heightMm }))))) === 0);
}

/* ═══ Reference regression: 6" × 3" × 90° × N=24 stays single-page ═══ */
{
  const ref = computeBranchIntersection({
    headerOuterRadius: 168.30 / 2, branchOuterDiameter: 88.9, branchInnerDiameter: 77.92,
    betaDeg: 90, divisions: 24, referenceLength: 200,
  });
  const t4 = buildBranchTemplate(ref, { format: 'A4', ordinate: 'fromEnd', meta: { ...META, betaDeg: 90 } });
  const t3 = buildBranchTemplate(ref, { format: 'A3', ordinate: 'fromEnd', meta: { ...META, betaDeg: 90 } });
  check('reference A4: single page', t4.pagesX === 1 && t4.pagesY === 1 && t4.tiles.length === 1);
  check('reference A3: single page', t3.pagesX === 1 && t3.pagesY === 1 && t3.tiles.length === 1);
  check('reference circumference 279.288 mm', Math.abs(ref.developedCircumference - 279.288) < 0.001);
  check('reference Δs 11.637 mm', Math.abs(ref.stationSpacing - 11.637) < 0.001);
  // Physical geometry identical between A4 and A3 (X exact, Y baseline-relative).
  const contour = (svg: string): [number, number][] => {
    const m = svg.match(/<polyline points="([^"]+)"/);
    return m![1].trim().split(/\s+/).map(p => p.split(',').map(Number) as [number, number]);
  };
  const a4 = contour(t4.tiles[0].svg); const a3 = contour(t3.tiles[0].svg);
  const base3 = 297 - BOTTOM_BAND;
  check('reference: A4/A3 physical geometry identical',
    a4.length === a3.length && a4.every(([x, y], i) =>
      x === a3[i][0] && Math.abs((y - BASELINE) - (a3[i][1] - base3)) < 1e-9));
}

/* ═══ Report ═══ */
console.log(`\n${passed} PASS / ${failed} FAIL`);
if (failed > 0) {
  console.error('FAILURES:');
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log('All cut X+Y tiling tests passed.');
